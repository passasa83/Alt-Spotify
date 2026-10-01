from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Values shipped in the example files: a server running with one of them
# accepts JWTs forged by anyone who has read this repository.
_PLACEHOLDER_SECRET_KEYS = {
    "changeme",
    "change-me-to-a-random-secret-key",
    "change-me-in-production-use-openssl-rand-hex-32",
}
_MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PROJECT_NAME: str = "Alt Spotify"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/alt_spotify"
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 365

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "alt-spotify"
    MINIO_SECURE: bool = False

    MEILISEARCH_URL: str = "http://meilisearch:7700"
    MEILISEARCH_MASTER_KEY: str = "changeme"

    SPOTIFY_CLIENT_ID: str | None = None
    SPOTIFY_CLIENT_SECRET: str | None = None

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    ALLOWED_HOSTS: str = "*"
    BASE_URL: str = "http://localhost:3000"

    # When False, only the very first account (which becomes admin) can be
    # created without an invitation.
    OPEN_REGISTRATION: bool = False

    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    LOG_DIR: str = "logs"
    HSTS_ENABLED: bool = True
    # Bearer token for Prometheus to scrape /monitoring/metrics (admins can
    # always read it). Empty: admins only.
    METRICS_TOKEN: str = ""

    CACHE_TTL: int = 300
    CACHE_ENABLED: bool = True

    COMPRESSION_ENABLED: bool = True
    COMPRESSION_MIN_SIZE: int = 1000

    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    LASTFM_API_KEY: str = ""
    LASTFM_API_SECRET: str = ""
    LASTFM_CALLBACK_URL: str = "http://localhost:3000/settings"

    @model_validator(mode="after")
    def _check_secret_key(self) -> "Settings":
        key = self.SECRET_KEY.strip()
        if key.lower() in _PLACEHOLDER_SECRET_KEYS or len(key) < _MIN_SECRET_KEY_LENGTH:
            raise ValueError(
                f"SECRET_KEY must be a random value of at least {_MIN_SECRET_KEY_LENGTH} characters "
                "(generate one with: openssl rand -hex 32)"
            )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [s.strip() for s in self.CORS_ORIGINS.split(",") if s.strip()]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [s.strip() for s in self.ALLOWED_HOSTS.split(",") if s.strip()]


settings = Settings()
