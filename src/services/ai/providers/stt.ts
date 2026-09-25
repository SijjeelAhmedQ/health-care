/**
 * Live speech-to-text with Omi Med STT.
 *
 * The microphone is captured with an AudioWorklet, downsampled to 16 kHz mono
 * 16-bit PCM in the audio thread, and streamed over a WebSocket to the bridge
 * (python/app.py, /ws/stt). The bridge runs voice activity detection and Omi
 * Med STT and streams back:
 *
 *   speech_start → partial … partial → speech_end → final
 *
 * `partial` transcripts are the utterance so far, shown while the user is still
 * speaking; `final` is the finished utterance, handed to the assistant. A final may
 * also carry `alt`: the same speech as a second recogniser (Whisper) heard it with
 * the app's vocabulary — names and drugs it knows — as its prompt.
 *
 * Sessions are CONTINUOUS: once started they keep streaming and emit one
 * `onFinal` per utterance until `stop()`/`cancel()`, or a fatal error. A dropped
 * connection is re-established without the user doing anything.
 */
export class STTUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'STTUnavailableError';
  }
}

export interface ListeningSession {
  /** Gracefully finish: transcribe what is being said, then end the session. */
  stop(): void;
  /** Abort immediately, discarding any in-flight audio. */
  cancel(): void;
  /** The names the app knows right now (patients, drugs…): the second recogniser listens for them. */
  setVocabulary?(vocabulary: string): void;
}

export interface ListeningCallbacks {
  /** The utterance so far, while the user is still speaking ('' clears it). */
  onInterim?(text: string): void;
  /** One finished utterance (and the second recogniser's version of it, if any). The session stays open afterwards. */
  onFinal(text: string, alt?: string): void;
  /** `fatal` = the session cannot continue (permission denied, no microphone, bridge down). */
  onError(error: Error, fatal: boolean): void;
  /** Speech started (the user began talking). */
  onSpeechStart?(): void;
  /** The user paused; the final transcript is being decoded. */
  onTranscribing?(): void;
  /** Called once when the session has fully ended (after stop/cancel or a fatal error). */
  onEnd?(): void;
  /** The recogniser is connected; `recording` = it keeps each utterance for voice diagnostics. */
  onReady?(info: { recording: boolean }): void;
}

export interface MicrophoneRecognizer {
  readonly providerName: string;
  isSupported(): boolean;
  start(callbacks: ListeningCallbacks): ListeningSession;
}

/**
 * Runs in the audio rendering thread: averages the input down to 16 kHz, converts it to
 * 16-bit PCM and posts ~100 ms blocks to the main thread (as transferable buffers).
 */
const WORKLET_SOURCE = `
class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0;
    this.count = 0;
    this.phase = 0;
    this.block = new Int16Array(1600);
    this.fill = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.acc += channel[i];
      this.count++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        const s = Math.max(-1, Math.min(1, this.acc / this.count));
        this.block[this.fill++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.acc = 0;
        this.count = 0;
        if (this.fill === this.block.length) {
          this.port.postMessage(this.block.buffer, [this.block.buffer]);
          this.block = new Int16Array(1600);
          this.fill = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-downsampler', PcmDownsampler);
`;

type ServerEvent =
  | { type: 'ready'; engine?: string; model?: string; record?: boolean }
  | { type: 'speech_start' }
  | { type: 'partial'; text: string }
  | { type: 'speech_end' }
  | { type: 'final'; text: string; alt?: string }
  | { type: 'flushed' }
  | { type: 'error'; message: string; fatal?: boolean };

export class OmiStreamingSTT implements MicrophoneRecognizer {
  readonly providerName: string;
  /** Reconnect attempts after the bridge drops a live session. */
  static readonly MAX_RECONNECTS = 5;

  constructor(private readonly wsUrl: string) {
    this.providerName = `omi-med-stt (live, ${wsUrl})`;
  }

  isSupported() {
    return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined' && typeof WebSocket !== 'undefined';
  }

