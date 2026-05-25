import secrets
import string


def generate_license_key() -> str:
    """Format: HARVEY-XXXXX-XXXXX (A-Z, 0-9)."""
    alphabet = string.ascii_uppercase + string.digits

    def segment(length: int) -> str:
        return "".join(secrets.choice(alphabet) for _ in range(length))

    return f"HARVEY-{segment(5)}-{segment(5)}"
