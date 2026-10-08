# Features Plan — Push Notifications, Compatibility, Eligibility, Map View

Four high-impact features, ordered so each phase ships on its own: compatibility polish → eligibility gating → map view → push notifications (biggest, needs EAS setup).

**Context:** Two of the four "features" already half-exist. Blood-type compatibility is live in the feed (`canDonateTo` filter "Can help", `src/app/(tabs)/feed.tsx:41`) and on request cards ("You can help" badge). The eligibility countdown is live on Home's hero (`computeEligibility`, `src/app/(tabs)/home.tsx:163-236`), the Donor tab, and the donor card. So Phases A–B are *closing the gaps* in those, while the map (Phase C) and push (Phase D) are greenfield: no coordinates are ever serialized to the client today, and there is zero push infrastructure (no lib, no token storage, no send path).

## SDK 57 docs verification (drives library choices)

Checked against https://docs.expo.dev/versions/v57.0.0/:

| Fact | Consequence |
|---|---|
| `expo-notifications` remote push: **works in Expo Go on iOS**, **requires a development build on Android** (since SDK 53); no web support | Plan an honest demo path: full flow on iOS Expo Go; Android needs `eas build --profile development`. Opt-in card hidden on web. |
| `getExpoPushTokenAsync` **requires a `projectId`** (`extra.eas.projectId`) | One-time `eas init` (needs `eas login`) before Phase D client work. |
| Android 13+: a notification **channel must exist before requesting the token**; channel setup also triggers the OS opt-in prompt | Call `setNotificationChannelAsync` before `getExpoPushTokenAsync` on Android. |
| `expo-maps` is **alpha, dev-build only** | Rejected. |
| `react-native-maps` **works in Expo Go with no setup** (Apple Maps iOS, Google Maps Android); API keys only needed for store deployment; **no web support** | Chosen map library. Map is native-only; web keeps the list UI (graceful degradation, same philosophy as GEO_PLAN). |

**Decisions:**
- **Map library: `react-native-maps`** — the only option that demos in Expo Go today. Web gets a fallback screen; map entry points hidden on web.
- **Push send path: plain `fetch` to `https://exp.host/--/api/v2/push/send`** (batches of 100) — no `expo-server-sdk` dependency; the Expo push API needs no API key and the API-route runtime stays lean.
- **Token storage: new `push_tokens` table** (not a column on `profiles`) — a user can have multiple devices, and rows can be pruned per-device on `DeviceNotRegistered` without touching the profile.
- **Coordinate exposure:** center coords serialize as-is (public places). Request coords serialize **rounded to 3 decimals (~110 m)** — they come from the creator's device, which is *usually* the hospital but could be their home; fuzzing costs nothing on a city-scale map. Donor/profile coords stay **write-only forever**.
- **Eligibility is a soft gate, not a block** — a donor in cooldown can still pledge (the actual donation happens later and centers screen anyway), but the confirm sheet warns them explicitly.

---

## Phase A — Compatibility matching: close the gaps (smallest, no schema changes)

Logic already exists in `src/lib/blood.ts` (`canDonateTo`, `donorsFor`, `recipientsFor`) — this phase is presentation only.

- [x] **`src/components/request-card.tsx`** — distinguish **"Exact match"** (same blood type, `tone="brand"`) from **"You can help"** (compatible, `tone="success"`) in the trailing badge. Update the accessibility label accordingly.
- [x] **`src/app/(tabs)/feed.tsx`** — in the `visible` memo's sort (currently `URGENCY_RANK` then `neededBy`): on the **All** tab, sort compatible-before-incompatible *within* the same urgency rank (critical incompatible still outranks routine compatible — urgency stays primary).
- [x] **`src/app/request/[id].tsx`** — the screen only flips the button label today ("Respond anyway"). Add an explicit compatibility row near the blood-type glyph:
  - Compatible: tinted `Card` (`successSubtle`) — "Your `A+` is compatible with this request."
  - Incompatible: `warningSubtle` — "Your `A+` can't donate to `O-`. `O-` patients can only receive from: `O-`." (list from `donorsFor(request.bloodType)`).
  - Hidden for owners and when profile is missing.
