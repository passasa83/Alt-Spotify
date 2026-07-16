#!/usr/bin/env python3
"""
Feature-based test runner for Alt-Spotify.

Usage:
    python scripts/run_features.py                  # All tests
    python scripts/run_features.py --feature L      # Audio player features (L.1-L.5)
    python scripts/run_features.py --feature P      # Smart playlists (P.1-P.4)
    python scripts/run_features.py --feature R      # Advanced search (R.1-R.5)
    python scripts/run_features.py --feature J      # JioSaavn/MusicBrainz
    python scripts/run_features.py --feature social # Social features
    python scripts/run_features.py --feature jam    # Jam sessions
    python scripts/run_features.py --only 105       # Only 105 tests (previous baseline)
    python scripts/run_features.py --verbose        # Verbose output
    python scripts/run_features.py --last-failed    # Re-run only previously failed tests
"""

import subprocess
import sys
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURE_MAP = {
    "L": {
        "name": "Lecteur Audio Avancé",
        "files": [],
        "keywords": ["test_player", "test_equalizer", "test_crossfade", "test_replaygain", "test_playback_rate"],
    },
    "P": {
        "name": "Playlists Intelligentes",
        "files": ["test_playlists.py"],
        "keywords": ["smart", "history", "top_", "duplicate"],
    },
    "R": {
        "name": "Recherche Avancée",
        "files": ["test_search.py", "test_search_filters.py"],
        "keywords": ["bpm", "key", "mood", "lyrics", "filter"],
    },
    "J": {
        "name": "JioSaavn + MusicBrainz",
        "files": ["test_jiosaavn.py"],
        "keywords": [],
    },
    "social": {
        "name": "Social & Follow",
        "files": ["test_social.py"],
        "keywords": [],
    },
    "jam": {
        "name": "Jam Sessions",
        "files": ["test_jam.py"],
        "keywords": [],
    },
    "auth": {
        "name": "Authentification",
        "files": ["test_auth.py"],
        "keywords": [],
    },
    "users": {
        "name": "Utilisateurs & Stats",
        "files": ["test_users.py", "test_stats.py"],
        "keywords": [],
    },
    "tracks": {
        "name": "Tracks & Upload",
        "files": ["test_tracks.py", "test_upload.py"],
        "keywords": [],
    },
    "artists_albums": {
        "name": "Artists & Albums",
        "files": ["test_artists.py", "test_albums.py"],
        "keywords": [],
    },
    "podcasts": {
        "name": "Podcasts",
        "files": ["test_podcasts.py"],
        "keywords": [],
    },
    "recommendations": {
        "name": "Recommandations",
        "files": ["test_recommendations.py"],
        "keywords": [],
    },
}

ALL_TEST_FILES = [
    "test_auth.py", "test_users.py", "test_stats.py", "test_artists.py",
    "test_albums.py", "test_tracks.py", "test_upload.py", "test_playlists.py",
    "test_search.py", "test_search_filters.py", "test_social.py", "test_jam.py",
    "test_jiosaavn.py", "test_podcasts.py", "test_recommendations.py",
]


def build_pytest_args(features=None, verbose=False, last_failed=False, only=None):
    args = [sys.executable, "-m", "pytest"]

    if last_failed:
        args.append("--last-failed")
    else:
        test_targets = []
        if features:
            for feat_key in features:
                feat = FEATURE_MAP.get(feat_key)
                if not feat:
                    print(f"Unknown feature: {feat_key}")
                    print(f"Available: {', '.join(FEATURE_MAP.keys())}")
                    sys.exit(1)
                print(f"  [{feat_key}] {feat['name']}")
                test_targets.extend(feat["files"])
            if not test_targets:
                for feat_key in features:
                    feat = FEATURE_MAP.get(feat_key, {})
                    for kw in feat.get("keywords", []):
                        args.extend(["-k", kw])
            else:
                for f in test_targets:
                    args.append(f"tests/{f}")
        else:
            args.append("tests/")

    if only:
        args.extend(["-x", f"--maxfail={only}"])

    if verbose:
        args.extend(["-v", "--tb=short"])
    else:
        args.extend(["-q", "--tb=short"])

    return args


def main():
    features = None
    verbose = False
    last_failed = False
    only = None

    args_list = sys.argv[1:]
    i = 0
    while i < len(args_list):
        if args_list[i] == "--feature" and i + 1 < len(args_list):
            if features is None:
                features = []
            features.append(args_list[i + 1])
            i += 2
        elif args_list[i] == "--verbose" or args_list[i] == "-v":
            verbose = True
            i += 1
        elif args_list[i] == "--last-failed":
            last_failed = True
            i += 1
        elif args_list[i] == "--only" and i + 1 < len(args_list):
            only = int(args_list[i + 1])
            i += 2
        elif args_list[i] == "--list":
            print("Available features:")
            for k, v in FEATURE_MAP.items():
                files = ", ".join(v["files"]) if v["files"] else "keywords only"
                print(f"  {k:15s} {v['name']:30s} ({files})")
            sys.exit(0)
        elif args_list[i] == "--help" or args_list[i] == "-h":
            print(__doc__)
            sys.exit(0)
        else:
            i += 1

    if features:
        print(f"\n{'='*50}")
        print(f"Running features: {', '.join(features)}")
        print(f"{'='*50}\n")
    elif last_failed:
        print("\nRe-running previously failed tests...\n")
    else:
        print(f"\n{'='*50}")
        print("Running ALL tests")
        print(f"{'='*50}\n")

    pytest_args = build_pytest_args(features, verbose, last_failed, only)
    print(f"Command: {' '.join(pytest_args)}\n")

    result = subprocess.run(pytest_args, cwd=BACKEND_DIR)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
