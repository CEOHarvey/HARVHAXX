import ctypes
from ctypes import wintypes
from pathlib import Path

from loader.game_session import find_game_pid, is_game_running

# OpenProcess rights for inject
PROCESS_ACCESS = (
    0x0002  # CREATE_THREAD
    | 0x0400  # QUERY_INFORMATION
    | 0x0008  # VM_OPERATION
    | 0x0020  # VM_WRITE
    | 0x0010  # VM_READ
)

MEM_COMMIT = 0x1000
MEM_RESERVE = 0x2000
PAGE_READWRITE = 0x04
MEM_RELEASE = 0x8000
TH32CS_SNAPMODULE = 0x00000008
TH32CS_SNAPMODULE32 = 0x00000010
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


kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

OpenProcess = kernel32.OpenProcess
OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
OpenProcess.restype = wintypes.HANDLE

VirtualAllocEx = kernel32.VirtualAllocEx
VirtualAllocEx.argtypes = [
    wintypes.HANDLE,
    wintypes.LPVOID,
    ctypes.c_size_t,
    wintypes.DWORD,
    wintypes.DWORD,
]
VirtualAllocEx.restype = wintypes.LPVOID

WriteProcessMemory = kernel32.WriteProcessMemory
WriteProcessMemory.argtypes = [
    wintypes.HANDLE,
    wintypes.LPVOID,
    wintypes.LPCVOID,
    ctypes.c_size_t,
    ctypes.POINTER(ctypes.c_size_t),
]
WriteProcessMemory.restype = wintypes.BOOL

CreateRemoteThread = kernel32.CreateRemoteThread
CreateRemoteThread.argtypes = [
    wintypes.HANDLE,
    wintypes.LPVOID,
    ctypes.c_size_t,
    wintypes.LPVOID,
    wintypes.LPVOID,
    wintypes.DWORD,
    wintypes.LPDWORD,
]
CreateRemoteThread.restype = wintypes.HANDLE

WaitForSingleObject = kernel32.WaitForSingleObject
WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
WaitForSingleObject.restype = wintypes.DWORD

GetExitCodeThread = kernel32.GetExitCodeThread
GetExitCodeThread.argtypes = [wintypes.HANDLE, wintypes.LPDWORD]
GetExitCodeThread.restype = wintypes.BOOL

VirtualFreeEx = kernel32.VirtualFreeEx
VirtualFreeEx.argtypes = [
    wintypes.HANDLE,
    wintypes.LPVOID,
    ctypes.c_size_t,
    wintypes.DWORD,
]
VirtualFreeEx.restype = wintypes.BOOL

CloseHandle = kernel32.CloseHandle
CloseHandle.argtypes = [wintypes.HANDLE]
CloseHandle.restype = wintypes.BOOL

GetModuleHandleW = kernel32.GetModuleHandleW
GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
GetModuleHandleW.restype = wintypes.HMODULE

GetProcAddress = kernel32.GetProcAddress
GetProcAddress.argtypes = [wintypes.HMODULE, ctypes.c_char_p]
GetProcAddress.restype = wintypes.LPVOID

CreateToolhelp32Snapshot = kernel32.CreateToolhelp32Snapshot
CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
CreateToolhelp32Snapshot.restype = wintypes.HANDLE

Module32FirstW = kernel32.Module32FirstW
Module32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MODULEENTRY32W)]
Module32FirstW.restype = wintypes.BOOL

Module32NextW = kernel32.Module32NextW
Module32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MODULEENTRY32W)]
Module32NextW.restype = wintypes.BOOL


def _win32_error() -> str:
    err = ctypes.get_last_error()
    if not err:
        return "unknown"
    buf = ctypes.create_unicode_buffer(512)
    ctypes.windll.kernel32.FormatMessageW(0x00001000, None, err, 0, buf, 512, None)
    return f"{err}: {buf.value.strip() or 'unknown'}"


def _ptr(value) -> ctypes.c_void_p | None:
    if value is None:
        return None
    return ctypes.c_void_p(int(value) & ((1 << 64) - 1))


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
            if name == wanted or name == wanted.replace(".dll", ""):
                return int(entry.modBaseAddr or 0)
            if not Module32NextW(snap, ctypes.byref(entry)):
                break
    finally:
        CloseHandle(snap)
    return None


