"""Small, read-only preset-voice API for the free VieNeu v3 Turbo model."""
import hmac
import io
import os
import threading
import wave
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

MODEL_ID = "vieneu-v3-turbo"
os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parent / ".cache"))
MAX_CHARS = 240
engine = None
inference_lock = threading.Lock()


@asynccontextmanager
async def lifespan(_app):
    global engine
    from vieneu import Vieneu
    engine = Vieneu(mode="v3turbo", backend="onnx")
    yield
    engine = None


app = FastAPI(title="Truyện · VieNeu v3 Turbo", lifespan=lifespan)


def authorize(authorization: str = Header(default="")):
    key = os.environ.get("VIENEU_API_KEY", "")
    if key and not hmac.compare_digest(authorization.encode(), f"Bearer {key}".encode()):
        raise HTTPException(401, "Không có quyền truy cập dịch vụ VieNeu.")


def get_engine():
    if engine is None:
        raise HTTPException(503, "VieNeu đang khởi động. Thử lại sau.")
    return engine


def preset_voices(tts):
    metadata = getattr(tts, "_preset_voices", {})
    voices = []
    for label, voice_id in tts.list_preset_voices():
        details = metadata.get(voice_id, {})
        gender = str(details.get("gender", "")).lower()
        gender = "male" if gender in ("male", "m", "nam") else "female" if gender in ("female", "f", "nữ") else "unknown"
        voices.append({"id": voice_id, "name": label, "language": "vi-VN", "gender": gender})
    return voices


@app.get("/health")
def health():
    return {"status": "ready" if engine is not None else "loading", "model": MODEL_ID, "backend": "onnx", "max_chars": MAX_CHARS}


@app.get("/v1/voices", dependencies=[Depends(authorize)])
def voices():
    return {"model": MODEL_ID, "data": preset_voices(get_engine())}


class SpeechRequest(BaseModel):
    model: str = MODEL_ID
    input: str = Field(min_length=1, max_length=MAX_CHARS)
    voice: str = Field(min_length=1, max_length=128)
    response_format: str = "wav"


@app.post("/v1/audio/speech", dependencies=[Depends(authorize)])
def speech(request: SpeechRequest):
    tts = get_engine()
    if request.model != MODEL_ID or request.response_format != "wav":
        raise HTTPException(400, "Chỉ hỗ trợ VieNeu v3 Turbo và định dạng WAV.")
    if not request.input.strip():
        raise HTTPException(400, "Nội dung không được để trống.")
    if request.voice not in {voice["id"] for voice in preset_voices(tts)}:
        raise HTTPException(400, "Giọng VieNeu không hợp lệ. Tải lại danh sách giọng.")
    if not inference_lock.acquire(blocking=False):
        raise HTTPException(429, "VieNeu đang tạo giọng cho lượt khác. Thử lại sau.")
    try:
        import numpy as np
        audio = np.asarray(tts.infer(request.input, voice=request.voice), dtype=np.float32).reshape(-1)
        if not audio.size or not np.isfinite(audio).all():
            raise HTTPException(502, "VieNeu không tạo được âm thanh hợp lệ.")
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(48000)
            wav.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        return Response(output.getvalue(), media_type="audio/wav", headers={"Cache-Control": "no-store"})
    except HTTPException:
        raise
    except Exception as error:
        # Do not expose filesystem paths, model internals, request text or tokens.
        print(f"VieNeu synthesis failed: {type(error).__name__}", flush=True)
        raise HTTPException(502, "VieNeu tạo giọng thất bại. Thử lại hoặc chọn giọng khác.") from error
    finally:
        inference_lock.release()
