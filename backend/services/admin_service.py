"""Admin dashboard statistics service."""

from datetime import datetime, timedelta
from collections import Counter
from sqlalchemy import func
from backend.database import SessionLocal
from backend.database.models import Conversation, Message, User


def get_dashboard_stats() -> dict:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())

        # Service counts
        today_msgs = db.query(func.count(Message.id)).filter(
            Message.created_at >= today_start
        ).scalar() or 0

        week_msgs = db.query(func.count(Message.id)).filter(
            Message.created_at >= week_start
        ).scalar() or 0

        total_convs = db.query(func.count(Conversation.id)).scalar() or 0
        total_msgs = db.query(func.count(Message.id)).scalar() or 0
        total_users = db.query(func.count(User.id)).scalar() or 0

        # Daily trend (last 7 days)
        trend = []
        for i in range(6, -1, -1):
            day = today_start - timedelta(days=i)
            day_end = day + timedelta(days=1)
            cnt = db.query(func.count(Message.id)).filter(
                Message.created_at >= day,
                Message.created_at < day_end
            ).scalar() or 0
            trend.append({
                "date": day.strftime("%m/%d"),
                "count": cnt,
            })

        # Hot questions (top user messages, excluding duplicates)
        user_msgs = db.query(Message.content).filter(
            Message.role == "user"
        ).order_by(Message.created_at.desc()).limit(200).all()
        counter = Counter(m[0][:30] for m in user_msgs)
        hot_questions = [
            {"question": q, "count": c}
            for q, c in counter.most_common(10)
            if len(q.strip()) >= 3
        ][:5]

        # KB status — check ChromaDB directly
        kb_chunks = 0
        kb_ready = False
        try:
            import chromadb
            from backend.config import settings
            client = chromadb.PersistentClient(path=str(settings.VECTOR_DB_DIR))
            collections = client.list_collections()
            if collections:
                kb_chunks = collections[0].count()
                kb_ready = kb_chunks > 0
        except (ImportError, FileNotFoundError, OSError) as e:
            print(f"[AdminStats] KB check error: {e}")

        # Real sentiment analysis — aggregate sentiment_score from user messages this week
        sentiment_rows = db.query(Message.sentiment_score, func.count(Message.id)).filter(
            Message.role == "user",
            Message.sentiment_score.isnot(None),
            Message.created_at >= week_start
        ).group_by(Message.sentiment_score).all()

        score_counts = {row[0]: row[1] for row in sentiment_rows}
        total_with_sentiment = sum(score_counts.values()) or 1
        satisfied_count = score_counts.get(5, 0) + score_counts.get(4, 0)
        neutral_count = score_counts.get(3, 0)
        unsatisfied_count = score_counts.get(2, 0) + score_counts.get(1, 0)
        satisfied_pct = round((satisfied_count / total_with_sentiment) * 100)
        neutral_pct = round((neutral_count / total_with_sentiment) * 100)
        unsatisfied_pct = 100 - satisfied_pct - neutral_pct

        # Per-day sentiment trend (last 7 days)
        sentiment_trend = []
        for i in range(6, -1, -1):
            day = today_start - timedelta(days=i)
            day_end = day + timedelta(days=1)
            day_rows = db.query(Message.sentiment_score, func.count(Message.id)).filter(
                Message.role == "user",
                Message.sentiment_score.isnot(None),
                Message.created_at >= day,
                Message.created_at < day_end
            ).group_by(Message.sentiment_score).all()
            day_counts = {r[0]: r[1] for r in day_rows}
            day_total = sum(day_counts.values()) or 1
            sentiment_trend.append({
                "date": day.strftime("%m/%d"),
                "satisfied": round(((day_counts.get(5, 0) + day_counts.get(4, 0)) / day_total) * 100),
                "neutral": round((day_counts.get(3, 0) / day_total) * 100),
                "unsatisfied": round(((day_counts.get(2, 0) + day_counts.get(1, 0)) / day_total) * 100),
            })

        # Service suggestions based on data
        suggestions = []
        if unsatisfied_pct > 10:
            suggestions.append("部分游客感到不满意，建议补充知识库高频问题并优化回答质量")
        if total_convs > 0 and today_msgs == 0:
            suggestions.append("今日暂无交互，确认系统运行状态")
        if kb_chunks < 50:
            suggestions.append(f"知识库文档偏少(当前{int(kb_chunks)}块)，建议上传更多景区资料")
        if satisfied_pct >= 80 and total_with_sentiment >= 5:
            suggestions.append("游客整体满意度良好，继续保持服务质量")
        if not suggestions:
            suggestions.append("系统运行良好，游客满意度稳定")
            suggestions.append("可定期更新知识库内容，保持信息时效性")

        return {
            "today_visits": today_msgs,
            "week_visits": week_msgs,
            "total_conversations": total_convs,
            "total_messages": total_msgs,
            "total_users": total_users,
            "satisfaction": {"satisfied": satisfied_pct, "neutral": neutral_pct, "unsatisfied": unsatisfied_pct},
            "trend": trend,
            "sentiment_trend": sentiment_trend,
            "hot_questions": hot_questions,
            "kb_ready": kb_ready,
            "kb_chunks": int(kb_chunks),
            "suggestions": suggestions,
        }
    finally:
        db.close()
