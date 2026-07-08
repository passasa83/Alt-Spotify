import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.utils.deps import get_current_user, get_current_admin_user
from app.services.push_notifications import (
    register_push_token,
    remove_push_token,
    send_push_notification,
    send_bulk_push,
)

router = APIRouter(prefix="/push", tags=["push"])


class RegisterTokenRequest(BaseModel):
    push_token: str
    platform: str


class SendPushRequest(BaseModel):
    user_id: uuid.UUID | None = None
    user_ids: list[uuid.UUID] | None = None
    title: str
    body: str
    data: dict | None = None


@router.post("/register")
async def api_register_push_token(
    req: RegisterTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = await register_push_token(
        db,
        user_id=current_user.id,
        push_token=req.push_token,
        platform=req.platform,
    )
    return {"message": "Push token registered", "token_id": str(token.id)}


@router.delete("/unregister")
async def api_unregister_push_token(
    push_token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    removed = await remove_push_token(db, user_id=current_user.id, push_token=push_token)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    return {"message": "Push token removed"}


@router.get("/test")
async def api_test_push(
    current_user: User = Depends(get_current_user),
):
    result = await send_push_notification(
        user_id=current_user.id,
        title="Test Notification",
        body="This is a test push notification from Alt Spotify",
        data={"type": "test"},
    )
    return {"message": "Test notification sent", "result": result}


@router.post("/send")
async def api_send_push(
    req: SendPushRequest,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if req.user_id:
        result = await send_push_notification(
            user_id=req.user_id,
            title=req.title,
            body=req.body,
            data=req.data,
        )
    elif req.user_ids:
        result = await send_bulk_push(
            user_ids=req.user_ids,
            title=req.title,
            body=req.body,
            data=req.data,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either user_id or user_ids is required",
        )
    return {"message": "Push notification sent", "result": result}
