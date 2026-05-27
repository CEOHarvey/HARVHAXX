from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-secret-change-in-production"
    admin_username: str = "admin"
    admin_password: str = "admin123"
    database_url: str = "sqlite:///./license.db"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Discord webhooks — one URL per channel (leave empty to disable that log)
    discord_webhook_expired: str = ""
    discord_webhook_active: str = ""
    discord_webhook_hwid_reset: str = ""
    # Legacy alias → expired channel
    discord_webhook_url: str = ""

    # HWID policy
    # Max devices auto-bound per user account (no request workflow).
    # Set to 0 for unlimited.
    max_hwids_per_user: int = 0

    @property
    def discord_webhook_expired_resolved(self) -> str:
        return self.discord_webhook_expired.strip() or self.discord_webhook_url.strip()

    @property
    def database_url_resolved(self) -> str:
        """Normalize Render/Heroku postgres:// URLs for SQLAlchemy + psycopg2."""
        url = (self.database_url or "").strip()
        if not url:
            return "sqlite:///./license.db"
        if url.startswith("postgres://"):
            return "postgresql+psycopg2://" + url[len("postgres://") :]
        if url.startswith("postgresql://") and "+psycopg2" not in url and "+psycopg" not in url:
            return "postgresql+psycopg2://" + url[len("postgresql://") :]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        origins: list[str] = []
        for part in self.cors_origins.replace(";", ",").split(","):
            o = part.strip().rstrip("/")
            if o:
                origins.append(o)
        return origins


settings = Settings()
