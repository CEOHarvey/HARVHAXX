"""App icon from loader/assets/brand.png (square logo, same as former icon.png)."""

from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore[misc, assignment]


def _square_crop(img: Image.Image) -> Image.Image:
    if img.width == img.height:
        return img
    side = min(img.width, img.height)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    return img.crop((left, top, left + side, top + side))


def load_brand_image(assets_dir: Path) -> Image.Image | None:
    if Image is None:
        return None
    brand_path = assets_dir / "brand.png"
    if brand_path.is_file():
        return _square_crop(Image.open(brand_path).convert("RGBA"))
    fallback = assets_dir / "icon.png"
    if fallback.is_file():
        return _square_crop(Image.open(fallback).convert("RGBA"))
    return None


def save_app_icon(img: Image.Image, out_path: Path) -> None:
    icon = _square_crop(img.copy())
    icon = icon.resize((256, 256), Image.Resampling.LANCZOS)
    icon.save(
        out_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
