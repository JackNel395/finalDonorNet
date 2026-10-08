# DonorNet design system

This directory is the operating guide for DonorNet's native-first interface. It turns the established implementation in `src/constants/theme.ts`, `src/components/themed-text.tsx`, and `src/components/ui/` into a shared contract for future work.

DonorNet is a calm, trustworthy blood-donation product. The visual benchmark is the restraint and precision associated with Linear and Apple, adapted for an empathetic medical-adjacent workflow: dense enough to answer a donor's question quickly, never dense enough to obscure action or urgency.

## Start here

1. Read `DESIGN_PRINCIPLES.md` for decision-making and voice.
2. Read `TOKENS.md` before styling. `src/constants/theme.ts` is the executable source of truth.
3. Read `COMPONENTS.md` before adding any repeated UI. Prefer composition of the existing primitives.
4. Use `PATTERNS.md` to build screens, states, responsive layouts, and accessible interactions.

## Implementation map

| Concern | Source of truth | Rule |
| --- | --- | --- |
| Runtime color, spacing, radius, shadow, motion | `src/constants/theme.ts` | Extend this file, never create a competing theme. |
| Theme selection | `src/hooks/use-theme.ts` | Resolve colors at render time with `useTheme()`. |
| Typography | `src/components/themed-text.tsx` | Use named `ThemedText` variants. |
| Shared primitives | `src/components/ui/` | Compose first; promote only a stable pattern used in two screens. |
| App chrome | `src/components/app-tab-bar.tsx`, Expo Router layouts | Preserve native navigation affordances and safe-area behavior. |

`design.md` is the earlier, detailed visual specification. These files complement it with a project-level, implementation-oriented contract; when the two disagree about current code, current code and this directory win until the implementation is intentionally migrated.

## Definition of done for UI work

- Uses semantic theme tokens and existing components where they fit.
- Works in light and dark themes, with dynamic text and reduced motion.
- Has clear loading, empty, error, and success states for data work.
- Uses labels and icons in addition to semantic color.
- Is checked at phone width, a wide/tablet width, and with large text.
- Introduces a new primitive only when its role and API are smaller than its implementation.

## Scope

This system guides future work. It does not require a retrofit of unrelated screens. Existing literal values are tracked as incremental migration opportunities in `PATTERNS.md`.
