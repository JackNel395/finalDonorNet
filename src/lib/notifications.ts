/**
 * Client-only notification primitives, kept free of React so both the push hook
 * and the root layout can pull from one place.
 *
 * Reality of SDK 57 (see FEATURES_PLAN.md §D):
 * - Remote push works in Expo Go on iOS, but needs a development build on Android.
 * - Local notifications (the "eligible again" reminder) work in Expo Go on both.
 * - Web has no push support at all.
 * Every entry point here degrades to a no-op / `'unsupported'` rather than throw,
 * so callers never have to special-case the platform.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { NotificationResponse, NotificationTriggerInput } from 'expo-notifications';

import { PH_DONATION_INTERVAL_DAYS } from '@/lib/blood';

type NotificationsModule = typeof import('expo-notifications');

/**
 * `expo-notifications` throws at **module scope** on Android in Expo Go — SDK 53
 * removed remote push from the Go client. A static `import` therefore crashes the
 * whole app during startup, before any of the platform guards below can run: the
 * root layout imports this file, so the failure is fatal rather than "push is off".
 *
 * Load it lazily and treat a throw as "this runtime has no notifications". We
 * deliberately don't branch on `Constants.executionEnvironment` — SDK 57 reports
 * `StoreClient` for both Expo Go *and* dev-client builds, and a dev build *does*
 * support push, so that check would disable push exactly where it works. Asking
 * the module whether it loads is the honest test.
 */
let cachedModule: NotificationsModule | null | undefined;

