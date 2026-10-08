# Tokens

`src/constants/theme.ts` is the only token implementation. Do not add a second `theme/` folder, CSS palette, or screen-local palette. Resolve the current token set through `useTheme()` inside React components.

## Color roles

| Role | Tokens | Use |
| --- | --- | --- |
| Brand | `brand`, `brandStrong`, `brandSubtle`, `brandDeep`, `onBrand` | Primary action, identity, a rare featured panel. `onBrand` is theme-aware. |
| Surfaces | `background`, `surface`, `surfaceElevated`, `surfaceSunken` | Canvas, cards/sheets, floating layers, and inputs/insets. |
| Content | `text`, `textSecondary`, `textTertiary` | Primary hierarchy, supporting content, quiet metadata. |
| Fixed dark panels | `onColor`, `onColorSecondary`, `onColorTertiary`, `onColorFaint` | Content and lines on `brandDeep`, never general UI. |
| Structure | `border`, `borderStrong` | Hairlines and focus/emphasis. |
| Status | `success`, `warning`, `danger`, `info` plus `*Subtle` | Eligibility, pending state, critical/error, and neutral information. |

Use a semantic token, not its hex value. `brand` is not a synonym for destructive state; use `danger` for errors and critical requests. For status, pair the color with a written label and usually an icon.

## Spacing and layout

Use `Spacing`: `xs` 4, `sm` 8, `md` 12, `base` 16, `lg` 20, `xl` 24, `2xl` 32, `3xl` 40, `4xl` 56.

- Default phone edge padding is `Spacing.base` or the established screen’s matching convention.
- Use `gap` for a stack’s regular rhythm. Use 16 within a content tier and 32 between distinct tiers.
- Center wide content with `MaxContentWidth` (640). Do not simply scale up mobile type on large screens.
- On tab screens, clear the floating tab bar with safe-area inset plus `TabBarClearance`; respect screen-specific established clearance elsewhere.

## Shape, elevation, and motion

| Token group | Values | Use |
| --- | --- | --- |
| `Radius` | `sm` 8, `md` 12, `lg` 16, `xl` 20, `2xl` 28, `full` 999 | Inputs/buttons, compact surfaces, cards, sheets, pills. |
| `Shadow` | `none`, `sm`, `md`, `lg` | No elevation, subtle input lift, cards, overlays/FABs. |
| `Spring` | damping 18, stiffness 200, mass 0.9 | Shared Reanimated feedback and state motion. |

Use `StyleSheet.hairlineWidth` for a divider or quiet outline. Use `borderCurve: 'continuous'` on new rounded native surfaces where supported. Dark surfaces rely more on tonal separation and hairlines than shadows.

## Typography

Use `ThemedText` rather than raw `fontSize` and `fontWeight` in screens:

| Variant | Size / line | Typical use |
| --- | --- | --- |
| `display` | 34 / 40 | Meaningful impact number only. |
| `title`, `title2` | 28 / 34, 22 / 28 | Screen and section emphasis. |
| `headline` | 17 / 22 | Card and list titles. |
| `body`, `bodyStrong` | 16 / 24 | Readable content and emphasis. |
| `callout`, `subhead`, `footnote`, `caption` | 15 / 20 to 12 / 16 | Supporting text, metadata, compact labels. |
| `mono` | 13 / 18 | Codes and QR payloads. |

Keep text scaling enabled. Let rows grow or wrap before using `numberOfLines`; only constrain compact, nonessential chrome.

## Token extension rule

Add a token only when a visual value has a stable semantic role or recurs in at least two places. Prefer extending the existing type, spacing, and theme objects. A one-off optical adjustment may remain local with a comment explaining why.
