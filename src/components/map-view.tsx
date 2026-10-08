/**
 * Web fallback for the nearby map. `react-native-maps` has no web support and
 * importing it in the web bundle would break the build, so Metro resolves the
 * `.native.tsx` sibling on iOS/Android and this file everywhere else. The route
 * stays navigable on web — it just explains where the map lives.
 */

import { EmptyState } from '@/components/ui';

export function NearbyMap() {
  return (
    <EmptyState
      icon="map-outline"
      title="Map is in the mobile app"
      subtitle="Open DonorNet on your phone to see nearby centers and requests on a map."
    />
  );
}
