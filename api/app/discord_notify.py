"""Discord webhooks — separate channel per event type."""

from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone

from app.config import settings
from app.duration_util import format_duration
from app.hwid_util import is_hwid_pending_reset
from app.models import Activation

logger = logging.getLogger(__name__)


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return key
    return f"{key[:4]}…{key[-4:]}"


def _format_dt(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _hwid_display(hwid: str | None) -> str:
    if not hwid or is_hwid_pending_reset(hwid):
        return "_pending reset_"
    if len(hwid) <= 1024:
        return f"`{hwid}`"
    return f"`{hwid[:512]}…`"


def _base_fields(act: Activation) -> list[dict]:
    user = act.user
    lic = act.license
    return [
        {"name": "Username", "value": user.username, "inline": True},
        {"name": "Email", "value": user.email or "—", "inline": True},
        {"name": "License key", "value": f"`{_mask_key(lic.license_key)}`", "inline": True},
        {"name": "Full key", "value": f"||{lic.license_key}||", "inline": False},
        {"name": "Note", "value": lic.note or "—", "inline": True},
    ]


def _post_webhook(url: str, payload: dict) -> None:
    if not url.strip():
        return
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url.strip(),
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "LicenseLoader/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            if res.status >= 400:
                logger.warning("Discord webhook HTTP %s", res.status)
    except urllib.error.URLError as exc:
        logger.warning("Discord webhook failed: %s", exc)


def _send_async(url: str, embed: dict, username: str = "License Loader") -> None:
    if not url.strip():
        return
    payload = {"embeds": [embed], "username": username}
    threading.Thread(target=_post_webhook, args=(url, payload), daemon=True).start()


def notify_license_expired(act: Activation) -> None:
    url = settings.discord_webhook_expired_resolved
    if not url.strip():
        return

    fields = _base_fields(act)
    fields.extend(
        [
            {"name": "HWID", "value": _hwid_display(act.hwid_hash), "inline": False},
            {"name": "Expired at (UTC)", "value": _format_dt(act.expires_at), "inline": True},
        ]
    )
    embed = {
        "title": "License expired",
        "description": "User license has run out of time.",
        "color": 0xDC2626,
        "fields": fields,
        "footer": {"text": "License Loader · Expired"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _send_async(url, embed)


def notify_license_activated(act: Activation) -> None:
    url = settings.discord_webhook_active.strip()
    if not url:
        return

    lic = act.license
    dur = getattr(lic, "duration_seconds", None) or (lic.duration_days * 86400)
    fields = _base_fields(act)
    fields.extend(
        [
            {"name": "HWID", "value": _hwid_display(act.hwid_hash), "inline": False},
            {"name": "Duration", "value": format_duration(dur), "inline": True},
            {"name": "Expires at (UTC)", "value": _format_dt(act.expires_at), "inline": True},
            {"name": "Activated at (UTC)", "value": _format_dt(act.activated_at), "inline": True},
        ]
    )
    embed = {
        "title": "License activated",
        "description": "A key was bound to an account and PC.",
        "color": 0x059669,
        "fields": fields,
        "footer": {"text": "License Loader · Active"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _send_async(url, embed)


def notify_new_pc_bound(act: Activation) -> None:
    """License linked to a new PC after admin HWID reset."""
    url = settings.discord_webhook_active.strip()
    if not url:
        return

    fields = _base_fields(act)
    fields.extend(
        [
            {"name": "New HWID", "value": _hwid_display(act.hwid_hash), "inline": False},
            {"name": "Expires at (UTC)", "value": _format_dt(act.expires_at), "inline": True},
        ]
    )
    embed = {
        "title": "New PC bound",
        "description": "Customer linked license on a new device after HWID reset.",
        "color": 0x2563EB,
        "fields": fields,
        "footer": {"text": "License Loader · Active"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _send_async(url, embed)


def notify_hwid_reset(act: Activation, *, old_hwid: str, admin_username: str) -> None:
    url = settings.discord_webhook_hwid_reset.strip()
    if not url:
        return

    fields = _base_fields(act)
    fields.extend(
        [
            {"name": "Reset by (admin)", "value": admin_username, "inline": True},
            {"name": "Previous HWID", "value": _hwid_display(old_hwid), "inline": False},
            {"name": "Status", "value": "Customer can bind a **new PC** on next loader login.", "inline": False},
        ]
    )
    embed = {
        "title": "HWID reset",
        "description": "Admin cleared device lock for this license.",
        "color": 0xD97706,
        "fields": fields,
        "footer": {"text": "License Loader · HWID Reset"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _send_async(url, embed)
