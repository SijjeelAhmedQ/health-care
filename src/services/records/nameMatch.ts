/**
 * Names as speech recognition hears them: "Sara John Sun" for Sarah Johnson, "James Emil" for
 * James Ahmed. When no name matches as written, the closest spellings are the likely ones.
 */

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j];
      row[j] = cur;
    }
  }
  return row[b.length];
}

/**
 * How a name sounds, as its consonants: "James Ahmed" and "gems ml" both start J-M-S-M. Soft c/g,
 * voiced and unvoiced pairs (d/t, b/p, v/f, z/s) and silent letters are merged — the confusions
 * speech recognition makes.
 */
export function soundKey(text: string): string {
  const s = letters(text)
    .replace(/ph/g, 'f')
    .replace(/[sc]h/g, 'x')
    .replace(/th/g, '0')
    .replace(/ck/g, 'k')
    .replace(/^kn|^wr/, (m) => m[1])
    .replace(/c(?=[eiy])/g, 's')
    .replace(/g(?=[eiy])/g, 'j')
    .replace(/[cq]/g, 'k')
    .replace(/g/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'f')
    .replace(/d/g, 't')
    .replace(/b/g, 'p')
    .replace(/[aeiouhwy]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

const similarity = (a: string, b: string) => (a && b ? 1 - editDistance(a, b) / Math.max(a.length, b.length) : 0);

/**
 * 1 = the same, 0 = nothing alike: the better of spelling ("John Sun" = "Johnson", spacing and
 * punctuation ignored) and sound ("gems ml" ≈ "James Ahmed").
 */
export function nameSimilarity(heard: string, name: string): number {
  return Math.max(similarity(letters(heard), letters(name)), similarity(soundKey(heard), soundKey(name)));
}

export interface SoundAlike<T> {
  item: T;
  score: number;
}

/**
 * The items whose name is spelled close to what was heard, best first. `strong` is set when one
 * stands out: close enough to be meant, and clearly closer than the next.
 */
export function soundAlikes<T>(heard: string, items: T[], nameOf: (item: T) => string, min = 0.6): { matches: SoundAlike<T>[]; strong?: T } {
  const matches = items
    .map((item) => ({ item, score: nameSimilarity(heard, nameOf(item)) }))
    .filter((m) => m.score >= min)
    .sort((x, y) => y.score - x.score);
  const [best, next] = matches;
  const strong = best && best.score >= 0.75 && (!next || best.score - next.score >= 0.1) ? best.item : undefined;
  return { matches, strong };
}
