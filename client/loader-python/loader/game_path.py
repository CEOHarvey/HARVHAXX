import os
from pathlib import Path

KNOWN_HYXD_ROOTS = [
    r"C:\Program Files (x86)\hyxd",
    r"C:\Program Files\hyxd",
    r"C:\Program Files (x86)\HYXD",
    r"C:\Program Files\HYXD",
]


def is_launcher_path(path: str) -> bool:
    name = Path(path).name
    if name.lower() == "launcher.exe":
        return True
    full = str(Path(path).resolve())
    sep = os.sep
    return (
        f"{sep}Launcher{sep}" in full
        and f"{sep}Engine{sep}" not in full
    )


def is_direct_game_exe(path: str) -> bool:
    name = Path(path).name.lower()
    return name in ("hyxd.exe", "game.exe")


def find_hyxd_exe_near(any_path: str) -> str | None:
    p = Path(any_path)
    dir_path = p.parent if p.is_file() else p
    for _ in range(8):
        if not dir_path or not str(dir_path):
            break
        for name in ("hyxd.exe", "Game.exe", "game.exe"):
            candidate = dir_path / "Engine" / "Binaries" / "Win64" / name
            if candidate.is_file() and not is_launcher_path(str(candidate)):
                return str(candidate.resolve())
        dir_path = dir_path.parent
    return None


def try_hyxd_bypass(launcher_path: str) -> str | None:
    near = find_hyxd_exe_near(launcher_path)
    if near:
        return near
    launcher = Path(launcher_path).resolve()
    try:
        win64 = launcher.parent
        launcher_folder = win64.parent
        hyxd_root = launcher_folder.parent
        for rel in (
            Path("Engine") / "Binaries" / "Win64" / "hyxd.exe",
            Path("Engine") / "Binaries" / "Win64" / "Game.exe",
        ):
            c = hyxd_root / rel
            if c.is_file() and not is_launcher_path(str(c)):
                return str(c.resolve())
    except (OSError, ValueError):
        pass
    return None


def discover_installed_hyxd() -> str | None:
    for root in KNOWN_HYXD_ROOTS:
        root_path = Path(root)
        if not root_path.is_dir():
            continue
        direct = root_path / "Engine" / "Binaries" / "Win64" / "hyxd.exe"
        if direct.is_file():
            return str(direct.resolve())
        launcher = root_path / "Launcher" / "Win64" / "launcher.exe"
        if launcher.is_file():
            bypass = try_hyxd_bypass(str(launcher))
            if bypass:
                return bypass
    return None


def try_resolve_existing(path: str) -> str | None:
    if not path or not str(path).strip():
        return None
    full = Path(path).resolve()
    if not full.is_file():
        return None
    s = str(full)
    if is_launcher_path(s):
        bypass = try_hyxd_bypass(s) or find_hyxd_exe_near(s)
        return str(Path(bypass).resolve()) if bypass and Path(bypass).is_file() else None
    if is_direct_game_exe(s):
        return s
    near = find_hyxd_exe_near(s)
    return str(Path(near).resolve()) if near and Path(near).is_file() else s


def resolve_launcher_only_path(path: str) -> str | None:
    full = Path(path).resolve()
    if not is_launcher_path(str(full)):
        return None
    return try_hyxd_bypass(str(full)) or find_hyxd_exe_near(str(full)) or discover_installed_hyxd()


def resolve_best_game_exe(saved: str | None, default: str | None) -> str | None:
    for raw in (saved, default):
        if raw and str(raw).strip():
            resolved = try_resolve_existing(raw)
            if resolved:
                return resolved
    if saved and str(saved).strip():
        return resolve_launcher_only_path(saved)
    return discover_installed_hyxd()


def resolve_for_direct_launch(selected: str) -> str:
    return try_resolve_existing(selected) or str(Path(selected).resolve())
