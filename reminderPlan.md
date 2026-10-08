# Reminder Plan — Blood Donation Preparation Reminders

Three local reminders in the week before a booked donation, a preparation surface those reminders open, and a preference to turn them off. Goal: fewer donors turned away at the center for dehydration, no food, or no valid ID — a wasted trip for them and a wasted slot for the center.

**Status:** phases 0-6 implemented and the feature is code-complete. Phase 7 is partly done — static checks (lint, typecheck, web build, copy review) pass; the on-device pass in Expo Go is outstanding and needs a physical device. This file is the single source of truth for implementation progress. Every task is a checkbox — `[ ]` not implemented, `[x]` implemented. Tick them as work lands.

**Context:** the app already books appointments (`src/app/book.tsx` → `POST /api/appointments`) and already ships exactly one local notification — the "you're eligible again" nudge (`scheduleEligibleAgain`, `src/lib/notifications.ts:146`). Between booking and donating, the donor hears nothing. This feature fills that gap by extending the existing notification module rather than standing up a parallel one: the lazy-require pattern, the `data.url` deep-link convention, and `useNotificationObserver` in the root layout are all reused as-is.

---

## Safety boundaries

**Non-negotiable, and they constrain every phase below.** This feature prepares a donor; it does not assess one.

- Reminders and the preparation screen give **general preparation guidance only**. They state no eligibility rule, no deferral criterion, no threshold (no weight, no age, no haemoglobin, no medication list, no travel-destination list).
- Nothing in this feature reads, writes, infers, or displays a medical eligibility decision. The existing `computeEligibility` / `PH_DONATION_INTERVAL_DAYS` logic in `src/lib/blood.ts` is about **booking spacing**, not medical fitness, and must not be pulled into any reminder copy to imply "you are eligible".
- Every surface carries the line verbatim: **"Final eligibility is always determined by trained donation-center staff."**
- The checklist item about health disclosure is phrased as an action directed at staff ("Tell staff about…"), never as a self-assessment ("Make sure you have no…").
- The safety note is rendered in a neutral / `info` treatment, never `warning` or `danger`. It is a statement of who decides, not an alarm.
- Copy tone stays encouraging, calm, and concise — no guilt, no urgency language, no game mechanics (per `design-system/DESIGN_PRINCIPLES.md`).

---

## Assumptions and dependencies

| Assumption | Evidence / consequence |
|---|---|
| `expo-notifications ~57.0.6` is installed and configured | `package.json`; `app.json` plugin `["expo-notifications", { "defaultChannel": "default" }]`. No new dependency, no `npx expo install` needed. |
| **Local** notifications work in Expo Go on iOS *and* Android | `FEATURES_PLAN.md` §D. This whole feature is local-only, so it is fully testable in Expo Go — unlike remote push, which needs a dev build on Android. |
| The lazy-`require` of `expo-notifications` is load-bearing | `src/lib/notifications.ts:37` — a static import throws at **module scope** on Android in Expo Go, and the root layout imports that file, so it would be fatal at startup. Every new function must go through the existing `available()` gate. |
| Web has no notifications at all | `available()` returns `null` on web; all scheduling no-ops and the UI must still work. |
| One active appointment at a time | `upcomingAppointment()` (`src/lib/booking.ts:115`) plus the 409 in `POST /api/appointments`. Reminders therefore cover exactly one appointment. |
| The preference is device state, not account state | No preferences table in `src/db/schema.ts`, and a local notification schedule is inherently per-device. AsyncStorage via `src/lib/storage.ts`; **no schema change, no `npm run db:push`.** |
| `extra.eas.projectId` exists | Needed only for *remote* push tokens, not for local scheduling. Not a dependency of this feature. |
| Earliest bookable slot is `08:30` | `SLOTS`, `src/lib/booking.ts:20` — drives the day-of fire time decision below. |

---

## Decisions (confirmed with user)

