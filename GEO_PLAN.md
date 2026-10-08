# Geolocation Plan — Nearby Centers, Requests & Donor Distances

Detect the user's real location (contextual, opt-in) so DonorNet shows true distances and sorts centers/requests by proximity — degrading silently to today's behavior when permission is denied or coordinates are missing.

**Context:** Today every distance is fake — requests get a persisted `distance_km` from a hash of the city name (`cityDistanceKm`, `src/lib/server/serialize.ts:166`), centers' distances are hand-seeded, and every responder just echoes the request's distance. Users must already know the hospitals in their area.

**Decisions (with user):**
- Seed/demo data anchored to **Cebu City, Philippines** so real-device testing shows plausible distances.
- Donor locations **stored server-side, fuzzed to ~1 km** (2-decimal rounding in the API route), never exposed raw — only computed distances leave the server.
- **No geocoding** (`geocodeAsync` is native-only and unreliable for the fictional demo cities); request coordinates come from the creator's device location, optional.

**Design principles:**
- Domain types keep `distanceKm: number` unchanged — the client can't tell real from fallback, so every screen works with zero conditional logic.
- Viewer coords pass as optional `?lat=&lng=` query params; distance computed at read time via Haversine.
- Coords stay **out** of TanStack Query keys (would break the optimistic update in `useRespond` and duplicate cache entries on GPS jitter). Location lives in the cache under `qk.location`; queryFns read it at fetch time.
- Additive & backward-compatible: nullable columns, `distance_km` stays NOT NULL as the fallback. Phases 1–3 ship on their own without any client change.

---

## Phase 1 — Foundations: dependency, geo util, schema, types

- [x] `npx expo install expo-location` (SDK 57; foreground works in Expo Go + web). _(already installed)_
- [x] `app.json` → add to `plugins`:
  ```json
  ["expo-location", { "locationWhenInUsePermission": "DonorNet uses your location only to show how far donation centers and blood requests are from you." }]
  ```
- [x] **New `src/lib/geo.ts`** — pure, shared client+server (mirrors `src/lib/format.ts`):
  - `Coords = { latitude: number; longitude: number }`
  - `haversineKm(a, b)` → km rounded to 1 decimal (matches `distanceLabel` precision, `src/lib/format.ts:56`)
  - `roundCoord(n, decimals = 2)` — privacy fuzz for stored profile coords
  - `isValidLat(n)` / `isValidLng(n)` — finite + in range
- [x] **`src/db/schema.ts`** — add nullable `latitude: doublePrecision('latitude')` + `longitude` to:
  - `profiles` (~line 62) — donor's fuzzed last-known location
  - `emergencyRequests` (~line 83) — hospital location; update the "Placeholder until real geo" comment: stored `distance_km` is now the fallback
  - `donationCenters` (~line 128)
- [x] `npm run db:push` — additive nullable columns, existing rows get NULL, no data loss.
- [x] **`src/types/api.ts`** — add `latitude?: number; longitude?: number;` to `CreateRequestBody` and `CreateProfileBody` (flows into `UpdateProfileBody` via `Partial`). `src/types/domain.ts` unchanged.

---

## Phase 2 — Server: distance computation & routes

- [x] **`src/lib/server/http.ts`** — `readCoords(request): Coords | null` — parse `lat`/`lng` search params; invalid/missing → null (degrade, never 400: a bad param must not break the feed poll).
- [x] **`src/lib/server/serialize.ts`:**
  - `toEmergencyRequest(r, respondersCount, viewer?)` — Haversine when viewer + row coords exist, else stored `r.distanceKm`.
  - `toCenter(c, viewer?)` — same pattern.
  - `toResponder(...)` — add donor profile coords + `requestCoords` params; distance = **donor→hospital** (not viewer→anything) when both exist, else the request's stored distance (today's behavior).
  - Keep `cityDistanceKm` (still seeds the stored fallback on create).
