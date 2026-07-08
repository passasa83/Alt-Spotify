import re

from fastapi import UploadFile

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
SPECIAL_CHARS = re.compile(r"[!@#$%^&*(),.?\":{}|<>]")
HTML_TAG_REGEX = re.compile(r"<[^>]*>")


def validate_email(email: str) -> bool:
    return bool(EMAIL_REGEX.match(email))


def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain an uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain a lowercase letter"
    if not re.search(r"\d", password):
        return False, "Password must contain a digit"
    if not SPECIAL_CHARS.search(password):
        return False, "Password must contain a special character"
    return True, ""


def sanitize_string(value: str, max_length: int = 1000) -> str:
    value = HTML_TAG_REGEX.sub("", value)
    value = value.strip()
    if len(value) > max_length:
        value = value[:max_length]
    return value


ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/flac", "audio/ogg", "audio/mp4", "audio/x-m4a"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def validate_file_upload(
    file: UploadFile,
    allowed_types: set[str] | None = None,
    max_size: int = 100 * 1024 * 1024,
) -> tuple[bool, str]:
    if allowed_types and file.content_type not in allowed_types:
        return False, f"Unsupported file type: {file.content_type}"
    return True, ""
