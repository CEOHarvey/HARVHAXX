"""
migrate_db.py — copy all data from one Postgres database to another.

Use this to move the license-loader data off a Render free-tier database
before it expires, into a fresh one. All data is preserved: users, licenses,
activations, sessions, HWIDs, chat messages, logs.

It is fully standalone — it reads the schema straight from the OLD database
(reflection), recreates it on the NEW database, copies every row in a
foreign-key-safe order, and fixes the id sequences afterward. Only two
packages are needed (pure-Python, no compiler):

    python -m pip install sqlalchemy pg8000

Setup
-----
1. Create the NEW Postgres (Render -> New -> Postgres -> Free). Grab BOTH
   databases' *External* connection URLs (Render -> DB -> Connections).
2. Copy  migrate_db.local.env.example  ->  migrate_db.local.env  and paste the
   two URLs. That real file is gitignored — secrets stay on your machine.
3. From the api/ folder:
       python migrate_db.py            # dry run: shows source row counts
       python migrate_db.py --run       # actually copy
   Add --wipe to TRUNCATE the target tables first (needed when re-running).
4. When it says "Done.", point the API's DATABASE_URL at the NEW database
   and redeploy.
"""

from __future__ import annotations

import os
import ssl
import sys
from pathlib import Path

from sqlalchemy import MetaData, create_engine, text

LOCAL_ENV = Path(__file__).with_name("migrate_db.local.env")

# Render's managed Postgres presents a valid cert, but we relax verification so
# the copy never fails on a hostname/CA mismatch. These are your own databases.
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE


def load_local_env() -> None:
    """Load KEY=VALUE lines from migrate_db.local.env into os.environ."""
    if not LOCAL_ENV.exists():
        return
    for raw in LOCAL_ENV.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def to_pg8000(url: str) -> str:
    """Normalise any Render/Heroku/Neon Postgres URL to the pg8000 driver."""
    url = url.strip()
    for prefix in ("postgresql+psycopg2://", "postgresql+psycopg://",
                   "postgresql://", "postgres://"):
        if url.startswith(prefix):
            url = "postgresql+pg8000://" + url[len(prefix):]
            break
    # Drop libpq query params (sslmode, channel_binding, …). pg8000 gets TLS
    # from connect_args and does not understand these keywords.
    url = url.split("?", 1)[0]
    return url


def engine_for(url: str):
    return create_engine(to_pg8000(url), connect_args={"ssl_context": _SSL})


def main() -> int:
    load_local_env()
    do_run = "--run" in sys.argv
    do_wipe = "--wipe" in sys.argv

    old_url = os.environ.get("OLD_DATABASE_URL", "").strip()
    new_url = os.environ.get("NEW_DATABASE_URL", "").strip()
    if not old_url or not new_url:
        print("ERROR: set OLD_DATABASE_URL and NEW_DATABASE_URL in migrate_db.local.env")
        return 1

    old_engine = engine_for(old_url)
    new_engine = engine_for(new_url)

    # 1) Read the schema from the OLD database.
    print("Reading schema from the OLD database …")
    meta = MetaData()
    meta.reflect(bind=old_engine)
    tables = list(meta.sorted_tables)  # parent-before-child (FK-safe)
    if not tables:
        print("ERROR: no tables found on the OLD database — check OLD_DATABASE_URL.")
        return 1

    # 2) Recreate that schema on the NEW database (no-op if it already exists).
    print("Ensuring schema on the NEW database …")
    meta.create_all(bind=new_engine)

    # 3) Report source counts.
    print("\nSource row counts (OLD database):")
    src_counts: dict[str, int] = {}
    with old_engine.connect() as oc:
        for t in tables:
            n = oc.execute(text(f'SELECT COUNT(*) FROM "{t.name}"')).scalar() or 0
            src_counts[t.name] = n
            print(f"  {t.name:<24} {n}")

    if not do_run:
        print("\nDry run only. Re-run with --run to copy (add --wipe to clear the target first).")
        return 0

    # 4) Copy.
    with new_engine.begin() as nc, old_engine.connect() as oc:
        if do_wipe:
            print("\nWiping target tables …")
            for t in reversed(tables):  # child-before-parent
                nc.execute(text(f'TRUNCATE TABLE "{t.name}" RESTART IDENTITY CASCADE'))
        else:
            for t in tables:
                existing = nc.execute(text(f'SELECT COUNT(*) FROM "{t.name}"')).scalar() or 0
                if existing:
                    print(f"\nERROR: target table '{t.name}' already has {existing} rows.")
                    print("Re-run with --wipe to clear the target first, or use an empty database.")
                    return 1

        print("\nCopying …")
        for t in tables:
            rows = [dict(r) for r in oc.execute(t.select()).mappings().all()]
            if rows:
                nc.execute(t.insert(), rows)
            print(f"  {t.name:<24} {len(rows)} copied")

        # 5) Reset identity sequences so new inserts don't collide with copied ids.
        print("\nResetting sequences …")
        for t in tables:
            for col in t.primary_key.columns:
                seq = nc.execute(
                    text("SELECT pg_get_serial_sequence(:t, :c)"),
                    {"t": t.name, "c": col.name},
                ).scalar()
                if not seq:
                    continue
                maxid = nc.execute(
                    text(f'SELECT COALESCE(MAX("{col.name}"), 0) FROM "{t.name}"')
                ).scalar() or 0
                if maxid > 0:
                    nc.execute(text("SELECT setval(:s, :v, true)"), {"s": seq, "v": maxid})
                else:
                    nc.execute(text("SELECT setval(:s, 1, false)"), {"s": seq})
                print(f"  {t.name}.{col.name} -> next id {maxid + 1}")

    # 6) Verify.
    print("\nVerifying target counts (NEW database):")
    ok = True
    with new_engine.connect() as nc:
        for t in tables:
            n = nc.execute(text(f'SELECT COUNT(*) FROM "{t.name}"')).scalar() or 0
            match = n == src_counts[t.name]
            ok = ok and match
            print(f"  {t.name:<24} {n}  [{'OK' if match else 'MISMATCH'}]")

    print("\nDone." if ok else "\nDone WITH MISMATCHES — review the rows above.")
    print("Next: set the API's DATABASE_URL to the NEW database and redeploy.")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
