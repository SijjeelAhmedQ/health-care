# CareFlow PMS — Voice-Controlled Healthcare Practice Management System

A production-quality, responsive **Healthcare Practice Management System** frontend that can be operated almost entirely by voice. Speech is transcribed by a local medical STT model, interpreted into **structured, schema-validated commands** by a local **Qwen 3.5 4B** model (or a deterministic rule-based interpreter in mock mode), and executed through a controlled command system that navigates, opens forms and fills fields — but **never saves without explicit confirmation**.

> Speak → STT → Qwen 3.5 4B → Intent / Tool Call → Application Command → Navigation → Form Interaction → Review → Explicit Confirmation → Save

**Stack:** React 18 · TypeScript · Vite · Ant Design 5 · Redux Toolkit · React Router 6 · lucide-react · Recharts · Zod · Vitest

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Folder structure](#3-folder-structure)
4. [Installation](#4-installation)
5. [Development commands](#5-development-commands)
6. [Build commands](#6-build-commands)
7. [Voice architecture](#7-voice-architecture)
8. [STT setup (omi-med-stt)](#8-stt-setup-omi-med-stt)
9. [Qwen 3.5 4B setup](#9-qwen-35-4b-setup)
10. [Local model requirements](#10-local-model-requirements)
11. [Model runtime configuration](#11-model-runtime-configuration)
12. [Environment variables](#12-environment-variables)
13. [Mock mode](#13-mock-mode)
14. [Debug mode](#14-debug-mode)
15. [Adding new pages](#15-adding-new-pages)
16. [Adding new voice commands](#16-adding-new-voice-commands)
17. [Adding new forms](#17-adding-new-forms)
18. [Production integration notes](#18-production-integration-notes)
19. [Safety model](#19-safety-model)
20. [Testing](#20-testing)

---

## 1. Project overview

CareFlow is a frontend-first prototype of an enterprise PMS with **85 registered pages** across ten modules:

| Module | Pages | Highlights |
|---|---|---|
| Dashboards | 1–6 | Executive, Practice, Provider, Operations, Financial, Clinical overviews with charts |
| Patients | 7–22 | Search, list, registration (25-field form), profile with 12 tabs (summary, demographics, history, allergies, medications, problems, immunizations, documents, notes, insurance, contacts, communication) |
| Clinical | 23–34 | Consultation dashboard, full consultation encounter screen, clinical notes, SOAP notes, diagnosis, treatment plan, medications, prescriptions, labs, imaging, referrals, documents |
| Appointments | 35–43 | Dashboard, search, day/week/month calendar, create, details, live queue (kanban), history, types, status management |
| Providers | 44–50 | List, profile (details/appointments/credentials/panel), availability, weekly schedule, performance, credentials |
| Roster | 51–56 | Dashboard, create roster, roster calendar, shifts, availability, leave management |
| Practice | 57–64 | Practice management hub, profile, locations, departments, specialties, services/fee schedule, rooms, resources |
| Users | 65–72 | Dashboard, list, create, profile, roles, permission matrix, access control, audit logs |
| Configuration | 73–79 | General, clinical, appointment, medication, notification, security, system preferences (10–18 settings each) |
| Reports | 80–85 | Clinical, patient, appointment, provider, practice, audit reports |
| Developer | 90 | Voice Test Console |

Every page has a real UI: header + breadcrumb + page number, metric cards, filters, searchable/sortable/hideable-column tables with CSV export, drawers/modals with validated forms, empty/loading/error states and responsive behaviour (4-col → 2-col → 1-col forms, collapsible sidebar, mobile drawer navigation).

No backend is required. A mock service layer (`services/api`) with realistic seeded data (96 patients, 14 providers, 220 appointments, 180 medications, …) sits behind the same `Repository<T>` interface a real API would implement. User edits persist to `localStorage`.

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  UI (React + Ant Design)                                                   │
│   pages/  ─ uses ─▶ components/ (PageHeader, DataTable, forms, charts)     │
│   forms register themselves ──▶ FormRegistry (runtime controllers)         │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │ Redux Toolkit (auth, patients, appointments, providers,
               │ medications, ui, voice, navigation)
┌──────────────┴─────────────────────────────────────────────────────────────┐
│  Registries (single source of truth)                                       │
│   PageRegistry   – number · id · path · title · aliases · context needs    │
│   FieldRegistry  – forms, fields, aliases, options, synonyms, normalizers  │
│   FormRegistry   – mounted form controllers (open/fill/validate/submit)    │
│   CommandRegistry– app commands shared by voice + Ctrl+K palette           │
│   NavigationRegistry – imperative navigate/back/scroll targets             │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │ AICommand (Zod-validated discriminated union)
┌──────────────┴─────────────────────────────────────────────────────────────┐
│  AI layer (services/ai)                                                    │
│   voiceController ─▶ STT provider ─▶ LLM provider ─▶ commandParser         │
│                   ─▶ commandExecutor (deterministic tools) ─▶ registries   │
│   providers: Mock (rules) · Ollama · OpenAI-compatible · Python bridge     │
└────────────────────────────────────────────────────────────────────────────┘
```

Key principles:

- **`feature → service → registry → command → state`.** UI never depends on mock data shapes directly; it goes through services and Redux.
- **The LLM only translates language into structured intent.** All behaviour (routing, which form, which field, normalization, confirmation) is deterministic TypeScript in `commandExecutor.ts`.
- **No DOM hacks.** Forms are controlled through `FormRegistry` controllers created by the `useRegisteredForm` hook (wrapping Ant Design `FormInstance`). Pages are resolved through `PageRegistry`.
- **Confirmation boundary.** `submit_form` and `confirm` are the only tools that persist data, and `confirm` only succeeds when a `pendingConfirmation` exists — which the executor creates *after* filling a form and *before* anything is saved.

## 3. Folder structure

```
src/
├── app/            App.tsx, router.tsx (routes generated from PageRegistry), providers.tsx
├── components/
│   ├── common/     PageHeader, MetricCard, StatusTag, SectionCard, EmptyState, FormGrid…
│   ├── layout/     AppLayout, Sidebar (searchable), Header, GlobalSearch, Notifications
│   ├── forms/      RegisteredForm (drawer/card shells), field primitives, Medication/Prescription,
│   │               Appointment, Patient (+Address/Insurance sections), Clinical, Staff, Roster forms
│   ├── tables/     DataTable (search, filters, sort, column visibility, selection, export)
│   ├── charts/     TrendChart, BarsChart, DonutChart (validated palette, single axis)
│   ├── voice/      VoiceAssistant (floating panel + FAB, all voice states)
│   ├── command-palette/  Ctrl+K palette (shares CommandRegistry with voice)
│   └── debug/      DebugPanel drawer (transcript → command → tool → execution)
├── pages/          dashboard/ patients/ clinical/ appointments/ providers/ roster/
│                   practice/ users/ configuration/ reports/ dev/ + LoginPage
├── services/
│   ├── api/        repository.ts (Repository<T> + mock impl), index.ts (domain services)
│   ├── mock/       mockDb.ts (seeded realistic data), random.ts
│   └── ai/         config, prompt, ruleBasedInterpreter, dateParser, commandParser,
│                   commandExecutor, voiceController, providers/{llmProviders,sttProviders}
├── store/          index.ts + slices/ (auth, patient, appointment, provider, medication, ui, voice, navigation)
├── registry/       pageRegistry, fieldRegistry, formRegistry, commandRegistry, navigationRegistry
├── hooks/          useRegisteredForm, useAsyncData, usePageTracking, useResponsive, useScrollSection…
├── types/          domain.ts (healthcare model), ai.ts (AICommand schema, provider interfaces)
├── theme/          tokens.ts (colors, spacing, radius, shadows, chart palette), antdTheme.ts
├── styles/         global.css (layout, responsive grids, voice UI)
├── constants/      status colour map
└── utils/          format.ts (dates, currency, initials)
python/             FastAPI bridge for omi-med-stt + Qwen (optional)
```

## 4. Installation

```bash
npm install
cp .env.example .env      # defaults to mock AI mode — no models needed
npm run dev               # http://localhost:5173
```

Sign in with any credentials (e.g. `mreed` / anything). The app is fully functional in mock mode.

## 5. Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run typecheck` | `tsc -b --noEmit` (strict, `noUnusedLocals`) |
| `npm test` | Vitest — interpreter, parser, page registry and executor tests |
| `npm run test:watch` | Watch mode |

Keyboard shortcuts in the app: `Ctrl+K` command palette · `Ctrl+Shift+V` push-to-talk · `Ctrl+Shift+D` debug panel · `Ctrl+B` toggle sidebar · `Esc` close voice panel.

## 6. Build commands

```bash
npm run build      # tsc -b && vite build  → dist/
npm run preview    # serve the production build locally
```

Routes are lazy-loaded per module (`react`, `antd`, `charts` vendor chunks + one chunk per feature area).

## 7. Voice architecture

```
Microphone
   ↓  BrowserSTTProvider (Web Speech API)  |  HttpSTTProvider (MediaRecorder → python bridge → omi-med-stt)
Transcript  ── normalizeTranscript ──▶ AIContext (current page, patient in context, open form, pending question)
   ↓
LLMProvider.generateCommands(transcript, context)
   • MockLLMProvider          deterministic rule-based interpreter (mock mode / fallback)
   • OllamaLLMProvider        qwen3.5:4b via /api/chat (JSON mode, think=false, temperature 0)
   • OpenAICompatibleLLMProvider   llama.cpp / LM Studio / MLX server /v1/chat/completions
   • HttpBridgeLLMProvider    python/app.py
   ↓
commandParser.parseCommands(raw)  — strips <think>/fences, extracts JSON, validates with Zod (AICommandSchema)
   ↓  AICommand[]   e.g. [{action:"navigate",target:30},{action:"add_medication",fields:{…}}]
CommandExecutor.execute(command)  — one deterministic tool per action:
   navigate_to_page · search_patient · open_patient · open_patient_section · open_provider · open_form ·
   fill_form / fill_field / select_dropdown / set_checkbox / clear_field / focus_form_field ·
   scroll / scroll_to_section · open_tab · request_confirmation · save_after_confirmation · cancel_command …
   ↓
Redux + React Router + FormRegistry controllers → UI
```

**Voice states** (`voiceSlice.status`): `idle → listening → transcribing → processing → executing → confirmation_required | completed | error | cancelled`, each rendered in the floating assistant with its own indicator.

**Multi-turn.** If a required field is missing the executor sets a `pendingSlot` and asks (“What dosage?”). The next utterance that doesn't match a command answers that slot. A full medication phrase given as an answer is parsed into all its fields.

**Context awareness.** With a patient open, “open medications/allergies/insurance” target that patient's tabs; “add medication” pre-fills the patient and opens the patient-scoped form. On the Prescriptions page (page 30) “add medication” opens the prescription form because it carries the same medication fields.

**Confirmation boundary.** After filling, the executor produces a `pendingConfirmation` (summary shown in the panel and a banner inside the form). Only `save it / yes / submit / confirm` → `confirm` triggers `controller.submit()` — the exact handler the Save button calls. `cancel / no / never mind` closes without saving. `submit_form` without a pending confirmation *requests* one instead of saving.

## 8. STT setup (omi-med-stt)

Option A — **browser** (no model): `VITE_STT_PROVIDER=browser`. Uses the Web Speech API (Chrome/Edge). Streaming interim text.

Option B — **local omi-med-stt via the python bridge**: `VITE_STT_PROVIDER=http`, `VITE_STT_API_URL=http://127.0.0.1:8765/api/stt`.

```bash
cd python
python -m venv .venv && .venv\Scripts\activate       # Windows (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
# choose ONE runtime:
pip install pywhispercpp          # GGUF  → omi-health/omi-med-stt-v1-gguf   (CAREFLOW_STT_ENGINE=gguf)
pip install mlx-whisper           # MLX   → omi-health/omi-med-stt-v1-mlx / -mlx-q8 (Apple Silicon, CAREFLOW_STT_ENGINE=mlx)
# GGUF: download the .gguf into python/models/omi-med-stt-v1.gguf (or set CAREFLOW_STT_MODEL_PATH)
uvicorn app:app --host 127.0.0.1 --port 8765
```

`ffmpeg` must be on PATH (browser audio is webm/ogg and is converted to 16 kHz mono WAV). The frontend records with `MediaRecorder`, POSTs the blob, and shows the **Transcribing…** state until text returns.

## 9. Qwen 3.5 4B setup

Any of these work — set `VITE_AI_MODE=local` and the matching provider:

**Ollama (recommended on Windows/Linux)**
```bash
ollama pull qwen3.5:4b            # quantized build that fits typical local hardware
ollama serve
```
`.env`: `VITE_LLM_PROVIDER=ollama`, `VITE_LLM_API_URL=http://127.0.0.1:11434`, `VITE_LLM_MODEL=qwen3.5:4b`

**llama.cpp / LM Studio / MLX server (OpenAI-compatible)**
```bash
llama-server -m Qwen3.5-4B-Q4_K_M.gguf --port 8080 --jinja
```
`.env`: `VITE_LLM_PROVIDER=openai-compatible`, `VITE_LLM_API_URL=http://127.0.0.1:8080`, `VITE_LLM_MODEL=<served model name>`

**Python bridge** — `VITE_LLM_PROVIDER=http`, `VITE_LLM_API_URL=http://127.0.0.1:8765/api/llm` (bridge forwards to Ollama or llama.cpp; see `python/.env.example`).

The system prompt (`services/ai/prompt.ts`) lists every page id/number, every form with its fields and required markers, the current context, and few-shot examples. It instructs the model to output **only JSON**, never invent medical values, and never emit `submit_form` unless the user explicitly says save/submit.

## 10. Local model requirements

| Model | Size | Runtime | Notes |
|---|---|---|---|
| `omi-health/omi-med-stt-v1-gguf` | 0.6B | whisper.cpp (pywhispercpp) | CPU friendly, any OS |
| `omi-health/omi-med-stt-v1-mlx` / `-mlx-q8` | 0.6B | mlx-whisper | Apple Silicon |
| `qwen3.5:4b` (Q4_K_M ≈ 2.5 GB) | 4B | Ollama / llama.cpp / MLX | ~4–6 GB RAM/VRAM; JSON mode; `think=false` |

Typical latency on a laptop: STT 0.5–2 s per utterance, Qwen 0.5–3 s per command. Nothing leaves the machine in local mode.

## 11. Model runtime configuration

Runtime is chosen by `.env` and can be **overridden at runtime** in the Voice Test Console (page 90) — mode, LLM provider/endpoint/model, STT provider/endpoint — persisted in `localStorage` (`careflow.ai.override`). `VoiceController.reconfigure()` swaps adapters live.

If the local model is unreachable or returns invalid JSON and `VITE_AI_FALLBACK_TO_RULES=true`, the deterministic interpreter handles the utterance and the debug trace records the fallback reason.

## 12. Environment variables

```env
VITE_AI_MODE=mock                 # mock | local
VITE_STT_PROVIDER=browser         # mock | browser | http
VITE_STT_API_URL=http://127.0.0.1:8765/api/stt
VITE_LLM_PROVIDER=ollama          # mock | ollama | openai-compatible | http
VITE_LLM_API_URL=http://127.0.0.1:11434
VITE_LLM_MODEL=qwen3.5:4b
VITE_LLM_TIMEOUT_MS=20000
VITE_AI_FALLBACK_TO_RULES=true
VITE_ENABLE_VOICE=true
VITE_ENABLE_DEBUG_PANEL=true
VITE_APP_NAME=CareFlow PMS
```
No `localhost` URLs are hard-coded in application code; everything is read in `services/ai/config.ts`.

## 13. Mock mode

`VITE_AI_MODE=mock` (default). `MockLLMProvider` runs the rule-based interpreter (`services/ai/ruleBasedInterpreter.ts`) which understands navigation verbs, page numbers, patient lookup, medication/appointment/patient phrases, field-level edits, confirmations and multi-clause commands (“go to page 30 and add medication”). Everything downstream is the production path.

**Voice Test Console** (`/dev/voice-console`, page 90, or `Ctrl+K → Voice Test Console`): type a transcript, run it through the full pipeline or preview the interpretation only, run canned scenarios (multi-step navigation, slot filling, appointment booking, registration, error handling), inspect conversation history, and switch runtimes. The floating assistant also has a **keyboard mode** for typing commands when no microphone is available.

## 14. Debug mode

`Ctrl+Shift+D` (or the bug icon) opens the **Debug Panel**: raw transcript, normalized transcript, provider used (incl. fallback reason), raw model output, validated commands, execution steps with tool names/status/timing, fields modified, confirmation state, context sent to the model, plus registry views (current page, mounted forms, page list). History keeps the last 20 traces.

## 15. Adding new pages

1. Register it in `src/registry/pageRegistry.ts`:
   ```ts
   p(86, 'billing-dashboard', '/billing', 'Billing Dashboard', 'reports', ['billing', 'invoices']),
   ```
   Add `requiresContext: 'patientId'` + `parentId/tab` for patient-scoped tabs.
2. Create the page component and map it in `src/app/router.tsx` (`components['billing-dashboard'] = lazy(...)`). Routes, sidebar entries, breadcrumbs, palette commands and voice aliases are all derived from the registry.
3. Use `<PageHeader title=… />` so the page number chip and breadcrumb render.

## 16. Adding new voice commands

- **A new page or alias:** add aliases in `pageRegistry.ts` — “go to X” resolves automatically.
- **A new tool:** add a Zod schema + union member in `types/ai.ts`, a `case` in `CommandExecutor.execute`, a rule in `ruleBasedInterpreter.ts` (mock/fallback), and a line in `prompt.ts` so Qwen knows the shape. Add a test in `services/ai/__tests__`.
- **A palette action:** add an `AppCommand` in `commandRegistry.ts`; it becomes available in `Ctrl+K` and can be triggered by voice through the same executor.

## 17. Adding new forms

1. Describe the form in `fieldRegistry.ts`: id, aliases, hosting `pages`, `fields` (name, label, type, aliases, options, synonyms, `required`, optional `normalize`), `submitLabel`, `sensitiveDescription`.
2. Build the UI with `RegisteredFormDrawer` / `RegisteredFormCard` and the field primitives in `components/forms/fields.tsx` (they read labels/options/required from the registry). `useRegisteredForm` registers a `FormController` so voice can open, fill, validate, summarize and submit it.
3. Nothing else is needed: “open <alias>”, “set <field> to <value>”, slot-filling and the confirmation flow work generically.

## 18. Production integration notes

- **Backend:** implement `Repository<T>` (`services/api/repository.ts`) over HTTP and swap `createMockRepository` calls in `services/api/index.ts`. Thunks in the slices and every page keep working.
- **Auth:** `authService` returns an `AuthSession`; replace with your IdP flow. `RequireAuth` in the router guards all app routes.
- **Voice in production:** keep `VITE_AI_FALLBACK_TO_RULES=true` for resilience; consider running the python bridge as a local service so audio never leaves the workstation; audit `submit`/`confirm` executions via the existing trace (`voice.traceHistory`).
- **Persistence:** mock repositories write to `localStorage` keys `careflow.*`; clear them to reset demo data.

## 19. Safety model

- The model cannot execute code or touch the DOM — only validated `AICommand`s exist, and each maps to a fixed tool.
- Unknown fields are ignored and reported (“ignored unknown field: colour”), never guessed.
- Missing required clinical data triggers a question, never a default. The assistant enters exactly what the user said (normalized units/synonyms only).
- Saving requires an explicit confirmation utterance or clicking Save; validation errors block saving.
- Patient-scoped pages refuse to open without a patient in context and redirect to Patient Search with an explanation.

## 20. Testing

```bash
npm test
```
50 tests cover: page resolution (aliases, numbers, paths), navigation phrasing variations, multi-step splitting, patient search/open, medication/appointment/patient phrase parsing, date parsing, synonym normalization, required-field detection, confirmation/cancel boundary, slot answers, field-level edits, JSON extraction/validation, and the executor (navigate, context requirements, open patient, fill → ask → confirm, cancel without save, validation blocking save, unknown-field handling, batch stop at confirmation boundary).
