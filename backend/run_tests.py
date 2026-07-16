#!/usr/bin/env python3
"""
Test runner for Alt-Spotify backend.
Usage:
    python run_tests.py              # Run all tests
    python run_tests.py -v           # Verbose mode
    python run_tests.py -k test_jam  # Run specific test
    python run_tests.py --cov        # With coverage report
"""

import subprocess
import sys


def main():
    args = [sys.executable, "-m", "pytest", "tests/", "-q", "--tb=short"]

    if "--cov" in sys.argv:
        args.extend(["--cov=app", "--cov-report=term-missing"])
        sys.argv.remove("--cov")

    extra = [a for a in sys.argv[1:] if a != "--cov"]
    args.extend(extra)

    print(f"Running: {' '.join(args)}\n")
    result = subprocess.run(args, cwd=__import__("os").path.dirname(__file__))
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
