import json
from typing import List, Optional
from sqlalchemy import desc, func
from backend.database import SessionLocal
from backend.database.models import Conversation, Message


def create_conversation(user_id: int, title: str = "新对话") -> Conversation:
    db = SessionLocal()
    try:
        conv = Conversation(user_id=user_id, title=title)
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return conv
    finally:
        db.close()


def get_user_conversations(user_id: int) -> List[dict]:
    db = SessionLocal()
    try:
        convs = (
            db.query(Conversation)
            .filter(Conversation.user_id == user_id)
            .order_by(desc(Conversation.updated_at))
            .all()
        )
        result = []
        for c in convs:
            msg_count = db.query(func.count(Message.id)).filter(
                Message.conversation_id == c.id
            ).scalar() or 0
            result.append({
                "id": c.id,
                "title": c.title,
                "created_at": c.created_at,
                "updated_at": c.updated_at,
                "message_count": msg_count,
            })
        return result
    finally:
        db.close()


def get_conversation(conv_id: int, user_id: int) -> Optional[Conversation]:
    db = SessionLocal()
    try:
        return db.query(Conversation).filter(
            Conversation.id == conv_id,
            Conversation.user_id == user_id
        ).first()
    finally:
        db.close()


def delete_conversation(conv_id: int, user_id: int) -> bool:
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(
            Conversation.id == conv_id,
            Conversation.user_id == user_id
        ).first()
        if not conv:
            return False
        db.delete(conv)
        db.commit()
        return True
    finally:
        db.close()


def get_conversation_messages(conv_id: int) -> List[Message]:
    db = SessionLocal()
    try:
        return (
            db.query(Message)
            .filter(Message.conversation_id == conv_id)
            .order_by(Message.created_at)
            .all()
        )
    finally:
        db.close()


def add_message(conv_id: int, role: str, content: str, sources: Optional[List[dict]] = None, sentiment_score: Optional[int] = None, route_json: Optional[str] = None) -> Message:
    db = SessionLocal()
    try:
        sources_json = json.dumps(sources, ensure_ascii=False) if sources else None
        msg = Message(
            conversation_id=conv_id,
            role=role,
            content=content,
            sources_json=sources_json,
            sentiment_score=sentiment_score,
            route_json=route_json,
        )
        db.add(msg)
        db.flush()  # populate msg.id and created_at
        # Capture values before commit (which expires objects)
        msg_id = msg.id
        created_at = msg.created_at
        db.query(Conversation).filter(Conversation.id == conv_id).update(
            {"updated_at": created_at}
        )
        db.commit()
        # Return a lightweight result to avoid DetachedInstanceError
        from collections import namedtuple
        MsgResult = namedtuple('MsgResult', ['id', 'conversation_id', 'role', 'content', 'created_at'])
        return MsgResult(id=msg_id, conversation_id=conv_id, role=role, content=content, created_at=created_at)
    finally:
        db.close()


def update_message_sentiment(message_id: int, sentiment_score: int):
    """Update the sentiment score of an existing message (for async analysis)."""
    db = SessionLocal()
    try:
        db.query(Message).filter(Message.id == message_id).update(
            {"sentiment_score": sentiment_score}
        )
        db.commit()
    finally:
        db.close()


def auto_title_conversation(conv_id: int, user_message: str):
    db = SessionLocal()
    try:
        title = user_message[:20].replace("\n", " ").strip()
        if not title:
            title = "新对话"
        db.query(Conversation).filter(Conversation.id == conv_id).update({"title": title})
        db.commit()
    finally:
        db.close()


def get_history_for_llm(conv_id: int, max_turns: int = 10) -> List[dict]:
    """返回最近 max_turns 轮对话，格式化为 [{"role": "user"|"assistant", "content": "..."}]"""
    messages = get_conversation_messages(conv_id)
    recent = messages[-(max_turns * 2):]
    return [{"role": m.role, "content": m.content} for m in recent]
