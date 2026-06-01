def print_duration_label(seconds: int) -> str:
    """Short label for printable license sheets, e.g. 1DAY, 2DAY, 7DAY."""
    if seconds <= 0:
        return "0DAY"
    if seconds % 86400 == 0:
        days = seconds // 86400
        return f"{days}DAY"
    if seconds % 3600 == 0:
        hours = seconds // 3600
        return f"{hours}HOUR"
    if seconds % 60 == 0:
        minutes = seconds // 60
        return f"{minutes}MIN"
    return format_duration(seconds).replace(" ", "").upper()


def format_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        return f"{h}h {m}m" if m else f"{h}h"
    d = seconds // 86400
    h = (seconds % 86400) // 3600
    return f"{d}d {h}h" if h else f"{d}d"
