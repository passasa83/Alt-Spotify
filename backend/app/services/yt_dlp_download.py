import os
import re
import uuid
import asyncio
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import structlog

logger = structlog.get_logger("app")

DOWNLOAD_DIR = os.environ.get("MUSIC_DOWNLOAD_DIR", "/music/downloads")

_executor = ThreadPoolExecutor(max_workers=2)


def _sanitize_filename(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:200]


def _search_youtube(query: str) -> dict | None:
    try:
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'default_search': 'ytsearch5',
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(f"ytsearch5:{query}", download=False)
            if result and 'entries' in result:
                entries = list(result['entries'])
                for entry in entries:
                    if entry:
                        return {
                            'id': entry.get('id'),
                            'title': entry.get('title', ''),
                            'url': entry.get('url') or f"https://www.youtube.com/watch?v={entry.get('id')}",
                            'duration': entry.get('duration', 0),
                            'uploader': entry.get('uploader', ''),
                        }
    except Exception as e:
        logger.error("yt_dlp_search_error", error=str(e))
    return None


def _download_audio(url: str, output_path: str) -> bool:
    try:
        import yt_dlp
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_path.replace('.flac', '.%(ext)s'),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'flac',
                'preferredquality': '0',
            }],
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'socket_timeout': 30,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        if os.path.isfile(output_path):
            return True

        for ext in ['.flac', '.opus', '.mp3', '.m4a', '.ogg', '.wav']:
            candidate = output_path.replace('.flac', ext)
            if os.path.isfile(candidate):
                if ext != '.flac':
                    os.rename(candidate, output_path)
                return True

        return False
    except Exception as e:
        logger.error("yt_dlp_download_error", url=url, error=str(e))
        return False


def _get_track_metadata(file_path: str) -> dict:
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(file_path, easy=True)
        if audio:
            return {
                'title': (audio.get('title', [None]) or [None])[0],
                'artist': (audio.get('artist', [None]) or [None])[0],
                'album': (audio.get('album', [None]) or [None])[0],
                'duration': audio.info.length if audio.info else 0,
            }
    except Exception:
        pass
    return {}


async def search_and_download(
    title: str,
    artist: str,
    track_id: str | None = None,
    youtube_url: str | None = None,
) -> dict:
    query = f"{artist} {title}" if artist else title
    search_result = None

    if not youtube_url:
        loop = asyncio.get_event_loop()
        search_result = await loop.run_in_executor(_executor, _search_youtube, query)
        if not search_result:
            return {"success": False, "error": "No results found on YouTube"}
        youtube_url = search_result['url']

    filename = _sanitize_filename(f"{artist} - {title}" if artist else title)
    if not filename:
        filename = str(uuid.uuid4())[:8]
    output_path = os.path.join(DOWNLOAD_DIR, f"{filename}.flac")

    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(_executor, _download_audio, youtube_url, output_path)

    if not success:
        return {"success": False, "error": "Download failed"}

    metadata = _get_track_metadata(output_path)

    return {
        "success": True,
        "file_path": output_path,
        "file_url": f"local:{output_path}",
        "youtube_url": youtube_url,
        "youtube_title": search_result['title'] if search_result else title,
        "youtube_duration": search_result['duration'] if search_result else 0,
        "metadata": metadata,
    }


async def download_from_url(youtube_url: str) -> dict:
    loop = asyncio.get_event_loop()
    info = await loop.run_in_executor(_executor, _extract_info, youtube_url)

    title = info.get('title', 'Unknown') if info else 'Unknown'
    artist = info.get('uploader', 'Unknown') if info else 'Unknown'
    filename = _sanitize_filename(f"{artist} - {title}")
    if not filename:
        filename = str(uuid.uuid4())[:8]
    output_path = os.path.join(DOWNLOAD_DIR, f"{filename}.flac")

    success = await loop.run_in_executor(_executor, _download_audio, youtube_url, output_path)

    if not success:
        return {"success": False, "error": "Download failed"}

    metadata = _get_track_metadata(output_path)

    return {
        "success": True,
        "file_path": output_path,
        "file_url": f"local:{output_path}",
        "youtube_url": youtube_url,
        "youtube_title": title,
        "youtube_duration": info.get('duration', 0) if info else 0,
        "metadata": metadata,
    }


def _extract_info(url: str) -> dict | None:
    try:
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'id': info.get('id'),
                'title': info.get('title', ''),
                'duration': info.get('duration', 0),
                'uploader': info.get('uploader', ''),
            }
    except Exception as e:
        logger.error("yt_dlp_extract_error", url=url, error=str(e))
    return None
