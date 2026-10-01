"""Run the API locally without Docker: SQLite file + in-memory Redis.

    python scripts/dev_server.py

Postgres, Redis, MinIO and Meilisearch are not needed: the database is
``local-dev.db`` next to this backend, Redis is faked, search and object
storage degrade gracefully. Pair it with ``npm run dev`` in frontend/ and
open http://localhost:5173. The first account created becomes admin.
"""

import os
import secrets
import sqlite3
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
LOCAL_DIR = BACKEND_DIR / ".local-dev"
LOCAL_DIR.mkdir(exist_ok=True)

# A stable random key so tokens survive restarts; never reused elsewhere.
key_file = LOCAL_DIR / "secret_key"
if not key_file.exists():
    key_file.write_text(secrets.token_hex(32))

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{(LOCAL_DIR / 'local-dev.db').as_posix()}")
os.environ.setdefault("SECRET_KEY", key_file.read_text().strip())
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("HSTS_ENABLED", "false")
os.environ.setdefault("MEILISEARCH_URL", "http://127.0.0.1:1")  # fail fast: no search server
os.environ.setdefault("MUSIC_SCAN_DIR", str(LOCAL_DIR / "music"))
os.environ.setdefault("MUSIC_DOWNLOAD_DIR", str(LOCAL_DIR / "downloads"))
os.environ.setdefault("LOG_FORMAT", "console")
(LOCAL_DIR / "music").mkdir(exist_ok=True)
(LOCAL_DIR / "downloads").mkdir(exist_ok=True)

sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

import fakeredis  # noqa: E402
import sqlalchemy as sa  # noqa: E402
import uvicorn  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID  # noqa: E402

import app.core.redis as app_redis  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.main import app  # noqa: E402  (imports every model)

# Same PostgreSQL -> SQLite type mapping as the test suite.
sqlite3.register_adapter(uuid.UUID, lambda u: u.hex)
for table in Base.metadata.tables.values():
    for column in table.columns:
        if isinstance(column.type, PG_UUID):
            column.type = sa.String(36)
        elif isinstance(column.type, (JSONB, sa.ARRAY)):
            column.type = sa.JSON()

app_redis.redis_pool = fakeredis.FakeAsyncRedis(decode_responses=True)

if __name__ == "__main__":
    print(f"Local API on http://127.0.0.1:8000 (data in {LOCAL_DIR})")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
