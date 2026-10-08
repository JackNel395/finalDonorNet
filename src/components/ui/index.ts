export { Avatar } from './avatar';
export { Badge, URGENCY_LABEL, URGENCY_TONE, type BadgeTone } from './badge';
export { BloodTypeGlyph } from './blood-type-glyph';
export { Button } from './button';
export { Card } from './card';
export { ConfirmSheet } from './confirm-sheet';
export { EmptyState } from './empty-state';
export { FadeIn } from './fade-in';
export { Input, RequiredMark } from './input';
export { PressableScale } from './pressable-scale';
export { ProgressRing } from './progress-ring';
export { QRCode } from './qr-code';
export { ScreenHeader } from './screen-header';
export { SectionHeader } from './section-header';
export { SegmentedControl } from './segmented-control';
export { Skeleton, SkeletonCard } from './skeleton';
export { StatTile } from './stat-tile';
export { ToastProvider, useToast } from './toast';

// `DataTable` is deliberately NOT exported here. This barrel is imported by
// every donor screen, so an export would pull the table into the native bundle
// — the thing src/components/admin's platform split exists to prevent. Admin
// components import '@/components/ui/data-table' directly, the same reasoning
// that keeps admin hooks out of the src/hooks/api barrel.
