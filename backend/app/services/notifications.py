import uuid
from math import ceil

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    type: str,
    title: str,
    message: str,
    data: dict | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        data=data,
    )
    db.add(notification)
    await db.flush()
    await db.refresh(notification)
    return notification


async def notify_jam_invite(
    db: AsyncSession,
    host_user: User,
    session_id: uuid.UUID,
    session_code: str,
    target_users: list[User],
) -> list[Notification]:
    notifications = []
    for target in target_users:
        n = await create_notification(
            db,
            user_id=target.id,
            type="jam_invite",
            title="Jam Session Invite",
            message=f"{host_user.pseudo} invited you to join a Jam session",
            data={"session_id": str(session_id), "session_code": session_code, "host_pseudo": host_user.pseudo},
        )
        notifications.append(n)

    from app.services.push_notifications import notify_jam_invite_push
    await notify_jam_invite_push(
        host_name=host_user.pseudo,
        session_code=session_code,
        target_user_ids=[t.id for t in target_users],
    )

    return notifications


async def notify_new_release(
    db: AsyncSession,
    artist_name: str,
    artist_id: uuid.UUID,
    album_title: str,
    album_id: uuid.UUID,
    follower_ids: list[uuid.UUID],
) -> list[Notification]:
    notifications = []
    for follower_id in follower_ids:
        n = await create_notification(
            db,
            user_id=follower_id,
            type="new_release",
            title="New Release",
            message=f"{artist_name} released a new album: {album_title}",
            data={"artist_id": str(artist_id), "album_id": str(album_id), "artist_name": artist_name},
        )
        notifications.append(n)

    from app.services.push_notifications import notify_new_release_push
    await notify_new_release_push(artist_name, [album_title], follower_ids)

    return notifications


async def notify_follow(
    db: AsyncSession,
    follower: User,
    followed_user_id: uuid.UUID,
) -> Notification:
    from app.services.push_notifications import notify_follow_push
    await notify_follow_push(follower.pseudo, followed_user_id)
    return await create_notification(
        db,
        user_id=followed_user_id,
        type="follow",
        title="New Follower",
        message=f"{follower.pseudo} started following you",
        data={"follower_id": str(follower.id), "follower_pseudo": follower.pseudo},
    )


async def get_user_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    count_result = await db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == user_id)
    )
    total = count_result.scalar() or 0

    unread_result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id, Notification.is_read == False
        )
    )
    unread_count = unread_result.scalar() or 0

    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    notifications = result.scalars().all()

    return {
        "items": notifications,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if total else 0,
        "unread_count": unread_count,
    }


async def get_unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id, Notification.is_read == False
        )
    )
    return result.scalar() or 0


async def mark_as_read(db: AsyncSession, notification_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
    )
    notification = result.scalar_one_or_none()
    if not notification:
        return False
    notification.is_read = True
    await db.flush()
    return True


async def mark_all_as_read(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.flush()


async def delete_notification(db: AsyncSession, notification_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
    )
    notification = result.scalar_one_or_none()
    if not notification:
        return False
    await db.delete(notification)
    await db.flush()
    return True
