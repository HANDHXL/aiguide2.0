"""Admin API routes — dashboard stats and knowledge base management."""

import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from backend.api.dependencies import get_current_user
from backend.database.models import User
from backend.services.admin_service import get_dashboard_stats
from backend.services.rag_pipeline import get_pipeline, build_knowledge_base
from backend.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
def dashboard_stats(user: User = Depends(get_current_user)):
    return get_dashboard_stats()


@router.get("/kb/status")
def kb_status(user: User = Depends(get_current_user)):
    pipeline = get_pipeline()
    chunks = 0
    try:
        if pipeline.vectorstore:
            chunks = pipeline.vectorstore._collection.count()
    except (AttributeError, RuntimeError):
        pass  # collection not initialized yet
    return {"kb_ready": pipeline.vectorstore is not None, "chunks": int(chunks)}


@router.post("/kb/upload")
async def kb_upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload a knowledge document and rebuild the vector store."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")

    kb_dir = Path(settings.KB_DIR)
    kb_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded file
    file_path = kb_dir / file.filename
    content = await file.read()
    file_path.write_bytes(content)

    # Rebuild knowledge base
    try:
        build_knowledge_base(force=True)
        return {"ok": True, "filename": file.filename, "size": len(content)}
    except (OSError, ValueError, RuntimeError) as e:
        raise HTTPException(status_code=500, detail=f"知识库重建失败: {str(e)}")


@router.post("/kb/rebuild")
def kb_rebuild(user: User = Depends(get_current_user)):
    """Force rebuild the knowledge base from all documents."""
    try:
        build_knowledge_base(force=True)
        pipeline = get_pipeline()
        chunks = 0
        if pipeline.vectorstore:
            chunks = pipeline.vectorstore._collection.count()
        return {"ok": True, "chunks": int(chunks)}
    except (OSError, ValueError, RuntimeError) as e:
        raise HTTPException(status_code=500, detail=f"重建失败: {str(e)}")


@router.delete("/kb/document/{filename}")
def kb_delete_document(filename: str, user: User = Depends(get_current_user)):
    """Delete a document from the knowledge base and rebuild."""
    kb_dir = Path(settings.KB_DIR)
    file_path = kb_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    file_path.unlink()

    try:
        build_knowledge_base(force=True)
        return {"ok": True, "filename": filename}
    except (OSError, ValueError, RuntimeError) as e:
        raise HTTPException(status_code=500, detail=f"知识库重建失败: {str(e)}")


@router.get("/kb/documents")
def kb_list_documents(user: User = Depends(get_current_user)):
    """List all documents in the knowledge base directory."""
    kb_dir = Path(settings.KB_DIR)
    if not kb_dir.exists():
        return {"documents": []}

    docs = []
    for f in kb_dir.iterdir():
        if f.is_file():
            docs.append({
                "name": f.name,
                "size": f.stat().st_size,
                "type": f.suffix.replace(".", ""),
                "updated_at": f.stat().st_mtime,
            })
    return {"documents": sorted(docs, key=lambda d: d["updated_at"], reverse=True)}
