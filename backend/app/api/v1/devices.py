import uuid as uuid_mod
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.utils.deps import get_current_user
from app.models.user import User
from app.models.device_session import DeviceSession

router = APIRouter(prefix="/devices", tags=["devices"])


class DeviceRegister(BaseModel):
    device_id: str
    device_name: str
    device_type: str  # web, mobile, desktop


class DeviceResponse(BaseModel):
    id: str
    device_id: str
    device_name: str
    device_type: str
    is_active: bool
    last_active_at: str
    is_current: bool


@router.post("/register", response_model=DeviceResponse)
async def register_device(
    body: DeviceRegister,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DeviceSession).where(
            DeviceSession.user_id == current_user.id,
            DeviceSession.device_id == body.device_id,
        )
    )
    device = result.scalar_one_or_none()

    if device:
        device.device_name = body.device_name
        device.device_type = body.device_type
        device.is_active = True
        device.last_active_at = datetime.now(timezone.utc)
    else:
        device = DeviceSession(
            user_id=current_user.id,
            device_id=body.device_id,
            device_name=body.device_name,
            device_type=body.device_type,
        )
        db.add(device)

    await db.flush()
    await db.refresh(device)

    return DeviceResponse(
        id=str(device.id),
        device_id=device.device_id,
        device_name=device.device_name,
        device_type=device.device_type,
        is_active=device.is_active,
        last_active_at=device.last_active_at.isoformat(),
        is_current=True,
    )


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DeviceSession).where(
            DeviceSession.user_id == current_user.id,
            DeviceSession.is_active == True,
        ).order_by(DeviceSession.last_active_at.desc())
    )
    devices = result.scalars().all()

    return [
        DeviceResponse(
            id=str(d.id),
            device_id=d.device_id,
            device_name=d.device_name,
            device_type=d.device_type,
            is_active=d.is_active,
            last_active_at=d.last_active_at.isoformat(),
            is_current=False,
        )
        for d in devices
    ]


@router.post("/heartbeat")
async def device_heartbeat(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_id = body.get("device_id")
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id required")

    result = await db.execute(
        select(DeviceSession).where(
            DeviceSession.user_id == current_user.id,
            DeviceSession.device_id == device_id,
        )
    )
    device = result.scalar_one_or_none()
    if device:
        device.last_active_at = datetime.now(timezone.utc)
        device.is_active = True
        await db.flush()

    return {"status": "ok"}


@router.post("/{device_id}/transfer")
async def transfer_playback(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DeviceSession).where(
            DeviceSession.user_id == current_user.id,
            DeviceSession.device_id == device_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Device not found")

    target.last_active_at = datetime.now(timezone.utc)

    try:
        import redis.asyncio as aioredis
        from app.core.config import settings
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.publish(
            f"user:{current_user.id}:devices",
            f'{{"type":"transfer_playback","target_device":"{device_id}"}}',
        )
        await r.aclose()
    except Exception:
        pass

    return {"status": "ok", "target_device": device_id}