- **Day-of reminder fires 07:00 local, with a same-day fallback.** If the 07:00 instant has already passed but the appointment is still ≥ 90 minutes away (someone booking at 10:00 for a 13:00 slot), the same stage fires at `appointment − 90 min` instead of being skipped. One day-of reminder either way — a fallback *time*, not a fourth stage.
- **Checklist rows are tappable with ephemeral ticks.** Real `accessibilityRole="checkbox"` semantics, but state resets when the screen closes. It is a focus aid, not a record — no persistence, no staleness, no cleanup obligation.
- **One master toggle, defaulting to on.** Not per-stage switches, not opt-in. It is purely local, one tap to turn off, and already gated on an OS notification grant.
- **The preparation surface is a modal route** (`src/app/prepare.tsx`), not an extended `ConfirmSheet`. It must scroll at large system text sizes and be deep-linkable from a cold-start notification tap; `ConfirmSheet`'s documented contract is non-scrollable with no snap points, and forking it would violate `design-system/COMPONENTS.md`.

---

## Design-system conformance

Per `AGENTS.md`, no new visual style and no literal visual values. Every new surface composes what exists:

| New surface | Reuses |
|---|---|
| Prep screen chrome | `donor-card.tsx`'s modal pattern — close button + `ThemedText type="headline"`, `presentation: 'modal'` |
| Prep screen hero | `appointment/[id].tsx:122-137` verbatim in spirit — `Card variant="tinted" tint={theme.infoSubtle}` + the `monthAbbrev`/`dayOfMonth` date badge |
| Date / time strings | `longDate`, `timeOfDay`, `monthAbbrev`, `dayOfMonth` from `src/lib/format.ts` |
| Donation type label | `DONATION_TYPE_LABEL` from `src/lib/booking.ts` — and **delete** the duplicated local `TYPE_LABEL` map at `src/app/appointment/[id].tsx:23` |
| Checklist container | `Card padding={0}` + `StyleSheet.hairlineWidth` dividers, as in `profile.tsx`'s `Section` |
| Checklist / settings rows | `PressableScale` with `haptic="light"`, like `profile.tsx`'s `SettingRow` |
| Action bar | the `actionBar` + `barButton` styles from `appointment/[id].tsx:265-276` |
| Async states | `SkeletonCard`, `EmptyState`, `useToast`, `haptics` — the four-state table in `design-system/PATTERNS.md` |
| Settings chrome | `ScreenHeader title showBack`, `Card variant="tinted"`, `Button variant="secondary"` |
| Permission card | same shape and no-nag philosophy as `src/components/enable-push-card.tsx` |
| Tokens | `Colors` via `useTheme()`, `Spacing`, `Radius`, `Shadow`, `MaxContentWidth`, `TabBarClearance` — no literals |
| Icons | `Ionicons` only (`@expo/vector-icons`), 18/20/22pt, `textSecondary` default |

**Two explicit non-additions**, applying `COMPONENTS.md`'s promotion rule (a primitive needs ≥ 2 screens *and* an API smaller than the JSX) honestly:

- **No `src/components/ui/switch-row.tsx`.** It would appear in exactly one screen, and `COMPONENTS.md` says not to wrap a platform-native control for a custom skin. Use React Native's own `Switch` inline. Revisit only if the Privacy / Appearance rows in `profile.tsx` ever grow real toggles.
- **No new `Checklist` primitive.** The prep screen is its only consumer; keep `PrepItem` local to that file.

**Non-color-only status cues** (`AGENTS.md`, `PATTERNS.md`):

- Checklist ticks change **glyph shape** — `checkmark-circle` vs `ellipse-outline` — not only color. Checked rows additionally shift the label to `color="textSecondary"`.
- The permission card carries its state in icon + heading + body text, so it reads correctly in greyscale.
- The toggle is a native `Switch` (position is the cue) inside a row whose subtitle states what is on.

