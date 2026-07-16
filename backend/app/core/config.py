import os
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    SECRET_KEY: str = "CHANGE-ME-IN-PRODUCTION-USE-OPENSSL-RAND-HEX-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "alt-spotify"
    MINIO_SECURE: bool = False

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    ALLOWED_HOSTS: str = "*"

    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    LOG_DIR: str = "logs"
    HSTS_ENABLED: bool = True

    CACHE_TTL: int = 300
    CACHE_ENABLED: bool = True

    COMPRESSION_ENABLED: bool = True
    COMPRESSION_MIN_SIZE: int = 1000

    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    LASTFM_API_KEY: str = ""
    LASTFM_API_SECRET: str = ""
    LASTFM_CALLBACK_URL: str = "http://localhost:3000/settings"

    @property
    def cors_origins_list(self) -> list[str]:
        return [s.strip() for s in self.CORS_ORIGINS.split(",") if s.strip()]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [s.strip() for s in self.ALLOWED_HOSTS.split(",") if s.strip()]


settings = Settings()
