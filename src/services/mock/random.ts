/** Deterministic PRNG so mock data is stable between reloads (mulberry32). */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number, decimals = 1) => Number((next() * (max - min) + min).toFixed(decimals)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    pickMany: <T>(arr: readonly T[], count: number): T[] => {
      const copy = [...arr];
      const out: T[] = [];
      while (out.length < count && copy.length) {
        out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
      }
      return out;
    },
    bool: (probability = 0.5) => next() < probability,
    weighted: <T>(entries: Array<[T, number]>): T => {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [value, w] of entries) {
        r -= w;
        if (r <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
}

export type Rng = ReturnType<typeof createRng>;

export const pad = (n: number, width = 2) => String(n).padStart(width, '0');
