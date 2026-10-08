/**
 * A blood-type filter: eight values, zero or one selected.
 *
 * Extracted from requests-list.tsx when users-list.tsx needed the identical
 * control — two real callers with the same need, which is the threshold
 * design-system/PATTERNS.md sets for sharing. It stays in src/components/admin
 * rather than being promoted to src/components/ui: its callers are both
 * console screens, and the ui barrel is imported by every donor screen.
 *
 * This was a row of eight `BloodTypeGlyph` toggles. The glyph always draws in
 * brand red by design — it is a type marker, not a state marker — so the eight
 * chips were visually identical apart from their label, and the only signal for
 * which one was active was the `filled` variant. In a filter that is the wrong
 * job for it: scanning eight same-colored circles to find the selected one is
 * slower than reading "Type: O+". So the control is now the console's `Select`,
 * which names its own value and matches every other filter in the toolbar.
 *
 * Selection is still carried by `accessibilityState.selected` inside the menu,
 * never by color alone.
 *
 * Web-only, like everything else in this directory.
 */
import type { Ionicons } from '@expo/vector-icons';

import { Select } from '@/components/admin/toolbar';
import { BLOOD_TYPES, type BloodType } from '@/types/domain';

/** An empty string is the no-filter case; `Select` needs a value to represent it. */
type Choice = '' | BloodType;

const OPTIONS: { label: string; value: Choice }[] = [
  { label: 'Any', value: '' },
  ...BLOOD_TYPES.map((type) => ({ label: type, value: type as Choice })),
];

export function BloodTypeFilter({
  value,
  onChange,
  label = 'Type',
  variant,
  icon,
}: {
  value: BloodType | null;
  onChange: (v: BloodType | null) => void;
  label?: string;
  /** `field` where this sits in a form rather than a filter toolbar. */
  variant?: 'chip' | 'field';
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Select
      label={label}
      options={OPTIONS}
      value={value ?? ''}
      onChange={(next) => onChange(next === '' ? null : next)}
      variant={variant}
      icon={icon}
    />
  );
}
