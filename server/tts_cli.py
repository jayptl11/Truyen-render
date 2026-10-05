"""JSON stdin/stdout bridge for Vite; never takes shell arguments."""
import asyncio
import base64
import json
import sys


def main():
    try:
        from server.edge_tts_service import edge_audio, edge_voices
        request = json.load(sys.stdin)
        if request.get("action") == "voices":
            result = {"voices": asyncio.run(edge_voices())}
        else:
            result = {"audio": base64.b64encode(asyncio.run(edge_audio(request.get("input")))).decode("ascii")}
    except ImportError:
        result = {"error": "Chưa cài edge-tts cho Python của dev server. Chạy pip install -r requirements.txt trong .venv.", "status": 503}
    except Exception as error:
        result = {"error": str(error), "status": getattr(error, "status", 502)}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
