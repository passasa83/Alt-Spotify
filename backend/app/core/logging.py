import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import structlog

SENSITIVE_FIELDS = frozenset({"password", "token", "authorization", "secret", "hashed_password"})


def mask_sensitive_data(logger, method_name, event_dict):
    for key in list(event_dict.keys()):
        if key.lower() in SENSITIVE_FIELDS:
            value = event_dict[key]
            if isinstance(value, str) and len(value) > 8:
                event_dict[key] = value[:4] + "*" * (len(value) - 8) + value[-4:]
            elif isinstance(value, str):
                event_dict[key] = "****"
    return event_dict


def setup_logging() -> None:
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_format = os.environ.get("LOG_FORMAT", "json").lower()
    log_dir = os.environ.get("LOG_DIR", "logs")

    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(getattr(logging, log_level, logging.INFO))

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        mask_sensitive_data,
    ]

    if log_format == "json":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.processors.UnicodeDecoder(),
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level, logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # File handler - general app log
    app_handler = RotatingFileHandler(
        log_path / "app.log", maxBytes=10 * 1024 * 1024, backupCount=5
    )
    app_handler.setLevel(getattr(logging, log_level, logging.INFO))

    # File handler - access log
    access_handler = RotatingFileHandler(
        log_path / "access.log", maxBytes=10 * 1024 * 1024, backupCount=5
    )
    access_handler.setLevel(logging.INFO)

    # File handler - error log
    error_handler = RotatingFileHandler(
        log_path / "error.log", maxBytes=10 * 1024 * 1024, backupCount=5
    )
    error_handler.setLevel(logging.ERROR)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, log_level, logging.INFO))

    if log_format == "json":
        file_formatter = logging.Formatter("%(message)s")
    else:
        file_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    app_handler.setFormatter(file_formatter)
    access_handler.setFormatter(file_formatter)
    error_handler.setFormatter(file_formatter)
    console_handler.setFormatter(file_formatter)

    root_logger.addHandler(app_handler)
    root_logger.addHandler(access_handler)
    root_logger.addHandler(error_handler)
    root_logger.addHandler(console_handler)

    # Create named loggers for different concerns
    access_logger = logging.getLogger("access")
    access_logger.addHandler(access_handler)
    access_logger.propagate = False

    error_logger = logging.getLogger("error")
    error_logger.addHandler(error_handler)
    error_logger.propagate = False


def get_access_logger() -> logging.Logger:
    return logging.getLogger("access")


def get_error_logger() -> logging.Logger:
    return logging.getLogger("error")
