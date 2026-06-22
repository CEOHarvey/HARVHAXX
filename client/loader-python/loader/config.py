import json
from dataclasses import dataclass

from loader.inject_console import normalize_auto_close_ms
from loader.paths import app_dir, resource_path


@dataclass
class Settings:
    api_base_url: str = "https://harvhaxx-1-8t1l.onrender.com"
    hwid_salt: str = "change-this-salt-in-production"
    dll_path: str = "harvey.dll"
    use_embedded_payload: bool = True
    payload_file_name: str = "harvey.dll"
    ko_exe_file_name: str = "KO.exe"
    use_embedded_ko: bool = True
    show_inject_console: bool = True
    console_auto_close_ms: int = 2500
    default_game_exe_path: str = r"C:\Program Files (x86)\hyxd\Engine\Binaries\Win64\hyxd.exe"
    auto_start_game_after_login: bool = False
    exit_countdown_seconds: int = 10

    @classmethod
    def load(cls) -> "Settings":
        data: dict = {}
        bundled = resource_path("appsettings.json")
        if bundled.is_file():
            data = json.loads(bundled.read_text(encoding="utf-8"))
        external = app_dir() / "appsettings.json"
        if external.is_file():
            data = {**data, **json.loads(external.read_text(encoding="utf-8"))}
        return cls(
            api_base_url=data.get("ApiBaseUrl", cls.api_base_url),
            hwid_salt=data.get("HwidSalt", cls.hwid_salt),
            dll_path=data.get("DllPath", cls.dll_path),
            use_embedded_payload=data.get("UseEmbeddedPayload", True),
            payload_file_name=data.get("PayloadFileName", cls.payload_file_name),
            ko_exe_file_name=data.get("KoExeFileName", cls.ko_exe_file_name),
            use_embedded_ko=data.get("UseEmbeddedKo", True),
            show_inject_console=data.get("ShowInjectConsole", True),
            console_auto_close_ms=normalize_auto_close_ms(
                int(data.get("ConsoleAutoCloseMs", 2500))
            ),
            default_game_exe_path=data.get("DefaultGameExePath", cls.default_game_exe_path),
            auto_start_game_after_login=data.get("AutoStartGameAfterLogin", False),
            exit_countdown_seconds=int(data.get("ExitCountdownSeconds", 10)),
        )
