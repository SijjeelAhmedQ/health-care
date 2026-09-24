/**
 * Corrections for words the speech engine reliably gets wrong.
 *
 * The Web Speech API has no idea what this application's vocabulary is, so it
 * picks the likeliest everyday English instead: "summary" comes back as
 * "somebody" or "summery" almost every time. The words below are only ever
 * heard as commands here, so mapping them back is safe.
 *
 * Two rules keep this from corrupting real data:
 *   1. It is applied to command interpretation only — never to a dictated
 *      paragraph, and never while the assistant is waiting for a field value
 *      (see VoiceController.processTranscript).
 *   2. Utterances that capture free text ("add task call somebody tomorrow")
 *      are left alone, because there the word is content, not a command.
 */

/** Spoken-word corrections, applied on whole words only, whatever the casing. */
const MISHEARD: Array<[RegExp, string]> = [
  // "summary" — the one the engine gets wrong most often.
  [/\b(?:some\s?body|summery|summry|sumary|sumery|sammary|some\s+mar+y)\b/gi, 'summary'],
  // "dashboard" is one word to the app, two to the engine.
  [/\bdash\s+board\b/gi, 'dashboard'],
];

/**
 * Commands that carry dictated free text after the verb. A misheard word there
 * is part of a task title or a note, so it is kept exactly as it was heard.
 */
const CAPTURES_FREE_TEXT = /^(?:add|create|new|record|log|book|schedule|register|prescribe|set|fill|enter|type|search|find|look\s+for)\b/i;

/**
 * Map what the engine heard back onto the application's own words.
 * Casing is ignored, and the result is safe to run through again.
 */
export function correctMisheardCommand(text: string): string {
  if (CAPTURES_FREE_TEXT.test(text.trim())) return text;
  return MISHEARD.reduce((out, [pattern, word]) => out.replace(pattern, word), text);
}