- [x] **`src/app/api/centers+api.ts`** — `readCoords` → map through `toCenter(row, viewer)`; when viewer present, sort by computed distance in JS; else keep current SQL ordering.
- [x] **`src/app/api/requests+api.ts`** — GET passes viewer to serializer (keep `postedAt` DESC order). POST: validate optional body coords with `isValidLat/Lng` — **silently drop if invalid** (never fail a blood request over bad GPS); insert alongside `distanceKm: cityDistanceKm(city)`.
- [x] **`src/app/api/requests/[id]+api.ts`** — pass viewer; add `profiles.latitude/longitude` to the responder roster select; call `toResponder` with donor + request coords.
- [x] **`src/app/api/profile+api.ts`** — POST/PATCH accept optional coords, store `roundCoord()`-fuzzed values; allow explicit null to clear. `toProfile` unchanged — **coords never serialized to anyone, including the owner**.

---

## Phase 3 — Seed: Cebu coordinate frame

Rename the fictional cities to real Metro Cebu localities and anchor coords there (`city` fields are free text — pure seed change). **`scripts/seed.ts`:**

| Old city  | New city   | Anchor (lat, lng)   | ~dist from downtown |
|-----------|------------|---------------------|---------------------|
| Downtown  | Cebu City  | 10.3111, 123.8931   | —                   |
| Midtown   | Mandaue    | 10.3236, 123.9223   | ~3.5 km NE          |
| Riverside | Talisay    | 10.2447, 123.8494   | ~8.5 km SW          |
| Lakeside  | Lapu-Lapu  | 10.3103, 123.9494   | ~6 km E             |

- [x] 4 centers: spread a few hundred meters around their city anchor (the two Cebu City centers must not collide); keep fictional names + hand-authored `distanceKm` fallbacks.

