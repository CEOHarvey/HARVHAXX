"""
chat.py — Real-time support chat routes.

Customer flow:
  1. Loader calls POST /chat/support-token (Bearer user token) → short-lived support JWT
  2. Loader opens browser: {SUPPORT_URL}?token={support_token}
  3. Web page calls GET /chat/me?token=... to resolve identity
  4. Web page opens WS /chat/ws?token=... for real-time
  5. Web page calls GET /chat/messages?token=... to load history

Admin flow:
  1. Admin logs in at /support/admin with admin credentials (existing /admin/login)
  2. GET /chat/admin/conversations — list all users with last message + unread count
  3. WS /chat/admin/ws?token=... — real-time admin hub
  4. POST /chat/admin/messages/{user_id} — send message as admin
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_admin, get_current_user
from app.models import ChatMessage, User
from app.security import ALGORITHM, decode_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])
bearer = HTTPBearer(auto_error=False)

SUPPORT_TOKEN_EXPIRE_MINUTES = 30


# ─── support JWT helpers ────────────────────────────────────────────────────

def create_support_token(user_id: int, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=SUPPORT_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": username,
        "user_id": user_id,
        "role": "support",
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_support_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        if payload.get("role") != "support":
            return None
        return payload
    except JWTError:
        return None


def resolve_support_user(token: str, db: Session) -> User:
    payload = decode_support_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired support token")
    user = db.query(User).filter(User.id == payload["user_id"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# ─── in-memory WebSocket connection manager ─────────────────────────────────

class _ConnectionManager:
    def __init__(self):
        # user_id → list of active websockets (same user can have multiple tabs)
        self._user: dict[int, list[WebSocket]] = {}
        # admin websockets
        self._admin: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect_user(self, ws: WebSocket, user_id: int):
        await ws.accept()
        async with self._lock:
            self._user.setdefault(user_id, []).append(ws)

    async def disconnect_user(self, ws: WebSocket, user_id: int):
        async with self._lock:
            lst = self._user.get(user_id, [])
            if ws in lst:
                lst.remove(ws)

    async def connect_admin(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._admin.append(ws)

    async def disconnect_admin(self, ws: WebSocket):
        async with self._lock:
            if ws in self._admin:
                self._admin.remove(ws)

    async def send_to_user(self, user_id: int, data: dict):
        dead = []
        for ws in list(self._user.get(user_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        async with self._lock:
            for ws in dead:
                lst = self._user.get(user_id, [])
                if ws in lst:
                    lst.remove(ws)

    async def send_to_admins(self, data: dict):
        dead = []
        for ws in list(self._admin):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        async with self._lock:
            for ws in dead:
                if ws in self._admin:
                    self._admin.remove(ws)

    def user_online(self, user_id: int) -> bool:
        return bool(self._user.get(user_id))

    @property
    def online_user_ids(self) -> list[int]:
        return [uid for uid, lst in self._user.items() if lst]


manager = _ConnectionManager()


# ─── schemas ────────────────────────────────────────────────────────────────

class SupportTokenOut(BaseModel):
    support_token: str
    expires_in_seconds: int


class MeOut(BaseModel):
    user_id: int
    username: str
    plan: Optional[str] = None
    license_status: Optional[str] = None
    expires_at: Optional[datetime] = None


class MessageIn(BaseModel):
    content: str
    message_type: str = "text"


class MessageOut(BaseModel):
    id: int
    user_id: int
    sender: str
    content: str
    sent_at: datetime
    seen_at: Optional[datetime]
    message_type: str
    file_url: Optional[str]
    deleted: bool

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    user_id: int
    username: str
    plan: Optional[str] = None
    license_status: Optional[str] = None
    last_message: Optional[MessageOut] = None
    unread_count: int
    is_online: bool


def _msg_out(m: ChatMessage) -> MessageOut:
    return MessageOut(
        id=m.id,
        user_id=m.user_id,
        sender=m.sender,
        content="[deleted]" if m.deleted else m.content,
        sent_at=m.sent_at,
        seen_at=m.seen_at,
        message_type=m.message_type,
        file_url=m.file_url if not m.deleted else None,
        deleted=m.deleted,
    )


def _get_user_plan(user: User, db: Session) -> tuple[str | None, str | None, datetime | None]:
    """Returns (plan/category, status, expires_at) from latest activation."""
    from app.models import Activation, License
    act = (
        db.query(Activation)
        .join(License, Activation.license_id == License.id)
        .filter(Activation.user_id == user.id)
        .order_by(Activation.activated_at.desc())
        .first()
    )
    if not act:
        return None, "no_license", None
    now = datetime.now(timezone.utc)
    exp = act.expires_at.replace(tzinfo=timezone.utc) if act.expires_at.tzinfo is None else act.expires_at
    lic_status = "active" if exp > now else "expired"
    return act.license.category, lic_status, act.expires_at


# ─── REST endpoints ─────────────────────────────────────────────────────────

@router.post("/support-token", response_model=SupportTokenOut)
def get_support_token(
    current_user: User = Depends(get_current_user),
):
    """Loader calls this (with user Bearer token) to get a short-lived support token."""
    token = create_support_token(current_user.id, current_user.username)
    return SupportTokenOut(
        support_token=token,
        expires_in_seconds=SUPPORT_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=MeOut)
def get_me(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Web page calls this with support_token query param to resolve the customer identity."""
    user = resolve_support_user(token, db)
    plan, lic_status, expires_at = _get_user_plan(user, db)
    return MeOut(
        user_id=user.id,
        username=user.username,
        plan=plan,
        license_status=lic_status,
        expires_at=expires_at,
    )


