import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from backend.schemas.conversation import ConversationSummary, ConversationDetail, CreateConversationRequest, MessageItem
from backend.services import conversation_service
from backend.api.dependencies import get_current_user
from backend.database.models import User

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=List[ConversationSummary])
def list_conversations(user: User = Depends(get_current_user)):
    return conversation_service.get_user_conversations(user.id)


@router.post("", response_model=ConversationDetail)
def create_conversation(req: CreateConversationRequest, user: User = Depends(get_current_user)):
    conv = conversation_service.create_conversation(user.id, req.title or "新对话")
    return ConversationDetail(
        id=conv.id, title=conv.title, messages=[], created_at=conv.created_at
    )


@router.get("/{conv_id}", response_model=ConversationDetail)
def get_conversation(conv_id: int, user: User = Depends(get_current_user)):
    conv = conversation_service.get_conversation(conv_id, user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    messages = conversation_service.get_conversation_messages(conv_id)
    message_items = [
        MessageItem(
            id=m.id, role=m.role, content=m.content,
            sources=json.loads(m.sources_json) if m.sources_json else None,
            created_at=m.created_at
        ) for m in messages
    ]
    return ConversationDetail(
        id=conv.id, title=conv.title,
        messages=message_items, created_at=conv.created_at
    )


@router.delete("/{conv_id}")
def delete_conversation(conv_id: int, user: User = Depends(get_current_user)):
    ok = conversation_service.delete_conversation(conv_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="对话不存在")
    return {"ok": True}
