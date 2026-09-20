/**
 * Speech-to-text adapters.
 *
 *  - BrowserSTTProvider: Web Speech API (Chrome/Edge). Streaming, no model needed.
 *  - HttpSTTProvider:    records audio with MediaRecorder and POSTs it to the
 *                        python bridge running omi-health/omi-med-stt-v1 (MLX or GGUF).
 *  - MockSTTProvider:    returns a canned transcript (used by tests / console).
 *
 * Sessions are CONTINUOUS: once started they keep listening and emit one
 * `onFinal` per completed utterance segment. The recognizer's own end-of-utterance
 * detection only closes a segment — it never closes the session. A session ends
 * only when the caller invokes `stop()`/`cancel()`, or on a fatal device/permission
 * error (`onError(err, fatal=true)`). If the underlying engine stops on its own
 * (e.g. Chrome ends recognition after a long silence) the session restarts itself.
 */
import type { SpeechToTextProvider } from '@/types/ai';
import type { AIConfig } from '../config';

export class STTUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'STTUnavailableError';
  }
}

export interface ListeningSession {
  /** Gracefully finish: flush the current segment, then end the session. */
  stop(): void;
  /** Abort immediately, discarding any in-flight audio. */
  cancel(): void;
}

export interface ListeningCallbacks {
  onInterim?(text: string): void;
  /** One completed utterance segment. The session stays open afterwards. */
  onFinal(text: string): void;
  /** `fatal` = the session cannot continue (permission denied, no microphone). */
  onError(error: Error, fatal: boolean): void;
  /** Recording of a segment ended and audio is being transcribed (HTTP providers). */
  onTranscribing?(): void;
  /** Called once when the session has fully ended (after stop/cancel or a fatal error). */
  onEnd?(): void;
}

/** Any provider can be wrapped into a microphone session. */
export interface MicrophoneRecognizer {
  readonly providerName: string;
  isSupported(): boolean;
  start(callbacks: ListeningCallbacks): ListeningSession;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Errors after which the microphone genuinely cannot keep running. */
const FATAL_SPEECH_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);
/** Restart delay when the engine ends recognition by itself (silence / network hiccup). */
const RESTART_DELAY_MS = 250;

export class BrowserSTTProvider implements SpeechToTextProvider, MicrophoneRecognizer {
  readonly name = 'browser (Web Speech API)';
  readonly providerName = this.name;
  readonly supportsStreaming = true;

  isSupported() {
    return typeof window !== 'undefined' && getSpeechRecognition() !== null;
  }

  async transcribe(): Promise<string> {
    throw new STTUnavailableError('Browser STT streams from the microphone; use start() instead.');
  }

  start(callbacks: ListeningCallbacks): ListeningSession {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      callbacks.onError(new STTUnavailableError('Speech recognition is not supported in this browser. Use Chrome/Edge or configure the HTTP STT provider.'), true);
      callbacks.onEnd?.();
      return { stop() {}, cancel() {} };
    }

    let active = true; // user intent: keep listening until stop()/cancel()
    let rec: SpeechRecognitionLike | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;

    const finish = () => {
      if (!active) return;
      active = false;
      if (restartTimer) clearTimeout(restartTimer);
      callbacks.onEnd?.();
    };

    const spin = () => {
      const r = new Ctor();
      rec = r;
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = true; // keep the engine open across pauses; each final result is one segment
      r.maxAlternatives = 1;

      r.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript.trim();
          if (!text) continue;
          if (result.isFinal) {
            consecutiveFailures = 0;
            callbacks.onFinal(text); // segment complete — the session stays open
          } else {
            interim += (interim ? ' ' : '') + text;
          }
        }
        callbacks.onInterim?.(interim);
      };

      r.onerror = (event) => {
        if (!active) return;
        if (FATAL_SPEECH_ERRORS.has(event.error)) {
          const messages: Record<string, string> = {
            'not-allowed': 'Microphone access was denied. Allow microphone permission and try again.',
            'service-not-allowed': 'Speech recognition service is not allowed in this browser.',
            'audio-capture': 'No microphone was found.',
            'language-not-supported': 'The recognition language is not supported.',
          };
          callbacks.onError(new STTUnavailableError(messages[event.error] ?? `Speech recognition error: ${event.error}`), true);
          active = false;
          try {
            r.abort();
          } catch {
            /* ignore */
          }
          if (restartTimer) clearTimeout(restartTimer);
          callbacks.onEnd?.();
          return;
        }
        // 'no-speech', 'aborted', 'network' etc. are transient: onend follows and we restart.
        consecutiveFailures += 1;
        if (event.error === 'network' && consecutiveFailures >= 5) {
          callbacks.onError(new STTUnavailableError('Speech recognition keeps losing its network connection. Check connectivity or switch to the HTTP STT provider.'), true);
          active = false;
          callbacks.onEnd?.();
        }
      };

      r.onend = () => {
        callbacks.onInterim?.('');
        if (!active) return;
        // The engine stopped on its own (silence timeout / result flush). The user has not
        // turned the microphone off, so resume listening after a short pause.
        restartTimer = setTimeout(() => {
          if (!active) return;
          try {
            spin();
          } catch (e) {
            callbacks.onError(new STTUnavailableError((e as Error).message), true);
            finish();
          }
        }, RESTART_DELAY_MS);
      };

      r.start();
    };

    try {
      spin();
    } catch (e) {
      callbacks.onError(new STTUnavailableError((e as Error).message), true);
      finish();
    }

    return {
      stop: () => {
        if (!active) return;
        active = false;
        if (restartTimer) clearTimeout(restartTimer);
        try {
          rec?.stop(); // lets Chrome flush a final result for the current segment
        } catch {
          /* ignore */
        }
        callbacks.onEnd?.();
      },
      cancel: () => {
        if (!active) return;
        active = false;
        if (restartTimer) clearTimeout(restartTimer);
        try {
          rec?.abort();
        } catch {
          /* ignore */
        }
        callbacks.onEnd?.();
      },
    };
  }
}

