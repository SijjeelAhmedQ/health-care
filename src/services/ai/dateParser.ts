import dayjs, { type Dayjs } from 'dayjs';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, thirty: 30 };

export interface ParsedDateTime {
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  /** Transcript with the date/time phrases removed. */
  rest: string;
}

/**
 * Extract a spoken date and/or time from a phrase. Deterministic and
 * intentionally conservative — unknown phrases are left in `rest`.
 */
export function parseDateTime(input: string, now: Dayjs = dayjs()): ParsedDateTime {
  let text = ` ${input.toLowerCase()} `;
  let date: Dayjs | undefined;
  let time: string | undefined;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(m[0], ' ');
    }
  };

  // ---- relative days ----
  take(/\bday after tomorrow\b/, () => (date = now.add(2, 'day')));
  take(/\btomorrow\b/, () => (date = date ?? now.add(1, 'day')));
  take(/\btoday\b/, () => (date = date ?? now));
  take(/\byesterday\b/, () => (date = date ?? now.subtract(1, 'day')));
  take(/\bin (\d+|[a-z]+) (day|week|month)s?\b/, (m) => {
    const n = Number.isNaN(Number(m[1])) ? NUM_WORDS[m[1]] : Number(m[1]);
    if (n) date = now.add(n, m[2] as 'day' | 'week' | 'month');
  });
  take(/\b(?:next|this|on|coming)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/, (m) => {
    const target = WEEKDAYS.indexOf(m[1]);
    let d = now.day(target);
    if (!d.isAfter(now, 'day') || m[0].includes('next')) d = d.add(d.isAfter(now, 'day') && m[0].includes('next') ? 7 : d.isAfter(now, 'day') ? 0 : 7, 'day');
    date = d;
  });
  // "september 25", "25th of september", "sep 25th 2026"
  take(/\b(?:on )?(\d{1,2})(?:st|nd|rd|th)?(?: of)? (january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?: (\d{4}))?\b/, (m) => {
    const month = MONTHS.findIndex((mm) => mm.startsWith(m[2].slice(0, 3)));
    date = dayjs(`${m[3] ?? now.year()}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  });
  take(/\b(?:on )?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?\b/, (m) => {
    const month = MONTHS.findIndex((mm) => mm.startsWith(m[1].slice(0, 3)));
    date = dayjs(`${m[3] ?? now.year()}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`);
  });
  // numeric 9/25 or 2026-09-25
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => (date = dayjs(m[0])));
  take(/\b(?:on )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
    const year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : String(now.year());
    date = dayjs(`${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`);
  });

  // ---- time ----
  take(/\b(?:at )?noon\b/, () => (time = '12:00'));
  take(/\b(?:at )?midnight\b/, () => (time = '00:00'));
  take(/\b(?:at )?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/, (m) => {
    let h = Number(m[1]) % 12;
    if (m[3].startsWith('p')) h += 12;
    time = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
  });
  take(/\b(?:at )?(\d{1,2})\s*o'?clock\b/, (m) => {
    const h = Number(m[1]);
    time = `${String(h < 8 ? h + 12 : h).padStart(2, '0')}:00`; // business hours heuristic
  });
  take(/\bat (\d{1,2}):(\d{2})\b/, (m) => (time = `${m[1].padStart(2, '0')}:${m[2]}`));
  take(/\b(?:in the )?(morning|afternoon|evening)\b/, (m) => {
    if (!time) time = m[1] === 'morning' ? '09:00' : m[1] === 'afternoon' ? '14:00' : '17:00';
  });

  return {
    date: date?.isValid() ? date.format('YYYY-MM-DD') : undefined,
    time,
    rest: text.replace(/\s+/g, ' ').trim(),
  };
}

/** Convert "32 years old" / "aged 32" into an approximate ISO date of birth. */
export function ageToDob(age: number, now: Dayjs = dayjs()): string {
  return now.subtract(age, 'year').startOf('year').add(6, 'month').format('YYYY-MM-DD');
}
