import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize(
    "secret_key",
    ["", "changeme", "CHANGE-ME-IN-PRODUCTION-USE-OPENSSL-RAND-HEX-32", "change-me-to-a-random-secret-key", "short"],
)
def test_weak_secret_key_is_rejected(secret_key):
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(_env_file=None, SECRET_KEY=secret_key)


def test_strong_secret_key_is_accepted():
    settings = Settings(_env_file=None, SECRET_KEY="a" * 64)
    assert settings.SECRET_KEY == "a" * 64
