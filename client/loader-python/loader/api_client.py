from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

import requests

from loader.config import Settings


@dataclass
class TokenResult:
    access_token: str
    username: str


@dataclass
class LicenseStatus:
    valid: bool
    status: str
    expires_at: Optional[datetime]
    seconds_left: int
    message: str


@dataclass
class PlayerBindResult:
    allowed: bool
    bound_name: str | None
    current_name: str | None
    message: str
    is_new_bind: bool = False


@dataclass
class PlayerAccount:
    bound_player_name: str | None
    bound_player_at: Optional[datetime]


class ApiClient:
    # (connect seconds, read seconds) — faster fail if API is down
    _TIMEOUT = (6, 28)

    def __init__(self, settings: Settings):
        self._base = settings.api_base_url.rstrip("/") + "/"
        self._session = requests.Session()
        self._session.headers["Connection"] = "keep-alive"
        self._token: Optional[str] = None

    def warmup(self) -> None:
        """Wake Render / warm TLS before user logs in."""
        try:
            self._session.get(self._base + "health", timeout=(4, 10))
        except requests.RequestException:
            pass

    def set_token(self, token: Optional[str]) -> None:
        self._token = token
        if token:
            self._session.headers["Authorization"] = f"Bearer {token}"
        else:
            self._session.headers.pop("Authorization", None)

    def register(
        self, username: str, email: str, password: str, hwid_hash: str
    ) -> TokenResult:
        return self._token_from(
            self._post(
                "auth/register",
                {
                    "username": username,
                    "email": email,
                    "password": password,
                    "hwid_hash": hwid_hash,
                },
            )
        )

    def login(self, username: str, password: str, hwid_hash: str) -> TokenResult:
        return self._token_from(
            self._post(
                "auth/login",
                {"username": username, "password": password, "hwid_hash": hwid_hash},
            )
        )

    def login_and_validate(
        self, username: str, password: str, hwid_hash: str
    ) -> tuple[TokenResult, LicenseStatus]:
        token = self.login(username, password, hwid_hash)
        self.set_token(token.access_token)
        status = self.validate(hwid_hash)
        return token, status

    def logout(self) -> None:
        try:
            self._session.post(self._base + "auth/logout", timeout=30)
        except requests.RequestException:
            pass

    def activate(self, license_key: str, hwid_hash: str) -> LicenseStatus:
        return self._license_from(
            self._post(
                "license/activate",
                {"license_key": license_key, "hwid_hash": hwid_hash},
            )
        )

    def extend_license(self, license_key: str, hwid_hash: str) -> LicenseStatus:
        return self._license_from(
            self._post(
                "license/extend",
                {"license_key": license_key, "hwid_hash": hwid_hash},
            )
        )

    def validate(self, hwid_hash: str) -> LicenseStatus:
        return self._license_from(
            self._post("license/validate", {"hwid_hash": hwid_hash})
        )

    def get_player_account(self) -> PlayerAccount:
        data = self._get("player/account")
        bound_at = data.get("bound_player_at")
        bound_dt = None
        if bound_at:
            text = str(bound_at).replace("Z", "+00:00")
            try:
                bound_dt = datetime.fromisoformat(text)
            except ValueError:
                bound_dt = None
        name = data.get("bound_player_name")
        clean = str(name).strip() if name else None
        return PlayerAccount(
            bound_player_name=clean or None,
            bound_player_at=bound_dt,
        )

    def bind_player(self, player_name: str) -> PlayerBindResult:
        data = self._post("player/bind", {"player_name": player_name})
        return PlayerBindResult(
            allowed=bool(data.get("allowed", False)),
            bound_name=data.get("bound_name"),
            current_name=data.get("current_name"),
            message=str(data.get("message", "")),
            is_new_bind=bool(data.get("is_new_bind", False)),
        )

    def _get(self, path: str) -> dict[str, Any]:
        try:
            res = self._session.get(self._base + path, timeout=self._TIMEOUT)
        except requests.RequestException as ex:
            raise requests.HTTPError(f"Cannot reach API ({self._base}): {ex}") from ex
        if not res.ok:
            self._raise_api_error(res)
        try:
            return res.json()
        except ValueError as ex:
            raise requests.HTTPError(f"{res.status_code}: Invalid JSON response") from ex

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        try:
            res = self._session.post(self._base + path, json=body, timeout=self._TIMEOUT)
        except requests.RequestException as ex:
            raise requests.HTTPError(f"Cannot reach API ({self._base}): {ex}") from ex
        if not res.ok:
            self._raise_api_error(res)
        try:
            return res.json()
        except ValueError as ex:
            raise requests.HTTPError(f"{res.status_code}: Invalid JSON response") from ex

    @staticmethod
    def _raise_api_error(res: requests.Response) -> None:
        msg = f"{res.status_code}"
        try:
            data = res.json()
            detail = data.get("detail")
            if isinstance(detail, str) and detail:
                msg = f"{res.status_code}: {detail}"
            elif isinstance(detail, list) and detail:
                parts = []
                for item in detail[:3]:
                    if isinstance(item, dict):
                        parts.append(str(item.get("msg", item)))
                    else:
                        parts.append(str(item))
                msg = f"{res.status_code}: " + "; ".join(parts)
        except ValueError:
            if res.text:
                msg = f"{res.status_code}: {res.text[:300]}"
        raise requests.HTTPError(msg)

    @staticmethod
    def _token_from(data: dict[str, Any]) -> TokenResult:
        return TokenResult(
            access_token=data["access_token"],
            username=data.get("username", ""),
        )

    @staticmethod
    def _license_from(data: dict[str, Any]) -> LicenseStatus:
        expires = data.get("expires_at")
        expires_at = None
        if expires:
            text = str(expires).replace("Z", "+00:00")
            try:
                expires_at = datetime.fromisoformat(text)
            except ValueError:
                expires_at = None
        raw_left = data.get("seconds_left", 0)
        try:
            seconds_left = int(raw_left) if raw_left is not None else 0
        except (TypeError, ValueError):
            seconds_left = 0
        return LicenseStatus(
            valid=bool(data.get("valid")),
            status=str(data.get("status", "")),
            expires_at=expires_at,
            seconds_left=seconds_left,
            message=str(data.get("message", "")),
        )