def _remote_load_library_w(h_process: wintypes.HANDLE, pid: int) -> int:
    """LoadLibraryW address inside the target process (not our process)."""
    local_k32 = GetModuleHandleW("kernel32.dll")
    if not local_k32:
        raise OSError(f"GetModuleHandleW(kernel32) failed. {_win32_error()}")

    local_ll = GetProcAddress(local_k32, b"LoadLibraryW")
    if not local_ll:
        raise OSError(f"GetProcAddress(LoadLibraryW) failed. {_win32_error()}")

    offset = int(local_ll) - int(local_k32)
    remote_k32 = _module_base_in_process(pid, "kernel32.dll")
    if remote_k32:
        return remote_k32 + offset

    # Fallback: same VA space (older Windows / same ASLR slot)
    return int(local_ll)


def try_inject_into_running_game(
    game_exe_path: str, dll_path: str, log=None
) -> tuple[bool, str]:
    dll_path = str(Path(dll_path).resolve())
    log and log(f"DLL: {dll_path}")
    log and log(f"Game: {game_exe_path}")

    if not Path(dll_path).is_file():
        return False, f"DLL not found: {dll_path}"

    if not is_game_running(game_exe_path):
        return False, "Game is not running. Start the game and wait until you are in-game."

    pid = find_game_pid(game_exe_path)
    if not pid:
        return False, "Could not find game process."

    log and log(f"PID {pid} — injecting...")
    ok, err = _inject_dll(pid, dll_path, log)
    if ok:
        log and log("SUCCESS: loaded in game.")
        return True, ""
    log and log(f"FAILED: {err}")
    return False, err


def _inject_dll(process_id: int, dll_path: str, log=None) -> tuple[bool, str]:
    h_process = h_thread = None
    alloc_ptr = None
    try:
        log and log("OpenProcess...")
        h_process = OpenProcess(PROCESS_ACCESS, False, process_id)
        if not _valid_handle(h_process):
            return (
                False,
                f"OpenProcess failed ({process_id}). Run loader as administrator. {_win32_error()}",
            )

        log and log("Resolve LoadLibraryW in target...")
        try:
            load_library = _remote_load_library_w(h_process, process_id)
        except OSError as ex:
            return False, str(ex)

        log and log("LoadLibraryW @ " + hex(int(load_library)))

        dll_bytes = (dll_path + "\0").encode("utf-16-le")
        size = len(dll_bytes)
        alloc = VirtualAllocEx(
            h_process, None, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE
        )
        alloc_ptr = _ptr(alloc)
        if not alloc_ptr:
            return False, f"VirtualAllocEx failed. {_win32_error()}"

        written = ctypes.c_size_t(0)
        if not WriteProcessMemory(
            h_process, alloc_ptr, dll_bytes, size, ctypes.byref(written)
        ):
            return False, f"WriteProcessMemory failed. {_win32_error()}"

        log and log("CreateRemoteThread(LoadLibraryW)...")
        h_thread = CreateRemoteThread(
            h_process,
            None,
            ctypes.c_size_t(0),
            _ptr(load_library),
            alloc_ptr,
            0,
            None,
        )
        if not _valid_handle(h_thread):
            return False, f"CreateRemoteThread failed. {_win32_error()}"

        log and log("Waiting for DLL load...")
        wait = WaitForSingleObject(h_thread, 15_000)
        exit_code = wintypes.DWORD()
        got_code = GetExitCodeThread(h_thread, ctypes.byref(exit_code))
        # STILL_ACTIVE (259) = thread finished but code not ready; non-zero = module handle
        if got_code and exit_code.value not in (0, 259):
            log and log("LoadLibrary OK (module @ " + hex(int(exit_code.value)) + ")")
            return True, ""
        if wait == 0 and got_code and exit_code.value == 0:
            return (
                False,
                "LoadLibrary returned NULL. Use x64 loader + x64 harvey.dll, run as admin.",
            )
        # Thread completed (wait==0) with code 0 or 259 — still treat as success if wait succeeded
        if wait == 0:
            log and log("LoadLibrary OK (injected)")
            return True, ""
        return False, "DLL load timed out. Try again in-game."
    finally:
        try:
            if h_thread and _valid_handle(h_thread):
                CloseHandle(h_thread)
            if alloc_ptr and h_process and _valid_handle(h_process):
                VirtualFreeEx(h_process, alloc_ptr, ctypes.c_size_t(0), MEM_RELEASE)
            if h_process and _valid_handle(h_process):
                CloseHandle(h_process)
        except (OSError, OverflowError, ctypes.ArgumentError):
            pass
