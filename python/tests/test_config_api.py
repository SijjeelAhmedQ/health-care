"""
The bridge's configuration endpoints, with the mock engine (no model is loaded)
and the settings file redirected to a temporary folder.

    cd python && .venv/Scripts/python -m unittest discover -s tests -v
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["CAREFLOW_STT_ENGINE"] = "mock"
os.environ["CAREFLOW_STT_REFINE"] = ""  # no second recogniser (Whisper) in the API tests

from services import stt_catalog  # noqa: E402

_tmp = tempfile.TemporaryDirectory()
stt_catalog.SETTINGS_FILE = Path(_tmp.name) / "stt_settings.json"

from fastapi.testclient import TestClient  # noqa: E402

import app as bridge  # noqa: E402


class ConfigApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(bridge.app)

    def test_lists_models_and_backends_with_what_is_possible_here(self):
        body = self.client.get("/api/config/stt").json()
        self.assertEqual(body["settings"]["engine"], "mock")
        repos = [m["repo"] for m in body["models"]]
        self.assertIn("omi-health/omi-med-stt-v1-gguf", repos)
        for m in body["models"]:
            self.assertIn("downloaded", m)
            if not m["available"]:
                self.assertTrue(m["reason"])  # never unavailable without saying why
        self.assertEqual([b["id"] for b in body["backends"]], ["cpu", "cuda", "vulkan"])
        self.assertTrue(body["engine"]["ready"])

    def test_timings_are_saved_without_reloading_the_model(self):
        settings = self.client.get("/api/config/stt").json()["settings"]
        pid = bridge.stt_engine.info()["process"]
        settings["endpoint_ms"] = 1200
        settings["partial_ms"] = 400
        body = self.client.put("/api/config/stt", json=settings).json()
        self.assertEqual(body["settings"]["endpoint_ms"], 1200)
        self.assertEqual(bridge.stt_engine.info()["process"], pid)  # same worker
        self.assertIn('"endpoint_ms": 1200', stt_catalog.SETTINGS_FILE.read_text(encoding="utf-8"))

    def test_invalid_settings_are_refused_with_the_reason(self):
        settings = self.client.get("/api/config/stt").json()["settings"]
        bad = {**settings, "engine": "gguf", "repo": "omi-health/nope", "gguf_file": "x.gguf"}
        r = self.client.put("/api/config/stt", json=bad)
        self.assertEqual(r.status_code, 400)
        self.assertIn("Unknown model", r.json()["detail"])
        r = self.client.put("/api/config/stt", json={**settings, "endpoint_ms": 50})
        self.assertEqual(r.status_code, 400)

    def test_an_unavailable_backend_is_refused(self):
        unavailable = [b for b in stt_catalog.backends() if not b["available"]]
        if not unavailable:
            self.skipTest("every backend is available on this machine")
        settings = self.client.get("/api/config/stt").json()["settings"]
        body = {**settings, "engine": "gguf", "repo": "omi-health/omi-med-stt-v1-gguf", "gguf_file": "omi-med-stt-v1-q8_0.gguf", "backend": unavailable[0]["id"]}
        r = self.client.put("/api/config/stt", json=body)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], unavailable[0]["reason"])


class SettingsFileTest(unittest.TestCase):
    def test_saved_settings_survive_a_restart_and_unknown_keys_are_ignored(self):
        stt_catalog.SETTINGS_FILE.write_text('{"threads": 3, "endpoint_ms": 700, "nonsense": 1}', encoding="utf-8")
        s = stt_catalog.SttSettings.load()
        self.assertEqual((s.threads, s.endpoint_ms), (3, 700))
        self.assertFalse(hasattr(s, "nonsense"))

    def test_a_damaged_file_falls_back_to_defaults(self):
        stt_catalog.SETTINGS_FILE.write_text("{not json", encoding="utf-8")
        self.assertEqual(stt_catalog.SttSettings.load().partial_ms, stt_catalog.SttSettings().partial_ms)


if __name__ == "__main__":
    unittest.main()
