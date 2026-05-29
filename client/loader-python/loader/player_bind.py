"""
Player Name Reader — reads the in-game player name from hyxd.exe.
Primary method: Window title parsing (most reliable).
Fallback: GWorld memory traversal (may not work on all versions).
"""

import ctypes
from ctypes import wintypes
from pathlib import Path
from typing import Optional, Callable

import psutil

from loader.game_session import find_game_process

# ── Win32 Setup ──
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32 = ctypes.WinDLL("user32", use_last_error=True)

OpenProcess = kernel32.OpenProcess
OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
OpenProcess.restype = wintypes.HANDLE

ReadProcessMemory = kernel32.ReadProcessMemory
ReadProcessMemory.argtypes = [
    wintypes.HANDLE, wintypes.LPCVOID, wintypes.LPVOID,
    ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t),
]
ReadProcessMemory.restype = wintypes.BOOL

CloseHandle = kernel32.CloseHandle
CloseHandle.argtypes = [wintypes.HANDLE]
CloseHandle.restype = wintypes.BOOL

CreateToolhelp32Snapshot = kernel32.CreateToolhelp32Snapshot
CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
CreateToolhelp32Snapshot.restype = wintypes.HANDLE

Module32FirstW = kernel32.Module32FirstW
Module32FirstW.restype = wintypes.BOOL
Module32NextW = kernel32.Module32NextW
Module32NextW.restype = wintypes.BOOL

TH32CS_SNAPMODULE = 0x00000008
TH32CS_SNAPMODULE32 = 0x00000010
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010

WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
EnumWindows = user32.EnumWindows
EnumWindows.argtypes = [WNDENUMPROC, wintypes.LPARAM]
EnumWindows.restype = wintypes.BOOL

GetWindowThreadProcessId = user32.GetWindowThreadProcessId
GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
GetWindowThreadProcessId.restype = wintypes.DWORD

GetWindowTextW = user32.GetWindowTextW
GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
GetWindowTextW.restype = ctypes.c_int

IsWindowVisible = user32.IsWindowVisible
IsWindowVisible.argtypes = [wintypes.HWND]
IsWindowVisible.restype = wintypes.BOOL


class MODULEENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("th32ModuleID", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD),
        ("GlblcntUsage", wintypes.DWORD),
        ("ProccntUsage", wintypes.DWORD),
        ("modBaseAddr", ctypes.c_void_p),
        ("modBaseSize", wintypes.DWORD),
        ("hModule", wintypes.HMODULE),
        ("szModule", wintypes.WCHAR * 256),
        ("szExePath", wintypes.WCHAR * 260),
    ]


# ════════════════════════════════════════════════════════════════
#  Window Title Methods (PRIMARY — most reliable)
# ════════════════════════════════════════════════════════════════

def parse_name_from_window_title(title: str) -> str | None:
    """
    Parse player name from window title.
    
    Known formats:
      荒野行动 - [(Username - 1199018453
      荒野行动 - [Username - 12345]
      Username - 12345
    
    Strategy: find the username which is between [( or [ and the last " - " before digits.
    """
    t = (title or "").strip()
    if not t:
        return None

    # ★ FORMAT 1: "荒野行动 - [(Username - ID" or "GameName - [Username - ID]"
    # Look for [( or [ bracket — username starts after it
    for bracket in ("[(", "["):
        idx = t.find(bracket)
        if idx >= 0:
            after = t[idx + len(bracket):].strip()
            # Remove trailing ] or ) if present
            after = after.rstrip("])")
            # Now after = "Username - 1199018453"
            # Split on " - " and take the left part
            for sep in (" - ", " – ", " — "):
                if sep in after:
                    name = after.split(sep, 1)[0].strip()
                    if name and 2 <= len(name) <= 40:
                        return name
            # If no separator, maybe the whole thing is the name
            if after and 2 <= len(after) <= 40:
                return after
            break

    # ★ FORMAT 2: "Username - ID" (simple format, no brackets)
    # Use the LAST " - " separator (in case game name has " - " too)
    for sep in (" - ", " – ", " — ", " | "):
        if sep in t:
            # Find the last occurrence of separator followed by digits
            parts = t.rsplit(sep, 1)
            if len(parts) == 2:
                right = parts[1].strip().rstrip("])")
                # If right side is mostly digits, left side might have the name
                if right and any(c.isdigit() for c in right):
                    left = parts[0].strip()
                    # But left might be "GameName - [(Username"
                    # Try to extract username from left
                    for b in ("[(", "["):
                        bi = left.find(b)
                        if bi >= 0:
                            name = left[bi + len(b):].strip()
                            if name and 2 <= len(name) <= 40:
                                return name
                    # If no brackets, use the right-most name part
                    # Split left on " - " and take the last part
                    if " - " in left:
                        name = left.rsplit(" - ", 1)[1].strip().lstrip("[(")
                    else:
                        name = left.strip()
                    if name and 2 <= len(name) <= 40:
                        return name

    # ★ FORMAT 3: Simple "Name-12345" (no spaces)
    if "-" in t and " - " not in t:
        parts = t.split("-", 1)
        left = parts[0].strip()
        right = parts[1].strip()
        if left and 2 <= len(left) <= 40 and right.isdigit():
            return left

    return None