@router.get("/messages", response_model=list[MessageOut])
def get_messages(
    token: str = Query(...),
    limit: int = Query(50, le=200),
    before_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    user = resolve_support_user(token, db)
    q = db.query(ChatMessage).filter(ChatMessage.user_id == user.id)
    if before_id:
        q = q.filter(ChatMessage.id < before_id)
    msgs = q.order_by(ChatMessage.sent_at.desc()).limit(limit).all()
    return [_msg_out(m) for m in reversed(msgs)]


@router.post("/messages", response_model=MessageOut)
async def send_message(
    body: MessageIn,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    user = resolve_support_user(token, db)
    msg = ChatMessage(
        user_id=user.id,
        sender="user",
        content=body.content.strip(),
        message_type=body.message_type,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    out = _msg_out(msg)
    plan, lic_status, _ = _get_user_plan(user, db)
    await manager.send_to_admins({
        "type": "new_message",
        "message": out.model_dump(mode="json"),
        "user_id": user.id,
        "username": user.username,
        "plan": plan,
        "license_status": lic_status,
    })
    return out


# ─── admin REST endpoints ────────────────────────────────────────────────────

@router.get("/admin/conversations", response_model=list[ConversationOut])
def admin_get_conversations(
    _: str = Depends(get_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).all()
    result = []
    for u in users:
        last = (
            db.query(ChatMessage)
            .filter(ChatMessage.user_id == u.id)
            .order_by(ChatMessage.sent_at.desc())
            .first()
        )
        if not last:
            continue  # skip users with no messages
        unread = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.user_id == u.id,
                ChatMessage.sender == "user",
                ChatMessage.seen_at.is_(None),
            )
            .count()
        )
        plan, lic_status, _ = _get_user_plan(u, db)
        result.append(
            ConversationOut(
                user_id=u.id,
                username=u.username,
                plan=plan,
                license_status=lic_status,
                last_message=_msg_out(last),
                unread_count=unread,
                is_online=manager.user_online(u.id),
            )
        )
    result.sort(key=lambda c: c.last_message.sent_at if c.last_message else datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return result


@router.get("/admin/messages/{user_id}", response_model=list[MessageOut])
def admin_get_messages(
    user_id: int,
    limit: int = Query(50, le=200),
    before_id: Optional[int] = Query(None),
    _: str = Depends(get_admin),
    db: Session = Depends(get_db),
):
    q = db.query(ChatMessage).filter(ChatMessage.user_id == user_id)
    if before_id:
        q = q.filter(ChatMessage.id < before_id)
    msgs = q.order_by(ChatMessage.sent_at.desc()).limit(limit).all()
    return [_msg_out(m) for m in reversed(msgs)]


@router.post("/admin/messages/{user_id}", response_model=MessageOut)
async def admin_send_message(
    user_id: int,
    body: MessageIn,
    _: str = Depends(get_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    msg = ChatMessage(
        user_id=user_id,
        sender="admin",
        content=body.content.strip(),
        message_type=body.message_type,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    out = _msg_out(msg)
    await manager.send_to_user(user_id, {"type": "new_message", "message": out.model_dump(mode="json")})
    await manager.send_to_admins({"type": "new_message", "message": out.model_dump(mode="json"), "user_id": user_id})
    return out


@router.patch("/admin/messages/{user_id}/seen")
async def admin_mark_seen(
    user_id: int,
    _: str = Depends(get_admin),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    db.query(ChatMessage).filter(
        ChatMessage.user_id == user_id,
        ChatMessage.sender == "user",
        ChatMessage.seen_at.is_(None),
    ).update({"seen_at": now})
    db.commit()
    await manager.send_to_user(user_id, {"type": "messages_seen", "seen_at": now.isoformat()})
    return {"ok": True}


@router.delete("/admin/messages/{message_id}")
async def admin_delete_message(
    message_id: int,
    _: str = Depends(get_admin),
    db: Session = Depends(get_db),
):
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.deleted = True
    db.commit()
    await manager.send_to_user(msg.user_id, {"type": "message_deleted", "message_id": message_id})
    await manager.send_to_admins({"type": "message_deleted", "message_id": message_id, "user_id": msg.user_id})
    return {"ok": True}


@router.get("/admin/online")
def admin_online_users(_: str = Depends(get_admin)):
    return {"online_user_ids": manager.online_user_ids}


# ─── WebSocket endpoints ─────────────────────────────────────────────────────

@router.websocket("/ws")
async def ws_user(
    ws: WebSocket,
    token: str = Query(...),
):
    """Customer real-time WebSocket. Auth via support token query param."""
    payload = decode_support_token(token)
    if not payload:
        await ws.close(code=4001)
        return
    user_id: int = payload["user_id"]
    username: str = payload["sub"]

    await manager.connect_user(ws, user_id)
    # Notify admins that user came online
    await manager.send_to_admins({"type": "user_online", "user_id": user_id, "username": username})
    try:
        while True:
            data = await ws.receive_json()
            event = data.get("type")

            if event == "typing":
                await manager.send_to_admins({"type": "typing", "user_id": user_id, "username": username})

            elif event == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect_user(ws, user_id)
        await manager.send_to_admins({"type": "user_offline", "user_id": user_id, "username": username})


@router.websocket("/admin/ws")
async def ws_admin(  # noqa: D401
    ws: WebSocket,
    token: str = Query(...),
):
    """Admin real-time WebSocket. Auth via admin JWT query param."""
    payload = decode_token(token)
    if not payload or payload.get("role") != "admin":
        await ws.close(code=4001)
        return

    await manager.connect_admin(ws)
    try:
        while True:
            data = await ws.receive_json()
            event = data.get("type")

            if event == "typing":
                user_id = data.get("user_id")
                if user_id:
                    await manager.send_to_user(
                        int(user_id),
                        {"type": "typing", "sender": "admin"},
                    )

            elif event == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect_admin(ws)
