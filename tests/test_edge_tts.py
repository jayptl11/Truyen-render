import asyncio
import importlib.util
import json
import threading
import unittest
from http.server import HTTPServer
from unittest.mock import AsyncMock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server import edge_tts_service as service

INPUT = {"text": 'Một đoạn truyện <script> & "đọc"', "voice": "vi-VN-HoaiMyNeural", "language": "vi-VN"}
VOICE = {"ShortName": INPUT["voice"], "Locale": "vi-VN", "FriendlyName": "Microsoft HoaiMy Online (Natural)", "Gender": "Female"}


class SpeechServiceTests(unittest.TestCase):
    def setUp(self):
        service._catalog = None
        service._catalog_expires = 0

    def test_validation_rejects_bad_inputs_before_connecting(self):
        self.assertEqual(service.validate_input(INPUT), (INPUT["text"], INPUT["voice"]))
        for value in [None, [], {**INPUT, "text": ""}, {**INPUT, "text": "x" * 1501}, {**INPUT, "voice": "en-US-GuyNeural"}, {**INPUT, "voice": 'vi-VN-X"><break/>Neural'}, {**INPUT, "language": "<script>"}]:
            with self.subTest(value=value), self.assertRaises(service.TtsError) as error:
                service.validate_input(value)
            self.assertEqual(error.exception.status, 400)

    def test_catalog_maps_metadata_and_caches(self):
        with patch.object(service.edge_tts, "list_voices", AsyncMock(return_value=[VOICE, {}])) as upstream:
            voices = asyncio.run(service.edge_voices())
            self.assertEqual(voices, [{"id": INPUT["voice"], "name": "HoaiMy", "language": "vi-VN", "gender": "female"}])
            self.assertEqual(asyncio.run(service.edge_voices()), voices)
            self.assertEqual(upstream.await_count, 1)

    def test_actual_library_escapes_plain_text(self):
        session = service.edge_tts.Communicate(INPUT["text"], INPUT["voice"])
        escaped = b"".join(session.texts).decode()
        self.assertIn("&lt;script&gt;", escaped)
        self.assertIn("&amp;", escaped)
        self.assertNotIn("<script>", escaped)

    def test_audio_passes_plain_text_and_returns_only_audio(self):
        class Session:
            async def stream(self):
                yield {"type": "SentenceBoundary", "text": "ignore"}
                yield {"type": "audio", "data": b"audio"}
        with patch.object(service.edge_tts, "Communicate", return_value=Session()) as factory:
            self.assertEqual(asyncio.run(service.edge_audio(INPUT)), b"audio")
            factory.assert_called_once_with(INPUT["text"], INPUT["voice"], connect_timeout=8, receive_timeout=15)

    def test_empty_oversized_and_timeout_audio_fail_clearly(self):
        class Session:
            def __init__(self, mode): self.mode = mode
            async def stream(self):
                if self.mode == "timeout":
                    await asyncio.sleep(1)
                if self.mode == "large":
                    yield {"type": "audio", "data": b"x" * (service.MAX_AUDIO_BYTES + 1)}
        for mode, status in [("empty", 502), ("large", 413), ("timeout", 504)]:
            with self.subTest(mode=mode), patch.object(service, "AUDIO_TIMEOUT", 0.01), patch.object(service.edge_tts, "Communicate", return_value=Session(mode)):
                with self.assertRaises(service.TtsError) as failure:
                    asyncio.run(service.edge_audio(INPUT))
                self.assertEqual(failure.exception.status, status)
                self.assertNotIn("aborted", str(failure.exception))

    def test_catalog_deadline_stops_upstream(self):
        async def stalled(): await asyncio.sleep(1)
        with patch.object(service, "CATALOG_TIMEOUT", 0.01), patch.object(service.edge_tts, "list_voices", stalled):
            with self.assertRaises(service.TtsError) as failure:
                asyncio.run(service.edge_voices())
            self.assertEqual(failure.exception.status, 504)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("tts_api", "api/tts.py")
        cls.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.api)
        cls.api.handler.log_message = lambda *args: None
        cls.server = HTTPServer(("127.0.0.1", 0), cls.api.handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/api/tts"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method="GET", body=None):
        try:
            return urlopen(Request(self.url, data=body, method=method), timeout=2)
        except HTTPError as error:
            return error

    def test_voice_metadata_and_mp3(self):
        with patch.object(self.api, "edge_voices", AsyncMock(return_value=[VOICE])):
            with self.request() as response:
                self.assertEqual(json.load(response), {"voices": [VOICE]})
                self.assertIn("s-maxage=3600", response.headers["Cache-Control"])
        with patch.object(self.api, "edge_audio", AsyncMock(return_value=b"audio")) as audio:
            with self.request("POST", json.dumps(INPUT).encode()) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers["Content-Type"], "audio/mpeg")
                self.assertEqual(response.read(), b"audio")
            audio.assert_awaited_once_with(INPUT)

    def test_bad_requests_and_timeouts_return_json(self):
        for method, body, status in [("POST", b"bad JSON", 400), ("POST", b"x" * 12001, 413), ("POST", b"{}", 400), ("DELETE", None, 405)]:
            with self.subTest(method=method, status=status), self.request(method, body) as response:
                self.assertEqual(response.status, status)
        with patch.object(self.api, "edge_voices", AsyncMock(side_effect=TimeoutError())):
            with self.request() as response:
                self.assertEqual(response.status, 504)
                self.assertIn("phản hồi quá lâu", json.load(response)["error"])


if __name__ == "__main__":
    unittest.main()
