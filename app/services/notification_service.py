from __future__ import annotations
import logging
import asyncio
from typing import Optional
from app.core.config import settings

logger = logging.getLogger("dq_platform.notifications")


async def send_slack_notification(webhook_url: str, message: str, blocks: Optional[list] = None) -> bool:
    """Send a Slack notification via incoming webhook."""
    if not webhook_url:
        return False
    import httpx
    payload: dict = {"text": message}
    if blocks:
        payload["blocks"] = blocks
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
            logger.info("Slack notification sent successfully")
            return True
    except Exception as e:
        logger.error(f"Failed to send Slack notification: {e}")
        return False


async def send_email_notification(
    to_emails: list[str],
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
) -> bool:
    """Send an email notification via SMTP."""
    if not settings.smtp_host or not to_emails:
        return False
    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = ", ".join(to_emails)

    if body_text:
        msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            use_tls=settings.smtp_use_tls,
        )
        logger.info(f"Email sent to {to_emails}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_emails}: {e}")
        return False


def _build_slack_alert_blocks(
    rule_name: str,
    severity: str,
    alert_message: str,
    domain_name: str = "",
    asset_name: str = "",
    failure_pct: Optional[float] = None,
) -> list:
    severity_emoji = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}.get(severity, "⚪")
    header = f"{severity_emoji} *DQ Alert [{severity.upper()}]* — {rule_name}"
    fields = [
        {"type": "mrkdwn", "text": f"*Rule:*\n{rule_name}"},
        {"type": "mrkdwn", "text": f"*Severity:*\n{severity_emoji} {severity.upper()}"},
    ]
    if domain_name:
        fields.append({"type": "mrkdwn", "text": f"*Domain:*\n{domain_name}"})
    if asset_name:
        fields.append({"type": "mrkdwn", "text": f"*Table:*\n{asset_name}"})
    if failure_pct is not None:
        fields.append({"type": "mrkdwn", "text": f"*Failure Rate:*\n{failure_pct:.2f}%"})

    return [
        {"type": "header", "text": {"type": "plain_text", "text": "Data Quality Alert"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": header}},
        {"type": "section", "fields": fields},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Details:*\n{alert_message}"}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": "Sent by DQ Platform • Review in your dashboard"}]},
    ]


def _build_email_alert_html(
    rule_name: str,
    severity: str,
    alert_message: str,
    domain_name: str = "",
    asset_name: str = "",
    failure_pct: Optional[float] = None,
) -> str:
    severity_color = {"critical": "#dc2626", "high": "#ea580c", "medium": "#ca8a04", "low": "#16a34a"}.get(severity, "#6b7280")
    rows = ""
    if domain_name:
        rows += f"<tr><td style='padding:4px 8px;font-weight:600'>Domain</td><td style='padding:4px 8px'>{domain_name}</td></tr>"
    if asset_name:
        rows += f"<tr style='background:#f9fafb'><td style='padding:4px 8px;font-weight:600'>Table</td><td style='padding:4px 8px'>{asset_name}</td></tr>"
    if failure_pct is not None:
        rows += f"<tr><td style='padding:4px 8px;font-weight:600'>Failure Rate</td><td style='padding:4px 8px'>{failure_pct:.2f}%</td></tr>"

    return f"""
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:{severity_color};padding:16px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0">Data Quality Alert</h2>
        <p style="color:rgba(255,255,255,0.9);margin:4px 0 0">Severity: {severity.upper()}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:16px;border-radius:0 0 8px 8px">
        <h3 style="margin-top:0">{rule_name}</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">{rows}</table>
        <div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:6px">
          <p style="margin:0">{alert_message}</p>
        </div>
        <p style="color:#6b7280;font-size:12px;margin-top:16px">
          Sent by DQ Platform. Review alerts in your dashboard.
        </p>
      </div>
    </div>
    """


async def send_teams_notification(webhook_url: str, title: str, message: str, severity: str) -> bool:
    """Send a Microsoft Teams notification via incoming webhook (Adaptive Card)."""
    if not webhook_url:
        return False
    import httpx
    color = {"critical": "FF0000", "high": "FFA500", "medium": "FFD700", "low": "00AA00"}.get(severity, "808080")
    payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": color,
        "summary": title,
        "sections": [{
            "activityTitle": f"**{title}**",
            "activitySubtitle": f"Severity: {severity.upper()}",
            "text": message,
        }],
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
            logger.info("Teams notification sent successfully")
            return True
    except Exception as e:
        logger.error(f"Failed to send Teams notification: {e}")
        return False


