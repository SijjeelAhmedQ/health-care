/**
 * Urdu / Roman-Urdu -> English transcript translator.
 *
 * Runs BEFORE the English interpreter (rules) and before the LLM, so a clinician can say
 *   "page number tees par jao aur ek dawai add karo amoxicillin 500 mg din mein do bar paanch din ke liye"
 *   "پیج نمبر تیس پر جاؤ اور ایک دوائی ایڈ کرو اموکسیسلن 500 ملی گرام دن میں دو بار پانچ دن کے لیے"
 * and the rest of the pipeline sees
 *   "go to page 30 and add medication amoxicillin 500 mg twice daily for 5 days".
 *
 * Pipeline: script normalisation -> tokens -> canonical Roman tokens (lexicon) -> detect Urdu
 * -> clause split (aur / phir / uske baad) -> per clause: sub-phrase rules (time, frequency,
 * duration, route, symptoms, postpositions) -> structural rules (Urdu is verb-final; English
 * is verb-first) -> cleanup. Deterministic and side-effect free; English input passes through
 * untouched (`detected: false`).
 */
import { FieldRegistry } from '@/registry/fieldRegistry';
import { AMBIGUOUS_ROMAN, ROMAN, SCRIPT, URDU_MARKERS } from './lexicon';

export interface UrduTranslation {
  /** English (or original, when not Urdu) transcript. */
  text: string;
  /** True when Urdu / Roman Urdu was recognised and `text` is a translation. */
  detected: boolean;
  /** Language of the input: 'ur' for Urdu script, 'roman-ur' for Roman Urdu, 'en' otherwise. */
  language: 'en' | 'ur' | 'roman-ur';
}

// ------------------------------------------------------------------ script normalisation
const URDU_RANGE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const DIACRITICS = /[\u064B-\u065F\u0670\u0640\u200C\u200D\u200E\u200F\uFEFF]/g;
const DIGITS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const LETTER_VARIANTS: Record<string, string> = { ي: 'ی', ى: 'ی', ك: 'ک', ه: 'ہ', ة: 'ہ', ۀ: 'ہ', أ: 'ا', إ: 'ا', ٱ: 'ا', ۃ: 'ہ' };

export const hasUrduScript = (text: string): boolean => URDU_RANGE.test(text);

export function normalizeScript(text: string): string {
  return text
    .replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] ?? d)
    .replace(DIACRITICS, '')
    .replace(/[يىكهةۀأإٱۃ]/g, (c) => LETTER_VARIANTS[c] ?? c)
    .replace(/[،۔؛؟]/g, ' ');
}

const SCRIPT_TABLE: Record<string, string> = {};
for (const [k, v] of Object.entries(SCRIPT)) SCRIPT_TABLE[normalizeScript(k)] = v;

/** Rough letter-by-letter fallback for Urdu-script words not in the lexicon (names, unknown drugs). */
const TRANSLIT: Record<string, string> = {
  ا: 'a', آ: 'a', ب: 'b', پ: 'p', ت: 't', ٹ: 't', ث: 's', ج: 'j', چ: 'ch', ح: 'h', خ: 'kh', د: 'd', ڈ: 'd', ذ: 'z', ر: 'r', ڑ: 'r', ز: 'z', ژ: 'zh', س: 's', ش: 'sh', ص: 's', ض: 'z', ط: 't', ظ: 'z',
  ع: '', غ: 'gh', ف: 'f', ق: 'q', ک: 'k', گ: 'g', ل: 'l', م: 'm', ن: 'n', ں: 'n', و: 'o', ہ: 'h', ھ: 'h', ء: '', ی: 'i', ے: 'e', ئ: '', ؤ: 'o',
};
const transliterate = (word: string): string =>
  [...word]
    .map((c) => TRANSLIT[c] ?? (URDU_RANGE.test(c) ? '' : c))
    .join('');

// ------------------------------------------------------------------ tokens
/** Verb stems after which "do/dein" is the auxiliary ("kar do"), not the number two. */
const VERB_STEMS = new Set(['kar', 'karo', 'khol', 'kholo', 'dikha', 'dikhao', 'daal', 'daalo', 'likh', 'likho', 'bana', 'banao', 'bhej', 'bhejo', 'rakh', 'rakho', 'hata', 'hatao', 'rehne', 'chhor', 'le', 'laga', 'lagao', 'chun', 'chuno', 'bhar', 'bharo', 'rok', 'roko', 'band', 'save', 'add', 'set', 'book', 'cancel', 'close', 'submit', 'clear', 'select', 'tick', 'untick', 'open', 'show', 'delete', 'remove', 'register', 'search', 'scroll', 'dhoondo', 'jao', 'chalo', 'khali', 'saaf', 'mehfooz', 'nikal', 'mita', 'jane', 'hone', 'de', 'kara', 'karwa']);
const AUX_DO = new Set(['do', 'dein', 'den', 'dijiye', 'dijye', 'dain', 'dena', 'dou']);

const collapse = (w: string): string => w.replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/ii/g, 'i').replace(/uu/g, 'u').replace(/([a-z])\1/g, '$1');

interface Token {
  raw: string;
  canon: string;
  script: boolean;
}

