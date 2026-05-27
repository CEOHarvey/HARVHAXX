"""Multi-HWID per account: admin-approved devices, one active session at a time."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import HwidBindRequest, HwidBindRequestStatus, User, UserHwid


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def list_approved_hwids(db: Session, user_id: int) -> list[str]:
    rows = db.query(UserHwid).filter(UserHwid.user_id == user_id).all()
    return [r.hwid_hash for r in rows]


def is_hwid_approved(db: Session, user_id: int, hwid_hash: str) -> bool:
    return (
        db.query(UserHwid)
        .filter(UserHwid.user_id == user_id, UserHwid.hwid_hash == hwid_hash)
        .first()
        is not None
    )


def add_approved_hwid(db: Session, user_id: int, hwid_hash: str, label: str | None = None) -> UserHwid:
    existing = (
        db.query(UserHwid)
        .filter(UserHwid.user_id == user_id, UserHwid.hwid_hash == hwid_hash)
        .first()
    )
    if existing:
        return existing
    row = UserHwid(user_id=user_id, hwid_hash=hwid_hash, label=label)
    db.add(row)
    db.flush()
    return row


def ensure_bind_request(db: Session, user: User, hwid_hash: str) -> HwidBindRequest:
    pending = (
        db.query(HwidBindRequest)
        .filter(
            HwidBindRequest.user_id == user.id,
            HwidBindRequest.hwid_hash == hwid_hash,
            HwidBindRequest.status == HwidBindRequestStatus.pending,
        )
        .first()
    )
    if pending:
        return pending
    req = HwidBindRequest(user_id=user.id, hwid_hash=hwid_hash, status=HwidBindRequestStatus.pending)
    db.add(req)
    db.flush()
    return req


def require_approved_hwid(db: Session, user: User, hwid_hash: str) -> None:
    if is_hwid_approved(db, user.id, hwid_hash):
        return
    # Auto-bind new device up to a limit (no request workflow).
    raw_limit = int(getattr(settings, "max_hwids_per_user", 0) or 0)
    max_devices = raw_limit  # 0 means unlimited
    current = db.query(UserHwid).filter(UserHwid.user_id == user.id).count()
    if max_devices <= 0 or current < max_devices:
        add_approved_hwid(db, user.id, hwid_hash, label="auto")
        db.commit()
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Device limit reached ({current}/{max_devices}). Contact admin to reset/remove an old HWID.",
    )


def hwid_allowed_for_activation(db: Session, user_id: int, activation_hwid: str, request_hwid: str) -> bool:
    from app.hwid_util import is_hwid_pending_reset

    if is_hwid_pending_reset(activation_hwid):
        return True
    if activation_hwid == request_hwid:
        return True
    if is_hwid_approved(db, user_id, request_hwid):
        return True
    # Allow new device if user has remaining auto-bind slots.
    max_devices = int(getattr(settings, "max_hwids_per_user", 0) or 0)  # 0 = unlimited
    current = db.query(UserHwid).filter(UserHwid.user_id == user_id).count()
    return max_devices <= 0 or current < max_devices
