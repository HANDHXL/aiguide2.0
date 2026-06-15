"""Chat service — wraps the RAG pipeline with business logic."""

from typing import Optional, Dict, List
from loguru import logger

from backend.services.rag_pipeline import RAGPipeline
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
        except Exception as e:
            logger.warning(f"LLM not available: {e}. Falling back to retrieval-only mode.")
    return _pipeline


def is_kb_ready() -> bool:
    """Check if knowledge base is loaded."""
    return _pipeline is not None and _pipeline.vectorstore is not None


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
    except Exception as e:
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
    except Exception as e:
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


def recommend_route(interest: str, duration: str = "半天") -> Dict:
    """Recommend a personalized tour route based on interest."""

    routes = {
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

    route = routes.get(interest, routes["历史"])
    return {"interest": interest, **route}
