/**
 * The console's theme preference. Light by default, independent of the OS.
 *
 * Staff work long daylight sessions in a dense table, where the donor app's
 * follow-the-system behavior is the wrong default: a phone set to dark at night
 * should not hand an operator a dark spreadsheet the next morning. So the
 * console pins light and offers an explicit toggle, rather than inheriting.
 *
 * The choice is per-browser, which is why it lives in `localStorage` and not on
 * the account: it is a display preference for the machine in front of the
 * operator, not a property of who they are.
 *
 * `localStorage` is an external store, so it is read through
 * `useSyncExternalStore` rather than copied into state inside an effect. That
 * is what makes the preference survive server rendering: `getServerSnapshot`
 * returns the default, so the markup the server produced and the client's first
 * paint agree, and the stored value is applied in the same commit instead of as
 * a second render. It also makes the toggle consistent across tabs for free —
 * the `storage` event is just another source of change.
 *
 * Every read is guarded: Safari in private mode throws on access rather than
 * returning null.
 *
 * Web-only, like every module in this directory.
 */
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';

import { SchemeOverride, type Scheme } from '@/hooks/use-theme';

const STORAGE_KEY = 'donornet.admin.scheme';
const DEFAULT_SCHEME: Scheme = 'light';

const listeners = new Set<() => void>();
/**
 * `useSyncExternalStore` compares snapshots by identity and re-renders until
 * two agree, so the snapshot must be a cached value and not a fresh read of
 * storage on every call.
 */
let snapshot: Scheme | null = null;

function read(): Scheme {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw === 'dark' ? 'dark' : raw === 'light' ? 'light' : DEFAULT_SCHEME;
  } catch {
    return DEFAULT_SCHEME;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab writing the key is a real change to the same store.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = null;
    emit();
  };
  globalThis.addEventListener?.('storage', onStorage);

  return () => {
    listeners.delete(onChange);
    globalThis.removeEventListener?.('storage', onStorage);
  };
}

function getSnapshot(): Scheme {
  snapshot ??= read();
  return snapshot;
}

/** The server has no storage, so it always renders the default. */
function getServerSnapshot(): Scheme {
  return DEFAULT_SCHEME;
}

function write(next: Scheme) {
  snapshot = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // A browser that refuses storage still gets a working toggle for this
    // session; only persistence is lost.
  }
  emit();
}

const ConsoleThemeContext = createContext<{ scheme: Scheme; toggle: () => void }>({
  scheme: DEFAULT_SCHEME,
  toggle: () => {},
});

export function useConsoleTheme() {
  return useContext(ConsoleThemeContext);
}

export function ConsoleThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => write(getSnapshot() === 'light' ? 'dark' : 'light'), []);

  return (
    <ConsoleThemeContext.Provider value={{ scheme, toggle }}>
      <SchemeOverride scheme={scheme}>{children}</SchemeOverride>
    </ConsoleThemeContext.Provider>
  );
}
