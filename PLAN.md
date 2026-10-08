# DonorNet Full-Stack Plan — Auth + Backend + Database

Converting the mock, device-only app into a real application while keeping all existing screens/UI intact.

**Stack (decided):**
- **Backend:** Expo API Routes — `*+api.ts` files under `src/app/api/`, served by the same Expo dev server (no second process). Needs `app.json` → `"web": { "output": "server" }`.
- **Database:** Neon Postgres + Drizzle ORM (`drizzle-orm/neon-http` + `@neondatabase/serverless`).
- **Auth:** Better Auth (email + password), `@better-auth/expo` plugin — SecureStore sessions on native, cookies on web.
- **Client data:** TanStack Query hooks replace the context store's data slices; the store shrinks to the device-local `onboarded` flag.

**Facts verified (docs + installed versions):**
- `better-auth 1.6.23` — adapter import is `better-auth/adapters/drizzle` ✓; schema CLI is `npx @better-auth/cli@latest generate` ✓ (already run).
- `drizzle-orm 0.45.2`, `drizzle-kit 0.31.10`, `@neondatabase/serverless 1.1.0`, `@tanstack/react-query 5.101.2`.
- Relative `fetch('/api/…')` works in dev on web + native; production native later needs `origin` in the expo-router plugin (out of scope for v1).
- API routes read **all** env vars (server-only `DATABASE_URL` / `BETTER_AUTH_SECRET`; never `EXPO_PUBLIC_`).
- Native requests must attach `Cookie: authClient.getCookie()` with `credentials: 'omit'`; web uses normal same-origin cookies.
- expo-secure-store works in Expo Go; no metro config changes needed on SDK 57.
- Per AGENTS.md: check https://docs.expo.dev/versions/v57.0.0/ when writing code.

**Neon project:** switching to the user's other Neon account — connection string pending, then `.env` `DATABASE_URL` is updated and `db:push` + `db:seed` re-run. (Old `vesta` project `aged-haze-76929882` in the Jeevie account is being retired.) Secrets live in `.env` (git-ignored) — never in this file.

**Demo accounts (created by seed):** `maria@donornet.demo` (A+, eligible), `daniel@donornet.demo` (A+, cooling down), `miguel@donornet.demo` (A-) — password `donornet-demo-123` for all.

---

## Phase 1 — Foundations: deps, env, DB schema, seed

**Status: DONE except running the seed + verification.**

