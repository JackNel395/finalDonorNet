/**
 * The booking detail's banner: when the visit is, and how far along it is.
 *
 * The page used to open on an avatar, an email and a phone number — the donor's
 * identity, which the operator already knows, because they clicked the row with
 * that name on it. The question a booking actually raises is temporal: is this
 * visit coming up, is it today, has it been and gone unrecorded? So the banner
 * leads with the date as an object you can read at a glance (the tear-off tile),
 * states the full date and time once in display type, and puts the countdown
 * and the booking's position in its own lifecycle on the right.
 *
 * The stage rail is not decoration: "confirmed" alone does not say whether the
 * visit has happened, and an operator deciding whether to call a donor needs
 * that. The rail pairs each filled stage with its own word, so the state is
 * never carried by the green alone.
 *
 * Deliberately not a `Card`: `Card` owns a white fill and a shadow, and this is
 * a flat tinted wash — the same reasoning as `overview-hero.tsx` and
 * `request-hero.tsx`.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { STATUS_LABEL, STATUS_TONE } from '@/components/admin/appointment-status';
import { ThemedText } from '@/components/themed-text';
import { Badge, type BadgeTone } from '@/components/ui';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DONATION_TYPE_LABEL } from '@/lib/booking';
import { longDate } from '@/lib/format';
import type { AdminAppointment } from '@/types/api';

/** Above this the date block and the countdown sit side by side; below, they stack. */
const WIDE = 1180;

export function AppointmentHero({ apt, width }: { apt: AdminAppointment; width: number }) {
  const theme = useTheme();
  const wide = width >= WIDE;
  const date = new Date(apt.date);

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="appointment-wash" x1="0" y1="0" x2="1" y2="0.3">
              <Stop offset="0" stopColor={theme.brandSubtle} stopOpacity={0.85} />
              <Stop offset="0.5" stopColor={theme.brandSubtle} stopOpacity={0.5} />
              <Stop offset="1" stopColor={theme.brandSubtle} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {/* The wash is laid over the surface rather than fading *to* it, so
              a brand-tinted pill (the donation type) still separates from the
              banner it sits on instead of dissolving into an identical fill. */}
          <Rect x="0" y="0" width="100%" height="100%" fill={theme.surface} />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#appointment-wash)" />
        </Svg>
      </View>

      <View style={[styles.row, wide ? null : styles.rowStacked]}>
        <View style={styles.identity}>
          <DateTile date={date} />

          <View style={styles.copy}>
            <View style={styles.badges}>
              <Badge
                label={STATUS_LABEL[apt.status]}
                tone={STATUS_TONE[apt.status]}
                icon={STATUS_ICON[apt.status]}
                uppercase={false}
              />
              <Badge label={DONATION_TYPE_LABEL[apt.type]} tone="brand" uppercase={false} />
            </View>

            <ThemedText style={styles.title} numberOfLines={2}>
              {`${longDate(apt.date)} at ${timeLabel(apt.date)}`}
            </ThemedText>

            <View style={styles.meta}>
              <Meta icon="person-outline" text={apt.donorName} />
              <Meta icon="business-outline" text={apt.centerName} />
            </View>
          </View>
        </View>

        <Countdown apt={apt} />
      </View>
    </View>
  );
}

/** The status glyph that travels with the word, so the tone is never alone. */
const STATUS_ICON: Record<AdminAppointment['status'], keyof typeof Ionicons.glyphMap> = {
  confirmed: 'checkmark',
  pending: 'time-outline',
  completed: 'checkmark-done',
  cancelled: 'close',
};

/**
 * A tear-off calendar leaf. The month band is the one place the brand fill
 * appears at this size, which is what makes the date findable before any of
 * the words around it are read.
 */
function DateTile({ date }: { date: Date }) {
  const theme = useTheme();

  return (
    <View
      style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.border }, Shadow.md]}
      {...({ 'aria-hidden': true } as object)}>
      <View style={[styles.tileBand, { backgroundColor: theme.brand }]}>
        <ThemedText type="caption" style={[styles.tileMonth, { color: theme.onBrand }]}>
          {date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.tileBody}>
        <ThemedText style={styles.tileDay}>{date.getDate()}</ThemedText>
        <ThemedText type="caption" color="textTertiary" style={styles.tileWeekday}>
          {date.toLocaleDateString(undefined, { weekday: 'long' })}
        </ThemedText>
      </View>
    </View>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={15} color={theme.textTertiary} />
      <ThemedText type="subhead" color="textSecondary" numberOfLines={1}>
        {text}
      </ThemedText>
    </View>
  );
}

/** Calendar days between today and the visit — not elapsed 24-hour periods. */
function daysUntil(iso: string, now = new Date()): number {
  const a = new Date(iso);
  const start = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((start(a) - start(now)) / 86_400_000);
}

type Phase = {
  /** The large figure, or null where a count would be meaningless. */
  value: string | null;
  label: string;
  badge: string;
  tone: BadgeTone;
};

/**
 * A settled booking has no countdown — it is reported as what it became. A live
 * one whose date has passed is the case the list cannot show: the slot was
 * never closed out, and that is a call to make, so it is named "Not recorded"
 * rather than left as a negative number of days.
 */