def all_window_titles_for_pid(pid: int) -> list[str]:
    """Get all window titles for a given PID."""
    titles: list[str] = []

    @WNDENUMPROC
    def enum_proc(hwnd, lparam):
        wpid = wintypes.DWORD()
        GetWindowThreadProcessId(hwnd, ctypes.byref(wpid))
        if int(wpid.value) != int(pid):
            return True
        buf = ctypes.create_unicode_buffer(512)
        GetWindowTextW(hwnd, buf, 512)
        t = (buf.value or "").strip()
        if t:
            titles.append(t)
        return True

    EnumWindows(enum_proc, 0)

    # Deduplicate, preserve order
    seen: set[str] = set()
    out: list[str] = []
    for t in titles:
        if t not in seen:
            out.append(t)
            seen.add(t)
    return out


def try_read_name_from_window(pid: int, log: Callable | None = None) -> str | None:
    """Read player name from game window title."""
    titles = all_window_titles_for_pid(pid)
    if not titles:
        log and log("No window titles found")
        return None

    log and log(f"Window titles ({len(titles)}):")
    for t in titles[:8]:
        log and log(f"  '{t}'")

    for t in titles:
        name = parse_name_from_window_title(t)
        if name:
            log and log(f"Player name from title: {name}")
            return name

    log and log("No parseable 'Username - ID' pattern found")
    return None


# ════════════════════════════════════════════════════════════════
#  Memory Methods (FALLBACK — may not work on all game versions)
# ════════════════════════════════════════════════════════════════

def _valid_handle(h) -> bool:
    if h is None:
        return False
    v = ctypes.c_void_p(h).value
    return v not in (None, 0, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFF)


def _module_base_in_process(pid: int, module_name: str) -> int | None:
    wanted = module_name.lower()
    snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid)
    if not _valid_handle(snap):
        return None
    try:
        entry = MODULEENTRY32W()
        entry.dwSize = ctypes.sizeof(MODULEENTRY32W)
        if not Module32FirstW(snap, ctypes.byref(entry)):
            return None
        while True:
            name = entry.szModule.lower()
            if name == wanted:
                return int(entry.modBaseAddr or 0) or None
            if not Module32NextW(snap, ctypes.byref(entry)):
                break
    finally:
        CloseHandle(snap)
    return None


def _read_u64(h_process, address: int) -> int | None:
    buf = (ctypes.c_ubyte * 8)()
    read = ctypes.c_size_t(0)
    ok = ReadProcessMemory(h_process, ctypes.c_void_p(address), buf, 8, ctypes.byref(read))
    if not ok or int(read.value) != 8:
        return None
    return int.from_bytes(bytes(buf), "little", signed=False)


