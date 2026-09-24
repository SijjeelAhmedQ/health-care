/**
 * Voice controller — orchestrates the pipeline
 *   microphone -> STT -> transcript -> LLM (Qwen / rules) -> validated commands
 *   -> CommandExecutor -> Redux / router / forms
 * and keeps voiceSlice in sync so the UI can render every state.
 */
import type { AppStore, RootState } from '@/store';
import { voiceActions, type PendingSlot } from '@/store/slices/voiceSlice';
import { navigationActions } from '@/store/slices/navigationSlice';
import { uiActions } from '@/store/slices/uiSlice';
import { deletePatient, setCurrentPatient, setLastSearch, patientSelectors } from '@/store/slices/patientSlice';
import { recordSlices } from '@/store/slices/recordSlices';
import type { AICommand, AIContext, AIRecordKind, DebugTrace, ExecutionStep, FieldValues, LLMProvider, PendingConfirmation } from '@/types/ai';
import { patientService } from '@/services/api';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import { FormRegistry } from '@/registry/formRegistry';
import { buildPatientNarrative } from '@/services/records/patientNarrative';
import type { AnyRecord } from '@/services/records/recordMapping';
import { CommandExecutor, type ExecutionResult } from './commandExecutor';
import { CommandParseError, coalesceMedicationCommands } from './commandParser';
import { effectiveConfig } from './config';
import { createLLMProvider, MockLLMProvider, ModelUnavailableError } from './providers/llmProviders';
import { createSTTProvider, type ListeningSession, type MicrophoneRecognizer } from './providers/sttProviders';
import { interpret, looksLikeCommand, normalizeTranscript } from './ruleBasedInterpreter';
import { isCompleteShortCommand, isInboxPage } from './inboxGrammar';
import { correctMisheardCommand } from './speechCorrections';
import { speak } from './speech';
import { translateUrdu } from './urdu/translator';

/** Records of one kind belonging to the selected patient. */
function patientRecords(state: RootState, kind: AIRecordKind): AnyRecord[] {
  if (kind === 'patient') return patientSelectors.selectAll(state);
  const patientId = state.patients.currentPatientId;
  if (!patientId) return [];
  return recordSlices[kind].selectors.selectAll(state).filter((r) => r.patientId === patientId) as AnyRecord[];
}

const KIND_CUES: Array<[AIRecordKind, RegExp]> = [
  ['medication', /\b(?:start(?:ed)?\s+(?:the\s+|him\s+|her\s+)?(?:patient\s+)?on|prescribe[ds]?|medications?|medicines?|tablets?|capsules?|\d+\s*(?:mg|ml|mcg)|(?:once|twice|three times)\s+(?:a\s+)?da(?:il)?y)\b/i],
  ['diagnosis', /\bdiagnos(?:is|es|e|ed)\b/i],
  ['task', /\btasks?\b/i],
  ['recall', /\brecall\b/i],
  ['appointment', /\b(?:appointments?|follow[\s-]?up|schedule[ds]?)\b/i],
];

/** Which record kinds a spoken sentence talks about. */
function mentionedKinds(text: string): Set<AIRecordKind> {
  const urdu = translateUrdu(text);
  const english = correctMisheardCommand(urdu.detected ? urdu.text : text);
  return new Set(KIND_CUES.filter(([, re]) => re.test(english)).map(([kind]) => kind));
}

/**
 * A dictated clinical note ("start metformin …, add hypertension as a diagnosis, recall the patient …")
 * rather than a command: it covers three or more record kinds, or two in a long run of speech.
 */
export function isClinicalParagraph(text: string): boolean {
  const kinds = mentionedKinds(text).size;
  const words = text.split(/\s+/).filter(Boolean).length;
  return kinds >= 3 || (kinds >= 2 && words >= 18);
}

