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


class GenerateLicensesRequest(BaseModel):
    duration_seconds: int = Field(ge=1, le=31536000, description="Min 1 second, max 365 days")
    quantity: int = Field(ge=1, le=100)
    note: str | None = None


class LicenseRow(BaseModel):
    id: int
    license_key: str
    duration_seconds: int
    duration_label: str
    status: str
    note: str | None
    username: str | None = None
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
