import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/slices/authSlice';
import patientReducer from '@/store/slices/patientSlice';
import providerReducer from '@/store/slices/providerSlice';
import inboxReducer from '@/store/slices/inboxSlice';
import { appointmentsSlice, diagnosesSlice, medicationsSlice, recallsSlice, tasksSlice } from '@/store/slices/recordSlices';
import uiReducer from '@/store/slices/uiSlice';
import voiceReducer from '@/store/slices/voiceSlice';
import navigationReducer, { navigationActions } from '@/store/slices/navigationSlice';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { VoiceController } from '../voiceController';
import { FakeMic, ScriptedLLM, call } from './fakes';

const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      patients: patientReducer,
      providers: providerReducer,
      inbox: inboxReducer,
      appointments: appointmentsSlice.reducer,
      medications: medicationsSlice.reducer,
      diagnoses: diagnosesSlice.reducer,
      tasks: tasksSlice.reducer,
      recalls: recallsSlice.reducer,
      ui: uiReducer,
      voice: voiceReducer,
      navigation: navigationReducer,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

// The loudspeaker: whether the assistant is talking right now.
const speaker = vi.hoisted(() => ({ speaking: false }));
vi.mock('../speech', async (original) => ({ ...(await original<typeof import('../speech')>()), isAssistantSpeaking: () => speaker.speaking }));

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// These tests hand each utterance over at once; the turn grace has its own tests below.
VoiceController.TURN_GRACE_MS = 0;

