"""Generate app.ico from loader/assets/brand.png."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from loader.asset_crops import load_brand_image, save_app_icon

ASSETS = ROOT / "loader" / "assets"
OUT = ASSETS / "app.ico"


def main() -> None:
    img = load_brand_image(ASSETS)
    if img is None:
        raise SystemExit("Missing loader/assets/brand.png (square Harvcious logo)")
    ASSETS.mkdir(parents=True, exist_ok=True)
    save_app_icon(img, OUT)
    print(f"Wrote {OUT} from brand.png")


if __name__ == "__main__":
    main()
