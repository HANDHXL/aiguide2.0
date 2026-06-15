"""讯飞语音听写 (ASR) — WebSocket-based streaming API."""

import hashlib
import hmac
import base64
import json
import time
from datetime import datetime, timezone
from loguru import logger

from backend.config import settings


def _build_auth_url(host: str, path: str) -> str:
    """Build the signed WebSocket URL for 讯飞 ASR API."""
    now = datetime.now(timezone.utc)
    date = now.strftime("%a, %d %b %Y %H:%M:%S GMT")

    signature_origin = f"host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
    signature_sha = hmac.new(
        settings.XUNFEI_API_SECRET.encode("utf-8"),
        signature_origin.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    signature = base64.b64encode(signature_sha).decode()

    authorization = base64.b64encode(
        f'api_key="{settings.XUNFEI_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="{signature}"'.encode()
    ).decode()

    params = {
        "host": host,
        "date": date,
        "authorization": authorization,
    }
    return f"wss://{host}{path}?{_urlencode(params)}"


def _urlencode(params: dict) -> str:
    """URL-encode query parameters, per 讯飞 auth spec."""
    from urllib.parse import quote
    pairs = []
    for k, v in params.items():
        pairs.append(f"{k}={quote(v, safe='')}")
    return "&".join(pairs)


async def speech_to_text(audio_data: bytes) -> str:
    """Convert speech audio (16kHz, 16bit, mono PCM) to text using 讯飞 ASR.

    audio_data: Raw PCM audio bytes (16kHz sample rate, 16bit, mono)
    """
    import asyncio
    import websockets

    host = "iat-api.xfyun.cn"
    path = "/v2/iat"
    url = _build_auth_url(host, path)

    result_text = []
    done = asyncio.Event()

    async def on_message(ws):
        """Receive and aggregate results."""
        async for raw in ws:
            msg = json.loads(raw)
            code = msg.get("code", 0)
            if code != 0:
                logger.error(f"ASR error: {msg}")
                done.set()
                return

            if "data" in msg and msg["data"].get("result"):
                data = msg["data"]
                ws_segments = data["result"].get("ws", [])
                for seg in ws_segments:
                    for cw in seg.get("cw", []):
                        w = cw.get("w", "")
                        if w:
                            result_text.append(w)

            if msg.get("data", {}).get("status") == 2:
                # Final frame
                done.set()

    try:
        async with websockets.connect(url, max_size=10 * 1024 * 1024) as ws:
            # Start receive task
            recv_task = asyncio.create_task(on_message(ws))

            # Send audio in chunks
            chunk_size = 1280  # 80ms at 16kHz 16bit mono
            total_len = len(audio_data)

            for offset in range(0, total_len, chunk_size):
                chunk = audio_data[offset:offset + chunk_size]
                status = 1 if offset + chunk_size < total_len else 2
                frame = {
                    "common": {"app_id": settings.XUNFEI_APP_ID},
                    "business": {
                        "language": "zh_cn",
                        "domain": "iat",
                        "accent": "mandarin",
                        "vad_eos": 3000,
                        "dwa": "wpgs",
                        "ptt": 1,
                    },
                    "data": {
                        "status": status,
                        "format": "audio/L16;rate=16000",
                        "encoding": "raw",
                        "audio": base64.b64encode(chunk).decode(),
                    },
                }
                await ws.send(json.dumps(frame))

            # Wait for final result
            try:
                await asyncio.wait_for(done.wait(), timeout=15.0)
            except asyncio.TimeoutError:
                logger.warning("ASR timed out, returning partial result")

            recv_task.cancel()
            try:
                await recv_task
            except asyncio.CancelledError:
                pass

    except Exception as e:
        logger.error(f"ASR connection error: {e}")
        raise RuntimeError(f"ASR failed: {e}")

    result = "".join(result_text)
    if not result:
        raise RuntimeError("ASR returned no text")

    logger.info(f"ASR result: {result[:100]}")
    return result
