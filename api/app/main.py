import logging

from sqlalchemy import inspect, text

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routes import admin, auth, license

logger = logging.getLogger(__name__)


def _migrate() -> None:
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(license.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
