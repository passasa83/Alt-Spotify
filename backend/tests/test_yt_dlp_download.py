"""YouTube downloads keep the audio as served (no FLAC conversion)."""
import sys
import types
from unittest.mock import patch

from app.services import yt_dlp_download


def _fake_yt_dlp(ext: str, seen_opts: dict):
    class FakeYDL:
        def __init__(self, opts):
            seen_opts.update(opts)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def download(self, urls):
            path = seen_opts["outtmpl"].replace("%(ext)s", ext.lstrip("."))
            with open(path, "wb") as f:
                f.write(b"audio")

    return types.SimpleNamespace(YoutubeDL=FakeYDL)


def test_audio_is_kept_as_served(tmp_path):
    opts: dict = {}
    with patch.dict(sys.modules, {"yt_dlp": _fake_yt_dlp(".m4a", opts)}):
        path = yt_dlp_download._download_audio("https://youtu.be/x", str(tmp_path / "Band - Song"))
    assert path == str(tmp_path / "Band - Song.m4a")
    assert "postprocessors" not in opts  # no conversion
    assert opts["format"].startswith("bestaudio[ext=m4a]")


async def test_search_and_download_links_the_real_file(tmp_path, monkeypatch):
    monkeypatch.setattr(yt_dlp_download, "DOWNLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(
        yt_dlp_download, "_search_youtube", lambda q: {"url": "https://youtu.be/x", "title": "Song", "duration": 200}
    )
    opts: dict = {}
    with patch.dict(sys.modules, {"yt_dlp": _fake_yt_dlp(".webm", opts)}):
        result = await yt_dlp_download.search_and_download("Song", "Band")
    assert result["success"] is True
    # The extension matches the content (it used to be renamed to .flac).
    assert result["file_url"] == f"local:{tmp_path / 'Band - Song.webm'}"
