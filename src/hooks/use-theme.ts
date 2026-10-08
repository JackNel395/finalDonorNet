/**
 * Resolves the active theme. Returns the color map plus the scheme name and a
 * convenience `isDark` flag for elevation adjustments.
 * https://docs.expo.dev/guides/color-schemes/
 */

import { createContext, createElement, useContext, type ReactNode } from 'react';

import { Colors, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type Scheme = 'light' | 'dark';

/**
 * A subtree may pin its own scheme instead of following the OS. `null` — the
 * default everywhere — means "follow the system", so every donor screen is
 * untouched by this: with no provider above it, `useScheme()` resolves exactly
 * as it did before.
 *
 * The one consumer is the web-only operations console, which defaults to light
 * regardless of the OS: staff work long daylight sessions in a dense table, and
 * the donor app's dark-at-night behavior is the wrong default for that. It
 * stays overridable — the console ships a toggle.
 */
const SchemeOverrideContext = createContext<Scheme | null>(null);

export function SchemeOverride({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  return createElement(SchemeOverrideContext.Provider, { value: scheme }, children);
}

export function useScheme(): Scheme {
  const override = useContext(SchemeOverrideContext);
  const scheme = useColorScheme();
  if (override) return override;
  return scheme === 'dark' ? 'dark' : 'light';
}

export function useTheme(): ThemeColors & { scheme: Scheme; isDark: boolean } {
  const scheme = useScheme();
  return { ...(Colors[scheme] as ThemeColors), scheme, isDark: scheme === 'dark' };
}
