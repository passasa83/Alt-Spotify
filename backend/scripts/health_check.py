#!/usr/bin/env python3
"""
Quick health check for all services.

Usage:
    python scripts/health_check.py
"""

import subprocess
import sys
import urllib.request
import json


SERVICES = [
    ("Backend API", "http://localhost:8000/docs"),
    ("MinIO Console", "http://localhost:9001"),
    ("Meilisearch", "http://localhost:7700/health"),
    ("Frontend", "http://localhost:3000"),
    ("Prometheus", "http://localhost:9090"),
    ("Grafana", "http://localhost:3001"),
]


def main():
    print("=" * 50)
    print("  SERVICE HEALTH CHECK")
    print("=" * 50)

    all_ok = True

    for name, url in SERVICES:
        try:
            req = urllib.request.Request(url, method="GET")
            resp = urllib.request.urlopen(req, timeout=5)
            status = resp.getcode()
            if status < 400:
                print(f"  \033[92m\u2713\033[0m {name:20s} {url:40s} [{status}]")
            else:
                print(f"  \033[93m\u25a0\033[0m {name:20s} {url:40s} [{status}]")
                all_ok = False
        except Exception as e:
            print(f"  \033[91m\u2717\033[0m {name:20s} {url:40s} [DOWN]")
            all_ok = False

    # Docker containers
    print(f"\n{'='*50}")
    print("  DOCKER CONTAINERS")
    print(f"{'='*50}")
    result = subprocess.run(
        ["docker", "compose", "ps", "--format", "table {{.Name}}\t{{.Status}}\t{{.Ports}}"],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        print(result.stdout)
    else:
        print("  Could not reach Docker daemon")

    print("=" * 50)
    if all_ok:
        print("  All services healthy!")
    else:
        print("  Some services are down!")


if __name__ == "__main__":
    main()
