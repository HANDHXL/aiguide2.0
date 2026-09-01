"""Feedback / comment wall API routes."""
from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from backend.api.dependencies import get_current_user
from backend.database.models import User
from backend.services import feedback_service

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)
    rating: int = Field(5, ge=1, le=5)


class FeedbackItem(BaseModel):
    id: int
    username: str
    content: str
    rating: int
    created_at: str


@router.post("", response_model=FeedbackItem)
def create_feedback(req: FeedbackCreate, user: User = Depends(get_current_user)):
    fb = feedback_service.add_feedback(user.username, req.content, req.rating, user.id)
    return FeedbackItem(id=fb.id, username=fb.username, content=fb.content, rating=fb.rating,
                        created_at=fb.created_at.isoformat())


@router.get("", response_model=List[FeedbackItem])
def list_feedback():
    return feedback_service.get_all_feedback()
