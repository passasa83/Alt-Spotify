#!/usr/bin/env python3
"""
Run tests with coverage report.

Usage:
    python scripts/coverage_report.py              # Full coverage
    python scripts/coverage_report.py --feature R  # Coverage for search features only
"""

import subprocess
import sys
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    feature = None
    if "--feature" in sys.argv:
        idx = sys.argv.index("--feature")
        if idx + 1 < len(sys.argv):
            feature = sys.argv[idx + 1]

    pytest_args = [
        sys.executable, "-m", "pytest",
        "--cov=app",
        "--cov-report=term-missing",
        "--cov-report=html:htmlcov",
        "-q", "--tb=short",
    ]

    if feature:
        from scripts.run_features import FEATURE_MAP
        feat = FEATURE_MAP.get(feature)
        if feat:
            for f in feat["files"]:
                pytest_args.append(f"tests/{f}")
            print(f"Coverage for: {feat['name']}")
        else:
            print(f"Unknown feature: {feature}")
            sys.exit(1)
    else:
        pytest_args.append("tests/")
        print("Full coverage report")

    print(f"Running: {' '.join(pytest_args)}\n")
    result = subprocess.run(pytest_args, cwd=BACKEND_DIR)

    if result.returncode == 0:
        print(f"\nHTML report: {BACKEND_DIR}/htmlcov/index.html")

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