/**
 * Records with MediaRecorder and posts each speech segment to an HTTP STT endpoint.
 * Segments are delimited by a lightweight energy-based voice-activity detector so the
 * microphone never has to be re-armed by the user: speech → pause → transcribe → keep recording.
 */
export class HttpSTTProvider implements SpeechToTextProvider, MicrophoneRecognizer {
  readonly name: string;
  readonly providerName: string;
  readonly supportsStreaming = false;

  /** Silence (ms) after speech that closes a segment. */
  static readonly SILENCE_MS = 1400;
  /** Hard cap on a single segment so very long utterances still get transcribed. */
  static readonly MAX_SEGMENT_MS = 15000;
  /** RMS threshold (0..1) above which audio counts as speech. */
  static readonly SPEECH_RMS = 0.015;

  constructor(private readonly url: string, private readonly timeoutMs = 30000) {
    this.name = `http-stt (${url})`;
    this.providerName = this.name;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }

  async transcribe(audio: Blob): Promise<string> {
    const form = new FormData();
    form.append('audio', audio, `speech.${audio.type.includes('ogg') ? 'ogg' : 'webm'}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, { method: 'POST', body: form, signal: controller.signal });
      if (!res.ok) throw new STTUnavailableError(`STT service responded ${res.status}`);
      const data = (await res.json()) as { text?: string; transcript?: string };
      return (data.text ?? data.transcript ?? '').trim();
    } catch (e) {
      if (e instanceof STTUnavailableError) throw e;
      throw new STTUnavailableError(this.unreachableMessage((e as Error).message));
    } finally {
      clearTimeout(timer);
    }
  }

  private unreachableMessage(detail: string) {
    const origin = typeof location !== 'undefined' ? location.origin : 'the app';
    return `Cannot reach the omi-med-stt bridge at ${this.url} (${detail}). Start it with "npm run bridge" (or: cd python && .\\start.ps1) and make sure ${origin} is allowed by its CORS settings. Until then you can switch VITE_STT_PROVIDER=browser or type commands.`;
  }

  async healthCheck() {
    try {
      const res = await fetch(this.url.replace(/\/api\/.*$/, '/api/health'), { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Detailed status from the bridge (engine/model/ready) — used for the pre-flight check when the mic turns on. */
  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(this.url.replace(/\/api\/.*$/, '/api/health'), { method: 'GET' });
      if (!res.ok) return { ok: false, detail: `bridge responded ${res.status}` };
      const data = (await res.json()) as { stt?: { ready?: boolean; engine?: string; error?: string | null } };
      if (data.stt && data.stt.ready === false) return { ok: false, detail: `STT engine "${data.stt.engine}" is not ready: ${data.stt.error ?? 'unknown error'}` };
      return { ok: true, detail: data.stt?.engine ?? 'ok' };
    } catch (e) {
      return { ok: false, detail: (e as Error).message || 'Failed to fetch' };
    }
  }

  start(callbacks: ListeningCallbacks): ListeningSession {
    let active = true;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let vadTimer: ReturnType<typeof setInterval> | null = null;
    let ended = false;

    /** Per-segment recorder state. Each segment owns its own flags so the async `onstop`
     *  of a finished segment never reads the state of the segment that replaced it. */
    interface Segment { recorder: MediaRecorder; chunks: Blob[]; speech: boolean; startedAt: number; lastVoiceAt: number; discard: boolean }
    let current: Segment | null = null;
    const pending = new Set<Promise<void>>();

    const end = () => {
      if (ended) return;
      ended = true;
      if (vadTimer) clearInterval(vadTimer);
      stream?.getTracks().forEach((t) => t.stop());
      void audioCtx?.close().catch(() => undefined);
      // Let in-flight transcriptions finish before announcing the end.
      void Promise.allSettled([...pending]).then(() => callbacks.onEnd?.());
    };

    const transcribeSegment = (seg: Segment) => {
      const blob = new Blob(seg.chunks, { type: seg.recorder.mimeType || 'audio/webm' });
      if (!seg.speech || seg.discard || blob.size < 2000) return;
      callbacks.onTranscribing?.();
      const job = this.transcribe(blob)
        .then((text) => {
          if (text) callbacks.onFinal(text); // one segment done; recording already continues
        })
        .catch((e) => callbacks.onError(e as Error, false)) // service hiccup — keep the microphone on
        .finally(() => pending.delete(job));
      pending.add(job);
    };

    const startSegment = () => {
      if (!stream || !active) return;
      const r = new MediaRecorder(stream);
      const seg: Segment = { recorder: r, chunks: [], speech: false, startedAt: Date.now(), lastVoiceAt: 0, discard: false };
      r.ondataavailable = (e) => e.data.size && seg.chunks.push(e.data);
      r.onstop = () => {
        transcribeSegment(seg);
        if (!active && current === seg) end();
      };
      r.start(250);
      current = seg;
    };

    /** Close the running segment (its audio is transcribed) and immediately arm the next one. */
    const rollSegment = () => {
      const seg = current;
      if (!seg || seg.recorder.state !== 'recording') return;
      if (active) startSegment(); // new segment first so no speech is lost between segments
      seg.recorder.stop();
    };

    // Pre-flight: fail fast with an actionable message if the bridge is down, instead of a
    // cryptic "Failed to fetch" after the user has already spoken.
    this.health()
      .then((h) => {
        if (!active) return Promise.reject(new Error('cancelled'));
        if (!h.ok) throw new STTUnavailableError(h.detail.startsWith('STT engine') ? h.detail : this.unreachableMessage(h.detail));
        return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        try {
          audioCtx = new AudioContext();
          void audioCtx.resume().catch(() => undefined);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          audioCtx.createMediaStreamSource(s).connect(analyser);
        } catch {
          analyser = null; // VAD unavailable — fall back to fixed-length segments
        }
        startSegment();

        // Energy-based VAD with an adaptive noise floor: speech = clearly above the ambient level.
        const buf = new Float32Array(analyser?.fftSize ?? 0);
        let noiseFloor = 0.004;
        vadTimer = setInterval(() => {
          if (!active || !current) return;
          const now = Date.now();
          const seg = current;
          if (analyser) {
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const rms = Math.sqrt(sum / buf.length);
            const threshold = Math.max(HttpSTTProvider.SPEECH_RMS, noiseFloor * 3);
            if (rms > threshold) {
              if (!seg.speech) callbacks.onInterim?.('Hearing you…');
              seg.speech = true;
              seg.lastVoiceAt = now;
            } else {
              // Track the ambient level while nobody is speaking (slow decay upwards, fast downwards).
              noiseFloor = rms < noiseFloor ? rms : noiseFloor * 0.98 + rms * 0.02;
              if (seg.speech && now - seg.lastVoiceAt > HttpSTTProvider.SILENCE_MS) {
                callbacks.onInterim?.('');
                rollSegment();
                return;
              }
            }
          } else if (now - seg.startedAt > 8000) {
            seg.speech = true; // no VAD: assume speech and transcribe fixed windows
            rollSegment();
            return;
          }
          if (now - seg.startedAt > HttpSTTProvider.MAX_SEGMENT_MS) rollSegment();
        }, 100);
      })
      .catch((e: Error) => {
        if (e.message === 'cancelled') return;
        callbacks.onError(e instanceof STTUnavailableError ? e : new STTUnavailableError(`Microphone unavailable: ${e.message}`), true);
        active = false;
        end();
      });

    return {
      stop: () => {
        if (!active) return;
        active = false;
        if (vadTimer) clearInterval(vadTimer);
        const seg = current;
        if (seg && seg.recorder.state === 'recording') seg.recorder.stop(); // flushes the last segment, then end() runs in onstop
        else end();
      },
      cancel: () => {
        if (!active) return;
        active = false;
        if (vadTimer) clearInterval(vadTimer);
        const seg = current;
        if (seg) seg.discard = true;
        if (seg && seg.recorder.state === 'recording') seg.recorder.stop();
        else end();
      },
    };
  }
}

export class MockSTTProvider implements SpeechToTextProvider, MicrophoneRecognizer {
  readonly name = 'mock';
  readonly providerName = 'mock';
  readonly supportsStreaming = false;
  constructor(private readonly cannedTranscript = 'go to patient search') {}
  isSupported() {
    return true;
  }
  async transcribe(): Promise<string> {
    return this.cannedTranscript;
  }
  start(callbacks: ListeningCallbacks): ListeningSession {
    // Emits the canned transcript once, then stays "open" until the user stops it.
    const timer = setTimeout(() => callbacks.onFinal(this.cannedTranscript), 600);
    const finish = () => {
      clearTimeout(timer);
      callbacks.onEnd?.();
    };
    return { stop: finish, cancel: finish };
  }
}

export function createSTTProvider(config: AIConfig): MicrophoneRecognizer & SpeechToTextProvider {
  switch (config.stt.provider) {
    case 'http':
      return new HttpSTTProvider(config.stt.apiUrl);
    case 'mock':
      return new MockSTTProvider();
    case 'browser':
    default:
      return new BrowserSTTProvider();
  }
}
