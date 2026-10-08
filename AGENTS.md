# DonorNet project guidance

## Design system

Before making user-facing UI changes, read [design-system/README.md](design-system/README.md) and the sections relevant to the work. The system is grounded in the existing Expo Router app, not a replacement styling framework.

- Tokens live in `src/constants/theme.ts`; use `Colors`, `Spacing`, `Radius`, `Shadow`, `Spring`, and layout constants rather than adding literal visual values.
- Read `design-system/COMPONENTS.md` before introducing UI. Reuse `src/components/ui` primitives and compose them; do not fork visual variants in screens.
- Use `ThemedText` variants instead of new type ramps, and `useTheme()` for runtime colors. Preserve light and dark mode.
- Keep layouts mobile-first, use safe-area insets, and respect `MaxContentWidth`/`TabBarClearance` where applicable.
- Every interactive surface needs accessible semantics, a 44pt target, and pressed feedback. All data surfaces need loading, empty, error, and success behavior.
- Use urgency and semantic colors with copy or icons, never color alone. Emergency language must be specific, calm, and action-oriented.

See `design-system/PATTERNS.md` for screen, state, accessibility, and migration rules.

## Expo SDK 57

This is an Expo Router SDK 57 project. Before changing Expo APIs or dependencies, read the exact versioned documentation at https://docs.expo.dev/versions/v57.0.0/. Use `npx expo install` for Expo package changes. Do not restructure the existing app to fit a generic starter layout.
