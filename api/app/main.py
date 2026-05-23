from sqlalchemy import inspect, text

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routes import admin, auth, license


def _migrate_sqlite() -> None:
    insp = inspect(engine)
    tables = insp.get_table_names()
    if "licenses" in tables:
        cols = {c["name"] for c in insp.get_columns("licenses")}
        with engine.begin() as conn:
            if "duration_seconds" not in cols:
                conn.execute(text("ALTER TABLE licenses ADD COLUMN duration_seconds INTEGER DEFAULT 86400"))
                conn.execute(
                    text("UPDATE licenses SET duration_seconds = duration_days * 86400 WHERE duration_seconds IS NULL")
                )
    if "activations" in tables:
        cols = {c["name"] for c in insp.get_columns("activations")}
        col_type = "DATETIME" if engine.dialect.name == "sqlite" else "TIMESTAMP"
        with engine.begin() as conn:
            if "expiry_notified_at" not in cols:
                conn.execute(text(f"ALTER TABLE activations ADD COLUMN expiry_notified_at {col_type}"))


Base.metadata.create_all(bind=engine)
_migrate_sqlite()

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
