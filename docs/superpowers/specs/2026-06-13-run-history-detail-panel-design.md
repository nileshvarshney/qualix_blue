# Run History Detail Panel

## Problem

The Run History page's "Detail →" link currently navigates to a full page
(`/scan-jobs/[jobId]/runs/[runId]`) showing run metadata and logs. This loses
the user's place in the run list — to inspect another run, they must navigate
back and re-find it.

## Design

Replace the full-page navigation with a slide-over panel on the right half of
the screen, following the existing `IssueDetailPanel` pattern used on the
Issues page.

### Component: `RunDetailPanel`

New file: `frontend/src/components/shared/RunDetailPanel.tsx`

- Props: `jobId: string`, `runId: string`, `onClose: () => void`
- On mount/prop change, fetches:
  - `/api/scan-jobs/{jobId}/runs/{runId}` — run metadata
  - `/api/scan-jobs/{jobId}/runs/{runId}/logs` — log entries
- Renders the same content currently in
  `scan-jobs/[jobId]/runs/[runId]/page.tsx`: run summary card (status,
  started/ended/duration/assets/trigger, errors/warnings, error message) and
  the log viewer with level filters (ALL/INFO/WARNING/ERROR).
- No breadcrumb (panel replaces page navigation).

### Run History page changes

`frontend/src/app/run-history/page.tsx`:

- Add `selectedRun: { jobId: string; runId: string } | null` state.
- Replace the `Detail →` `Link` with a button that sets `selectedRun` to the
  clicked row's `{ job_id, run_id }`.
- When `selectedRun` is set, render `RunDetailPanel` in a fixed right-side
  container: `position: fixed, top: 0, right: 0, bottom: 0, width: min(640px,
  92vw)`, matching the Issues page's overlay style (border-left, shadow,
  z-index above page content).
- Clicking a different row's detail button while the panel is open swaps
  `selectedRun` directly — the panel re-fetches for the new run, letting users
  flip between runs without closing the panel or losing list scroll position.

### Cleanup

- Delete `frontend/src/app/scan-jobs/[jobId]/runs/[runId]/page.tsx`. The
  underlying API routes (`/api/scan-jobs/[jobId]/runs/[runId]` and
  `.../logs`) are unchanged and reused by the panel.

## Out of scope

- No prev/next arrow navigation inside the panel — switching runs is done by
  clicking a different row in the list behind the panel.
- No changes to the scan-jobs page's own "History" link (still routes to
  `/run-history?job=...`).
