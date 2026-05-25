import os
import shutil
import tempfile
from pathlib import Path

from loader.config import Settings
from loader.paths import app_dir, resource_path


def _extract_dir() -> Path:
    d = Path(tempfile.gettempdir()) / "LicenseLoader" / "payload"
    d.mkdir(parents=True, exist_ok=True)
    return d


def try_extract_embedded(file_name: str, log=None) -> str | None:
    src = resource_path("Payload", file_name)
    if not src.is_file():
        log and log(f"No embedded {file_name} in bundle.")
        return None
    out = _extract_dir() / file_name
    shutil.copy2(src, out)
    log and log(f"Loaded embedded {file_name}")
    return str(out)


def resolve_dll_path(settings: Settings, log=None) -> str:
    if settings.use_embedded_payload:
        embedded = try_extract_embedded(settings.payload_file_name, log)
        if embedded and Path(embedded).is_file():
            return embedded
    external = Path(settings.dll_path)
    if not external.is_absolute():
        external = app_dir() / settings.dll_path
    if external.is_file():
        log and log(f"Using DLL beside EXE: {external}")
        return str(external.resolve())
    raise FileNotFoundError(
        f"Could not find {settings.payload_file_name}. Rebuild with Payload embedded."
    )
