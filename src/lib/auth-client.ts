/**
 * Better Auth client. Web talks to the same-origin API via cookies; native uses
 * the Expo plugin (SecureStore-backed sessions + a forwardable Cookie header).
 */
import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Base URL of the API server.
 * - Web: same-origin ('') — the Expo server serves both the app and the API.
 * - Native dev: the Metro host (e.g. http://192.168.x.x:8081) from expoConfig.
 */
export function getBaseUrl(): string {
  if (Platform.OS === 'web') return '';
  const hostUri = Constants.expoConfig?.hostUri;
  return hostUri ? `http://${hostUri}` : 'http://localhost:8081';
}

export const authClient = createAuthClient({
  baseURL: getBaseUrl() || undefined,
  plugins:
    Platform.OS === 'web'
      ? []
      : [
          expoClient({
            scheme: 'bdsapp',
            storagePrefix: 'donornet',
            storage: SecureStore,
          }),
        ],
});
