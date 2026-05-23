"""HWID binding helpers."""

HWID_RESET_PENDING = "0" * 64


def is_hwid_pending_reset(hwid_hash: str | None) -> bool:
    if not hwid_hash:
        return True
    return hwid_hash == HWID_RESET_PENDING
