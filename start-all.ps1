# One-shot launcher for CareFlow with the local models on the GPU.
#   1. Ollama  -> qwen3.5:4b (full GPU offload, kept resident)
#   2. Python bridge -> omi-med-stt-v1 (Parakeet-TDT GGUF via parakeet.cpp) on http://127.0.0.1:8765
#   3. Vite dev server -> http://localhost:5173
# Usage:  .\start-all.ps1          (first run downloads models; later runs start in seconds)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# --- 1. Ollama + Qwen -------------------------------------------------------------
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { throw "Ollama is not installed. https://ollama.com/download" }
try { Invoke-RestMethod http://127.0.0.1:11434/api/tags -TimeoutSec 3 | Out-Null } catch { Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden; Start-Sleep -Seconds 4 }
if (-not (ollama list | Select-String -Quiet "qwen3.5:4b")) { Write-Host "Pulling qwen3.5:4b (3.4 GB)…"; ollama pull qwen3.5:4b }
Write-Host "Warming qwen3.5:4b on the GPU…"
Invoke-RestMethod -Method Post http://127.0.0.1:11434/api/generate -Body '{"model":"qwen3.5:4b","prompt":"","keep_alive":"30m","options":{"num_gpu":99,"num_ctx":12288}}' -ContentType "application/json" | Out-Null
ollama ps

# --- 2. STT bridge (omi-med-stt) ---------------------------------------------------
if (-not (Test-Path "python\.venv")) {
  Write-Host "Creating python venv + installing omi-med-stt…"
  python -m venv python\.venv
  python\.venv\Scripts\python -m pip install -q -U pip
  python\.venv\Scripts\python -m pip install -q -r python\requirements.txt
  python\.venv\Scripts\omi-med-stt install-cpp --cpp-backend cpu      # parakeet.cpp + omi-med-stt-v1-q8_0.gguf (~1 GB, once)
}
$bridgeUp = $false
try { Invoke-RestMethod http://127.0.0.1:8765/api/health -TimeoutSec 2 | Out-Null; $bridgeUp = $true } catch {}
if (-not $bridgeUp) {
  Start-Process -FilePath "python\.venv\Scripts\python.exe" -ArgumentList "-m","uvicorn","app:app","--host","127.0.0.1","--port","8765" -WorkingDirectory "$PSScriptRoot\python" -WindowStyle Minimized
  Write-Host "Starting STT bridge (loading omi-med-stt into memory)…"
  $deadline = (Get-Date).AddSeconds(120)
  do { Start-Sleep -Seconds 2; try { $h = Invoke-RestMethod http://127.0.0.1:8765/api/health -TimeoutSec 2; $bridgeUp = $true } catch {} } while (-not $bridgeUp -and (Get-Date) -lt $deadline)
}
Invoke-RestMethod http://127.0.0.1:8765/api/health | ConvertTo-Json -Depth 4

# --- 3. Frontend -------------------------------------------------------------------
if (-not (Test-Path "node_modules")) { npm install }
Write-Host "`nCareFlow -> http://localhost:5173   (sign in with a provider account, e.g. sahmed; press Ctrl+Shift+V to talk)`n"
npm run dev
