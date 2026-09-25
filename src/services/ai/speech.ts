/**
 * Spoken replies. "Read the medication list" should be heard, not only read, so
 * the assistant speaks its answer through the browser's speech synthesis when
 * the user has that switched on.
 */
const STORAGE_KEY = 'careflow.voice.speakReplies';

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getSpeakReplies(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function setSpeakReplies(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* storage unavailable — the setting just won't persist */
  }
  if (!enabled) stopSpeaking();
}

/** When the last spoken reply ended (ms since epoch); 0 while none has been spoken. */
let lastSpeechEndedAt = 0;
let speaking = false;

/**
 * The assistant is talking, or stopped a moment ago. The microphone hears the loudspeaker, so speech
 * that starts in this window is the assistant's own voice, not the user's.
 */
export function isAssistantSpeaking(tailMs = 400): boolean {
  if (typeof window === 'undefined') return false;
  if (speaking || (isSpeechSupported() && window.speechSynthesis.speaking)) return true;
  return Date.now() - lastSpeechEndedAt < tailMs;
}

export function stopSpeaking() {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

/**
 * Speak a reply. Anything already being spoken is cancelled first, so the user
 * always hears the answer to their latest command.
 */
export function speak(text: string, options?: { force?: boolean }) {
  if (!isSpeechSupported()) return;
  if (!options?.force && !getSpeakReplies()) return;
  const clean = text
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/[·•]/g, ',')
    .replace(/["“”]/g, '')
    .trim();
  if (!clean) return;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.02;
  utterance.pitch = 1;
  utterance.lang = 'en-US';
  speaking = true;
  const done = () => {
    speaking = false;
    lastSpeechEndedAt = Date.now();
  };
  utterance.onend = done;
  utterance.onerror = done;
  window.speechSynthesis.speak(utterance);
}
