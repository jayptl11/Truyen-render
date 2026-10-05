"""Vercel Python function. Uses the actual pip edge-tts package."""
import asyncio
import json
from http.server import BaseHTTPRequestHandler

from server.edge_tts_service import TtsError, edge_audio, edge_voices, upstream_error


class handler(BaseHTTPRequestHandler):
    def respond(self, status, payload, content_type="application/json; charset=utf-8", cache="no-store"):
        data = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        try:
            self.respond(200, {"voices": asyncio.run(edge_voices())}, cache="public, max-age=3600, s-maxage=3600")
        except Exception as error:
            failure = upstream_error(error)
            self.respond(failure.status, {"error": str(failure)})

    def do_POST(self):
        try:
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise TtsError("Độ dài yêu cầu không hợp lệ.", 400)
            if length < 0:
                raise TtsError("Độ dài yêu cầu không hợp lệ.", 400)
            if length > 12000:
                raise TtsError("Yêu cầu quá lớn.", 413)
            try:
                value = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError):
                raise TtsError("Nội dung JSON không hợp lệ.", 400)
            self.respond(200, asyncio.run(edge_audio(value)), "audio/mpeg")
        except Exception as error:
            failure = upstream_error(error)
            self.respond(failure.status, {"error": str(failure)})

    def unsupported(self):
        self.send_response(405)
        self.send_header("Allow", "GET, POST")
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_DELETE = do_PUT = do_PATCH = do_OPTIONS = do_HEAD = unsupported
