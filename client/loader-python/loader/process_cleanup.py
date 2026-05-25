from pathlib import Path

import psutil


def _is_protected(path: str) -> bool:
    name = Path(path).name.lower()
    return name in ("hyxd.exe", "game.exe")


def kill_ko_for_game(game_exe_path: str | None) -> None:
    if game_exe_path:
        ko_path = Path(game_exe_path).resolve().parent / "KO.exe"
        if ko_path.is_file():
            _kill_exe_path(str(ko_path))
            return
    _kill_ko_by_name()


def _kill_exe_path(full_path: str) -> None:
    target = str(Path(full_path).resolve()).lower()
    for proc in psutil.process_iter(["exe", "name"]):
        try:
            exe = proc.info.get("exe")
            if not exe:
                continue
            if _is_protected(exe):
                continue
            if str(Path(exe).resolve()).lower() == target:
                proc.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue


def _kill_ko_by_name() -> None:
    for proc in psutil.process_iter(["exe", "name"]):
        try:
            name = (proc.info.get("name") or "").lower()
            if name != "ko.exe":
                continue
            exe = proc.info.get("exe") or ""
            if exe and _is_protected(exe):
                continue
            proc.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
