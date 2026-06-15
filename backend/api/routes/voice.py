"""Voice routes — ASR speech-to-text, TTS text-to-speech, and voice chat."""

import base64
import tempfile
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from loguru import logger

from backend.schemas.chat import ChatResponse
from backend.services.chat_service import chat
from backend.services.tts_service import text_to_speech
from backend.services.asr_service import speech_to_text

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/asr", summary="语音识别 (ASR)")
async def asr(audio: UploadFile = File(...)):
    """上传音频文件，返回识别文字。接受 WAV/PCM/MP3。"""
    if not audio.filename:
        raise HTTPException(400, "No audio file provided")

    try:
        raw = await audio.read()
        # Convert to PCM 16kHz 16bit mono if needed
        audio_bytes = _ensure_pcm(raw, audio.filename)
        text = await speech_to_text(audio_bytes)
        return {"success": True, "text": text}
    except Exception as e:
        logger.error(f"ASR failed: {e}")
        raise HTTPException(500, f"Speech recognition failed: {e}")


@router.post("/tts", summary="语音合成 (TTS)")
async def tts(text: str = Form(...), voice: str = Form("xiaoyan"), speed: float = Form(1.0)):
    """将文字转为语音，返回 MP3 音频流。"""
    if not text.strip():
        raise HTTPException(400, "Text is empty")

    try:
        # Convert speed (0.5-2.0) to Edge TTS rate (-50% to +100%)
        rate = max(-50, min(100, int((speed - 1.0) * 100)))
        audio_bytes = await text_to_speech(text, voice=voice, speed=rate)
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=tts.mp3"}
        )
    except Exception as e:
        logger.error(f"TTS failed: {e}")
        raise HTTPException(500, f"Speech synthesis failed: {e}")


@router.post("/chat", summary="语音对话 (ASR → RAG → TTS)")
async def voice_chat(
    audio: UploadFile = File(..., description="录音文件"),
    interest: str = Form(""),
):
    """上传语音 → 识别 → 问答 → 合成语音 → 返回文字+音频"""
    try:
        # Step 1: ASR
        raw = await audio.read()
        audio_bytes = _ensure_pcm(raw, audio.filename)
        question = await speech_to_text(audio_bytes)
        logger.info(f"ASR question: {question}")

        # Step 2: RAG Chat
        result = chat(question, interest=interest if interest else None)

        # Step 3: TTS on the answer
        tts_text = result["answer"][:500]  # Limit TTS length
        try:
            mp3_bytes = await text_to_speech(tts_text)
            audio_b64 = base64.b64encode(mp3_bytes).decode()
        except Exception as e:
            logger.warning(f"TTS failed ({e}), returning text-only response")
            mp3_bytes = None
            audio_b64 = None

        return {
            "success": True,
            "question": question,
            "answer": result["answer"],
            "sources": result.get("sources", []),
            "audio": audio_b64,  # base64 MP3
        }
    except Exception as e:
        logger.error(f"Voice chat failed: {e}")
        raise HTTPException(500, f"Voice chat failed: {e}")


def _ensure_pcm(data: bytes, filename: str) -> bytes:
    """使用 ffmpeg 将音频转为 16kHz 16bit mono PCM。"""
    import subprocess

    ext = Path(filename).suffix.lower()

    if ext in (".pcm", ".raw"):
        return data

    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-i", "pipe:0",
                "-f", "s16le", "-acodec", "pcm_s16le",
                "-ar", "16000", "-ac", "1",
                "pipe:1",
            ],
            input=data,
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0:
            stderr = proc.stderr.decode(errors="ignore")
            logger.warning(f"ffmpeg conversion failed: {stderr[:200]}")
            return data
        return proc.stdout
    except FileNotFoundError:
        logger.warning("ffmpeg not found, returning raw data as-is")
        return data
    except Exception as e:
        logger.warning(f"Audio conversion error ({e}), returning raw data")
        return data