let counter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export class VoiceController {
  private llm: LLMProvider;
  private stt: MicrophoneRecognizer;
  private readonly fallback = new MockLLMProvider();
  private session: ListeningSession | null = null;
  private executor: CommandExecutor;
  private cancelled = false;
  private busy = false;
  /** User intent: the microphone stays on until the user explicitly turns it off. */
  private micActive = false;
  /** Transcript segments are processed strictly one after another. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: AppStore, overrides?: { stt?: MicrophoneRecognizer; llm?: LLMProvider }) {
    const config = effectiveConfig();
    this.llm = overrides?.llm ?? createLLMProvider(config);
    this.stt = overrides?.stt ?? createSTTProvider(config);
    this.executor = new CommandExecutor(this.buildDeps());
    this.publishProviders();
    // Signing out ends voice control at once: the microphone goes off and nothing
    // said about the last patient is left on screen for the next user.
    let signedIn = !!store.getState().auth?.token;
    store.subscribe(() => {
      const now = !!this.store.getState().auth?.token;
      const signedOut = signedIn && !now;
      // Updated before shutting down: shutdown dispatches, which calls this listener again.
      signedIn = now;
      if (signedOut) this.shutdown();
    });
  }

  /** Sign-out: microphone off, pending work dropped, conversation cleared — silently. */
  shutdown() {
    this.cancelled = true;
    this.micActive = false;
    if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
    this.fragment = null;
    this.fragmentTimer = null;
    this.clearSilenceTimer();
    this.paragraph = null;
    this.dictation = null;
    const session = this.session;
    this.session = null;
    session?.cancel();
    const { dispatch } = this.store;
    dispatch(voiceActions.setMicActive(false));
    dispatch(voiceActions.resetVoice());
    dispatch(voiceActions.clearHistory());
    dispatch(voiceActions.setPanelOpen(false));
    dispatch(voiceActions.setHelpOpen(false));
  }

  /** Re-create providers after the dev console changed the configuration. */
  reconfigure() {
    const config = effectiveConfig();
    (this.llm as { dispose?: () => void }).dispose?.();
    this.llm = createLLMProvider(config);
    this.stt = createSTTProvider(config);
    this.publishProviders();
  }

  get llmProvider() {
    return this.llm;
  }

  getExecutor() {
    return this.executor;
  }

  private publishProviders() {
    this.store.dispatch(voiceActions.setProviders({ stt: this.stt.providerName, llm: this.llm.name }));
    this.store.dispatch(voiceActions.setMicSupported(this.stt.isSupported()));
  }

  // ------------------------------------------------------------- microphone

  /** Whether the user has the microphone switched on. */
  get isMicActive() {
    return this.micActive;
  }

  /**
   * Turn the microphone ON. It stays on — across sentences, silences, transcription
   * results, command execution and AI responses — until stopListening()/cancel().
   */
  startListening() {
    const { dispatch } = this.store;
    if (this.micActive && this.session) return;
    this.micActive = true;
    this.cancelled = false;
    dispatch(voiceActions.setMicActive(true));
    dispatch(voiceActions.setPanelOpen(true));
    dispatch(voiceActions.setResponse(null));
    if (!this.busy) dispatch(voiceActions.setStatus('listening'));
    this.openSession();
    this.armSilenceTimer();
  }

  private openSession() {
    const { dispatch } = this.store;
    this.session = this.stt.start({
      // After Mic Off the engine may still flush its last bit of audio. That speech is dropped
      // (see onFinal), so it must not flip the status back to "Transcribing…" either.
      onInterim: (text) => {
        if (!this.micActive) return;
        dispatch(voiceActions.setInterimTranscript(text));
        this.dictation?.onInterim?.(text);
        // Still talking — the 10 s pause starts over.
        if (text && this.micActive) this.armSilenceTimer();
      },
      onTranscribing: () => {
        if (!this.micActive) return;
        this.armSilenceTimer();
        if (!this.busy) dispatch(voiceActions.setStatus('transcribing'));
      },
      // A completed utterance segment: process it, but keep the microphone open.
      onFinal: (text) => {
        if (!this.micActive) return;
        this.armSilenceTimer();
        this.acceptSegment(text);
      },
      onError: (error, fatal) => {
        if (this.cancelled && !this.micActive) return;
        dispatch(voiceActions.setError(error.message));
        dispatch(voiceActions.pushHistory({ id: uid('turn'), transcript: '', response: error.message, status: 'error', timestamp: Date.now() }));
        if (fatal) {
          // The device/permission is gone; only a user action can re-enable the mic.
          this.micActive = false;
          this.session = null;
          dispatch(voiceActions.setMicActive(false));
        }
      },
      onEnd: () => {
        // The adapter restarts itself after engine-side silence timeouts, so onEnd only fires
        // when the session is really over. If the user still wants the mic on, re-open it.
        this.session = null;
        if (this.micActive && !this.cancelled) setTimeout(() => this.micActive && !this.session && this.openSession(), 300);
      },
    });
  }

  /**
   * Dictation mode: the microphone feeds a text box (the AI Summary paragraph)
   * instead of the command pipeline. Nothing spoken here is executed.
   */
  private dictation: { onText: (text: string) => void; onInterim?: (text: string) => void } | null = null;

  get isDictating() {
    return this.dictation !== null;
  }

  /** Start capturing speech as plain text. Returns a stop function. */
  startDictation(handlers: { onText: (text: string) => void; onInterim?: (text: string) => void }): () => void {
    this.dictation = handlers;
    const { dispatch } = this.store;
    dispatch(voiceActions.setError(null));
    dispatch(voiceActions.setStatus('listening'));
    this.micActive = true;
    this.cancelled = false;
    dispatch(voiceActions.setMicActive(true));
    if (!this.session) this.openSession();
    return () => this.stopDictation();
  }

  stopDictation() {
    if (!this.dictation) return;
    this.dictation = null;
    this.micActive = false;
    const { dispatch } = this.store;
    dispatch(voiceActions.setMicActive(false));
    dispatch(voiceActions.setInterimTranscript(''));
    dispatch(voiceActions.setStatus('idle'));
    const session = this.session;
    this.session = null;
    session?.stop();
  }

  /** Text of a very short segment we are holding, waiting to see whether the user continues the sentence. */
  private fragment: string | null = null;
  private fragmentTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly FRAGMENT_HOLD_MS = 2500;

  /**
   * Speech is chunked at pauses, so a natural mid-sentence pause ("I am … going to add a medication")
   * can produce a fragment. Very short segments that are not complete commands are held briefly and
   * merged with the next one; anything that is clearly a command or an answer to a pending question
   * is processed immediately.
   */
  private acceptSegment(text: string) {
    const { dispatch, getState } = this.store;
    // Dictation mode (AI Summary): what is said is captured as text, never executed as a command.
    if (this.dictation) {
      const clean = text.trim();
      if (clean) this.dictation.onText(clean);
      dispatch(voiceActions.setInterimTranscript(''));
      return;
    }
    // A clinical paragraph is being dictated: keep collecting until the user pauses.
    if (this.paragraph) {
      const clean = text.trim();
      if (clean) this.paragraph.push(clean);
      dispatch(voiceActions.setInterimTranscript(''));
      dispatch(voiceActions.setTranscript(this.paragraph.join(' ')));
      this.armSilenceTimer();
      return;
    }
    const state = getState().voice;
    if (!state.pendingSlot && !state.pendingConfirmation) {
      const withFragment = this.fragment ? `${this.fragment} ${text}`.trim() : text.trim();
      if (isClinicalParagraph(withFragment)) {
        if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
        this.fragment = null;
        this.fragmentTimer = null;
        this.beginParagraph(withFragment);
        return;
      }
    }
    const combined = this.fragment ? `${this.fragment} ${text}`.trim() : text.trim();
    if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
    this.fragmentTimer = null;
    this.fragment = null;

    const words = combined.split(/\s+/).filter(Boolean).length;
    const expectsAnswer = !!state.pendingSlot || !!state.pendingConfirmation;
    // "Next", "file it", "mic off" are whole commands however short they are.
    const isShortFragment = words < 3 && !looksLikeCommand(combined) && !expectsAnswer && !isCompleteShortCommand(normalizeTranscript(combined), this.buildContext());
    if (isShortFragment) {
      this.fragment = combined;
      dispatch(voiceActions.setInterimTranscript(`${combined} …`));
      this.fragmentTimer = setTimeout(() => {
        const held = this.fragment;
        this.fragment = null;
        this.fragmentTimer = null;
        if (held && this.micActive) void this.handleTranscript(held);
      }, VoiceController.FRAGMENT_HOLD_MS);
      return;
    }
    void this.handleTranscript(combined);
  }

  /** Segments of a clinical paragraph being dictated to the assistant (null when not capturing). */
  private paragraph: string[] | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  /** A pause this long turns the microphone off (and finishes a dictated clinical paragraph). */
  static SILENCE_MS = 10000;

  get isCapturingParagraph() {
    return this.paragraph !== null;
  }

  /**
   * The user is dictating a whole clinical note ("start metformin …, add hypertension …, recall …")
   * rather than giving a command. Instead of executing it clause by clause, collect everything they
   * say until a 10 s pause, then hand the paragraph to the AI Summary tab for extraction.
   */
  private beginParagraph(text: string) {
    const { dispatch, getState } = this.store;
    const voice = getState().voice;
    // Speech engines split long sentences at breaths, so the opening clause ("start the patient on
    // metformin …") may already have gone down the command pipeline. Pull it back into the paragraph.
    const previous = this.busy ? voice.transcript : voice.history[0] && Date.now() - voice.history[0].timestamp < VoiceController.SILENCE_MS ? voice.history[0].transcript : '';
    const parts = previous && mentionedKinds(previous).size > 0 ? [previous, text] : [text];
    if (parts.length > 1) {
      if (this.busy) {
        this.cancelled = true;
        void this.chain.then(() => {
          this.cancelled = false;
        });
      }
      dispatch(voiceActions.setPendingConfirmation(null));
      dispatch(voiceActions.setPendingSlot(null));
      dispatch(navigationActions.setOpenForm(null));
    }
    this.paragraph = parts;
    dispatch(voiceActions.setPanelOpen(true));
    dispatch(voiceActions.setError(null));
    dispatch(voiceActions.setTranscript(parts.join(' ')));
    dispatch(voiceActions.setStatus('listening'));
    dispatch(voiceActions.setCurrentAction('Taking a clinical note — keep talking, pause for 10 seconds when you are done…'));
    this.armSilenceTimer();
  }

  /** (Re)start the 10 s pause countdown; any speech resets it. */
  private armSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.onSilence(), VoiceController.SILENCE_MS);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  /** Nobody spoke for 10 s: turn the mic off. A command still running gets its turn first. */
  private onSilence() {
    this.silenceTimer = null;
    // The AI Summary dictation box runs its own pause timer (and extracts afterwards).
    if (!this.micActive || this.dictation) return;
    // Reading a result takes longer than 10 s. In the Inbox and during patient work (the Patient
    // page, the patient form, a patient question or confirmation) the microphone stays on until
    // the user says "stop listening" (or presses Mic Off) — a clinical note still finishes.
    const state = this.store.getState();
    const inInbox = isInboxPage(state.navigation?.currentPageId);
    const patientWork =
      state.navigation?.currentPageId === 'patients' ||
      FormRegistry.active()?.formId === 'patient' ||
      state.voice.pendingSlot?.formId === 'patient' ||
      state.voice.pendingConfirmation?.formId === 'patient';
    if (this.busy || ((inInbox || patientWork) && !this.paragraph)) {
      this.armSilenceTimer();
      return;
    }
    this.stopListening();
  }

  /** Mic off, open the AI Summary tab and let it extract the paragraph ("Dictate" + "Extract with AI"). */
  private finishParagraph() {
    this.clearSilenceTimer();
    const parts = this.paragraph;
    this.paragraph = null;
    if (!parts) return;
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    const { dispatch, getState } = this.store;
    if (this.micActive) this.stopListening();
    dispatch(voiceActions.setCurrentAction(null));
    if (!text) return;
    dispatch(voiceActions.setSummaryHandoff({ id: uid('note'), text }));
    NavigationRegistry.navigate('/summary/ai-summary');
    const response = getState().patients.currentPatientId
      ? 'Opened the AI Summary and extracting what you said.'
      : 'Opened the AI Summary and extracting what you said. Select a patient before saving the items.';
    dispatch(voiceActions.setResponse(response));
    dispatch(voiceActions.setStatus('completed'));
    dispatch(voiceActions.pushHistory({ id: uid('turn'), transcript: text, response, status: 'ok', timestamp: Date.now() }));
    setTimeout(() => {
      if (this.store.getState().voice.status === 'completed') dispatch(voiceActions.setStatus(this.micActive ? 'listening' : 'idle'));
    }, 2500);
  }

  /** "Mic off": the user pressed it, switched to typing/speaker, or paused for 10 s. */
  stopListening() {
    const { dispatch } = this.store;
    // Turning the mic off in the middle of a clinical note finishes it straight away.
    if (this.paragraph) {
      this.finishParagraph();
      return;
    }
    this.clearSilenceTimer();
    this.micActive = false;
    if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
    const held = this.fragment;
    this.fragment = null;
    this.fragmentTimer = null;
    if (held) void this.handleTranscript(held); // don't lose what was said right before Mic Off
    dispatch(voiceActions.setMicActive(false));
    dispatch(voiceActions.setInterimTranscript(''));
    const session = this.session;
    this.session = null;
    session?.stop();
    if (!this.busy && ['listening', 'transcribing'].includes(this.store.getState().voice.status)) dispatch(voiceActions.setStatus('idle'));
  }

  /** Explicit Cancel: abort the current command AND turn the microphone off. */
  cancel() {
    this.cancelled = true;
    this.micActive = false;
    if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
    this.fragment = null;
    this.fragmentTimer = null;
    this.clearSilenceTimer();
    this.paragraph = null;
    const session = this.session;
    this.session = null;
    session?.cancel();
    const { dispatch } = this.store;
    dispatch(voiceActions.setMicActive(false));
    dispatch(voiceActions.setInterimTranscript(''));
    dispatch(voiceActions.setStatus('cancelled'));
    dispatch(voiceActions.setCurrentAction(null));
    dispatch(voiceActions.setResponse('Cancelled.'));
    setTimeout(() => {
      if (this.store.getState().voice.status === 'cancelled') dispatch(voiceActions.setStatus('idle'));
    }, 1200);
  }

  toggleListening() {
    if (this.micActive) this.stopListening();
    else this.startListening();
  }

  // ---------------------------------------------------------------- pipeline

  /**
   * Entry point for both real transcripts and the mock console. Segments are queued and
   * processed one at a time, so speech captured while a command is executing is never lost.
   */
  handleTranscript(rawTranscript: string): Promise<ExecutionResult[]> {
    if (!rawTranscript.trim()) return Promise.resolve([]);
    // A typed / pasted clinical note has no pause to wait for: send it to the AI Summary right away.
    const voice = this.store.getState().voice;
    if (!voice.pendingSlot && !voice.pendingConfirmation && isClinicalParagraph(rawTranscript)) {
      this.paragraph = [...(this.paragraph ?? []), rawTranscript.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')];
      this.finishParagraph();
      return Promise.resolve([]);
    }
    const run = this.chain.then(() => this.processTranscript(rawTranscript), () => this.processTranscript(rawTranscript));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async processTranscript(rawTranscript: string): Promise<ExecutionResult[]> {
    const { dispatch } = this.store;
    this.busy = true;
    this.cancelled = false;
    const heard = rawTranscript.trim();
    const context = this.buildContext();
    /*
     * The speech engine has no idea what this application's words are and hands
     * back everyday English instead ("somebody" for "summary"), so a command is
     * put right before anything reads it. While a field value is being dictated
     * the words ARE the value, so there nothing is touched.
     */
    const transcript = context.pendingSlot ? heard : correctMisheardCommand(heard);
    const normalized = normalizeTranscript(transcript);

    const trace: DebugTrace = {
      rawTranscript: heard,
      normalizedTranscript: normalized,
      provider: this.llm.name,
      rawModelOutput: '',
      commands: [],
      context,
      steps: [],
      fieldsModified: [],
      startedAt: Date.now(),
    };

    dispatch(voiceActions.setPanelOpen(true));
    dispatch(voiceActions.setError(null));
    dispatch(voiceActions.setTranscript(transcript));
    dispatch(voiceActions.setStatus('processing'));
    dispatch(voiceActions.setCurrentAction('Understanding…'));
    dispatch(voiceActions.setResponse(null));
    dispatch(voiceActions.setTrace(snapshotTrace(trace)));

    let commands: AICommand[] = [];
    try {
      const generated = await this.generate(transcript, context, trace);
      commands = generated;
      trace.commands = commands;
      dispatch(voiceActions.setCommands(commands));
      dispatch(voiceActions.setTrace(snapshotTrace(trace)));
    } catch (e) {
      const message = friendlyError(e);
      dispatch(voiceActions.setError(message));
      dispatch(voiceActions.setCurrentAction(null));
      dispatch(voiceActions.finalizeTrace({ error: message }));
      dispatch(voiceActions.pushHistory({ id: uid('turn'), transcript, response: message, status: 'error', timestamp: Date.now() }));
      this.busy = false;
      return [];
    }

    if (this.cancelled) {
      this.busy = false;
      return [];
    }

    dispatch(voiceActions.setStatus('executing'));
    const results: ExecutionResult[] = [];
    for (let i = 0; i < commands.length; i++) {
      if (this.cancelled) break;
      const command = commands[i];
      const step: ExecutionStep = { id: uid('step'), command, tool: command.action, status: 'running', message: '', startedAt: Date.now() };
      dispatch(voiceActions.updateTraceStep(step));
      dispatch(voiceActions.setCurrentAction(describeAction(command)));
      const result = await this.executor.execute(command, 'voice');
      results.push(result);
      const done: ExecutionStep = { ...step, tool: result.tool, status: result.requiresConfirmation ? 'awaiting_confirmation' : result.ok ? 'done' : 'failed', message: result.message, finishedAt: Date.now() };
      dispatch(voiceActions.updateTraceStep(done));
      if (result.fieldsModified?.length) trace.fieldsModified.push(...result.fieldsModified);
      if (result.stop || !result.ok) {
        // mark the rest as skipped
        for (let j = i + 1; j < commands.length; j++) {
          dispatch(voiceActions.updateTraceStep({ id: uid('step'), command: commands[j], tool: commands[j].action, status: 'skipped', message: 'Skipped', startedAt: Date.now(), finishedAt: Date.now() }));
        }
        break;
      }
    }

    const last = results[results.length - 1];
    const response = results.map((r) => r.message).filter(Boolean).join('\n');
    const voiceState = this.store.getState().voice;
    let status: 'ok' | 'error' | 'cancelled' | 'confirmation' = 'ok';
    if (this.cancelled) status = 'cancelled';
    else if (voiceState.pendingConfirmation) status = 'confirmation';
    else if (last && !last.ok) status = 'error';

    dispatch(voiceActions.setResponse(response || 'Done.'));
    dispatch(voiceActions.setCurrentAction(null));
    if (status === 'confirmation') dispatch(voiceActions.setStatus('confirmation_required'));
    else if (status === 'error') dispatch(voiceActions.setError(last?.message ?? 'Command failed'));
    else if (status === 'cancelled') dispatch(voiceActions.setStatus('cancelled'));
    else dispatch(voiceActions.setStatus('completed'));
    dispatch(voiceActions.finalizeTrace({ fieldsModified: trace.fieldsModified, error: status === 'error' ? last?.message : undefined }));
    dispatch(voiceActions.pushHistory({ id: uid('turn'), transcript, response: response || 'Done.', status, timestamp: Date.now() }));

    // After a completed command return to LISTENING while the mic is on (idle only when it is off).
    // Completing a transcription never turns the microphone off.
    if (status === 'ok') {
      setTimeout(() => {
        if (this.store.getState().voice.status === 'completed') dispatch(voiceActions.setStatus(this.micActive ? 'listening' : 'idle'));
      }, 2500);
    }
    this.busy = false;
    if (this.micActive) this.armSilenceTimer();
    return results;
  }

  /** Execute a structured command directly (palette / buttons) with the same tracing. */
  async executeCommand(command: AICommand): Promise<ExecutionResult> {
    const { dispatch } = this.store;
    dispatch(voiceActions.setCurrentAction(describeAction(command)));
    const result = await this.executor.execute(command);
    dispatch(voiceActions.setCurrentAction(null));
    if (result.requiresConfirmation) {
      dispatch(voiceActions.setPanelOpen(true));
      dispatch(voiceActions.setResponse(result.message));
      dispatch(voiceActions.setStatus('confirmation_required'));
    }
    return result;
  }

  private async generate(transcript: string, context: AIContext, trace: DebugTrace): Promise<AICommand[]> {
    const config = effectiveConfig();
    // Urdu / Roman Urdu is translated deterministically before the model sees it, so the small
    // local model only ever has to map English -> JSON. The original stays in the trace.
    const urdu = translateUrdu(transcript);
    const input = urdu.detected ? urdu.text : transcript;
    if (urdu.detected) trace.provider = `${this.llm.name} (${urdu.language === 'ur' ? 'Urdu' : 'Roman Urdu'} → English)`;
    // Fast path: when the deterministic interpreter understands every clause there is nothing for the
    // model to add, and skipping it saves the full system-prompt re-read Qwen 3.5 pays on every call.
    if (config.rulesFirst && !(this.llm instanceof MockLLMProvider)) {
      const rules = interpret(input, context);
      if (rules.length && rules.every((c) => c.action !== 'unknown')) {
        trace.provider = `rules (fast path)${urdu.detected ? ` (${urdu.language === 'ur' ? 'Urdu' : 'Roman Urdu'} → English)` : ''}`;
        trace.rawModelOutput = JSON.stringify(rules, null, 2);
        return coalesceMedicationCommands(rules);
      }
    }
    try {
      const { commands, raw } = await this.llm.generateCommands(input, context);
      trace.rawModelOutput = raw;
      return this.applySlotAnswerGuard(input, context, this.applyMedicationListGuard(input, context, coalesceMedicationCommands(commands)));
    } catch (e) {
      const recoverable = e instanceof ModelUnavailableError || e instanceof CommandParseError;
      if (recoverable && config.fallbackToRules && !(this.llm instanceof MockLLMProvider)) {
        const { commands, raw } = await this.fallback.generateCommands(input, context);
        trace.provider = `${this.llm.name} → fallback: rules (${(e as Error).message})`;
        trace.rawModelOutput = raw;
        return coalesceMedicationCommands(commands);
      }
      throw e;
    }
  }

  /**
   * Deterministic guard: while the assistant is waiting for a specific field ("What patient?"),
   * a plain value like "John Smith" answers that field — even if the model preferred another
   * interpretation (e.g. open_patient). Real commands (verbs, save/cancel) are left untouched.
   */
  private applySlotAnswerGuard(transcript: string, context: AIContext, commands: AICommand[]): AICommand[] {
    const slot = context.pendingSlot;
    if (!slot || looksLikeCommand(transcript)) return commands;
    const answersSlot = commands.every((c) => ['fill_field', 'fill_form', 'select_dropdown', 'set_checkbox', 'ask_user', 'respond'].includes(c.action));
    if (answersSlot) return commands;
    return [{ action: 'fill_field', formId: slot.formId, field: slot.field, value: transcript.trim().replace(/[.!?]+$/g, '') }];
  }

  /**
   * Deterministic guard: a small model asked for "panadol paracetamol 200 mg twice daily" may return only
   * Panadol (it treats the two as the same drug) or otherwise drop names. The rules parser re-reads the
   * transcript; when it heard more medications than the model returned, the missing ones are added and
   * the model's details are kept for the names it did return. Nothing the user said is lost.
   */
  private applyMedicationListGuard(transcript: string, context: AIContext, commands: AICommand[]): AICommand[] {
    const isMedicationCommand = (c: AICommand) =>
      c.action === 'add_medication' ||
      (c.action === 'add_record' && c.kind === 'medication') ||
      (c.action === 'fill_form' && (c.formId ?? context.openFormId) === 'medication');
    const listOf = (c: AICommand): FieldValues[] => {
      if (c.action === 'add_record') return c.records ?? (c.fields ? [c.fields] : []);
      if (c.action === 'add_medication') return c.medications ?? (c.fields ? [c.fields] : []);
      if (c.action === 'fill_form') return c.entries ?? [c.fields];
      return [];
    };

    const idx = commands.findIndex(isMedicationCommand);
    if (idx < 0) return commands;
    const spoken = interpret(transcript, context).find((c) => isMedicationCommand(c) && listOf(c).length > 1);
    if (!spoken) return commands;
    const heard = listOf(spoken);
    const cmd = commands[idx];
    const returned = listOf(cmd);
    if (returned.length >= heard.length) return commands;

    const key = (m: FieldValues) => String(m.medicationName ?? '').toLowerCase().split(/[\s/]/)[0];
    const merged = heard.map((h) => {
      const m = returned.find((r) => key(r) === key(h));
      return m ? { ...h, ...m } : h;
    });
    const next = [...commands];
    next[idx] =
      cmd.action === 'fill_form'
        ? { action: 'fill_form', formId: cmd.formId, fields: merged[0], entries: merged }
        : { action: 'add_record', kind: 'medication', fields: merged[0], records: merged };
    return next;
  }

  // ------------------------------------------------------------------ context

  buildContext(): AIContext {
    const state = this.store.getState();
    const page = state.navigation.currentPageId ? PageRegistry.get(state.navigation.currentPageId) : undefined;
    const patient = state.patients.currentPatientId ? patientSelectors.selectById(state, state.patients.currentPatientId) : undefined;
    const openForm = FormRegistry.active();
    return {
      currentPageId: page?.id ?? null,
      currentPageTitle: page?.title ?? null,
      currentPageNumber: page?.number ?? null,
      currentPatientId: state.patients.currentPatientId,
      currentPatientName: patient?.fullName ?? null,
      currentTab: page?.tab ?? (page?.parentId ? (state.navigation.activeTabs[page.parentId] ?? null) : null),
      openFormId: openForm?.formId ?? state.navigation.openFormId,
      openFormFields: openForm ? Object.keys(openForm.getValues()) : [],
      pendingSlot: state.voice.pendingSlot ? { formId: state.voice.pendingSlot.formId, field: state.voice.pendingSlot.field, label: state.voice.pendingSlot.label } : null,
      awaitingConfirmation: !!state.voice.pendingConfirmation,
      pendingConfirmationKind: state.voice.pendingConfirmation?.kind ?? null,
      recentTranscripts: state.voice.history.slice(0, 3).map((h) => h.transcript),
    };
  }

  private buildDeps() {
    const { dispatch, getState } = this.store;
    const currentPatient = () => {
      const s = getState();
      return s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined;
    };
    return {
      getState: () => {
        const s = getState();
        const page = s.navigation.currentPageId ? PageRegistry.get(s.navigation.currentPageId) : undefined;
        return {
          currentPageId: s.navigation.currentPageId,
          currentTab: page?.tab ?? null,
          currentPatientId: s.patients.currentPatientId,
          currentPatientName: currentPatient()?.fullName ?? null,
          openFormId: FormRegistry.active()?.formId ?? s.navigation.openFormId,
          pendingConfirmation: s.voice.pendingConfirmation,
          pendingSlot: s.voice.pendingSlot,
          sidebarCollapsed: s.ui.sidebarCollapsed,
          dashboardSummaryOpen: s.ui.dashboardSummaryOpen,
        };
      },
      navigate: (path: string) => NavigationRegistry.navigate(path),
      back: () => NavigationRegistry.back(),
      setCurrentPatient: (id: string | null) => dispatch(setCurrentPatient(id)),
      setActiveTab: (pageId: string, tab: string) => dispatch(navigationActions.setActiveTab({ pageId, tab })),
      setOpenForm: (formId: string | null) => dispatch(navigationActions.setOpenForm(formId)),
      setPendingConfirmation: (p: PendingConfirmation | null) => dispatch(voiceActions.setPendingConfirmation(p)),
      setPendingSlot: (s: PendingSlot | null) => dispatch(voiceActions.setPendingSlot(s)),
      setPatientSearch: (q: string) => dispatch(setLastSearch(q)),
      toggleSidebar: () => dispatch(uiActions.toggleSidebar()),
      setDashboardSummary: (open: boolean) => dispatch(uiActions.setDashboardSummaryOpen(open)),
      resolvePatientByName: (name: string) => patientService.resolveByName(name),
      getPatient: () => currentPatient(),
      getRecords: (kind: AIRecordKind) => patientRecords(getState(), kind),
      deleteRecord: async (kind: AIRecordKind, id: string) => {
        if (kind === 'patient') await dispatch(deletePatient(id)).unwrap();
        else await dispatch(recordSlices[kind].remove(id)).unwrap();
      },
      speak: (text: string) => speak(text),
      stopListening: () => this.stopListening(),
      startListening: () => this.startListening(),
      openHelp: () => dispatch(voiceActions.setHelpOpen(true)),
      // On the patient list the search box is mirrored in the URL (?q=), including what was typed by hand.
      getPatientSearch: () => {
        const s = getState();
        if (s.navigation.currentPageId === 'patients' && typeof window !== 'undefined') return new URLSearchParams(window.location.search).get('q') ?? '';
        return s.patients.lastSearch;
      },
      // The same match the patient table applies to its search box, in the same order.
      findPatients: (query: string) => {
        const q = query.trim().toLowerCase();
        const all = patientSelectors.selectAll(getState());
        if (!q) return all;
        return all.filter((p) => [p.fullName, p.mrn, p.phone, p.email, p.primaryProviderName].some((v) => String(v ?? '').toLowerCase().includes(q)));
      },
      describePatient: () => {
        const s = getState();
        const patient = currentPatient();
        if (!patient) return 'No patient is selected.';
        return buildPatientNarrative({
          patient,
          medications: patientRecords(s, 'medication') as never,
          diagnoses: patientRecords(s, 'diagnosis') as never,
          tasks: patientRecords(s, 'task') as never,
          recalls: patientRecords(s, 'recall') as never,
          appointments: patientRecords(s, 'appointment') as never,
        }).text;
      },
    };
  }
}

function describeAction(command: AICommand): string {
  switch (command.action) {
    case 'navigate': {
      const page = PageRegistry.resolve(command.target);
      return page ? `Navigating to ${page.title}…` : 'Navigating…';
    }
    case 'open_tab':
      return `Opening the ${command.tab} tab…`;
    case 'search_patient':
      return `Searching for ${command.query}…`;
    case 'select_patient':
    case 'open_patient':
      return `Selecting ${command.name ?? 'patient'}…`;
    case 'add_record':
      return `Opening the ${command.kind} form…`;
    case 'update_record':
      return `Opening the ${command.kind} for editing…`;
    case 'delete_record':
      return `Checking which ${command.kind} to delete…`;
    case 'search_records':
      return `Searching ${command.kind}s…`;
    case 'read_records':
      return `Reading the ${command.kind} list…`;
    case 'summarize_patient':
      return 'Building the patient summary…';
    case 'open_dashboard_summary':
      return 'Opening the dashboard summary…';
    case 'close_dashboard_summary':
      return 'Closing the dashboard summary…';
    case 'open_form':
      return 'Opening form…';
    case 'fill_form':
    case 'fill_field':
    case 'select_dropdown':
    case 'set_checkbox':
      return 'Filling form…';
    case 'add_medication':
      return 'Filling medication form…';
    case 'create_appointment':
      return 'Preparing appointment…';
    case 'register_patient':
      return 'Filling patient form…';
    case 'submit_form':
      return 'Requesting confirmation…';
    case 'confirm':
      return 'Applying…';
    case 'cancel':
      return 'Cancelling…';
    case 'scroll':
      return 'Scrolling…';
    case 'inbox_view':
      return 'Switching Inbox category…';
    case 'inbox_search':
      return command.query ? `Searching the Inbox for “${command.query}”…` : 'Filtering the Inbox…';
    case 'inbox_clear_search':
      return 'Clearing the search…';
    case 'inbox_open':
      return 'Opening the record…';
    case 'inbox_close':
      return 'Closing the record…';
    case 'inbox_file':
      return command.file ? 'Filing…' : 'Unfiling…';
    case 'select_patient_at':
      return 'Selecting the patient…';
    case 'stop_listening':
      return 'Turning the microphone off…';
    default:
      return 'Working…';
  }
}

function friendlyError(e: unknown): string {
  if (e instanceof ModelUnavailableError) return `The local model is not reachable (${e.message}). Start Ollama / the python bridge, or switch to mock mode in the Voice Console.`;
  if (e instanceof CommandParseError) return `The model returned an invalid command (${e.message}). Please rephrase or try again.`;
  return (e as Error)?.message || 'Something went wrong while processing your command.';
}

let instance: VoiceController | null = null;
export function initVoiceController(store: AppStore) {
  if (!instance) instance = new VoiceController(store);
  return instance;
}
export function getVoiceController(): VoiceController {
  if (!instance) throw new Error('VoiceController not initialized');
  return instance;
}

/** Redux (Immer) freezes stored objects — always hand it a copy so the live trace stays mutable. */
function snapshotTrace(trace: DebugTrace): DebugTrace {
  return { ...trace, commands: [...trace.commands], steps: [...trace.steps], fieldsModified: [...trace.fieldsModified], context: trace.context ? { ...trace.context } : null };
}