- [x] Verify: `npx tsc --noEmit` + `npm run lint`; expo-web preview — feed All-tab ordering, badges, detail-screen rows for compatible (amara A+ → A+ request) and incompatible (liam A- → B+ request) accounts.

---

## Phase B — Eligibility countdown: gate the respond flow (no schema changes)

`computeEligibility` + `DONATION_INTERVAL_DAYS = 56` already exist in `src/lib/blood.ts:45-61` and render on Home/Donor/donor-card. The gap: **the respond flow ignores eligibility entirely** — a donor 3 days post-donation can pledge with no warning.

- [x] **`src/app/request/[id].tsx`** — compute `eligibility = computeEligibility(profile.lastDonationDate)` (fall back to `donations[0]?.date` like `donor.tsx:40-43` does — extract that little fallback into `src/lib/blood.ts` as `effectiveLastDonation(profile, donations)` so the three screens share it).
  - When `!eligibility.eligible`, the `ConfirmSheet` message gains a warning line: *"You're in your 56-day recovery window — eligible again {longDate(nextEligibleDate)} ({daysRemaining} days). You can still pledge; the donation would happen after that date."* Respond stays enabled (soft gate).
  - Action-bar hint below the button (caption, `textTertiary`): "Recovering · ready in N days" when in cooldown.
