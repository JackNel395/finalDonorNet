/**
 * Blood type compatibility reference (modal).
 *
 * Exists because matching is invisible: the feed silently hides requests a
 * donor can't serve, and "why am I not seeing anything?" is a trust problem,
 * not a curiosity. The table is generated from the same `canDonateTo` used to
 * filter the feed and target push, so what a donor reads here is exactly what
 * the app did.
 *
 * It states compatibility, never eligibility. Whether someone may donate today
 * is decided by screening staff at the center.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BloodCompatibilityTable,
  type CompatibilityDirection,
} from '@/components/blood-compatibility-table';
import { ThemedText } from '@/components/themed-text';
import { Card, FadeIn, ScreenHeader, SegmentedControl } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/api';
import { useTheme } from '@/hooks/use-theme';
import {
  donorsFor,
  recipientsFor,
  UNIVERSAL_DONOR,
  UNIVERSAL_RECIPIENT,
} from '@/lib/blood';

const OPTIONS: { label: string; value: CompatibilityDirection }[] = [
  { label: 'I can donate to', value: 'donate' },
  { label: 'I can receive from', value: 'receive' },
];

export default function BloodCompatibilityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const [direction, setDirection] = useState<CompatibilityDirection>('donate');

  const mine = profile?.bloodType;
  const matches = mine ? (direction === 'donate' ? recipientsFor(mine) : donorsFor(mine)) : [];

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing['3xl'] },
      ]}
      showsVerticalScrollIndicator={false}>
      <ScreenHeader
        title="Compatibility"
        subtitle="Which blood types work together, and where yours fits."
        showBack
        onBack={() => router.back()}
        large={false}
      />

      <FadeIn>
        <SegmentedControl options={OPTIONS} value={direction} onChange={setDirection} />
      </FadeIn>

      {/* Personal answer first — the table is the reference behind it. Rendered
          only once the profile resolves, so no wrong type ever flashes. */}
      {mine ? (
        <FadeIn delay={30}>
          <Card variant="tinted" tint={theme.brandSubtle}>
            <ThemedText type="footnote" color="textSecondary">
              {direction === 'donate'
                ? `You are ${mine}. Your blood can go to`
                : `You are ${mine}. You can receive from`}
            </ThemedText>
            <ThemedText type="title2" color="brand" style={styles.matchList}>
              {matches.join('  ·  ')}
            </ThemedText>
            {mine === UNIVERSAL_DONOR && direction === 'donate' ? (
              <ThemedText type="footnote" color="textSecondary" style={styles.note}>
                O− is the universal donor — every patient can take your red cells, which is
                why O− is the type centers run short of first.
              </ThemedText>
            ) : null}
            {mine === UNIVERSAL_RECIPIENT && direction === 'receive' ? (
              <ThemedText type="footnote" color="textSecondary" style={styles.note}>
                AB+ is the universal recipient — you can accept red cells from any donor.
              </ThemedText>
            ) : null}
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn delay={60}>
        <View style={styles.tableBlock}>
          <ThemedText type="headline">
            {direction === 'donate' ? 'Donor to patient' : 'Patient from donor'}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary">
            {direction === 'donate'
              ? 'Read across a row: a droplet marks a patient type that row’s donor can supply.'
              : 'Read across a row: a droplet marks a donor type that row’s patient can accept.'}
          </ThemedText>
          <BloodCompatibilityTable direction={direction} highlight={mine} />
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <Ionicons name="water" size={15} color={theme.brand} />
              <ThemedText type="footnote" color="textSecondary">
                Compatible
              </ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.blank, { backgroundColor: theme.borderStrong }]} />
              <ThemedText type="footnote" color="textSecondary">
                Not compatible
              </ThemedText>
            </View>
            {mine ? (
              <View style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: theme.brandSubtle, borderColor: theme.brand }]} />
                <ThemedText type="footnote" color="textSecondary">
                  Your row ({mine})
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={90}>
        <Card variant="outline">
          <View style={styles.footRow}>
            <Ionicons name="information-circle-outline" size={20} color={theme.textSecondary} />
            <ThemedText type="footnote" color="textSecondary" style={styles.footText}>
              This chart covers red cell compatibility by ABO and Rh type. Plasma and platelets
              follow different rules, and every donation is cross-matched at the center before
              transfusion.
            </ThemedText>
          </View>
        </Card>
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  matchList: { marginTop: Spacing.xs },
  note: { marginTop: Spacing.sm },
  tableBlock: { gap: Spacing.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base, marginTop: Spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  blank: { width: 5, height: 5, borderRadius: Radius.full, opacity: 0.5 },
  swatch: { width: 14, height: 14, borderRadius: Radius.sm, borderWidth: 1 },
  footRow: { flexDirection: 'row', gap: Spacing.md },
  footText: { flex: 1 },
});
