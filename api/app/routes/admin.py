from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.deps import get_admin
from app.duration_util import format_duration
from app.hwid_util import HWID_RESET_PENDING, is_hwid_pending_reset
from app.license_util import generate_license_key
from app.models import Activation, License, LicenseStatus, User, UserSession
from app.schemas import AdminLoginRequest, GenerateLicensesRequest, LicenseRow, SessionRow, TokenResponse
from app.security import create_access_token, verify_password
from app.session_util import clear_session, session_is_online

router = APIRouter(prefix="/admin", tags=["admin"])


def _seconds_left(expires_at: datetime | None) -> int:
    if expires_at is None:
        return 0
    now = datetime.now(timezone.utc)
    exp = expires_at.replace(tzinfo=timezone.utc) if expires_at.tzinfo is None else expires_at
    return max(0, int((exp - now).total_seconds()))


def _seconds_idle(last_seen: datetime) -> int:
    now = datetime.now(timezone.utc)
    seen = last_seen.replace(tzinfo=timezone.utc) if last_seen.tzinfo is None else last_seen
    return max(0, int((now - seen).total_seconds()))


@router.post("/login", response_model=TokenResponse)
def admin_login(body: AdminLoginRequest):
    if body.username != settings.admin_username or body.password != settings.admin_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin credentials")
    token = create_access_token(body.username, role="admin")
    return TokenResponse(access_token=token, username=body.username)


@router.post("/licenses/generate")
def generate_licenses(
    body: GenerateLicensesRequest,
    _: str = Depends(get_admin),
    db: Session = Depends(get_db),
):
    created = []
    legacy_days = max(1, body.duration_seconds // 86400)
    for _ in range(body.quantity):
        lic = License(
            license_key=generate_license_key(),
            duration_seconds=body.duration_seconds,
            duration_days=legacy_days,
            status=LicenseStatus.unused,
            note=body.note,
        )
        db.add(lic)
        created.append(lic)
    db.commit()
    for lic in created:
        db.refresh(lic)
    return {
        "keys": [l.license_key for l in created],
        "duration_seconds": body.duration_seconds,
        "duration_label": format_duration(body.duration_seconds),
    }


@router.get("/licenses", response_model=list[LicenseRow])
def list_licenses(_: str = Depends(get_admin), db: Session = Depends(get_db)):
    rows = db.query(License).options(joinedload(License.activation).joinedload(Activation.user)).all()
    out: list[LicenseRow] = []
    for lic in rows:
        username = None
        hwid_hash = None
        hwid_pending_reset = False
        expires_at = None
        activated_at = None
        seconds_left = 0
        dur_sec = getattr(lic, "duration_seconds", None) or (lic.duration_days * 86400)

        if lic.activation:
            username = lic.activation.user.username
            hwid_hash = lic.activation.hwid_hash
            hwid_pending_reset = is_hwid_pending_reset(hwid_hash)
            expires_at = lic.activation.expires_at
            activated_at = lic.activation.activated_at
            seconds_left = _seconds_left(expires_at)
            if lic.status == LicenseStatus.active and seconds_left <= 0:
                lic.status = LicenseStatus.expired

        out.append(
            LicenseRow(
                id=lic.id,
                license_key=lic.license_key,
                duration_seconds=dur_sec,
                duration_label=format_duration(dur_sec),
                status=lic.status.value,
                note=lic.note,
                username=username,
                hwid_hash=hwid_hash,
                hwid_pending_reset=hwid_pending_reset,
                activated_at=activated_at,
                expires_at=expires_at,
                seconds_left=seconds_left,
            )
        )
    db.commit()
    return out


@router.get("/sessions", response_model=list[SessionRow])
def list_sessions(_: str = Depends(get_admin), db: Session = Depends(get_db)):
    sessions = db.query(UserSession).options(joinedload(UserSession.user)).all()
    out: list[SessionRow] = []
    for sess in sessions:
        license_key = None
        act = (
            db.query(Activation)
            .options(joinedload(Activation.license))
            .filter(Activation.user_id == sess.user_id)
            .order_by(Activation.expires_at.desc())
            .first()
        )
        if act:
            license_key = act.license.license_key
        online = session_is_online(sess)
        out.append(
            SessionRow(
                user_id=sess.user_id,
                username=sess.user.username,
                hwid_hash=sess.hwid_hash,
                license_key=license_key,
                last_seen_at=sess.last_seen_at,
                is_online=online,
                seconds_idle=_seconds_idle(sess.last_seen_at),
            )
        )
    out.sort(key=lambda r: (not r.is_online, r.seconds_idle))
    return out


@router.post("/licenses/{license_id}/reset-hwid")
def reset_hwid(license_id: int, _: str = Depends(get_admin), db: Session = Depends(get_db)):
    lic = db.get(License, license_id)
    if not lic or not lic.activation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No activation to reset")
    lic.activation.hwid_hash = HWID_RESET_PENDING
    db.commit()
    return {"ok": True, "message": "HWID reset — customer can bind new PC on next loader login"}


@router.post("/sessions/{user_id}/kick")
def kick_session(user_id: int, _: str = Depends(get_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    clear_session(db, user)
    return {"ok": True}


@router.post("/licenses/{license_id}/revoke")
def revoke_license(license_id: int, _: str = Depends(get_admin), db: Session = Depends(get_db)):
    lic = db.get(License, license_id)
    if not lic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    lic.status = LicenseStatus.revoked
    db.commit()
    return {"ok": True}
