/**
 * Main app tab navigator. Uses a custom floating tab bar (see app-tab-bar).
 * Five destinations: Home, Feed, Donor, Learn, Profile.
 */

import { Tabs } from 'expo-router';

import { AppTabBar } from '@/components/app-tab-bar';
import { usePrefetchAppData } from '@/hooks/api';
import { useDonationPrepReminders } from '@/hooks/use-prep-reminders';

export default function TabsLayout() {
  // Warm every tab's data now, while Home is on screen, so switching tabs is
  // instant instead of blank-then-pop on a real device. See usePrefetchAppData.
  usePrefetchAppData();

  // Keep donation-preparation reminders in step with the booked appointment.
  // Here rather than in a screen: this layout is the authenticated area, stays
  // mounted for the whole signed-in session (root-stack modals render above it),
  // and never mounts for (auth)/onboarding — so a signed-out device schedules
  // nothing.
  useDonationPrepReminders();

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...(props as any)} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="donor" options={{ title: 'Donor' }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
