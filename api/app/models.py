import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LicenseStatus(str, enum.Enum):
    unused = "unused"
    active = "active"
    expired = "expired"
    revoked = "revoked"


class HwidBindRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    activations = relationship("Activation", back_populates="user")
    session = relationship("UserSession", back_populates="user", uselist=False)
    hwids = relationship("UserHwid", back_populates="user", cascade="all, delete-orphan")
    hwid_requests = relationship("HwidBindRequest", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    hwid_hash: Mapped[str] = mapped_column(String(128))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="session")


class UserHwid(Base):
    """Admin-approved devices for this account (switch PCs, not simultaneous use)."""

    __tablename__ = "user_hwids"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    hwid_hash: Mapped[str] = mapped_column(String(128), index=True)
    label: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="hwids")


class HwidBindRequest(Base):
    __tablename__ = "hwid_bind_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    hwid_hash: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[HwidBindRequestStatus] = mapped_column(
        Enum(HwidBindRequestStatus, native_enum=False),
        default=HwidBindRequestStatus.pending,
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="hwid_requests")


class License(Base):
    __tablename__ = "licenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    license_key: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=86400)
    duration_days: Mapped[int] = mapped_column(Integer, default=1)
    category: Mapped[str] = mapped_column(String(64), default="standard", index=True)
    status: Mapped[LicenseStatus] = mapped_column(
        Enum(LicenseStatus, native_enum=False),
        default=LicenseStatus.unused,
    )
    note: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    activation = relationship("Activation", back_populates="license", uselist=False)


class Activation(Base):
    __tablename__ = "activations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    license_id: Mapped[int] = mapped_column(ForeignKey("licenses.id"), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    hwid_hash: Mapped[str] = mapped_column(String(128))
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expiry_notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    license = relationship("License", back_populates="activation")
    user = relationship("User", back_populates="activations")


class ExpiryLog(Base):
    __tablename__ = "expiry_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    license_id: Mapped[int] = mapped_column(ForeignKey("licenses.id"), index=True)
    license_key: Mapped[str] = mapped_column(String(48))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    category: Mapped[str] = mapped_column(String(64), default="standard")
    hwid_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    expired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
