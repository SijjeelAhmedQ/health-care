/**
 * Voice controller — orchestrates the pipeline
 *   microphone -> STT -> transcript -> LLM (Qwen / rules) -> validated commands
 *   -> CommandExecutor -> Redux / router / forms
 * and keeps voiceSlice in sync so the UI can render every state.
 */
import type { AppStore } from '@/store';
import { voiceActions, type PendingSlot } from '@/store/slices/voiceSlice';
import { navigationActions } from '@/store/slices/navigationSlice';
import { uiActions } from '@/store/slices/uiSlice';
import { setCurrentPatient, setLastSearch, patientSelectors } from '@/store/slices/patientSlice';
import { setCurrentProvider } from '@/store/slices/providerSlice';
import type { AICommand, AIContext, DebugTrace, ExecutionStep, LLMProvider, PendingConfirmation } from '@/types/ai';
import { patientService, providerService } from '@/services/api';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import { FormRegistry } from '@/registry/formRegistry';
import { CommandExecutor, type ExecutionResult } from './commandExecutor';
import { CommandParseError } from './commandParser';
import { effectiveConfig } from './config';
import { createLLMProvider, MockLLMProvider, ModelUnavailableError } from './providers/llmProviders';
import { createSTTProvider, type ListeningSession, type MicrophoneRecognizer } from './providers/sttProviders';
import { normalizeTranscript } from './ruleBasedInterpreter';

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

  constructor(private readonly store: AppStore) {
    const config = effectiveConfig();
    this.llm = createLLMProvider(config);
    this.stt = createSTTProvider(config);
    this.executor = new CommandExecutor(this.buildDeps());
    this.publishProviders();
  }

  /** Re-create providers after the dev console changed the configuration. */
  reconfigure() {
    const config = effectiveConfig();
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

  startListening() {
    if (this.session) return;
    const { dispatch } = this.store;
    this.cancelled = false;
    dispatch(voiceActions.setPanelOpen(true));
    dispatch(voiceActions.setStatus('listening'));
    dispatch(voiceActions.setResponse(null));
    this.session = this.stt.start({
      onInterim: (text) => dispatch(voiceActions.setInterimTranscript(text)),
      onTranscribing: () => dispatch(voiceActions.setStatus('transcribing')),
      onFinal: (text) => {
        this.session = null;
        void this.handleTranscript(text);
      },
      onError: (error) => {
        this.session = null;
        if (this.cancelled) return;
        dispatch(voiceActions.setError(error.message));
        dispatch(voiceActions.pushHistory({ id: uid('turn'), transcript: '', response: error.message, status: 'error', timestamp: Date.now() }));
      },
    });
  }

  stopListening() {
    this.session?.stop();
  }

  cancel() {
    this.cancelled = true;
    this.session?.cancel();
    this.session = null;
    const { dispatch } = this.store;
    dispatch(voiceActions.setStatus('cancelled'));
    dispatch(voiceActions.setCurrentAction(null));
    dispatch(voiceActions.setResponse('Cancelled.'));
    setTimeout(() => {
      if (this.store.getState().voice.status === 'cancelled') dispatch(voiceActions.setStatus('idle'));
    }, 1200);
  }

  toggleListening() {
    if (this.session) this.stopListening();
    else this.startListening();
  }

  // ---------------------------------------------------------------- pipeline

  /** Entry point for both real transcripts and the mock console. */
  async handleTranscript(rawTranscript: string): Promise<ExecutionResult[]> {
    const { dispatch } = this.store;
    if (this.busy) {
      dispatch(voiceActions.setResponse('One moment — still working on the previous command.'));
      return [];
    }
    this.busy = true;
    this.cancelled = false;
    const transcript = rawTranscript.trim();
    const normalized = normalizeTranscript(transcript);
    const context = this.buildContext();

    const trace: DebugTrace = {
      rawTranscript: transcript,
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
      const result = await this.executor.execute(command);
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

    // Auto-return to idle after a completed command so the FAB is ready again.
    if (status === 'ok') {
      setTimeout(() => {
        if (this.store.getState().voice.status === 'completed') dispatch(voiceActions.setStatus('idle'));
      }, 2500);
    }
    this.busy = false;
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
    try {
      const { commands, raw } = await this.llm.generateCommands(transcript, context);
      trace.rawModelOutput = raw;
      return commands;
    } catch (e) {
      const recoverable = e instanceof ModelUnavailableError || e instanceof CommandParseError;
      if (recoverable && config.fallbackToRules && !(this.llm instanceof MockLLMProvider)) {
        const { commands, raw } = await this.fallback.generateCommands(transcript, context);
        trace.provider = `${this.llm.name} → fallback: rules (${(e as Error).message})`;
        trace.rawModelOutput = raw;
        return commands;
      }
      throw e;
    }
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
      currentProviderId: state.providers.currentProviderId,
      openFormId: openForm?.formId ?? state.navigation.openFormId,
      openFormFields: openForm ? Object.keys(openForm.getValues()) : [],
      pendingSlot: state.voice.pendingSlot ? { formId: state.voice.pendingSlot.formId, field: state.voice.pendingSlot.field, label: state.voice.pendingSlot.label } : null,
      awaitingConfirmation: !!state.voice.pendingConfirmation,
      recentTranscripts: state.voice.history.slice(0, 3).map((h) => h.transcript),
    };
  }

  private buildDeps() {
    const { dispatch, getState } = this.store;
    return {
      getState: () => {
        const s = getState();
        const patient = s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined;
        return {
          currentPageId: s.navigation.currentPageId,
          currentPatientId: s.patients.currentPatientId,
          currentPatientName: patient?.fullName ?? null,
          currentProviderId: s.providers.currentProviderId,
          openFormId: FormRegistry.active()?.formId ?? s.navigation.openFormId,
          pendingConfirmation: s.voice.pendingConfirmation,
          pendingSlot: s.voice.pendingSlot,
          sidebarCollapsed: s.ui.sidebarCollapsed,
        };
      },
      navigate: (path: string) => NavigationRegistry.navigate(path),
      back: () => NavigationRegistry.back(),
      setCurrentPatient: (id: string | null) => dispatch(setCurrentPatient(id)),
      setCurrentProvider: (id: string | null) => dispatch(setCurrentProvider(id)),
      setActiveTab: (pageId: string, tab: string) => dispatch(navigationActions.setActiveTab({ pageId, tab })),
      setOpenForm: (formId: string | null) => dispatch(navigationActions.setOpenForm(formId)),
      setPendingConfirmation: (p: PendingConfirmation | null) => dispatch(voiceActions.setPendingConfirmation(p)),
      setPendingSlot: (s: PendingSlot | null) => dispatch(voiceActions.setPendingSlot(s)),
      setPatientSearch: (q: string) => dispatch(setLastSearch(q)),
      toggleSidebar: () => dispatch(uiActions.toggleSidebar()),
      resolvePatientByName: (name: string) => patientService.resolveByName(name),
      resolveProviderByName: (name: string) => providerService.resolveByName(name),
    };
  }
}

function describeAction(command: AICommand): string {
  switch (command.action) {
    case 'navigate': {
      const page = PageRegistry.resolve(command.target);
      return page ? `Navigating to ${page.title}…` : 'Navigating…';
    }
    case 'search_patient':
      return `Searching for ${command.query}…`;
    case 'open_patient':
      return `Opening ${command.name ?? 'patient'}…`;
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
      return 'Filling registration form…';
    case 'submit_form':
      return 'Requesting confirmation…';
    case 'confirm':
      return 'Saving…';
    case 'cancel':
      return 'Cancelling…';
    case 'scroll':
      return 'Scrolling…';
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
