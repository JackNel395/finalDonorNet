/**
 * One donor in the console's account grid.
 *
 * The list was a `DataTable`. A table is the right shape for the request queue —
 * ten narrow, comparable columns an operator scans down. An account is not that:
 * staff arrive here with one person in mind, and the fields that identify a
 * person (who they are, how to reach them, what state their account is in) read
 * better stacked in a card than spread across a row.
 *
 * Local to src/components/admin rather than promoted to src/components/ui: it
 * is bound to `AdminDonor`, and the ui barrel is imported by every donor screen.
 *
 * The avatar's color is the donor's own pick from profile setup, the same one
 * the donor app draws — not a hash of their name. An account with no profile has
 * no pick yet and falls back to the brand tint, which is itself the signal that
 * there is nothing behind it.
 *
 * Web-only, like every module in this directory.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Badge, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateWithYear } from '@/lib/format';
import type { AdminDonor } from '@/types/api';

/**
 * Three distinct account states, each with its own words. An unfinished signup
 * is operational information, not a failure, so it is named rather than lumped
 * in with a suspension.
 */
function accountState(donor: AdminDonor) {
  if (donor.banned) return { label: 'Suspended', tone: 'danger' as const };
  if (donor.hasProfile) return { label: 'Active', tone: 'success' as const };
  return { label: 'No profile', tone: 'warning' as const };
}

export function DonorCard({ donor, onOpen }: { donor: AdminDonor; onOpen: () => void }) {
  const theme = useTheme();
  const state = accountState(donor);

  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessibilityRole="summary">
      <View style={styles.head}>
        <Avatar name={donor.fullName} color={donor.avatarColor} size={48} />
        <View style={styles.identity}>
          <ThemedText type="headline" numberOfLines={1}>
            {donor.fullName}
          </ThemedText>
          {donor.bloodType ? (
            <ThemedText type="subhead" style={[styles.bloodType, { color: theme.brand }]}>
              {donor.bloodType}
            </ThemedText>
          ) : (
            <ThemedText type="subhead" color="textTertiary">
              No blood type
            </ThemedText>
          )}
        </View>
      </View>

      <View style={styles.facts}>
        <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
          {donor.email}
        </ThemedText>
        <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
          Last donation:{' '}
          {donor.lastDonationDate ? dateWithYear(donor.lastDonationDate) : 'never recorded'}
        </ThemedText>
      </View>

      <Badge label={state.label} tone={state.tone} />

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <ThemedText type="footnote" color="textTertiary" numberOfLines={1} style={styles.city}>
          {donor.city ?? 'No city on file'}
        </ThemedText>
        <Button
          label="View"
          variant="secondary"
          size="sm"
          // Standalone: a screen reader walking the grid hears which account
          // each of the dozen identical "View" buttons opens.
          accessibilityLabel={`View ${donor.fullName}`}
          onPress={onOpen}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Not `Card`: the grid needs each item to stretch to the tallest in its row,
  // which `Card`'s own padding/shadow wrapper does not pass through.
  card: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.lg,
    gap: Spacing.md,
    boxShadow: '0 1px 2px rgba(22, 25, 45, 0.04)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  bloodType: { fontWeight: '700' },
  facts: { gap: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    // Pushes the action to the card's bottom edge so every card in a row ends
    // on the same line regardless of how long its email wrapped.
    marginTop: 'auto',
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  city: { flex: 1, minWidth: 0 },
});
