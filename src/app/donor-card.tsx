/**
 * Digital donor card (modal). A premium, solid-color card with the donor's blood
 * type and a scannable QR code for verification at check-in. See design.md
 * §Donor card, §6 Components (QRCode, solid brand surface).
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, FadeIn, QRCode } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDonations, useProfile } from '@/hooks/api';
import { computeEligibility } from '@/lib/blood';
import { longDate } from '@/lib/format';

export default function DonorCardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const { data: donations = [] } = useDonations();

  if (!profile) return null;

  const eligibility = computeEligibility(profile.lastDonationDate);
  const totalUnits = donations.reduce((sum, d) => sum + d.units, 0);
  const payload = `DONORNET:${profile.id}:${profile.bloodType}:${profile.fullName}`;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[styles.close, { backgroundColor: theme.surfaceSunken }]}>
          <Ionicons name="close" size={22} color={theme.text} />
        </PressableScale>
        <ThemedText type="headline">Donor card</ThemedText>
        <View style={styles.close} />
      </View>

      <View style={styles.center}>
        <FadeIn>
          <View style={[styles.card, Shadow.lg]}>
            <View style={[styles.cardSurface, { backgroundColor: theme.brandDeep }]}>
              <View style={styles.cardHead}>
                <View>
                  <ThemedText type="caption" style={styles.cardBrand}>
                    DONORNET DONOR
                  </ThemedText>
                  <ThemedText type="title2" style={styles.cardName}>
                    {profile.fullName}
                  </ThemedText>
                </View>
                <View style={[styles.bloodBadge, { backgroundColor: theme.brand, borderColor: theme.onBrand }]}>
                  <ThemedText type="title2" style={[styles.bloodText, { color: theme.onBrand }]}>
                    {profile.bloodType}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.qrWrap}>
                <QRCode value={payload} size={180} />
              </View>

              <View style={styles.cardFooter}>
                <View>
                  <ThemedText type="caption" style={styles.footLabel}>
                    LIFETIME UNITS
                  </ThemedText>
                  <ThemedText type="bodyStrong" style={styles.footValue}>
                    {totalUnits}
                  </ThemedText>
                </View>
                <View style={styles.footRight}>
                  <ThemedText type="caption" style={styles.footLabel}>
                    STATUS
                  </ThemedText>
                  <ThemedText type="bodyStrong" style={styles.footValue}>
                    {eligibility.eligible ? 'Eligible' : `${eligibility.daysRemaining}d`}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <ThemedText type="footnote" color="textTertiary" style={styles.hint}>
            Show this code at check-in for quick verification.
            {profile.lastDonationDate ? ` Last donation ${longDate(profile.lastDonationDate)}.` : ''}
          </ThemedText>
        </FadeIn>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Button label="Done" variant="secondary" fullWidth onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  close: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  card: { width: '100%', maxWidth: 360, borderRadius: Radius['2xl'], overflow: 'hidden' },
  cardSurface: { padding: Spacing.xl, gap: Spacing.xl },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardBrand: { color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5 },
  cardName: { color: '#FFFFFF', marginTop: 4 },
  bloodBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloodText: { fontSize: 18 },
  qrWrap: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: Spacing.base,
    borderRadius: Radius.lg,
  },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  footRight: { alignItems: 'flex-end' },
  footLabel: { color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  footValue: { color: '#FFFFFF', marginTop: 2 },
  hint: { textAlign: 'center', maxWidth: 300 },
  actions: { paddingHorizontal: Spacing.lg },
});
