#!/usr/bin/env python3
"""
Seed demo data for manual testing.
Creates an admin user, artists, tracks with full metadata (BPM, key, mood, lyrics).

Usage:
    python scripts/seed_demo.py              # Seed all
    python scripts/seed_demo.py --dry-run    # Preview only
"""

import asyncio
import sys
import os
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import async_session
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.artist import Artist
from app.models.track import Track
from sqlalchemy import select


async def seed(dry_run=False):
    async with async_session() as db:
        # --- Admin user ---
        admin_check = await db.execute(select(User).where(User.email == "admin@altspotify.local"))
        if admin_check.scalars().first():
            print("[skip] Admin user already exists")
        else:
            admin = User(
                id=uuid.uuid4(),
                email="admin@altspotify.local",
                hashed_password=hash_password("Admin123!"),
                pseudo="admin",
                role=UserRole.ADMIN,
                is_active=True,
            )
            if not dry_run:
                db.add(admin)
                await db.flush()
            print(f"[create] Admin: admin@altspotify.local / Admin123!")

        # --- Test user ---
        user_check = await db.execute(select(User).where(User.email == "user@altspotify.local"))
        if user_check.scalars().first():
            print("[skip] Test user already exists")
        else:
            user = User(
                id=uuid.uuid4(),
                email="user@altspotify.local",
                hashed_password=hash_password("User123!"),
                pseudo="testuser",
                role=UserRole.USER,
                is_active=True,
            )
            if not dry_run:
                db.add(user)
                await db.flush()
            print(f"[create] User: user@altspotify.local / User123!")

        # --- Artists ---
        artists_data = [
            ("Queen", "British rock legends"),
            ("Daft Punk", "French electronic duo"),
            ("Nirvana", "Grunge pioneers"),
            ("Miles Davis", "Jazz trumpet legend"),
            ("Bad Bunny", "Latin trap superstar"),
        ]

        artist_ids = {}
        for name, bio in artists_data:
            check = await db.execute(select(Artist).where(Artist.name == name))
            existing = check.scalars().first()
            if existing:
                print(f"[skip] Artist: {name}")
                artist_ids[name] = existing.id
            else:
                artist = Artist(id=uuid.uuid4(), name=name, bio=bio)
                if not dry_run:
                    db.add(artist)
                    await db.flush()
                artist_ids[name] = artist.id
                print(f"[create] Artist: {name}")

        # --- Tracks with metadata ---
        tracks_data = [
            {"title": "Bohemian Rhapsody", "artist": "Queen", "bpm": 72, "key": "Bb", "mood": "epic,dramatic", "genre": "Rock", "duration": 354,
             "lyrics": "[00:00.00]Is this the real life\n[00:03.00]Is this just fantasy\n[00:07.00]Caught in a landslide\n[00:11.00]No escape from reality"},
            {"title": "One More Time", "artist": "Daft Punk", "bpm": 123, "key": "F", "mood": "happy,energetic", "genre": "Electronic", "duration": 320,
             "lyrics": "[00:00.00]One more time\n[00:04.00]We're gonna celebrate\n[00:08.00]One more time\n[00:12.00]We're gonna celebrate"},
            {"title": "Smells Like Teen Spirit", "artist": "Nirvana", "bpm": 117, "key": "F", "mood": "angry,energetic", "genre": "Rock", "duration": 301,
             "lyrics": "[00:00.00]Load up on guns\n[00:04.00]Bring your friends\n[00:08.00]It's fun to lose\n[00:12.00]And to pretend"},
            {"title": "So What", "artist": "Miles Davis", "bpm": 136, "key": "D", "mood": "cool,confident", "genre": "Jazz", "duration": 563,
             "lyrics": "[00:00.00]Instrumental\n[00:30.00]Saxophone solo\n[01:00.00]Trumpet improvisation"},
            {"title": "Tití Me Preguntó", "artist": "Bad Bunny", "bpm": 92, "key": "Am", "mood": "energetic,party", "genre": "Latin", "duration": 242,
             "lyrics": "[00:00.00]Tití me preguntó\n[00:03.00]Cuántos novios tuve\n[00:06.00]Le dije que muchos\n[00:09.00]Pero todos locos"},
        ]

        for t in tracks_data:
            check = await db.execute(select(Track).where(Track.title == t["title"]))
            if check.scalars().first():
                print(f"[skip] Track: {t['title']}")
                continue

            if not dry_run:
                track = Track(
                    id=uuid.uuid4(),
                    title=t["title"],
                    artist_id=artist_ids[t["artist"]],
                    duration_seconds=t["duration"],
                    genre=t["genre"],
                    bpm=t["bpm"],
                    key=t["key"],
                    mood=t["mood"],
                    lyrics_lrc=t.get("lyrics"),
                )
                db.add(track)
            print(f"[create] Track: {t['title']} (bpm={t['bpm']}, key={t['key']}, mood={t['mood']})")

        if not dry_run:
            await db.commit()
            print("\nDemo data seeded successfully!")
        else:
            print("\n(dry run — nothing was created)")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(seed(dry_run))
