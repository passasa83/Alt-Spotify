from dataclasses import dataclass
from typing import Generic, TypeVar
from math import ceil

from fastapi import Query
from pydantic import BaseModel

T = TypeVar("T")


@dataclass
class PaginationParams:
    page: int = Query(1, ge=1, description="Numéro de page")
    page_size: int = Query(20, ge=1, le=100, description="Éléments par page")
    sort_by: str | None = Query(None, description="Champ de tri")
    sort_order: str = Query("desc", description="Ordre: asc ou desc")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
    has_next: bool = False
    has_prev: bool = False
    next_cursor: str | None = None
    prev_cursor: str | None = None

    @classmethod
    def create(cls, items: list, total: int, page: int, page_size: int):
        pages = ceil(total / page_size) if page_size > 0 else 0
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
            has_next=page < pages,
            has_prev=page > 1,
        )
