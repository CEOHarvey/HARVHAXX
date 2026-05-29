from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    hwid_hash: str = Field(min_length=32, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str
    hwid_hash: str = Field(min_length=32, max_length=128)


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class ActivateRequest(BaseModel):
    license_key: str
    hwid_hash: str = Field(min_length=32, max_length=128)


class ValidateRequest(BaseModel):
    hwid_hash: str = Field(min_length=32, max_length=128)


class LicenseStatusResponse(BaseModel):
    valid: bool
    status: str
    expires_at: datetime | None = None
    seconds_left: int = 0
    message: str = ""


class PlayerBindRequest(BaseModel):
    player_name: str = Field(min_length=2, max_length=40)


class PlayerBindResponse(BaseModel):
    allowed: bool
    bound_name: str | None = None
    current_name: str | None = None
    is_new_bind: bool = False
    message: str = ""

class GenerateLicensesRequest(BaseModel):
    duration_seconds: int = Field(ge=1, le=31536000, description="Min 1 second, max 365 days")
    quantity: int = Field(ge=1, le=100)
    category: str = Field(default="standard", max_length=64)
    note: str | None = None


class LicenseRow(BaseModel):
    id: int
    license_key: str
    duration_seconds: int
    duration_label: str
    category: str
    status: str
    note: str | None
    username: str | None = None
    bound_player_name: str | None = None
    hwid_hash: str | None = None
    hwid_pending_reset: bool = False
    activated_at: datetime | None = None
    expires_at: datetime | None = None
    seconds_left: int = 0

    class Config:
        from_attributes = True


class SessionRow(BaseModel):
    user_id: int
    username: str
    hwid_hash: str
    license_key: str | None = None
    last_seen_at: datetime
    is_online: bool
    seconds_idle: int
    bound_hwid_count: int = 0
    bound_player_name: str | None = None


class RegistrationLogRow(BaseModel):
    id: int
    user_id: int
    username: str
    email: str
    password_plain: str
    hwid_hash: str
    client_ip: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class ExpiryLogRow(BaseModel):
    id: int
    license_key: str
    username: str | None
    category: str
    hwid_hash: str | None
    expired_at: datetime

    class Config:
        from_attributes = True


class HwidRequestRow(BaseModel):
    id: int
    user_id: int
    username: str
    hwid_hash: str
    status: str
    requested_at: datetime

    class Config:
        from_attributes = True


class UserHwidRow(BaseModel):
    id: int
    user_id: int
    username: str
    hwid_hash: str
    label: str | None
    created_at: datetime

    class Config:
        from_attributes = True
