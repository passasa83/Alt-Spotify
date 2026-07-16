import httpx, json, time

queries = ["queen", "daft punk", "nirvana", "believer", "bad bunny"]
for q in queries:
    start = time.time()
    r = httpx.get("http://localhost:8000/api/v1/search", params={"q": q}, timeout=15)
    elapsed = time.time() - start
    data = r.json()
    tracks = data.get("tracks", [])
    artists = data.get("artists", [])
    print(f"{q}: {len(tracks)} tracks, {len(artists)} artists ({elapsed:.2f}s)")
    for t in tracks[:2]:
        title = t.get("title", "?")
        artist = t.get("artist", {})
        artist_name = artist.get("name", "?") if isinstance(artist, dict) else "?"
        has_audio = bool(t.get("file_url") or t.get("hls_path"))
        print(f"  - {title} by {artist_name} (local={has_audio})")
