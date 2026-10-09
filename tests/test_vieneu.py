import io
import os
import unittest
import wave
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient
from services.vieneu import app as service


class FakeEngine:
    _preset_voices = {"Trúc Ly": {"gender": "female"}, "Hải Đăng": {"gender": "male"}}

    def __init__(self):
        self.calls = []

    def list_preset_voices(self):
        return [("⭐ Trúc Ly — Nữ · Bắc", "Trúc Ly"), ("Hải Đăng — Nam · Bắc", "Hải Đăng")]

    def infer(self, text, voice):
        self.calls.append((text, voice))
        return np.array([0, 0.5, -0.5, 0], dtype=np.float32)


class VieNeuServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = FakeEngine()
        self.patch = patch.object(service, "engine", self.engine)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.env = patch.dict(os.environ, {"VIENEU_API_KEY": ""})
        self.env.start()
        self.addCleanup(self.env.stop)
        # No lifespan context: unit tests never download or load neural models.
        self.client = TestClient(service.app)
        self.addCleanup(self.client.close)
        self.input = {"model": "vieneu-v3-turbo", "input": "Xin chào.", "voice": "Trúc Ly", "response_format": "wav"}

    def test_catalog_uses_ids_not_formatted_labels(self):
        voices = self.client.get("/v1/voices").json()["data"]
        self.assertEqual(voices[0]["id"], "Trúc Ly")
        self.assertEqual(voices[0]["gender"], "female")
        self.assertNotEqual(voices[0]["id"], voices[0]["name"])

    def test_generates_finite_pcm_wav_with_selected_voice(self):
        response = self.client.post("/v1/audio/speech", json=self.input)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.engine.calls, [("Xin chào.", "Trúc Ly")])
        with wave.open(io.BytesIO(response.content)) as audio:
            self.assertEqual(audio.getframerate(), 48000)
            self.assertEqual(audio.getnchannels(), 1)
            self.assertEqual(audio.getnframes(), 4)

    def test_rejects_unknown_voice_model_format_and_long_text(self):
        for values in [{"voice": "Unknown"}, {"model": "vieneu-v4"}, {"response_format": "mp3"}, {"input": " "}, {"input": "x" * 241}]:
            with self.subTest(values=values):
                response = self.client.post("/v1/audio/speech", json={**self.input, **values})
                self.assertIn(response.status_code, (400, 422))
        self.assertEqual(self.engine.calls, [])

    def test_optional_auth_blocks_catalog_and_synthesis(self):
        with patch.dict(os.environ, {"VIENEU_API_KEY": "test-only-token"}):
            self.assertEqual(self.client.get("/v1/voices").status_code, 401)
            self.assertEqual(self.client.post("/v1/audio/speech", json=self.input).status_code, 401)
            self.assertEqual(self.client.get("/v1/voices", headers={"Authorization": "Bearer test-only-token"}).status_code, 200)

    def test_busy_inference_does_not_queue_unbounded_work(self):
        service.inference_lock.acquire()
        try:
            self.assertEqual(self.client.post("/v1/audio/speech", json=self.input).status_code, 429)
            self.assertEqual(self.engine.calls, [])
        finally:
            service.inference_lock.release()

    def test_errors_are_redacted_and_release_the_inference_lock(self):
        with patch.object(self.engine, "infer", side_effect=ValueError("private token and source text")):
            response = self.client.post("/v1/audio/speech", json=self.input)
            self.assertEqual(response.status_code, 502)
            self.assertNotIn("private token", response.text)
        self.assertEqual(self.client.post("/v1/audio/speech", json=self.input).status_code, 200)


if __name__ == "__main__":
    unittest.main()
