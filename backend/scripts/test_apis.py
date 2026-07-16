#!/usr/bin/env python3
import httpx
import json

endpoints = [
    ("saavn.me", "https://saavn.me/search?song=queen"),
    ("api.deezer", "https://api.deezer.com/search?q=queen&limit=3"),
]

for name, url in endpoints:
    try:
        r = httpx.get(url, timeout=5, follow_redirects=True)
        ct = r.headers.get("content-type", "")
        is_json = "json" in ct
        print(f"{name}: {r.status_code} ct={ct[:40]} json={is_json}")
        if is_json and r.status_code == 200:
            data = r.json()
            if isinstance(data, dict):
                keys = list(data.keys())[:5]
                print(f"  keys: {keys}")
                if "data" in data:
                    print(f"  results: {len(data['data'])}")
                    if data["data"]:
                        item = data["data"][0]
                        print(f"  sample: {json.dumps(item, indent=2)[:300]}")
    except Exception as e:
        print(f"{name}: ERROR {type(e).__name__}: {str(e)[:80]}")
