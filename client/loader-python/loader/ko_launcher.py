import os
import shutil
import stat
import time
from pathlib import Path

import psutil

from loader.config import Settings
from loader.payload import try_extract_embedded
from loader.paths import app_dir
from loader.process_cleanup import kill_ko_for_game


def ko_path_in_game_folder(game_exe_path: str) -> str:
    return str(Path(game_exe_path).resolve().parent / "KO.exe")


def resolve_ko_source(settings: Settings, log=None) -> str | None:
    if settings.use_embedded_ko:
        embedded = try_extract_embedded(settings.ko_exe_file_name, log)
        if embedded and Path(embedded).is_file():
            return embedded
    for candidate in (
        app_dir() / settings.ko_exe_file_name,
        app_dir() / "Payload" / settings.ko_exe_file_name,
    ):
        if candidate.is_file():
            log and log(f"Using KO beside loader: {candidate}")
            return str(candidate.resolve())
    return None


def _same_file(a: Path, b: Path) -> bool:
    if not a.is_file() or not b.is_file():
        return False
    try:
        return a.stat().st_size == b.stat().st_size
    except OSError:
        return False


def _clear_readonly(path: Path) -> None:
    try:
        os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
    except OSError:
        pass


def _kill_process_locking(path: Path) -> None:
    target = str(path.resolve()).lower()
    for proc in psutil.process_iter(["exe"]):
        try:
            exe = proc.info.get("exe")
            if exe and str(Path(exe).resolve()).lower() == target:
                proc.kill()
                try:
                    proc.wait(timeout=3)
                except psutil.TimeoutExpired:
                    proc.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue


def _remove_dest(dest: Path, game_exe_path: str) -> None:
    if not dest.exists():
        return
    kill_ko_for_game(game_exe_path)
    _kill_process_locking(dest)
    time.sleep(0.2)

    for _ in range(5):
        try:
            _clear_readonly(dest)
            dest.unlink(missing_ok=True)
            return
        except PermissionError:
            time.sleep(0.3)
        except OSError:
            break

    backup = dest.with_name("KO.exe.old")
    try:
        if backup.exists():
            _clear_readonly(backup)
            backup.unlink(missing_ok=True)
        dest.rename(backup)
    except OSError:
        pass


def game_folder_has_ko(game_exe_path: str) -> bool:
    return Path(ko_path_in_game_folder(game_exe_path)).is_file()


def ensure_ko_path(game_exe_path: str, settings: Settings) -> tuple[bool, str, str]:
    """Use existing KO.exe in game folder, or copy from loader if missing."""
    if not game_exe_path or not Path(game_exe_path).is_file():
        return False, "", "Locate hyxd.exe first."
    dest = Path(ko_path_in_game_folder(game_exe_path))
    if dest.is_file():
        return True, str(dest.resolve()), ""
    return try_deploy(game_exe_path, settings)


def try_deploy(game_exe_path: str, settings: Settings) -> tuple[bool, str, str]:
    if not game_exe_path or not Path(game_exe_path).is_file():
        return False, "", "Locate hyxd.exe first."
    source = resolve_ko_source(settings)
    if not source:
        return (
            False,
            "",
            f"KO.exe not found. Rebuild loader with embedded {settings.ko_exe_file_name}.",
        )

    src = Path(source)
    dest = Path(ko_path_in_game_folder(game_exe_path))

    if dest.is_file():
        return True, str(dest.resolve()), ""

    if _same_file(src, dest):
        return True, str(dest), ""

    kill_ko_for_game(game_exe_path)
    time.sleep(0.25)
    _remove_dest(dest, game_exe_path)

    tmp = dest.with_name("KO.exe.new")
    try:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        shutil.copy2(src, tmp)
        os.replace(tmp, dest)
        return True, str(dest), ""
    except OSError:
        pass

    try:
        shutil.copy2(src, dest)
        return True, str(dest), ""
    except PermissionError:
        return (
            False,
            "",
            "Cannot copy KO.exe. Close game/KO, delete KO.exe in the game folder, then press Start game again.",
        )
    except OSError as ex:
        return False, "", str(ex)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
