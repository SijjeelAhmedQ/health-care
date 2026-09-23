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
  window.speechSynthesis.speak(utterance);
}