function notifications(): NotificationsModule | null {
  if (cachedModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedModule = require('expo-notifications') as NotificationsModule;
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule;
}

/** True when this runtime can do notifications at all (native + module loaded). */
function available(): NotificationsModule | null {
  if (isWeb || !Device.isDevice) return null;
  return notifications();
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Android channel created before any token request (required on Android 13+). */
const DEFAULT_CHANNEL = 'default';

/** Stable id so rescheduling the eligibility reminder replaces, never stacks. */
const ELIGIBLE_AGAIN_ID = 'eligible-again';

/**
 * Preparation reminders get their own Android channel on purpose: `default` is
 * "Blood requests" at HIGH importance, and a donor must be able to mute a
 * preparation nudge without silencing an emergency alert.
 */
const PREP_CHANNEL = 'donation-prep';

/** Namespace for prep ids; `cancelAllPrepReminders` enumerates on this prefix. */
const PREP_ID_PREFIX = 'prep:';

/** Same-day fallback lead: how far ahead of the appointment `d0` may still fire. */
const SAME_DAY_LEAD_MINUTES = 90;

const isWeb = Platform.OS === 'web';

/**
 * Foreground presentation: show a banner + list entry, no sound (a blood alert
 * shouldn't ring in a meeting). Called once from the root layout.
 */
export function configureNotificationHandler() {
  const Notifications = available();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  const Notifications = available();
  if (!Notifications || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL, {
    name: 'Blood requests',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Read-only permission probe. Never prompts; `'unsupported'` off a real device. */
export async function getPushPermission(): Promise<PushPermission> {
  const Notifications = available();
  if (!Notifications) return 'unsupported';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unsupported';
  }
}

export interface PushRegistration {
  token: string;
  platform: 'ios' | 'android';
}

/**
 * Prompt (Android channel first), then fetch the Expo push token. Returns the
 * registration on grant, `'denied'` on a rejected prompt, or `'unsupported'`
 * when the device/runtime can't produce a token (web, simulator, Android Expo
 * Go). Only ever call from an explicit user tap.
 */
export async function requestPushRegistration(): Promise<
  PushRegistration | 'denied' | 'unsupported'
> {
  const Notifications = available();
  if (!Notifications) return 'unsupported';
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported';

  await ensureAndroidChannel(); // must exist before the prompt on Android 13+

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return 'denied';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return 'unsupported';

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token, platform: Platform.OS };
  } catch {
    // No push credentials for this runtime (typically Android in Expo Go).
    return 'unsupported';
  }
}

/**
 * Schedule (or replace) the "you're eligible again" local reminder for 9:00 on
 * the given date. A fixed identifier means repeated calls overwrite rather than
 * pile up. No-op on web and for past dates.
 */
export async function scheduleEligibleAgain(nextEligibleDate: Date): Promise<void> {
  const Notifications = available();
  if (!Notifications) return;

  const fireAt = new Date(nextEligibleDate);
  fireAt.setHours(9, 0, 0, 0);
  if (fireAt.getTime() <= Date.now()) return; // already eligible — nothing to remind

  await cancelEligibleAgain(); // replace any prior schedule
  await Notifications.scheduleNotificationAsync({
    identifier: ELIGIBLE_AGAIN_ID,
    content: {
      title: "You're eligible to donate again 🎉",
      body: `Your ${PH_DONATION_INTERVAL_DAYS}-day recovery window is over. Book your next visit when you can.`,
      data: { url: '/(tabs)/donor' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: DEFAULT_CHANNEL,
    },
  });
}

export async function cancelEligibleAgain(): Promise<void> {
  const Notifications = available();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ELIGIBLE_AGAIN_ID);
  } catch {
    // Nothing scheduled under that id — fine.
  }
}

// ---------------------------------------------------------------------------
// Donation-preparation reminders
//
// Three local reminders in the week before a booked donation. General
// preparation guidance only: nothing here states an eligibility rule, a
// threshold, or a self-assessment - final eligibility is always determined by
// trained donation-center staff.
// ---------------------------------------------------------------------------

async function ensurePrepChannel() {
  const Notifications = available();
  if (!Notifications || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PREP_CHANNEL, {
    name: 'Donation reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export type PrepStageKey = 'd7' | 'd2' | 'd0';

export interface PrepStage {
  key: PrepStageKey;
  daysBefore: number;
  hour: number;
  title: string;
  body: string;
}

/**
 * Reminder copy lives here, not in the UI, so a banner and the preparation
 * screen can never drift apart.
 */
export const PREP_STAGES: readonly PrepStage[] = [
  {
    key: 'd7',
    daysBefore: 7,
    hour: 9,
    title: 'Your donation is a week away',
    body: 'Your blood donation is coming up. Start preparing by staying well and keeping hydrated.',
  },
  {
    key: 'd2',
    daysBefore: 2,
    hour: 9,
    title: 'Your donation is in two days',
    body: 'Your donation is in two days. Drink plenty of water, eat balanced meals, and rest well.',
  },
  {
    key: 'd0',
    daysBefore: 0,
    hour: 7,
    title: 'Today is donation day',
    body: 'Today is donation day. Eat a light, healthy meal, bring a valid ID, and tell donation staff about medications, recent travel, illness, or relevant health conditions.',
  },
] as const;

/**
 * Deterministic per appointment and stage, so a reschedule replaces exactly
 * these notifications and a cancel targets exactly this appointment. Cannot
 * collide with the fixed `'eligible-again'` id.
 */
export function prepIdFor(appointmentId: string, stage: PrepStageKey): string {
  return `${PREP_ID_PREFIX}${appointmentId}:${stage}`;
}

/** A trigger instant is only usable if it's far enough out that the OS won't drop it. */
const TRIGGER_FLOOR_MS = 60_000;

/**
 * When a stage should fire, or `null` if it shouldn't. Pure - no native module,
 * so it is testable in isolation.
 *
 * `d0` carries a same-day fallback: someone booking at 10:00 for a 13:00 slot
 * has already missed 07:00, but the reminder is still worth sending, so it
 * fires 90 minutes before the appointment instead of being dropped.
 */
export function prepStageFireAt(
  appointmentISO: string,
  stage: PrepStage,
  now: Date = new Date(),
): Date | null {
  const appointment = new Date(appointmentISO);
  if (Number.isNaN(appointment.getTime())) return null;

  const nowMs = now.getTime();
  const usable = (d: Date) => (d.getTime() - nowMs > TRIGGER_FLOOR_MS ? d : null);

  const fireAt = new Date(appointment);
  fireAt.setDate(fireAt.getDate() - stage.daysBefore);
  // Setting the hour *after* shifting the date is what keeps month-end and DST
  // rollovers correct.
  fireAt.setHours(stage.hour, 0, 0, 0);

  const onTime = usable(fireAt);
  if (onTime) return onTime;

  if (stage.daysBefore === 0) {
    return usable(new Date(appointment.getTime() - SAME_DAY_LEAD_MINUTES * 60_000));
  }

  return null;
}

export interface SchedulePrepRemindersOptions {
  appointmentId: string;
  appointmentISO: string;
  /** Dev-only: fire the stages seconds apart instead of waiting a week. */
  devFireInSeconds?: number;
}

/**
 * Schedule (or replace) the preparation reminders for one appointment. Cancels
 * first so stages replace rather than stack, skips any stage whose instant has
 * passed (booked 3 days out => only `d2` and `d0`), and degrades rather than
 * throwing - the contract `scheduleEligibleAgain` already sets.
 *
 * Returns the stages that were actually scheduled.
 */
export async function schedulePrepReminders({
  appointmentId,
  appointmentISO,
  devFireInSeconds,
}: SchedulePrepRemindersOptions): Promise<PrepStageKey[]> {
  const Notifications = available();
  if (!Notifications) return [];

  await ensurePrepChannel();
  await cancelPrepReminders(appointmentId); // stages replace, never stack

  const scheduled: PrepStageKey[] = [];
  for (let index = 0; index < PREP_STAGES.length; index += 1) {
    const stage = PREP_STAGES[index];
    try {
      let trigger: NotificationTriggerInput;
      if (devFireInSeconds) {
        trigger = {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: devFireInSeconds * (index + 1),
          repeats: false,
          channelId: PREP_CHANNEL,
        };
      } else {
        const fireAt = prepStageFireAt(appointmentISO, stage);
        if (!fireAt) continue;
        trigger = {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          channelId: PREP_CHANNEL,
        };
      }

      await Notifications.scheduleNotificationAsync({
        identifier: prepIdFor(appointmentId, stage.key),
        content: {
          title: stage.title,
          body: stage.body,
          data: { url: `/prepare?id=${appointmentId}&stage=${stage.key}` },
        },
        trigger,
      });
      scheduled.push(stage.key);
    } catch {
      // One stage failing shouldn't cost the others.
    }
  }
  return scheduled;
}

/** Cancel this appointment's prep reminders. A missing id is fine. */
export async function cancelPrepReminders(appointmentId: string): Promise<void> {
  const Notifications = available();
  if (!Notifications) return;
  for (const stage of PREP_STAGES) {
    try {
      await Notifications.cancelScheduledNotificationAsync(prepIdFor(appointmentId, stage.key));
    } catch {
      // Nothing scheduled under that id - fine.
    }
  }
}

/**
 * Cancel every pending prep reminder, whatever appointment it belongs to.
 * Enumerating rather than requiring the caller to know the ids is what makes
 * sign-out and the preference toggle correct.
 */
export async function cancelAllPrepReminders(): Promise<void> {
  const Notifications = available();
  if (!Notifications) return;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of pending) {
      if (!request.identifier.startsWith(PREP_ID_PREFIX)) continue;
      try {
        await Notifications.cancelScheduledNotificationAsync(request.identifier);
      } catch {
        // Already gone - fine.
      }
    }
  } catch {
    // Can't enumerate on this runtime; nothing to clean up.
  }
}

/** Pull the deep-link target out of a tapped notification's data payload. */
function urlFrom(response: NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

/**
 * Route to a notification's `data.url` when the user taps it — both while the
 * app is running and on cold start (the tap that launched the app). Native only;
 * a no-op on web. Mount once, from the root layout.
 */
export function useNotificationObserver(onNavigate: (url: string) => void) {
  useEffect(() => {
    const Notifications = available();
    if (!Notifications) return;
    let handled = false;

    // Cold start: the notification that launched the app, routed once.
    const initial = urlFrom(Notifications.getLastNotificationResponse());
    if (initial) {
      handled = true;
      onNavigate(initial);
    }

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      // Skip the very first live event if it merely echoes the cold-start tap.
      if (handled && urlFrom(response) === initial) {
        handled = false;
        return;
      }
      const url = urlFrom(response);
      if (url) onNavigate(url);
    });
    return () => sub.remove();
  }, [onNavigate]);
}
