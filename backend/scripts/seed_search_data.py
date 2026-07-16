#!/usr/bin/env python3
"""
Seed test data for advanced search features (R.1-R.5).
Creates tracks with BPM, key, mood, and lyrics for testing filters.

Usage:
    python scripts/seed_search_data.py              # Seed all data
    python scripts/seed_search_data.py --dry-run    # Show what would be created
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import async_session
from app.models.track import Track
from app.models.artist import Artist
from app.models.user import User
from sqlalchemy import select
import uuid


SEED_TRACKS = [
    {"title": "Summer Vibes", "bpm": 128, "key": "C", "mood": "happy,energetic", "genre": "Electronic", "duration_seconds": 210},
    {"title": "Midnight Rain", "bpm": 85, "key": "Am", "mood": "sad,melancholic", "genre": "Indie", "duration_seconds": 245},
    {"title": "Dance Floor", "bpm": 140, "key": "F", "mood": "energetic,party", "genre": "Electronic", "duration_seconds": 195},
    {"title": "Ocean Waves", "bpm": 72, "key": "G", "mood": "calm,peaceful", "genre": "Ambient", "duration_seconds": 320},
    {"title": "Rock Anthem", "bpm": 135, "key": "E", "mood": "energetic,uplifting", "genre": "Rock", "duration_seconds": 260},
    {"title": "Jazz Night", "bpm": 95, "key": "Bb", "mood": "chill,romantic", "genre": "Jazz", "duration_seconds": 285},
    {"title": "Hip Hop Beat", "bpm": 90, "key": "Dm", "mood": "confident,energetic", "genre": "Hip-Hop", "duration_seconds": 198},
    {"title": "Classical Dawn", "bpm": 60, "key": "D", "mood": "calm,uplifting", "genre": "Classical", "duration_seconds": 420},
    {"title": "Party Starter", "bpm": 150, "key": "A", "mood": "energetic,party,happy", "genre": "Pop", "duration_seconds": 180},
    {"title": "Late Night", "bpm": 78, "key": "Fm", "mood": "sad,reflective", "genre": "R&B", "duration_seconds": 234},
    {"title": "Workout Power", "bpm": 160, "key": "B", "mood": "energetic,motivational", "genre": "Electronic", "duration_seconds": 205},
    {"title": "Study Focus", "bpm": 65, "key": "Cm", "mood": "calm,focus", "genre": "Classical", "duration_seconds": 350},
    {"title": "Reggae Sunshine", "bpm": 82, "key": "G", "mood": "happy,chill", "genre": "Reggae", "duration_seconds": 240},
    {"title": "Metal Thunder", "bpm": 180, "key": "Em", "mood": "angry,energetic", "genre": "Metal", "duration_seconds": 275},
    {"title": "Latin Heat", "bpm": 110, "key": "A", "mood": "energetic,romantic", "genre": "Latin", "duration_seconds": 215},
    {"title": "Folk Tale", "bpm": 88, "key": "D", "mood": "calm,melancholic", "genre": "Folk", "duration_seconds": 295},
    {"title": "Country Road", "bpm": 100, "key": "G", "mood": "happy,uplifting", "genre": "Country", "duration_seconds": 225},
    {"title": "Punk Rush", "bpm": 170, "key": "E", "mood": "angry,energetic", "genre": "Punk", "duration_seconds": 165},
    {"title": "Lo-fi Dreams", "bpm": 75, "key": "C", "mood": "calm,sad", "genre": "Hip-Hop", "duration_seconds": 300},
    {"title": "Techno Machine", "bpm": 138, "key": "Fm", "mood": "dark,energetic", "genre": "Electronic", "duration_seconds": 340},
]

SEED_LYRICS = {
    "Summer Vibes": "[00:00.00]Dancing in the sunlight\n[00:03.50]Feeling alive tonight\n[00:07.00]Summer vibes are calling\n[00:10.50]Everything feels right",
    "Midnight Rain": "[00:00.00]Rain falls on the window\n[00:04.00]Midnight thoughts collide\n[00:08.00]Lonely but not broken\n[00:12.00]Tears I cannot hide",
    "Dance Floor": "[00:00.00]Get up on the dance floor\n[00:03.00]Move your body tonight\n[00:06.00]Feel the bass drop heavy\n[00:09.00]Everything's alright",
    "Rock Anthem": "[00:00.00]We will stand together\n[00:04.00]Fighting through the night\n[00:08.00]Rock and roll forever\n[00:12.00]We will win the fight",
}


async def seed(dry_run=False):
    async with async_session() as db:
        existing = await db.execute(select(Artist).limit(1))
        if not existing.scalars().first():
            print("No artists found. Create an artist first.")
            return

        artist = existing.scalars().first()
        print(f"Using artist: {artist.name} ({artist.id})")

        created = 0
        for track_data in SEED_TRACKS:
            title = track_data["title"]

            check = await db.execute(select(Track).where(Track.title == title))
            if check.scalars().first():
                print(f"  [skip] {title} already exists")
                continue

            lyrics = SEED_LYRICS.get(title)

            if dry_run:
                print(f"  [dry-run] Would create: {title} (bpm={track_data['bpm']}, key={track_data['key']}, mood={track_data['mood']})")
                continue

            track = Track(
                id=uuid.uuid4(),
                title=title,
                artist_id=artist.id,
                duration_seconds=track_data["duration_seconds"],
                genre=track_data.get("genre"),
                bpm=track_data.get("bpm"),
                key=track_data.get("key"),
                mood=track_data.get("mood"),
                lyrics_lrc=lyrics,
            )
            db.add(track)
            created += 1
            print(f"  [create] {title} (bpm={track_data['bpm']}, key={track_data['key']}, mood={track_data['mood']})")

        if not dry_run and created > 0:
            await db.commit()
            print(f"\nCreated {created} tracks with search metadata.")
        elif dry_run:
            print(f"\nWould create {len(SEED_TRACKS)} tracks.")
        else:
            print("\nAll tracks already exist.")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(seed(dry_run))
