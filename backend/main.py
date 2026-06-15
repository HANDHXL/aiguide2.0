"""AI Digital Tour Guide — FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from backend.config import settings
from backend.api.routes import chat, attractions, voice, auth, conversations, admin
from backend.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: preload knowledge base."""
    logger.info("Starting AI Digital Tour Guide server...")
    init_db()
    logger.info("Database initialized")
    try:
        from backend.services.chat_service import _get_pipeline
        _get_pipeline()
        logger.info("Knowledge base and LLM initialized successfully")
    except Exception as e:
        logger.warning(f"Preload failed (will retry on first request): {e}")
    yield
    logger.info("Server shutting down")


app = FastAPI(
    title="AI数字人导游系统",
    description="基于多模态大模型的智能景区导览服务",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(conversations.router)
app.include_router(admin.router)
app.include_router(chat.router)
app.include_router(attractions.router)
app.include_router(voice.router)


@app.get("/", tags=["health"])
async def root():
    return {
        "service": "AI数字人导游系统",
        "version": "0.1.0",
        "docs": "/docs"
    }


@app.get("/health", tags=["health"])
async def health():
    from backend.services.chat_service import is_kb_ready
    return {
        "status": "ok",
        "version": "0.1.0",
        "kb_ready": is_kb_ready()
    }
