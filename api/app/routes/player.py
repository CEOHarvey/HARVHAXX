from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import PlayerBindRequest, PlayerBindResponse

router = APIRouter(prefix="/player", tags=["player"])


def _clean(name: str) -> str:
    # Keep simple rules; loader already filters most garbage
    return (name or "").strip()[:40]


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

