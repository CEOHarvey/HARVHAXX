from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.deps import get_admin
from app.duration_util import format_duration
from app.license_util import generate_license_key
from app.models import Activation, License, LicenseStatus
from app.schemas import GenerateLicensesRequest, LicenseRow, LoginRequest, TokenResponse
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/admin", tags=["admin"])


def _seconds_left(expires_at: datetime | None) -> int:
    if expires_at is None:
        return 0
    now = datetime.now(timezone.utc)
    exp = expires_at.replace(tzinfo=timezone.utc) if expires_at.tzinfo is None else expires_at
    return max(0, int((exp - now).total_seconds()))


@router.post("/login", response_model=TokenResponse)
def admin_login(body: LoginRequest):
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
    now = datetime.now(timezone.utc)
    for lic in rows:
        username = None
        hwid_tail = None
        expires_at = None
        activated_at = None
        seconds_left = 0
        dur_sec = getattr(lic, "duration_seconds", None) or (lic.duration_days * 86400)

        if lic.activation:
            username = lic.activation.user.username
            hwid_tail = lic.activation.hwid_hash[-8:]
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
                hwid_tail=hwid_tail,
                activated_at=activated_at,
                expires_at=expires_at,
                seconds_left=seconds_left,
            )
        )
    db.commit()
    return out


@router.post("/licenses/{license_id}/revoke")
def revoke_license(license_id: int, _: str = Depends(get_admin), db: Session = Depends(get_db)):
    lic = db.get(License, license_id)
    if not lic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    lic.status = LicenseStatus.revoked
    db.commit()
    return {"ok": True}
