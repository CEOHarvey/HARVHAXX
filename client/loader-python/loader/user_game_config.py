import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class UserGameConfig:
    game_exe_path: str = ""

    @staticmethod
    def _path() -> Path:
        base = Path(os.environ.get("LOCALAPPDATA", "")) / "LicenseLoader"
        base.mkdir(parents=True, exist_ok=True)
        return base / "gameconfig.json"

    @classmethod
    def load(cls) -> "UserGameConfig":
        path = cls._path()
        if not path.is_file():
            return cls()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return cls(game_exe_path=str(data.get("GameExePath", "")))
        except (json.JSONDecodeError, OSError):
            return cls()

    def save(self) -> None:
        self._path().write_text(
            json.dumps({"GameExePath": self.game_exe_path}, indent=2),
            encoding="utf-8",
        )