---

## Phase 0 — Groundwork: storage keys and query key

No behavior change; just the keys later phases write through.

- [x] **`src/lib/storage.ts`** — extend `StorageKeys`:
  - `prepReminders: 'prep-reminders'` — the user preference. Absent ⇒ on.
  - `prepReminderSignature: 'prep-reminder-signature'` — last reconciled schedule signature, so reconciliation is idempotent across launches.
- [x] **`src/lib/storage.ts`** — update the file's doc comment, which currently claims "Only the first-run onboarding flag lives on the device now." The honest justification: a local notification schedule *is* device state.
- [x] **`src/hooks/api/keys.ts`** — add `prepReminders: ['prep-reminders'] as const` beside `push`, with the same "device state, not an endpoint" comment.
- [x] Confirm **no** change to `src/db/schema.ts` and **no** `npm run db:push`.

**Acceptance:** `npx tsc --noEmit` clean. `qk.prepReminders` and both `StorageKeys` entries resolve from an editor. Nothing user-visible changed.

---

## Phase 1 — Scheduling primitives

All in **`src/lib/notifications.ts`**, all behind the existing `available()` gate. **No new top-level `expo-notifications` import** — see Assumptions.

- [x] Private constants: `PREP_CHANNEL = 'donation-prep'`, `PREP_ID_PREFIX = 'prep:'`, `SAME_DAY_LEAD_MINUTES = 90`.
- [x] `ensurePrepChannel()` — private, mirrors `ensureAndroidChannel()`: `name: 'Donation reminders'`, `importance: AndroidImportance.DEFAULT`, `lockscreenVisibility: PUBLIC`. **A second channel is the point:** the existing `default` channel is "Blood requests" at HIGH importance, and a preparation nudge must be mutable without silencing an emergency alert.
- [x] `prepIdFor(appointmentId, stage)` → `` `prep:${appointmentId}:${stage}` ``. Deterministic, so a reschedule replaces and a cancel targets exactly this appointment. Cannot collide with the fixed `'eligible-again'` id.
- [x] Export `type PrepStageKey = 'd7' | 'd2' | 'd0'` and `interface PrepStage { key; daysBefore; hour; title; body }`.
- [x] Export `PREP_STAGES` with this copy **exactly** (the UI reads it from here so it never drifts):

  | Stage | When | Title | Body |
  |---|---|---|---|
  | `d7` | 7 days before, 09:00 | Your donation is a week away | Your blood donation is coming up. Start preparing by staying well and keeping hydrated. |
  | `d2` | 2 days before, 09:00 | Your donation is in two days | Your donation is in two days. Drink plenty of water, eat balanced meals, and rest well. |
  | `d0` | donation day, 07:00 | Today is donation day | Today is donation day. Eat a light, healthy meal, bring a valid ID, and tell donation staff about medications, recent travel, illness, or relevant health conditions. |

- [x] Export `prepStageFireAt(appointmentISO, stage, now?): Date | null` — pure, no native module, so it is testable in isolation:
  - copy the appointment date, `setDate(date - stage.daysBefore)`, then `setHours(stage.hour, 0, 0, 0)`. Re-setting the hour *after* `setDate` is what makes month-end and DST rollover correct.
  - for `daysBefore === 0`, apply the **same-day fallback**: if 07:00 has passed but the appointment is still ≥ `SAME_DAY_LEAD_MINUTES` away, return `appointment − 90 min`.
  - return `null` unless the instant is more than 60s out — the guard avoids racing a trigger the OS would drop.
