#!/usr/bin/env python3
"""
Test runner for Alt-Spotify backend.

Usage:
    python run_tests.py                          # All tests
    python run_tests.py --feature L              # Audio player (L.1-L.5)
    python run_tests.py --feature R              # Search filters (R.1-R.5)
    python run_tests.py --feature P              # Smart playlists (P.1-P.4)
    python run_tests.py --feature J              # JioSaavn/MusicBrainz
    python run_tests.py --feature social         # Social
    python run_tests.py --feature jam            # Jam sessions
    python run_tests.py -v                       # Verbose
    python run_tests.py --last-failed            # Re-run failed only
    python run_tests.py --list                   # List all features
"""

import subprocess
import sys
import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

FEATURE_MAP = {
    "L": {"name": "Lecteur Audio", "files": []},
    "P": {"name": "Playlists Intelligentes", "files": ["test_playlists.py"]},
    "R": {"name": "Recherche Avancée", "files": ["test_search.py", "test_search_filters.py"]},
    "J": {"name": "JioSaavn + MusicBrainz", "files": ["test_jiosaavn.py"]},
    "social": {"name": "Social", "files": ["test_social.py"]},
    "jam": {"name": "Jam Sessions", "files": ["test_jam.py"]},
    "auth": {"name": "Auth", "files": ["test_auth.py"]},
    "users": {"name": "Users & Stats", "files": ["test_users.py", "test_stats.py"]},
    "tracks": {"name": "Tracks", "files": ["test_tracks.py", "test_upload.py"]},
    "artists_albums": {"name": "Artists & Albums", "files": ["test_artists.py", "test_albums.py"]},
    "podcasts": {"name": "Podcasts", "files": ["test_podcasts.py"]},
    "recommendations": {"name": "Recommandations", "files": ["test_recommendations.py"]},
}


def main():
    features = []
    verbose = False
    last_failed = False
    show_list = False

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--feature" and i + 1 < len(args):
            features.append(args[i + 1])
            i += 2
        elif args[i] in ("-v", "--verbose"):
            verbose = True
            i += 1
        elif args[i] == "--last-failed":
            last_failed = True
            i += 1
        elif args[i] == "--list":
            show_list = True
            i += 1
        else:
            i += 1

    if show_list:
        print("Available features:")
        for k, v in FEATURE_MAP.items():
            files = ", ".join(v["files"]) if v["files"] else "(no dedicated tests yet)"
            print(f"  {k:15s} {v['name']:25s} {files}")
        sys.exit(0)

    pytest_args = [sys.executable, "-m", "pytest"]

    if last_failed:
        pytest_args.append("--last-failed")
    elif features:
        for f in features:
            feat = FEATURE_MAP.get(f)
            if not feat:
                print(f"Unknown feature: {f}. Use --list to see available.")
                sys.exit(1)
            for tf in feat["files"]:
                pytest_args.append(f"tests/{tf}")
    else:
        pytest_args.append("tests/")

    if verbose:
        pytest_args.extend(["-v", "--tb=short"])
    else:
        pytest_args.extend(["-q", "--tb=short"])

    label = ", ".join(features) if features else "ALL"
    print(f"[{label}] {' '.join(pytest_args[2:])}\n")

    result = subprocess.run(pytest_args, cwd=BACKEND_DIR)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
