import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/slices/authSlice';
import patientReducer from '@/store/slices/patientSlice';
import providerReducer from '@/store/slices/providerSlice';
import { appointmentsSlice, diagnosesSlice, medicationsSlice, recallsSlice, tasksSlice } from '@/store/slices/recordSlices';
import uiReducer from '@/store/slices/uiSlice';
import voiceReducer from '@/store/slices/voiceSlice';
import navigationReducer, { navigationActions } from '@/store/slices/navigationSlice';
import { VoiceController, isClinicalParagraph } from '../voiceController';
import { MockLLMProvider } from '../providers/llmProviders';
import type { ListeningCallbacks, ListeningSession, MicrophoneRecognizer } from '../providers/sttProviders';
import { NavigationRegistry } from '@/registry/navigationRegistry';

/** A scripted microphone: the test decides when segments, engine restarts and errors happen. */
class FakeRecognizer implements MicrophoneRecognizer {
  readonly providerName = 'fake';
  sessions: Array<{ callbacks: ListeningCallbacks; stopped: boolean; cancelled: boolean }> = [];
  isSupported() {
    return true;
  }
  start(callbacks: ListeningCallbacks): ListeningSession {
    const entry = { callbacks, stopped: false, cancelled: false };
    this.sessions.push(entry);
    return {
      stop: () => {
        entry.stopped = true;
        callbacks.onEnd?.();
      },
      cancel: () => {
        entry.cancelled = true;
        callbacks.onEnd?.();
      },
    };
  }
  get current() {
    return this.sessions[this.sessions.length - 1];
  }
}

