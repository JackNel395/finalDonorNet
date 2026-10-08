import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { useProfile } from '@/hooks/api';
// The hook alone, by path — never the admin barrel or any console component,
// which stay out of the native bundle. On native it is never enabled.
import { useAdminMe } from '@/hooks/api/admin/use-admin-me';
import { ApiClientError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useAppStore } from '@/store/app-store';

/** The console is web-only; a phone never asks whether its user is staff. */
const CONSOLE_PLATFORM = Platform.OS === 'web';

/**
 * Routing gate. Resolves device state (onboarding), then the auth session, then
 * the server profile: onboarding → sign-in → profile-setup → app. Stays null
 * (splash) until each async source settles so there is no flicker.
 *
 * On the web, a signed-in staff account goes to the console instead of the
 * donor home — that is what they opened a browser for. The role is checked
 * *before* the profile, because a staff account need not have a donor profile
 * and should not be marched through donor setup to reach its work. The console
 * links back to the donor app, and the server stays the actual boundary:
 * `AdminGate` and every `/api/admin` route check the role again.
 */
export default function Index() {
  const { hydrated, onboarded } = useAppStore();
  const { data: session, isPending } = authClient.useSession();
  const hasSession = !!session;
  const adminMe = useAdminMe(CONSOLE_PLATFORM && hasSession);
  const profile = useProfile(hasSession);

  if (!hydrated || isPending) return null;
  if (!onboarded) return <Redirect href="/onboarding" />;
  if (!hasSession) return <Redirect href="/(auth)/sign-in" />;

  if (CONSOLE_PLATFORM) {
    // Hold on the splash rather than guess: landing on /home and then jumping
    // to /admin is the flicker this gate exists to prevent.
    if (adminMe.isLoading) return null;
    if (adminMe.data) return <Redirect href="/admin" />;
    // A 403 is "not staff" — the ordinary donor path below. Any other failure
    // also falls through: a donor is never stranded on a splash because the
    // console's endpoint is down.
  }

  // Signed in — decide between profile-setup and the app.
  if (profile.isLoading) return null;
  const notSetUp = profile.error instanceof ApiClientError && profile.error.status === 404;
  if (notSetUp) return <Redirect href="/profile-setup" />;
  if (!profile.data) return null; // transient error — hold on the splash

  return <Redirect href="/(tabs)/home" />;
}
