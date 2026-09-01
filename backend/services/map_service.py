"""景区地图服务 — 灵山胜境景点坐标数据源与地理计算。

坐标说明：全部 16 个点位取自高德官方 POI 数据（GCJ-02 坐标系，与高德地图显示一致），
2026-09 经高德 Web服务 API place/text 接口校准。
真实布局：南入口（古竹路游客中心）→ 中轴景点北上 → 灵山大佛（西北），
梵宫/五印坛城/曼飞龙塔在东侧。
实际布点如需微调，只需修改本文件 ATTRACTIONS 中的坐标即可。
"""

import math
from typing import Dict, List, Optional

# ---- 景点坐标表（单一数据源） ----
ATTRACTIONS: List[Dict] = [
    {
        "id": "LS-001",
        "name": "照壁广场",
        "aliases": ["照壁", "灵山胜境照壁"],
        "lat": 31.421388, "lng": 120.102499,
        "category": "入口广场",
        "description": "景区入口广场，赵朴初题写'灵山胜境'石刻，可远眺太湖",
    },
    {
        "id": "LS-002",
        "name": "五明桥",
        "aliases": ["五明桥"],
        "lat": 31.421749, "lng": 120.102248,
        "category": "入口景观",
        "description": "五座汉白玉石桥，象征佛教五明智慧",
    },
    {
        "id": "LS-003",
        "name": "洗心池",
        "aliases": ["洗心池"],
        "lat": 31.422402, "lng": 120.101604,
        "category": "入口景观",
        "description": "入寺前净手洗心，寓意洗净尘世烦恼",
    },
    {
        "id": "LS-004",
        "name": "五门",
        "aliases": ["五智门", "五方门"],
        "lat": 31.423055, "lng": 120.101292,
        "category": "建筑艺术",
        "description": "五方五佛石牌楼，佛教建筑艺术代表作",
    },
    {
        "id": "LS-005",
        "name": "菩提大道",
        "aliases": ["菩提大道"],
        "lat": 31.423182, "lng": 120.101143,
        "category": "自然景观",
        "description": "两侧菩提树夹道，连接五门与九龙灌浴广场",
    },
    {
        "id": "LS-006",
        "name": "九龙灌浴",
        "aliases": ["九龙灌浴广场", "九龙灌浴表演", "太子佛", "太子像"],
        "lat": 31.424601, "lng": 120.099984,
        "category": "动态演出",
        "description": "佛祖诞生动态演出，九龙喷水沐浴太子像，气势恢宏",
    },
    {
        "id": "LS-007",
        "name": "降魔浮雕",
        "aliases": ["降魔成道", "降魔图"],
        "lat": 31.425559, "lng": 120.099569,
        "category": "佛教文化",
        "description": "大型浮雕再现佛祖降魔成道的场景",
    },
    {
        "id": "LS-008",
        "name": "阿育王柱",
        "aliases": ["阿育王柱"],
        "lat": 31.426188, "lng": 120.099261,
        "category": "佛教文化",
        "description": "仿印度阿育王石柱，佛教文化的重要符号",
    },
    {
        "id": "LS-009",
        "name": "天下第一掌",
        "aliases": ["佛手", "天下第一手"],
        "lat": 31.426957, "lng": 120.098366,
        "category": "亲子互动",
        "description": "与灵山大佛右手等比复制，摸佛手祈福，互动拍照热门点",
    },
    {
        "id": "LS-010",
        "name": "祥符禅寺",
        "aliases": ["祥符寺", "祥符禅寺"],
        "lat": 31.427949, "lng": 120.098012,
        "category": "佛教文化",
        "description": "千年古刹，唐宋名刹旧址，玄奘法师与灵山渊源所在",
    },
    {
        "id": "LS-011",
        "name": "登云道",
        "aliases": ["登云道"],
        "lat": 31.430287, "lng": 120.096402,
        "category": "自然景观",
        "description": "登山步道，拾级而上直达大佛脚下，共216级台阶",
    },
    {
        "id": "LS-012",
        "name": "灵山大佛",
        "aliases": ["大佛", "灵山大佛", "88米大佛", "佛脚", "佛脚平台", "抱佛脚", "大佛平台"],
        "lat": 31.430194, "lng": 120.096477,
        "category": "核心景点",
        "description": "88米青铜释迦牟尼立像，世界最高青铜佛像之一，登顶抱佛脚俯瞰太湖",
    },
    {
        "id": "LS-013",
        "name": "梵宫",
        "aliases": ["灵山梵宫", "梵宫"],
        "lat": 31.428218, "lng": 120.102420,
        "category": "建筑艺术",
        "description": "'东方卢浮宫'，木雕壁画琉璃錾铜集大成，佛教艺术殿堂",
    },
    {
        "id": "LS-014",
        "name": "五印坛城",
        "aliases": ["坛城", "五印坛城"],
        "lat": 31.424676, "lng": 120.103054,
        "category": "建筑艺术",
        "description": "藏传佛教艺术殿堂，鎏金铜瓦金碧辉煌",
    },
    {
        "id": "LS-015",
        "name": "曼飞龙塔",
        "aliases": ["曼飞龙塔", "白塔"],
        "lat": 31.426070, "lng": 120.104609,
        "category": "建筑艺术",
        "description": "南传佛教建筑风格代表，塔群与园林相映成趣",
    },
    {
        "id": "LS-016",
        "name": "景区入口",
        "aliases": ["入口", "大门", "游客中心", "游客服务中心", "灵山胜境入口"],
        "lat": 31.420196, "lng": 120.103651,
        "category": "服务设施",
        "description": "灵山胜境游客中心，购票入园、咨询导览",
    },
]