- [x] Export `schedulePrepReminders({ appointmentId, appointmentISO, devFireInSeconds? }): Promise<PrepStageKey[]>`:
  - `available()` guard → `ensurePrepChannel()` → `cancelPrepReminders(appointmentId)` first, so stages replace and never stack;
  - per stage, `scheduleNotificationAsync({ identifier: prepIdFor(...), content: { title, body, data: { url: '/prepare?id=<id>&stage=<key>' } }, trigger: { type: SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: PREP_CHANNEL } })`;
  - skip any stage whose `prepStageFireAt` is `null` (booked 3 days out ⇒ only `d2` and `d0`);
  - try/catch around the loop, return the stages that succeeded. Degrade, never throw — the contract `scheduleEligibleAgain` already sets.
- [x] Export `cancelPrepReminders(appointmentId)` — loop `PREP_STAGES`, cancel each id in its own try/catch (a missing id is fine, same as `cancelEligibleAgain`).
- [x] Export `cancelAllPrepReminders()` — `getAllScheduledNotificationsAsync()`, cancel every request whose `identifier.startsWith(PREP_ID_PREFIX)`. Enumerating rather than requiring the caller to know ids is what makes sign-out correct.
- [x] Dev path inside `schedulePrepReminders`: when `devFireInSeconds` is set, use `SchedulableTriggerInputTypes.TIME_INTERVAL` with `seconds: devFireInSeconds * (index + 1)`, `repeats: false`. Keeps Phase 7 from waiting a week.
- [x] Leave `scheduleEligibleAgain` / `cancelEligibleAgain` / `useNotificationObserver` / `configureNotificationHandler` untouched.

**Acceptance:** `npx tsc --noEmit` and `npm run lint` clean. The app still boots in Expo Go on **Android** (the lazy-require regression test — a static import here is fatal). Calling `prepStageFireAt` with a hand-built date returns the expected instants for an 8-day-out, 3-day-out, same-day-before-07:00, and same-day-at-10:00-for-13:00 appointment, and `null` for anything past. Nothing schedules yet — no caller exists.

---

## Phase 2 — Preference state

- [x] **New `src/hooks/use-prep-reminders.ts`**, doc-commented the way `use-push.ts` is: a read hook that never schedules, a mutate hook that is the only writer.
- [x] `usePrepRemindersPref()` — `useQuery({ queryKey: qk.prepReminders, queryFn: async () => (await getItem<boolean>(StorageKeys.prepReminders)) ?? true, staleTime: Infinity, retry: false as const })`. The `?? true` is the on-by-default decision.
- [x] `useSetPrepRemindersPref()` — `mutationFn` writes the flag and, **when turning off**, immediately `await cancelAllPrepReminders()` and clears the stored signature. `onSuccess: (next) => qc.setQueryData<boolean>(qk.prepReminders, next)`. Cancelling inside the mutation rather than waiting for Phase 3's effect keeps the toggle honest regardless of what is mounted.

**Acceptance:** `npx tsc --noEmit` clean. Driven from a temporary dev button, toggling writes `donornet:prep-reminders` and the query reflects it after a reload. A fresh install with no stored value reads `true`.

---

## Phase 3 — Reconciliation

The piece that keeps the OS scheduler in sync with app state.

- [x] `useDonationPrepReminders(): void` in `src/hooks/use-prep-reminders.ts`. Reads `useAppointments()`, `usePrepRemindersPref()`, `usePushState()`; derives `upcoming` with `useMemo(() => upcomingAppointment(appointments), [appointments])` — **reuse** `src/lib/booking.ts`, do not re-derive.
- [x] Signature string: `` `v1|${enabled ? 'on' : 'off'}|${permission}|${upcoming?.id ?? '-'}|${upcoming?.date ?? '-'}` ``.
- [x] **Return early while any input is `undefined`.** The single most important guard in the feature: `useAppointments().data` is `undefined` before the first fetch, and treating that as `[]` reads as "no upcoming appointment ⇒ cancel everything", wiping a valid schedule on every cold start.
- [x] A `useRef<string | null>` holds the last applied signature, hydrated once from `StorageKeys.prepReminderSignature` behind a `hydrated` state flag that gates the first reconcile. A relaunch with unchanged state then does zero native work.
- [x] Reconcile effect keyed on `[signature, hydrated]`, with an `inFlight` ref so overlapping refetches cannot interleave: parse the previous signature's appointment id and `cancelPrepReminders(prevId)` if it differs; then either `schedulePrepReminders({ appointmentId, appointmentISO })` when `enabled && permission === 'granted' && upcoming`, or `cancelAllPrepReminders()`. Finally store the signature in the ref and in AsyncStorage.
- [x] All calls fire-and-forget `void`; nothing throws into render.
- [x] **Mount in `src/app/(tabs)/_layout.tsx`**, one line beside the existing `usePrefetchAppData()`. Rationale: it is the authenticated area, it stays mounted for the whole signed-in session (root-stack modals render above it without unmounting it), and it never mounts for `(auth)` / `onboarding`, so a signed-out device never schedules.

