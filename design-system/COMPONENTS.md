# Components

Shared UI belongs in `src/components/ui/`. Import from `@/components/ui` where it is exported. A screen composes these primitives; it does not recreate their visual identity.

## Existing primitives

| Component | Contract and intended use |
| --- | --- |
| `Button` | Primary, secondary, ghost, danger, and inverse actions; `sm`/`md`/`lg`; loading, disabled, optional icon, full width. Use the variant that expresses intent. |
| `Card` | Default, elevated, outline, or tinted content container; token padding/radius; optional press behavior. Use when grouping is meaningful, not as a wrapper for every row. |
| `Input` | Labeled field with helper/error state and accessible 48pt input treatment. |
| `Badge` | Compact labeled semantic status or urgency. Never a color-only marker. |
| `Avatar` and `BloodTypeGlyph` | Identity and blood-type representation with safe fallbacks. |
| `SectionHeader` and `ScreenHeader` | Consistent section/screen hierarchy and optional actionable trailing control. |
| `SegmentedControl` | Small mutually exclusive filter or mode choice. |
| `ProgressRing` and `StatTile` | Progress and succinct metrics. Use `display` metrics only when impact matters. |
| `EmptyState`, `Skeleton`, `SkeletonCard` | Meaningful empty and loading states that match the final layout. |
| `ConfirmSheet` and `ToastProvider` / `useToast` | Consequential confirmation and transient feedback. |
| `PressableScale`, `FadeIn` | Shared press and entrance feedback; always respect reduced-motion hooks. |
| `QRCode` | Donor-card data presentation. |

`RequestCard`, `EnableLocationCard`, and `EnablePushCard` are domain components in `src/components/`; reuse them for their specific scenarios rather than generalizing them prematurely.

## Component contract

When a new shared primitive is justified, it must define:

- intent variants, sizes where useful, and default/pressed/disabled/loading states;
- a layout-only `style` override, merged last;
- accessibility role, label behavior, and disabled/busy/selected state;
- token-backed color, spacing, type, radius, and elevation;
- light/dark, dynamic text, and reduced-motion behavior.

Use composition when content varies. Avoid expanding a primitive into a large set of content-specific props such as every possible icon, footer, subtitle, and badge. A stable `children` composition is usually more durable.

## Promotion rule

Promote a view to `src/components/ui/` only when all apply: it occurs in at least two screens, has a nameable product role, and its public API is smaller than the JSX it replaces. Until then, keep it local to its screen. Do not wrap platform-native controls merely to give them a custom skin.

## Iconography

Use `Ionicons` as the established primary icon set, with Material Community Icons only for a missing medical glyph. Prefer 18, 20, or 24pt icons. Icons inherit `textSecondary` by default and use brand/status color only when the state needs emphasis. Never use emoji as controls or navigation icons.
