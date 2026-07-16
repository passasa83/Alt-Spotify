import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.follow import Follow, FollowType
from app.models.listening_history import ListeningHistory
from app.models.track import Track
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(prefix="/social", tags=["social"])


@router.post("/follow/{user_id}", status_code=status.HTTP_201_CREATED)
async def follow_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot follow yourself")

    target = await db.execute(select(User).where(User.id == user_id))
    if not target.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.followed_id == user_id,
            Follow.follow_type == FollowType.USER,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already following")

    follow = Follow(
        follower_id=current_user.id,
        followed_id=user_id,
        follow_type=FollowType.USER,
    )
    db.add(follow)
    await db.flush()

    from app.services.notifications import notify_follow
    await notify_follow(db, current_user, user_id)

    from app.services.push_notifications import notify_follow_push
    await notify_follow_push(current_user.pseudo, user_id)

    return {"message": "Followed"}


@router.delete("/follow/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.followed_id == user_id,
            Follow.follow_type == FollowType.USER,
        )
    )
    await db.flush()


@router.post("/follow/artist/{artist_id}", status_code=status.HTTP_201_CREATED)
async def follow_artist(
    artist_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.followed_id == artist_id,
            Follow.follow_type == FollowType.ARTIST,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already following artist")

    follow = Follow(
        follower_id=current_user.id,
        followed_id=artist_id,
        follow_type=FollowType.ARTIST,
    )
    db.add(follow)
    await db.flush()
    return {"message": "Followed artist"}


@router.delete("/follow/artist/{artist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_artist(
    artist_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.followed_id == artist_id,
            Follow.follow_type == FollowType.ARTIST,
        )
    )
    await db.flush()


@router.get("/followers")
async def get_followers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Follow.follower_id, Follow.created_at)
        .where(Follow.followed_id == current_user.id, Follow.follow_type == FollowType.USER)
        .order_by(Follow.created_at.desc())
    )
    rows = result.all()
    followers = []
    for row in rows:
        user_result = await db.execute(select(User).where(User.id == row.follower_id))
        user = user_result.scalar_one_or_none()
        if user:
            followers.append({
                "user_id": str(user.id),
                "pseudo": user.pseudo,
                "avatar_url": user.avatar_url,
                "followed_at": row.created_at.isoformat(),
            })
    return {"followers": followers, "count": len(followers)}


@router.get("/following")
async def get_following(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Follow.followed_id, Follow.follow_type, Follow.created_at)
        .where(Follow.follower_id == current_user.id)
        .order_by(Follow.created_at.desc())
    )
    rows = result.all()
    following = []
    for row in rows:
        if row.follow_type == FollowType.USER:
            user_result = await db.execute(select(User).where(User.id == row.followed_id))
            user = user_result.scalar_one_or_none()
            if user:
                following.append({
                    "type": "user",
                    "id": str(user.id),
                    "pseudo": user.pseudo,
                    "avatar_url": user.avatar_url,
                    "followed_at": row.created_at.isoformat(),
                })
        elif row.follow_type == FollowType.ARTIST:
            from app.models.artist import Artist
            artist_result = await db.execute(select(Artist).where(Artist.id == row.followed_id))
            artist = artist_result.scalar_one_or_none()
            if artist:
                following.append({
                    "type": "artist",
                    "id": str(artist.id),
                    "name": artist.name,
                    "image_url": artist.image_url,
                    "followed_at": row.created_at.isoformat(),
                })
    return {"following": following, "count": len(following)}


@router.get("/feed")
async def get_feed(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get IDs of followed users
    followed_result = await db.execute(
        select(Follow.followed_id)
        .where(Follow.follower_id == current_user.id, Follow.follow_type == FollowType.USER)
    )
    followed_ids = [row[0] for row in followed_result.all()]

    if not followed_ids:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 0}

    # Get recent plays from followed users
    query = (
        select(ListeningHistory, Track)
        .join(Track, Track.id == ListeningHistory.track_id)
        .where(ListeningHistory.user_id.in_(followed_ids))
        .order_by(ListeningHistory.played_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    rows = result.all()

    count_result = await db.execute(
        select(func.count(ListeningHistory.id))
        .where(ListeningHistory.user_id.in_(followed_ids))
    )
    total = count_result.scalar() or 0

    from math import ceil
    items = []
    for history, track in rows:
        user_result = await db.execute(select(User).where(User.id == history.user_id))
        user = user_result.scalar_one_or_none()
        items.append({
            "user_id": str(history.user_id),
            "user_pseudo": user.pseudo if user else None,
            "track_id": str(track.id),
            "track_title": track.title,
            "artist_id": str(track.artist_id),
            "played_at": history.played_at.isoformat(),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if total else 0,
    }


@router.post("/share")
async def generate_share_link(
    entity_type: str,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    valid_types = {"track", "playlist"}
    if entity_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid entity type. Use: {valid_types}",
        )
    share_url = f"https://altspotify.app/{entity_type}/{entity_id}"
    return {"share_url": share_url, "entity_type": entity_type, "entity_id": str(entity_id)}


@router.get("/share/qr/{entity_type}/{entity_id}")
async def share_qr(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        import qrcode
        import io
        from fastapi.responses import StreamingResponse

        base_url = "https://altspot.jorys-personnel.fr"
        share_url = f"{base_url}/{entity_type}/{entity_id}"

        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(share_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        return StreamingResponse(buffer, media_type="image/png")
    except ImportError:
        raise HTTPException(status_code=501, detail="QR code generation not available")