  start(callbacks: ListeningCallbacks): ListeningSession {
    let active = true;
    let ended = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let node: AudioWorkletNode | null = null;
    let ws: WebSocket | null = null;
    let reconnects = 0;
    let stopping = false;
    let vocabulary = '';
    const sendVocabulary = () => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'config', vocabulary }));
    };

    const end = () => {
      if (ended) return;
      ended = true;
      active = false;
      node?.port.close();
      node?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
      callbacks.onEnd?.();
    };

    const fail = (message: string) => {
      callbacks.onError(new STTUnavailableError(message), true);
      end();
    };

    const connect = () => {
      const socket = new WebSocket(this.wsUrl);
      socket.binaryType = 'arraybuffer';
      ws = socket;
      let opened = false;
      // Pause length and partial timing are the bridge's settings (Configuration page), not the client's.
      socket.onopen = () => {
        opened = true;
        if (vocabulary) sendVocabulary();
      };
      socket.onmessage = (msg) => {
        const event = JSON.parse(String(msg.data)) as ServerEvent;
        switch (event.type) {
          case 'ready':
            reconnects = 0;
            callbacks.onReady?.({ recording: !!event.record });
            break;
          case 'speech_start':
            callbacks.onSpeechStart?.();
            break;
          case 'partial':
            if (active) callbacks.onInterim?.(event.text);
            break;
          case 'speech_end':
            callbacks.onTranscribing?.();
            break;
          case 'final':
            callbacks.onInterim?.('');
            if (event.text.trim()) callbacks.onFinal(event.text.trim(), event.alt?.trim() || undefined);
            break;
          case 'flushed':
            if (stopping) end();
            break;
          case 'error':
            if (event.fatal) fail(event.message);
            else callbacks.onError(new STTUnavailableError(event.message), false);
            break;
        }
      };
      socket.onclose = () => {
        if (ended || ws !== socket) return;
        if (stopping) return end();
        if (!opened) return fail(`Cannot reach Omi Med STT at ${this.wsUrl}. Start the bridge with "npm run bridge" (or: cd python && .\\start.ps1).`);
        if (reconnects >= OmiStreamingSTT.MAX_RECONNECTS) return fail('Lost the connection to Omi Med STT.');
        reconnects++;
        callbacks.onError(new STTUnavailableError('Connection to Omi Med STT dropped — reconnecting…'), false);
        setTimeout(() => active && connect(), 400 * reconnects);
      };
    };

    const startAudio = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!active) return stream.getTracks().forEach((t) => t.stop());
      ctx = new AudioContext();
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      node = new AudioWorkletNode(ctx, 'pcm-downsampler');
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (active && ws?.readyState === WebSocket.OPEN) ws.send(e.data);
      };
      ctx.createMediaStreamSource(stream).connect(node);
      await ctx.resume();
    };

    connect();
    startAudio().catch((e: Error) => fail(e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : `Microphone unavailable: ${e.message}`));

    return {
      stop: () => {
        if (!active) return;
        active = false;
        stopping = true;
        // Stop capturing, then ask the bridge to finish the utterance in progress; `flushed` ends the session.
        node?.disconnect();
        stream?.getTracks().forEach((t) => t.stop());
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'flush' }));
          setTimeout(end, 8000); // never hang on a bridge that stopped answering
        } else end();
      },
      cancel: () => end(),
      setVocabulary: (next: string) => {
        if (next === vocabulary) return;
        vocabulary = next;
        sendVocabulary();
      },
    };
  }
}

/** Emits a fixed transcript once and stays open until stopped — for tests and the dev console. */
export class MockSTT implements MicrophoneRecognizer {
  readonly providerName = 'mock';
  constructor(private readonly transcript = 'open the dashboard') {}
  isSupported() {
    return true;
  }
  start(callbacks: ListeningCallbacks): ListeningSession {
    const timer = setTimeout(() => callbacks.onFinal(this.transcript), 600);
    const finish = () => {
      clearTimeout(timer);
      callbacks.onEnd?.();
    };
    return { stop: finish, cancel: finish };
  }
}

export function createSTT(config: { stt: { wsUrl: string } }): MicrophoneRecognizer {
  return new OmiStreamingSTT(config.stt.wsUrl);
}