function tokenize(input: string): Token[] {
  const text = normalizeScript(input)
    .replace(/[“”"«»()[\]{}!?;:]/g, ' ')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens: Token[] = [];
  for (const raw of text.split(' ').filter(Boolean)) {
    if (URDU_RANGE.test(raw)) {
      const prevCanon = tokens[tokens.length - 1]?.canon;
      const canon = raw === 'دو' && prevCanon && VERB_STEMS.has(prevCanon) ? 'do' : SCRIPT_TABLE[raw] ?? transliterate(raw);
      tokens.push({ raw, canon, script: true });
      continue;
    }
    const lower = raw.toLowerCase();
    const prev = tokens[tokens.length - 1]?.canon;
    if (AUX_DO.has(lower) && prev && VERB_STEMS.has(prev)) {
      tokens.push({ raw, canon: 'do', script: false });
      continue;
    }
    tokens.push({ raw, canon: ROMAN[lower] ?? lower, script: false });
  }
  return tokens;
}

/** Second pass (only once Urdu is known): fuzzy-match remaining unknown Roman spellings. */
function fuzzyCanon(tokens: Token[]): Token[] {
  return tokens.map((t) => {
    if (t.script || t.canon !== t.raw.toLowerCase() || ROMAN[t.canon] !== undefined) return t;
    const c = collapse(t.canon);
    const hit = ROMAN[c];
    return hit && URDU_MARKERS.has(hit) ? { ...t, canon: hit } : t;
  });
}

function isUrduToken(t: Token): boolean {
  if (t.script) return true;
  const raw = t.raw.toLowerCase();
  if (URDU_MARKERS.has(raw)) return true;
  // Spoken Urdu number words ("tees", "paanch") — except spellings that are also English words.
  if (/^\d+$/.test(t.canon) && !/^\d+$/.test(raw) && !AMBIGUOUS_ROMAN.has(raw)) return true;
  return URDU_MARKERS.has(t.canon) && !AMBIGUOUS_ROMAN.has(raw);
}

// ------------------------------------------------------------------ helpers
type Rule = [RegExp, string | ((...m: string[]) => string)];
const apply = (text: string, rules: Rule[]): string => {
  let out = text;
  for (const [re, rep] of rules) out = out.replace(re, rep as string);
  return out.replace(/\s+/g, ' ').trim();
};
const FREQ_WORDS: Record<string, string> = { '1': 'once daily', '2': 'twice daily', '3': 'three times daily', '4': 'four times daily' };
const freqWord = (n: string) => FREQ_WORDS[n] ?? `${n} times daily`;
const UNIT = (u: string) => ({ din: 'days', hafta: 'weeks', mahina: 'months', saal: 'years' })[u] ?? u;

// Phrases that must be rewritten before clause splitting (they contain connector words).
const PRE_SPLIT: Rule[] = [
  [/\b(?:us|is|ye|uske|iske) ke baad\b/g, ' phir '],
  [/\buske baad\b/g, ' phir '],
  [/\bsubah aur shaam\b/g, 'subah shaam'],
  [/\bsubah dopahar aur shaam\b/g, 'subah dopahar shaam'],
  [/\ble (?:jao|chalo|chal)\b/g, 'lejao'],
  [/\b(kholo|dikhao|daalo|likho|banao|bhejo|rakho|hatao|lagao|chuno|bharo|roko|dhoondo|jao|chalo|lejao|nikalo) do\b/g, '$1'],
  [/\bkar (?:do|dena)\b/g, 'karo'],
  [/\bkar\b/g, 'karo'],
  [/\b(save|add|set|book|cancel|close|submit|clear|select|tick|untick|open|show|delete|remove|register|search|scroll|band|khali|saaf|mehfooz) do\b/g, '$1 karo'],
  [/\bde do\b/g, 'do'],
  [/\b(mujhe|zara|ab|bhi|hi|yaar|bas|thora|thori|thoda|thodi|jaldi)\b/g, ' '],
  [/\bmili gram\b|\bmilli gram\b|\bem ji\b|\bm g\b/g, 'mg'],
  [/\bmili litre\b|\bmili liter\b|\bem el\b/g, 'ml'],
  [/\bmicro gram\b/g, 'mcg'],
  [/\bblood pressure\b|\bbp\b/g, 'hypertension'],
];

const SUB_PHRASES: Rule[] = [
  // --- clock times (before frequency so "raat ko 8 baje" is a time, not bedtime)
  [/\b(?:shaam|raat) (?:ko |mein |ke )?(\d{1,2}) baje\b/g, 'at $1 pm'],
  [/\bsubah (?:ko |mein |ke )?(\d{1,2}) baje\b/g, 'at $1 am'],
  [/\bdopahar (?:ko |mein |ke )?(\d{1,2}) baje\b/g, (_: string, h: string) => `at ${h} pm`],
  [/\b(\d{1,2}) baje (?:shaam|raat|dopahar)(?: ko)?\b/g, 'at $1 pm'],
  [/\b(\d{1,2}) baje subah(?: ko)?\b/g, 'at $1 am'],
  [/\b(\d{1,2}) baje\b/g, "at $1 o'clock"],
  // --- frequency
  [/\b(?:din|rozana|har din|har roz) (?:mein |ke |ko )?(\d) (?:bar|waqt)\b/g, (_: string, n: string) => freqWord(n)],
  [/\b(\d) (?:bar|waqt)(?: (?:rozana|har din|din mein|din|roz|har roz))?\b/g, (_: string, n: string) => freqWord(n)],
  [/\bsubah dopahar shaam\b/g, 'three times daily'],
  [/\bsubah shaam\b/g, 'twice daily'],
  [/\bhar (\d+) ghanta(?: (?:ke )?(?:baad|mein))?\b/g, 'every $1 hours'],
  [/\bhafta mein 1 bar\b|\bhar hafta\b|\bhaftawar\b/g, 'once weekly'],
  [/\b(?:rozana|har roz|har din|roz|din mein 1 bar)\b/g, 'once daily'],
  [/\braat ko(?: sone se pehle)?\b|\bsone se pehle\b|\bsone ke waqt\b|\bsone waqt\b|\bsote waqt\b|\bsone ke baad\b/g, 'at bedtime'],
  [/\bzaroorat (?:par|ke waqt|ke mutabiq|hone par|ho to|ke hisab se|padne par|parne par)\b|\bjab zaroorat ho\b|\bzaroorat ho to\b|\bzaroorat ke waqt\b/g, 'as needed'],
  // --- time of day / dates
  [/\b(?:subah|savere)(?: ko| mein)?\b/g, 'in the morning'],
  [/\bdopahar(?: ko| mein)?\b/g, 'in the afternoon'],
  [/\b(?:shaam|raat)(?: ko| mein)?\b/g, 'in the evening'],
  [/\bparso\b/g, 'day after tomorrow'],
  [/\bkal\b/g, 'tomorrow'],
  [/\baaj\b/g, 'today'],
  [/\bagle hafta\b/g, 'in 1 week'],
  [/\bagle mahina\b/g, 'in 1 month'],
  [/\bagle (peer|mangal|budh|jumerat|jumma|sanichar|itwar)\b/g, (_: string, d: string) => `next ${WEEKDAY[d]}`],
  [/\b(peer|mangal|budh|jumerat|jumma|sanichar|itwar)(?: ko| ke din)?\b/g, (_: string, d: string) => WEEKDAY[d]],
  [/\b(\d+) (din|hafta|mahina) (?:baad|ke baad|mein)\b/g, (_: string, n: string, u: string) => `in ${n} ${UNIT(u)}`],
  // --- duration
  [/\b(\d+) (din|hafta|mahina|saal) (?:ke liye|tak|ke liye tak|ke waste|ka course|ki muddat|ke)\b/g, (_: string, n: string, u: string) => `for ${n} ${UNIT(u)}`],
  [/\b(\d+) (din|hafta|mahina)\b/g, (_: string, n: string, u: string) => `for ${n} ${UNIT(u)}`],
  // --- food / instructions
  [/\bkhana (?:khana )?ke baad\b|\bkhana ke baad mein\b/g, 'after food'],
  [/\bkhana (?:khana )?se pehle\b|\bkhana ke pehle\b/g, 'before food'],
  [/\bkhana ke saath\b/g, 'with food'],
  // --- route
  [/\bmuun (?:se|ke zariye|ke raste|ke through)\b|\bmuun\b/g, 'orally'],
  [/\bkhana wala\b|\bkhane wali\b/g, 'orally'],
  [/\bnas (?:mein|ke zariye|se)\b|\bdrip\b/g, 'iv'],
  [/\blagane wala\b|\bmalham\b/g, 'topical'],
  [/\baankh (?:ke qatre|mein|ke drops|ke liye|ka)\b/g, 'eye drops'],
  [/\bkaan (?:ke qatre|mein|ke drops)\b/g, 'ear drops'],
  [/\bnaak (?:mein|ka spray|ke qatre)\b/g, 'nasal'],
  [/\bzuban ke neeche\b/g, 'under the tongue'],
  // --- symptoms / indications
  [/\bsar (?:mein |ka |ke )?dard\b/g, 'headache'],
  [/\bpait (?:mein |ka |ke )?dard\b/g, 'stomach pain'],
  [/\bseena (?:mein |ka |ke )?dard\b/g, 'chest pain'],
  [/\bkamar (?:mein |ka |ke )?dard\b/g, 'back pain'],
  [/\bgala (?:kharab|mein dard|ka dard|dard|ki takleef)\b/g, 'sore throat'],
  [/\bsaans (?:ki takleef|mein takleef|ki mushkil|ki tangi)?\b/g, 'shortness of breath'],
  [/\bbukhar\b/g, 'fever'],
  [/\bkhansi\b/g, 'cough'],
  [/\bzukam\b/g, 'cold'],
  [/\bsugar\b/g, 'diabetes'],
  [/\bulti\b/g, 'vomiting'],
  [/\bdast\b/g, 'diarrhea'],
  [/\bchakkar\b/g, 'dizziness'],
  [/\bkamzori\b/g, 'weakness'],
  [/\bdard\b/g, 'pain'],
  [/\btakleef\b/g, 'discomfort'],
  // --- people
  [/\b(\d{1,3}) saal(?: (?:ka|ki|ke|umar|ke hai|ki hai|ka hai))?\b/g, '$1 years old'],
  [/\bumar (\d{1,3})(?: saal)?\b/g, 'aged $1'],
  [/\bmard\b/g, 'male'],
  [/\baurat\b/g, 'female'],
  [/\bkhoon ka group\b|\bblood group\b/g, 'blood group'],
  // --- field names
  [/\bdawai ka naam\b/g, 'medication name'],
  [/\b(?:mareez|patient) ka naam\b/g, 'patient name'],
  [/\b(?:dr|provider) ka naam\b/g, 'provider name'],
  [/\bpehla naam\b/g, 'first name'],
  [/\b(?:akhir|aakhri|akhri) naam\b/g, 'last name'],
  [/\bshuru ki tareekh\b|\bshuru tareekh\b/g, 'start date'],
  [/\bkhatam ki tareekh\b|\bkhatam tareekh\b|\bakhir ki tareekh\b/g, 'end date'],
  [/\bpaidaish ki tareekh\b|\btareekh paidaish\b|\btareekh e paidaish\b/g, 'date of birth'],
  [/\bkitni bar\b/g, 'frequency'],
  [/\b(?:dawai ka )?(?:rasta|tareeqa)\b/g, 'route'],
  [/\bnaam\b/g, 'name'],
  [/\btareekh\b/g, 'date'],
  [/\bwajah\b/g, 'reason'],
  [/\bhidayat\b/g, 'instructions'],
  [/\bpata\b/g, 'address'],
  [/\bumar\b/g, 'age'],
  [/\bjins\b/g, 'gender'],
  [/\bmuddat\b/g, 'duration'],
  [/\btashkhees\b/g, 'diagnosis'],
  [/\bilaj\b/g, 'treatment'],
  [/\bchhutti\b/g, 'leave'],
  [/\bqatre\b/g, 'drops'],
];
const WEEKDAY: Record<string, string> = { peer: 'monday', mangal: 'tuesday', budh: 'wednesday', jumerat: 'thursday', jumma: 'friday', sanichar: 'saturday', itwar: 'sunday' };

// Tokens that end a name/object phrase when walking backwards from a postposition.
const PHRASE_STOP = new Set(['par', 'ko', 'ke', 'ka', 'ki', 'se', 'mein', 'tak', 'liye', 'saath', 'baad', 'pehle', 'aur', 'phir', 'and', 'then', 'for', 'with', 'at', 'in', 'on', 'to', 'tomorrow', 'today', 'next', 'day', 'after', 'before', 'appointment', 'medication', 'dawai', 'patient', 'mareez', 'page', 'form', 'tab', 'field', 'section', "o'clock", 'am', 'pm', 'mg', 'ml', 'mcg', 'gram', 'tablet', 'capsule', 'syrup', 'injection', 'daily', 'weekly', 'needed', 'bedtime', 'hours', 'days', 'weeks', 'months', 'orally', 'iv', 'topical', 'morning', 'afternoon', 'evening', 'the', 'a', 'new', 'naya', '1', 'jao', 'chalo', 'kholo', 'dikhao', 'karo', 'daalo', 'likho', 'banao', 'dhoondo', 'rakho', 'hatao', 'bhejo', 'lejao', 'old', 'years', 'male', 'female', 'aged', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'urgent', 'dr']);

/** "ahmed khan ke liye" -> "for ahmed khan", "dr sarah ke saath" -> "with dr sarah". */
function reorderPostpositions(clause: string): string {
  const tokens = clause.split(' ');
  const out: string[] = [];
  const POST: Array<[string[], string]> = [
    [['ke', 'liye'], 'for'],
    [['ki', 'wajah', 'se'], 'for'],
    [['ke', 'saath'], 'with'],
    [['ke', 'paas'], 'with'],
    [['ke', 'naam', 'se'], ''],
  ];
  for (let i = 0; i < tokens.length; i++) {
    const hit = POST.find(([seq]) => seq.every((w, j) => tokens[i + j] === w));
    if (!hit) {
      out.push(tokens[i]);
      continue;
    }
    // Collect up to 3 plain words directly before the postposition.
    const phrase: string[] = [];
    while (out.length && phrase.length < 3) {
      const last = out[out.length - 1];
      if (PHRASE_STOP.has(last) || /^\d/.test(last)) {
        if (last === 'dr' && phrase.length) {
          phrase.unshift(out.pop()!);
        }
        break;
      }
      phrase.unshift(out.pop()!);
    }
    if (phrase.length && hit[1]) out.push(hit[1], ...phrase);
    else out.push(...phrase);
    i += hit[0].length - 1;
  }
  return out.join(' ');
}

// ------------------------------------------------------------------ structural rules
const NAV_END = '(?:jao|chalo|lejao|jana hai|jana chahiye|jana|chalna hai|jaon|jaun|jaen)';
const OPEN_END = '(?:kholo|open karo|dikhao|show karo|dekho|dikhado|open|show|dekhna hai|dekhna chahiye|dekhna)';
const ADD_END = '(?:add karo|daalo|shamil karo|likho|add|add kar|add kardo|dakhil karo|record karo|entry karo)';
const CREATE_END = '(?:banao|create karo|create|schedule karo|book karo|book|fix karo|rakho|lagao|set karo)';
const SET_END = '(?:set karo|karo|rakho|likho|daalo|bharo|set|enter karo|type karo|do|kardo)';
const FORM_NOUN = '(?:form|medication|dawai|appointment|patient|mareez|prescription|record|changes|entry|sab kuch|sab|ye)';

const ALLERGY_LIKE = 'allergy|diagnosis|problem|referral|lab result|lab results|lab order|lab|recall|reminder|shift|leave|note|immunization|vaccination|document|insurance';
const SECTION_NAMES = 'medications|medication|dawai|allergies|allergy|history|insurance|problems|documents|notes|note|immunizations|contacts|demographics|summary|communication|profile|file|record|chart|appointments';
const SECTION_MAP: Record<string, string> = { dawai: 'medications', medication: 'medications', allergy: 'allergies', note: 'notes' };

const stripPatient = (s: string) => s.replace(/^(?:mareez|patient|dr|doctor) /, '').replace(/ (?:naam ka|naam ki|naam wala|naam wali|wala|wali|ko|ka|ki)$/, '').trim();

/** All field names/labels/aliases across every voice-fillable form (lower-case). */
let FIELD_WORDS: Set<string> | null = null;
function fieldWords(): Set<string> {
  if (!FIELD_WORDS) {
    FIELD_WORDS = new Set<string>();
    for (const form of FieldRegistry.forms()) for (const f of form.fields) for (const w of [f.name, f.label, ...(f.aliases ?? [])]) FIELD_WORDS.add(w.toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
    for (const f of FieldRegistry.forms().flatMap((x) => x.fields)) FIELD_WORDS.add(f.name.replace(/([A-Z])/g, ' $1').toLowerCase());
  }
  return FIELD_WORDS;
}

/** "dosage 250 mg" -> ["dosage", "250 mg"] using known field names; null when no field prefix matches. */
function splitField(body: string): [string, string] | null {
  const tokens = body.split(' ').filter((t) => !['ko', 'mein', 'field', 'par', 'ka', 'ki', 'ke'].includes(t));
  const words = fieldWords();
  for (let k = Math.min(4, tokens.length - 1); k >= 1; k--) {
    const prefix = tokens.slice(0, k).join(' ');
    if (words.has(prefix)) return [prefix, tokens.slice(k).join(' ')];
  }
  return null;
}

function structure(c: string): string {
  const m = (re: RegExp) => c.match(re);
  let r: RegExpMatchArray | null;

  // --- navigation shortcuts
  if (m(/^(?:wapas|back)(?: jao| chalo| karo| lejao| chalein)?$/) || m(/^(?:pichla|pichle|pehle wala) page(?: par)?(?: jao| chalo)?$/)) return 'go back';
  if (m(/^(?:ghar|home)(?: page)?(?: par| pe)?(?: jao| chalo| lejao| karo)?$/)) return 'go home';
  if (m(/^(?:neeche|down)(?: jao| karo| scroll karo| chalo| scroll| lejao| ko)?$/) || m(/^scroll (?:neeche|down)(?: karo)?$/)) return 'scroll down';
  if (m(/^(?:upar|up)(?: jao| karo| scroll karo| chalo| scroll| lejao| ko)?$/) || m(/^scroll (?:upar|up)(?: karo)?$/)) return 'scroll up';
  if (m(/^(?:sab se upar|bilkul upar|top|top par|top pe|upar top|shuru mein|shuru par)(?: jao| karo| scroll karo| chalo| lejao)?$/) || m(/^scroll top$/)) return 'scroll top';
  if (m(/^(?:sab se neeche|bilkul neeche|bottom|bottom par|akhir mein|akhir tak|akhir par|akhir)(?: jao| karo| scroll karo| chalo| lejao)?$/) || m(/^scroll bottom$/)) return 'scroll bottom';
  if ((r = m(/^(.+?) (?:section |hissa )?(?:tak|par|pe) scroll(?: karo)?$/)) || (r = m(/^(.+?) (?:section|hissa) (?:tak|par|pe) (?:jao|chalo)$/))) return `scroll to ${r[1]}`;

  // --- help / sidebar
  if (m(/^(?:madad|help)(?: karo| chahiye| karein| kro)?$/) || m(/^(?:main )?kya (?:kar|bol|keh) sakta (?:hoon|ho|hai)$/) || m(/^kya kya (?:kar|bol) sakta (?:hoon|ho|hai)$/) || m(/^commands$/)) return 'help';
  if (m(/^(?:sidebar|menu|side bar) (?:band karo|chupao|chhota karo|hide karo|collapse karo|kholo|dikhao|toggle karo|band|khol do|dikha do|band kardo|chupa do|hatao)$/)) return 'toggle sidebar';

  // --- dashboard summary widget (the panel on the right)
  // It has to be matched before the generic "X band karo" / "X dikhao" rules below,
  // which would otherwise read it as unticking or opening a field called "summary".
  const DOCK = '(?:(?:patient )?dashboard (?:ka |ki )?summary(?: widget| panel)?|summary (?:widget|panel))';
  if (m(new RegExp(`^${DOCK} (?:${OPEN_END}|khol do|dikha do|chahiye)$`)) || m(new RegExp(`^${OPEN_END} ${DOCK}$`))) return 'show dashboard summary';
  if (m(new RegExp(`^${DOCK} (?:ko |ka )?(?:band karo|band kardo|band|close karo|close|chupao|chupa do|hatao|hata do)$`))) return 'close dashboard summary';

  // --- tabs
  if ((r = m(/^(.+?) (?:wala |wali |wale )?tab (?:kholo|par jao|pe jao|dikhao|par chalo|select karo|chuno|open karo|par lejao|kholo do)$/))) return `open ${r[1]} tab`;

  // --- page numbers
  if ((r = m(new RegExp(`^(?:page |number |page number |page no )(\\d{1,3})(?: number)?(?: page)?(?: (?:par|pe|ko|mein|tak))?(?: ${NAV_END}| ${OPEN_END})?$`))) || (r = m(new RegExp(`^(\\d{1,3})(?: number)?(?: page)?(?: (?:par|pe|ko|mein|tak))? (?:${NAV_END}|${OPEN_END})$`)))) return `go to page ${r[1]}`;

  // --- confirmation / cancel / close / save
  if (m(new RegExp(`^(?:${FORM_NOUN} )?(?:save karo|mehfooz karo|save|mehfooz|save kardo|jama karo|submit karo|submit|bhejo|send karo|save kar)$`))) {
    const noun = c.match(new RegExp(`^(${FORM_NOUN}) `))?.[1];
    if (!noun || noun === 'ye' || noun === 'sab' || noun === 'sab kuch') return 'save it';
    const en: Record<string, string> = { dawai: 'medication', mareez: 'patient', entry: 'form', changes: 'changes' };
    return `save the ${en[noun] ?? noun}`;
  }
  if (m(/^(?:form |ye |isko |is form ko |form ko )?(?:band karo|close karo|band kardo|close|band|band kar)$/)) return 'close the form';
  if (m(/^(?:cancel karo|cancel|cancel kardo|rehne do|chhor do|chhor|mat karo|roko|khatam karo|mansookh karo|nahi|nahi karo|rehne|ruk jao|wapas lo|hatao ye)$/)) return 'cancel';

  // --- medication
  if (m(new RegExp(`^(?:1 |naya |new )?(?:naya |new )?(?:dawai|medication)(?: form)? (?:${ADD_END}|kholo|banao|shuru karo|start karo|open karo)$`))) return 'add medication';
  if ((r = m(new RegExp(`^(?:1 |naya |new )?(?:dawai|medication)(?: form)? ${ADD_END} (.+)$`)))) return `add medication ${r[1]}`;
  if ((r = m(new RegExp(`^(?:1 |naya |new )?(?:dawai|medication) (.+?) ${ADD_END}$`)))) return `add medication ${r[1]}`;
  if ((r = m(new RegExp(`^(.+?) (?:naam ki |naam ka |naam wali |wali |wala )?(?:1 |naya |new )?(?:dawai|medication) (?:${ADD_END}|rakho|do)$`)))) return `add medication ${r[1]}`;
  // --- prescription
  if (m(/^(?:1 |naya |new )?(?:naya |new )?prescription(?: form)? (?:banao|likho|kholo|add karo|shuru karo|start karo|open karo|create karo)$/)) return 'new prescription';
  if ((r = m(/^prescription (?:banao|likho|add karo) (.+)$/)) || (r = m(/^(.+?) (?:ka |ki |for )?prescription (?:banao|likho|add karo|bhejo)$/))) return `prescribe ${r[1]}`;
  // --- appointment
  if (m(new RegExp(`^(?:1 |naya |new )?(?:naya |new )?appointment(?: form)? (?:${CREATE_END}|add karo|kholo|karo|add|banado|shuru karo|open karo)$`))) return 'create appointment';
  if ((r = m(new RegExp(`^(?:1 |naya |new )?appointment (?:${CREATE_END}|add karo|add) (.+)$`)))) return `create appointment ${r[1]}`;
  if ((r = m(new RegExp(`^(.+?) (?:ka |ki |wala |wali )?(?:1 |naya |new )?appointment (?:${CREATE_END}|add karo|add|karo|banado)$`)))) return `create appointment ${r[1]}`;
  if ((r = m(new RegExp(`^(.+?) (?:ka |ki |wala |wali )?(?:1 |naya |new )?appointment (?:${CREATE_END}|add karo|add|karo|banado) (.+)$`)))) return `create appointment ${r[1]} ${r[2]}`;
  // --- patient registration
  if (m(new RegExp(`^(?:1 |naya |new )?(?:naya |new )?(?:mareez|patient)(?: registration| form)? (?:${ADD_END}|register karo|banao|register|kholo)$`))) return 'add patient';
  if ((r = m(new RegExp(`^(?:1 |naya |new )?(?:mareez|patient) (?:${ADD_END}|register karo|banao|register) (.+)$`)))) return `add patient ${r[1]}`;
  if ((r = m(new RegExp(`^(?:1 |naya |new )?(?:mareez|patient) (.+?) (?:ko )?(?:${ADD_END}|register karo|banao|register)$`)))) return `add patient ${r[1]}`;
  if ((r = m(new RegExp(`^(.+?) (?:naam ka |naam ki |naam wala |naam wali |ko )?(?:1 |naya |new )?(?:mareez|patient) (?:${ADD_END}|register karo|banao|register)$`)))) return `add patient ${r[1]}`;
  // --- search
  if ((r = m(/^(?:mareez |patient )?(.+?) (?:ko |naam ka mareez |naam ki mareez |naam ka patient |naam ki patient |naam ka |naam ki )?(?:dhoondo|search karo|find karo|search|search kro|dhoondh)$/))) {
    const q = stripPatient(r[1]);
    return q && q !== 'mareez' && q !== 'patient' ? `search patient ${q}` : 'search patients';
  }
  if ((r = m(/^(?:dhoondo|search karo|search) (?:mareez |patient )?(.+)$/))) return `search patient ${r[1]}`;
  // --- patient sections / records / providers
  if ((r = m(new RegExp(`^(.+?) (?:ki|ka|ke) (${SECTION_NAMES}) ${OPEN_END}$`)))) {
    const sec = SECTION_MAP[r[2]] ?? r[2];
    const who = stripPatient(r[1]);
    if (/^(?:profile|file|record|chart)$/.test(sec)) return /^(?:dr|doctor) /.test(r[1]) ? `open provider ${who}` : `open patient ${who}`;
    return `open ${who}'s ${sec}`;
  }
  if ((r = m(new RegExp(`^(?:dr|doctor) (.+?) (?:ka |ki |ke )?(?:profile )?${OPEN_END}$`)))) return `open provider ${r[1]}`;
  if ((r = m(new RegExp(`^(?:mareez|patient) (.+?) (?:ko |ka |ki )?(?:file |record |profile |chart )?${OPEN_END}$`)))) return `open patient ${stripPatient(r[1])}`;
  if ((r = m(new RegExp(`^(.+?) (?:ka |ki )?(?:mareez|patient)(?: ki file| ka record| ka profile| ka chart)? ${OPEN_END}$`)))) return `open patient ${r[1]}`;
  if ((r = m(new RegExp(`^(.+?) (?:ka |ki |ke )?(?:profile|file|record|chart) ${OPEN_END}$`)))) return `open patient ${r[1]}`;
  // --- generic forms with details
  if ((r = m(new RegExp(`^(.+?) (?:ki |ka |ke |se |wali |wala )?(${ALLERGY_LIKE}) ${ADD_END} (.+)$`)))) return `add ${FORM_ALIAS[r[2]] ?? r[2]} ${r[1]} ${r[3]}`;
  if ((r = m(new RegExp(`^(${ALLERGY_LIKE}) (?:${ADD_END}|banao|lagao|do) (.+)$`)))) return `add ${FORM_ALIAS[r[1]] ?? r[1]} ${r[2]}`;
  if ((r = m(new RegExp(`^(.+?) (?:ki |ka |ke |se |wali |wala )?(${ALLERGY_LIKE}) (?:${ADD_END}|banao|lagao)$`)))) return `add ${FORM_ALIAS[r[2]] ?? r[2]} ${r[1]}`;
  // --- field operations
  if ((r = m(/^(.+?) (?:ko |mein |field mein |field ko |field |ka |ki )?(?:saaf karo|khali karo|hatao|mitao|clear karo|delete karo|remove karo|clear|saaf|khali|nikalo)$/))) return `clear ${r[1]}`;
  if ((r = m(/^(.+?) (?:ko |par |pe |ka |ki )?(?:tick hatao|untick karo|uncheck karo|off karo|disable karo|untick|tick nikalo|band karo)$/))) return `uncheck ${r[1]}`;
  if ((r = m(/^(.+?) (?:ko |par |pe |ka |ki )?(?:tick karo|check karo|on karo|enable karo|tick|tick lagao|chalu karo|lagao)$/))) return `check ${r[1]}`;
  if ((r = m(/^(.+?) (?:field|box) (?:ko |par |pe |mein )?(?:focus karo|jao|chalo|lejao|likho|par jao|mein jao)$/))) return `focus on ${r[1]} field`;
  if ((r = m(/^(.+?) (?:mein|ke liye|ka|ki|se|for) (.+?) (?:chuno|select karo|choose karo|select|chun lo)$/)) && fieldWords().has(r[1])) return `select ${r[2]} for ${r[1]}`;
  if ((r = m(new RegExp(`^(.+) ${SET_END}$`)))) {
    const split = splitField(r[1]);
    if (split) return `set ${split[0]} to ${split[1]}`;
  }
  // --- generic navigation / open / add / create (verb-final)
  if ((r = m(new RegExp(`^(.+?)(?: page| screen| section| module| wala page| wali screen| wale page)?(?: (?:par|pe|ko|mein|tak))? ${NAV_END}$`)))) return `go to ${r[1]}`;
  if ((r = m(new RegExp(`^(.+?) (?:ko |ka |ki )?${OPEN_END}$`)))) return `${/(?:dikhao|show|dekho|dikhado|dekhna)/.test(c.slice(r[1].length)) ? 'show' : 'open'} ${r[1]}`;
  if ((r = m(new RegExp(`^${OPEN_END} (.+)$`)))) return `open ${r[1]}`;
  if ((r = m(new RegExp(`^(.+?) ${ADD_END}$`)))) return `add ${r[1]}`;
  if ((r = m(new RegExp(`^${ADD_END} (.+)$`)))) return `add ${r[1]}`;
  if ((r = m(new RegExp(`^(.+?) ${CREATE_END}$`)))) return `create ${r[1]}`;
  if ((r = m(new RegExp(`^(?:banao|create karo) (.+)$`)))) return `create ${r[1]}`;
  if ((r = m(/^(.+?) (?:bhejo|send karo)$/))) return `send the ${r[1]}`;
  return c;
}
const FORM_ALIAS: Record<string, string> = { lab: 'lab order', chhutti: 'leave', tashkhees: 'diagnosis', reminder: 'recall', 'lab results': 'lab result' };

const CLEANUP: Rule[] = [
  [/\b(?:ko|ka|ki|ke|par|mein|se|tak|hai|hoon|chahiye|ye|us|wala|zara|mujhe|ab|bhi|hi|karo|kardo|do|liye|saath)\b/g, ' '],
  [/\b1 (medication|patient|appointment|allergy|prescription|form|referral|shift|leave|diagnosis|problem|note|lab order|lab result|recall|user|provider|room|location)\b/g, 'a $1'],
  [/\bnaya\b/g, 'new'],
  [/\bdawai\b/g, 'medication'],
  [/\bmareez\b/g, 'patient'],
  [/\b(?:in the )?(morning|afternoon|evening) (\d{1,2}) (am|pm)\b/g, '$2 $3'],
  [/\bat (\d{1,2}) (am|pm) (?:in the )?(?:morning|afternoon|evening)\b/g, 'at $1 $2'],
];

const CONFIRM_TOKENS = new Set(['haan', 'ji', 'theek', 'hai', 'sahi', 'bilkul', 'zaroor', 'save', 'mehfooz', 'submit', 'karo', 'do', 'ho', 'gaya', 'ok', 'okay', 'ye', 'bhi', 'yes', 'kardo', 'kar', 'jama', 'g', 'ha', 'han', 'acha', 'accha', 'achha', 'chalega', 'chalay', 'ga', 'yeh', 'sab']);
const CONFIRM_CORE = new Set(['haan', 'ji', 'theek', 'sahi', 'bilkul', 'zaroor', 'save', 'mehfooz', 'submit', 'yes', 'ok', 'okay', 'jama', 'acha', 'accha', 'achha', 'chalega']);
const CANCEL_TOKENS = new Set(['nahi', 'na', 'no', 'cancel', 'karo', 'rehne', 'do', 'chhor', 'mat', 'roko', 'khatam', 'ye', 'wapas', 'lo', 'kardo', 'jao', 'ruk', 'bhi', 'hai', 'mansookh', 'bilkul', 'ji', 'isko', 'ise', 'chhoro', 'rakho', 'karna', 'nai']);
const CANCEL_CORE = new Set(['nahi', 'na', 'no', 'cancel', 'rehne', 'chhor', 'mat', 'roko', 'khatam', 'mansookh', 'chhoro', 'nai']);

const URDU_VERBS = /\b(?:jao|jana|chalo|kholo|dikhao|karo|kardo|daalo|likho|banao|dhoondo|rakho|hatao|bhejo|roko|band|chupao|chuno|bharo|lagao|chahiye|lejao|dekho|nikalo|save|cancel|submit|add|open|show|search|scroll|clear|select|tick|untick|register|create|book|close|set|delete|remove)\b/;
const ENGLISH_VERB_START = /^(go|goto|open|add|create|fill|search|find|navigate|show|start|save|submit|book|schedule|register|select|set|check|uncheck|scroll|close|cancel|order|prescribe|look|take|switch|new|refer|help)\b/;

function splitUrduClauses(text: string): string[] {
  const parts = text.split(/\s+(?:aur|phir|and|then|aur phir|phir uske baad)\s+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let carry = '';
  for (let i = 0; i < parts.length; i++) {
    const piece = carry ? `${carry} and ${parts[i]}` : parts[i];
    carry = '';
    const hasVerb = URDU_VERBS.test(piece) || ENGLISH_VERB_START.test(piece);
    if (!hasVerb && i < parts.length - 1) {
      carry = piece; // Urdu verbs come last: "amoxicillin aur clavulanate 500 mg likho"
      continue;
    }
    out.push(piece);
  }
  if (carry) out.push(carry);
  return out;
}

// ------------------------------------------------------------------ public API
/**
 * Translate an Urdu / Roman-Urdu utterance into the English command language the rest of the
 * pipeline understands. English input is returned unchanged with `detected: false`.
 */
export function translateUrdu(input: string): UrduTranslation {
  const trimmed = input.trim();
  if (!trimmed) return { text: input, detected: false, language: 'en' };
  let tokens = tokenize(trimmed);
  const script = tokens.some((t) => t.script);
  const detected = script || tokens.some(isUrduToken);
  if (!detected) return { text: input, detected: false, language: 'en' };
  tokens = fuzzyCanon(tokens);
  const canonical = tokens.map((t) => t.canon).filter(Boolean).join(' ');
  const language = script ? 'ur' : 'roman-ur';

  // Whole-utterance yes / no.
  const words = canonical.split(' ');
  if (words.every((w) => CONFIRM_TOKENS.has(w)) && words.some((w) => CONFIRM_CORE.has(w))) {
    return { text: words.some((w) => ['save', 'mehfooz', 'submit', 'jama'].includes(w)) ? 'save it' : 'yes', detected: true, language };
  }
  if (words.every((w) => CANCEL_TOKENS.has(w)) && words.some((w) => CANCEL_CORE.has(w))) return { text: 'cancel', detected: true, language };

  const pre = apply(canonical, PRE_SPLIT);
  const clauses = splitUrduClauses(pre).map((clause) => {
    const sub = reorderPostpositions(apply(clause, SUB_PHRASES));
    return apply(structure(sub), CLEANUP);
  });
  const text = clauses.filter(Boolean).join(' and ').replace(/\s+/g, ' ').trim();
  return { text, detected: true, language };
}
