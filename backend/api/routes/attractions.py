"""Attraction routes — info, search, and personalized recommendations."""

from fastapi import APIRouter, Query
from loguru import logger

from backend.schemas.chat import RecommendRequest, RecommendResponse, RouteStep
from backend.services.chat_service import recommend_route, _get_pipeline

router = APIRouter(prefix="/attractions", tags=["attractions"])


@router.get("", summary="搜索景点信息")
async def search_attractions(
    q: str = Query(..., description="搜索关键词"),
    k: int = Query(5, ge=1, le=10, description="返回结果数")
):
    """基于知识库检索景点信息"""
    pipeline = _get_pipeline()
    results = pipeline.similarity_search(q, k=k)
    return {
        "query": q,
        "count": len(results),
        "results": results
    }


@router.post("/recommend", response_model=RecommendResponse, summary="个性化路线推荐")
async def recommend(req: RecommendRequest):
    """根据兴趣推荐游览路线"""
    result = recommend_route(req.interest, req.duration or "半天")

    steps = []
    for s in result.get("steps", []):
        steps.append(RouteStep(
            order=s.get("order", 0),
            attraction_id=s.get("attraction_id", f"LS-{s.get('order', 0):03d}"),
            attraction_name=s.get("attraction_name", ""),
            duration_minutes=s.get("duration_minutes", 30),
            description=s.get("description", ""),
            lat=s.get("lat"),
            lng=s.get("lng"),
        ))

    return RecommendResponse(
        interest=result["interest"],
        route_name=result.get("route_name", "推荐路线"),
        steps=steps,
        total_duration=result.get("total_duration", "约2小时"),
        tips=result.get("tips", []),
    )
