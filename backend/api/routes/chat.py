"""Chat routes — REST and WebSocket endpoints for tourist Q&A (multi-turn)."""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from loguru import logger

from backend.schemas.chat import ChatRequest, ChatResponse
from backend.services.chat_service import chat_with_history, is_kb_ready
from backend.services.rag_pipeline import get_pipeline
from backend.services import conversation_service
from backend.services.auth_service import decode_token, get_user_by_id
from backend.api.dependencies import get_current_user
from backend.database.models import User

router = APIRouter(prefix="/chat", tags=["chat"])


def _handle_chat(question: str, user: User, conversation_id: int | None, interest=None, persona=None, name=None):
    """Shared logic: save user msg, auto-create conv, load history, call LLM, save assistant msg."""
    # 1. Ensure conversation exists
    conv = None
    if conversation_id:
        conv = conversation_service.get_conversation(conversation_id, user.id)
        if not conv:
            conversation_id = None  # fallback: create new

    if conversation_id is None:
        conv = conversation_service.create_conversation(user.id)
        conversation_id = conv.id

    # 2. Save user message
    conversation_service.add_message(conversation_id, "user", question)

    # 3. Auto-title if first message
    msgs = conversation_service.get_conversation_messages(conversation_id)
    if len(msgs) <= 1:
        conversation_service.auto_title_conversation(conversation_id, question)

    # 4. Load history (exclude the just-saved user message)
    history = conversation_service.get_history_for_llm(conversation_id, max_turns=10)
    if history and history[-1]["role"] == "user":
        history.pop()  # Remove the current question from history

    # 5. Call LLM with history
    result = chat_with_history(question, history=history, interest=interest, persona=persona, name=name)

    # 6. Save assistant message
    conversation_service.add_message(
        conversation_id, "assistant", result["answer"],
        sources=result.get("sources")
    )

    return result, conversation_id


@router.post("", response_model=ChatResponse, summary="文本问答（多轮对话）")
async def text_chat(req: ChatRequest, user: User = Depends(get_current_user)):
    result, conv_id = _handle_chat(
        req.question, user, req.conversation_id,
        interest=req.interest, persona=req.persona, name=req.name
    )
    return ChatResponse(
        question=result["question"],
        answer=result["answer"],
        sources=result.get("sources", []),
        conversation_id=conv_id
    )


@router.websocket("/ws")
async def ws_chat(ws: WebSocket):
    """WebSocket 实时流式多轮对话"""
    # Auth: extract token from query params before accepting
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4001, reason="Missing auth token")
        return
    try:
        payload = decode_token(token)
        user = get_user_by_id(int(payload["sub"]))
        if not user:
            await ws.close(code=4001, reason="Invalid user")
            return
    except Exception:
        await ws.close(code=4001, reason="Invalid token")
        return

    await ws.accept()
    logger.info(f"WebSocket client connected: user={user.username}")

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            question = data.get("question", "")
            conversation_id = data.get("conversation_id")
            interest = data.get("interest")
            persona = data.get("persona")
            name = data.get("name")

            if not question:
                await ws.send_json({"type": "error", "message": "问题不能为空"})
                continue

            # --- Conversation management ---
            conv = None
            if conversation_id:
                conv = conversation_service.get_conversation(conversation_id, user.id)
                if not conv:
                    conversation_id = None

            if conversation_id is None:
                conv = conversation_service.create_conversation(user.id)
                conversation_id = conv.id

            conversation_service.add_message(conversation_id, "user", question)

            msgs = conversation_service.get_conversation_messages(conversation_id)
            if len(msgs) <= 1:
                conversation_service.auto_title_conversation(conversation_id, question)

            history = conversation_service.get_history_for_llm(conversation_id, max_turns=10)
            if history and history[-1]["role"] == "user":
                history.pop()

            # --- Build enhanced question ---
            enhanced = question
            if persona:
                prefix = f"[系统指令：你的名字是{name}。{persona}]\n" if name else f"[系统指令：{persona}]\n"
                enhanced = prefix + question
            if interest:
                interest_map = {
                    "历史": "请特别关注历史背景和文化典故。",
                    "自然风光": "请重点描述自然景观和生态环境。",
                    "佛教文化": "请着重介绍佛教文化和宗教意义。",
                    "建筑艺术": "请重点说明建筑特色和艺术价值。",
                    "亲子娱乐": "请侧重推荐适合家庭亲子的活动。",
                }
                suffix = interest_map.get(interest, "")
                if suffix:
                    enhanced = f"{enhanced}\n{suffix}"

            await ws.send_json({"type": "status", "status": "thinking"})
            await ws.send_json({"type": "conversation_id", "conversation_id": conversation_id})

            try:
                pipeline = get_pipeline()
                if pipeline.vectorstore is None:
                    pipeline.load_vectorstore()

                full_answer = []
                async for chunk in pipeline.query_stream_async(enhanced, history):
                    if "token" in chunk:
                        full_answer.append(chunk["token"])
                        await ws.send_json({"type": "token", "content": chunk["token"]})
                    elif chunk.get("done"):
                        # Save assistant message
                        conversation_service.add_message(
                            conversation_id, "assistant", chunk["answer"],
                            sources=chunk.get("sources")
                        )
                        await ws.send_json({
                            "type": "done",
                            "answer": chunk["answer"],
                            "sources": chunk.get("sources", []),
                            "conversation_id": conversation_id
                        })
            except Exception as e:
                logger.error(f"Stream error: {e}")
                await ws.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except json.JSONDecodeError:
        await ws.send_json({"type": "error", "message": "无效的JSON格式"})
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@router.get("/status", summary="知识库状态")
async def chat_status():
    return {"kb_ready": is_kb_ready()}
