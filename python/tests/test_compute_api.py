"""
Where the AI runs — the two setups the provider uses, and this computer:

    Kaggle GPU            Whisper on Kaggle  + Qwen 4B / 9B on Kaggle
    Kaggle + OpenRouter   Whisper on Kaggle  + any OpenRouter model that calls tools
    This computer         Omi Med STT here   + Qwen here

The Kaggle server and OpenRouter are stood in for (no network); the settings file is a temporary one.

    cd python && .venv/Scripts/python -m unittest tests.test_compute_api -v
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["CAREFLOW_STT_ENGINE"] = "mock"
os.environ["CAREFLOW_STT_REFINE"] = ""

from services import compute as compute_mod, stt_catalog  # noqa: E402

_tmp = tempfile.TemporaryDirectory()
stt_catalog.SETTINGS_FILE = Path(_tmp.name) / "stt_settings.json"
compute_mod.COMPUTE_FILE = Path(_tmp.name) / "compute_settings.json"

from fastapi.testclient import TestClient  # noqa: E402

import app as bridge  # noqa: E402

KAGGLE = "https://gpu.trycloudflare.com"
HEALTH = {"ok": True, "model": "whisper-large-v3-turbo", "device": "cuda", "gpu": "Tesla T4", "engines": {"whisper": {}, "omi": {}}, "ollama": {"ok": True, "models": ["qwen3.5:4b", "qwen3.5:9b"]}}


class ComputeApiTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(bridge.app)
        self.stt_moves: list[dict] = []
        self.health = dict(HEALTH)
        self.kaggle_up = True
        self.key_ok = True

        def probe_remote(url, key):
            if not self.kaggle_up:
                raise RuntimeError(f"Cannot reach the remote GPU server at {url}")
            return self.health

        def probe_openrouter(key):
            if not self.key_ok:
                raise RuntimeError("OpenRouter rejected the key")
            return {"ok": True, "limit_remaining": 4.45}

        async def apply_stt(settings):
            self.stt_moves.append({"engine": settings.engine, "remote_engine": getattr(settings, "remote_engine", None)})
            bridge.stt_settings = settings

        self.originals = (bridge.probe_remote, bridge.probe_openrouter, bridge.apply_stt, bridge.compute, bridge.stt_settings)
        bridge.probe_remote, bridge.probe_openrouter, bridge.apply_stt = probe_remote, probe_openrouter, apply_stt
        bridge.compute = compute_mod.ComputeSettings()

    def tearDown(self):
        bridge.probe_remote, bridge.probe_openrouter, bridge.apply_stt, bridge.compute, bridge.stt_settings = self.originals

    def put(self, **body):
        return self.client.put("/api/config/compute", json=body)

    def test_kaggle_gpu_whisper_and_qwen_both_on_kaggle(self):
        res = self.put(mode="remote", speech="remote", remote_url=KAGGLE, remote_key="k", remote_engine="whisper")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual((res.json()["mode"], res.json()["speech"]), ("remote", "remote"))
        self.assertEqual(self.stt_moves[-1], {"engine": "remote", "remote_engine": "whisper"})

    def test_kaggle_whisper_with_an_openrouter_model(self):
        res = self.put(mode="openrouter", speech="remote", remote_url=KAGGLE, remote_key="k", remote_engine="whisper", openrouter_key="sk-or-secret", openrouter_model="openai/gpt-6-sol")
        self.assertEqual(res.status_code, 200, res.text)
        status = res.json()
        self.assertEqual((status["mode"], status["speech"], status["openrouter_model"]), ("openrouter", "remote", "openai/gpt-6-sol"))
        self.assertTrue(status["has_openrouter_key"])
        self.assertEqual(self.stt_moves[-1], {"engine": "remote", "remote_engine": "whisper"})  # Whisper on Kaggle
        self.assertNotIn("sk-or-secret", res.text)  # the key never comes back
        saved = json.loads(compute_mod.COMPUTE_FILE.read_text(encoding="utf-8"))
        self.assertEqual((saved["mode"], saved["speech"], saved["openrouter_key"]), ("openrouter", "remote", "sk-or-secret"))

    def test_the_saved_keys_are_kept_when_the_fields_are_left_empty(self):
        bridge.compute = replace(bridge.compute, remote_url=KAGGLE, remote_key="k", openrouter_key="sk-or-saved")
        res = self.put(mode="openrouter", speech="remote", openrouter_model="openai/gpt-6-luna")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual((bridge.compute.remote_key, bridge.compute.openrouter_key, bridge.compute.openrouter_model), ("k", "sk-or-saved", "openai/gpt-6-luna"))

    def test_nothing_moves_when_the_kaggle_server_is_down(self):
        self.kaggle_up = False
        res = self.put(mode="openrouter", speech="remote", remote_url=KAGGLE, remote_key="k", openrouter_key="sk-or-x")
        self.assertEqual(res.status_code, 409)
        self.assertIn("Nothing was switched", res.json()["detail"])
        self.assertEqual((bridge.compute.mode, bridge.compute.speech), ("local", "local"))
        self.assertEqual(self.stt_moves, [])

    def test_nothing_moves_when_openrouter_refuses_the_key(self):
        self.key_ok = False
        res = self.put(mode="openrouter", speech="remote", remote_url=KAGGLE, remote_key="k", openrouter_key="sk-or-bad")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(bridge.compute.mode, "local")
        self.assertEqual(self.stt_moves, [])

    def test_qwen_on_kaggle_needs_the_servers_language_model(self):
        self.health = {**HEALTH, "ollama": {"ok": False, "error": "Ollama is not running"}}
        self.assertEqual(self.put(mode="remote", speech="remote", remote_url=KAGGLE, remote_key="k").status_code, 409)
        # …but Whisper alone (with OpenRouter thinking) does not need it.
        self.assertEqual(self.put(mode="openrouter", speech="remote", remote_url=KAGGLE, remote_key="k", openrouter_key="sk-or-x").status_code, 200)

    def test_back_to_this_computer(self):
        self.put(mode="remote", speech="remote", remote_url=KAGGLE, remote_key="k")
        res = self.put(mode="local")
        self.assertEqual((res.json()["mode"], res.json()["speech"]), ("local", "local"))

    def test_check_connection_without_switching(self):
        ok = self.client.post("/api/config/compute/check", json={"remote_url": KAGGLE, "remote_key": "k"}).json()
        self.assertEqual(ok["gpu"], "Tesla T4")
        self.kaggle_up = False
        down = self.client.post("/api/config/compute/check", json={"remote_url": KAGGLE, "remote_key": "k"}).json()
        self.assertFalse(down["ok"])
        self.assertEqual(bridge.compute.mode, "local")  # nothing switched

    def test_a_file_saved_before_speech_had_its_own_place(self):
        compute_mod.COMPUTE_FILE.write_text(json.dumps({"mode": "remote", "remote_url": KAGGLE}), encoding="utf-8")
        self.assertEqual(compute_mod.ComputeSettings.load().speech, "remote")
        compute_mod.COMPUTE_FILE.write_text(json.dumps({"mode": "openrouter"}), encoding="utf-8")
        self.assertEqual(compute_mod.ComputeSettings.load().speech, "local")


if __name__ == "__main__":
    unittest.main()
