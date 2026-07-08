import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


async def parse_rss_feed(feed_url: str) -> dict[str, Any]:
    import feedparser

    feed = feedparser.parse(feed_url)

    if feed.bozo and not feed.entries:
        raise ValueError(f"Failed to parse feed: {feed.bozo_exception}")

    feed_info = feed.get("feed", {})
    podcast_data = {
        "title": feed_info.get("title", "Unknown"),
        "description": feed_info.get("summary", ""),
        "image_url": None,
        "author": feed_info.get("author", None),
        "feed_url": feed_url,
        "categories": [],
        "episodes": [],
    }

    image = feed_info.get("image", {})
    if isinstance(image, dict):
        podcast_data["image_url"] = image.get("href") or image.get("url")
    elif feed_info.get("logo"):
        podcast_data["image_url"] = feed_info.get("logo").get("href")

    tags = feed_info.get("tags", [])
    podcast_data["categories"] = [tag.get("term", "") for tag in tags if tag.get("term")]

    for i, entry in enumerate(feed.entries, 1):
        audio_url = None
        for link in entry.get("links", []):
            if link.get("type", "").startswith("audio"):
                audio_url = link.get("href")
                break

        if not audio_url:
            enclosures = entry.get("enclosures", [])
            for enc in enclosures:
                if enc.get("type", "").startswith("audio"):
                    audio_url = enc.get("href")
                    break

        duration = 0
        raw_duration = entry.get("itunes_duration", "0")
        if raw_duration:
            parts = str(raw_duration).split(":")
            try:
                if len(parts) == 3:
                    duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                elif len(parts) == 2:
                    duration = int(parts[0]) * 60 + int(parts[1])
                else:
                    duration = int(parts[0])
            except (ValueError, IndexError):
                duration = 0

        published_at = None
        if entry.get("published_parsed"):
            published_at = datetime(*entry["published_parsed"][:6])
        elif entry.get("updated_parsed"):
            published_at = datetime(*entry["updated_parsed"][:6])

        season = None
        if entry.get("itunes_season"):
            try:
                season = int(entry["itunes_season"])
            except (ValueError, TypeError):
                pass

        episode_num = None
        if entry.get("itunes_episode"):
            try:
                episode_num = int(entry["itunes_episode"])
            except (ValueError, TypeError):
                pass
        else:
            episode_num = i

        podcast_data["episodes"].append({
            "title": entry.get("title", f"Episode {i}"),
            "description": entry.get("summary", ""),
            "audio_url": audio_url,
            "duration_seconds": duration,
            "episode_number": episode_num,
            "season_number": season,
            "published_at": published_at,
        })

    return podcast_data
