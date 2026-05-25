from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.discord_notify import notify_license_activated, notify_new_pc_bound
from app.expiry_util import is_expired, mark_expired_and_notify, seconds_left
from app.hwid_bind_util import hwid_allowed_for_activation
from app.hwid_util import is_hwid_pending_reset
from app.models import Activation, License, LicenseStatus, User
from app.schemas import ActivateRequest, LicenseStatusResponse, ValidateRequest
from app.session_util import touch_session

router = APIRouter(prefix="/license", tags=["license"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _active_activation(db: Session, user: User) -> Activation | None:
    return (
        db.query(Activation)
        .options(joinedload(Activation.license), joinedload(Activation.user))
        .filter(Activation.user_id == user.id)
        .order_by(Activation.expires_at.desc())
        .first()
    )


def _response_from_activation(db: Session, act: Activation | None) -> LicenseStatusResponse:
    if not act:
        return LicenseStatusResponse(valid=False, status="none", message="No license activated on this account")

    expires = act.expires_at.replace(tzinfo=timezone.utc) if act.expires_at.tzinfo is None else act.expires_at
    left = seconds_left(act)

    lic = act.license
    if lic.status == LicenseStatus.revoked:
        return LicenseStatusResponse(valid=False, status="revoked", expires_at=expires, seconds_left=0, message="License revoked")

    if is_expired(act) or lic.status == LicenseStatus.expired:
        mark_expired_and_notify(db, act)
        return LicenseStatusResponse(valid=False, status="expired", expires_at=expires, seconds_left=0, message="License expired")

    if lic.status != LicenseStatus.active:
        lic.status = LicenseStatus.active

    return LicenseStatusResponse(
        valid=True,
        status="active",
        expires_at=expires,
        seconds_left=left,
        message="OK",
    )


@router.post("/activate", response_model=LicenseStatusResponse)
def activate(body: ActivateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = body.license_key.strip().upper()
    lic = db.query(License).filter(License.license_key == key).first()
    if not lic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid license key")
    if lic.status == LicenseStatus.revoked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="License revoked")

    existing = db.query(Activation).options(joinedload(Activation.license), joinedload(Activation.user)).filter(
        Activation.license_id == lic.id
    ).first()
    if existing:
        if existing.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="License already used by another account")
        if is_hwid_pending_reset(existing.hwid_hash):
            existing.hwid_hash = body.hwid_hash
            notify_new_pc_bound(existing)
        elif not hwid_allowed_for_activation(db, user.id, existing.hwid_hash, body.hwid_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="HWID not authorized for this license. Request bind from admin.",
            )
        elif existing.hwid_hash != body.hwid_hash:
            existing.hwid_hash = body.hwid_hash
        touch_session(db, user, body.hwid_hash)
        resp = _response_from_activation(db, existing)
        db.commit()
        return resp

    if lic.status not in (LicenseStatus.unused, LicenseStatus.expired):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="License not available")

    other = _active_activation(db, user)
    if other and other.license_id != lic.id:
        resp = _response_from_activation(db, other)
        if resp.valid:
            db.commit()
            return resp

    dur = getattr(lic, "duration_seconds", None) or (lic.duration_days * 86400)
    expires_at = _utcnow() + timedelta(seconds=dur)
    act = Activation(license_id=lic.id, user_id=user.id, hwid_hash=body.hwid_hash, expires_at=expires_at)
    lic.status = LicenseStatus.active
    db.add(act)
    touch_session(db, user, body.hwid_hash)
    db.commit()
    db.refresh(act)
    act = (
        db.query(Activation)
        .options(joinedload(Activation.license), joinedload(Activation.user))
        .filter(Activation.id == act.id)
        .first()
    )
    if act:
        notify_license_activated(act)
    return _response_from_activation(db, act)


@router.post("/validate", response_model=LicenseStatusResponse)
def validate(body: ValidateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    act = _active_activation(db, user)
    if not act:
        return LicenseStatusResponse(valid=False, status="none", message="No activation found")
    if is_hwid_pending_reset(act.hwid_hash):
        act.hwid_hash = body.hwid_hash
        notify_new_pc_bound(act)
    elif not hwid_allowed_for_activation(db, user.id, act.hwid_hash, body.hwid_hash):
        return LicenseStatusResponse(
            valid=False,
            status="hwid_mismatch",
            message="HWID not authorized. Request bind from admin on this PC.",
        )
    elif act.hwid_hash != body.hwid_hash:
        act.hwid_hash = body.hwid_hash
    touch_session(db, user, body.hwid_hash)
    resp = _response_from_activation(db, act)
    db.commit()
    return resp