describe('microphone lifecycle — stays on until the user turns it off', () => {
  let store: ReturnType<typeof makeStore>;
  let mic: FakeMic;
  let llm: ScriptedLLM;
  let controller: VoiceController;

  beforeEach(() => {
    store = makeStore();
    mic = new FakeMic();
    llm = new ScriptedLLM();
    NavigationRegistry.install((to) => NavigationRegistry.setPathname(String(to)));
    controller = new VoiceController(store as never, { stt: mic, llm });
  });

  it('turns on with startListening and reports micActive', () => {
    controller.startListening();
    expect(controller.isMicActive).toBe(true);
    expect(store.getState().voice.micActive).toBe(true);
    expect(store.getState().voice.status).toBe('listening');
    expect(mic.sessions).toHaveLength(1);
  });

  it('shows the live partial transcript while the user speaks', () => {
    controller.startListening();
    mic.current.callbacks.onInterim?.('add metformin five');
    expect(store.getState().voice.interimTranscript).toBe('add metformin five');
  });

  it("ignores its own spoken reply picked up by the microphone, then hears the user again", async () => {
    llm.then({ content: 'Opened.' });
    controller.startListening();
    speaker.speaking = true;
    mic.say('Here is the dashboard summary.');
    speaker.speaking = false;
    await flush(50);
    expect(llm.requests).toHaveLength(0);
    expect(store.getState().voice.interimTranscript).toBe('');
    mic.say('open the inbox');
    await flush(50);
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].at(-1)?.content).toMatch(/SAID: open the inbox$/);
  });

  it('hands each finished utterance to the model and keeps listening afterwards', async () => {
    llm.then({ content: 'Hello — how can I help?' });
    controller.startListening();
    mic.say('hello there');
    await flush(50);
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].at(-1)?.content).toMatch(/SAID: hello there$/);
    expect(store.getState().voice.history[0]).toMatchObject({ transcript: 'hello there', response: 'Hello — how can I help?' });
    expect(controller.isMicActive).toBe(true);
    expect(mic.current.stopped).toBe(false);
    await flush(2600);
    expect(store.getState().voice.status).toBe('listening');
  });

  it('queues utterances and handles them in order', async () => {
    llm.then({ content: 'one' }, { content: 'two' });
    controller.startListening();
    mic.say('first');
    mic.say('second');
    await flush(80);
    expect(store.getState().voice.history.map((h) => h.transcript).reverse()).toEqual(['first', 'second']);
    expect(mic.sessions).toHaveLength(1); // same session, never re-armed by the user
  });

  it('re-opens the session if it ends on its own while the mic is on; not after Mic Off', async () => {
    controller.startListening();
    mic.current.callbacks.onEnd?.();
    await flush(400);
    expect(mic.sessions).toHaveLength(2);
    controller.stopListening();
    mic.current.callbacks.onEnd?.();
    await flush(400);
    expect(mic.sessions).toHaveLength(2);
    expect(controller.isMicActive).toBe(false);
  });

  it('a stopped session that ends late cannot replace or duplicate the one running now', async () => {
    llm.then({ content: 'Opened.' });
    controller.startListening();
    const old = mic.current;
    controller.stopListening(); // Mic Off (or the silence timeout): the bridge is still flushing
    controller.startListening(); // Speak again before the old session has finished
    const live = mic.current;
    // The old session now finishes: its last final and its end arrive late.
    old.callbacks.onFinal('ghost words');
    old.callbacks.onEnd?.();
    await flush(400);
    expect(mic.sessions).toHaveLength(2); // no third session opened behind the user's back
    expect(live.cancelled || live.stopped).toBe(false);
    live.callbacks.onFinal('open the inbox');
    await flush(1500);
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].at(-1)?.content).toMatch(/SAID: open the inbox$/);
    controller.stopListening();
    expect(live.stopped).toBe(true); // the running session is still the one Mic Off reaches
  });

  it('a final with the second recogniser\'s version reaches the model as ALSO HEARD', async () => {
    llm.then({ content: 'Selected.' });
    controller.startListening();
    mic.current.callbacks.onSpeechStart?.();
    mic.current.callbacks.onFinal('select patient pharma volt', 'Select patient Fatima Malik.');
    await flush(1500);
    expect(llm.requests[0].at(-1)?.content).toMatch(/SAID: select patient pharma volt\nALSO HEARD: Select patient Fatima Malik\.$/);
  });

  it('Mic Off stops the session; Cancel aborts it', () => {
    controller.startListening();
    controller.stopListening();
    expect(mic.current.stopped).toBe(true);
    expect(store.getState().voice.status).toBe('idle');
    controller.startListening();
    controller.cancel();
    expect(mic.current.cancelled).toBe(true);
    expect(store.getState().voice.status).toBe('cancelled');
  });

  it('a non-fatal STT error keeps the mic on; a fatal one turns it off', () => {
    controller.startListening();
    mic.current.callbacks.onError(new Error('Connection to Omi Med STT dropped — reconnecting…'), false);
    expect(controller.isMicActive).toBe(true);
    mic.current.callbacks.onError(new Error('Microphone permission was denied.'), true);
    expect(controller.isMicActive).toBe(false);
    expect(store.getState().voice.micActive).toBe(false);
  });

  it('the model can hold an unfinished fragment; it is joined with what the user says next', async () => {
    llm.then({ calls: [call('wait_for_more_speech')] }, { content: 'Opening the patient list.' });
    controller.startListening();
    mic.say('I am going to');
    await flush(50);
    expect(store.getState().voice.history).toHaveLength(0); // nothing done, nothing recorded
    expect(store.getState().voice.interimTranscript).toBe('I am going to …');
    mic.say('open the patient list');
    await flush(50);
    expect(llm.requests[1].at(-1)?.content).toMatch(/SAID: I am going to open the patient list$/);
    expect(store.getState().voice.history[0].transcript).toBe('I am going to open the patient list');
  });

  it('the model turning the mic off ends listening', async () => {
    llm.calls([call('stop_listening')], 'Microphone off.');
    controller.startListening();
    mic.say('stop listening');
    await flush(80);
    expect(controller.isMicActive).toBe(false);
    expect(mic.current.stopped).toBe(true);
  });

  it('a model that cannot be reached is reported, and the mic stays on', async () => {
    const failing = new ScriptedLLM();
    failing.chat = async () => {
      throw new Error('Could not reach the model');
    };
    const c = new VoiceController(store as never, { stt: mic, llm: failing });
    c.startListening();
    mic.say('open the dashboard');
    await flush(50);
    expect(store.getState().voice.error).toMatch(/Could not reach the model/);
    expect(c.isMicActive).toBe(true);
  });
});

describe('model warm-up status', () => {
  const make = (loaded: boolean) => {
    const store = makeStore();
    const llm = new ScriptedLLM();
    Object.assign(llm, { isLoaded: async () => loaded, warmUp: async () => null });
    const controller = new VoiceController(store as never, { stt: new FakeMic(), llm });
    return { store, controller };
  };

  it('a model already in memory (a page refresh) only warms up — no loading notice', async () => {
    const { store, controller } = make(true);
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().voice.model.status));
    await controller.warmUp();
    expect(seen).not.toContain('loading');
    expect(seen).toContain('warming');
    expect(store.getState().voice.model.status).toBe('ready');
  });

  it('a model that is not in memory is reported as loading', async () => {
    const { store, controller } = make(false);
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().voice.model.status));
    await controller.warmUp();
    expect(seen).toContain('loading');
    expect(store.getState().voice.model.status).toBe('ready');
  });
});

