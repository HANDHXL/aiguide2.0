"""Feedback / comment wall service."""
from typing import List
from sqlalchemy import desc
from backend.database import SessionLocal
from backend.database.models import Feedback


def add_feedback(username: str, content: str, rating: int = 5, user_id: int = None) -> Feedback:
    db = SessionLocal()
    try:
        fb = Feedback(username=username or "匿名游客", content=content, rating=rating, user_id=user_id)
        db.add(fb)
        db.commit()
        db.refresh(fb)
        return fb
    finally:
        db.close()


def get_all_feedback(limit: int = 50) -> List[dict]:
    db = SessionLocal()
    try:
        rows = db.query(Feedback).order_by(desc(Feedback.created_at)).limit(limit).all()
        return [{"id": r.id, "username": r.username, "content": r.content,
                 "rating": r.rating, "created_at": r.created_at.isoformat()} for r in rows]
    finally:
        db.close()
