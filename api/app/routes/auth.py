from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import RegistrationLog, User
from app.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.security import create_access_token, hash_password, verify_password
from app.hwid_bind_util import add_approved_hwid
from app.session_util import claim_session, clear_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
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
    db.commit()
    db.refresh(user)
    add_approved_hwid(db, user.id, body.hwid_hash, label="primary")
    db.commit()
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
