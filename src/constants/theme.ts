/**
 * DonorNet design tokens — the single source of truth for color, type, spacing,
 * radius, and elevation. See design.md. Never hardcode values outside this file.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Brand — deep crimson tuned so onBrand text meets WCAG AA (≥4.5:1).
    brand: '#C42F38',
    brandStrong: '#A82730',
    brandSubtle: '#FEEBEC',
    brandDeep: '#151A36',
    /** Text/icons on `brand`/accent fills. Flips to ink in dark mode. */
    onBrand: '#FFFFFF',
    // Surfaces
    background: '#FBFBFC',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceSunken: '#F4F4F6',
    // Text
    text: '#16192D',
    textSecondary: '#596078',
    textTertiary: '#6C7288',
    /** Text/icons on `brandDeep` and other permanently dark panels. Always white. */
    onColor: '#FFFFFF',
    /** Secondary text on permanently dark panels. */
    onColorSecondary: 'rgba(255,255,255,0.85)',
    /** Hints/captions on permanently dark panels. */
    onColorTertiary: 'rgba(255,255,255,0.70)',
    /** Hairlines, ghost borders, progress tracks on permanently dark panels. */
    onColorFaint: 'rgba(255,255,255,0.24)',
    // Lines
    border: '#E8E9F0',
    borderStrong: '#D5D8E4',
    // Status — each passes AA both as a fill under onBrand and as text on its subtle tint.
    success: '#1B7A4B',
    successSubtle: '#E7F6EC',
    /** Text/icons on a `success` fill. Flips to ink in dark mode, like onBrand. */
    onSuccess: '#FFFFFF',
    warning: '#B45309',
    warningSubtle: '#FEF3E2',
    danger: '#D2262D',
    dangerSubtle: '#FEEBEC',
    info: '#2563EB',
    infoSubtle: '#E8F1FE',
    /** Decorative fourth accent for console metric tiles. Never a status. */
    accent: '#7A5AF8',
    accentSubtle: '#EFECFE',
    /** Cast under a brand-filled primary action. Brand-tinted, never grey ink. */
    brandGlow: 'rgba(196, 47, 56, 0.28)',
    /** Console welcome banner wash, left to right. */
    heroFrom: '#FDEDF0',
    heroVia: '#F2F3FD',
    heroTo: '#FFFFFF',
  },
  dark: {
    // Brand — light coral accent; dark ink label on top (iOS-style flip) for ~7:1.
    brand: '#FF777B',
    brandStrong: '#F05C64',
    brandSubtle: '#2A1416',
    brandDeep: '#0E1125',
    /** Text/icons on `brand`/accent fills. Ink, not white — white fails AA on light coral. */
    onBrand: '#1F0A0B',
    // Surfaces
    background: '#08080A',
    surface: '#131316',
    surfaceElevated: '#1B1B1F',
    surfaceSunken: '#0E0E11',
    // Text
    text: '#F7F7FB',
    textSecondary: '#A5A8BC',
    textTertiary: '#8A8EA5',
    /** Text/icons on `brandDeep` and other permanently dark panels. Always white. */
    onColor: '#FFFFFF',
    /** Secondary text on permanently dark panels. */
    onColorSecondary: 'rgba(255,255,255,0.85)',
    /** Hints/captions on permanently dark panels. */
    onColorTertiary: 'rgba(255,255,255,0.70)',
    /** Hairlines, ghost borders, progress tracks on permanently dark panels. */
    onColorFaint: 'rgba(255,255,255,0.24)',
    // Lines
    border: '#282B3D',
    borderStrong: '#3A3E54',
    // Status
    success: '#3DD68C',
    successSubtle: '#0F2318',
    /** Text/icons on a `success` fill. Ink, not white — white fails AA on mint. */
    onSuccess: '#06180F',
    warning: '#F5A524',
    warningSubtle: '#291A08',
    danger: '#F16A6F',
    dangerSubtle: '#2A1416',
    info: '#5B9DFF',
    infoSubtle: '#0C1B33',
    /** Decorative fourth accent for console metric tiles. Never a status. */
    accent: '#A78BFA',
    accentSubtle: '#1C1733',
    /** Cast under a brand-filled primary action. Brand-tinted, never grey ink. */
    brandGlow: 'rgba(255, 119, 123, 0.26)',
    /** Console welcome banner wash, left to right. */
    heroFrom: '#20141A',
    heroVia: '#141527',
    heroTo: '#131316',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemeColors = typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
})!;

/** 4px base grid. Never use raw spacing numbers in components. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 56,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  full: 999,
} as const;

/**
 * Soft, low-spread elevation via cross-platform `boxShadow` (New Architecture).
 * The old `shadow*` + `elevation` pair rendered as harsh dark system shadows on
 * Android (where `shadow*` is ignored and only `elevation` draws); boxShadow
 * renders these exact soft values identically on iOS, Android 9+, and web.
 */
export const Shadow = {
  none: { boxShadow: undefined },
  sm: { boxShadow: '0 1px 3px rgba(22, 25, 45, 0.06)' },
  md: { boxShadow: '0 4px 12px rgba(22, 25, 45, 0.08)' },
  lg: { boxShadow: '0 10px 28px rgba(22, 25, 45, 0.12)' },
} as const;

/** Standard reanimated spring for press + entrance motion. */
export const Spring = { damping: 18, stiffness: 200, mass: 0.9 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

/**
 * Bottom scroll-content clearance on tab screens: the floating AppTabBar
 * (~70pt bar + 16pt host padding) plus breathing room. Add `insets.bottom`.
 */
export const TabBarClearance = 120;
export const MaxContentWidth = 640;

/**
 * Content width for the web-only operations console. Separate from
 * `MaxContentWidth` on purpose: 640 is phone-tuned and every donor screen keeps
 * it, but a six-column moderation table is unreadable at that width. The admin
 * shell is the only consumer, and `TabBarClearance` does not apply there — the
 * console has no tab bar.
 */
export const AdminMaxWidth = 1200;
