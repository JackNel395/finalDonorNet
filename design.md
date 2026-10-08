# DonorNet — Design System

> **Single source of truth** for all UI/UX. Inspired by the **Linear Design System**: minimal, elegant, fast, distraction-free, meticulously crafted. Every screen emphasizes clean layouts, consistent spacing, native SF typography, solid color surfaces, soft shadows, rounded corners, tasteful glassmorphism, and fluid micro-interactions.
>
> **Product:** DonorNet — a blood donation app that connects donors, recipients, hospitals, and blood banks to save lives.

---

## 1. Design Principles

1. **Calm by default.** Surfaces are quiet. Color is used sparingly and with intent — the interface recedes so content leads.
2. **One accent, used deliberately.** Blood red is the brand. It appears on primary actions, urgency, and the mark — never as decoration.
3. **Depth through elevation, not borders.** Layers separate with subtle tonal shifts and soft shadows, not heavy strokes.
4. **Motion is feedback, not spectacle.** Transitions are fast (150–300ms), spring-based, and always communicate cause and effect.
5. **Density with air.** Information-rich, but never cramped. Generous line-height and consistent 4px-grid spacing.
6. **Accessible always.** ≥ 4.5:1 text contrast, ≥ 44×44pt touch targets, respects reduce-motion and dynamic type.

---

## 2. Color Palette

Colors are defined as semantic tokens in `src/constants/theme.ts` (`Colors.light` / `Colors.dark`). Never hardcode hex outside the token file.

### Brand
| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` | `#C42F38` | `#FF777B` | Primary accent, brand mark |
| `brandStrong` | `#A82730` | `#F05C64` | Pressed primary |
| `brandSubtle` | `#FEEBEC` | `#2A1416` | Tinted brand backgrounds |
| `brandDeep` | `#151A36` | `#0E1125` | Solid brand panels, donor card |
| `onBrand` | `#FFFFFF` | `#1F0A0B` | Text/icons on brand & accent **fills** |

`onBrand` flips to ink in dark mode: the dark accent is a light coral, and white
on coral fails AA (~2.5:1). Ink-on-coral reads ~7:1 (the iOS tinted-button
pattern). Use `onBrand` for anything sitting on a `brand`/semantic fill; use
`onColor` (always white) only on permanently dark panels like `brandDeep`.

### Surfaces (elevation ladder)
| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#FBFBFC` | `#08080A` | App canvas |
| `surface` | `#FFFFFF` | `#131316` | Cards, sheets |
| `surfaceElevated` | `#FFFFFF` | `#1B1B1F` | Popovers, elevated cards |
| `surfaceSunken` | `#F4F4F6` | `#0E0E11` | Inset wells, inputs |

### Text
| Token | Light | Dark | Use |
|---|---|---|---|
| `text` | `#16192D` | `#F7F7FB` | Primary text |
| `textSecondary` | `#596078` | `#A5A8BC` | Secondary text |
| `textTertiary` | `#6C7288` | `#8A8EA5` | Hints, captions, disabled (tuned to ≥4.5:1 on surfaces) |
| `onColor` | `#FFFFFF` | `#FFFFFF` | Text on permanently dark panels (`brandDeep`) |
| `onColorSecondary` | `rgba(255,255,255,0.85)` | same | Secondary text on permanently dark panels |
| `onColorTertiary` | `rgba(255,255,255,0.70)` | same | Hints/captions on permanently dark panels |

### Lines
| Token | Light | Dark | Use |
|---|---|---|---|
| `border` | `#E8E9F0` | `#282B3D` | Hairlines, dividers |
| `borderStrong` | `#D5D8E4` | `#3A3E54` | Focus outlines, emphasis |
| `onColorFaint` | `rgba(255,255,255,0.24)` | same | Hairlines, ghost borders, progress tracks on permanently dark panels |

