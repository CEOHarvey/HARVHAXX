"""Windows administrator check before the loader UI starts."""

from __future__ import annotations

import ctypes
import sys


def is_running_as_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _relaunch_as_admin() -> None:
    if getattr(sys, "frozen", False):
        exe = sys.executable
        params = " ".join(f'"{arg}"' for arg in sys.argv[1:])
    else:
        exe = sys.executable
        params = "-m loader"
        extra = " ".join(f'"{arg}"' for arg in sys.argv[1:])
        if extra:
            params = f"{params} {extra}"
    ctypes.windll.shell32.ShellExecuteW(None, "runas", exe, params or None, None, 1)


def require_admin_at_startup() -> None:
    """Block until running elevated. Yes = UAC relaunch, No = exit."""
    if is_running_as_admin():
        return

    import tkinter as tk
    from tkinter import messagebox

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)

    restart = messagebox.askyesno(
        "Run as Administrator",
        "License Loader must run as Administrator.\n\n"
        "Inject, Start game, and KO.exe need admin rights on Windows.\n\n"
        "Click Yes to restart as Administrator (UAC prompt).\n"
        "Click No to exit — then right-click the EXE and choose "
        "'Run as administrator'.",
        icon="warning",
        default=messagebox.YES,
        parent=root,
    )
    root.destroy()

    if restart:
        _relaunch_as_admin()
    sys.exit(0)
