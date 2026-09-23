import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useLocation } from 'react-router-dom';
import { Grid } from 'antd';
import { useAppDispatch } from '@/store';
import { navigationActions } from '@/store/slices/navigationSlice';
import { PageRegistry } from '@/registry/pageRegistry';
import { NavigationRegistry } from '@/registry/navigationRegistry';

export { useRegisteredForm, type EntryStore } from './useRegisteredForm';

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

/** Tiny data-fetching hook for pages not (yet) backed by a Redux slice. */
export function useAsyncData<T>(fetcher: () => Promise<T>, deps: DependencyList = []): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((res) => active && setData(res))
      .catch((e: Error) => active && setError(e.message || 'Failed to load'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setDataSafe = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setData((prev) => (typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater));
  }, []);
  return { data, loading, error, reload, setData: setDataSafe };
}

/** Publishes the current page into navigation state + document title. */
export function usePageTracking() {
  const location = useLocation();
  const dispatch = useAppDispatch();
  useEffect(() => {
    const page = PageRegistry.matchPath(location.pathname);
    NavigationRegistry.setPathname(location.pathname);
    dispatch(navigationActions.setCurrentPage({ pageId: page?.id ?? null, path: location.pathname, title: page?.title ?? '' }));
    document.title = page ? `${page.title} · CareFlow PMS` : 'CareFlow PMS';
  }, [location.pathname, dispatch]);
}

export function useResponsive() {
  const screens = Grid.useBreakpoint();
  return {
    isMobile: screens.md === false,
    isTablet: screens.md === true && screens.lg === false,
    isDesktop: screens.lg === true,
    screens,
  };
}

/** Register a page section so voice can "scroll to vitals". */
export function useScrollSection(id: string, label: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const unregister = NavigationRegistry.registerScrollTarget(id, label, ref.current);
    return () => {
      unregister();
    };
  }, [id, label]);
  return ref;
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set];
}
