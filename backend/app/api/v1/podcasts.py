import uuid
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.minio import get_file_url
from app.models.podcast import Podcast, Episode
from app.schemas.podcast import (
    PodcastCreate,
    PodcastUpdate,
    PodcastResponse,
    PodcastWithEpisodesResponse,
    EpisodeCreate,
    EpisodeResponse,
    RSSImportRequest,
)
from app.schemas.common import PaginatedResponse
from app.utils.deps import get_current_user, require_admin
from app.models.user import User

router = APIRouter(prefix="/podcasts", tags=["podcasts"])


@router.get("", response_model=PaginatedResponse[PodcastResponse])
async def list_podcasts(
    q: str | None = None,
    category: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Podcast)
    count_query = select(func.count(Podcast.id))

    if q:
        query = query.where(Podcast.title.ilike(f"%{q}%"))
        count_query = count_query.where(Podcast.title.ilike(f"%{q}%"))
    if category:
        query = query.where(Podcast.categories.op("@>")(f'["{category}"]'))
        count_query = count_query.where(Podcast.categories.op("@>")(f'["{category}"]'))

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.offset((page - 1) * page_size).limit(page_size).order_by(Podcast.created_at.desc())
    )
    items = result.scalars().all()

    podcast_responses = []
    for podcast in items:
        ep_count = (await db.execute(select(func.count(Episode.id)).where(Episode.podcast_id == podcast.id))).scalar() or 0
        podcast_responses.append(PodcastResponse(
            id=podcast.id,
            title=podcast.title,
            description=podcast.description,
            image_url=podcast.image_url,
            author=podcast.author,
            feed_url=podcast.feed_url,
            categories=podcast.categories,
            episode_count=ep_count,
            created_at=podcast.created_at,
        ))

    return PaginatedResponse(
        items=podcast_responses,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total else 0,
    )


@router.get("/{podcast_id}", response_model=PodcastWithEpisodesResponse)
async def get_podcast(podcast_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Podcast not found")

    ep_result = await db.execute(
        select(Episode).where(Episode.podcast_id == podcast_id).order_by(Episode.episode_number.desc())
    )
    episodes = list(ep_result.scalars().all())

    ep_count = (await db.execute(select(func.count(Episode.id)).where(Episode.podcast_id == podcast.id))).scalar() or 0

    return PodcastWithEpisodesResponse(
        id=podcast.id,
        title=podcast.title,
        description=podcast.description,
        image_url=podcast.image_url,
        author=podcast.author,
        feed_url=podcast.feed_url,
        categories=podcast.categories,
        episode_count=ep_count,
        created_at=podcast.created_at,
        episodes=episodes,
    )


@router.post("", response_model=PodcastResponse, status_code=status.HTTP_201_CREATED)
async def create_podcast(
    body: PodcastCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    podcast = Podcast(**body.model_dump())
    db.add(podcast)
    await db.flush()
    await db.refresh(podcast)
    return PodcastResponse(
        id=podcast.id,
        title=podcast.title,
        description=podcast.description,
        image_url=podcast.image_url,
        author=podcast.author,
        feed_url=podcast.feed_url,
        categories=podcast.categories,
        episode_count=0,
        created_at=podcast.created_at,
    )


@router.put("/{podcast_id}", response_model=PodcastResponse)
async def update_podcast(
    podcast_id: uuid.UUID,
    body: PodcastUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Podcast not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(podcast, field, value)
    await db.flush()
    await db.refresh(podcast)

    ep_count = (await db.execute(select(func.count(Episode.id)).where(Episode.podcast_id == podcast.id))).scalar() or 0

    return PodcastResponse(
        id=podcast.id,
        title=podcast.title,
        description=podcast.description,
        image_url=podcast.image_url,
        author=podcast.author,
        feed_url=podcast.feed_url,
        categories=podcast.categories,
        episode_count=ep_count,
        created_at=podcast.created_at,
    )


@router.delete("/{podcast_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_podcast(
    podcast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Podcast not found")
    await db.execute(select(Episode).where(Episode.podcast_id == podcast_id))
    await db.delete(podcast)


@router.get("/{podcast_id}/episodes", response_model=list[EpisodeResponse])
async def list_episodes(
    podcast_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Podcast not found")

    ep_result = await db.execute(
        select(Episode)
        .where(Episode.podcast_id == podcast_id)
        .order_by(Episode.episode_number.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(ep_result.scalars().all())


@router.post("/{podcast_id}/episodes", response_model=EpisodeResponse, status_code=status.HTTP_201_CREATED)
async def create_episode(
    podcast_id: uuid.UUID,
    body: EpisodeCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Podcast not found")

    episode = Episode(**{**body.model_dump(), "podcast_id": podcast_id})
    db.add(episode)
    await db.flush()
    await db.refresh(episode)
    return episode


@router.post("/feed/import", response_model=PodcastResponse, status_code=status.HTTP_201_CREATED)
async def import_from_feed(
    body: RSSImportRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.services.rss_parser import parse_rss_feed

    feed_data = await parse_rss_feed(body.feed_url)

    podcast = Podcast(
        title=feed_data["title"],
        description=feed_data.get("description", ""),
        image_url=feed_data.get("image_url"),
        author=feed_data.get("author"),
        feed_url=body.feed_url,
        categories=feed_data.get("categories", []),
    )
    db.add(podcast)
    await db.flush()

    for ep_data in feed_data.get("episodes", []):
        episode = Episode(
            podcast_id=podcast.id,
            title=ep_data["title"],
            description=ep_data.get("description", ""),
            audio_url=ep_data.get("audio_url"),
            duration_seconds=ep_data.get("duration_seconds", 0),
            episode_number=ep_data.get("episode_number"),
            season_number=ep_data.get("season_number"),
            published_at=ep_data.get("published_at"),
        )
        db.add(episode)

    await db.flush()
    await db.refresh(podcast)

    ep_count = len(feed_data.get("episodes", []))

    return PodcastResponse(
        id=podcast.id,
        title=podcast.title,
        description=podcast.description,
        image_url=podcast.image_url,
        author=podcast.author,
        feed_url=podcast.feed_url,
        categories=podcast.categories,
        episode_count=ep_count,
        created_at=podcast.created_at,
    )


@router.post("/episodes/{episode_id}/play")
async def play_episode(
    episode_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Episode).where(Episode.id == episode_id))
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found")

    episode.is_played = True
    await db.flush()
    return {"message": "Episode play recorded"}


@router.get("/{podcast_id}/episodes/{episode_id}/stream")
async def stream_episode(
    podcast_id: uuid.UUID,
    episode_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Episode).where(Episode.id == episode_id, Episode.podcast_id == podcast_id)
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found")
    if not episode.audio_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No audio file available")
    url = get_file_url(episode.audio_url)
    return {"stream_url": url}
