from __future__ import annotations

"""
Snowflake connection pool.

Each unique set of connection parameters gets its own pool instance.
Connections are validated before reuse and stale connections are discarded.
The pool is thread-safe and wraps synchronous Snowflake connector calls
with asyncio.to_thread() so async callers don't block the event loop.
"""
import asyncio
import hashlib
import json
import logging
import queue
import threading
from contextlib import contextmanager
from typing import Any

logger = logging.getLogger("dq_platform.snowflake_pool")

_POOL_REGISTRY_LOCK = threading.Lock()
_POOLS: dict[str, "SnowflakeConnectionPool"] = {}


class SnowflakeConnectionPool:
    """
    Thread-safe bounded connection pool for a single Snowflake endpoint.

    Connections are created lazily up to max_size.  A stale connection
    (one that fails a lightweight ping) is discarded and a fresh one
    is created in its place.  When the pool is exhausted callers block
    for up to `acquire_timeout` seconds before raising RuntimeError.
    """

    def __init__(
        self,
        connect_kwargs: dict,
        min_size: int = 1,
        max_size: int = 5,
        acquire_timeout: float = 30.0,
    ):
        self._connect_kwargs = connect_kwargs
        self._min_size = min_size
        self._max_size = max_size
        self._acquire_timeout = acquire_timeout

        self._pool: queue.Queue = queue.Queue(maxsize=max_size)
        self._size_lock = threading.Lock()
        self._current_size = 0
        self._closed = False

    # ── internals ─────────────────────────────────────────────────────────────

    def _create_connection(self):
        import snowflake.connector
        conn = snowflake.connector.connect(**self._connect_kwargs)
        logger.debug("Created new Snowflake connection")
        return conn

    def _is_alive(self, conn) -> bool:
        """Lightweight ping — runs a trivial query to check liveness."""
        try:
            conn.cursor().execute("SELECT 1")
            return True
        except Exception:
            return False

    def _discard(self, conn) -> None:
        """Close a connection and decrement the pool counter."""
        try:
            conn.close()
        except Exception:
            pass
        with self._size_lock:
            self._current_size -= 1

    def _try_acquire_from_queue(self):
        """Pop from the idle queue, discard stale, return live or None."""
        try:
            conn = self._pool.get_nowait()
        except queue.Empty:
            return None
        if self._is_alive(conn):
            return conn
        logger.debug("Discarding stale Snowflake connection")
        self._discard(conn)
        return None

    def _try_create(self):
        """Atomically reserve a slot and create a connection, or return None."""
        with self._size_lock:
            if self._current_size >= self._max_size:
                return None
            self._current_size += 1

        try:
            return self._create_connection()
        except Exception:
            with self._size_lock:
                self._current_size -= 1
            raise

    def _acquire_blocking(self):
        """
        Full acquisition flow:
          1. Take an idle connection from the queue.
          2. Create a new one if under max_size.
          3. Wait for a returned connection if the pool is full.
        """
        # Fast path: idle connection already available
        conn = self._try_acquire_from_queue()
        if conn is not None:
            return conn

        # Create a new connection if capacity allows
        conn = self._try_create()
        if conn is not None:
            return conn

        # Pool exhausted — wait for a release
        try:
            conn = self._pool.get(timeout=self._acquire_timeout)
        except queue.Empty:
            raise RuntimeError(
                f"Snowflake connection pool exhausted (max_size={self._max_size}). "
                "All connections are in use. Increase SNOWFLAKE_POOL_MAX_SIZE or reduce concurrency."
            )

        if self._is_alive(conn):
            return conn

        # The returned connection was stale; try once more to create
        self._discard(conn)
        conn = self._try_create()
        if conn is not None:
            return conn
        raise RuntimeError(
            "Snowflake connection pool: all connections are stale and pool is at capacity."
        )

    # ── public interface ───────────────────────────────────────────────────────

    @contextmanager
    def acquire(self):
        """
        Synchronous context manager — borrows a connection from the pool.

        On success the connection is returned to the pool.
        On any exception the connection is discarded (not returned) so
        a broken connection doesn't pollute the pool.
        """
        if self._closed:
            raise RuntimeError("Connection pool has been closed")

        conn = self._acquire_blocking()
        try:
            yield conn
        except Exception:
            self._discard(conn)
            raise
        else:
            self._release(conn)

    def _release(self, conn) -> None:
        if self._closed:
            self._discard(conn)
            return
        try:
            self._pool.put_nowait(conn)
        except queue.Full:
            # Pool is already at capacity (race condition) — discard
            self._discard(conn)

    def execute_query(self, sql: str, session_timeout: int = 300) -> list[dict[str, Any]]:
        """Execute *sql* using a pooled connection, return rows as dicts."""
        with self.acquire() as conn:
            cur = conn.cursor()
            try:
                cur.execute(f"ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = {session_timeout}")
                cur.execute(sql)
                cols = [d[0].lower() for d in cur.description] if cur.description else []
                return [dict(zip(cols, row)) for row in cur.fetchall()]
            finally:
                cur.close()

    async def aexecute_query(self, sql: str, session_timeout: int = 300) -> list[dict[str, Any]]:
        """Async wrapper — runs execute_query in a thread pool executor."""
        return await asyncio.to_thread(self.execute_query, sql, session_timeout)

    def close_all(self) -> None:
        """Drain and close every idle connection in the pool."""
        self._closed = True
        while True:
            try:
                conn = self._pool.get_nowait()
                try:
                    conn.close()
                except Exception:
                    pass
            except queue.Empty:
                break
        logger.info("Snowflake connection pool closed")

    # ── diagnostics ───────────────────────────────────────────────────────────

    @property
    def pool_size(self) -> int:
        """Total connections created (idle + in-use)."""
        return self._current_size

    @property
    def idle_count(self) -> int:
        """Connections currently sitting idle in the queue."""
        return self._pool.qsize()


# ── Registry ──────────────────────────────────────────────────────────────────

def _pool_key(connect_kwargs: dict) -> str:
    """Stable 16-char hash of connection params (password excluded)."""
    safe = {k: v for k, v in sorted(connect_kwargs.items()) if k != "password"}
    return hashlib.sha256(json.dumps(safe).encode()).hexdigest()[:16]


def get_or_create_pool(
    connect_kwargs: dict,
    min_size: int = 1,
    max_size: int = 5,
    acquire_timeout: float = 30.0,
) -> SnowflakeConnectionPool:
    """Return an existing pool for these credentials or create a new one."""
    key = _pool_key(connect_kwargs)
    with _POOL_REGISTRY_LOCK:
        if key not in _POOLS:
            _POOLS[key] = SnowflakeConnectionPool(
                connect_kwargs,
                min_size=min_size,
                max_size=max_size,
                acquire_timeout=acquire_timeout,
            )
            logger.info(
                f"Created Snowflake connection pool [{key}] "
                f"account={connect_kwargs.get('account', '?')} "
                f"max_size={max_size}"
            )
        return _POOLS[key]


def close_all_pools() -> None:
    """Shut down every pool — call during app teardown (lifespan shutdown)."""
    with _POOL_REGISTRY_LOCK:
        for pool in _POOLS.values():
            pool.close_all()
        _POOLS.clear()
    logger.info("All Snowflake connection pools closed")


def pool_stats() -> list[dict]:
    """Return diagnostic stats for every registered pool."""
    with _POOL_REGISTRY_LOCK:
        return [
            {
                "pool_key": key,
                "pool_size": pool.pool_size,
                "idle_count": pool.idle_count,
                "max_size": pool._max_size,
            }
            for key, pool in _POOLS.items()
        ]
