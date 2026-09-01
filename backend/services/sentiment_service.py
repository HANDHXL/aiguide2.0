"""Sentiment analysis service — uses LLM to score user messages 1-5."""

import re
from loguru import logger
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

from backend.config import settings

SENTIMENT_PROMPT = """分析以下游客消息的情感倾向，只回复一个数字1-5：
1=非常负面(抱怨/愤怒/不满)
2=比较负面(失望/着急)
3=中性(普通提问/事实询问)
4=比较正面(满意/感谢/开心)
5=非常正面(兴奋/赞美/高度认可)

注意：大多数普通提问属于中性(3分)，只有明显表达情绪的消息才给其他分数。

游客消息：{question}

情感分数（仅回复一个数字）："""

_llm = None


def _get_sentiment_llm() -> ChatOpenAI:
    """Get or create a lightweight LLM instance for sentiment scoring."""
    global _llm
    if _llm is not None:
        return _llm
    kwargs = {
        "model": settings.LLM_MODEL,
        "temperature": 0,
        "streaming": False,
        "timeout": 10.0,
        "max_retries": 1,
        "max_tokens": 5,
    }
    if settings.OPENAI_BASE_URL:
        kwargs["base_url"] = settings.OPENAI_BASE_URL
    if settings.OPENAI_API_KEY:
        kwargs["api_key"] = settings.OPENAI_API_KEY
    _llm = ChatOpenAI(**kwargs)
    return _llm


def analyze_sentiment(question: str) -> int:
    """Analyze the sentiment of a user message, returning a score 1-5.

    Returns 3 (neutral) on any error to avoid disrupting the chat flow.
    """
    try:
        llm = _get_sentiment_llm()
        prompt = SENTIMENT_PROMPT.format(question=question[:500])
        response = llm.invoke([HumanMessage(content=prompt)])
        text = response.content.strip() if hasattr(response, "content") else str(response).strip()

        # Extract first digit 1-5 from response
        match = re.search(r'[1-5]', text)
        if match:
            score = int(match.group(0))
            logger.debug(f"Sentiment score: {score} for question: {question[:80]}...")
            return score
        else:
            logger.warning(f"Could not parse sentiment from LLM response: {text!r}")
            return 3  # default to neutral
    except (ValueError, AttributeError, ConnectionError, TimeoutError) as e:
        logger.warning(f"Sentiment analysis failed: {e}")
        return 3  # default to neutral on error


def analyze_sentiment_async(question: str, message_id: int):
    """Fire-and-forget sentiment analysis — runs in a background thread and persists the score to DB.

    Use this in chat flows to avoid blocking the user while sentiment is computed.
    """
    import threading
    from backend.services.conversation_service import update_message_sentiment

    def _run():
        try:
            score = analyze_sentiment(question)
            update_message_sentiment(message_id, score)
            logger.debug(f"Sentiment score {score} persisted for message {message_id}")
        except (ValueError, AttributeError, ConnectionError, TimeoutError, OSError) as e:
            logger.warning(f"Async sentiment analysis failed for message {message_id}: {e}")
            # Silently fail — sentiment is non-critical; defaults to NULL in DB

    t = threading.Thread(target=_run, daemon=True)
    t.start()
