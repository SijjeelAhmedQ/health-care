"""Voice diagnostics: each finished utterance can be kept (audio + transcript + level) for troubleshooting."""
from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from services.diagnostics import Recorder, audio_stats  # noqa: E402
from services.streaming import SAMPLE_RATE, StreamConfig, StreamingSession  # noqa: E402
from services.vad import EnergyVAD  # noqa: E402


class DiagnosticsTest(unittest.TestCase):
    def test_stats_report_level_and_clipping(self):
        stats = audio_stats(np.concatenate([np.full(SAMPLE_RATE, 0.1, np.float32), np.ones(160, np.float32)]))
        self.assertAlmostEqual(stats["duration_s"], 1.01, delta=0.01)
        self.assertAlmostEqual(stats["peak_dbfs"], 0.0, delta=0.1)
        self.assertGreater(stats["clipped_pct"], 0.9)

    def test_session_hands_each_final_to_the_recorder(self):
        with tempfile.TemporaryDirectory() as tmp:
            recorder = Recorder(Path(tmp))

            async def run() -> None:
                async def emit(_e: dict) -> None:
                    pass

                session = StreamingSession(lambda pcm: "add metformin", emit, StreamConfig(endpoint_ms=500, partial_interval_ms=300), vad=EnergyVAD(), on_final=recorder.save_utterance)
                t = np.arange(int(1.5 * SAMPLE_RATE)) / SAMPLE_RATE
                audio = np.concatenate([np.zeros(8000, np.float32), (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), np.zeros(16000, np.float32)])
                for i in range(0, len(audio), 1600):
                    await session.feed(audio[i : i + 1600])
                await session.flush()
                await session.close()

            asyncio.run(run())
            recorder.save_trace({"kind": "turn", "transcript": "add metformin"})
            day = next(Path(tmp).iterdir())
            lines = (day / "utterances.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            entry = json.loads(lines[0])
            self.assertEqual(entry["text"], "add metformin")
            self.assertIn("final_decode_ms", entry)
            with wave.open(str(day / entry["wav"])) as w:
                self.assertEqual(w.getframerate(), SAMPLE_RATE)
                self.assertGreater(w.getnframes(), SAMPLE_RATE)
            self.assertIn("add metformin", (day / "traces.jsonl").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
