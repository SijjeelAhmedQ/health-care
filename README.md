# CareFlow PMS — Provider-Centric Healthcare PMS with a Tool-Calling Assistant

A responsive **practice management system** for a signed-in provider. The provider lands on **their own dashboard** (schedule, tasks, recalls, Inbox), selects a patient to work on, and manages everything about that patient — medications, diagnoses, tasks, recalls, appointments — in one place: the patient's **Summary**.

The whole application can be driven by speech or typing. **Omi Med STT v1** transcribes live as the provider speaks, and a local **Qwen 3.5 4B** decides what to do by **calling tools** — it opens pages, fills forms, looks things up and stages changes. There is no rule-based interpreter and no fixed command list: the model chooses the tools, the tools carry them out, and **nothing is saved or deleted without the provider's confirmation**.

> Speak → Omi Med STT (live partials, final per utterance) → Qwen chooses tools → tools act on the app → results back to Qwen → reply / question / confirmation

**Stack:** React 18 · TypeScript · Vite · Ant Design 5 · Redux Toolkit · React Router 6 · Recharts · Zod · Vitest · FastAPI (bridge) · Ollama

---

## Table of contents

1. [Modules](#1-modules)
2. [Provider sign-in and patient context](#2-provider-sign-in-and-patient-context)
3. [The assistant: tool calling](#3-the-assistant-tool-calling)
4. [Live speech: Omi Med STT streaming](#4-live-speech-omi-med-stt-streaming)
5. [AI Summary](#5-ai-summary)
6. [Setup](#6-setup)
7. [Configuration](#7-configuration)
   · [Environment variables](#environment-variables)
8. [Performance on a 4 GB GPU](#8-performance-on-a-4-gb-gpu)
9. [Safety model](#9-safety-model)
10. [Extending the app](#10-extending-the-app)
11. [Testing and evaluation](#11-testing-and-evaluation)

---

## 1. Modules

| # | Module | Path | Needs a patient | What it does |
|---|--------|------|-----------------|--------------|
| 1 | Dashboard | `/dashboard` | no | **The signed-in provider's dashboard**: today's schedule, the next 7 days, their open tasks, recalls due for their patients, unfiled Inbox items, and charts of their booked load. **Summary** opens the day in words in a resizable side panel on the right (also by voice: "give me my dashboard summary") |
| 2 | Patients | `/patients` | no | Search, select, add, update and delete patients |
| 3 | Inbox | `/inbox` | no | Lab results, radiology reports, referrals and discharge summaries |
| 4 | Summary | `/summary` | yes | The selected patient's chart — **the only place** their records are managed |
| 5 | Configuration | `/configuration` | no | Choose the AI models: the language model and the Omi Med STT speech model (see [Configuration](#7-configuration)) |

The Summary's tabs are real routes: `/summary/ai-summary`, `/summary/medication`, `/summary/diagnosis`, `/summary/task`, `/summary/recall`, `/summary/appointment`. Each record tab is a full manager — live metrics, search, filters (options come from the form definitions), add / edit / delete with confirmation. There are no separate Medication / Diagnosis / Task / Recall / Appointment modules any more.

Pages, tabs and their descriptions live in `registry/pageRegistry.ts`; the router, sidebar, command palette and the assistant's `open_page` tool are all generated from it.

### The Inbox

The Inbox deliberately spans patients: it is a provider workqueue, not a patient chart. It reads **existing** clinical records and presents them as one queue — nothing about those records changes.

| Queue | Source record | What counts as "arrived" |
|-------|---------------|---------------------------|
| Lab | `LabOrder` | Status `Resulted` |
| Radiology | `ImagingOrder` | Status `Reported` |
| Referrals | `Referral` | All referrals, with their status |
| Discharge Summary | `ClinicalNote` (type `Discharge`) and `ClinicalDocument` (category `Discharge Summary`) | Filed against the patient |

* **Attention** is derived from the data (abnormal lab, urgent priority, declined referral, unsigned draft) and always shown as a labelled chip.
* **Reviewed / filed** is a presentation state (`inboxSlice` + `localStorage`) and never writes to the underlying record.
* Follow-up actions open the application's existing forms, pre-filled, and are disabled unless the item's patient is the selected patient.

---

## 2. Provider sign-in and patient context

* **The signed-in user is the provider.** Only accounts linked to a provider record can sign in (`authService.login`); the Dashboard, the `get_provider_overview` tool and the appointment form's default provider all use that provider. Demo provider accounts are listed on the sign-in screen (e.g. `sahmed` / any password).
* The Summary sits behind a route guard (`components/patient/RequirePatient.tsx`): with no selected patient it is not rendered, and the user is sent to the patient list with the destination remembered.
* The assistant's runtime enforces the same rule independently: every patient-record tool refuses to run without a selected patient and tells the model why.
* The **Selected Patient Banner** is shown on the Patients and Summary pages (not on the provider's Dashboard or the cross-patient Inbox, where it would invite a wrong-patient mistake).

---

## 3. The assistant: tool calling

```
utterance ──► Agent (services/ai/agent/agent.ts)
                │  system prompt (static) + tool schemas (static) + history + CONTEXT + SAID
                ▼
             Qwen 3.5 4B  ──► tool calls ──► AppRuntime (services/ai/agent/runtime.ts) ──► registries / Redux / UI
                ▲                                   │
                └──────────── tool results ◄────────┘      … until Qwen replies, the app needs the user, or maxSteps
```

* **Everything on screen is reachable by voice**: pages and Summary tabs, patients, every record type, forms, confirmations, the Inbox, the lists (search / filter / page any table — `control_list`), the AI Summary's extracted items, the dashboard and patient summary panels, the AI configuration (switch the language model, change the Omi Med STT model, backend, threads and timings), spoken replies, the sidebar, help and sign-out.
* **One model call for a plain action.** Tools that simply do something (open a page, filter a list, open a panel, confirm) *conclude* the request: their message is the reply and the model is not asked again. Lookups (patients, records, the provider's day, the configuration) go back to the model so it can answer or continue.
* **Tools** (`services/ai/agent/tools.ts`) — ~40, among them: `open_page`, `search_patients`, `select_patient`, `create_patient` / `edit_patient` / `delete_patient`, `add_medications` / `add_diagnoses` / `add_tasks` / `add_recalls` / `add_appointments`, `update_record`, `delete_record`, `list_records`, `fill_open_form`, `save_open_form`, `confirm_pending_action`, `cancel_pending_action`, `get_provider_overview`, `get_patient_summary`, `inbox_show` / `inbox_open_item` / `inbox_file_item`, `patient_summary_panel`, `take_clinical_note`, `wait_for_more_speech`, `stop_listening`.
* **Schemas are generated, not written:** page ids and descriptions come from the page registry; record fields, types, select options and format hints come from `registry/fieldRegistry.ts`. A new field or page reaches the model automatically.
* **Arguments are validated** against the tool's zod schema before anything runs; an invalid call goes back to the model as an error it corrects (options match in any letter case; `null` counts as omitted).
* **Values are checked again by the runtime** against the form definitions (dates `YYYY-MM-DD`, times `HH:mm`, select options, provider names). What does not fit is reported back to the model, not written.
* **CONTEXT** with every utterance: date and the next 7 days with weekdays, the provider, the page, the selected patient, the open form and its values, the pending question or confirmation, the Inbox or patient search on screen.
* **Multi-step:** every tool result goes back to the model, which decides the next step or finishes — so "go to patients, select James Ahmed and create a task for blood pressure monitoring" runs `open_page` → `select_patient` → `add_tasks`, and "…go to the inbox and open the first record" runs on to `inbox_show` → `inbox_open_item`. Up to `VITE_AGENT_MAX_STEPS` model calls; a step that needs the provider (a question, a confirmation) pauses the rest.
* **English** speech; the prompt tells the model that the recogniser may run words together ("Admetformin" = "Add metformin").
* The **command palette** (Ctrl+K) runs the same runtime actions directly; anything typed that is not an entry goes to the assistant.
* The **help sheet** ("What can the assistant do?") is generated from the tool list.

---

## 4. Live speech: Omi Med STT streaming

```
browser mic ─► AudioWorklet (downsample to 16 kHz Int16) ─► WebSocket /ws/stt ─► bridge
                                                                    │ VAD (adaptive noise floor, pre-roll)
                                                                    │ Omi Med STT v1 re-decodes the utterance every ~0.5 s
browser ◄── speech_start · partial … partial · speech_end · final ◄─┘
```

* `python/services/vad.py` — **Silero VAD** (neural, ~2 MB ONNX, downloaded to `python/models/` on first use) tells speech from room noise, so an utterance ends on the pause even with a noisy room or a microphone whose automatic gain lifts the background between sentences (an energy threshold never hears that pause — the utterance would never end). An energy VAD is only the fallback when Silero cannot be loaded; `/api/health` says which one runs. Two safety nets end an utterance regardless: the transcript stopped changing for 2.5 s, or 30 s passed.
* `python/services/streaming.py` — `StreamingSession`: VAD on 32 ms frames, partial transcripts while speaking, the final transcript after `VITE_STT_ENDPOINT_MS` of silence, and long dictation committed in pieces at the quietest point so decoding stays bounded.
* `python/services/stt_worker.py` — the Omi engine runs in its own process: parakeet.cpp aborts the process when it cannot allocate memory, so an abort costs one utterance, not the bridge, and the worker restarts itself.
* `src/services/ai/providers/stt.ts` — `OmiStreamingSTT`: the AudioWorklet, the WebSocket, reconnects, and `stop()` that flushes the utterance in progress.
* Parakeet-TDT (which Omi Med STT is built on) decodes whole segments, so streaming is incremental re-decoding of a bounded window — the standard way to stream an offline ASR model.
* **Accents** — Omi Med STT and Parakeet are trained mostly on US English; with the provider's accent they miss names ("jams hammock" for James Ahmed) that US text-to-speech voices get right. On the Kaggle GPU the default speech model is therefore **Whisper large-v3-turbo** (trained on speech from all over the world), and every request carries the app's vocabulary (patients, drugs, diagnoses, providers) as its prompt — the bridge now passes that vocabulary to the main recogniser, not only to the optional second one. Measured on the provider's recording: Omi "select jams ahmad", Whisper + vocabulary "select James Ahmed". Configuration → Where the AI runs → Speech model on the server: Whisper or Omi.
* **Where the AI runs** (top of Configuration) — *This computer* or *Kaggle GPU*: **both models move together**. Remote runs `python/kaggle/careflow_gpu_server.py` on a Kaggle T4 (setup steps at the top of that file): Omi Med STT v1 (parakeet.cpp built for CUDA, CPU fallback; or Parakeet v2 with `CAREFLOW_STT=parakeet`) plus Ollama with qwen3.5:4b, behind one localtunnel address and a shared key (`X-CareFlow-Key`). The bridge switches its speech engine to `remote` (microphone, VAD and live text stay local; each piece of speech is POSTed to `/transcribe`) and forwards the language model through its `/ollama` proxy, which the app's Ollama address points at while remote — so warm-up and the prompt cache work unchanged. The server is checked (key, speech model, Ollama) before anything switches; switching back restores the local speech settings (`python/compute_settings.json`, gitignored). Speech crosses a public tunnel — keep the key secret.
* **NVIDIA Parakeet-TDT 0.6B v2** (Configuration → Speech recognition → Model) — the general English Parakeet that Omi Med STT is a medical fine-tune of, as ONNX through `onnx-asr` (engine `onnx`, downloaded into `python/models/`). Same live streaming (Silero VAD, partials, finals). Device CPU or GPU (ONNX Runtime's CUDA provider — no CUDA Toolkit; the pip CUDA/cuDNN libraries are pinned to the driver's CUDA 12.5, newer ones fail in cuDNN on this driver) and precision int8 (~630 MB) or fp32 (~2.4 GB). Measured on the provider's recordings: as accurate as Omi, ~40% faster on the CPU (0.85 s vs ~1.1 s a sentence, final 0.3–1.1 s after the pause). int8 on the GPU is *slower* (1.36 s: its quantized layers stay on the CPU); fp32 needs ~2.8 GB of free VRAM, and with Qwen 3.5 4B loaded a 4 GB card has ~120 MB free — applying a GPU setting checks free memory and refuses rather than pushing both models into shared memory.
* **Misheard names** — speech recognition gets names wrong more often than anything else ("Sara John Sun", "metforman"). `services/records/nameMatch.ts` scores spellings: `select_patient` / `search_patients` take the one clearly closest patient (and say so in the reply) or ask when several are close; fields marked `knownFrom` in the FieldRegistry (medication name, diagnosis) take a known name the app holds only when it is spelled almost the same (≥ 0.85) — a merely similar real drug (Valsartan vs Losartan) is never replaced. Saving still waits for confirmation.
* **Second recogniser (optional, off by default)** — Configuration → Speech recognition. Whisper (base.en / small.en, faster-whisper on the CPU) re-hears each finished sentence with a vocabulary prompt built from the app's data (selected, recent, searched and today's patients; drugs and diagnoses on record, most used first; providers), and the model gets it as `ALSO HEARD` next to Omi's `SAID`. Measured on the provider's own recordings: offline with a hand-picked vocabulary it got 21/24 names right against Omi's 9/24, but live with the real vocabulary the model's tool calls got better in 2 of 12 commands and worse in 2–3, at 1–3 s extra per command — so it stays off unless a practice finds it helps (`npm run eval:llm -- alsoHeard`).
* **One microphone session at a time** — a session that was stopped (Mic Off, the silence timeout) can still deliver a late final or end while a new one is already running. Each session carries a generation number in `VoiceController`; only the current one may act, so a quick Mic Off → Speak can never leave a second session streaming the same audio (which used to duplicate commands and multiply the recogniser's CPU load).
* **Echo guard** — the microphone hears the loudspeaker. An utterance that *starts* while the assistant is speaking its reply (or within 0.4 s after) is its own voice and is ignored (`isAssistantSpeaking` in `src/services/ai/speech.ts`).
* **Voice diagnostics** (Configuration → Speech recognition → *Record voice commands*, off by default) — `python/services/diagnostics.py` keeps each utterance's WAV, transcript, level (RMS/peak dBFS), clipping and decode time in `python/recordings/<date>/utterances.jsonl`, and the app sends what the assistant did with it to `traces.jsonl`. Nothing leaves the computer; the folder is gitignored.

---

## 5. AI Summary

1. **Dictate** a note (or tell the assistant a note — it calls `take_clinical_note`). Omi Med STT streams it into the transcript box, which stays editable.
2. **Extract with AI** asks Qwen, with the same system prompt and tools (so the cache is reused), to call `record_note_findings` with every medication, diagnosis, task, recall and appointment. The findings are validated against the form definitions; anything that does not fit goes back to the model to fix.
3. **Review**: items are grouped by type with the words they came from; anything ambiguous is listed as a question.
4. **Add**: each item opens its normal form, pre-filled, and is stored only when saved.

---

## 6. Setup

One command on Windows (Ollama + Qwen on the GPU, the bridge, the dev server):

```powershell
.\start-all.ps1
```

Or step by step:

```bash
# Qwen
ollama pull qwen3.5:4b

# Bridge: Omi Med STT streaming + chat passthrough (http://127.0.0.1:8765)
cd python
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
omi-med-stt install-cpp --cpp-backend cpu
uvicorn app:app --host 127.0.0.1 --port 8765

# Frontend
npm install
npm run dev          # http://localhost:5173
```

Other commands: `npm run build`, `npm run typecheck`, `npm test`, `npm run eval:llm`, `npm run bridge`.

---

## 7. Configuration

The **Configuration** page (`/configuration`) sets up both models without editing files or restarting anything.

**Language model**
* Runtime: Ollama, an OpenAI-compatible server, or the Python bridge — and its address.
* Model: the list is read **live from the runtime** (`/api/tags` for Ollama), so a model pulled with `ollama pull …` appears on its own — when the page opens, when you come back to the window, every 15 s, or with the refresh button. Each model shows its size, parameters and quantization, and whether it can **call tools**; a model that cannot is disabled, because the assistant needs tool calling.
* **Test** sends a real request with one tool and reports whether the model called it, and how long it took.
* **Save and apply** switches the running assistant: the previous Ollama model is unloaded (a 4 GB card cannot hold two), the new one is loaded and its prompt cache primed — the page reports when it is ready, or why it failed.
* Performance: context window, GPU layers, timeout, steps per request.
* Saved in this browser on top of the `.env` defaults; **Defaults** returns to them.

**Speech recognition — Omi Med STT** (settings live in the bridge, `python/stt_settings.json`)
* Model: every published Omi Med STT build plus **any other `omi-health/omi-med-stt*` model already in the Hugging Face cache**, each marked downloaded or with its download size, and disabled with the reason when it cannot run here (MLX builds need Apple Silicon).
* Backend (GGUF builds): CPU / CUDA / Vulkan, each marked installed, not yet installed, or unavailable with what is missing (e.g. "Building it needs CMake, the CUDA Toolkit").
* CPU threads, the pause that ends a sentence, and how often the live text refreshes.
* **Save and apply** loads the new model in a fresh worker process while the current one keeps transcribing; if the new one fails to load, the current one stays and the reason is shown. Timing changes apply to the next stream without a reload.
* Bridge endpoints: `GET/PUT /api/config/stt`, `GET /api/llm/models`.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_STT_WS_URL` | `ws://127.0.0.1:8765/ws/stt` | Omi Med STT streaming endpoint |
| `VITE_LLM_PROVIDER` | `ollama` | `ollama`, `openai-compatible` or `bridge` |
| `VITE_LLM_API_URL` / `VITE_LLM_MODEL` | `http://127.0.0.1:11434` / `qwen3.5:4b` | Model runtime |
| `VITE_LLM_TIMEOUT_MS` | `90000` | Per model call (the very first includes loading) |
| `VITE_LLM_NUM_GPU` / `VITE_LLM_NUM_CTX` | `99` / `12288` | Full GPU offload; context for ~8k tokens of tools plus the conversation |
| `VITE_AGENT_MAX_STEPS` | `8` | Most model calls per utterance |
| `VITE_ENABLE_VOICE` / `VITE_ENABLE_DEBUG_PANEL` | `true` | Feature flags |

These are the defaults; the Configuration page overrides them. Bridge (`python/.env.example`): `CAREFLOW_STT_BACKEND`, `CAREFLOW_STT_THREADS`, `CAREFLOW_STT_ENDPOINT_MS`, `CAREFLOW_STT_PARTIAL_MS` (first-run defaults before `stt_settings.json` exists; `CAREFLOW_STT_ENGINE=mock` for wiring tests), `CAREFLOW_LLM_RUNTIME`, `CAREFLOW_LLM_URL`, `CAREFLOW_LLM_MODEL`.

---

## 8. Performance on a 4 GB GPU

Measured on a GTX 1650 with `qwen3.5:4b` (Q4_K_M, fully on the GPU at `num_ctx` 12288):

* The system prompt and tool schemas are **byte-for-byte static**, so the runtime caches them.
* Qwen 3.5 is a hybrid (recurrent) model: llama.cpp resumes only from checkpoints at the END and END-508 of a prompt. The warm-up (`OllamaChat.warmUp`) pads its user turn to ~490 tokens so a checkpoint lands exactly at the end of the prefix every request shares; each request then only processes its own CONTEXT and utterance.
* On a GTX 1650 Qwen 3.5 4B reads a prompt at only **~50 tokens/s** (measured in the Ollama log), so every token sent again costs ~20 ms. The prompt is laid out for that (`agent/prompt.ts`): system prompt + tools (static), then a **SESSION** exchange with today's dates and the provider (changes once a day, primed by the warm-up and re-primed when it changes), then the utterance's CONTEXT. Earlier exchanges are short `earlier:` lines inside CONTEXT, not chat messages, so the prompt keeps its shape from one utterance to the next. Measured (`npm run eval:llm -- cache`): **51–85 new tokens and ~2.4–2.9 s** for an utterance's first model call, against ~300–390 tokens and 8–13 s when history and dates were resent each time.
* The warm-up runs once when the app shell mounts (the first load of the prompt takes a minute or two on this GPU) and is re-sent every 20 minutes to keep the model resident. The assistant panel shows while the model is loading and how long a request has been running, so a slow first request never looks frozen.
* **Memory:** on a machine **without a page file** the commit limit equals the RAM. Ollama with Qwen commits ~6.5 GB; add the bridge, a browser, Teams and an editor and the limit is reached — then processes cannot allocate memory and requests hang or fail (the STT worker restarts itself; Node and Ollama may not). Enable a system-managed page file (System Properties → Advanced → Performance → Virtual memory) to avoid it.
* Omi Med STT runs on the CPU (~0.3–1 s per decode), leaving the GPU to Qwen.
* On a machine without a page file, keep an eye on memory: Ollama with Qwen commits ~6 GB; if the commit limit is reached, parakeet.cpp cannot allocate and the STT worker restarts.

---

## 9. Safety model

* **Patient context is compulsory.** Route guard + runtime guard: no record attaches to the wrong patient or to none; Inbox filing only acts on the selected patient's items.
* **Saving and deleting wait for the provider.** Every create/update/delete tool stops at a confirmation shown in the assistant panel (and a dialog for deletions); the turn ends there and the reply is the question. Only a later "yes" (`confirm_pending_action`, or `save_open_form` for a pending save) or the button writes.
* **The model cannot confirm for the provider.** A confirmation staged in a turn cannot be confirmed in that same turn — the runtime refuses it.
* **No guessing.** Several matching patients or records are returned to the model with their ids and it has to ask; a value that does not fit a field is sent back, never written.
* **No invented data.** The prompt forbids it, extraction is validated field by field, and the patient summary is generated from stored records only.

---

## 10. Extending the app

* **A new field:** add it to `registry/fieldRegistry.ts`, render it in `components/forms/RecordForms.tsx`, map it in `formValuesToRecord`. The tool schemas pick it up automatically.
* **A new page or Summary tab:** add it to `registry/pageRegistry.ts` and the router; `open_page` and the navigation pick it up.
* **A new capability for the assistant:** add a method to `AppRuntime` and a `defineTool` entry in `tools.ts` (zod schema + description). Add a case to `src/services/ai/__evals__/toolChoice.eval.ts` to check the model uses it.

---

## 11. Testing and evaluation

```bash
npm test                 # 102 tests, no model needed
npm run eval:llm         # live evaluation against the real local Qwen
cd python && .venv/Scripts/python -m unittest discover -s tests -v   # streaming session + configuration API
```

* `agent.test.ts` — the loop: tool calls, results back to the model, invalid arguments corrected, stopping at a confirmation, deferred fragments, history, note extraction; schemas generated from the registries and identical on every build.
* `runtime.test.ts` — every action: the patient guard, filling and asking, values sent back instead of written, no same-turn self-confirmation, no guessing, provider lookup, the provider workload.
* `micLifecycle.test.ts` — the microphone with a scripted model: partials, queueing, held fragments, dictated notes, auto-off.
* `appSmoke`, `voiceIntegration`, `inboxVoice`, `inbox` boot the **real application** in jsdom; a scripted model makes the tool calls and the real dialogs, forms and store do the rest.
* `toolChoice.eval.ts` — ~46 utterances (speech-recognition errors, confirmations, dates, notes) sent to the real Qwen with the real prompt and tools; prints what it called and the latency, and fails below 85 %.
