# CareFlow PMS — Patient-Centric, Voice-Controlled Healthcare PMS

A responsive **Healthcare Patient Management System** built around one idea: **you always work on one selected patient**. Everything — dashboard, medications, diagnoses, tasks, recalls, appointments and the summary — belongs to that patient, and nothing patient-dependent can be opened, created, changed or deleted until a patient has been selected.

The whole application can also be driven by voice. Speech is transcribed by a local medical STT model, interpreted into **structured, schema-validated commands** by a local **Qwen** model (with a deterministic interpreter as the fast path and fallback), and executed through a controlled command system that navigates, opens forms, fills fields and stages deletions — but **never saves or deletes without explicit confirmation**.

> Speak → STT → Qwen → structured command → application action → UI update → review → explicit confirmation → save

**Stack:** React 18 · TypeScript · Vite · Ant Design 5 · Redux Toolkit · React Router 6 · lucide-react · Recharts · Zod · Vitest

---

## Table of contents

1. [The eight modules](#1-the-eight-modules)
2. [Patient selection is mandatory](#2-patient-selection-is-mandatory)
3. [Architecture](#3-architecture)
4. [Folder structure](#4-folder-structure)
5. [Installation and commands](#5-installation-and-commands)
6. [Voice architecture](#6-voice-architecture)
7. [Voice command reference](#7-voice-command-reference)
8. [AI Summary](#8-ai-summary)
9. [STT setup (omi-med-stt)](#9-stt-setup-omi-med-stt)
10. [Qwen setup](#10-qwen-setup)
11. [Environment variables](#11-environment-variables)
12. [Mock mode and debugging](#12-mock-mode-and-debugging)
13. [Safety model](#13-safety-model)
14. [Extending the app](#14-extending-the-app)
15. [Testing](#15-testing)

---

## 1. The eight modules

The navigation contains exactly eight entries — nothing else exists in the application.

| # | Module | Path | Needs a patient | What it does |
|---|--------|------|-----------------|--------------|
| 1 | Dashboard | `/dashboard` | yes | Overview of the selected patient: key numbers, what needs attention, and data-driven charts per record type |
| 2 | Patient | `/patients` | no | Search, select, add, update and delete patients. **Selecting here sets the context for everything else** |
| 3 | Inbox | `/inbox` | no | Incoming correspondence in four queues: Lab, Radiology, Referrals, Discharge Summary |
| 4 | Medication | `/medications` | yes | The patient's medications — search + full CRUD |
| 5 | Diagnosis | `/diagnoses` | yes | The patient's problem list — search + full CRUD |
| 6 | Task | `/tasks` | yes | Work owed to the patient — search + full CRUD |
| 7 | Recall | `/recalls` | yes | Reminders to bring the patient back — search + full CRUD |
| 8 | Appointment | `/appointments` | yes | The patient's appointments — search + full CRUD |
| 9 | Summary | `/summary` | yes | Six tabs: **AI Summary**, Medication, Recall, Appointment, Diagnosis, Task |

Summary tabs are real routes (`/summary/ai-summary`, `/summary/medication`, …), and so are the Inbox queues (`/inbox/lab`, `/inbox/radiology`, `/inbox/referral`, `/inbox/discharge`), so a voice command like *"show me the diagnosis tab"* or *"open the radiology inbox"* lands on a URL you can bookmark.

---

## 1a. The Inbox

The Inbox is the one module that deliberately spans patients: it is a provider workqueue, not a patient chart. It reads **existing** clinical records and presents them as one queue — nothing about those records changes.

| Queue | Source record | What counts as "arrived" |
|-------|---------------|---------------------------|
| Lab | `LabOrder` | Status `Resulted` — the result is back |
| Radiology | `ImagingOrder` | Status `Reported` — the report is back |
| Referrals | `Referral` | All referrals, with their current status |
| Discharge Summary | `ClinicalNote` (type `Discharge`) and `ClinicalDocument` (category `Discharge Summary`) | Filed against the patient |

* `services/inbox/inboxModel.ts` normalises the four sources into one `InboxItem` for the list; the reading pane then shows what only that source has — a result value against its reference range, a report body, a referral destination, a document's file details.
* **Attention** is derived, not invented: an abnormal lab, an urgent or STAT priority, a declined referral, an unsigned draft. It is always shown as a labelled chip, never as colour alone.
* **Reviewed** is a presentation state for this screen. It lives in `inboxSlice` + `localStorage` and never writes to the lab, imaging, referral, note or document record — there is a test that asserts exactly that.
* Follow-up actions (task, recall, appointment) open the application's **existing** forms, pre-filled, and save through the usual review step. They are disabled unless the item's patient is the selected patient, so a record can never land on the wrong chart; a one-click "Select patient" unlocks them.
* Layout: a filter strip across the top (patient identifiers, then message attributes, then the Critical / High / Normal counters), and three columns beneath it — the message queue, the item being read, and the assistant. Below 1200px the assistant moves under the reading pane; below 992px it becomes a single column where opening an item replaces the queue.
* The assistant column carries a patient summary, a result summary and the suggested follow-up. Each suggestion is editable inline (quick edit), states the reason it was offered, can be opened in the full form, and is disabled unless the item's patient is the selected patient.

---

## 2. Patient selection is mandatory

**The flow starts at the patient list.** Signing in lands on the Patient module; picking someone there sets the context and opens their dashboard. Everything else follows from that choice.

* Patient-dependent routes sit behind a route guard (`components/patient/RequirePatient.tsx`). With no selected patient the module is **not rendered at all**, so no record can be created, changed or deleted without a patient context.
* The guard redirects to the patient list and carries the route the user was heading for: the list explains why (*"Select a patient to open Dashboard"*) and selecting someone takes them straight there.
* The voice executor enforces the same rule independently (`requirePatient` in `services/ai/commandExecutor.ts`) — a spoken "add a medication" with no patient opens the Patient module instead of a form.
* The **Selected Patient Banner** (`components/patient/SelectedPatientBanner.tsx`) is rendered above every page while a patient is selected: demographics, contact details, and live counts for medications, diagnoses, tasks, recalls and appointments — each one a link into that module.
* The selection survives a reload (`localStorage`), and switching patients immediately refreshes the banner, dashboard, every module and the summary, because they all read the same store.

---

## 3. Architecture

```
src/
  app/            router + providers (Redux, Ant Design theme, voice controller singleton)
  components/
    patient/      PatientPicker · SelectedPatientBanner · RequirePatient (the context layer)
    inbox/        InboxList · InboxDetail (the provider workqueue)
    records/      useRecordModule (add/edit/delete for one record kind) + RecordModulePage
    forms/        RecordFormModal (medication/diagnosis/task/recall/appointment) · PatientFormModal
    summary/      AiSummaryTab · SummaryRecordTab
    voice/        VoiceAssistant panel · VoiceConfirmDialog (destructive confirmations)
    layout/       AppLayout · Sidebar · Header · MobileNav
    tables/ charts/ common/   DataTable, Recharts wrappers, shared UI primitives
  registry/
    pageRegistry      the eight modules + summary tabs: ids, numbers, paths, voice aliases
    fieldRegistry     one form definition per record type: fields, options, synonyms, required
    formRegistry      runtime registry of mounted forms (voice fills these, never the DOM)
    recordRegistry    runtime registry of mounted module pages (voice opens their dialogs)
    commandRegistry   command palette (Ctrl+K) entries, executed through the same executor
    navigationRegistry imperative navigation for non-React code
  services/
    ai/          voiceController · commandExecutor · ruleBasedInterpreter · summaryExtractor
                 prompt.ts (Qwen system prompt) · providers/ (STT + LLM adapters) · speech.ts (TTS)
    api/         repository-backed services, one per record type
    records/     recordMapping (label/summary/read-back/matching) · patientNarrative
    inbox/       inboxModel — normalises four record types into one workqueue
    mock/        deterministic seed data
  store/         Redux Toolkit: patients, providers + five patient-scoped record slices
  types/         domain.ts (data model) · ai.ts (command schema, Zod)
```

**One flow per record type.** `useRecordModule(kind)` owns add / edit / delete / search for a record kind. The module page and the Summary tab both use it, so a medication added from the Summary behaves exactly like one added from the Medication module — same dialog, same validation, same confirmation, same voice control.

---

## 4. Folder structure

Key files worth knowing:

| File | Responsibility |
|------|----------------|
| `registry/pageRegistry.ts` | The eight modules. Voice/palette/router all resolve pages here — the model never guesses routes |
| `registry/fieldRegistry.ts` | Field names, labels, aliases, options, synonyms and required-ness for all six forms |
| `services/ai/commandExecutor.ts` | Deterministic execution of every command. Patient guard + confirmation boundary live here |
| `services/ai/ruleBasedInterpreter.ts` | Natural language → commands without a model (fast path, mock mode and fallback) |
| `services/ai/summaryExtractor.ts` | Dictated paragraph → structured medication/diagnosis/task/recall/appointment items |
| `services/records/patientNarrative.ts` | The spoken patient summary — built only from records that exist |
| `hooks/usePatientData.ts` | One hook for everything the selected patient owns, used by banner, dashboard and modules |
| `services/inbox/inboxModel.ts` | Lab / radiology / referral / discharge records → one `InboxItem`, with attention derived from the data |

---

## 5. Installation and commands

```bash
npm install
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # typecheck + production build
npm run preview      # serve the production build
npm run typecheck    # tsc -b --noEmit
npm test             # vitest run
npm run test:watch
npm run bridge       # start the local Python AI bridge (STT + Qwen)
```

Sign in with any of the demo accounts shown on the login screen (for example `mreed` / `demo`).

---

## 6. Voice architecture

```
microphone → STT (browser Web Speech API or local omi-med-stt via the Python bridge)
          → transcript (Urdu / Roman Urdu translated to English first)
          → deterministic interpreter (fast path) ── or ── Qwen (structured JSON)
          → Zod validation (types/ai.ts) — anything else is rejected
          → CommandExecutor → Redux / router / registered forms
          → UI updates, and the reply can be spoken back
```

* **Nothing is executed that is not in the schema.** The model returns JSON that must parse into `AICommandSchema`; invalid output falls back to the rule-based interpreter.
* **The executor never touches the DOM.** It talks to the page registry, the form registry (mounted forms) and the record registry (mounted module pages).
* **Patient context is resolved at execution time**, so a command always applies to the patient that is selected right now.
* **The microphone stays on** until the user turns it off; speech captured while a command runs is queued, never lost.
* Replies to read-back commands are spoken through the browser's speech synthesis; the speaker icon in the voice panel mutes it.

---

## 7. Voice command reference

**Navigation**

* "go to dashboard" · "open patient" · "open medications" · "go to page 5" · "go back"
* "open summary" → "show me the diagnosis tab"
* "open the inbox" · "open the radiology inbox" · "open the discharge summary inbox"

**Patient context**

* "search patient Ahmed Khan" · "select patient Ahmed Khan" · "change patient to John Smith" · "clear the selected patient"
* "show John Smith's medications" (switches patient *and* opens the module)

**Creating records** (each opens the normal form, pre-filled, and waits for confirmation)

* "add amoxicillin 500 mg orally twice daily for seven days"
* "add panadol and metformin twice daily for 10 days" (one tab per medication, saved together)
* "add diagnosis hypertension"
* "add task blood pressure monitoring due next Friday"
* "set recall for blood pressure review in 3 months"
* "book an appointment next Tuesday at 3 pm for chest pain"
* "add patient Bilal Hussain, male, 32 years old"

**Updating**

* "update medication metformin" (opens it for editing)
* "change the metformin dosage to 1000 mg"
* "mark the blood pressure task as completed" · "stop the metformin"

**Deleting** — always staged, never silent

* "delete the metformin" → the record is shown, the assistant asks, and only "yes, delete it" removes it

**Reading and summarising**

* "read the medication list" · "list the tasks" · "read patient information"
* "give me a summary of this patient"

**Forms while open**

* "set dosage to 250 mg" · "check as needed" · "clear the notes" · "add another" · "save it" · "cancel"

Urdu and Roman Urdu are translated to the command language first, so *"panadol aur metformin din mein do bar das din ke liye add karo"* works the same way.

---

## 8. AI Summary

`/summary/ai-summary` is the voice-driven entry point:

1. **Dictate** one paragraph covering several things at once. The existing STT model transcribes it; the transcript is shown verbatim and stays editable, because the speech model can mishear.
2. **Extract with AI** sends the paragraph to the local Qwen model with an extraction prompt (`services/ai/summaryExtractor.ts`). If no model is reachable, the same job is done by the deterministic parsers, so the feature never turns into a dead button. The badge shows which one produced the result.
3. **Review**: extracted items are grouped into Medication, Diagnosis, Task, Recall and Appointment, each showing the fields the model understood and the words they came from. Anything the model was unsure about is listed as a question instead of being guessed.
4. **Add**: each item opens its normal form, pre-filled, and is stored only when you save it. Nothing is written to the patient record automatically.

Below that, **Patient overview** is a narrative built purely from the records that exist for the patient — no model output, so it cannot invent a medication or a diagnosis.

---

## 9. STT setup (omi-med-stt)

```bash
cd python
python -m venv .venv && .venv/Scripts/activate      # Windows
pip install -r requirements.txt
omi-med-stt install-cpp --cpp-backend cpu
uvicorn app:app --host 127.0.0.1 --port 8765
```

Then set `VITE_STT_PROVIDER=http` and `VITE_STT_API_URL=http://127.0.0.1:8765/api/stt`.
Without the bridge, set `VITE_STT_PROVIDER=browser` to use the Web Speech API (Chrome/Edge).

---

## 10. Qwen setup

```bash
ollama pull qwen3.5:4b
ollama serve
```

`VITE_LLM_PROVIDER=ollama` with `VITE_LLM_API_URL=http://127.0.0.1:11434`. The provider warms the model at startup and keeps it resident; the system prompt is byte-for-byte static so the recurrent-state cache can be reused between commands (see the comment block in `services/ai/prompt.ts`).

Alternatives: `openai-compatible` (llama.cpp server, LM Studio, MLX, vLLM) or `http` (the Python bridge).

---

## 11. Environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_AI_MODE` | `mock` (deterministic interpreter only) or `local` (use the configured models) |
| `VITE_STT_PROVIDER` / `VITE_STT_API_URL` / `VITE_STT_LANGUAGE` | Speech-to-text source |
| `VITE_LLM_PROVIDER` / `VITE_LLM_API_URL` / `VITE_LLM_MODEL` | Language model runtime |
| `VITE_LLM_TIMEOUT_MS` / `VITE_LLM_NUM_GPU` / `VITE_LLM_NUM_CTX` | Model performance knobs |
| `VITE_AI_FALLBACK_TO_RULES` | Fall back to the interpreter when the model is unreachable or invalid |
| `VITE_AI_RULES_FIRST` | Run the interpreter first and only call the model when it cannot understand |
| `VITE_ENABLE_VOICE` / `VITE_ENABLE_DEBUG_PANEL` | Feature flags |

See `.env.example`.

---

## 12. Mock mode and debugging

* **Mock mode** (`VITE_AI_MODE=mock`) runs the entire voice workflow with no models installed — useful for development and for the test suite.
* **Debug panel** (Ctrl+Shift+D) shows the raw transcript, the provider that answered, the raw model output, the parsed commands, every execution step and every field the assistant filled.
* **Command palette** (Ctrl+K) runs the same commands as voice, so any voice action can be reproduced by keyboard.

---

## 13. Safety model

* **Patient context is compulsory.** Two independent guards (route + executor) mean no record can be attached to the wrong patient or to no patient.
* **Saving needs explicit confirmation.** The assistant fills forms and asks; only "save it" / the Save button submits.
* **Deleting is staged.** A spoken delete resolves the record, shows exactly what will go, and waits for "yes, delete it". An ambiguous phrase is never guessed — the assistant lists the candidates and asks.
* **The AI does not invent patient data.** Extraction only maps words that were actually said onto known fields; unknown fields are ignored and reported. The patient summary is generated from stored records only.
* **Every mutation goes through the same form** the user sees, with the same validation.

---

## 14. Extending the app

* **A new field on a record:** add it to `registry/fieldRegistry.ts` (with aliases + synonyms so voice can fill it), render it in `components/forms/RecordForms.tsx`, and map it in `formValuesToRecord`.
* **A new record type:** add the domain type, a service in `services/api`, a slice via `createRecordSlice`, a form definition, a page in the page registry, a route, and a `RecordModulePage`. The voice layer picks it up through `AIRecordKind`.
* **A new voice phrasing:** add a pattern to `services/ai/ruleBasedInterpreter.ts` and an example to `services/ai/prompt.ts`; cover it in `src/services/ai/__tests__/interpreter.test.ts`.

---

## 15. Testing

```bash
npm test
```

171 tests cover the deterministic interpreter (including Urdu/Roman Urdu), the command schema and parser, the medication-list guards, the microphone lifecycle, and the executor: the patient guard, record CRUD, the confirmation boundary for saving and deleting, ambiguity handling, and read-back.

Three suites boot the real application in jsdom rather than mocking it: `appSmoke` (sign-in, the patient gate, the banner, the modules), `voiceIntegration` (a spoken command opens the real dialog and only a spoken confirmation writes), and `inbox` (the four queues, the reading pane, and proof that marking an item reviewed leaves the underlying record untouched).
