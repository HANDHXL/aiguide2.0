"""语音合成 (TTS) — Edge TTS 为主，讯飞 TTS 为备选."""

import io
from loguru import logger

from backend.config import settings


async def text_to_speech(text: str, voice: str = "zh-CN-XiaoyiNeural", speed: int = 0) -> bytes:
    """Convert Chinese text to MP3 speech audio using Edge TTS (free, no key needed).

    Returns MP3 audio bytes.
    """
    try:
        import edge_tts

        # Map our voice names to Edge TTS voices
        voice_map = {
            "xiaoyan": "zh-CN-XiaoyiNeural",     # 小艺 - 亲切女声
            "xiaofeng": "zh-CN-YunxiNeural",     # 云希 - 男声
            "xiaoyan2": "zh-CN-XiaoxiaoNeural",  # 晓晓 - 温柔女声
            "male": "zh-CN-YunyangNeural",       # 云扬 - 专业男声
        }
        edge_voice = voice_map.get(voice, voice)

        rate_str = f"{speed:+d}%" if speed != 0 else "+0%"

        communicate = edge_tts.Communicate(text, edge_voice, rate=rate_str)
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])

        if not audio_chunks:
            raise RuntimeError("Edge TTS produced no audio")

        return b"".join(audio_chunks)

    except ImportError:
        logger.warning("edge-tts not installed, falling back to 讯飞 TTS")
        return await _xunfei_tts(text, voice, speed)
    except Exception as e:
        logger.warning(f"Edge TTS failed ({e}), falling back to 讯飞 TTS")
        return await _xunfei_tts(text, voice, speed)


async def _xunfei_tts(text: str, voice: str = "xiaoyan", speed: int = 50) -> bytes:
    """讯飞 TTS fallback (requires 讯飞 TTS service enabled)."""
    import hashlib
    import hmac
    import base64
    from datetime import datetime, timezone
    import httpx

    host = "tts-api.xfyun.cn"
    path = "/v2/tts"
    url = f"https://{host}{path}"

    now = datetime.now(timezone.utc)
    date = now.strftime("%a, %d %b %Y %H:%M:%S GMT")
    signature_origin = f"host: {host}\ndate: {date}\nPOST {path} HTTP/1.1"
    signature_sha = hmac.new(
        settings.XUNFEI_API_SECRET.encode("utf-8"),
        signature_origin.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    signature = base64.b64encode(signature_sha).decode()
    authorization = (
        f'api_key="{settings.XUNFEI_API_KEY}", '
        f'algorithm="hmac-sha256", '
        f'headers="host date request-line", '
        f'signature="{signature}"'
    )

    body = {
        "common": {"app_id": settings.XUNFEI_APP_ID},
        "business": {
            "aue": "lame", "sfl": 1, "auf": "audio/L16;rate=16000",
            "vcn": voice, "tte": "utf8", "speed": speed, "volume": 50, "pitch": 50,
        },
        "data": {
            "status": 2,
            "text": base64.b64encode(text.encode("utf-8")).decode(),
        },
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": authorization, "Date": date, "Host": host,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=body, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"讯飞 TTS HTTP {resp.status_code}")
        content_type = resp.headers.get("content-type", "")
        if "audio" in content_type:
            return resp.content
        result = resp.json()
        if result.get("code") != 0:
            raise RuntimeError(f"讯飞 TTS error {result.get('code')}: {result.get('message')}")
        return resp.content
