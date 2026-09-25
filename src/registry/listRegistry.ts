/**
 * Runtime registry of the lists (data tables) on screen, so the assistant can
 * search, filter and page through whichever list the user is looking at —
 * through the same state the table's own controls change. No DOM queries.
 */
export interface ListFilter {
  key: string;
  label: string;
  options: string[];
}

export interface ListState {
  search: string;
  filters: Record<string, string>;
  page: number;
  pageCount: number;
  /** Rows after search and filters, and before. */
  shown: number;
  total: number;
}

export interface ListController {
  /** What the list holds, e.g. "patients", "medications". */
  name: string;
  filters: ListFilter[];
  searchable: boolean;
  state(): ListState;
  setSearch(query: string): void;
  /** `null` clears that filter. */
  setFilter(key: string, value: string | null): void;
  clearAll(): void;
  setPage(page: number): void;
}

class ListRegistryImpl {
  private lists: ListController[] = [];

  register(controller: ListController): () => void {
    this.lists = [...this.lists.filter((c) => c !== controller), controller];
    return () => {
      this.lists = this.lists.filter((c) => c !== controller);
    };
  }

  /** The list the user is working with: the most recently mounted one. */
  active(): ListController | undefined {
    return this.lists[this.lists.length - 1];
  }
}

export const ListRegistry = new ListRegistryImpl();
