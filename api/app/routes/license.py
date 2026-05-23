from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import Activation, License, LicenseStatus, User
from app.hwid_util import is_hwid_pending_reset
from app.schemas import ActivateRequest, LicenseStatusResponse, ValidateRequest
from app.session_util import touch_session

router = APIRouter(prefix="/license", tags=["license"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _active_activation(db: Session, user: User) -> Activation | None:
    return (
        db.query(Activation)
        .options(joinedload(Activation.license))
        .filter(Activation.user_id == user.id)
        .order_by(Activation.expires_at.desc())
        .first()
    )


def _response_from_activation(act: Activation | None) -> LicenseStatusResponse:
    if not act:
        return LicenseStatusResponse(valid=False, status="none", message="No license activated on this account")

    now = _utcnow()
    expires = act.expires_at.replace(tzinfo=timezone.utc) if act.expires_at.tzinfo is None else act.expires_at
    seconds_left = max(0, int((expires - now).total_seconds()))

    lic = act.license
    if lic.status == LicenseStatus.revoked:
        return LicenseStatusResponse(valid=False, status="revoked", expires_at=expires, seconds_left=0, message="License revoked")

    if seconds_left <= 0 or lic.status == LicenseStatus.expired:
        lic.status = LicenseStatus.expired
        return LicenseStatusResponse(valid=False, status="expired", expires_at=expires, seconds_left=0, message="License expired")

    if lic.status != LicenseStatus.active:
        lic.status = LicenseStatus.active

    return LicenseStatusResponse(
        valid=True,
        status="active",
        expires_at=expires,
        seconds_left=seconds_left,
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

    existing = db.query(Activation).filter(Activation.license_id == lic.id).first()
    if existing:
        if existing.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="License already used by another account")
        if is_hwid_pending_reset(existing.hwid_hash):
            existing.hwid_hash = body.hwid_hash
        elif existing.hwid_hash != body.hwid_hash:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="HWID mismatch for this license")
        touch_session(db, user, body.hwid_hash)
        db.commit()
        return _response_from_activation(existing)

    if lic.status not in (LicenseStatus.unused, LicenseStatus.expired):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="License not available")

    other = _active_activation(db, user)
    if other and other.license_id != lic.id:
        resp = _response_from_activation(other)
        if resp.valid:
            return resp

    dur = getattr(lic, "duration_seconds", None) or (lic.duration_days * 86400)
    expires_at = _utcnow() + timedelta(seconds=dur)
    act = Activation(license_id=lic.id, user_id=user.id, hwid_hash=body.hwid_hash, expires_at=expires_at)
    lic.status = LicenseStatus.active
    db.add(act)
    touch_session(db, user, body.hwid_hash)
    db.commit()
    db.refresh(act)
    return _response_from_activation(act)


@router.post("/validate", response_model=LicenseStatusResponse)
def validate(body: ValidateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    act = _active_activation(db, user)
    if not act:
        return LicenseStatusResponse(valid=False, status="none", message="No activation found")
    if is_hwid_pending_reset(act.hwid_hash):
        act.hwid_hash = body.hwid_hash
    elif act.hwid_hash != body.hwid_hash:
        return LicenseStatusResponse(valid=False, status="hwid_mismatch", message="HWID does not match activation")
    touch_session(db, user, body.hwid_hash)
    resp = _response_from_activation(act)
    db.commit()
    return resp
