"""Shared Edge Read Aloud service for Vercel and the Vite development bridge."""
import asyncio
import re
import time

import aiohttp
import edge_tts

MAX_AUDIO_BYTES = 2 * 1024 * 1024
CATALOG_TIMEOUT = 12
AUDIO_TIMEOUT = 20
_catalog = None
_catalog_expires = 0


class TtsError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def validate_input(value):
    if not isinstance(value, dict):
        raise TtsError("Yêu cầu TTS không hợp lệ.", 400)
    text, voice, language = (value.get(key) for key in ("text", "voice", "language"))
    if (not isinstance(text, str) or not text.strip() or len(text) > 1500
            or not isinstance(voice, str) or len(voice) > 100
            or not re.fullmatch(r"[a-z]{2,3}-(?:[A-Za-z0-9]+-){1,3}[A-Za-z0-9]+Neural", voice)
            or not isinstance(language, str)
            or not re.fullmatch(r"[a-z]{2,3}-[A-Za-z0-9-]{2,20}", language)
            or not voice.startswith(language + "-")):
        raise TtsError("Nội dung, ngôn ngữ hoặc giọng Edge không hợp lệ (tối đa 1500 ký tự mỗi lượt).", 400)
    return text, voice


def upstream_error(error):
    if isinstance(error, TtsError):
        return error
    if isinstance(error, (TimeoutError, asyncio.TimeoutError)):
        return TtsError("Edge phản hồi quá lâu. Thử lại hoặc chọn eSpeak / giọng trên thiết bị.", 504)
    if isinstance(error, aiohttp.ClientResponseError) and error.status in (401, 403, 429):
        return TtsError("Microsoft đang từ chối hoặc giới hạn kết nối Edge. Thử lại sau hoặc chọn nguồn giọng khác.", 503)
    return TtsError("Không kết nối được đến Edge. Thử lại hoặc chọn nguồn giọng khác.")


async def edge_voices():
    global _catalog, _catalog_expires
    if _catalog is not None and _catalog_expires > time.monotonic():
        return _catalog
    try:
        async with asyncio.timeout(CATALOG_TIMEOUT):
            data = await edge_tts.list_voices()
        voices = []
        for item in data:
            if not isinstance(item, dict) or not isinstance(item.get("ShortName"), str) or not isinstance(item.get("Locale"), str):
                continue
            name = item.get("FriendlyName", item["ShortName"])
            if not isinstance(name, str):
                name = item["ShortName"]
            name = re.sub(r"^Microsoft\s+", "", name).replace(" Online (Natural)", "")
            voices.append({"id": item["ShortName"], "name": name, "language": item["Locale"],
                           "gender": {"Male": "male", "Female": "female"}.get(item.get("Gender"), "unknown")})
        if not voices:
            raise TtsError("Edge chưa trả về giọng đọc.")
        _catalog, _catalog_expires = voices, time.monotonic() + 3600
        return voices
    except Exception as error:
        raise upstream_error(error) from error


async def edge_audio(value):
    text, voice = validate_input(value)
    try:
        # edge-tts escapes the plain text itself; do not pre-escape or send SSML.
        session = edge_tts.Communicate(text, voice, connect_timeout=8, receive_timeout=15)
        audio = bytearray()
        async with asyncio.timeout(AUDIO_TIMEOUT):
            async for chunk in session.stream():
                if chunk["type"] != "audio":
                    continue
                if len(audio) + len(chunk["data"]) > MAX_AUDIO_BYTES:
                    raise TtsError("Âm thanh Edge vượt giới hạn dung lượng.", 413)
                audio.extend(chunk["data"])
        if not audio:
            raise TtsError("Edge không trả về âm thanh. Thử lại hoặc chọn nguồn giọng khác.")
        return bytes(audio)
    except Exception as error:
        raise upstream_error(error) from error
