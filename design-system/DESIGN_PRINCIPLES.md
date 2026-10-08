# Design principles

## 1. Lead with the next useful action

Users often arrive in short, consequential moments: checking eligibility, responding to a request, or managing an appointment. Put the current status and a single clear next step before secondary context. A screen should have one visual primary action.

## 2. Calm is the default, urgency is earned

The canvas, surfaces, and navigation stay quiet. The blood-red brand accent is reserved for primary action and identity; semantic urgency colors describe real status, never decoration. Critical requests must say what is needed, for whom, and what the user can do.

## 3. Dense, not crowded

Use a 4pt rhythm, concise labels, and visible grouping. Keep related information close, separate distinct tiers with extra space, and avoid carding every row. Prefer grouped content and hairlines when structure, not elevation, is the need.

## 4. Native familiarity over novelty

Use Expo Router navigation, standard touch affordances, platform typography, and familiar bottom-sheet or confirmation patterns. Do not introduce a web-style modal, decorative gradients, emoji controls, or novel input behavior for visual flavor.

## 5. Typography carries hierarchy

Use the existing named `ThemedText` ramp. Weight and spacing establish hierarchy before color does. Keep titles compact, body copy readable, metadata quiet but AA-legible, and no more than two competing scales inside a compact card.

## 6. Depth is restrained

Separate layers with the surface ladder, a hairline, or a low-spread shadow. Shadows signal genuinely raised or floating elements. Avoid nested cards, heavy outlines, glass-on-glass, gradients, and ornamental effects.

## 7. Motion confirms, it does not perform

Use the shared spring and short feedback for presses, selection, progress, and state changes. Content must remain useful with reduced motion. Avoid choreographed screen entrances and animate neither images nor layout for decoration.

## 8. Inclusion is a product requirement

Support light and dark theme, screen-reader semantics, 44pt targets, dynamic type, and reduced motion. Never communicate eligibility, urgency, or completion with color alone. Body text requires 4.5:1 contrast; large text requires 3:1.

## Writing voice

Warm, direct, and accountable. Encourage donors without guilt or game mechanics. Prefer “You can donate now” and “O-negative donors are needed nearby” over celebratory pressure or vague alarm. Buttons name the action: “Book a donation”, “Respond to request”, “Save profile”.
