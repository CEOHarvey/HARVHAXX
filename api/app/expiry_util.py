"""Mark licenses expired and send one-time Discord alerts."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.discord_notify import notify_license_expired
from app.models import Activation, LicenseStatus


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def seconds_left(act: Activation) -> int:
    now = _utcnow()
    exp = _aware(act.expires_at)
    return max(0, int((exp - now).total_seconds()))


def is_expired(act: Activation) -> bool:
    return seconds_left(act) <= 0


def mark_expired_and_notify(db: Session, act: Activation) -> None:
    """Set license expired and post Discord webhook once per activation."""
    lic = act.license
    lic.status = LicenseStatus.expired

    if act.expiry_notified_at is not None:
        return

    act.expiry_notified_at = _utcnow()
    db.flush()
    notify_license_expired(act)