> **Superseded:** centers and hospitals are no longer fictional. They are now 5 real Metro Cebu facilities (PRC Cebu Chapter, VSMMC, UCMed, Mactan Doctors', Cebu South Medical Center, plus one invented Talisay drive at a real venue), geocoded against OpenStreetMap, with `distanceKm` computed as true great-circle km from the Cebu City anchor. Contact numbers are deliberately non-dialable `+63 917 555 XXXX` placeholders.

- [x] 6 requests: coords near their city anchor with small offsets.
- [x] 3 demo profiles: `roundCoord`-ed home-city coords.
- [x] `npm run db:seed` (idempotent).

Sanity check: a viewer at the Cebu City anchor sees the downtown center ≈0.1–0.5 km, Mandaue ≈3.5, Lapu-Lapu ≈6, Talisay ≈8.5.

---

## Phase 4 — Client: location hook

- [x] Add `location: ['location'] as const` to `qk` in `src/hooks/api/keys.ts`.
- [x] **New `src/hooks/use-location.ts`** (device state — beside other non-API hooks):
  - `useLocationState()` — `useQuery({ queryKey: qk.location })`: `getForegroundPermissionsAsync()` (never prompts). If granted: `getLastKnownPositionAsync()` first (instant), then `getCurrentPositionAsync({ accuracy: Balanced })`; round to 2 decimals; when already granted, fire-and-forget PATCH profile coords if changed. Returns `{ status: 'granted'|'denied'|'undetermined', coords? }`. `staleTime: 5min`, `retry: false`, try/catch → `undetermined`.
  - `useEnableLocation()` — `useMutation`: `requestForegroundPermissionsAsync()` (the OS/browser prompt — fired **only** from an explicit user tap) → on grant: get position, `setQueryData(qk.location, …)`, fire-and-forget `PATCH /api/profile` with coords, then `invalidateQueries(['requests'])` + `invalidateQueries(qk.centers)`. On deny: cache `{ status: 'denied' }` — affordances collapse, no re-nagging.
  - `locationSearchParams(): string` — plain function reading `qk.location` from the singleton `queryClient` (`src/lib/query.ts`); returns `''` or `?lat=10.31&lng=123.89`.
- [x] **QueryFn wiring** (keys/optimistic updates/prefetch untouched):
  - `src/hooks/api/use-requests.ts` — `requestsQuery` + `useRequest(id)` append `locationSearchParams()`.
  - `src/hooks/api/use-content.ts` — `centersQuery` same.

---

## Phase 5 — UX: permission affordance & request creation

- [x] **New `src/components/enable-location-card.tsx`** using existing primitives (`Card`, `ThemedText`, `Ionicons`) — shown only when `status === 'undetermined'`: "**See real distances** — Enable location to sort centers and requests by how far they actually are." + Enable affordance; quiet spinner while pending; disappears on deny (no guilt banner — fallback distances continue silently).
  - Placement 1: `src/app/(tabs)/home.tsx` (~line 337) with the "Nearby donation center" section.
  - Placement 2: `src/app/book.tsx` (~line 111) above the center list. Also fix line 140: raw `{c.distanceKm} km` → `distanceLabel(c.distanceKm)`.
  - Feed + request detail inherit real distances automatically — no extra UI.
- [x] **`src/app/request/new.tsx`** — optional toggle near hospital/city fields: "Attach my current location (helps donors see real distance to the hospital)".
  - Granted → defaults **on**, shows "Using your current location", can turn off.
  - Undetermined → off; tapping runs `useEnableLocation()` (the most justified prompt — requester is usually at the hospital).
  - Denied/web-without-permission → row hidden; request posts without coords (hash distance forever, same as today).
  - On submit include coords in `CreateRequestBody` when on.

---

## Edge cases (behavior spec)

| Case | Behavior |
|---|---|
| Permission denied / web without grant | No params sent; stored distances; UI identical to today; affordances hidden. |
| Row with NULL coords | Serializer falls back to stored `distanceKm` even when viewer sent coords. |
| Responder without profile coords | Falls back to the request's stored distance (today's behavior). |
| Invalid `lat=abc` param | Treated as absent, 200 response. |
| GPS jitter | 2-decimal rounding keeps params stable within ~1 km. |
| Existing production rows | NULL coords → pure fallback until reseed/updates. |
| 20s feed poll | Re-sends same rounded coords — harmless. |

---

## Verification

**Server** (after `db:push` + `db:seed`, dev server via `expo-web`; curl with cookie jar per PLAN.md pattern):
1. Sign in as `maria@donornet.demo` → cookie.
2. `GET /api/centers` → seeded fallback order; `GET /api/centers?lat=10.3103&lng=123.9494` → Lapu-Lapu center first, ≈0–0.5 km.
3. `GET /api/requests?lat=10.3111&lng=123.8931` → Cebu City requests <1 km, Mandaue ≈3.5, Talisay ≈8.5; no params → old hash values.
4. `GET /api/requests?lat=abc&lng=123` → 200 + fallback distances.
5. Request detail as owner with viewer coords → per-donor distances differ per responder.
6. POST request with body coords → GET with viewer coords shows computed; without shows hash.
7. `GET /api/profile` → response contains **no** latitude/longitude fields.

**Client** (browser preview + Expo Go):
1. Web: Home → Enable-location card → click → browser prompt → accept → nearest-center distance updates, feed re-sorts; network tab shows `?lat=&lng=`. Reload → no prompt.
2. Deny path: card disappears, distances unchanged, no errors, no re-prompt.
3. Expo Go: grant via OS sheet; kill/reopen → real distances immediately (last-known position). Create request with toggle on → second account sees real hospital distance.
4. Regression: fresh account, never touch location → app byte-for-byte as before.
5. `npx tsc --noEmit` + `npm run lint` clean.

---

## Notes

- Implementation order: Phase 1 → 2 → 3 (shippable alone, backward compatible) → 4 → 5 → verify.
- Production deploy (EAS Hosting, pending `eas login`) needs a redeploy after this lands.
