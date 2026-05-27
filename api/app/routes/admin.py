from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.deps import get_admin
from app.discord_notify import notify_hwid_reset
from app.duration_util import format_duration
from app.expiry_util import is_expired, mark_expired_and_notify
from app.hwid_util import HWID_RESET_PENDING, is_hwid_pending_reset
from app.license_util import generate_license_key
from app.hwid_bind_util import add_approved_hwid, list_approved_hwids
from app.models import (
    Activation,
    ExpiryLog,
    HwidBindRequest,
    HwidBindRequestStatus,
    License,
    LicenseStatus,
    User,
    UserHwid,
    UserSession,
)
from app.schemas import (
    AdminLoginRequest,
    ExpiryLogRow,
    GenerateLicensesRequest,
    HwidRequestRow,
    LicenseRow,
    SessionRow,
    TokenResponse,
    UserHwidRow,
)
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
    category = (body.category or "standard").strip().lower()[:64] or "standard"
    for _ in range(body.quantity):
        for _attempt in range(20):
            key = generate_license_key()
            if not db.query(License).filter(License.license_key == key).first():
                break
        else:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not generate unique key")
        lic = License(
            license_key=key,
            duration_seconds=body.duration_seconds,
            duration_days=legacy_days,
            category=category,
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
        bound_player_name = None
        hwid_hash = None
        hwid_pending_reset = False
        expires_at = None
        activated_at = None
        seconds_left = 0
        dur_sec = getattr(lic, "duration_seconds", None) or (lic.duration_days * 86400)

        if lic.activation:
            username = lic.activation.user.username
            bound_player_name = getattr(lic.activation.user, "bound_player_name", None)
            hwid_hash = lic.activation.hwid_hash
            hwid_pending_reset = is_hwid_pending_reset(hwid_hash)
            expires_at = lic.activation.expires_at
            activated_at = lic.activation.activated_at
            seconds_left = _seconds_left(expires_at)
            if lic.status == LicenseStatus.active and is_expired(lic.activation):
                mark_expired_and_notify(db, lic.activation)
                seconds_left = 0

        out.append(
            LicenseRow(
                id=lic.id,
                license_key=lic.license_key,
                duration_seconds=dur_sec,
                duration_label=format_duration(dur_sec),
                category=getattr(lic, "category", None) or "standard",
                status=lic.status.value,
                note=lic.note,
                username=username,
                bound_player_name=bound_player_name,
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
        bound_count = len(list_approved_hwids(db, sess.user_id))
        out.append(
            SessionRow(
                user_id=sess.user_id,
                username=sess.user.username,
                hwid_hash=sess.hwid_hash,
                license_key=license_key,
                last_seen_at=sess.last_seen_at,
                is_online=online,
                seconds_idle=_seconds_idle(sess.last_seen_at),
                bound_hwid_count=bound_count,
                bound_player_name=getattr(sess.user, "bound_player_name", None),
            )
        )
    out.sort(key=lambda r: (not r.is_online, r.seconds_idle))
    return out


@router.post("/licenses/{license_id}/reset-hwid")
def reset_hwid(license_id: int, admin: str = Depends(get_admin), db: Session = Depends(get_db)):
    lic = (
        db.query(License)
        .options(joinedload(License.activation).joinedload(Activation.user))
        .filter(License.id == license_id)
        .first()
    )
    if not lic or not lic.activation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No activation to reset")
    act = lic.activation
    old_hwid = act.hwid_hash
    act.hwid_hash = HWID_RESET_PENDING
    db.commit()
    notify_hwid_reset(act, old_hwid=old_hwid, admin_username=admin)
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


@router.get("/expiry-logs", response_model=list[ExpiryLogRow])
def list_expiry_logs(_: str = Depends(get_admin), db: Session = Depends(get_db)):
    rows = db.query(ExpiryLog).order_by(ExpiryLog.expired_at.desc()).limit(500).all()
    return [
        ExpiryLogRow(
            id=r.id,
            license_key=r.license_key,
            username=r.username,
            category=r.category,
            hwid_hash=r.hwid_hash,
            expired_at=r.expired_at,
        )
        for r in rows
    ]


@router.get("/hwid-requests", response_model=list[HwidRequestRow])
def list_hwid_requests(
    status_filter: str = "pending",
    _: str = Depends(get_admin),
    db: Session = Depends(get_db),
):
    q = db.query(HwidBindRequest).options(joinedload(HwidBindRequest.user))
    if status_filter != "all":
        try:
            st = HwidBindRequestStatus(status_filter)
            q = q.filter(HwidBindRequest.status == st)
        except ValueError:
            pass
    rows = q.order_by(HwidBindRequest.requested_at.desc()).all()
    return [
        HwidRequestRow(
            id=r.id,
            user_id=r.user_id,
            username=r.user.username,
            hwid_hash=r.hwid_hash,
            status=r.status.value,
            requested_at=r.requested_at,
        )
        for r in rows
    ]


@router.post("/hwid-requests/{request_id}/approve")
def approve_hwid_request(request_id: int, _: str = Depends(get_admin), db: Session = Depends(get_db)):
    req = db.query(HwidBindRequest).options(joinedload(HwidBindRequest.user)).filter(HwidBindRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    add_approved_hwid(db, req.user_id, req.hwid_hash)
    req.status = HwidBindRequestStatus.approved
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "username": req.user.username, "hwid_hash": req.hwid_hash}


@router.post("/hwid-requests/{request_id}/reject")
def reject_hwid_request(request_id: int, _: str = Depends(get_admin), db: Session = Depends(get_db)):
    req = db.get(HwidBindRequest, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    req.status = HwidBindRequestStatus.rejected
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.get("/user-hwids", response_model=list[UserHwidRow])
def list_user_hwids(_: str = Depends(get_admin), db: Session = Depends(get_db)):
    rows = db.query(UserHwid).options(joinedload(UserHwid.user)).order_by(UserHwid.created_at.desc()).all()
    return [
        UserHwidRow(
            id=r.id,
            user_id=r.user_id,
            username=r.user.username,
            hwid_hash=r.hwid_hash,
            label=r.label,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.delete("/user-hwids/{row_id}")
def remove_user_hwid(row_id: int, _: str = Depends(get_admin), db: Session = Depends(get_db)):
    row = db.get(UserHwid, row_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
