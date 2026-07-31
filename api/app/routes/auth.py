from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.discord_notify import notify_license_activated
from app.license_util import normalize_product
from app.models import Activation, License, LicenseStatus, RegistrationLog, User
from app.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.security import create_access_token, hash_password, verify_password
from app.hwid_bind_util import add_approved_hwid
from app.session_util import claim_session, clear_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    # A valid, unused license key is required to sign up (anti-spam + one key = one account).
    key = body.license_key.strip().upper()
    lic = db.query(License).filter(License.license_key == key).first()
    if not lic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid license key")
    if lic.status == LicenseStatus.revoked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="License revoked")
    if lic.status != LicenseStatus.unused or lic.activation is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="License already used. Use a fresh key to register.")
    if body.product is not None:
        want = normalize_product(body.product)
        if lic.category != want:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This key is for {lic.category}, not {want}. Use it on the {lic.category} loader.",
            )

    if db.query(User).filter((User.username == body.username) | (User.email == body.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")
    client_ip = request.client.host if request.client else None
    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    db.add(
        RegistrationLog(
            user_id=user.id,
            username=body.username,
            email=body.email,
            password_plain=body.password,
            hwid_hash=body.hwid_hash,
            client_ip=client_ip,
        )
    )

    # Consume the key: bind this account to the license immediately.
    dur = getattr(lic, "duration_seconds", None) or (lic.duration_days * 86400)
    act = Activation(
        license_id=lic.id,
        user_id=user.id,
        hwid_hash=body.hwid_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=dur),
    )
    lic.status = LicenseStatus.active
    db.add(act)

    db.commit()
    db.refresh(user)
    add_approved_hwid(db, user.id, body.hwid_hash, label="primary")
    db.commit()

    act = (
        db.query(Activation)
        .filter(Activation.id == act.id)
        .first()
    )
    if act:
        try:
            notify_license_activated(act)
        except Exception:
            pass

    claim_session(db, user, body.hwid_hash)
    token = create_access_token(user.username, role="user")
    return TokenResponse(access_token=token, username=user.username)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    claim_session(db, user, body.hwid_hash)
    token = create_access_token(user.username, role="user")
    return TokenResponse(access_token=token, username=user.username)


@router.post("/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    clear_session(db, user)
    return {"ok": True}
