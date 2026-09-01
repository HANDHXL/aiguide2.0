"""Chat service — wraps the RAG pipeline with business logic."""

import json
import re
from typing import Optional, Dict, List
from loguru import logger
from openai import APIError, APITimeoutError, APIConnectionError

from backend.services.rag_pipeline import RAGPipeline
from backend.services.map_service import attach_coords_to_steps, get_attraction_names
from backend.config import settings

# Lazy-loaded pipeline singleton
_pipeline: Optional[RAGPipeline] = None


def _get_pipeline() -> RAGPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RAGPipeline()
        try:
            _pipeline.load_vectorstore()
            logger.info("Vector store loaded from disk")
        except FileNotFoundError:
            logger.warning("Vector store not found, building from knowledge base...")
            _pipeline.build_knowledge_base()
        try:
            _pipeline.init_llm()
            logger.info("LLM initialized")
        except (APIConnectionError, APITimeoutError, ValueError) as e:
            logger.warning(f"LLM not available: {e}. Falling back to retrieval-only mode.")
    return _pipeline


def is_kb_ready() -> bool:
    """Check if knowledge base is loaded."""
    return _pipeline is not None and _pipeline.vectorstore is not None


# ---- Route intent keywords: detect if user is asking for tour planning ----
_ROUTE_INTENT_KEYWORDS = [
    "路线", "规划", "推荐路线", "游览路线", "怎么玩", "怎么逛",
    "安排", "行程", "游玩", "游览顺序", "游玩顺序", "攻略",
    "带老人", "带小孩", "带孩子", "亲子", "全家", "一日游",
    "半天", "一天", "快速游", "深度游", "帮我规划", "帮我安排",
]

_INTEREST_KEYWORDS = {
    "历史": ["历史", "古代", "千年", "朝代", "典故", "文化", "溯源"],
    "佛教文化": ["佛教", "佛", "朝圣", "参拜", "信仰", "宗教", "经文"],
    "建筑艺术": ["建筑", "艺术", "设计", "工艺", "雕刻", "壁画"],
    "自然风光": ["自然", "风景", "山水", "生态", "湖", "园林", "花草"],
    "亲子娱乐": ["亲子", "孩子", "老人", "家庭", "小孩", "全家", "互动"],
}

_DURATION_KEYWORDS = {
    "半天": ["半天", "半日", "3小时", "上午", "下午"],
    "一天": ["一天", "全天", "一日", "整天", "一整天"],
    "2小时": ["2小时", "快速", "短时间", "赶时间", "两小时"],
}


def _detect_route_intent(question: str) -> Optional[Dict]:
    """Check if the user message is asking for route planning.
    If so, extract interest + duration preferences and generate a route.
    Returns None if not a route request.
    """
    # Fast check: does the message mention route-related terms?
    has_route_intent = any(kw in question for kw in _ROUTE_INTENT_KEYWORDS)
    if not has_route_intent:
        return None

    # Extract interest: count keyword matches, pick the most matching category
    best_interest = "历史"  # default
    best_score = 0
    for interest, keywords in _INTEREST_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in question)
        if score > best_score:
            best_score = score
            best_interest = interest

    # Extract duration: similar scoring
    best_duration = "半天"  # default
    best_dur_score = 0
    for duration, keywords in _DURATION_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in question)
        if score > best_dur_score:
            best_dur_score = score
            best_duration = duration

    logger.info(f"Route intent detected: interest='{best_interest}' (score={best_score}), "
                f"duration='{best_duration}' (score={best_dur_score})")

    # Generate route
    try:
        route = recommend_route(best_interest, best_duration)
        return route
    except (APIConnectionError, APITimeoutError, json.JSONDecodeError, ValueError) as e:
        logger.warning(f"Route generation in chat flow failed: {e}")
        return None


