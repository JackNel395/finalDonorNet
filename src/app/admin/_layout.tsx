/**
 * Operations console layout — web-only.
 *
 * This is a plain .tsx file, not .web.tsx: routes under src/app need a
 * non-platform base file to stay universal for deep linking
 * (https://docs.expo.dev/router/advanced/platform-specific-modules/). So the
 * redirect below handles *navigation* on native, and the platform split in
 * src/components/admin handles *bundling*. Both are needed, and this file is
 * deliberately the only admin module the native bundle resolves: the access
 * gate lives in the web-only console component so no admin hook reaches a phone.
 *
 * A real path segment, not a `(admin)` group: the console is addressed as
 * /admin, and a parenthesized group contributes nothing to the URL.
 *
 * This group is not registered inside (tabs).
 */
import { Redirect, Stack } from 'expo-router';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { useScheme } from '@/hooks/use-theme';

export default function AdminLayout() {
  const scheme = useScheme();

  if (Platform.OS !== 'web') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors[scheme].background },
      }}
    />
  );
}
