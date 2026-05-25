import ctypes
from pathlib import Path

import psutil
from tkinter import filedialog

# Processes that count as the game client
GAME_EXE_NAMES = frozenset({"hyxd.exe", "game.exe"})


def pick_game_exe_path() -> str | None:
    path = filedialog.askopenfilename(
        title="Locate game (hyxd.exe) — do not pick launcher.exe",
        filetypes=[("Game executable", "*.exe")],
    )
    return path or None


def start_exe_as_admin(exe_path: str) -> tuple[bool, str]:
    if not Path(exe_path).is_file():
        return False, "Executable not found."
    full = str(Path(exe_path).resolve())
    work_dir = str(Path(full).parent)
    ret = ctypes.windll.shell32.ShellExecuteW(
        None, "runas", full, None, work_dir, 1
    )
    if ret <= 32:
        if ret == 5:
            return False, "Admin permission was cancelled."
        return False, "Failed to start (admin prompt cancelled?)."
    return True, ""


def _process_exe(proc: psutil.Process) -> str | None:
    try:
        return proc.exe()
    except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
        return None


def _iter_game_processes() -> list[psutil.Process]:
    found: list[psutil.Process] = []
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            name = (proc.info.get("name") or proc.name() or "").lower()
            if name in GAME_EXE_NAMES:
                found.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return found


def find_game_process(exe_path: str | None = None) -> psutil.Process | None:
    """
    Find a running hyxd/game process. Works without admin when exe() is blocked
    (falls back to process name).
    """
    expected_full: str | None = None
    expected_name = "hyxd.exe"
    if exe_path:
        p = Path(exe_path)
        expected_name = p.name.lower()
        if p.is_file():
            expected_full = str(p.resolve()).lower()

    processes = _iter_game_processes()
    if not processes:
        return None

    # 1) Exact full path match (best for inject)
    if expected_full:
        for proc in processes:
            exe = _process_exe(proc)
            if exe and str(Path(exe).resolve()).lower() == expected_full:
                return proc

    # 2) Same exe file name (hyxd.exe vs different install folder)
    if expected_name in GAME_EXE_NAMES:
        same_name: list[tuple[psutil.Process, str | None]] = []
        for proc in processes:
            exe = _process_exe(proc)
            if exe and Path(exe).name.lower() == expected_name:
                same_name.append((proc, exe))
            elif not exe and (proc.name() or "").lower() == expected_name:
                same_name.append((proc, None))

        if len(same_name) == 1:
            return same_name[0][0]
        if same_name:
            for proc, exe in same_name:
                if exe and r"\engine\binaries\win64" in exe.lower().replace("/", "\\"):
                    return proc
            return same_name[0][0]

    # 3) Any single game process
    if len(processes) == 1:
        return processes[0]

    # 4) Multiple — prefer Win64 game path
    for proc in processes:
        exe = _process_exe(proc)
        if exe and r"\engine\binaries\win64" in exe.lower().replace("/", "\\"):
            return proc

    return processes[0]


def find_game_pid(exe_path: str | None = None) -> int | None:
    proc = find_game_process(exe_path)
    if proc is None:
        return None
    try:
        return proc.pid
    except psutil.NoSuchProcess:
        return None


def is_game_running(exe_path: str | None = None) -> bool:
    return find_game_process(exe_path) is not None


def running_game_exe_path(exe_path: str | None = None) -> str | None:
    proc = find_game_process(exe_path)
    if proc is None:
        return None
    exe = _process_exe(proc)
    return str(Path(exe).resolve()) if exe else None
