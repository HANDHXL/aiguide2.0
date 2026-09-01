"""Map routes — 景区地图数据（景点坐标、附近景点查询）。"""

from typing import List

from fastapi import APIRouter, Query

from backend.schemas.chat import MapAttraction, NearbyResult
from backend.services import map_service

router = APIRouter(prefix="/map", tags=["map"])


@router.get("/attractions", response_model=List[MapAttraction], summary="景区景点坐标列表")
async def attractions():
    """返回全部景点及经纬度，供前端地图打点。"""
    return [MapAttraction(**a) for a in map_service.get_all_attractions()]


@router.get("/nearby", response_model=List[NearbyResult], summary="附近景点查询")
async def nearby(
    lat: float = Query(..., ge=-90, le=90, description="纬度"),
    lng: float = Query(..., ge=-180, le=180, description="经度"),
    radius: float = Query(1.5, ge=0.1, le=10, description="搜索半径（公里）"),
):
    """根据游客定位返回半径内景点，按距离升序。"""
    return [NearbyResult(**r) for r in map_service.get_nearby(lat, lng, radius)]
