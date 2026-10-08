/**
 * The request detail's banner: what was asked for, how urgent, and how much of
 * it is accounted for.
 *
 * The page used to open on a circle glyph and two badges floating above a row
 * of tiles, which made an operator read four separate things to answer one
 * question — is this request still a problem? The banner answers it in one
 * object: the type and the hospital on the left, the units meter on the right.
 *
 * The wash is tinted by urgency, not decoration: a critical request opens red
 * and a routine one opens neutral. It is never the only signal — the urgency
 * word sits in a badge directly on top of it, and the meter states its own
 * figure in text.
 *
 * Deliberately not a `Card`: `Card` owns a white fill and a shadow, and this is
 * a flat tinted wash — the same reasoning as `overview-hero.tsx`.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { STATUS_LABEL } from '@/components/admin/request-status';
import { ThemedText } from '@/components/themed-text';
import { Badge, URGENCY_LABEL } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AdminRequestDetail } from '@/types/api';
import type { Urgency } from '@/types/domain';

/** The wash each urgency opens on. Always paired with the urgency badge. */
const WASH: Record<Urgency, ThemeColor> = {
  critical: 'dangerSubtle',
  urgent: 'warningSubtle',
  moderate: 'infoSubtle',
  routine: 'surfaceSunken',
};

/** Above this the drop and the meter sit side by side; below, they stack. */
const WIDE = 980;

/**
 * The banner's own badge: sentence case, and large enough to be read at the top
 * of the page.
 *
 * `Badge` is the right component everywhere else on this screen — in a table
 * cell its uppercase caption is what makes a column of statuses scannable. Here
 * there are exactly two, they sit beside a 36px hospital name, and shouting
 * them makes the heading compete with itself.
 */
const URGENCY_FG: Record<Urgency, ThemeColor> = {
  critical: 'danger',
  urgent: 'warning',
  moderate: 'info',
  routine: 'textSecondary',
};

const URGENCY_BG: Record<Urgency, ThemeColor> = {
  critical: 'dangerSubtle',
  urgent: 'warningSubtle',
  moderate: 'infoSubtle',
  routine: 'surfaceSunken',
};

const STATUS_FG: Record<AdminRequestDetail['status'], ThemeColor> = {
  open: 'info',
  partial: 'warning',
  fulfilled: 'success',
  expired: 'textSecondary',
};

const STATUS_BG: Record<AdminRequestDetail['status'], ThemeColor> = {
  open: 'infoSubtle',
  partial: 'warningSubtle',
  fulfilled: 'successSubtle',
  expired: 'surfaceSunken',
};

/** The glyph repeats the word; it never replaces it. */
const STATUS_ICON: Record<AdminRequestDetail['status'], keyof typeof Ionicons.glyphMap> = {
  open: 'ellipse-outline',
  partial: 'time-outline',
  fulfilled: 'checkmark',
  expired: 'lock-closed-outline',
};

function HeroBadge({
  label,
  fg,
  bg,
  dot,
  icon,
}: {
  label: string;
  fg: ThemeColor;
  bg: ThemeColor;
  dot?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.heroBadge, { backgroundColor: theme[bg] }]}>
      {dot ? <View style={[styles.heroDot, { backgroundColor: theme[fg] }]} /> : null}
      {icon ? <Ionicons name={icon} size={14} color={theme[fg]} /> : null}
      <ThemedText type="footnote" style={{ color: theme[fg], fontWeight: '600' }}>
        {label}
      </ThemedText>
    </View>
  );
}

export function RequestHero({ req, width }: { req: AdminRequestDetail; width: number }) {
  const theme = useTheme();
  const wide = width >= WIDE;

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="request-wash" x1="0" y1="0" x2="1" y2="0.8">
              <Stop offset="0" stopColor={theme[WASH[req.urgency]]} />
              <Stop offset="1" stopColor={theme.surface} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#request-wash)" />
        </Svg>
      </View>

      <View style={[styles.row, wide ? null : styles.rowStacked]}>
        <View style={styles.identity}>
          <TypeDrop type={req.bloodType} />

          <View style={styles.copy}>
            <View style={styles.badges}>
              <HeroBadge
                label={URGENCY_LABEL[req.urgency]}
                fg={URGENCY_FG[req.urgency]}
                bg={URGENCY_BG[req.urgency]}
                dot
              />
              <HeroBadge
                label={STATUS_LABEL[req.status]}
                fg={STATUS_FG[req.status]}
                bg={STATUS_BG[req.status]}
                icon={STATUS_ICON[req.status]}
              />
            </View>

            <ThemedText style={styles.title} numberOfLines={2}>
              {req.hospital}
            </ThemedText>

            <View style={styles.meta}>
              <Meta icon="location-outline" text={req.city} />
              <Meta icon="person-outline" text={`Patient ${req.patientInitials}`} />
              <Meta
                icon="water-outline"
                text={`${req.unitsNeeded} unit${req.unitsNeeded === 1 ? '' : 's'} of ${req.bloodType} requested`}
              />
            </View>
          </View>
        </View>

        <UnitsMeter req={req} />
      </View>
    </View>
  );
}