def _enhance_question(question: str, interest: Optional[str] = None, persona: Optional[str] = None, name: Optional[str] = None) -> str:
    """Build persona prefix + interest suffix for the question."""
    persona_prefix = ""
    if persona:
        if name:
            persona_prefix = f"[系统指令：你的名字是{name}。{persona}]\n"
        else:
            persona_prefix = f"[系统指令：{persona}]\n"

    enhanced = persona_prefix + question
    if interest:
        interest_phrases = {
            "历史": "请特别关注历史背景和文化典故方面的信息。",
            "自然风光": "请重点描述自然景观和生态环境方面的信息。",
            "佛教文化": "请着重介绍佛教文化和宗教意义方面的信息。",
            "建筑艺术": "请重点说明建筑特色和艺术价值方面的信息。",
            "亲子娱乐": "请侧重推荐适合家庭亲子的活动和体验。",
        }
        suffix = interest_phrases.get(interest, "")
        if suffix:
            enhanced = f"{persona_prefix}{question}\n{suffix}"
    return enhanced


def chat(question: str, interest: Optional[str] = None, persona: Optional[str] = None, name: Optional[str] = None) -> Dict:
    """Answer a tourist question using RAG (single turn, no history)."""
    pipeline = _get_pipeline()
    enhanced = _enhance_question(question, interest, persona, name)

    try:
        result = pipeline.query(enhanced)
        return result
    except (APIConnectionError, APITimeoutError, APIError) as e:
        logger.error(f"LLM query failed: {e}")
        docs = pipeline.similarity_search(question, k=3)
        sources = [{
            "content": d["content"][:300],
            "source": d["source"],
            "type": d["type"]
        } for d in docs]
        return {
            "question": question,
            "answer": f"抱歉，AI模型暂不可用。以下是为您找到的相关信息：\n\n{docs[0]['content'][:500] if docs else '暂无相关信息'}",
            "sources": sources
        }


def chat_with_history(
    question: str,
    history: Optional[List[dict]] = None,
    interest: Optional[str] = None,
    persona: Optional[str] = None,
    name: Optional[str] = None
) -> Dict:
    """Answer a tourist question with conversation history for multi-turn context."""
    pipeline = _get_pipeline()
    enhanced = _enhance_question(question, interest, persona, name)

    try:
        result = pipeline.query(enhanced, history)
        return result
    except (APIConnectionError, APITimeoutError, APIError) as e:
        logger.error(f"LLM query with history failed: {e}")
        docs = pipeline.similarity_search(question, k=3)
        sources = [{
            "content": d["content"][:300],
            "source": d["source"],
            "type": d["type"]
        } for d in docs]
        return {
            "question": question,
            "answer": f"抱歉，AI模型暂不可用。以下是为您找到的相关信息：\n\n{docs[0]['content'][:500] if docs else '暂无相关信息'}",
            "sources": sources
        }


