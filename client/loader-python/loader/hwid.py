import hashlib
import os
import subprocess
import winreg


def _machine_guid() -> str:
    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography"
        )
        value, _ = winreg.QueryValueEx(key, "MachineGuid")
        winreg.CloseKey(key)
        return str(value)
    except OSError:
        return "unknown-guid"


def _cpu_id() -> str:
    try:
        out = subprocess.check_output(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId",
            ],
            text=True,
            timeout=8,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        pid = out.strip()
        if pid:
            return pid
    except (subprocess.SubprocessError, OSError):
        pass
    return os.environ.get("COMPUTERNAME", "unknown-cpu")


def compute_hash(salt: str) -> str:
    raw = f"{_machine_guid()}|{_cpu_id()}|{salt}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest().lower()