# 景区中心点（默认地图视野，覆盖全部 16 个点位）
SCENIC_CENTER = {"lat": 31.4252, "lng": 120.1005}

# 演示模式模拟定位点（景区入口 / 游客中心）
SIMULATED_LOCATION = {"lat": 31.420196, "lng": 120.103651}


# ---- 名称匹配 ----
_NAME_INDEX: Dict[str, Dict] = {}


def _normalize_name(name: str) -> str:
    """规范化景点名称：去掉括号、空白与常见后缀，便于模糊匹配。"""
    name = name.replace("（", "(").replace("）", ")")
    if "(" in name:
        name = name[: name.index("(")]
    return name.strip()


def _build_index():
    if _NAME_INDEX:
        return
    for a in ATTRACTIONS:
        _NAME_INDEX[_normalize_name(a["name"])] = a
        for alias in a.get("aliases", []):
            _NAME_INDEX[_normalize_name(alias)] = a


def match_attraction(name: str) -> Optional[Dict]:
    """按名称匹配景点，返回坐标信息（精确 → 别名 → 双向子串）。"""
    if not name:
        return None
    _build_index()
    norm = _normalize_name(name)
    if norm in _NAME_INDEX:
        return _NAME_INDEX[norm]
    # 子串双向匹配：处理 LLM 输出如 "灵山大佛景区" / "大佛脚下"
    for key, attraction in _NAME_INDEX.items():
        if len(key) >= 2 and (key in norm or norm in key):
            return attraction
    return None


def get_all_attractions() -> List[Dict]:
    """返回全部景点（去掉 aliases 字段，直接可序列化）。"""
    return [
        {k: v for k, v in a.items() if k != "aliases"}
        for a in ATTRACTIONS
    ]


def get_attraction_names() -> List[str]:
    """返回全部景点正式名称（用于路线生成提示词约束）。"""
    return [a["name"] for a in ATTRACTIONS]


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """两经纬度点间的球面距离（米）。"""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def get_nearby(lat: float, lng: float, radius_km: float = 1.5) -> List[Dict]:
    """按距离排序返回半径内的景点（附带 distance_m）。"""
    results = []
    for a in ATTRACTIONS:
        dist = haversine_m(lat, lng, a["lat"], a["lng"])
        if dist <= radius_km * 1000:
            item = {k: v for k, v in a.items() if k != "aliases"}
            item["distance_m"] = round(dist)
            results.append(item)
    results.sort(key=lambda x: x["distance_m"])
    return results


def attach_coords_to_steps(steps: List[Dict]) -> List[Dict]:
    """为路线步骤补充经纬度（匹配失败时 lat/lng 为 None）。"""
    enriched = []
    for s in steps:
        item = dict(s)
        match = match_attraction(s.get("attraction_name", ""))
        item["lat"] = match["lat"] if match else None
        item["lng"] = match["lng"] if match else None
        enriched.append(item)
    return enriched