**Acceptance:** with notifications granted and an appointment ≥ 8 days out, `getAllScheduledNotificationsAsync()` logs exactly three `prep:` ids. Backgrounding and relaunching the app does **not** re-schedule (signature unchanged) and does **not** clear them (the `undefined` guard holds). Toggling the preference off empties them; on restores them. Changing the appointment date yields exactly three ids, not six.

---

## Phase 4 — Preparation surface

- [x] **New route `src/app/prepare.tsx`**; register in **`src/app/_layout.tsx`** as `<Stack.Screen name="prepare" options={{ presentation: 'modal' }} />`.
- [x] Params `useLocalSearchParams<{ id?: string; stage?: PrepStageKey }>()`. `stage` is **advisory only** — it tunes one line of lead copy; the checklist is identical for every stage so a late tap never shows stale guidance.
- [x] Chrome: `View` on `theme.background`; 44pt `PressableScale` close button (`Ionicons name="close"`, `accessibilityLabel="Close"`) beside `ThemedText type="headline"` "Prepare to donate". Close handler `router.canGoBack() ? router.back() : router.replace('/(tabs)/home')` — **a cold-start notification tap has no back stack**.
- [x] `ScrollView` with `paddingHorizontal: Spacing.lg`, `gap: Spacing.md`, `paddingBottom: insets.bottom + 120`, `maxWidth: MaxContentWidth`, `alignSelf: 'center'`.
- [x] Four async states off `useAppointment(id)`:
  - [x] **loading** — two `SkeletonCard`s shaped like the hero + checklist card.
  - [x] **empty / no `id`** — `EmptyState icon="calendar-outline"`, "Appointment not found", "This appointment may have been cancelled. Book a new visit when you're ready.", `actionLabel="Book a donation"` → `router.replace('/book')`.
  - [x] **error** — inline `Card variant="outline"`, `alert-circle-outline`, "We couldn't load your appointment details.", `Button label="Try again" variant="secondary"` → `refetch()` (already on the returned object, since `useAppointment` delegates to `appointmentsQuery`).
  - [x] **success** — the content below.
- [x] **Appointment date and time** hero: `Card variant="tinted" tint={theme.infoSubtle}`, the `monthAbbrev`/`dayOfMonth` badge, `title2` center name, `subhead color="textSecondary"` = `` `${longDate(date)} · ${timeOfDay(date)}` ``, and `DONATION_TYPE_LABEL[type]` as a `footnote`.
- [x] Replace the duplicated local `TYPE_LABEL` map in `src/app/appointment/[id].tsx:23` with the `booking.ts` export while here.
- [x] **Checklist** in `Card padding={0}` with hairline dividers, items exactly:
  1. Feel well today
  2. Stay hydrated
  3. Eat a light, healthy meal
  4. Bring a valid ID
  5. Tell staff about medications, travel, illness, or relevant health conditions
