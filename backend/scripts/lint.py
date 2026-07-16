#!/usr/bin/env python3
"""
Lint and type-check the backend code.

Usage:
    python scripts/lint.py           # Run all checks
    python scripts/lint.py --fix     # Auto-fix where possible
"""

import subprocess
import sys
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(cmd, label):
    print(f"\n{'='*50}")
    print(f"  {label}")
    print(f"{'='*50}")
    result = subprocess.run(cmd, cwd=BACKEND_DIR)
    return result.returncode


def main():
    fix = "--fix" in sys.argv
    errors = 0

    # Ruff lint
    ruff_cmd = [sys.executable, "-m", "ruff", "check", "app/", "tests/"]
    if fix:
        ruff_cmd.append("--fix")
    errors += run(ruff_cmd, "Ruff Lint")

    # Ruff format check
    format_cmd = [sys.executable, "-m", "ruff", "format", "--check", "app/", "tests/"]
    if fix:
        format_cmd = [sys.executable, "-m", "ruff", "format", "app/", "tests/"]
    errors += run(format_cmd, "Ruff Format")

    # Type check with mypy (optional, may not be installed)
    try:
        mypy_cmd = [sys.executable, "-m", "mypy", "app/", "--ignore-missing-imports"]
        errors += run(mypy_cmd, "MyPy Type Check")
    except FileNotFoundError:
        print("\n[skip] mypy not installed")

    print(f"\n{'='*50}")
    if errors:
        print("  Some checks failed!")
        sys.exit(1)
    else:
        print("  All checks passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
