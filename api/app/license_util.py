import secrets
import string

# Each product gets its own key prefix so keys never get mixed up across
# Macro / KnivesOut / Spoofer. The category stored on the License is the
# canonical product id (lowercased); the prefix is purely cosmetic/scannable.
PRODUCT_PREFIXES: dict[str, str] = {
    "macro": "MACRO",
    "knivesout": "KO",
    "spoofer": "SPF",
}

DEFAULT_PREFIX = "HARVEY"

_ALPHABET = string.ascii_uppercase + string.digits


def normalize_product(category: str | None) -> str:
    """Fold any incoming category label into a known product id."""
    c = (category or "").strip().lower().replace(" ", "").replace("-", "")
    if c in PRODUCT_PREFIXES:
        return c
    # tolerate common aliases
    if c in ("knives", "knivesout", "ko", "knifeout"):
        return "knivesout"
    if c in ("macros",):
        return "macro"
    if c in ("spoof", "spoofers", "hwid"):
        return "spoofer"
    return c or "spoofer"


def _segment(length: int) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def generate_license_key(category: str | None = None) -> str:
    """Format: <PREFIX>-XXXXX-XXXXX where PREFIX depends on the product."""
    product = normalize_product(category)
    prefix = PRODUCT_PREFIXES.get(product, DEFAULT_PREFIX)
    return f"{prefix}-{_segment(5)}-{_segment(5)}"