const makeStore = () =>
  configureStore({
    reducer: { auth: authReducer, patients: patientReducer, appointments: appointmentsSlice.reducer, providers: providerReducer, medications: medicationsSlice.reducer,
      diagnoses: diagnosesSlice.reducer,
      tasks: tasksSlice.reducer,
      recalls: recallsSlice.reducer, ui: uiReducer, voice: voiceReducer, navigation: navigationReducer },
    middleware: (g) => g({ serializableCheck: false }),
  });

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('microphone lifecycle — stays on until the user turns it off', () => {
  let store: ReturnType<typeof makeStore>;
  let mic: FakeRecognizer;
  let controller: VoiceController;

  beforeEach(() => {
    store = makeStore();
    mic = new FakeRecognizer();
    NavigationRegistry.install((to) => NavigationRegistry.setPathname(String(to)));
    controller = new VoiceController(store as never, { stt: mic, llm: new MockLLMProvider() });
  });

  it('turns on with startListening and reports micActive', () => {
    controller.startListening();
    expect(controller.isMicActive).toBe(true);
    expect(store.getState().voice.micActive).toBe(true);
    expect(store.getState().voice.status).toBe('listening');
    expect(mic.sessions).toHaveLength(1);
  });

  it('does NOT stop after a transcription segment is processed; returns to listening', async () => {
    controller.startListening();
    mic.current.callbacks.onFinal('go to patient search');
    await flush(1000); // mock LLM latency + navigation/execution waits
    expect(controller.isMicActive).toBe(true);
    expect(mic.current.stopped).toBe(false);
    expect(mic.current.cancelled).toBe(false);
    expect(store.getState().voice.history[0].transcript).toBe('go to patient search');
    // status goes completed -> listening (not idle) because the mic is still on
    await flush(2600);
    expect(store.getState().voice.status).toBe('listening');
    expect(store.getState().voice.micActive).toBe(true);
  });

  it('keeps capturing consecutive segments across pauses and queues them in order', async () => {
    controller.startListening();
    mic.current.callbacks.onFinal('go to patient search');
    mic.current.callbacks.onFinal('go to page 30');
    await flush(900);
    const transcripts = store.getState().voice.history.map((h) => h.transcript).reverse();
    expect(transcripts).toEqual(['go to patient search', 'go to page 30']);
    expect(controller.isMicActive).toBe(true);
    expect(mic.sessions).toHaveLength(1); // same session, never re-armed by the user
  });

  it('re-opens the session automatically if the engine ends on its own while the mic is on', async () => {
    controller.startListening();
    mic.current.callbacks.onEnd?.(); // engine-side end (e.g. silence timeout) — not a user action
    await flush(400);
    expect(controller.isMicActive).toBe(true);
    expect(mic.sessions).toHaveLength(2);
  });

  it('stops ONLY on explicit Mic Off', () => {
    controller.startListening();
    controller.stopListening();
    expect(controller.isMicActive).toBe(false);
    expect(store.getState().voice.micActive).toBe(false);
    expect(mic.current.stopped).toBe(true);
    expect(store.getState().voice.status).toBe('idle');
  });

  it('audio flushed after Mic Off does not leave the status on "Transcribing…"', () => {
    controller.startListening();
    const { callbacks } = mic.current;
    controller.stopListening(); // e.g. the user switched to the keyboard
    callbacks.onInterim?.('Hearing you…');
    callbacks.onTranscribing?.(); // the HTTP recorder transcribes its last segment on stop
    callbacks.onFinal('go to');
    expect(store.getState().voice.status).toBe('idle');
    expect(store.getState().voice.interimTranscript).toBe('');
  });

  it('stops on explicit Cancel', () => {
    controller.startListening();
    controller.cancel();
    expect(controller.isMicActive).toBe(false);
    expect(mic.current.cancelled).toBe(true);
    expect(store.getState().voice.status).toBe('cancelled');
  });

  it('does not re-open after the user stopped it, even if the engine fires onEnd later', async () => {
    controller.startListening();
    controller.stopListening();
    mic.current.callbacks.onEnd?.();
    await flush(400);
    expect(mic.sessions).toHaveLength(1);
    expect(controller.isMicActive).toBe(false);
  });

  it('a non-fatal STT error keeps the mic on; a fatal one (permission denied) turns it off', async () => {
    controller.startListening();
    mic.current.callbacks.onError(new Error('STT service responded 503'), false);
    expect(controller.isMicActive).toBe(true);
    expect(store.getState().voice.error).toContain('503');
    mic.current.callbacks.onError(new Error('Microphone access was denied'), true);
    expect(controller.isMicActive).toBe(false);
    expect(store.getState().voice.micActive).toBe(false);
  });

  it('merges a short mid-sentence fragment with the next segment instead of executing it', async () => {
    controller.startListening();
    mic.current.callbacks.onFinal('I am');            // pause mid-sentence
    await flush(300);
    expect(store.getState().voice.history).toHaveLength(0);      // held, not executed
    expect(store.getState().voice.interimTranscript).toBe('I am …');
    mic.current.callbacks.onFinal('going to patient search');
    await flush(1200);
    expect(store.getState().voice.history[0].transcript).toBe('I am going to patient search');
    expect(store.getState().voice.history).toHaveLength(1);
  });

  it('processes a held fragment on its own after the hold period', async () => {
    controller.startListening();
    mic.current.callbacks.onFinal('hello');
    await flush(2600 + 900);
    expect(store.getState().voice.history[0]?.transcript).toBe('hello');
  });

  it('short answers to a pending question are processed immediately', async () => {
    controller.startListening();
    store.dispatch({ type: 'voice/setPendingSlot', payload: { formId: 'medication', field: 'dosage', label: 'Dosage', question: 'What dosage?' } });
    mic.current.callbacks.onFinal('500 mg');
    await flush(300);
    // not held as a fragment: processing started right away
    expect(store.getState().voice.interimTranscript).not.toBe('500 mg …');
    expect(store.getState().voice.transcript).toBe('500 mg');
  });

  it('toggleListening flips the user switch', () => {
    controller.toggleListening();
    expect(controller.isMicActive).toBe(true);
    controller.toggleListening();
    expect(controller.isMicActive).toBe(false);
  });
});

