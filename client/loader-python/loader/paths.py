import sys
from pathlib import Path


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def app_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def bundle_dir() -> Path:
    if is_frozen():
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent.parent


def resource_path(*parts: str) -> Path:
    candidates = [
        bundle_dir().joinpath(*parts),
        Path(__file__).resolve().parent.parent.joinpath(*parts),
        (Path(__file__).resolve().parent.parent.parent / "LicenseLoader").joinpath(
            *parts
        ),
    ]
    for path in candidates:
        if path.exists():
            return path
    return candidates[0]
