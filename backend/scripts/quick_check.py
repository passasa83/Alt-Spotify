#!/usr/bin/env python3
"""
Quick smoke test — runs 1 test per feature to verify nothing is broken.
Use this after a deploy or before a commit.

Usage:
    python scripts/quick_check.py
"""

import subprocess
import sys
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SMOKE_TESTS = [
    ("auth", "tests/test_auth.py::test_register_success"),
    ("users", "tests/test_users.py::test_get_me"),
    ("tracks", "tests/test_tracks.py::test_create_track"),
    ("playlists", "tests/test_playlists.py::test_create_playlist"),
    ("search", "tests/test_search_filters.py::test_search_by_bpm_range"),
    ("social", "tests/test_social.py::test_follow_user"),
    ("jam", "tests/test_jam.py::test_create_session"),
]


def main():
    print("=" * 50)
    print("  QUICK SMOKE TEST")
    print("=" * 50)

    failed = []
    passed = 0

    for name, test_path in SMOKE_TESTS:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", test_path, "-q", "--tb=line"],
            cwd=BACKEND_DIR,
            capture_output=True,
            text=True,
        )
        status = "PASS" if result.returncode == 0 else "FAIL"
        symbol = "\033[92m\u2713\033[0m" if status == "PASS" else "\033[91m\u2717\033[0m"
        print(f"  {symbol} {name:15s} {status}")

        if status == "FAIL":
            failed.append(name)
        else:
            passed += 1

    print(f"\n{'=' * 50}")
    print(f"  {passed}/{len(SMOKE_TESTS)} passed")
    if failed:
        print(f"  Failed: {', '.join(failed)}")
        sys.exit(1)
    else:
        print("  All clear!")
        sys.exit(0)


if __name__ == "__main__":
    main()
