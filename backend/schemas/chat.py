"""Pydantic schemas for API request/response."""

from pydantic import BaseModel, Field
from typing import List, Optional


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000, description="用户问题")
    conversation_id: Optional[int] = Field(None, description="对话ID，不传则自动创建新对话")
    interest: Optional[str] = Field(None, description="游客兴趣标签，如'历史'、'自然风光'")
    persona: Optional[str] = Field(None, description="数字人人设提示词，例如'你是一个亲切热情的导游'")
    name: Optional[str] = Field(None, description="数字人名称")


class SourceDoc(BaseModel):
    content: str = Field(..., description="相关文档片段")
    source: str = Field("unknown", description="来源文件名")
    type: str = Field("unknown", description="文档类型")


class ChatResponse(BaseModel):
    question: str
    answer: str
    sources: List[SourceDoc] = Field(default_factory=list)
    conversation_id: Optional[int] = None


class AttractionInfo(BaseModel):
    id: str
    name: str
    location: str
    description: str
    culture: Optional[str] = None
    highlights: Optional[str] = None


class RecommendRequest(BaseModel):
    interest: str = Field(..., description="兴趣标签: 历史, 自然风光, 佛教文化, 建筑艺术, 亲子娱乐")
    duration: Optional[str] = Field("半天", description="预计游览时长")


class RouteStep(BaseModel):
    order: int
    attraction_id: str
    attraction_name: str
    duration_minutes: int
    description: str


class RecommendResponse(BaseModel):
    interest: str
    route_name: str
    steps: List[RouteStep]
    total_duration: str


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    kb_ready: bool = False