# ---- Fallback routes (used when LLM is unavailable) ----
_FALLBACK_ROUTES = {
    "历史": {
        "route_name": "千年佛缘·历史探源之旅",
        "steps": [
            {"order": 1, "attraction_name": "照壁广场", "duration_minutes": 15, "description": "细品赵朴初题写的'灵山胜境'石刻"},
            {"order": 2, "attraction_name": "五明桥", "duration_minutes": 10, "description": "了解五明智慧的文化内涵"},
            {"order": 3, "attraction_name": "降魔浮雕", "duration_minutes": 20, "description": "欣赏佛祖降魔成道的精美浮雕"},
            {"order": 4, "attraction_name": "祥符禅寺", "duration_minutes": 40, "description": "参观千年古刹，了解玄奘与灵山的渊源"},
            {"order": 5, "attraction_name": "灵山大佛", "duration_minutes": 60, "description": "登顶抱佛脚，俯瞰太湖壮景"},
        ],
        "total_duration": "约2.5小时"
    },
    "佛教文化": {
        "route_name": "佛国净土·朝圣参拜之旅",
        "steps": [
            {"order": 1, "attraction_name": "五印坛城", "duration_minutes": 50, "description": "藏传佛教艺术殿堂，鎏金铜瓦金碧辉煌"},
            {"order": 2, "attraction_name": "梵宫", "duration_minutes": 60, "description": "'东方卢浮宫'，佛教艺术集大成者"},
            {"order": 3, "attraction_name": "九龙灌浴", "duration_minutes": 30, "description": "观看佛祖诞生动态演出，沐浴圣水"},
            {"order": 4, "attraction_name": "灵山大佛", "duration_minutes": 50, "description": "88米青铜大佛，抱佛脚祈福"},
        ],
        "total_duration": "约3小时"
    },
    "建筑艺术": {
        "route_name": "匠心营造·建筑美学之旅",
        "steps": [
            {"order": 1, "attraction_name": "梵宫", "duration_minutes": 70, "description": "木雕、壁画、琉璃、錾铜等传统工艺集大成"},
            {"order": 2, "attraction_name": "五印坛城", "duration_minutes": 50, "description": "藏式建筑精品，鎏金铜瓦与彩绘"},
            {"order": 3, "attraction_name": "五门", "duration_minutes": 20, "description": "五方五佛的石牌楼建筑艺术"},
            {"order": 4, "attraction_name": "曼飞龙塔", "duration_minutes": 30, "description": "南传佛教建筑风格的代表"},
        ],
        "total_duration": "约3小时"
    },
    "自然风光": {
        "route_name": "山水灵境·自然生态之旅",
        "steps": [
            {"order": 1, "attraction_name": "照壁广场", "duration_minutes": 15, "description": "透过照壁远眺太湖，三山环抱"},
            {"order": 2, "attraction_name": "登云道", "duration_minutes": 30, "description": "漫步登山步道，感受灵山秀水"},
            {"order": 3, "attraction_name": "灵山大佛", "duration_minutes": 50, "description": "登顶俯瞰太湖和群山，风光无限"},
            {"order": 4, "attraction_name": "曼飞龙塔", "duration_minutes": 30, "description": "塔下园林与自然和谐共处"},
        ],
        "total_duration": "约2小时"
    },
    "亲子娱乐": {
        "route_name": "欢聚灵山·亲子欢乐之旅",
        "steps": [
            {"order": 1, "attraction_name": "九龙灌浴", "duration_minutes": 30, "description": "动态喷泉表演，孩子最爱"},
            {"order": 2, "attraction_name": "降魔浮雕", "duration_minutes": 20, "description": "讲故事般了解佛祖生平"},
            {"order": 3, "attraction_name": "阿育王柱", "duration_minutes": 15, "description": "认识佛教文化符号"},
            {"order": 4, "attraction_name": "天下第一掌", "duration_minutes": 20, "description": "摸佛手祈福，互动拍照"},
            {"order": 5, "attraction_name": "灵山大佛", "duration_minutes": 50, "description": "抱佛脚，全家合影留念"},
        ],
        "total_duration": "约2.5小时"
    },
}


# ---- Prompt: 将检索到的景点资料 + 用户偏好 → 游览路线 JSON ----
ROUTE_GENERATION_PROMPT = """你是灵山胜境的资深导游。请根据以下景点资料，为游客规划一条个性化游览路线。

【游客偏好】{interest}
【可用时间】{duration}
【景区资料】
{attraction_data}

请设计一条合理的游览路线，要求：
1. 路线名称：8-16字，诗意且有吸引力，体现主题
2. 景点顺序：按地理临近性排列（从入口向深处），避免折返
3. 景点数量：至少4个，最多6个。宁可多列也不要少列
4. 时间安排：每个景点标注建议停留时间（15-60分钟），所有景点时间之和应达到可用时间的70-80%（留出步行和休息）
5. 每个景点写一句推荐理由（15-30字），结合游客偏好突出亮点

严格按以下JSON格式输出（不要输出其他内容）：
{{
  "route_name": "路线名称",
  "steps": [
    {{"order": 1, "attraction_name": "景点名", "duration_minutes": 30, "description": "推荐理由"}},
    {{"order": 2, "attraction_name": "景点名", "duration_minutes": 45, "description": "推荐理由"}}
  ],
  "total_duration": "约X小时Y分钟",
  "tips": ["注意事项1", "注意事项2"]
}}"""