describe('clinical paragraph — a pause ends it, mic off, AI Summary extracts it', () => {
  const PARAGRAPH =
    'Start the patient on metformin, Panadol, paracetamol 500 mg twice daily for 30 days, add hypertension as a diagnosis, create a task for blood pressure monitoring, recall the patient after two weeks, and schedule a follow-up appointment next Tuesday at 3 pm.';
  const original = VoiceController.SILENCE_MS;
  let store: ReturnType<typeof makeStore>;
  let mic: FakeRecognizer;
  let controller: VoiceController;

  beforeEach(() => {
    VoiceController.SILENCE_MS = 300;
    store = makeStore();
    mic = new FakeRecognizer();
    NavigationRegistry.install((to) => NavigationRegistry.setPathname(String(to)));
    controller = new VoiceController(store as never, { stt: mic, llm: new MockLLMProvider() });
  });
  afterEach(() => {
    VoiceController.SILENCE_MS = original;
  });

  it('recognises the dictated note but not ordinary commands', () => {
    expect(isClinicalParagraph(PARAGRAPH)).toBe(true);
    expect(isClinicalParagraph('add metformin 500 mg twice daily')).toBe(false);
    expect(isClinicalParagraph('go to patient search')).toBe(false);
  });

  it('collects the note, then after the pause turns the mic off and hands it to the AI Summary tab', async () => {
    controller.startListening();
    mic.current.callbacks.onFinal(PARAGRAPH);
    await flush(150);
    expect(controller.isCapturingParagraph).toBe(true);
    expect(controller.isMicActive).toBe(true);
    expect(store.getState().voice.history).toHaveLength(0); // not executed as commands
    await flush(300);
    expect(controller.isMicActive).toBe(false);
    expect(mic.current.stopped).toBe(true);
    expect(store.getState().voice.summaryHandoff?.text).toBe(PARAGRAPH);
    expect(NavigationRegistry.pathname()).toBe('/summary/ai-summary');
  });

  it('keeps listening while the user is still talking and joins every segment', async () => {
    controller.startListening();
    mic.current.callbacks.onFinal('add hypertension as a diagnosis, create a task for blood pressure monitoring, recall the patient after two weeks');
    await flush(200);
    mic.current.callbacks.onInterim?.('and schedule');
    await flush(200);
    mic.current.callbacks.onFinal('and schedule a follow-up appointment next Tuesday at 3 pm');
    await flush(200);
    expect(controller.isMicActive).toBe(true);
    await flush(200);
    expect(controller.isMicActive).toBe(false);
    expect(store.getState().voice.summaryHandoff?.text).toBe(
      'add hypertension as a diagnosis, create a task for blood pressure monitoring, recall the patient after two weeks and schedule a follow-up appointment next Tuesday at 3 pm',
    );
  });

  it('typed into the assistant: goes straight to the AI Summary instead of opening the medication form', async () => {
    const results = await controller.handleTranscript(`“${PARAGRAPH}”`);
    expect(results).toEqual([]);
    expect(store.getState().voice.commands).toEqual([]);
    expect(store.getState().navigation.openFormId).toBeNull();
    expect(store.getState().voice.summaryHandoff?.text).toBe(PARAGRAPH);
    expect(NavigationRegistry.pathname()).toBe('/summary/ai-summary');
  });

  it('turns the mic off after a pause with no speech', async () => {
    controller.startListening();
    await flush(150);
    expect(controller.isMicActive).toBe(true);
    await flush(250);
    expect(controller.isMicActive).toBe(false);
    expect(mic.current.stopped).toBe(true);
    expect(store.getState().voice.micActive).toBe(false);
  });

  it('keeps the mic on through a pause during patient work — only "mic off" ends it', async () => {
    store.dispatch(navigationActions.setCurrentPage({ pageId: 'patients', path: '/patients', title: 'Patient' }));
    controller.startListening();
    await flush(700);
    expect(controller.isMicActive).toBe(true);
    await controller.handleTranscript('mic off');
    expect(controller.isMicActive).toBe(false);
  });

  it('speech restarts the pause countdown', async () => {
    controller.startListening();
    await flush(200);
    mic.current.callbacks.onInterim?.('go to');
    await flush(200);
    expect(controller.isMicActive).toBe(true); // 400 ms since start, but only 200 since speech
    await flush(200);
    expect(controller.isMicActive).toBe(false);
  });

  it('Cancel throws the note away', async () => {
    controller.startListening();
    mic.current.callbacks.onFinal(PARAGRAPH);
    controller.cancel();
    await flush(400);
    expect(store.getState().voice.summaryHandoff).toBeNull();
  });
});

describe('medication list guard — a model that drops a spoken drug is corrected by the rules', () => {
  it('re-adds Paracetamol when the model returned only Panadol, keeping the model details', async () => {
    const store = makeStore();
    NavigationRegistry.install((to) => NavigationRegistry.setPathname(String(to)));
    // Behaves like qwen3.5:4b on "add panadol paracetamol 200mg twice daily": one medication, Paracetamol gone.
    const forgetful = {
      name: 'fake-llm',
      async generateCommands() {
        return { commands: [{ action: 'add_medication' as const, fields: { medicationName: 'Panadol', dosage: '200 mg', frequency: 'Twice daily', duration: '10 days' } }], raw: '' };
      },
    };
    const controller = new VoiceController(store as never, { stt: new FakeRecognizer(), llm: forgetful });
    await controller.handleTranscript('Add panadol paracetamol 200mg twice daily for 10 days');
    await flush(50);
    const cmd = store.getState().voice.commands[0] as { action: string; kind?: string; records?: Array<Record<string, unknown>> };
    expect(cmd.action).toBe('add_record');
    expect(cmd.kind).toBe('medication');
    expect(cmd.records?.map((m) => m.medicationName)).toEqual(['Panadol', 'Paracetamol']);
    expect(cmd.records?.[0]).toMatchObject({ dosage: '200 mg', frequency: 'Twice daily', duration: '10 days' });
    expect(cmd.records?.[1]).toMatchObject({ dosage: '200 mg', frequency: 'Twice daily', duration: '10 days' });
  });
});
