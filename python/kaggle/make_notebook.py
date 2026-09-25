"""
Builds careflow_kaggle.ipynb — the notebook to import into Kaggle (File → Import Notebook), then Run All.

    python python/kaggle/make_notebook.py

Cell 1 writes careflow_gpu_server.py (this folder's copy, so the two never drift apart); cell 2 installs
Ollama + qwen3.5:4b and Omi Med STT (CUDA), starts the server and prints the address and key to put in
CareFlow → Configuration → Where the AI runs → Kaggle GPU.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
server = (HERE / "careflow_gpu_server.py").read_text(encoding="utf-8")

launcher = r'''# CareFlow on this GPU: Qwen (Ollama) + Omi Med STT v1, behind one public address.
# Notebook settings: Accelerator = GPU T4, Internet = On. Then Run All.
import os, subprocess, time

# The same key goes into CareFlow → Configuration → Where the AI runs → Key. Change it if you like.
KEY = "CHANGE-ME"

def sh(cmd, check=True):
    print("$", cmd, flush=True)
    return subprocess.run(cmd, shell=True, check=check)

# 1. The language model: Ollama with qwen3.5:4b on the GPU (its installer needs zstd, which Kaggle's image lacks)
sh("apt-get update -qq && apt-get install -y -qq zstd")
sh("curl -fsSL https://ollama.com/install.sh | sh")
subprocess.Popen(["ollama", "serve"], stdout=open("/kaggle/working/ollama.log", "w"), stderr=subprocess.STDOUT)
time.sleep(8)
sh("ollama pull qwen3.5:4b")

# 2. Speech recognition: Whisper large-v3-turbo on the GPU (best with non-US accents) and Omi Med STT v1.
#    The server builds parakeet.cpp for CUDA for Omi the first time it starts (5–15 minutes; CPU build if that fails).
sh("pip install -q omi-med-stt faster-whisper fastapi uvicorn httpx cmake")

# 3. The CareFlow server (port 8000)
server = subprocess.Popen(["python", "/kaggle/working/careflow_gpu_server.py"], env={**os.environ, "CAREFLOW_KEY": KEY},
                          stdout=open("/kaggle/working/server.log", "w"), stderr=subprocess.STDOUT)
import urllib.request
def answering():
    try:
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8000/health", headers={"X-CareFlow-Key": KEY}), timeout=5)
        return True
    except Exception:
        return False
for _ in range(360):  # up to 30 minutes: the first start downloads Whisper and builds parakeet.cpp for CUDA
    time.sleep(5)
    if answering() or server.poll() is not None:
        break
log = open("/kaggle/working/server.log").read()
print(log[-2000:])
if server.poll() is not None:
    raise SystemExit("The server stopped — the log above says why.")

# 4. The public address: a Cloudflare quick tunnel (free, no account; steadier than localtunnel for long requests)
sh("wget -q -O /kaggle/working/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /kaggle/working/cloudflared")
tunnel = subprocess.Popen(["/kaggle/working/cloudflared", "tunnel", "--no-autoupdate", "--url", "http://localhost:8000"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
import re
for line in tunnel.stdout:
    found = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
    if found:
        print("=" * 64)
        print("CareFlow → Configuration → Where the AI runs → Kaggle GPU (remote)")
        print("  Server address:", found.group(0))
        print("  Key:           ", KEY)
        print("Keep this notebook running while you use the app.")
        print("=" * 64, flush=True)
        break
'''


def cell(source: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": source.splitlines(keepends=True)}


notebook = {
    "cells": [cell("%%writefile /kaggle/working/careflow_gpu_server.py\n" + server), cell(launcher)],
    "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}},
    "nbformat": 4,
    "nbformat_minor": 5,
}
(HERE / "careflow_kaggle.ipynb").write_text(json.dumps(notebook, indent=1), encoding="utf-8")
print("wrote", HERE / "careflow_kaggle.ipynb")
