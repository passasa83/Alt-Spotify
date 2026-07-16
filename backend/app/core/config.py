import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
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

    MEILISEARCH_URL: str = "http://meilisearch:7700"
    MEILISEARCH_MASTER_KEY: str = "changeme"

    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Security / logging / rate-limit settings
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    LOG_DIR: str = "logs"
    ALLOWED_HOSTS: list[str] = ["*"]
    HSTS_ENABLED: bool = True

    # Cache settings
    CACHE_TTL: int = 300
    CACHE_ENABLED: bool = True

    # Compression settings
    COMPRESSION_ENABLED: bool = True
    COMPRESSION_MIN_SIZE: int = 1000

    # Database pool settings
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    @classmethod
    def _parse_list(cls, v: str | list) -> list[str]:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @classmethod
    def _parse_bool(cls, v: str | bool) -> bool:
        if isinstance(v, bool):
            return v
        return v.lower() in ("true", "1", "yes")

    def model_post_init(self, __context):
        env_cors = os.environ.get("CORS_ORIGINS")
        if env_cors:
            self.CORS_ORIGINS = self._parse_list(env_cors)
        env_hosts = os.environ.get("ALLOWED_HOSTS")
        if env_hosts:
            self.ALLOWED_HOSTS = self._parse_list(env_hosts)
        env_rl = os.environ.get("RATE_LIMIT_ENABLED")
        if env_rl is not None:
            self.RATE_LIMIT_ENABLED = self._parse_bool(env_rl)
        env_hsts = os.environ.get("HSTS_ENABLED")
        if env_hsts is not None:
            self.HSTS_ENABLED = self._parse_bool(env_hsts)


settings = Settings()