### Semantic status
| Token | Light | Dark | Use |
|---|---|---|---|
| `success` / `successSubtle` | `#1B7A4B` / `#E7F6EC` | `#3DD68C` / `#0F2318` | Eligible, confirmed |
| `warning` / `warningSubtle` | `#B45309` / `#FEF3E2` | `#F5A524` / `#291A08` | Caution, pending |
| `danger` / `dangerSubtle` | `#D2262D` / `#FEEBEC` | `#F16A6F` / `#2A1416` | Critical, urgent, errors |
| `info` / `infoSubtle` | `#2563EB` / `#E8F1FE` | `#5B9DFF` / `#0C1B33` | Neutral info |

Light semantic colors are deep enough that each passes AA both as caption text
on its own subtle tint (badges) and as a fill under `onBrand` (buttons).

### Urgency scale (emergency requests)
`critical` → `danger` · `urgent` → `warning` · `moderate` → `info` · `routine` → `textSecondary`

### Color surfaces
- Use `brandDeep` for solid hero panels, donor cards, onboarding, and featured content.
- Use `brandSubtle` and semantic subtle tokens for quiet tinted states.
- Do not use gradient colors. Depth comes from tonal contrast, elevation, and purposeful overlays.

---

## 3. Typography

System font stack: San Francisco / SF Pro on iOS, the platform sans-serif equivalent elsewhere. Web falls back to an Apple system font stack. Defined via `ThemedText` `type` variants.

| Variant | Size / Line | Weight | Use |
|---|---|---|---|
| `display` | 34 / 40 | 700 | Screen hero numbers |
| `title` | 28 / 34 | 700 | Screen titles |
| `title2` | 22 / 28 | 700 | Section headers |
| `headline` | 17 / 22 | 600 | Card titles, list headers |
| `body` | 16 / 24 | 400 | Body copy |
| `bodyStrong` | 16 / 24 | 600 | Emphasized body |
| `callout` | 15 / 20 | 500 | Secondary content |
| `subhead` | 14 / 20 | 500 | Metadata rows |
| `footnote` | 13 / 18 | 500 | Captions |
| `caption` | 12 / 16 | 600 | Labels, badges (often UPPERCASE, +0.4 tracking) |
| `mono` | 13 / 18 | 500 | Codes, QR payloads |

Tracking: titles `-0.4`, display `-0.6`, caption `+0.4`. Never more than **two** type sizes competing in one card.

---

## 4. Spacing & Layout

**4px base grid.** Use the `Spacing` scale — never raw numbers.

| Token | px |
|---|---|
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `base` | 16 |
| `lg` | 20 |
| `xl` | 24 |
| `2xl` | 32 |
| `3xl` | 40 |
| `4xl` | 56 |

- Screen horizontal padding: `base` (16) on phones.
- Card internal padding: `base`–`lg`.
- Vertical rhythm: `base` (16) between sections within a tier; a tier break adds another `base` (32 total) so related sections group and distinct tiers separate.
- Max content width: 640 (tablet/web centering).
- Tab screens pad scroll content bottom by `insets.bottom + TabBarClearance` (120) to clear the floating tab bar.

## 5. Radius & Elevation

**Radius** (`Radius` token): `sm` 8 · `md` 12 · `lg` 16 · `xl` 20 · `2xl` 28 · `full` 999.
Cards use `lg`–`xl`. Pills/badges use `full`. Buttons use `md`.

**Shadow** (`Shadow` token) — soft, low-spread, never harsh:
- `sm`: y1, blur3, 6% — inputs, subtle lift.
- `md`: y4, blur12, 8% — cards.
- `lg`: y10, blur28, 12% — sheets, floating elements, FAB.
Dark mode reduces shadow opacity and adds a 1px top inner highlight instead.

## 6. Components

All primitives live in `src/components/ui/`. Compose, don't fork.

