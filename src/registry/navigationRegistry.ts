/**
 * Imperative navigation bridge. The router installs its `navigate` function
 * here so non-React code (command executor, palette) can navigate without
 * touching window.location.
 */
type NavigateFn = (to: string | number, options?: { replace?: boolean; state?: unknown }) => void;

let navigateImpl: NavigateFn | null = null;
let currentPathname = '/';

/** Scroll targets registered by pages (sections/anchors) so voice can "scroll to vitals". */
const scrollTargets = new Map<string, { label: string; element: HTMLElement }>();

export const NavigationRegistry = {
  install(fn: NavigateFn) {
    navigateImpl = fn;
  },
  setPathname(p: string) {
    currentPathname = p;
  },
  pathname: () => currentPathname,
  navigate(to: string, options?: { replace?: boolean; state?: unknown }) {
    if (!navigateImpl) throw new Error('Navigation not ready');
    navigateImpl(to, options);
  },
  back() {
    navigateImpl?.(-1);
  },
  registerScrollTarget(id: string, label: string, element: HTMLElement) {
    scrollTargets.set(id.toLowerCase(), { label, element });
    return () => scrollTargets.delete(id.toLowerCase());
  },
  scrollTo(target: string): boolean {
    const q = target.toLowerCase().trim();
    const hit =
      scrollTargets.get(q) ??
      [...scrollTargets.values()].find((t) => t.label.toLowerCase().includes(q) || q.includes(t.label.toLowerCase()));
    if (!hit) return false;
    hit.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  },
  scrollTargets: () => [...scrollTargets.entries()].map(([id, t]) => ({ id, label: t.label })),
  scrollBy(direction: 'up' | 'down' | 'top' | 'bottom') {
    const el = document.scrollingElement ?? document.documentElement;
    if (direction === 'top') el.scrollTo({ top: 0, behavior: 'smooth' });
    else if (direction === 'bottom') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollBy({ top: direction === 'down' ? window.innerHeight * 0.7 : -window.innerHeight * 0.7, behavior: 'smooth' });
  },
};
