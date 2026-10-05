"""Bug reports: sent by users from the app, handled by admins."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.bug_report import BugReport
from app.models.user import User
from app.utils.deps import get_current_user, require_admin

logger = structlog.get_logger("app")

router = APIRouter(tags=["bug-reports"])

Category = Literal["playback", "display", "account", "other"]
Status = Literal["new", "in_progress", "resolved", "wont_fix"]

# Enough for a test version, low enough that a stuck script can't flood the table.
MAX_REPORTS_PER_HOUR = 10
MAX_CONTEXT_BYTES = 16 * 1024


class BugReportCreate(BaseModel):
    category: Category = "other"
    description: str = Field(min_length=5, max_length=5000)
    page_url: str | None = Field(default=None, max_length=500)
    context: dict | None = None

    @field_validator("description")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 5:
            raise ValueError("Description too short")
        return value

    @field_validator("context")
    @classmethod
    def _small_context(cls, value: dict | None) -> dict | None:
        if value is not None and len(json.dumps(value, default=str)) > MAX_CONTEXT_BYTES:
            raise ValueError("Context too large")
        return value


class BugReportUpdate(BaseModel):
    status: Status | None = None
    admin_note: str | None = Field(default=None, max_length=5000)


def _serialize(report: BugReport, reporter: User | None = None) -> dict:
    return {
        "id": str(report.id),
        "category": report.category,
        "description": report.description,
        "page_url": report.page_url,
        "user_agent": report.user_agent,
        "context": report.context,
        "status": report.status,
        "admin_note": report.admin_note,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
        "reporter": {"id": str(reporter.id), "pseudo": reporter.pseudo, "email": reporter.email} if reporter else None,
    }


@router.post("/bug-reports", status_code=status.HTTP_201_CREATED)
async def create_bug_report(
    body: BugReportCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
    recent = (
        await db.execute(
            select(func.count(BugReport.id)).where(BugReport.user_id == current_user.id, BugReport.created_at >= since)
        )
    ).scalar() or 0
    if recent >= MAX_REPORTS_PER_HOUR:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many bug reports, try again later")

    report = BugReport(
        user_id=current_user.id,
        category=body.category,
        description=body.description,
        page_url=body.page_url,
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
        context=body.context,
    )
    db.add(report)
    await db.flush()
    logger.info("bug_reported", report_id=str(report.id), user_id=str(current_user.id), category=body.category)
    return {"id": str(report.id)}


@router.get("/admin/bug-reports")
async def list_bug_reports(
    status_filter: Status | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(BugReport, User).outerjoin(User, User.id == BugReport.user_id)
    count_query = select(func.count(BugReport.id))
    if status_filter:
        query = query.where(BugReport.status == status_filter)
        count_query = count_query.where(BugReport.status == status_filter)

    total = (await db.execute(count_query)).scalar() or 0
    rows = await db.execute(
        query.order_by(BugReport.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    counts = dict((await db.execute(select(BugReport.status, func.count(BugReport.id)).group_by(BugReport.status))).all())
    return {
        "items": [_serialize(report, reporter) for report, reporter in rows.all()],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if total else 0,
        # For the tab badges: how many reports in each status.
        "counts": {s: counts.get(s, 0) for s in ("new", "in_progress", "resolved", "wont_fix")},
    }


@router.patch("/admin/bug-reports/{report_id}")
async def update_bug_report(
    report_id: uuid.UUID,
    body: BugReportUpdate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    report = (await db.execute(select(BugReport).where(BugReport.id == report_id))).scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug report not found")
    if body.status is not None:
        report.status = body.status
    if body.admin_note is not None:
        report.admin_note = body.admin_note.strip() or None
    await db.flush()
    await db.refresh(report)
    reporter = (await db.execute(select(User).where(User.id == report.user_id))).scalar_one_or_none() if report.user_id else None
    return _serialize(report, reporter)


@router.delete("/admin/bug-reports/{report_id}")
async def delete_bug_report(
    report_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    report = (await db.execute(select(BugReport).where(BugReport.id == report_id))).scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug report not found")
    await db.delete(report)
    await db.flush()
    logger.info("bug_report_deleted", report_id=str(report_id), admin_id=str(admin.id))
    return {"deleted": True}