- [x] Local `PrepItem` row: `PressableScale`, `minHeight: 52`, `paddingHorizontal: Spacing.base`, `paddingVertical: Spacing.md`, `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`, `accessibilityLabel={label}`, `haptic="light"`. Leading `Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'}` size 22 — **shape changes, not only color**. `ThemedText type="body"` with `flex: 1` and **no `numberOfLines`**, so item 5 wraps instead of clipping at large text sizes.
- [x] Ticks as `useState<Record<string, boolean>>({})` — ephemeral, per the confirmed decision.
- [x] **Safety note**: `Card variant="outline"`, `Ionicons name="information-circle-outline"`, `ThemedText type="footnote" color="textSecondary"` — "Final eligibility is always determined by trained donation-center staff." Neutral/`info`, never `warning`. Re-read Safety boundaries before writing any other copy on this screen.
- [x] **Primary action**: bottom action bar reusing `appointment/[id].tsx`'s `actionBar` style (absolute, `surfaceElevated`, hairline top border, `paddingBottom: insets.bottom || Spacing.base`) with one `Button label="View appointment details" icon="calendar-outline" fullWidth` → `router.replace({ pathname: '/appointment/[id]', params: { id } })`. `replace`, so the user doesn't stack prepare-under-detail and then back into a modal they've finished with.
- [x] **Second entry point** — in `src/app/appointment/[id].tsx`, for `isActive` appointments add a pressable `Card` row above "Get directions": `shield-checkmark-outline`, "How to prepare", `accessibilityLabel="How to prepare for your donation"` → `router.push({ pathname: '/prepare', params: { id } })`. This makes the surface discoverable at all, and reachable on web where notifications don't exist.

**Acceptance:** `/prepare?id=<real>` shows the correct date and time; `?id=bogus` and a missing `id` both show the empty state; airplane mode on a cold cache shows the error state and `Try again` recovers. Every checklist row is ≥ 44pt and announces as a checkbox with its checked state under VoiceOver/TalkBack. The safety note is present and the primary action lands on appointment detail. The screen renders in light and dark, and at the largest system text size item 5 wraps rather than clipping. The "How to prepare" row works on web.

---

## Phase 5 — Reminder preferences