def _retrieve_attractions_for_interest(interest: str, k: int = 8) -> str:
    """Search the knowledge base for attractions relevant to the given interest."""
    interest_queries = {
        "历史": "灵山胜境 历史 祥符禅寺 玄奘 降魔浮雕 阿育王柱 照壁 千年古刹",
        "佛教文化": "灵山大佛 梵宫 五印坛城 九龙灌浴 佛教 朝圣 参拜",
        "建筑艺术": "梵宫 五印坛城 曼飞龙塔 建筑 木雕 壁画 琉璃 工艺",
        "自然风光": "灵山 太湖 登云道 菩提大道 自然景观 山水 园林",
        "亲子娱乐": "九龙灌浴 天下第一掌 降魔浮雕 亲子 互动 体验 表演",
    }
    query = interest_queries.get(interest, f"灵山胜境 {interest}")
    pipeline = _get_pipeline()
    results = pipeline.similarity_search(query, k=k)
    parts = []
    for i, r in enumerate(results):
        parts.append(f"[{i+1}] {r['content'][:400]}")
    return "\n\n".join(parts)


def _parse_route_json(raw_text: str) -> Optional[Dict]:
    """Extract JSON from LLM response, validate, and fix inconsistencies."""
    json_match = re.search(r'\{[\s\S]*\}', raw_text)
    if not json_match:
        return None
    json_str = json_match.group(0)
    # Repair common LLM JSON formatting mistakes
    json_str = re.sub(r',\s*}', '}', json_str)       # trailing comma before }
    json_str = re.sub(r',\s*]', ']', json_str)       # trailing comma before ]
    json_str = re.sub(r'}\s*{', '},{', json_str)     # missing comma between objects
    # Fix unquoted property names like {route_name: "x"} -> {"route_name": "x"}
    json_str = re.sub(r'(?<=\{|\s)([a-z_]+):', r'"\1":', json_str)
    try:
        data = json.loads(json_str)
        if "route_name" not in data or "steps" not in data:
            return None
        steps = data["steps"]
        if not isinstance(steps, list) or len(steps) == 0:
            return None
        # Ensure each step has required fields
        for i, s in enumerate(steps):
            s.setdefault("order", i + 1)
            s.setdefault("attraction_name", "景点")
            s.setdefault("duration_minutes", 30)
            s.setdefault("description", "")
        # Compute total_duration from step times (don't trust LLM arithmetic)
        total_minutes = sum(s["duration_minutes"] for s in steps)
        if total_minutes >= 360:
            hours = total_minutes // 60
            mins = total_minutes % 60
            data["total_duration"] = f"约{hours}小时{f'{mins}分钟' if mins else ''}"
        elif total_minutes >= 60:
            hours = total_minutes // 60
            mins = total_minutes % 60
            data["total_duration"] = f"约{hours}小时{f'{mins}分钟' if mins else ''}"
        else:
            data["total_duration"] = f"约{total_minutes}分钟"
        return data
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        logger.warning(f"Failed to parse route JSON: {e}")
        logger.debug(f"Raw LLM output (first 500 chars): {json_str[:500]}")
        return None


