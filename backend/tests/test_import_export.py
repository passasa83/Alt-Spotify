import pytest

from app.services.deezer import extract_playlist_id


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.deezer.com/playlist/42", "42"),
        # Copied from the website: language segment in the path.
        ("https://www.deezer.com/fr/playlist/1313621735", "1313621735"),
        ("https://www.deezer.com/en-gb/playlist/7", "7"),
        ("123", "123"),
        ("https://www.deezer.com/fr/album/9", None),
        ("https://example.com/playlist/1", None),
    ],
)
def test_extract_deezer_playlist_id(url, expected):
    assert extract_playlist_id(url) == expected
