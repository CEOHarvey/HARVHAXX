"""EXE / window icon from assets/brand.png (not shown inside UI)."""

from __future__ import annotations

import hashlib
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageTk
except ImportError:
    Image = None  # type: ignore[misc, assignment]
    ImageTk = None  # type: ignore[misc, assignment]

from loader.asset_crops import load_brand_image, save_app_icon


def assets_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).resolve().parent
    return base / "assets"


def _writable_icon_path(brand_file: Path, img: Image.Image) -> Path:
    """Build .ico in TEMP (PyInstaller bundle assets are read-only)."""
    digest = hashlib.sha256(brand_file.read_bytes()).hexdigest()[:16]
    cache_dir = Path(tempfile.gettempdir()) / "LicenseLoader" / "icons"
    cache_dir.mkdir(parents=True, exist_ok=True)
    ico_path = cache_dir / f"app_{digest}.ico"
    save_app_icon(img, ico_path)
    return ico_path.resolve()


class BrandAssets:
    """Window + taskbar icon from brand.png."""

    def __init__(self) -> None:
        self._photos: list = []
        self._icon_path: Path | None = None
        self._icon_photos: list = []
        self._load()

    def _load(self) -> None:
        if Image is None or ImageTk is None:
            return
        folder = assets_dir()
        brand_file = folder / "brand.png"
        if not brand_file.is_file():
            brand_file = folder / "icon.png"
        img = load_brand_image(folder)
        if img is None or not brand_file.is_file():
            return

        # Dev: keep app.ico next to brand.png for PyInstaller --icon
        if not getattr(sys, "frozen", False):
            try:
                save_app_icon(img, folder / "app.ico")
            except OSError:
                pass

        try:
            self._icon_path = _writable_icon_path(brand_file, img)
        except OSError:
            fallback = folder / "app.ico"
            if fallback.is_file():
                self._icon_path = fallback.resolve()

        for size in (16, 32, 48):
            photo = ImageTk.PhotoImage(img.resize((size, size), Image.Resampling.LANCZOS))
            self._icon_photos.append(photo)
            self._photos.append(photo)

    def apply_to_window(self, root) -> None:
        if self._icon_photos:
            try:
                root.iconphoto(True, *self._icon_photos)
            except Exception:
                if self._icon_photos:
                    try:
                        root.iconphoto(True, self._icon_photos[-1])
                    except Exception:
                        pass
        if self._icon_path and self._icon_path.is_file():
            try:
                root.iconbitmap(default=str(self._icon_path))
            except Exception:
                pass