- [x] **`src/app/(tabs)/feed.tsx`** — header subtitle: when in cooldown, append "· eligible again in N days" so the countdown is visible where responding happens.
- [x] **Known gap (document, don't fix here):** no flow ever *writes* `lastDonationDate` — completing an appointment doesn't create a `donations` row or update the profile. Left for a future "mark donation complete" feature; the seed data exercises the cooldown path meanwhile (daniel@donornet.demo is mid-cooldown).
- [x] The "you're eligible again" push/local notification belongs to Phase D (needs the notification infra) — see D6.
- [x] Verify: sign in as daniel (cooling down) → respond sheet shows the warning + dates; amara (eligible) → unchanged sheet. tsc + lint.

---

## Phase C — Map view of centers & requests

### C1 — Server: expose coordinates

- [x] **`src/types/domain.ts`** — add `latitude?: number; longitude?: number;` to `DonationCenter` and `EmergencyRequest`.
- [x] **`src/lib/server/serialize.ts`:**
  - `toCenter` — emit `latitude`/`longitude` when non-null (as stored; centers are public).
  - `toEmergencyRequest` — emit request coords when non-null, **rounded via `roundCoord(n, 3)`** (`src/lib/geo.ts`). `toProfile` untouched — donor coords never leave the server.
- [x] No schema/db changes — columns exist since GEO_PLAN; seed already anchors everything in Metro Cebu.
- [x] Verify (curl + cookie jar, PLAN.md pattern): `GET /api/centers` rows contain lat/lng; `GET /api/requests` — seeded requests have 3-decimal coords, `GET /api/profile` still has **no** coord fields.

### C2 — Client: map screen (native) + web fallback

- [x] `npx expo install react-native-maps` — ~~no app.json changes needed for Expo Go~~ **this was wrong, and it crashed the app.** On Android, Google Maps needs an API key applied at *native build time*; without it `MapView.onCreate` throws `IllegalStateException: API key not found` — a native crash no error boundary can catch. Expo Go can never supply that key (its binary was built without one), so the Android map cannot work in Expo Go at all, key in `app.json` or not. The SDK 57 docs claim "no additional setup is required when testing your project using Expo Go"; a device disproved it. iOS is fine — Apple Maps needs no key. See the guard in `src/components/map-view.native.tsx`.
- [x] **New `src/components/map-view.tsx` + `src/components/map-view.native.tsx`** — Metro platform resolution keeps `react-native-maps` out of the web bundle (importing it in shared code would break the web build):
  - **`.native.tsx`**: `MapView` with `initialRegion` from `qk.location` coords (via `useLocationState()`) else the Cebu City anchor `10.3111, 123.8931` (~0.15 lat/lng delta). Markers:
    - Centers — `pinColor={theme.brand}`; callout: name, `distanceLabel(distanceKm)`, hours → `router.push('/book')`.
    - Open/partial requests with coords — pin colored by urgency via `URGENCY_TONE` → `theme.danger/warning/info`; callout: hospital, blood type, urgency → `/request/[id]`.
  - **Base (web) file**: `EmptyState` — "The map is available in the mobile app" (route stays navigable, nothing crashes).
- [x] **New route `src/app/map.tsx`** — `ScreenHeader` "Nearby map" + the component above; register in root `_layout.tsx` as a `card` presentation (same as `request/[id]`). Data comes from the existing `useCenters()` + `useRequests()` caches — **no new endpoints, no new query keys**.
- [x] **Entry points** (hidden on web via `Platform.OS === 'web'`):
  - `src/app/(tabs)/home.tsx` "Nearby donation center" `SectionHeader` (~line 341) → `actionLabel="Map"`.
  - `src/app/book.tsx` — small map button beside the center-list section header.
- [ ] **Still open — the only unverified item in this plan.** Verify: map centers on device location (or Cebu anchor when denied), 5 brand pins + urgency-colored request pins, callouts navigate; web — entry points absent, `/map` shows the fallback; tsc + lint.
  - Web fallback and the Android guard message are verified. **The map itself has never rendered a single pin on any device.**
  - Blocked on Android: needs a development build (see the correction under C2 above). Options are a Google Maps key (requires a billing account with a card on file, though mobile map loads bill at $0) or swapping to `@maplibre/maplibre-react-native` + OpenFreeMap tiles, which needs no key and no card. Leaning MapLibre — note it is *not* in Expo Go, so adopting it retires Expo Go for this project entirely.

---

## Phase D — Push notifications for matching requests

### D0 — One-time setup (requires user action)

- [x] `eas login` + `eas init` → writes `extra.eas.projectId` into `app.json` (**required** for `getExpoPushTokenAsync`).
- [x] Note in README/PLAN: Android remote push needs a development build (`eas build --profile development --platform android`); iOS demos in Expo Go.

### D1 — Schema

- [x] **`src/db/schema.ts`** — new table:
  ```ts
  export const pushTokens = pgTable('push_tokens', {
    id: id('ptk'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),          // ExponentPushToken[...]
    platform: text('platform').notNull(),             // 'ios' | 'android'
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  });
  ```
- [x] `npm run db:push` (additive).

### D2 — Server: token registration route

- [x] **New `src/app/api/push-tokens+api.ts`** — `requireSession`; `POST { token, platform }` upserts by token (`onConflictDoUpdate` → reassign userId + touch updatedAt — handles device handoffs); `DELETE { token }` removes it (sign-out hygiene). Validate token shape starts with `ExponentPushToken[`. Use `handle()` + `badRequest` from `src/lib/server/http.ts`.

### D3 — Server: fan-out on new request

- [x] **New `src/lib/server/push.ts`:**
  - `notifyMatchingDonors(request: typeof emergencyRequests.$inferSelect)` —
    1. SQL prefilter: `profiles` joined to `pushTokens`, `inArray(profiles.bloodType, donorsFor(request.bloodType))`, `ne(userId, request.ownerId)`.
    2. JS distance filter: when the request has coords **and** the donor profile has (fuzzed) coords → keep if `haversineKm ≤ 50`. Donors **without** coords are still notified (recall beats precision for a blood app; city-hash distances are meaningless for filtering).
    3. Build messages: title `🩸 {bloodType} blood needed near you`, body `{hospital}, {city} — {URGENCY_LABEL[urgency]}, {unitsNeeded} units`, `data: { url: '/request/{id}' }`, `channelId: 'default'`.
    4. `fetch('https://exp.host/--/api/v2/push/send', …)` in chunks of ≤100; on ticket errors `DeviceNotRegistered`, delete those token rows (minimal receipt handling — full receipt polling is out of scope).
- [x] **`src/app/api/requests+api.ts` POST** (after the insert, ~line 85): `notifyMatchingDonors(row).catch(err => console.error('push fan-out failed', err))` — **fire-and-forget, never awaited before the 201**; a push failure must never fail a blood request. At seed scale (3 donors) inline fan-out is fine; note a queue as the future scale path.

### D4 — Client: opt-in + token registration

- [x] `npx expo install expo-notifications`; **`app.json`** plugin: `["expo-notifications", { "defaultChannel": "default" }]` (icon/color later).
- [x] **New `src/hooks/use-push.ts`** (mirrors `src/hooks/use-location.ts` shape):
  - `qk.push: ['push']` in `src/hooks/api/keys.ts`.
  - `usePushState()` — `getPermissionsAsync()` only, never prompts; `'unsupported'` on web/simulator (`Device.isDevice` via already-installed `expo-device`).
  - `useEnablePush()` — mutation fired **only from a user tap**: Android → `setNotificationChannelAsync('default', …)` **first**; `requestPermissionsAsync()`; on grant `getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId })` → `api.post('/api/push-tokens', { token, platform })`. On deny: cache `'denied'`, affordance collapses, no re-nagging.
- [x] **New `src/components/enable-push-card.tsx`** — clone of `enable-location-card.tsx` (self-hiding pattern: render `null` unless `'undetermined'`): "**Get alerted when your blood type is needed** — we'll only notify you for requests you can actually help with." Placement: `home.tsx` next to `EnableLocationCard`, and on the Donor tab.
- [x] **Notification foreground behavior** — `setNotificationHandler` (banner, no sound) in the same module, imported once from root `_layout.tsx`.

### D5 — Client: deep-link on tap

- [x] **Root `src/app/_layout.tsx`** — small `useNotificationObserver()` effect (native only):
  - `addNotificationResponseReceivedListener` → `router.push(response.notification.request.content.data.url)`.
  - Cold start: `getLastNotificationResponse()` on mount → same push. Target `/request/[id]` already registered as `card`.

### D6 — "Eligible again" local notification (Phase B payoff)

- [x] In `useEnablePush` success path (and on profile updates while granted): if `!eligibility.eligible`, `scheduleNotificationAsync` at `nextEligibleDate` 9:00 local — "You're eligible to donate again 🎉" → `data.url: '/(tabs)/donor'`. Cancel/reschedule by a fixed identifier (`'eligible-again'`) so updates never stack. Local notifications work in Expo Go on **both** platforms — this part demos everywhere.

### D — Verify

1. Server: POST `/api/push-tokens` as amara → row in Neon; duplicate POST → single row, updated timestamp.
2. Insert a fake `ExponentPushToken[test]` for liam (A- donor); POST a new A- request as amara → server log shows 1 message attempted (liam matches via `donorsFor('A-')`, amara excluded as owner); Expo API rejects the fake token → row pruned.
3. iOS Expo Go (real device): enable card → OS prompt → token registered; from a second account post a compatible request → notification arrives; tap → app opens on `/request/[id]`. Kill app, repeat → cold-start deep link works.
4. Web: enable-push card absent; everything else unchanged.
5. `npx tsc --noEmit` + `npm run lint` clean.

---

## Edge cases (behavior spec)

| Case | Behavior |
|---|---|
| Push fan-out throws / Expo API down | Request still returns 201; error logged only. |
| Donor has token but no coords | Notified (no distance filter applied for them). |
| Request posted without coords | All compatible donors notified (no distance filter possible). |
| `DeviceNotRegistered` ticket | Token row deleted; user re-enrolls via the card next session. |
| Web | No map entry points, `/map` shows fallback; no push card; zero behavior change otherwise. |
| Android Expo Go | Push card can render but token fetch fails → treat as `'unsupported'`, card hidden; dev build required (documented). |
| Donor in cooldown responds | Allowed; warning in ConfirmSheet + hint under button. |
| Incompatible donor responds | Still allowed ("Respond anyway", unchanged), now with an explanatory warning card. |
| Center/request row with NULL coords | Omitted from map; list UI unaffected. |
| Own request in feed | Never counted or badged as compatible (existing behavior preserved). |

## Implementation order & effort

A (½ day) → B (½ day) → C (1 day) → D (2–3 days incl. EAS setup). Each phase lands independently behind `tsc` + `lint` + the phase's verification list. Nothing in A–C requires a native rebuild; D is the only phase touching app.json plugins (Expo Go still fine on iOS).
