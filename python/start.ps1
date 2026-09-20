# Starts the CareFlow local AI bridge (omi-med-stt + Qwen via Ollama) on http://127.0.0.1:8765
# First time: python -m venv .venv; .venv\Scripts\pip install -r requirements.txt; .venv\Scripts\omi-med-stt install-cpp --cpp-backend cpu
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ".venv")) { python -m venv .venv; .venv\Scripts\python -m pip install -q -U pip; .venv\Scripts\python -m pip install -q -r requirements.txt }
if (-not $env:CAREFLOW_STT_ENGINE) { $env:CAREFLOW_STT_ENGINE = "auto" }
.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8765
