import traceback
import asyncio
from app.core.database import async_session
from app.api.v1.search import search
from fastapi import Query

async def test():
    async with async_session() as db:
        try:
            result = await search(q="queen", db=db)
            print(f"OK: {len(result.get('tracks', []))} tracks")
            if result.get("tracks"):
                t = result["tracks"][0]
                print(f"  First: {t.title} by {t.artist}")
        except Exception as e:
            traceback.print_exc()

asyncio.run(test())