- [x] **New route `src/app/notification-settings.tsx`**; register in `src/app/_layout.tsx` as `presentation: 'modal'`. A route rather than inline expansion because `SettingRow` already draws a chevron whenever `onPress` exists, and permission recovery needs room for an explanatory card plus an action.
- [x] **`src/app/(tabs)/profile.tsx`** — the `preferences` array's Notifications row (`profile.tsx:75`, currently dead with a hardcoded `detail: 'On'`) gains `onPress: () => router.push('/notification-settings')` and a live detail:
  - `'unsupported'` → "Unavailable"; `'granted'` → "On"/"Off" from the preference; either still loading → `''` (empty keeps `SettingRow`'s `row.detail ? … : null` from flashing a wrong value); otherwise → "Needs permission".
- [x] Screen chrome: `ScreenHeader title="Notifications" showBack onBack={() => router.back()} large={false}` in a `ScrollView` with `Spacing.base` edge padding.
- [x] **Permission card, only when `permission !== 'granted'`** — `Card variant="tinted"`, state carried by icon + heading + body:
  - [x] `undetermined` — `notifications-outline`, "Turn on notifications", "Reminders are sent by your device. Allow notifications so we can send them.", `Button label="Allow notifications" variant="secondary"` → the existing `useEnablePush()`. It writes `qk.push`, which Phase 3 watches, so a grant schedules immediately.
  - [x] `denied` — `notifications-off-outline`, "Notifications are turned off", "Reminders can't be delivered until you allow notifications for DonorNet in your device settings.", `Button label="Open settings"` → `Linking.openSettings()`.
  - [x] `unsupported` — `phone-portrait-outline`, "Reminders need a phone or tablet", "Donation reminders aren't available on this device.", no button.
- [x] **The toggle** in `Card padding={0}` — a local `ToggleRow`, no new UI primitive (see Design-system conformance):
  - `Pressable` with `minHeight: 56`, `accessibilityRole="switch"`, `accessibilityState={{ checked, disabled: isPending }}`, `accessibilityLabel="Donation preparation reminders"`, `accessibilityHint="Sends reminders 7 days, 2 days, and the morning of your donation"`;
  - React Native `Switch` inside it with `trackColor={{ false: theme.borderStrong, true: theme.brand }}`, `thumbColor` only on Android, `ios_backgroundColor`, plus `pointerEvents="none"` and `importantForAccessibility="no-hide-descendants"` so **the row owns both the gesture and the single a11y node**;
  - title "Donation preparation reminders", subtitle "7 days before, 2 days before, and the morning of your donation."
- [x] The row stays interactive in **every** permission state — a preference is a preference; the card above explains why nothing will arrive yet.
- [x] Feedback: `useToast()` + `haptics.success()` — "Preparation reminders on." / "Preparation reminders off."; on mutation failure "Could not save your reminder setting. Please try again." as `'danger'`.
- [x] **Static explainer**, `footnote color="textSecondary"`: "Reminders are scheduled on this device for your next booked donation. They're general preparation tips — final eligibility is always determined by trained donation-center staff."

**Acceptance:** the Profile row navigates and its detail reflects real state in all four permission cases. One tap anywhere on the toggle row flips the switch, and it announces as a switch with its checked state. Granting from the `undetermined` card hides the card and schedules reminders without a reload. On web the screen shows the unsupported card and no button. Light and dark both correct; the screen is legible in greyscale.

---

## Phase 6 — Lifecycle integration

- [x] **Booking** — verify no change is needed: `useBookAppointment` already invalidates `qk.appointments`, the signature changes, Phase 3 schedules. Deliberately **do not** also schedule from `book.tsx`; two writers to the same ids drift.
- [x] **Cancel** — verify `useCancelAppointment`'s invalidation flips `upcomingAppointment` to `undefined` and reconcile cancels. No mutation change.
- [x] **Complete** — same path cancels prep. Confirm it does not disturb the eligibility reminder, which keeps its fixed `'eligible-again'` id on the `default` channel.
- [x] **Rebooking the same id at a new date** — confirm the signature's ISO date triggers a reschedule and `schedulePrepReminders`' leading cancel prevents stacking.
- [x] **Sign-out** (`src/app/(tabs)/profile.tsx`, the `ConfirmSheet onConfirm`) — after `queryClient.clear()`, add `await cancelAllPrepReminders()`, `await cancelEligibleAgain()`, and clear `StorageKeys.prepReminderSignature`. **`queryClient.clear()` does not touch the OS scheduler**, so without this the next person on the device inherits the previous donor's reminders. Leave `StorageKeys.prepReminders` alone — it is a device preference.
- [x] Confirm `scheduleEligibilityReminder` stays exactly where it is, in `src/components/enable-push-card.tsx`.

**Acceptance:** booking schedules, cancelling and completing clear, rebooking replaces rather than stacks, and after sign-out neither `prep:` nor `eligible-again` entries remain. The eligibility reminder still fires independently of the preference toggle.

---

## Phase 7 — Testing and verification

Physical device, Expo Go (`Device.isDevice` gates everything). The `__DEV__` short-offset path means nothing waits a week.

- [x] **Dev test affordance** — a `__DEV__`-only row in `notification-settings.tsx` labelled "Send test reminders now (dev)" calling `schedulePrepReminders({ ..., devFireInSeconds: 15 })` for the current upcoming appointment. Guard the **call site**, not the library. Reuse the dashed `devReset` style already in `profile.tsx`'s stylesheet.
- [ ] Profile → Notifications: the permission card matches the real OS state; one tap anywhere on the row flips the switch.
- [ ] Allow notifications → blocker card disappears, Profile row detail reads "On".
- [ ] Book ≥ 8 days out, background the app, tap the dev row → three banners 15s apart with the **exact** Phase 1 copy.
- [ ] Android: the banners land on a "Donation reminders" channel mutable independently of "Blood requests" (Settings → Apps → Expo Go → Notifications).
- [ ] Tap a banner from background → `/prepare` opens with that appointment's date and time. Force-quit, tap another → same, and Close lands on Home rather than dead-ending.
- [ ] Toggle off → background → nothing arrives, and `getAllScheduledNotificationsAsync()` shows no `prep:` entries.
- [ ] Toggle on, then cancel the appointment from `/appointment/[id]` → `prep:` entries gone.
- [ ] Rebook to a different date twice → exactly three pending `prep:` ids, not six.
- [ ] Stage skipping: book 3 days out → only `d2` and `d0`. Book today before 07:00 → `d0` at 07:00. Book today at 10:00 for a 13:00 slot → one `d0` at 11:30 (the same-day fallback).
- [ ] Sign out → no `prep:` or `eligible-again` entries remain.
- [ ] Accessibility and appearance pass on both new screens: light + dark, largest system text (checklist item 5 wraps, not clips), VoiceOver/TalkBack announces checklist rows as checkboxes with checked state and the toggle as a switch, `useReduceMotion()` on.
- [ ] Greyscale pass — every status is readable without color.
- [x] `npm run web` → both surfaces render; settings shows "Reminders need a phone or tablet". *Verified in a real browser over CDP, signed in as the seeded demo donor: prepare renders the success state (hero, checklist, safety note, action bar) in light and dark, checklist ticks work, settings shows the unsupported card with no button, and one tap on the toggle row label flips the switch, fires the toast, and writes `donornet:prep-reminders=false`.*
- [ ] Android Expo Go boot test (the lazy-require regression) — the app starts without crashing.
- [x] `npm run lint` (which is `expo lint`) and `npx tsc --noEmit`. Both clean. `"typecheck": "tsc --noEmit"` is now a script in `package.json`, so `npm run typecheck` works.
- [x] **Copy review against Safety boundaries** — read every string this feature adds and confirm none states an eligibility rule, threshold, or self-assessment, and that the staff-decide line appears on both new surfaces.

**Acceptance:** every box above ticked. No reminder or screen asserts anything about whether the donor may donate.

**Remaining work is a physical-device pass.** Static verification is done: `npm run lint`, `npm run typecheck`, a web export that builds both `/prepare` and `/notification-settings`, and the copy review above. Everything still unticked needs a real device in Expo Go — delivered banners, the OS permission dialog, Android channel separation, notification taps from background and cold start, `getAllScheduledNotificationsAsync()` inspection, VoiceOver/TalkBack, enlarged text, and the greyscale and dark-mode passes. The `__DEV__` "Send test reminders now" row on the notification settings screen fires all three stages 15s apart, so none of it waits a week.

---

## Known limitations

Accepted for the initial implementation; worth follow-ups, not blockers.

- **Timezone / DST drift** — fire times are computed from the device's local calendar at schedule time, so a donor who changes timezone between booking and donating keeps the old offset until something re-triggers reconciliation. The fix is an `AppState` foreground listener in `useDonationPrepReminders`. Cheap to add later; left out to keep the change scoped.
- **One appointment at a time** — `upcomingAppointment()` returns only the nearest, matching the product's one-active-booking rule. If the API ever allows two, the second gets no reminders.
- **Permission reuse** — `usePushState` / `useEnablePush` conflate "remote blood alerts" with "any notification", and `useEnablePush` also POSTs a token to `/api/push-tokens` — slightly more than a local-only reminder needs. A second permission hook would be the worse duplication, so this is flagged rather than split.
- **No server record of reminders** — entirely device-local, so a donor switching phones re-derives the schedule on first sign-in (correct) but loses nothing else (there is nothing else).