async def send_pagerduty_notification(
    integration_key: str,
    summary: str,
    severity: str,
    source: str = "DQ Platform",
    dedup_key: Optional[str] = None,
) -> bool:
    """Send a PagerDuty alert via Events API v2."""
    if not integration_key:
        return False
    import httpx
    pd_severity = {"critical": "critical", "high": "error", "medium": "warning", "low": "info"}.get(severity, "warning")
    payload = {
        "routing_key": integration_key,
        "event_action": "trigger",
        "dedup_key": dedup_key,
        "payload": {
            "summary": summary,
            "severity": pd_severity,
            "source": source,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post("https://events.pagerduty.com/v2/enqueue", json=payload)
            resp.raise_for_status()
            logger.info("PagerDuty alert triggered successfully")
            return True
    except Exception as e:
        logger.error(f"Failed to send PagerDuty notification: {e}")
        return False


async def send_webhook_notification(webhook_url: str, payload: dict) -> bool:
    """Send a generic JSON webhook notification."""
    if not webhook_url:
        return False
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
            logger.info(f"Webhook notification sent to {webhook_url}")
            return True
    except Exception as e:
        logger.error(f"Failed to send webhook notification: {e}")
        return False


async def dispatch_alert(
    rule_name: str,
    severity: str,
    alert_message: str,
    domain_name: str = "",
    asset_name: str = "",
    failure_pct: Optional[float] = None,
    extra_emails: Optional[list[str]] = None,
    slack_channel_webhook: Optional[str] = None,
    teams_webhook: Optional[str] = None,
    pagerduty_key: Optional[str] = None,
    custom_webhook: Optional[str] = None,
) -> dict:
    """Dispatch alert via all configured channels. Returns dict of channel results."""
    results = {"slack": False, "email": False, "teams": False, "pagerduty": False, "webhook": False}

    summary_text = f"[{severity.upper()}] {rule_name}"
    if domain_name:
        summary_text += f" — {domain_name}"
    if failure_pct is not None:
        summary_text += f" ({failure_pct:.1f}% failure)"

    # ── Slack ──
    slack_url = slack_channel_webhook or settings.slack_webhook_url
    if slack_url:
        blocks = _build_slack_alert_blocks(rule_name, severity, alert_message, domain_name, asset_name, failure_pct)
        results["slack"] = await send_slack_notification(
            slack_url,
            f"[{severity.upper()}] DQ Alert: {rule_name} — {alert_message[:100]}",
            blocks=blocks,
        )

    # ── Email ──
    recipients: list[str] = []
    if settings.alert_email_recipients:
        recipients += [e.strip() for e in settings.alert_email_recipients.split(",") if e.strip()]
    if extra_emails:
        recipients += extra_emails
    if recipients:
        subject = f"[{severity.upper()}] Data Quality Alert: {rule_name}"
        html = _build_email_alert_html(rule_name, severity, alert_message, domain_name, asset_name, failure_pct)
        results["email"] = await send_email_notification(recipients, subject, html, alert_message)

    # ── Microsoft Teams ──
    teams_url = teams_webhook or getattr(settings, "teams_webhook_url", "")
    if teams_url:
        results["teams"] = await send_teams_notification(
            teams_url,
            f"Data Quality Alert: {rule_name}",
            alert_message,
            severity,
        )

    # ── PagerDuty ──
    pd_key = pagerduty_key or getattr(settings, "pagerduty_integration_key", "")
    if pd_key:
        results["pagerduty"] = await send_pagerduty_notification(
            pd_key,
            summary=summary_text,
            severity=severity,
            source=f"DQ Platform — {asset_name or domain_name or 'unknown'}",
        )

    # ── Generic Webhook ──
    hook_url = custom_webhook or getattr(settings, "alert_webhook_url", "")
    if hook_url:
        webhook_payload = {
            "event": "dq_alert",
            "rule_name": rule_name,
            "severity": severity,
            "message": alert_message,
            "domain": domain_name,
            "table": asset_name,
            "failure_pct": failure_pct,
        }
        results["webhook"] = await send_webhook_notification(hook_url, webhook_payload)

    return results