describe('dictated clinical note — the model decides, a pause ends it, the AI Summary extracts it', () => {
  const original = VoiceController.SILENCE_MS;
  let store: ReturnType<typeof makeStore>;
  let mic: FakeMic;
  let llm: ScriptedLLM;
  let controller: VoiceController;

  beforeEach(() => {
    VoiceController.SILENCE_MS = 300;
    store = makeStore();
    mic = new FakeMic();
    llm = new ScriptedLLM();
    NavigationRegistry.install((to) => NavigationRegistry.setPathname(String(to)));
    controller = new VoiceController(store as never, { stt: mic, llm });
  });
  afterEach(() => {
    VoiceController.SILENCE_MS = original;
  });

  it('a whole note in one utterance goes straight to the AI Summary', async () => {
    const note = 'BP 160/100, start amlodipine 5 mg daily, add hypertension, recall in a month.';
    llm.calls([call('take_clinical_note', { note })], 'Extracting your note in the AI Summary.');
    controller.startListening();
    mic.say(note);
    await flush(60);
    expect(store.getState().voice.summaryHandoff?.text).toBe(note);
    expect(NavigationRegistry.pathname()).toBe('/summary/ai-summary');
  });

  it('"take a note": everything said until the pause is collected, then handed over — none of it is a command', async () => {
    llm.then({ calls: [call('take_clinical_note')] });
    controller.startListening();
    mic.say('take a note');
    await flush(40);
    mic.say('start metformin 500 mg twice daily');
    mic.say('and recall her in two weeks');
    await flush(40);
    expect(llm.requests).toHaveLength(1); // the note itself never went to the command model
    await flush(400);
    expect(store.getState().voice.summaryHandoff?.text).toBe('start metformin 500 mg twice daily and recall her in two weeks');
    expect(controller.isMicActive).toBe(false);
  });

  it('turns the mic off after a pause with no speech — but not during patient work', async () => {
    controller.startListening();
    await flush(450);
    expect(controller.isMicActive).toBe(false);
    store.dispatch(navigationActions.setCurrentPage({ pageId: 'patients', path: '/patients', title: 'Patients' }));
    controller.startListening();
    await flush(450);
    expect(controller.isMicActive).toBe(true);
    controller.stopListening();
  });
});

describe('a turn is handed over only when the speaker has finished', () => {
  let store: ReturnType<typeof makeStore>;
  let mic: FakeMic;
  let llm: ScriptedLLM;
  let controller: VoiceController;

  beforeEach(() => {
    VoiceController.TURN_GRACE_MS = 150;
    store = makeStore();
    mic = new FakeMic();
    llm = new ScriptedLLM();
    NavigationRegistry.install((to) => NavigationRegistry.setPathname(String(to)));
    controller = new VoiceController(store as never, { stt: mic, llm });
  });
  afterEach(() => {
    VoiceController.TURN_GRACE_MS = 0;
  });

  it('pauses inside a long instruction do not split it', async () => {
    llm.then({ content: 'Done.' });
    controller.startListening();
    mic.say('go to patients, select James Ahmed and add metformin, Panadol, gabapentin,');
    await flush(80);
    mic.say('create a task for blood pressure monitoring');
    await flush(80);
    mic.say('and schedule a follow-up next Tuesday at 3 pm');
    await flush(80);
    expect(llm.requests).toHaveLength(0);
    expect(store.getState().voice.interimTranscript).toMatch(/James Ahmed .* blood pressure .* 3 pm …$/);
    await flush(150);
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].at(-1)?.content).toMatch(
      /SAID: go to patients, select James Ahmed and add metformin, Panadol, gabapentin, create a task for blood pressure monitoring and schedule a follow-up next Tuesday at 3 pm$/,
    );
  });

  it('while the speaker is still talking the turn waits, however long the pause before the final', async () => {
    llm.then({ content: 'Done.' });
    controller.startListening();
    mic.say('add metformin');
    await flush(100);
    mic.current.callbacks.onSpeechStart?.();
    mic.current.callbacks.onInterim?.('and');
    await flush(300);
    expect(llm.requests).toHaveLength(0);
    mic.current.callbacks.onFinal('and Panadol');
    await flush(250);
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].at(-1)?.content).toMatch(/SAID: add metformin and Panadol$/);
  });

  it('Mic Off sends what was just said at once', async () => {
    llm.then({ content: 'Done.' });
    controller.startListening();
    mic.say('open the inbox');
    controller.stopListening();
    await flush(30);
    expect(llm.requests).toHaveLength(1);
  });
});

