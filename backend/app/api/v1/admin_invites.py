import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.utils.deps import require_admin
from app.models.user import User
from app.models.admin_invite import AdminInviteToken

router = APIRouter(prefix="/admin/invites", tags=["admin-invites"])


class InviteCreate(BaseModel):
    email: EmailStr | None = None
    max_uses: int = 1
    expires_in_days: int | None = 30


class InviteResponse(BaseModel):
    id: str
    token: str
    email: str | None
    max_uses: int
    use_count: int
    expires_at: str | None
    is_revoked: bool
    created_at: str
    invite_link: str


@router.post("", response_model=InviteResponse)
async def create_invite(
    body: InviteCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    token = secrets.token_urlsafe(32)
    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    invite = AdminInviteToken(
        token=token,
        email=body.email,
        invited_by=admin.id,
        max_uses=body.max_uses,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.flush()
    await db.refresh(invite)

    base_url = "https://altspot.jorys-personnel.fr"
    return InviteResponse(
        id=str(invite.id),
        token=invite.token,
        email=invite.email,
        max_uses=invite.max_uses,
        use_count=invite.use_count,
        expires_at=invite.expires_at.isoformat() if invite.expires_at else None,
        is_revoked=invite.is_revoked,
        created_at=invite.created_at.isoformat(),
        invite_link=f"{base_url}/register?invite={invite.token}",
    )


@router.get("")
async def list_invites(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AdminInviteToken).order_by(AdminInviteToken.created_at.desc())
    )
    invites = result.scalars().all()
    base_url = "https://altspot.jorys-personnel.fr"
    return [
        {
            "id": str(i.id),
            "token": i.token,
            "email": i.email,
            "max_uses": i.max_uses,
            "use_count": i.use_count,
            "expires_at": i.expires_at.isoformat() if i.expires_at else None,
            "is_revoked": i.is_revoked,
            "used_by": str(i.used_by) if i.used_by else None,
            "created_at": i.created_at.isoformat(),
            "invite_link": f"{base_url}/register?invite={i.token}",
        }
        for i in invites
    ]


@router.delete("/{invite_id}")
async def revoke_invite(
    invite_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        import uuid
        iid = uuid.UUID(invite_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invite ID")

    result = await db.execute(select(AdminInviteToken).where(AdminInviteToken.id == iid))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    invite.is_revoked = True
    return {"status": "ok"}
