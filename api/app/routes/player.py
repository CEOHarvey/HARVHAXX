from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.discord_notify import notify_player_reset_requested
from app.models import PlayerNameResetRequest, User
from app.schemas import PlayerAccountResponse, PlayerBindRequest, PlayerBindResponse

router = APIRouter(prefix="/player", tags=["player"])


@router.post("/request-reset")
def request_player_reset(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """User asks admin to clear their bound in-game name. Shows up in the web admin."""
    bound = (user.bound_player_name or "").strip() or None
    if not bound:
        return {"ok": True, "message": "No bound player to reset."}

    # Reuse an existing pending request instead of stacking duplicates.
    existing = (
        db.query(PlayerNameResetRequest)
        .filter(PlayerNameResetRequest.user_id == user.id, PlayerNameResetRequest.status == "pending")
        .first()
    )
    if not existing:
        db.add(PlayerNameResetRequest(user_id=user.id, player_name=bound, status="pending"))
        db.commit()

    try:
        notify_player_reset_requested(user.username, bound)
    except Exception:
        pass
    return {"ok": True, "message": "Reset request sent to the developer. You'll be notified once cleared."}


def _clean(name: str) -> str:
    # Keep simple rules; loader already filters most garbage
    return (name or "").strip()[:40]


@router.get("/account", response_model=PlayerAccountResponse)
def get_player_account(user: User = Depends(get_current_user)):
    bound = (user.bound_player_name or "").strip() or None
    return PlayerAccountResponse(
        bound_player_name=bound,
        bound_player_at=user.bound_player_at,
    )


@router.post("/bind", response_model=PlayerBindResponse)
def bind_player(
    body: PlayerBindRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = _clean(body.player_name)
    if not current:
        return PlayerBindResponse(
            allowed=False,
            bound_name=user.bound_player_name,
            current_name=None,
            message="Invalid player name",
        )

    bound = (user.bound_player_name or "").strip() or None
    if not bound:
        user.bound_player_name = current
        user.bound_player_at = datetime.now(timezone.utc)
        db.add(user)
        db.commit()
        return PlayerBindResponse(
            allowed=True,
            bound_name=current,
            current_name=current,
            is_new_bind=True,
            message="Player bound",
        )

    if bound.lower() != current.lower():
        return PlayerBindResponse(
            allowed=False,
            bound_name=bound,
            current_name=current,
            message=f"⚠ ACCESS DENIED ⚠\nThis loader account is bound to: {bound}\nCurrent player: {current}\nBawal gamitin sa ibang player.",
        )

    return PlayerBindResponse(
        allowed=True,
        bound_name=bound,
        current_name=current,
        message="OK",
    )