def _read_c_string(h_process, address: int, max_len: int = 64) -> str | None:
    if not address or address < 0x10000:
        return None
    buf = (ctypes.c_ubyte * max_len)()
    read = ctypes.c_size_t(0)
    ok = ReadProcessMemory(h_process, ctypes.c_void_p(address), buf, max_len, ctypes.byref(read))
    if not ok or int(read.value) <= 0:
        return None
    raw = bytes(buf)
    end = raw.find(b"\x00")
    if end == -1:
        end = max_len
    try:
        s = raw[:end].decode("utf-8", errors="ignore").strip()
    except Exception:
        return None
    if not s or len(s) < 2 or len(s) > 40:
        return None
    if s.startswith(("Prefab", "Level")) or "::" in s or "/" in s:
        return None
    return s


def _try_read_name_from_rbtree(h_process, node: int, depth: int, log) -> str | None:
    if not node or node < 0x10000 or depth > 20:
        return None
    try:
        entity = _read_u64(h_process, node + 0x20)
        if entity and entity > 0x10000:
            iobj = _read_u64(h_process, entity + 0x18)
            if iobj and iobj > 0x10000:
                name_ptr = _read_u64(h_process, iobj + 0x10)
                name = _read_c_string(h_process, name_ptr or 0, 64)
                if name:
                    log and log(f"Found name (memory): {name}")
                    return name
            name_ptr2 = _read_u64(h_process, entity + 0x70)
            name2 = _read_c_string(h_process, name_ptr2 or 0, 64)
            if name2:
                log and log(f"Found name (direct): {name2}")
                return name2

        left = _read_u64(h_process, node + 0x00)
        if left and left != node:
            r = _try_read_name_from_rbtree(h_process, left, depth + 1, log)
            if r:
                return r
        right = _read_u64(h_process, node + 0x08)
        if right and right != node:
            r = _try_read_name_from_rbtree(h_process, right, depth + 1, log)
            if r:
                return r
    except Exception:
        pass
    return None


def try_read_name_from_memory(game_exe_path: str, pid: int, log: Callable | None = None) -> str | None:
    """Try to read player name from game memory via GWorld traversal."""
    module_name = Path(game_exe_path).name if game_exe_path else "hyxd.exe"

    h_process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not _valid_handle(h_process):
        log and log("OpenProcess failed for memory read")
        return None

    try:
        base = _module_base_in_process(pid, module_name)
        if not base:
            log and log("Module base not found")
            return None

        g_world = _read_u64(h_process, base + 0x8B61088)
        if not g_world:
            log and log("GWorld is null")
            return None

        level_list_head = g_world + 0xE0
        node = _read_u64(h_process, level_list_head)
        if not node:
            log and log("Level list empty")
            return None

        checked = 0
        while node and node != level_list_head and checked < 50:
            i_level = _read_u64(h_process, node + 0x30)
            if i_level and i_level > 0x10000:
                entity_root = _read_u64(h_process, i_level + 0x68)
                if entity_root and entity_root > 0x10000:
                    name = _try_read_name_from_rbtree(h_process, entity_root, 0, log)
                    if name:
                        return name
            next_node = _read_u64(h_process, node)
            if not next_node or next_node == node:
                break
            node = next_node
            checked += 1

        log and log(f"Checked {checked} levels, no name from memory")
        return None
    except Exception as ex:
        log and log(f"Memory read error: {ex}")
        return None
    finally:
        CloseHandle(h_process)


# ════════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT
# ════════════════════════════════════════════════════════════════

def try_read_player_name(game_exe_path: str | None, log: Callable | None = None) -> str | None:
    """
    Read the current in-game player name.
    
    ★ PRIMARY: Window title parsing (fast, reliable)
    ★ FALLBACK: GWorld memory traversal (may not work on all versions)
    
    Returns the player name or None if not detectable.
    """
    proc: psutil.Process | None = find_game_process(game_exe_path)
    if not proc:
        log and log("Game process not found")
        return None

    pid = int(proc.pid)
    log and log(f"Game PID: {pid}")

    # ★ METHOD 1: Window title (PRIMARY — fast and reliable)
    log and log("Trying window title method...")
    name = try_read_name_from_window(pid, log)
    if name:
        return name

    # ★ METHOD 2: GWorld memory traversal (FALLBACK)
    if game_exe_path:
        log and log("Trying memory method...")
        name = try_read_name_from_memory(game_exe_path, pid, log)
        if name:
            return name

    log and log("All methods failed — player name not found")
    return None
