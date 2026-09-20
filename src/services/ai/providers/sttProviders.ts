/**
 * Speech-to-text adapters.
 *
 *  - BrowserSTTProvider: Web Speech API (Chrome/Edge). Streaming, no model needed.
 *  - HttpSTTProvider:    records audio with MediaRecorder and POSTs it to the
 *                        python bridge running omi-health/omi-med-stt-v1 (MLX or GGUF).
 *  - MockSTTProvider:    returns a canned transcript (used by tests / console).
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
  stop(): void;
  cancel(): void;
}

export interface ListeningCallbacks {
  onInterim?(text: string): void;
  onFinal(text: string): void;
  onError(error: Error): void;
  /** Called when recording ended and audio is being transcribed (HTTP providers). */
  onTranscribing?(): void;
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
      callbacks.onError(new STTUnavailableError('Speech recognition is not supported in this browser. Use Chrome/Edge or configure the HTTP STT provider.'));
      return { stop() {}, cancel() {} };
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    let cancelled = false;
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) callbacks.onInterim?.(finalText + interim);
    };
    rec.onerror = (event) => {
      if (cancelled) return;
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone access was denied. Allow microphone permission and try again.',
        'no-speech': "I didn't hear anything. Tap the microphone and try again.",
        network: 'Speech recognition needs a network connection in this browser.',
        'audio-capture': 'No microphone was found.',
        aborted: 'Listening cancelled.',
      };
      callbacks.onError(new STTUnavailableError(messages[event.error] ?? `Speech recognition error: ${event.error}`));
    };
    rec.onend = () => {
      if (cancelled) return;
      if (finalText.trim()) callbacks.onFinal(finalText.trim());
    };
    try {
      rec.start();
    } catch (e) {
      callbacks.onError(new STTUnavailableError((e as Error).message));
    }
    return {
      stop: () => rec.stop(),
      cancel: () => {
        cancelled = true;
        rec.abort();
      },
    };
  }
}

/** Records with MediaRecorder and posts the audio blob to an HTTP STT endpoint. */
export class HttpSTTProvider implements SpeechToTextProvider, MicrophoneRecognizer {
  readonly name: string;
  readonly providerName: string;
  readonly supportsStreaming = false;

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
      throw new STTUnavailableError(`Could not reach STT service at ${this.url}: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck() {
    try {
      const res = await fetch(this.url.replace(/\/api\/.*$/, '/api/health'), { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  start(callbacks: ListeningCallbacks): ListeningSession {
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const chunks: Blob[] = [];
    const cleanup = () => stream?.getTracks().forEach((t) => t.stop());

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        recorder = new MediaRecorder(s);
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = async () => {
          cleanup();
          if (cancelled) return;
          callbacks.onTranscribing?.();
          try {
            const text = await this.transcribe(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
            if (text) callbacks.onFinal(text);
            else callbacks.onError(new STTUnavailableError("I didn't catch that. Please try again."));
          } catch (e) {
            callbacks.onError(e as Error);
          }
        };
        recorder.start();
        // Auto-stop after 12s to avoid runaway recordings.
        setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 12000);
      })
      .catch((e: Error) => callbacks.onError(new STTUnavailableError(`Microphone unavailable: ${e.message}`)));

    return {
      stop: () => recorder?.state === 'recording' && recorder.stop(),
      cancel: () => {
        cancelled = true;
        if (recorder?.state === 'recording') recorder.stop();
        cleanup();
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
    const timer = setTimeout(() => callbacks.onFinal(this.cannedTranscript), 600);
    return { stop: () => clearTimeout(timer), cancel: () => clearTimeout(timer) };
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
