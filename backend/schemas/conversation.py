from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class ConversationSummary(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class MessageItem(BaseModel):
    id: int
    role: str
    content: str
    sources: Optional[List[dict]] = None
    created_at: datetime


class ConversationDetail(BaseModel):
    id: int
    title: str
    messages: List[MessageItem] = Field(default_factory=list)
    created_at: datetime


class CreateConversationRequest(BaseModel):
    title: Optional[str] = "新对话"
