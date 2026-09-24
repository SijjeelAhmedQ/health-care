/**
 * Spoken Inbox commands, voice on/off and patient-by-position, read
 * deterministically.
 *
 * Kept apart from the general interpreter because the Inbox has a vocabulary of
 * its own ("file this", "open the second referral", "next one") that must not
 * leak into other modules: most of these rules only apply while the Inbox is
 * the page on screen. Like the rest of the interpreter, this only produces
 * structured commands — it never touches the UI.
 */
import type { AICommand, AIContext, InboxTarget } from '@/types/ai';
import type { InboxView } from '@/services/inbox/inboxModel';

export const isInboxPage = (pageId: string | null | undefined) => !!pageId && (pageId === 'inbox' || pageId.startsWith('inbox-'));

// ---- vocabulary -------------------------------------------------------------

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, forth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** "first", "2nd", "3", "last" … */
const ORD = `(first|second|third|fourth|forth|fifth|sixth|seventh|eighth|ninth|tenth|last|\\d{1,3}(?:st|nd|rd|th)?)`;
/** "one", "3" … (after "number") */
const NUM = `(one|two|three|four|five|six|seven|eight|nine|ten|\\d{1,3})`;

function toPosition(word: string): number | 'last' | undefined {
  const w = word.toLowerCase();
  if (w === 'last') return 'last';
  if (ORDINAL_WORDS[w]) return ORDINAL_WORDS[w];
  if (NUMBER_WORDS[w]) return NUMBER_WORDS[w];
  const n = Number(w.replace(/(?:st|nd|rd|th)$/, ''));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Spoken names for each Inbox category. */
const CATEGORY_WORDS: Array<[RegExp, Exclude<InboxView, 'all'>]> = [
  [/^(?:lab(?:oratory)?s?(?:\s+(?:results?|reports?|tests?|records?|items?))?|pathology(?:\s+results?)?)$/, 'lab'],
  [/^(?:radiology(?:\s+(?:reports?|results?|records?|items?))?|rads?(?:\s+(?:reports?|results?|records?|items?))?|imaging(?:\s+reports?)?|x-?rays?|scans?)$/, 'radiology'],
  [/^(?:referrals?(?:\s+(?:letters?|records?|items?))?)$/, 'referral'],
  [/^(?:discharges?(?:\s+(?:summar(?:y|ies)|letters?|records?|items?))?)$/, 'discharge'],
];
const CAT =
  '(lab(?:oratory)?s?(?:\\s+(?:results?|reports?|tests?|records?|items?))?|pathology(?:\\s+results?)?|radiology(?:\\s+(?:reports?|results?|records?|items?))?|rads?(?:\\s+(?:reports?|results?|records?|items?))?|imaging(?:\\s+reports?)?|x-?rays?|scans?|referrals?(?:\\s+(?:letters?|records?|items?))?|discharges?(?:\\s+(?:summar(?:y|ies)|letters?|records?|items?))?)';

export function categoryOf(phrase: string | undefined): Exclude<InboxView, 'all'> | undefined {
  if (!phrase) return undefined;
  const p = phrase.trim().toLowerCase();
  return CATEGORY_WORDS.find(([re]) => re.test(p))?.[1];
}

/** Words that name "a row in the list". */
const NOUN = '(?:records?|items?|results?|reports?|messages?|entr(?:y|ies)|ones?|documents?|letters?)';
/** Longest first: the open rule takes whatever follows the verb, so "show" must not win over "show me". */
const OPEN_VERB = '(?:show me|open up|open|show|view|read|display|select|go to|goto|pull up|bring up|load|look at|check)';
const VIEW_VERB = '(?:show|show me|open|go to|goto|switch to|view|display|take me to|bring up|filter(?: by| to)?|only show|see|list)';
const THIS = '(?:this|it|that|this one|that one|the one|this (?:record|item|result|report)|the (?:record|item)|the (?:current|open|selected) (?:record|item|one)|current (?:record|item))';

/** Politeness and fillers in front of a command: "can you open the first record". */
const stripLead = (t: string) => t.replace(/^(?:(?:can you|could you|would you|will you|i want to|i'd like to|i would like to|let's|lets|now|and|then|ok|okay|alright|so|just)\s+)+/, '').trim();

/** What the speech engine reliably mishears in the Inbox — only fixed while the Inbox is on screen. */
function correctInboxSpeech(t: string): string {
  return t
    .replace(/^(?:un|on|an|in)[\s-]+file\b/, 'unfile')
    .replace(/^(?:unfold|un-file|unfiled)\b(?!$)/, 'unfile')
    .replace(/^(?:fail|filed)\s+(?=this|it|that|the|record|first|second|third|number)/, 'file ')
    .replace(/\bx ray\b|\bxray\b/g, 'x-ray');
}

// ---- voice on / off ---------------------------------------------------------

const STOP_RE =
  /^(?:stop listening|stop voice(?: mode| control| input)?|stop (?:the )?(?:mic|microphone)|(?:mic|microphone) off|turn (?:off|of) (?:the )?(?:mic|microphone|voice)|turn (?:the )?(?:mic|microphone|voice) off|switch off (?:the )?(?:mic|microphone)|cancel voice(?: mode| input| control)?|exit voice(?: mode| control)?|end voice(?: mode)?|leave voice mode|voice off|disable voice|quit voice|stop talking|go to sleep|that's all|that is all)$/;
const START_RE = /^(?:start listening|(?:mic|microphone) on|turn on (?:the )?(?:mic|microphone|voice)|turn (?:the )?(?:mic|microphone) on|start voice(?: mode| control)?|voice on)$/;

/**
 * "Stop listening", "mic off", "exit voice mode". A bare "stop" turns the
 * microphone off too — except while something is waiting for an answer, where
 * it keeps meaning "cancel that".
 */
export function interpretVoiceControl(t: string, ctx: AIContext): AICommand | null {
  if (STOP_RE.test(t)) return { action: 'stop_listening' };
  if (START_RE.test(t)) return { action: 'start_listening' };
  if (/^stop(?: it| now)?$/.test(t) && !ctx.awaitingConfirmation && !ctx.pendingSlot && !ctx.openFormId) return { action: 'stop_listening' };
  return null;
}

// ---- patient by position ----------------------------------------------------

/**
 * "Open the first patient", "select patient number two" — and, on the patient
 * list, "open the first one". "Open patient" on its own picks the single match
 * of the current search (and refuses when there are several).
 */
export function interpretPatientPosition(t: string, ctx: AIContext): AICommand | null {
  const s = stripLead(t);
  const onPatients = ctx.currentPageId === 'patients';
  const explicit = s.match(new RegExp(`^(?:open|select|choose|pick|use|load|show)(?: the)? ${ORD} patient$`)) ?? s.match(new RegExp(`^(?:open|select|choose|pick|use|load|show)(?: the)? patient (?:number |no\\.? )?${NUM}$`));
  const onList = onPatients ? s.match(new RegExp(`^(?:open|select|choose|pick|use|load)(?: the)? ${ORD}(?: (?:one|match|result|row|person))?$`)) : null;
  const hit = explicit ?? onList;
  if (hit) {
    const pos = toPosition(hit[1]);
    if (pos === 'last' || pos === undefined) return null;
    return { action: 'select_patient_at', position: pos };
  }
  if (onPatients && /^(?:open|select|choose|use|pick)(?: (?:this|that|the))? (?:patient|one)$/.test(s)) return { action: 'select_patient_at', position: 1, single: true };
  return null;
}

/** True when a short utterance is a complete Inbox or voice command ("next", "file it") and must not wait for more speech. */
export function isCompleteShortCommand(normalized: string, ctx: AIContext): boolean {
  return !!interpretVoiceControl(normalized, ctx) || (isInboxPage(ctx.currentPageId) && !!interpretInboxClause(normalized, ctx));
}

// ---- inbox ------------------------------------------------------------------

/** Parse the part of a sentence that names which record: "this", "the second referral", "record number 3". */
function parseTarget(rest: string): { target: InboxTarget; category?: InboxView } | null {
  const r = rest.trim().replace(/^the\s+/, '');
  if (!r || new RegExp(`^${THIS}$`).test(rest.trim()) || /^(?:record|item|one)$/.test(r)) return { target: 'this' };
  let m = r.match(new RegExp(`^${ORD}(?:\\s+(?:${CAT}|${NOUN}))?(?:\\s+(?:record|item|one|in the list|on the list))?$`));
  if (m) {
    const pos = toPosition(m[1]);
    if (pos !== undefined) return { target: pos, category: categoryOf(m[2]) };
  }
  m = r.match(new RegExp(`^(?:(${CAT.slice(1, -1)})|${NOUN})\\s+(?:number\\s+|no\\.?\\s+|#\\s*)?(?:${ORD}|${NUM})$`));
  if (m) {
    const pos = toPosition(m[2] ?? m[3]);
    if (pos !== undefined) return { target: pos, category: categoryOf(m[1]) };
  }
  m = r.match(new RegExp(`^(?:number|no\\.?|#)\\s*${NUM}$`));
  if (m) {
    const pos = toPosition(m[1]);
    if (pos !== undefined) return { target: pos };
  }
  return null;
}

/** Search text → the category it names (if any) and the words left to search for. */
export function parseInboxSearch(raw: string): { query: string; view?: InboxView } {
  let q = raw
    .trim()
    .replace(/^(?:the\s+)?(?:inbox\s+)?(?:for\s+)?/, '')
    .replace(/\s+(?:in|on) (?:the )?inbox$/, '')
    .replace(/["“”]/g, '')
    .trim();
  // An X-ray is one kind of radiology report: search for it rather than just opening the category.
  if (/^x-?rays?$/.test(q)) return { query: 'x-ray', view: 'radiology' };
  const whole = categoryOf(q);
  if (whole) return { query: '', view: whole };

  let view: InboxView | undefined;
  // "cardiology referral", "blood lab results"
  const tail = q.match(new RegExp(`^(.+?)\\s+${CAT}$`));
  // "referrals to cardiology", "lab results for john smith"
  const head = q.match(new RegExp(`^${CAT}\\s+(?:for|about|to|from|with|of|named|called|mentioning)?\\s*(.+)$`));
  if (tail && categoryOf(tail[2])) {
    view = categoryOf(tail[2]);
    q = tail[1];
  } else if (head && categoryOf(head[1])) {
    view = categoryOf(head[1]);
    q = head[2];
  }
  // "blood test" is a lab: search the lab queue for "blood".
  const test = q.match(/^(.+?)\s+tests?$/);
  if (test && !/\b(?:function|liver|kidney|urine)\b/.test(test[1])) {
    view = view ?? 'lab';
    q = test[1];
  }
  if (!view && /\b(?:mri|ct|x-ray|ultrasound|mammogra\w*|pet scan)\b/.test(q)) view = 'radiology';
  q = q.replace(/\b(?:results?|reports?|records?|items?)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { query: q, view };
}

/** Anything spoken outside the Inbox that is clearly about Inbox content. */
const INBOX_CUE = /\b(?:inbox|lab(?:oratory)?s?|radiology|rad|imaging|referrals?|discharge|mri|ct scan|x-ray|ultrasound|blood tests?|scans?)\b/;

/**
 * Commands that work from anywhere: "show lab", "open referrals", "show all
 * inbox items", and a search that is plainly about results ("search MRI").
 * Everything else only means something while the Inbox is on screen.
 */
export function interpretGlobalInbox(t: string): AICommand | null {
  const s = correctInboxSpeech(stripLead(t));
  const view = s.match(new RegExp(`^${VIEW_VERB}\\s+(?:the\\s+|my\\s+|all\\s+)?${CAT}(?:\\s+(?:inbox|tab|queue|category|items|folder|section|list|records))?$`));
  if (view && categoryOf(view[1])) return { action: 'inbox_view', view: categoryOf(view[1])! };
  if (new RegExp(`^${VIEW_VERB}\\s+(?:all|every|everything in)(?: the| my)? inbox(?: items| records)?$|^${VIEW_VERB}\\s+(?:all|every)(?: the)? (?:items|records) in (?:the |my )?inbox$`).test(s)) return { action: 'inbox_view', view: 'all' };
  const search = s.match(/^(?:search(?: for)?|find|look for|look up|lookup)\s+(?:the\s+)?(?:inbox\s+)?(?:for\s+)?(.+)$/);
  if (search && INBOX_CUE.test(search[1]) && !/^patients?\b/.test(search[1])) {
    const parsed = parseInboxSearch(search[1]);
    return { action: 'inbox_search', query: parsed.query, ...(parsed.view ? { view: parsed.view } : {}) };
  }
  return null;
}

/**
 * Commands that only make sense with the Inbox on screen. Returns null when the
 * sentence is not an Inbox command, so the general interpreter can try it.
 */
export function interpretInboxClause(t: string, ctx: AIContext): AICommand[] | null {
  if (!isInboxPage(ctx.currentPageId)) return null;
  const s = correctInboxSpeech(stripLead(t));
  if (!s) return null;

  // --- whose items: "show this patient's items" / "show all patients" / "select this patient" ---
  if (/^(?:(?:show|only show|show only|just show|filter(?: by| to)?|limit(?: it)? to)(?: me)?(?: the)? )?(?:this|the (?:selected|current)|my) patient(?:'?s)?(?: (?:items|records|inbox|results))?(?: only)?$/.test(s)) {
    return [{ action: 'inbox_scope', scope: 'patient' }];
  }
  if (/^(?:(?:show|show me|include|go back to)(?: the)? )?(?:all|every|everyone'?s?|every patient'?s?)(?: the)? (?:patients?'?s?|patients' items)(?: (?:items|records|inbox))?$|^(?:show )?everyone'?s? (?:items|records|inbox)$|^(?:clear|remove|drop)(?: the)? patient (?:filter|scope)$/.test(s)) {
    return [{ action: 'inbox_scope', scope: 'all' }];
  }
  if (/^(?:select|choose|use|pick|switch to|work on)\s+(?:this|that|the record'?s|this record'?s|its)\s+patient$|^make (?:this|that|them|this patient) the (?:selected|current) patient$/.test(s)) {
    return [{ action: 'inbox_select_patient' }];
  }

  // --- categories: "show lab", "all inbox items" ---
  const global = interpretGlobalInbox(s);
  if (global && global.action === 'inbox_view') return [global];
  const bareCategory = categoryOf(s);
  if (bareCategory) return [{ action: 'inbox_view', view: bareCategory }];
  if (new RegExp(`^(?:${VIEW_VERB}\\s+)?(?:all|everything|all items|all records|all categories|all inbox|all (?:the )?inbox items|the whole inbox)$`).test(s)) return [{ action: 'inbox_view', view: 'all' }];

  // --- search ---
  if (/^(?:clear|reset|remove|cancel|delete|erase|empty|undo)\s+(?:the\s+)?(?:inbox\s+)?(?:search(?:es)?|search box|search text|query|filters?|search and filters)$|^(?:show|see) (?:everything|all items) again$|^(?:stop|end) search(?:ing)?$|^no search$/.test(s)) {
    return [{ action: 'inbox_clear_search' }];
  }
  const search = s.match(/^(?:search(?: the inbox| inbox)?(?: for)?|find(?: me)?|look for|look up|lookup|filter(?: by| for)?)\s+(.+)$/);
  if (search && !/^patients?\b/.test(search[1])) {
    const parsed = parseInboxSearch(search[1]);
    if (!parsed.query && !parsed.view) return [{ action: 'respond', message: 'What should I search for? Say "search" followed by a test, patient or sender — for example "search blood test".' }];
    return [{ action: 'inbox_search', query: parsed.query, ...(parsed.view ? { view: parsed.view } : {}) }];
  }
  if (/^search(?: the)?(?: inbox)?$/.test(s)) return [{ action: 'respond', message: 'What should I search for? Say "search" followed by a test, patient or sender — for example "search blood test".' }];

  // --- close ---
  if (new RegExp(`^(?:close|hide|dismiss|exit|leave|shut)(?:\\s+${THIS})?(?:\\s+(?:${NOUN}|${CAT}))?$|^(?:go )?back to (?:the )?(?:list|inbox|queue)$`).test(s)) return [{ action: 'inbox_close' }];

  // --- unfile (checked before file: "unfile" contains "file") ---
  const unfile =
    s.match(/^(?:unfile|refile|restore)\b\s*(.*)$/) ??
    s.match(/^(?:remove|take|pull)\s*(.*?)\s*(?:from|out of)\s+(?:the\s+)?filed(?:\s+(?:items|list|queue|folder))?$/) ??
    s.match(/^(?:mark|set)\s*(.*?)\s*(?:as|to)\s+(?:unfiled|not filed|un-?reviewed|not reviewed|unread|new)$/) ??
    s.match(/^(?:move|put|send)\s*(.*?)\s*back(?:\s+(?:to|in|into)\s+(?:the\s+)?(?:unfiled(?: queue)?|inbox|queue|list))?$/);
  if (unfile) {
    const which = parseTarget(unfile[1] ?? '');
    if (which) return [{ action: 'inbox_file', file: false, target: which.target, ...(which.category ? { category: which.category } : {}) }];
  }

  // --- file ---
  const file =
    s.match(/^(?:file|archive)(?:\s+away)?\b\s*(.*)$/) ??
    s.match(/^(?:mark|set)\s*(.*?)\s*(?:as|to)\s+(?:filed|reviewed|done|complete|completed|read)$/) ??
    s.match(/^(?:put|move|send)\s*(.*?)\s*(?:in|into|to)\s+(?:the\s+)?filed(?:\s+(?:items|list|queue|folder))?$/);
  if (file) {
    const which = parseTarget(file[1] ?? '');
    if (which) return [{ action: 'inbox_file', file: true, target: which.target, ...(which.category ? { category: which.category } : {}) }];
  }

  // --- open: next / previous ---
  const step = s.match(new RegExp(`^(?:(?:${OPEN_VERB}|go to|move to|go|skip to)\\s+)?(?:the\\s+)?(next|previous|prev|following|prior|last)(?:\\s+(?:${CAT}|${NOUN}))?$`));
  if (step) {
    const word = step[1];
    const target: InboxTarget = word === 'last' ? 'last' : /^(?:next|following)$/.test(word) ? 'next' : 'previous';
    const category = categoryOf(step[2]);
    return [{ action: 'inbox_open', target, ...(category ? { category } : {}) }];
  }

  // --- open: "open this", "open the second referral", "record number 3" ---
  const open = s.match(new RegExp(`^(?:${OPEN_VERB}\\s+)(.+)$`));
  if (open) {
    const which = parseTarget(open[1]);
    if (which) return [{ action: 'inbox_open', target: which.target, ...(which.category ? { category: which.category } : {}) }];
  }
  // A position on its own: "second one", "record 3", "the third lab".
  const bare = parseTarget(s);
  if (bare && bare.target !== 'this') return [{ action: 'inbox_open', target: bare.target, ...(bare.category ? { category: bare.category } : {}) }];

  return null;
}