- [x] Install deps — runtime: `better-auth`, `@better-auth/expo`, `drizzle-orm`, `@neondatabase/serverless`, `@tanstack/react-query`; expo: `expo-secure-store`, `expo-network`; dev: `drizzle-kit`, `tsx`, `dotenv`.
- [x] Provision Neon project via Neon MCP. _(Being replaced — moving to the user's other Neon account; see note above.)_
- [x] `.gitignore` — added `.env`.
- [x] `.env` (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL=http://localhost:8081) + `.env.example`.
- [x] `drizzle.config.ts` — dialect postgresql, schema `./src/db/schema.ts`, out `./drizzle`, `import 'dotenv/config'`.
- [x] `src/db/auth-schema.ts` — Better Auth tables (user/session/account/verification), adopted from CLI output.
- [x] `src/db/schema.ts` — domain tables + enums: `profiles` (1:1 user; fullName/email live on auth `user`), `emergency_requests`, `responders` (UNIQUE(request_id, user_id)), `donations`, `donation_centers`, `appointments`, `announcements`, `education_articles`. Prefixed text ids (`req_…`) via `$defaultFn`. **Achievements: no table** — static defs will move to `src/data/achievements.ts` in Phase 4.
- [x] `src/lib/server/db.ts` — drizzle over neon-http.
- [x] `src/lib/server/auth.ts` — betterAuth + drizzleAdapter + expo plugin + trustedOrigins `['bdsapp://', 'exp://**']`.
- [x] `npx drizzle-kit push` — all 12 tables confirmed in Neon.
- [x] `scripts/seed.ts` — idempotent; demo users created **through** `auth.api.signUpEmail` (real hashes); centers upserted; announcements/articles replaced; 6 requests owned by demo users (incl. 1 fulfilled); responder rows on 2 requests; donations per user; 1 appointment for Amara. Self-contained data (no import of `src/data/mock.ts`).
- [x] package.json scripts: `db:push`, `db:seed`, `db:studio`.

**Remaining:**
- [x] Run `npm run db:seed`.
- [x] Verify via Neon MCP `run_sql`: counts on `user` (3), `emergency_requests` (6), `responders` (3), `donation_centers` (5), `announcements` (3), `education_articles` (4), `donations` (8), `appointments` (1).
- [x] `npx tsc --noEmit` passes; app still runs unchanged (`expo-web` launch config).

---

## Phase 2 — Auth server live

- [x] `app.json`: change `"web": { "output": "static", … }` → `"output": "server"` (keep favicon).
- [x] New `src/app/api/auth/[...auth]+api.ts`:
  ```ts
  import { auth } from '@/lib/server/auth';
  const handler = auth.handler;
  export { handler as GET, handler as POST };
  ```
- [x] Restart dev server with `--clear`.

**Verify (Git Bash curl):**
```bash
curl -i -X POST http://localhost:8081/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"curl@test.dev","password":"password123","name":"Curl Test"}'   # 200 + Set-Cookie
curl -i -c c.txt -X POST http://localhost:8081/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"curl@test.dev","password":"password123"}'
curl -b c.txt http://localhost:8081/api/auth/get-session                        # session JSON
```
Neon: `SELECT email FROM "user"` has the new row; `account.password` holds a hash. Delete `curl@test.dev` after.

---

## Phase 3 — Domain API routes

**Shared helpers (new):**
- `src/lib/server/http.ts` — `json(data, status?)`, `ApiError(status, code, message)`, `handle(fn)` wrapper. Error envelope: `{ "error": { "code": "...", "message": "..." } }`; statuses 400 (validation), 401, 403 (not owner), 404, 409 (already responded / wrong state).
- `src/lib/server/session.ts` — `requireSession(request)` → `auth.api.getSession({ headers: request.headers })`, throws `ApiError(401)` when absent.
- `src/types/api.ts` — `RequestWithMine = EmergencyRequest & { myResponse: { status: 'offered' | 'confirmed' } | null }` + POST body types. `src/types/domain.ts` stays untouched.

**Conventions:** all endpoints require a session; handlers map DB rows → existing domain types (dates via `.toISOString()`); route params come from the handler's 2nd arg (`(request, { id })`).

| File under `src/app/api/` | Methods | Behavior |
|---|---|---|
| `profile+api.ts` | GET/POST/PATCH | Compose `UserProfile` from `user` + `profiles` (`fullName`←`user.name`, `id`←`user.id`, `health.weightKg`←`weight_kg`); GET 404 if no profiles row (gate signal); POST upsert (profile-setup, also updates `user.name`); PATCH partial |
| `requests+api.ts` | GET/POST | GET: non-expired, `respondersCount` via count(), `myResponse` for session user (replaces `respondedRequestIds`), sorted urgency→neededBy. POST: validate, `ownerId = session.user.id`, placeholder `distanceKm` (stable hash of city → 1.0–12.0), status open |
| `requests/[id]+api.ts` | GET | Full request; `responders[]` (join user+profiles for name/bloodType/city/avatarColor; distanceKm = request's) **only when caller is owner**; always respondersCount + myResponse |
| `requests/[id]/respond+api.ts` | POST | 400 if own request; 409 if closed or already responded (unique index catches the race) |
| `requests/[id]/cancel+api.ts` | POST | Owner-only → status `expired` |
| `requests/[id]/fulfill+api.ts` | POST | Owner-only → status `fulfilled`, `unitsFulfilled = unitsNeeded` |
| `requests/[id]/responders/[responderId]/confirm+api.ts` | POST | Owner-only; set responder `confirmed`, recompute `unitsFulfilled = min(unitsNeeded, confirmedCount)`, status `partial`/`fulfilled` (ports app-store.tsx:165-181). Two writes via `db.batch` (neon-http has no interactive transactions) |
| `appointments+api.ts` | GET/POST | GET: mine, joined with center → existing `Appointment` shape (`centerName`, `address`). POST `{centerId, date, type}` → status confirmed |
| `appointments/[id]/cancel+api.ts` | POST | Own appointment only → `cancelled` |
| `donations+api.ts` | GET | Session user's donations (new users: `[]`) |
| `centers+api.ts`, `announcements+api.ts`, `articles+api.ts` | GET | Simple lists (articles include bodies; no `[id]` route — detail screen reads from the cached list) |

**Verify (curl with cookie jar):** `/api/requests` → seeded feed, `myResponse: null`; respond → 200, repeat → 409, own request → 400; no cookie → 401 envelope; non-owner confirm/cancel/fulfill → 403; after respond, Neon shows the `responders` row.

---

## Phase 4 — Client conversion

**New client infra:**
- `src/lib/auth-client.ts` — `createAuthClient` from `better-auth/react`; native adds `expoClient({ scheme: 'bdsapp', storagePrefix: 'donornet', storage: SecureStore })` (web: no expo plugin). Export `getBaseUrl()`: web → `''` (same-origin), native dev → `http://${Constants.expoConfig?.hostUri}`.
- `src/lib/api.ts` — typed fetch wrapper: `getBaseUrl() + path`, JSON headers; native: `Cookie: authClient.getCookie()` + `credentials: 'omit'`; web: `credentials: 'include'`; parses error envelope → throws `ApiClientError { status, code, message }`.
- `src/lib/query.ts` — QueryClient (staleTime 15s, retry 1).
- `src/hooks/api/` — `use-profile.ts` (useProfile/useCreateProfile/useUpdateProfile), `use-requests.ts` (useRequests w/ refetchInterval 20s, useRequest(id), useCreateRequest, useRespond **(the one optimistic update: set myResponse + bump respondersCount in both caches, rollback on error)**, useConfirmResponder/useCancelRequest/useFulfillRequest via invalidation), `use-appointments.ts`, `use-donations.ts`, `use-content.ts` (centers/announcements/articles, staleTime ~1h).
- `src/data/achievements.ts` — static defs moved from mock; unlocked/progress computed from donation stats client-side.

**Reworks:**
- `src/app/_layout.tsx` — add QueryClientProvider (outside AppProvider); splash hides when `hydrated && !session.isPending`.
- `src/app/(auth)/sign-in.tsx` — Sign in / Create account toggle (existing UI components); sign-up adds Name field; password min 8; `authClient.signUp.email` → `/profile-setup`; `signIn.email` → `/` (gate decides); server errors into existing error state.
- `src/app/profile-setup.tsx` — drop local UserProfile build + `signIn(profile)`; prefill name/email from `useSession`; finish → POST `/api/profile` + `completeOnboarding()` → `/`.
- `src/app/index.tsx` gate — `!hydrated || isPending` → null; `!onboarded` → onboarding; `!session` → sign-in; profile 404 → profile-setup; else tabs.
- `src/store/app-store.tsx` — shrink to `{ hydrated, onboarded, completeOnboarding }`; `src/lib/storage.ts` keeps only the `onboarded` key.

**Screen-by-screen (mechanical: store reads → hooks):**

| Screen | Becomes |
|---|---|
| `(tabs)/home.tsx` | useProfile/useRequests/useAppointments/useDonations/useAnnouncements/useCenters |
| `(tabs)/feed.tsx` | useRequests + useProfile; "mine" = `ownerId === session.user.id` |
| `(tabs)/donor.tsx` | hooks + `src/data/achievements.ts` |
| `(tabs)/learn.tsx` | useArticles |
| `(tabs)/profile.tsx` | hooks; sign-out = `authClient.signOut()` + `queryClient.clear()` → sign-in; drop resetDemoData button |
| `donor-card.tsx` | useProfile + useDonations |
| `book.tsx` | useCenters + useBookAppointment (`{centerId, date, type}`) |
| `request/new.tsx` | useCreateRequest; navigate to server-returned id |
| `request/[id].tsx` | **most complex**: useRequest(id) + 4 mutations; `responded = myResponse != null`; `isOwner` via session; add loading state |
| `article/[id].tsx` | useArticles + find by id |

**Cleanup:** delete `src/data/mock.ts` (seed script is self-contained), incl. `SELF_OWNER_ID`/`personalizeRequests`.

**Verify:** `npx tsc --noEmit` + `npm run lint` clean; `grep -r "data/mock" src/` → nothing.

---

## Phase 5 — End-to-end verification + cleanup

Via expo-web preview (launch config `expo-web`), checking Neon rows after each step:

1. Sign up fresh → profile-setup wizard → home. DB: `user` + `profiles` rows; donations empty (zero-state renders).
2. Feed shows seeded requests (fresh relative times); All / Can help / Critical filters work.
3. Create request → appears in feed as yours; DB row has your `owner_id`.
4. Sign out → sign in `maria@donornet.demo` / `donornet-demo-123` → respond to that request (button flips optimistically; DB `responders` row `offered`); responding twice → graceful 409.
5. Back as owner → detail lists responder → confirm → DB `units_fulfilled`/`status` recomputed (`partial`/`fulfilled`).
6. Book appointment → shows on home; cancel → status `cancelled` in DB.
7. Reload mid-session → lands on home without flicker; sign out/in → data persists.
8. Cleanup: dead-code sweep, final `tsc` + lint.

---

## Risks / gotchas

- **Windows/Metro:** restart with `--clear` after app.json/env changes; kill stale Metro processes if routes don't pick up.
- **neon-http:** no interactive transactions — `db.batch` for confirm-responder's two writes.
- **Neon cold start:** first query after idle takes 1–2s; `retry: 1` in the query client absorbs it.
- **Web vs native cookies:** keep both paths only in `src/lib/api.ts` / `auth-client.ts`.
- **Old AsyncStorage keys** from the mock era are ignored (only `onboarded` is read).
- **Password rule 4→8 chars** — intended change (Better Auth default).
- **Production native later:** set `origin` in the expo-router plugin + deploy (EAS Hosting); out of scope for v1.
