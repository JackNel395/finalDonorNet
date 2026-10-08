/**
 * Donation preparation (modal). The surface the preparation reminders open:
 * when and where the donation is, plus a short checklist of things that help a
 * visit go smoothly.
 *
 * General preparation guidance only — by design. Nothing here states an
 * eligibility rule, a threshold, or a self-assessment, and the health item is
 * phrased as something to tell staff rather than something to judge for
 * yourself. Final eligibility is always determined by trained donation-center
 * staff, and the note at the bottom says so in a neutral treatment.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, FadeIn, SkeletonCard } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAppointment } from '@/hooks/api';
import { useTheme } from '@/hooks/use-theme';
import { DONATION_TYPE_LABEL } from '@/lib/booking';
import { dayOfMonth, longDate, monthAbbrev, timeOfDay } from '@/lib/format';
import type { PrepStageKey } from '@/lib/notifications';

/**
 * One line of lead copy per reminder stage. Advisory only: the checklist below
 * is identical for every stage, so a tap on a days-old banner can never show
 * stale guidance.
 */
const STAGE_LEAD: Record<PrepStageKey, string> = {
  d7: 'Your donation is a week away. A few simple things now make the visit easier.',
  d2: 'Your donation is in two days. Here is how to get ready.',
  d0: 'Today is donation day. A quick run-through before you go.',
};

const DEFAULT_LEAD = 'A few simple things help your donation go smoothly.';

const CHECKLIST = [
  { key: 'well', label: 'Feel well today' },
  { key: 'hydrate', label: 'Stay hydrated' },
  { key: 'meal', label: 'Eat a light, healthy meal' },
  { key: 'id', label: 'Bring a valid ID' },
  {
    key: 'disclose',
    label: 'Tell staff about medications, travel, illness, or relevant health conditions',
  },
] as const;

export default function PrepareScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, stage } = useLocalSearchParams<{ id?: string; stage?: PrepStageKey }>();
  const { data: appointment, isLoading, isError, refetch } = useAppointment(id);

  // A focus aid, not a record: ticks reset when the screen closes, so there is
  // nothing to persist and nothing to go stale.
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setTicks((prev) => ({ ...prev, [key]: !prev[key] }));

  // A cold-start notification tap has no back stack to pop.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)/home');

  const lead = (stage && STAGE_LEAD[stage]) || DEFAULT_LEAD;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <PressableScale
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[styles.close, { backgroundColor: theme.surfaceSunken }]}>
          <Ionicons name="close" size={22} color={theme.text} />
        </PressableScale>
        <ThemedText type="headline">Prepare to donate</ThemedText>
        <View style={styles.close} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}>
        {isLoading && !appointment ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : isError && !appointment ? (
          <Card variant="outline">
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={22} color={theme.textSecondary} />
              <ThemedText type="body" style={styles.errorText}>
                We couldn&apos;t load your appointment details.
              </ThemedText>
            </View>
            <Button
              label="Try again"
              variant="secondary"
              size="sm"
              onPress={() => void refetch()}
              style={styles.errorAction}
            />
          </Card>
        ) : !appointment ? (
          <EmptyState
            icon="calendar-outline"
            title="Appointment not found"
            subtitle="This appointment may have been cancelled. Book a new visit when you're ready."
            actionLabel="Book a donation"
            onAction={() => router.replace('/book')}
          />
        ) : (
          <>
            {/* When and where */}
            <FadeIn>
              <Card style={styles.hero} variant="tinted" tint={theme.infoSubtle}>
                <View style={[styles.dateBadge, { backgroundColor: theme.surface }]}>
                  <ThemedText type="caption" color="brand">
                    {monthAbbrev(appointment.date).toUpperCase()}
                  </ThemedText>
                  <ThemedText type="title2" color="brand">
                    {dayOfMonth(appointment.date)}
                  </ThemedText>
                </View>
                <View style={styles.heroText}>
                  <ThemedText type="title2">{appointment.centerName}</ThemedText>
                  <ThemedText type="subhead" color="textSecondary">
                    {`${longDate(appointment.date)} · ${timeOfDay(appointment.date)}`}
                  </ThemedText>
                  <ThemedText type="footnote" color="textTertiary">
                    {DONATION_TYPE_LABEL[appointment.type]}
                  </ThemedText>
                </View>
              </Card>
            </FadeIn>

            <ThemedText type="subhead" color="textSecondary">
              {lead}
            </ThemedText>

            {/* Checklist */}
            <FadeIn delay={60}>
              <Card padding={0} style={styles.checklist}>
                {CHECKLIST.map((item, i) => (
                  <PrepItem
                    key={item.key}
                    label={item.label}
                    checked={!!ticks[item.key]}
                    onToggle={() => toggle(item.key)}
                    last={i === CHECKLIST.length - 1}
                  />
                ))}
              </Card>
            </FadeIn>

            {/* Who decides — a statement of fact, not an alarm. */}
            <FadeIn delay={120}>
              <Card variant="outline" padding="base">
                <View style={styles.noteRow}>
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={theme.textSecondary}
                  />
                  <ThemedText type="footnote" color="textSecondary" style={styles.noteText}>
                    Final eligibility is always determined by trained donation-center staff.
                  </ThemedText>
                </View>
              </Card>
            </FadeIn>
          </>
        )}
      </ScrollView>

      {appointment ? (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.border,
              paddingBottom: insets.bottom || Spacing.base,
            },
          ]}>
          <Button
            label="View appointment details"
            icon="calendar-outline"
            fullWidth
            // `replace`, so the donor doesn't land back in a modal they've finished with.
            onPress={() =>
              router.replace({ pathname: '/appointment/[id]', params: { id: appointment.id } })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * A checklist row. Local to this screen on purpose — it has exactly one
 * consumer, so promoting it would add API without removing JSX.
 */
function PrepItem({
  label,
  checked,
  onToggle,
  last,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  last: boolean;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      scaleTo={0.99}
      haptic="light"
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={[
        styles.item,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}>
      {/* Shape changes with state, not only color, so it reads in greyscale. */}
      <Ionicons
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={checked ? theme.success : theme.textTertiary}
      />
      <ThemedText
        type="body"
        color={checked ? 'textSecondary' : 'text'}
        style={styles.itemLabel}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  dateBadge: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, gap: 4 },
  checklist: { overflow: 'hidden' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 52,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  // No numberOfLines: the health item must wrap at large text sizes, not clip.
  itemLabel: { flex: 1 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  noteText: { flex: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  errorText: { flex: 1 },
  errorAction: { marginTop: Spacing.md, alignSelf: 'flex-start' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
