import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'donornet:';

export async function getItem<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // best-effort persistence
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // best-effort removal
  }
}

/**
 * Device-local state only. Auth sessions are handled by Better Auth (SecureStore
 * / cookies) and all donor data is server-side, so what lives here is the
 * first-run onboarding flag plus the donation-preparation reminder state: a
 * local notification schedule *is* device state — it belongs to this install,
 * not to the account, and cannot be reconstructed from the server.
 */
export const StorageKeys = {
  onboarded: 'onboarded',
  /** User preference for donation-preparation reminders. Absent means on. */
  prepReminders: 'prep-reminders',
  /** Last reconciled prep-reminder schedule signature; keeps reconciliation idempotent across launches. */
  prepReminderSignature: 'prep-reminder-signature',
} as const;