/**
 * The blood type inside the product's own drop, rather than in a circle.
 *
 * Drawn here rather than composed from `marks.tsx`'s `DropMark`: that component
 * derives its gradient id from the two colours it is given, and the sidebar's
 * brand drop is drawn from the same pair on every console screen. Two
 * `<linearGradient>` elements sharing an id in one document is a collision, and
 * which one a `url(#id)` fill resolves to is not something this banner should
 * depend on.
 */
function TypeDrop({ type }: { type: string }) {
  const theme = useTheme();

  return (
    <View style={styles.drop} accessibilityLabel={`Blood type ${type}`}>
      <Svg width={96} height={96} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="request-type-drop" x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor={theme.brand} />
            <Stop offset="1" stopColor={theme.brandStrong} />
          </LinearGradient>
        </Defs>
        <Path
          d="M32 3C32 3 9 29.6 9 41.6 9 54.0 19.3 61 32 61s23-7.0 23-19.4C55 29.6 32 3 32 3Z"
          fill="url(#request-type-drop)"
        />
      </Svg>
      <View style={styles.dropLabel}>
        <ThemedText style={[styles.dropText, { color: theme.onBrand }]}>{type}</ThemedText>
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

/**
 * Units collected, as a figure and as a bar of one segment per unit.
 *
 * Segments rather than a continuous bar: units are whole things a center either
 * has or does not, and at two units a 50% fill invites the reading "about
 * half", which is not what one bag out of two means.
 */
function UnitsMeter({ req }: { req: AdminRequestDetail }) {
  const theme = useTheme();
  const done = req.unitsFulfilled >= req.unitsNeeded;
  const pct = req.unitsNeeded === 0 ? 0 : Math.round((req.unitsFulfilled / req.unitsNeeded) * 100);

  return (
    <View
      style={[styles.meter, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessibilityRole="summary"
      accessibilityLabel={`${req.unitsFulfilled} of ${req.unitsNeeded} units of ${req.bloodType} collected, ${pct} percent`}>
      <View style={styles.meterHead}>
        <ThemedText type="caption" color="textTertiary" style={styles.eyebrow}>
          UNITS COLLECTED
        </ThemedText>
        <Badge label={`${pct}%`} tone={done ? 'success' : 'neutral'} />
      </View>

      <View style={styles.meterFigure}>
        <ThemedText style={styles.meterValue}>{req.unitsFulfilled}</ThemedText>
        <ThemedText type="title2" color="textTertiary">
          /{req.unitsNeeded}
        </ThemedText>
        <ThemedText type="bodyStrong" style={styles.meterUnit}>
          units of {req.bloodType}
        </ThemedText>
      </View>

      <View style={styles.segments}>
        {Array.from({ length: Math.max(req.unitsNeeded, 1) }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              {
                backgroundColor: i < req.unitsFulfilled ? theme.success : theme.surfaceSunken,
              },
            ]}
          />
        ))}
      </View>

      <ThemedText type="footnote" color="textSecondary">
        {done
          ? 'Every requested unit is accounted for.'
          : `${req.unitsNeeded - req.unitsFulfilled} still needed.`}
      </ThemedText>
    </View>
  );
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
  drop: { alignItems: 'center', justifyContent: 'center' },
  // Centred on the drop's bowl, which sits below its point.
  dropLabel: { position: 'absolute', top: 46 },
  dropText: { fontSize: 25, lineHeight: 30, fontWeight: '700', letterSpacing: -0.6 },

  copy: { flex: 1, minWidth: 0, gap: Spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  heroDot: { width: 7, height: 7, borderRadius: Radius.full },
  title: { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minWidth: 0 },

  meter: {
    width: 420,
    maxWidth: '100%',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  meterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { letterSpacing: 1.1 },
  meterFigure: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  meterValue: { fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2 },
  meterUnit: { marginLeft: Spacing.xs },

  segments: { flexDirection: 'row', gap: Spacing.sm },
  segment: { flex: 1, height: 8, borderRadius: Radius.full },
});