function phaseOf(apt: AdminAppointment): Phase {
  if (apt.status === 'completed')
    return { value: null, label: 'Donation recorded', badge: 'Completed', tone: 'brand' };
  if (apt.status === 'cancelled')
    return { value: null, label: 'Slot released', badge: 'Cancelled', tone: 'neutral' };

  const days = daysUntil(apt.date);
  if (days > 0)
    return {
      value: String(days),
      label: days === 1 ? 'day to go' : 'days to go',
      badge: 'Upcoming',
      tone: 'info',
    };
  if (days === 0) return { value: null, label: 'Today', badge: 'Today', tone: 'warning' };
  return {
    value: String(-days),
    label: -days === 1 ? 'day ago, not recorded' : 'days ago, not recorded',
    badge: 'Not recorded',
    tone: 'warning',
  };
}

const STAGES = ['Booked', 'Confirmed', 'Visit', 'Complete'] as const;

/** How many of `STAGES` this booking has actually passed. */
function stagesDone(apt: AdminAppointment): number {
  if (apt.status === 'completed') return 4;
  if (apt.status === 'cancelled') return 1;
  if (apt.status === 'confirmed') return daysUntil(apt.date) < 0 ? 3 : 2;
  return 1;
}

function Countdown({ apt }: { apt: AdminAppointment }) {
  const theme = useTheme();
  const phase = phaseOf(apt);
  const done = stagesDone(apt);
  const cancelled = apt.status === 'cancelled';
  const stages = cancelled ? ([...STAGES.slice(0, 3), 'Cancelled'] as const) : STAGES;
  const markColor = cancelled ? theme.textTertiary : theme.success;

  return (
    <View
      style={[styles.countdown, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessibilityRole="summary"
      accessibilityLabel={`${phase.badge}. ${phase.value ? `${phase.value} ` : ''}${phase.label}. Visit at ${timeLabel(apt.date)}. Stage ${done} of ${stages.length}, ${stages[done - 1]}.`}>
      <View style={styles.countdownHead}>
        <ThemedText type="caption" color="textTertiary" style={styles.eyebrow}>
          VISIT COUNTDOWN
        </ThemedText>
        <Badge label={phase.badge} tone={phase.tone} uppercase={false} />
      </View>

      <View style={styles.figure}>
        {phase.value ? <ThemedText style={styles.figureValue}>{phase.value}</ThemedText> : null}
        <ThemedText type="title2" color="textSecondary" style={styles.figureLabel}>
          {phase.label}
        </ThemedText>
        <ThemedText type="title2" style={{ color: theme.brand }}>
          {timeLabel(apt.date)}
        </ThemedText>
      </View>

      <View style={styles.rail}>
        {stages.map((stage, i) => (
          <View key={stage} style={styles.stage}>
            <View style={styles.stageTrack}>
              {/* Half-segments, so the line meets the dot from both sides and
                  the rail stops cleanly at the first and last stage. */}
              <View
                style={[
                  styles.segment,
                  {
                    backgroundColor: i === 0 ? 'transparent' : i < done ? markColor : theme.border,
                  },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  i < done
                    ? { backgroundColor: markColor, borderColor: markColor }
                    : { backgroundColor: theme.surface, borderColor: theme.borderStrong },
                ]}
              />
              <View
                style={[
                  styles.segment,
                  {
                    backgroundColor:
                      i === stages.length - 1
                        ? 'transparent'
                        : i < done - 1
                          ? markColor
                          : theme.border,
                  },
                ]}
              />
            </View>
            <ThemedText
              type="caption"
              color={i < done ? 'text' : 'textTertiary'}
              numberOfLines={1}
              style={styles.stageLabel}>
              {stage}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The banner's own time format: unpadded, because it is read as a sentence
 * ("at 1:00 PM"), not scanned down a column the way `clockTime` is.
 */
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xl,
    padding: Spacing.xl,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch' },

  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },

  tile: {
    width: 118,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tileBand: { paddingVertical: Spacing.sm, alignItems: 'center' },
  tileMonth: { letterSpacing: 1.6 },
  tileBody: { alignItems: 'center', paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  tileDay: { fontSize: 42, lineHeight: 48, fontWeight: '700', letterSpacing: -1.6 },
  tileWeekday: { letterSpacing: 0.2, fontWeight: '500' },

  copy: { flex: 1, minWidth: 0, gap: Spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  title: { fontSize: 38, lineHeight: 46, fontWeight: '700', letterSpacing: -1.1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minWidth: 0 },

  countdown: {
    width: 452,
    maxWidth: '100%',
    gap: Spacing.base,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  countdownHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { letterSpacing: 1.1 },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  figureValue: { fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2 },
  figureLabel: { flex: 1, minWidth: 0 },

  rail: { flexDirection: 'row' },
  stage: { flex: 1, alignItems: 'center', gap: Spacing.sm },
  stageTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  segment: { flex: 1, height: 2 },
  dot: { width: 11, height: 11, borderRadius: Radius.full, borderWidth: 2 },
  stageLabel: { letterSpacing: 0.1, fontWeight: '500' },
});