- **Button** — variants: `primary` (brand fill + `onBrand` label), `secondary` (surface + border), `ghost` (transparent), `danger`, `inverse` (fixed white fill + navy ink, for CTAs on `brandDeep` panels — identical in both themes). Sizes `sm`/`md`/`lg`. Full-width option. Press: scale 0.97 spring + optional haptic. Loading keeps the fill and shows a spinner; **disabled** drops to `surfaceSunken` + `textTertiary` (never an opacity fade on the brand fill). Optional leading icon.
- **Card** — `surface` bg, radius `xl`, shadow `md`, padding `lg`. Variants: `default`, `elevated`, `outline`, `tinted` (semantic subtle bg). Pressable variant adds scale-press.
- **Badge / Pill** — `caption` text, radius `full`, tinted bg + colored text. Tones map to semantic + urgency colors. Optional dot.
- **StatTile** — big `display` number + `caption` label, optional icon and delta.
- **Input / Field** — `surfaceSunken` bg, radius `md`, label above, helper/error below. Focus ring uses `borderStrong`. 48pt min height.
- **SegmentedControl** — pill track, animated selected thumb.
- **Avatar** — circle, initials fallback, blood-type ring option.
- **ListRow** — leading icon/avatar, title + subtitle, trailing value/chevron. 56pt min height.
- **SectionHeader** — `headline` title, optional `footnote` subtitle, optional trailing action link (≥44pt hit target via hitSlop).
- **ProgressRing / ProgressBar** — SVG, brand stroke, animated.
- **BloodTypeGlyph** — pill showing type (A+, O−, …) with brand ring.
- **QRCode** — SVG matrix for donor card.
- **EmptyState** — centered icon, title, subtitle, optional action.
- **Skeleton** — shimmer placeholder (reanimated), matches final layout.
- **Sheet / Modal** — bottom sheet w/ grabber, radius `2xl` top, `lg` shadow, backdrop 40% scrim.
- **Toast** — top, glass/surface, auto-dismiss, semantic accent bar.
- **FAB** — 56pt circle, brand fill, `lg` shadow, bottom-right above tab bar.
- **Header** — large-title screen header w/ optional back, subtitle, trailing action.

### Glassmorphism
Use `expo-glass-effect` `GlassView` on iOS 26+ (tab bar, floating headers, donor-card overlay); fall back to `surfaceElevated` + `border` + blur where unavailable. Never stack glass on glass. Keep content behind glass low-contrast.

## 7. Motion

Library: `react-native-reanimated` v4. Prefer springs.
- **Standard spring:** `{ damping: 18, stiffness: 200, mass: 0.9 }`.
- **Press feedback:** scale to 0.97, 120ms.
- **Entrance:** fade + 8px rise, staggered 40ms per item (lists/cards).
- **Screen transitions:** default native stack; modals slide up.
- **Page/tab switch:** cross-fade content 180ms.
- **Number counters, progress rings:** animate on mount (600ms ease-out).
- **Success:** checkmark draw + subtle scale pop; pair with `expo-haptics` notificationSuccess.
- Always honor `AccessibilityInfo.isReduceMotionEnabled` → disable transforms, keep opacity.

## 8. States

Every data surface implements: **loading** (skeleton, never spinner-only for content), **empty** (EmptyState with helpful action), **error** (inline retry), **success** (confirmation + haptic). Destructive actions require a confirm sheet/dialog.

## 9. Iconography

`@expo/vector-icons` (Ionicons primary, MaterialCommunityIcons for medical glyphs). Line style, 1.5–2px, sized 18/20/24. Icons are `textSecondary` unless active/branded.

## 10. Accessibility

- All interactive elements: `accessibilityRole`, `accessibilityLabel`, ≥44pt target.
- Never encode meaning in color alone — pair urgency color with a label/icon.
- Support light & dark; test both. Contrast ≥ 4.5:1 body, ≥ 3:1 large.
- Respect reduce-motion and reduce-transparency.

## 11. Voice & Tone

Warm, clear, human. Encouraging without gamified pressure. "You're eligible to donate" over "Level up!". Emergency copy is direct and calm. Numbers celebrate impact ("You've helped save 9 lives").