def recommend_route(interest: str, duration: str = "半天") -> Dict:
    """Recommend a personalized tour route.

    Uses LLM + knowledge base to dynamically generate a route tailored to
    the visitor's interest and available time. Falls back to pre-built
    routes when LLM is unavailable or returns an under-stuffed route.
    """
    pipeline = _get_pipeline()

    # Minimum stop counts per duration category
    min_stops = {"半天": 4, "一天": 5, "2小时": 3, "灵活": 4}

    try:
        # 1. Retrieve relevant attraction data
        attraction_data = _retrieve_attractions_for_interest(interest)
        logger.info(f"Retrieved {len(attraction_data)} chars of attraction data for interest='{interest}'")

        # 2. Build prompt
        duration_labels = {
            "半天": "半天（约3-4小时），请安排4-6个景点，总游览时间约150-200分钟",
            "一天": "全天（约6-8小时），请安排5-6个景点，总游览时间约350-450分钟",
            "2小时": "快速游（约2小时），请安排3-4个景点，总游览时间约100-120分钟",
            "灵活": "灵活安排（约3-6小时），请安排4-6个景点",
        }
        duration_desc = duration_labels.get(duration, duration)
        prompt = ROUTE_GENERATION_PROMPT.format(
            interest=interest,
            duration=duration_desc,
            attraction_data=attraction_data[:3000]
        )
        # 约束景点名称：保证生成的路线能映射到地图坐标
        names = get_attraction_names()
        prompt += (
            f"\n\n【可选景点名称】路线中的 attraction_name 必须严格从以下名称中选择，"
            f"不得自创、不得改名：\n{'、'.join(names)}"
        )

        # 3. Call LLM with larger token limit for route JSON
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage
        route_llm_kwargs = {
            "model": settings.LLM_MODEL,
            "temperature": 0.3,
            "streaming": False,
            "timeout": 20.0,
            "max_retries": 1,
            "max_tokens": 600,  # larger than default 300 — route JSON needs more tokens
        }
        if settings.OPENAI_BASE_URL:
            route_llm_kwargs["base_url"] = settings.OPENAI_BASE_URL
        if settings.OPENAI_API_KEY:
            route_llm_kwargs["api_key"] = settings.OPENAI_API_KEY
        route_llm = ChatOpenAI(**route_llm_kwargs)
        response = route_llm.invoke([HumanMessage(content=prompt)])
        raw_text = response.content.strip() if hasattr(response, "content") else str(response).strip()

        # 4. Parse and validate
        parsed = _parse_route_json(raw_text)
        required_min = min_stops.get(duration, 3)
        if parsed and len(parsed["steps"]) >= required_min:
            parsed["interest"] = interest
            if "tips" not in parsed:
                parsed["tips"] = ["请提前查看景区公告确认表演时间和开放情况"]
            parsed["steps"] = attach_coords_to_steps(parsed["steps"])
            logger.info(f"Dynamic route generated: {parsed['route_name']} ({len(parsed['steps'])} stops)")
            return parsed
        elif parsed:
            logger.warning(f"Route has only {len(parsed['steps'])} stops (need {required_min}), retrying with stronger prompt")
            # Retry with explicit stop count requirement
            retry_prompt = prompt + f"\n\n重要提示：必须至少包含{required_min}个景点，目前只规划了{len(parsed['steps'])}个，太少了！请重新规划。"
            try:
                response2 = route_llm.invoke([HumanMessage(content=retry_prompt)])
                raw_text2 = response2.content.strip() if hasattr(response2, "content") else str(response2).strip()
                parsed2 = _parse_route_json(raw_text2)
                if parsed2 and len(parsed2["steps"]) >= required_min:
                    parsed2["interest"] = interest
                    if "tips" not in parsed2:
                        parsed2["tips"] = ["请提前查看景区公告确认表演时间和开放情况"]
                    parsed2["steps"] = attach_coords_to_steps(parsed2["steps"])
                    logger.info(f"Retry succeeded: {parsed2['route_name']} ({len(parsed2['steps'])} stops)")
                    return parsed2
            except (APIConnectionError, APITimeoutError, json.JSONDecodeError):
                pass
            logger.warning(f"Retry also failed, falling back to static routes")
    except (APIConnectionError, APITimeoutError, json.JSONDecodeError, ValueError, FileNotFoundError) as e:
        logger.warning(f"Dynamic route generation failed: {e}, falling back to static routes")

    # Fallback to hardcoded routes
    route = _FALLBACK_ROUTES.get(interest, _FALLBACK_ROUTES["历史"])
    route["steps"] = attach_coords_to_steps(route["steps"])
    return {"interest": interest, **route}
