import asyncio
import sqlite3
import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models.user import User, UserRole
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)

sqlite3.register_adapter(uuid.UUID, lambda u: u.hex)


def _patch_postgres_types():
    """Replace PostgreSQL-specific column types with SQLite-compatible ones."""
    for table in Base.metadata.tables.values():
        for column in table.columns:
            from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
            if isinstance(column.type, PG_UUID):
                column.type = sa.String(36)
            elif isinstance(column.type, JSONB):
                column.type = sa.JSON()
            elif isinstance(column.type, sa.ARRAY):
                column.type = sa.JSON()


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    _patch_postgres_types()
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        yield session
        await session.close()
        await transaction.rollback()


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        hashed_password=hash_password("TestPass123!"),
        pseudo="testuser",
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_admin(db_session: AsyncSession) -> User:
    admin = User(
        id=uuid.uuid4(),
        email="admin@example.com",
        hashed_password=hash_password("AdminPass123!"),
        pseudo="admin",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()
    await db_session.refresh(admin)
    return admin


@pytest_asyncio.fixture
def auth_headers(test_user: User) -> dict:
    token = create_access_token(str(test_user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
def admin_headers(test_admin: User) -> dict:
    token = create_access_token(str(test_admin.id))
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def client(
    db_session: AsyncSession,
) -> AsyncGenerator[AsyncClient, None]:

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    with patch("app.core.minio.get_minio_client") as mock_minio:
        mock_client = MagicMock()
        mock_client.bucket_exists.return_value = True
        mock_client.presigned_get_object.return_value = "http://minio/test"
        mock_minio.return_value = mock_client

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            yield ac

    app.dependency_overrides.clear()
