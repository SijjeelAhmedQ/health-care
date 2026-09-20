import type { ListQuery, PaginatedResult } from '@/types/domain';

/**
 * Generic in-memory repository used by the mock service layer.
 * Real API adapters only need to satisfy the same `Repository<T>` interface,
 * so swapping mock -> HTTP is a one-line change per service.
 */
export interface Repository<T extends { id: string }> {
  list(query?: ListQuery): Promise<PaginatedResult<T>>;
  all(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(input: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

const DEFAULT_LATENCY = 180;

export const delay = (ms = DEFAULT_LATENCY) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let idCounter = 1000;
export const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function matchesSearch(item: unknown, search: string): boolean {
  const needle = search.toLowerCase();
  return Object.values(item as Record<string, unknown>).some((v) => {
    if (v == null) return false;
    if (typeof v === 'object') return matchesSearch(v, search);
    return String(v).toLowerCase().includes(needle);
  });
}

function matchesFilters<T>(item: T, filters?: ListQuery['filters']): boolean {
  if (!filters) return true;
  return Object.entries(filters).every(([key, value]) => {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return true;
    const actual = (item as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value.includes(String(actual));
    return String(actual) === String(value);
  });
}

export function createMockRepository<T extends { id: string }>(seed: T[], options?: { persistKey?: string }): Repository<T> {
  let items: T[] = loadPersisted<T>(options?.persistKey) ?? [...seed];

  const persist = () => {
    if (!options?.persistKey) return;
    try {
      // Persist only user-created/edited deltas to keep localStorage small.
      localStorage.setItem(options.persistKey, JSON.stringify(items));
    } catch {
      /* storage unavailable — ignore */
    }
  };

  return {
    async list(query = {}) {
      await delay();
      const { search, page = 1, pageSize = 10, sortBy, sortDir = 'asc', filters } = query;
      let result = items.filter((it) => matchesFilters(it, filters));
      if (search?.trim()) result = result.filter((it) => matchesSearch(it, search.trim()));
      if (sortBy) {
        result = [...result].sort((a, b) => {
          const av = (a as Record<string, unknown>)[sortBy];
          const bv = (b as Record<string, unknown>)[sortBy];
          const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
      const start = (page - 1) * pageSize;
      return { items: result.slice(start, start + pageSize), total: result.length, page, pageSize };
    },
    async all() {
      await delay(60);
      return [...items];
    },
    async get(id) {
      await delay(120);
      return items.find((it) => it.id === id);
    },
    async create(input) {
      await delay(250);
      const created = { ...input, id: input.id ?? nextId(String(input.id ?? 'rec').split('-')[0]) } as T;
      items = [created, ...items];
      persist();
      return created;
    },
    async update(id, patch) {
      await delay(250);
      const idx = items.findIndex((it) => it.id === id);
      if (idx === -1) throw new Error(`Record ${id} not found`);
      items[idx] = { ...items[idx], ...patch };
      persist();
      return items[idx];
    },
    async remove(id) {
      await delay(200);
      items = items.filter((it) => it.id !== id);
      persist();
    },
  };
}

function loadPersisted<T>(key?: string): T[] | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : null;
  } catch {
    return null;
  }
}
