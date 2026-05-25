from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.hwid_bind_util import require_approved_hwid
from app.models import User, UserSession

SESSION_STALE_SECONDS = 120


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def session_is_online(sess: UserSession) -> bool:
    return (_utcnow() - _aware(sess.last_seen_at)).total_seconds() <= SESSION_STALE_SECONDS


def claim_session(db: Session, user: User, hwid_hash: str) -> UserSession:
    """Approved HWID only; block simultaneous login on another PC."""
    require_approved_hwid(db, user, hwid_hash)
    now = _utcnow()
    existing = db.query(UserSession).filter(UserSession.user_id == user.id).first()

    if existing:
        online = session_is_online(existing)
        if online and existing.hwid_hash != hwid_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Account is already logged in on another PC. Log out there first or wait 2 minutes.",
            )
        existing.hwid_hash = hwid_hash
        existing.last_seen_at = now
        db.commit()
        db.refresh(existing)
        return existing

    sess = UserSession(user_id=user.id, hwid_hash=hwid_hash, last_seen_at=now)
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return sess


def touch_session(db: Session, user: User, hwid_hash: str) -> None:
    require_approved_hwid(db, user, hwid_hash)
    now = _utcnow()
    sess = db.query(UserSession).filter(UserSession.user_id == user.id).first()
    if not sess:
        db.add(UserSession(user_id=user.id, hwid_hash=hwid_hash, last_seen_at=now))
    elif sess.hwid_hash != hwid_hash and session_is_online(sess):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account is active on another PC",
        )
    else:
        sess.hwid_hash = hwid_hash
        sess.last_seen_at = now
    db.commit()


def clear_session(db: Session, user: User) -> None:
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
