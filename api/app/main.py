import logging

from sqlalchemy import inspect, text

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routes import admin, auth, license, player

logger = logging.getLogger(__name__)


def _migrate() -> None:
    from sqlalchemy.orm import Session

    from app.hwid_bind_util import add_approved_hwid
    from app.models import Activation, User, UserHwid, UserSession

    insp = inspect(engine)
    tables = insp.get_table_names()
    dialect = engine.dialect.name

    if "licenses" in tables:
        cols = {c["name"] for c in insp.get_columns("licenses")}
        with engine.begin() as conn:
            if "duration_seconds" not in cols:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE licenses ADD COLUMN duration_seconds INTEGER DEFAULT 86400"))
                else:
                    conn.execute(
                        text("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 86400")
                    )
                conn.execute(
                    text("UPDATE licenses SET duration_seconds = duration_days * 86400 WHERE duration_seconds IS NULL")
                )
            if "category" not in cols:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE licenses ADD COLUMN category VARCHAR(64) DEFAULT 'standard'"))
                else:
                    conn.execute(text("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'standard'"))
                conn.execute(text("UPDATE licenses SET category = 'standard' WHERE category IS NULL"))

    if "users" in tables:
        cols = {c["name"] for c in insp.get_columns("users")}
        with engine.begin() as conn:
            if "bound_player_name" not in cols:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE users ADD COLUMN bound_player_name VARCHAR(64)"))
                else:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bound_player_name VARCHAR(64)"))
            if "bound_player_at" not in cols:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE users ADD COLUMN bound_player_at DATETIME"))
                else:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bound_player_at TIMESTAMPTZ"))

    if "activations" in tables:
        cols = {c["name"] for c in insp.get_columns("activations")}
        if "expiry_notified_at" not in cols:
            with engine.begin() as conn:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE activations ADD COLUMN expiry_notified_at DATETIME"))
                else:
                    conn.execute(
                        text("ALTER TABLE activations ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMPTZ")
                    )

    if "user_hwids" in tables:
        with Session(engine) as db:
            if db.query(UserHwid).count() == 0:
                for sess in db.query(UserSession).all():
                    add_approved_hwid(db, sess.user_id, sess.hwid_hash, label="migrated")
                for act in db.query(Activation).all():
                    if act.hwid_hash and act.hwid_hash != "0" * 64:
                        add_approved_hwid(db, act.user_id, act.hwid_hash, label="migrated")
                db.commit()


def _init_db() -> None:
    try:
        Base.metadata.create_all(bind=engine)
        _migrate()
        logger.info("Database ready (%s)", engine.dialect.name)
    except Exception:
        logger.exception("Database startup failed (url scheme: %s)", settings.database_url_resolved.split("://")[0])
        raise


_init_db()

app = FastAPI(title="License Loader API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://.*\.vercel\.app",  # production + preview on Vercel
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(license.router)
app.include_router(player.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
