/**
 * Native nearby map (iOS/Android). This file is picked by Metro's platform
 * resolution so `react-native-maps` never enters the web bundle (see the `.tsx`
 * sibling for the web fallback).
 *
 * Data comes straight from the existing `useCenters()` + `useRequests()` caches
 * — no new endpoints or query keys. Coordinates arrive from the server (centers
 * exact, requests fuzzed to ~110 m); rows without coords simply have no pin.
 *
 * Two independent things can stop a map from rendering here, and each one fails
 * in a way the other's guard cannot catch:
 *
 * 1. The native code may be missing from the runtime entirely — see
 *    `loadMaps()`. This throws at *import* time.
 * 2. Android may lack a Google Maps API key — see `androidMapReady`. This
 *    throws at *mount* time, from inside the native view.
 *
 * The SDK 57 docs say "no additional setup is required when testing your project
 * using Expo Go" — that is not true for Google Maps on Android, nor is the map
 * native code actually present in Expo Go; a device proved both. Trust this
 * comment over the docs page.
 *
 * iOS is unaffected by the key: Apple Maps needs no key.
 */

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { EmptyState, URGENCY_LABEL } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useCenters, useRequests } from '@/hooks/api';
import { useLocationState } from '@/hooks/use-location';
import { useTheme } from '@/hooks/use-theme';
import { distanceLabel } from '@/lib/format';
import type { Urgency } from '@/types/domain';

type MapsModule = typeof import('react-native-maps');

/**
 * Load `react-native-maps` without letting a missing native binary take the
 * whole route down with it.
 *
 * This cannot be a static `import`. `react-native-maps` reaches
 * `TurboModuleRegistry.getEnforcing('RNMapsAirModule')` at module scope (via
 * MapView -> specs/NativeAirMapsModule), and `getEnforcing` *throws* rather than
 * returning null when that module is absent from the binary — as it is in Expo
 * Go. A static import hoists the throw to the top of this file, so this module
 * never finishes evaluating: the crash surfaces as an Invariant Violation, and
 * `src/app/map.tsx` additionally logs "missing the required default export"
 * because its own import of this file never resolved. No error boundary helps,
 * because nothing has rendered yet.
 *
 * A guarded `require` keeps the failure local and lets us show a real message.
 * Catching broadly is deliberate: the native module name has changed across
 * `react-native-maps` versions, so probing for one specific name would quietly
 * regress on upgrade.
 */
function loadMaps(): MapsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-maps') as MapsModule;
  } catch {
    return null;
  }
}

const Maps = loadMaps();

/**
 * Can Android actually mount Google Maps in this runtime? Two things must hold,
 * and checking only one of them is how this broke before:
 *
 * 1. A key is declared in app.json (`android.config.googleMaps.apiKey`). Without
 *    it *no* Android build works — not Expo Go, not a dev build.
 * 2. We are not in Expo Go. Even with the key declared, Expo Go cannot apply it:
 *    it lands in the native manifest at build time, and Expo Go's binary was
 *    built without it.
 *
 * `appOwnership` is deprecated but is the only value that separates Expo Go from
 * a dev build — `executionEnvironment` reports `StoreClient` for both, so gating
 * on it would keep the map hidden in the dev build that can actually show it.
 */
const IS_EXPO_GO = Constants.appOwnership === 'expo';
const HAS_MAPS_KEY = Boolean(Constants.expoConfig?.android?.config?.googleMaps?.apiKey);
const androidMapReady = HAS_MAPS_KEY && !IS_EXPO_GO;

// Metro Cebu anchor — where the seed data lives — used until a device fix lands.
const CEBU_ANCHOR = { latitude: 10.3111, longitude: 123.8931 };
const DELTA = 0.15;

export function NearbyMap() {
  const theme = useTheme();
  const router = useRouter();
  const { data: centers = [] } = useCenters();
  const { data: requests = [] } = useRequests();
  const { data: location } = useLocationState();

  // Urgency → pin color. Only active requests get a pin, so fulfilled/expired
  // hues are never reached, but keeping all four keeps the map self-consistent.
  const urgencyColor: Record<Urgency, string> = {
    critical: theme.danger,
    urgent: theme.warning,
    moderate: theme.info,
    routine: theme.textTertiary,
  };

  const origin = location?.coords ?? CEBU_ANCHOR;
  const centerPins = centers.filter((c) => c.latitude != null && c.longitude != null);
  const requestPins = requests.filter(
    (r) => (r.status === 'open' || r.status === 'partial') && r.latitude != null && r.longitude != null,
  );

  // Both bail-outs sit after the hooks and read only module constants, so the
  // branch taken never changes across renders and hook order stays stable.

  // Expo Go ships no map native code, so there is nothing to render into.
  if (Maps === null) {
    return (
      <EmptyState
        icon="map-outline"
        title="Map needs a development build"
        subtitle="The map's native code isn't part of Expo Go. Run the app in a development build to see the map — centers and requests are all still listed on the other tabs."
      />
    );
  }

  // Mounting MapView without a usable key crashes the app natively, so bail to a
  // message instead.
  if (Platform.OS === 'android' && !androidMapReady) {
    return (
      <EmptyState
        icon="map-outline"
        title="Map needs a Google Maps key"
        subtitle="Android maps require a Google Maps API key in app.json and a development build — Expo Go can't supply one. Centers and requests are all still listed on the other tabs."
      />
    );
  }

  const { default: MapView, Callout, Marker, PROVIDER_GOOGLE } = Maps;

  return (
    <View style={styles.fill}>
      <MapView
        // Google Maps on Android (needs the API key from the dev build); iOS
        // stays on Apple Maps, which needs no key.
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.fill}
        initialRegion={{
          latitude: origin.latitude,
          longitude: origin.longitude,
          latitudeDelta: DELTA,
          longitudeDelta: DELTA,
        }}
        showsUserLocation={location?.status === 'granted'}>
        {centerPins.map((c) => (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.latitude!, longitude: c.longitude! }}
            pinColor={theme.brand}
            onCalloutPress={() => router.push('/book')}>
            <Callout onPress={() => router.push('/book')}>
              <View style={styles.callout}>
                <ThemedText type="bodyStrong">{c.name}</ThemedText>
                <ThemedText type="footnote" color="textSecondary">
                  {distanceLabel(c.distanceKm)} · {c.openNow ? 'Open now' : 'Closed'}
                </ThemedText>
                <ThemedText type="footnote" color="textSecondary">
                  {c.hours}
                </ThemedText>
              </View>
            </Callout>
          </Marker>
        ))}
        {requestPins.map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.latitude!, longitude: r.longitude! }}
            pinColor={urgencyColor[r.urgency]}
            onCalloutPress={() => router.push(`/request/${r.id}`)}>
            <Callout onPress={() => router.push(`/request/${r.id}`)}>
              <View style={styles.callout}>
                <ThemedText type="bodyStrong">
                  {r.bloodType} · {URGENCY_LABEL[r.urgency]}
                </ThemedText>
                <ThemedText type="footnote" color="textSecondary">
                  {r.hospital}
                </ThemedText>
                <ThemedText type="footnote" color="textSecondary">
                  {distanceLabel(r.distanceKm)} away
                </ThemedText>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  callout: { gap: 2, paddingVertical: Spacing.xs, minWidth: 160 },
});
