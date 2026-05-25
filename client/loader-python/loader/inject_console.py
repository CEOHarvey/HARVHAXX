import os
import sys
from datetime import datetime

_log_path = os.path.join(
    os.environ.get("TEMP", "."), "LicenseLoader", "inject.log"
)


def attach() -> None:
    """No CMD window — logs go to file + main UI only (avoids stuck console)."""
    os.makedirs(os.path.dirname(_log_path), exist_ok=True)
    log("--- inject session ---")


def log(message: str) -> None:
    line = f"[{datetime.now():%H:%M:%S}] {message}"
    try:
        with open(_log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def close() -> None:
    """No-op (no console window)."""
    pass


def schedule_close(_root, _delay_ms: int) -> None:
    """No-op (no console window)."""
    pass


def normalize_auto_close_ms(raw: int) -> int:
    if raw <= 0:
        return 0
    if raw < 100:
        return raw * 1000
    return raw
