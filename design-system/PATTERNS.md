# Patterns and migration guidance

## Screen structure

1. Establish the screen canvas from `theme.background`, safe-area insets, and the route’s existing navigation model.
2. Present status and the next meaningful action first.
3. Group related items with a consistent `gap`; insert a tier break when moving from urgent work to exploration or reflection.
4. Use one primary action per view. Secondary actions are quiet, still explicit, and reachable.
5. Keep mobile as the primary layout. At wide widths, center content under `MaxContentWidth`, preserve touch targets, and use structural reflow rather than oversized type.

## State pattern

Every async content area has all four states:

| State | Pattern |
| --- | --- |
| Loading | `Skeleton` or `SkeletonCard` shaped like the eventual content, not a full-screen spinner. |
| Empty | `EmptyState` that explains the absence and offers a useful next action where appropriate. |
| Error | Specific inline explanation plus a retry action. Preserve any safely displayed prior content. |
| Success | Clear confirmation, optional semantic toast/haptic, and an updated visible state. |

Use `ConfirmSheet` for destructive or hard-to-reverse actions. Prefer inline expansion, a route, or a native sheet over an invented centered web modal.

## Interaction and accessibility

- Give every pressable an `accessibilityRole`, a standalone label where its visual text is insufficient, and the appropriate `accessibilityState`.
- Keep interactive targets at least 44pt. Expand a small visual affordance through container size or hit area, not a misleading visual button.
- Loading controls retain an accessible label and expose `busy`; disabled controls expose `disabled`.
- Pair urgency, eligibility, and errors with text or an icon. Do not rely on red, amber, or green alone.
- Test light and dark theme, enlarged system text, screen reader order, and `useReduceMotion()`.
- Keep press feedback subtle. Use `PressableScale`; never animate images on hover or use motion only as decoration.

## Responsive behavior

Phone layouts are the baseline. On tablet/web, preserve the content column and readable line lengths, retain established route behavior, and reflow rows that cannot accommodate large type. Do not make floating app chrome overlap content. Map features remain platform-aware, as the current project already does.

## Existing convention preservation

The project already has a usable implementation system. Keep these decisions:

- `Colors.light` / `Colors.dark` and `useTheme()` provide explicit light/dark brand treatment.
- The existing SF/system typography stack and named `ThemedText` variants provide native hierarchy.
- `Spacing`, `Radius`, `Shadow`, `Spring`, `MaxContentWidth`, and `TabBarClearance` provide the core layout vocabulary.
- `src/components/ui` owns visual primitives, and Expo Router layouts own route-level navigation.

## Incremental migration notes

Do not undertake a broad visual rewrite as part of feature work. When editing a touched surface, improve only local drift that is safe and relevant:

- Replace a repeated literal spacing, color, radius, or type value with an existing token. Add a token only for a real reusable role.
- Replace repeated `#FFFFFF` or `#fff` on permanent dark panels with `theme.onColor`; use `theme.onBrand` on brand fills. Keep fixed-white exceptions only when a component’s contrast is intentional and documented.
- Replace screen-local button/card/input replicas with existing primitives when their behavior matches. Do not force a mismatch merely to use a primitive.
- Prefer `Spacing.xs` to repeated `2` or `4` values when it does not change layout intent. Retain a documented local optical nudge where needed.
- Avoid widening the shared component API until two real callers demonstrate the same need.

Before shipping changed UI, run `npm run lint` and visually check the touched route in both themes where a device or web preview is available.
