"""AI Digital Tour Guide — FastAPI application entry point."""

import sys
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.requests import Request
from loguru import logger

from backend.config import settings
from backend.api.routes import chat, attractions, voice, auth, conversations, admin, feedback, map as map_routes
from backend.database import init_db


# ---- Resolve frontend dist path (works for both dev and PyInstaller) ----
def _get_frontend_dir() -> Path:
    """Find the frontend dist directory."""
    if getattr(sys, 'frozen', False):
        # PyInstaller bundle — data files extracted to sys._MEIPASS
        base = Path(sys._MEIPASS)
    else:
        # __file__ = backend/main.py → parent = backend/ → parent = project root
        base = Path(__file__).resolve().parent.parent
    dist = base / "frontend" / "dist"
    if dist.exists():
        return dist
    # Fallback: frontend might be directly under base
    alt = base / "dist"
    if alt.exists():
        return alt
    return dist  # return even if not found — will log warning


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
    except (ImportError, FileNotFoundError, OSError) as e:
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
app.include_router(feedback.router)
app.include_router(chat.router)
app.include_router(attractions.router)
app.include_router(voice.router)
app.include_router(map_routes.router)


# ---- /api prefix support (production mode compatibility) ----
# In dev, Vite proxy strips /api before reaching backend.
# In production, the frontend calls /api/* directly. This middleware rewrites.
@app.middleware("http")
async def api_prefix_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/v1"):
        # Rewrite /api/xxx → /xxx so existing routes work
        request.scope["path"] = path[4:]  # remove "/api"
        request.scope["raw_path"] = request.scope["path"].encode()
    response = await call_next(request)
    return response


@app.get("/", tags=["health"])
async def root():
    # Serve frontend if available, otherwise API info
    if _frontend_dir and (_frontend_dir / "index.html").exists():
        return FileResponse(str(_frontend_dir / "index.html"))
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


# ---- Serve frontend static files (production / PyInstaller mode) ----
_frontend_dir = _get_frontend_dir()
if _frontend_dir.exists():
    _assets_dir = _frontend_dir / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")
    _live2d_dir = _frontend_dir / "live2d"
    if _live2d_dir.exists():
        app.mount("/live2d", StaticFiles(directory=str(_live2d_dir)), name="live2d")

    # Serve individual root-level files (avatar, favicon)
    _static_files = {}
    for _fname in ["avatar.png", "favicon.ico"]:
        _fp = _frontend_dir / _fname
        if _fp.exists():
            _static_files[_fname] = str(_fp)

    if _static_files:
        async def _serve_static_file(request: Request):
            fname = request.url.path.lstrip("/")
            fpath = _static_files.get(fname)
            if fpath:
                return FileResponse(fpath)
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        @app.get("/avatar.png", include_in_schema=False)
        async def _avatar(): return FileResponse(_static_files["avatar.png"])
        @app.get("/favicon.ico", include_in_schema=False)
        async def _favicon(): return FileResponse(_static_files.get("favicon.ico", _static_files.get("avatar.png", "")))

    # SPA fallback — all unmatched routes → index.html
    _index_html = _frontend_dir / "index.html"
    _admin_html = _frontend_dir / "admin.html"
    _api_prefixes = ("chat", "auth", "admin", "attractions", "voice", "map",
                     "conversations", "feedback", "health", "docs", "openapi")

    if _index_html.exists():
        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            if full_path.startswith(_api_prefixes):
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            if full_path.startswith("admin") and _admin_html.exists():
                return FileResponse(str(_admin_html))
            return FileResponse(str(_index_html))

    logger.info(f"Frontend static files mounted from: {_frontend_dir}")
else:
    logger.info("Frontend dist not found — running API-only mode")
