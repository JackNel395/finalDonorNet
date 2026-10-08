# Admin Plan — DonorNet Operations Console

A web-only operations console at `/admin`, served from this same Expo app, where staff can moderate emergency requests, manage donor accounts, maintain centers and appointments, and publish content. Goal: a fake or mistaken critical request can be verified and taken down by a human in minutes instead of fanning push to every compatible donor within 50 km unchallenged, and routine content and center changes stop requiring a developer with database access.

**Status:** phases 0–4 complete. Phase 5 not started. Open questions 2 and 5 resolved 2026-10-07; `npm run db:push` is no longer destructive. Every task below is a checkbox — `[ ]` not implemented, `[x]` implemented. This file is the single source of truth for implementation progress; tick boxes as work lands and update this line to name the phase in flight.

**Context:** `POST /api/requests` fires `notifyMatchingDonors(row)` fire-and-forget (`src/app/api/requests+api.ts:90`), which pushes to every donor with a compatible blood type inside `NEARBY_KM = 50` (`src/lib/server/push.ts:18,52`) — and donors with no stored coordinates are deliberately included, so recall is wide by design. Today the **only** authority over a posted request is its own creator: every mutation route guards with `req.ownerId !== user.id → forbidden(...)` (`src/app/api/requests/[id]/cancel+api.ts`). There is no staff role, no moderation path, and no audit of anything. Separately, `donation_centers`, `announcements`, and `education_articles` have no write routes at all — `scripts/seed.ts` is their only writer. This plan adds the missing operator surface by extending the conventions already in `src/lib/server/` rather than standing up a second backend.

---

## Safety and privacy boundaries

**Non-negotiable, and they constrain every phase below.** This console gives staff authority over other people's medical-adjacent data and over a push channel that reaches donors' lock screens.

- **The server guard is the security boundary.** `requireAdmin` on every admin route is what protects the data. The client-side gate exists only so staff are not shown dead controls; it is cosmetic and the plan never relies on it.
- **Donor coordinates never leave the server.** `profiles.latitude/longitude` are fuzzed to ~1 km on write and the schema commits that they are "never serialized to any client" (`src/db/schema.ts:68-70`). That invariant is **unchanged** by this plan. Admin surfaces receive the same derived `distanceKm` donors receive, via the existing `distanceFrom` helper in `src/lib/server/serialize.ts`. No admin mapper emits a raw coordinate.
- **Admins do see contact details** — name, email, phone, city, blood type, last donation date, registered device count. This is the operational justification for the console existing: staff cannot verify a suspicious request or reach a donor without it. It is a deliberate, recorded widening of `toProfile`'s current output, and it is the only one.
- **Every admin mutation writes an audit row in the same request handler**, before returning. Actor, action, target type, target id, free-text reason, and a metadata snapshot of what changed. An action that cannot be audited does not ship.
- **A take-down expires a request; it does not delete it.** Donors may already be travelling to a hospital on the strength of that push. Setting `status = 'expired'` plus a recorded reason means their open screen resolves to a clear terminal state instead of a 404, and the row survives for later dispute. Deleting an `emergency_requests` row is not an admin capability.
- **Account deletion is a real cascading delete** (FKs cascade from `user`), so it is irreversible and the audit row is written *first*, capturing the identifying fields, since afterwards there is nothing left to point at.
- **Broadcast targets a defined segment, never an arbitrary recipient list.** Segment is chosen from structured filters (blood type, city, eligibility) and the recipient count is shown and confirmed before sending. Broadcast reuses `src/lib/server/push.ts` — its batching and its `DeviceNotRegistered` pruning — so a dead token is pruned identically whichever sender wrote to it.
- **Destructive copy is specific and calm.** "Take down this request" names the request and states that responders will see it as closed; it does not say "Are you sure?". Status and urgency never ride on color alone.

---

## Assumptions and dependencies

| Assumption | Evidence / consequence |
|---|---|
| API routes are served by the same dev server, no second backend | `app.json:28` — `"web": { "output": "server" }`. Admin routes are `*+api.ts` files under `src/app/api/admin/`; **no new process, no new deploy target.** |
| `handle()` + the six error helpers already exist | `src/lib/server/http.ts` — `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `json`, `readJson`, `readCoords`. Helpers **return** an `ApiError`; callers `throw` it. Every admin route wraps in `handle()`; no new envelope is invented. |
| `requireSession(request)` throws a 401 envelope | `src/lib/server/session.ts:10-13`. `requireAdmin` is added as a sibling in the same file so there is exactly one import site for guards. |
| Better Auth `1.6.23`, currently only the `expo()` plugin | `src/lib/server/auth.ts`; `package.json` — `better-auth: ^1.6.23`, `@better-auth/expo: ^1.6.23`. The `admin` plugin ships in this version. |
| **There is no role, permission, or admin concept anywhere today** | No `role` column in `src/db/auth-schema.ts`; nothing in `src/db`, `src/lib/server`, or `src/types` greps for one. This is why phase 0 exists and why it is a schema change. |
| `src/db/auth-schema.ts` is CLI-generated and must not be hand-edited | Its own header, `src/db/auth-schema.ts:1-5`: "generated by `npx @better-auth/cli generate` … Regenerate instead of hand-editing if the Better Auth version or plugins change." Adding `admin()` changes the plugin set, so regeneration is mandatory, not optional. |
| Row→domain mapping lives only in `src/lib/server/serialize.ts` | Eight existing `toX` mappers plus private `rowCoords`/`distanceFrom`/`roundCoord` usage. Admin responses differ in shape from donor-facing ones, so they get their own `toAdminX` mappers **in that file**, never inline shaping in a route. |
| `src/lib/api.ts` has `get`/`post`/`patch` and **no `delete`** | `src/lib/api.ts:58-68`. Centers, articles, and announcements need DELETE, so a `delete` verb is added there (phase 3) rather than any screen calling `fetch` directly. `request()` already returns `undefined` on 204 (`src/lib/api.ts:53`), so the addition is three lines and needs no new response handling. |
| Every query key is registered in `qk` | `src/hooks/api/keys.ts`. Admin keys are added there under an `admin` sub-object; nothing defines an inline key array. |
| Push batches at 100 and prunes dead tokens positionally | `src/lib/server/push.ts:17` (`CHUNK = 100`), `:95` (sequential batch loop), `:124` (`details.error === 'DeviceNotRegistered'` → delete by `inArray`). Broadcast must call the extracted sender, not re-implement either behavior. |
| neon-http has **no interactive transactions** | `src/lib/server/db.ts` uses `neon(...)` + `drizzle`. Multi-statement admin writes use `db.batch`, exactly as `src/app/api/appointments/[id]/complete+api.ts` already does. A moderation action that must be atomic with its audit row uses `db.batch`. |
| **There is no test framework in this repo** | No jest/vitest/playwright in `package.json`, no `test` script (`package.json:56-67`), no test files. Phase 5 is therefore `npm run lint`, `npm run typecheck`, a web build, and a written manual QA script — not automated tests. |
| Platform extensions in `src/app` need a non-platform base file | <https://docs.expo.dev/router/advanced/platform-specific-modules/> — supported in the app directory "only if a non-platform version also exists," to keep routes universal for deep linking. **A lone `.web.tsx` route does not work**, which decides the web-only mechanism below. |
| `scripts/seed.ts` creates users through Better Auth | `scripts/seed.ts:69-72` — `auth.api.signUpEmail({ body: { name, email, password } })`. The admin-promotion script reuses this so password hashes stay real. |
| Design system is binding, not advisory | `AGENTS.md` requires `design-system/README.md` + the relevant sections before UI work. Tokens from `src/constants/theme.ts`; promotion rule `design-system/COMPONENTS.md:36`; four-state table `design-system/PATTERNS.md:11-20`; token extension rule `design-system/TOKENS.md:52-54`. |
| Expo package changes go through `npx expo install` | `AGENTS.md`. **Not needed here** — `better-auth` is not an Expo package, so its plugin needs no install at all, and this plan adds no new dependency. |

---

## Decisions

- **Role mechanism: the Better Auth `admin()` plugin, not a hand-rolled column.** Verified against <https://www.better-auth.com/docs/plugins/admin>: it adds `role`, `banned`, `banReason`, `banExpires` to `user` and an impersonation field to `session`, and mounts `listUsers`, `getUser`, `setRole`, `banUser`, `unbanUser`, `removeUser`, `revokeUserSessions` under `/api/auth/admin/*`. That is most of capability area 2 for free, **including ban enforcement in the sign-in path**, which is the part a hand-rolled version gets wrong. *Alternative — a `role` pgEnum on `profiles` or a separate `admin_users` table, leaving `auth-schema.ts` untouched:* lost because suspend, reactivate, delete, session revocation, and refusing a banned user at sign-in would all be hand-written and individually testable only by hand, in a repo with no test framework. **Cost accepted:** `src/db/auth-schema.ts` must be regenerated, and the plugin's own endpoints bypass `handle()`/`requireAdmin`, so phase 2 wraps them rather than calling them from the client (see below).
- **Impersonation stays off.** The plugin ships `impersonateUser`; v1 does not expose it. There is no operational need that moderation and account tools do not already cover, and it is the single highest-blast-radius capability in the plugin. The session column exists after regeneration regardless; no route surfaces it. *Revisit only with a concrete support workflow that needs it.*
- **Web-only enforcement: both mechanisms, because neither alone is sufficient.** Route files under `src/app/(admin)/` are plain `.tsx` (a base file is required, per the assumptions table) and the layout redirects when `Platform.OS !== 'web'`. That handles navigation but **not bundling** — so all real admin UI lives in `src/components/admin/`, outside `src/app`, where the platform-extension rule does not apply: `console.tsx` is the web implementation and `console.native.tsx` is a one-line stub. The route file imports the stub-able module, so the native bundle never pulls admin screens, the table primitive, or admin hooks. *Alternative — redirect only:* lost because the native bundle would still carry every admin screen. *Alternative — `.web.tsx` routes only:* does not work, per the docs. **Guarantee for the native app:** no file under `src/app/(tabs)/`, no existing route, and no shared primitive changes behavior; the only shared-file edits are additive (`qk`, `api.delete`, `theme.ts`, `serialize.ts`, `session.ts`, `push.ts`'s extracted export) and phase 5 verifies the native app builds and behaves identically.
- **Audit log: a new `admin_audit_log` table.** *Alternative — `console.log` in each handler:* lost outright; the safety section makes an in-product record of who took down which request non-negotiable, and console output is not queryable, not durable, and not visible to staff. *Alternative — reusing an existing table:* there is none remotely suitable.
- **Request take-down is soft.** `status = 'expired'` plus an audited reason. *Alternative — deleting the row for clear abuse:* lost because a donor with that request open gets an unexplained 404 while possibly en route, and the evidence of the abuse is destroyed along with it.
- **One new primitive: `src/components/ui/data-table.tsx`.** It satisfies all three conditions in `design-system/COMPONENTS.md:36` honestly — it appears in six screens (requests, users, centers, appointments, announcements, articles), "admin data table" is a nameable product role, and its API is far smaller than the JSX it replaces. Critically, it owns loading, empty, error, and ready **internally**, which is the only way six screens satisfy `design-system/PATTERNS.md:11-20` without six copies of the same state branch. It composes `Card`, `ThemedText`, `Skeleton`, `EmptyState`, and `PressableScale` — it is a layout and state container, not a new visual language. *Alternative — generalizing `src/components/blood-compatibility-table.tsx`:* lost; that is a fixed 8×8 matrix with hardcoded `CELL`/`ROW_LABEL_WIDTH` geometry solving a different problem, and widening it would violate the "do not widen a shared component API until two real callers demonstrate the same need" rule in `PATTERNS.md:46-56`.
- **Layout width: a new `AdminMaxWidth = 1200` token, not an override of `MaxContentWidth`.** `MaxContentWidth = 640` and `TabBarClearance = 120` (`src/constants/theme.ts:157-158`) are phone-tuned and stay untouched — every existing screen keeps its exact width behavior. A six-column moderation table is unreadable at 640, so the admin shell gets its own constant, added to the same token file per `TOKENS.md:52-54` with a comment stating the justification, and the admin shell is its only consumer. `TabBarClearance` simply does not apply: the admin shell has no tab bar. *Alternative — a silent `maxWidth` literal in the admin layout:* lost; `AGENTS.md` forbids literal visual values, and a token with a recorded reason is auditable where a magic number is not.

---

## Design-system conformance

Per `AGENTS.md`, no new visual style and no literal visual values. Every admin surface composes what exists:

| New surface | Reuses |
|---|---|
| Admin shell chrome | `ScreenHeader` (`title`, `trailing`) + `SectionHeader`; canvas from `theme.background`, content centered under the new `AdminMaxWidth` |
| Shell navigation | `SegmentedControl` for the four capability areas — it is already generic over `T extends string` and carries `accessibilityRole="tab"` |
| Every list | the new `DataTable`, which internally uses `Card padding={0}` + `StyleSheet.hairlineWidth` dividers, exactly as `profile.tsx`'s `Section` does |
| Loading / empty / error | `Skeleton` and `SkeletonCard` shaped like the eventual rows, `EmptyState` with `actionLabel="Try again"` for the error branch — the four-state table, `PATTERNS.md:11-20` |
| Status + urgency | `Badge` with `URGENCY_TONE` / `URGENCY_LABEL` from `src/components/ui/badge.tsx` — label text, never tone alone |
| Blood types | `BloodTypeGlyph`; compatibility from `src/lib/blood.ts` (`donorsFor`, `canDonateTo`) |
| Filters | `SegmentedControl` for small enumerations, `Input` with `icon` for search; `Input` already owns its `error` state |
| Destructive actions | `ConfirmSheet` with `destructive` — it has no `busy` prop, so callers close then mutate, as existing screens already do |
| Action feedback | `useToast()` from `src/components/ui/toast.tsx`, semantic tone |
| Buttons | `Button` with `variant="danger"` for destructive and `loading` for in-flight — it keeps its label and exposes `busy` when loading |
| Detail panels | `Card variant="tinted"` + `StatTile` rows, as `(tabs)/donor.tsx:211-213` composes them |
| Dates / times | `longDate`, `timeOfDay`, `monthAbbrev`, `dayOfMonth` from `src/lib/format.ts` |
| Type labels | `DONATION_TYPE_LABEL` from `src/lib/booking.ts` |
| Typography | `ThemedText` with the `type` prop (note: `type`, not `variant`) — `title2`, `headline`, `subhead`, `footnote`, `mono` for ids |
| Tokens | `Colors` via `useTheme()`, `Spacing`, `Radius`, `Shadow`, plus the new `AdminMaxWidth` — no literals |
| Icons | `Ionicons` only, 18/20/24pt, `textSecondary` default; never emoji as controls |

**Three explicit non-additions,** applying the promotion rule (`COMPONENTS.md:36`) honestly rather than inventing an admin component kit:

- **No `AdminLayout` primitive.** It would have exactly one consumer. Keep the shell local to `src/components/admin/console.tsx`.
- **No `FilterBar` primitive.** Each capability area filters on different fields; composing `SegmentedControl` + `Input` per screen is smaller than a prop-explosion component, and there is no shared product role.
- **No modal/dialog primitive.** `DESIGN_PRINCIPLES.md` explicitly forbids introducing a web-style centered modal, and `PATTERNS.md:22` prefers inline expansion or a route. Admin detail views are routes (`/admin/requests/[id]`), and confirmations are `ConfirmSheet`.

---

## Phase 0 — Role, `requireAdmin`, and an `/admin` shell only an admin can reach

A walking skeleton, and explicitly nothing more: sign in as an admin on web, land on `/admin`, see the chrome and the four navigation segments with no domain features behind them. A signed-in non-admin gets 403 from the API and is redirected away from the UI. Native is provably unaffected.

- [x] **`src/lib/server/auth.ts`** — add `admin()` from `better-auth/plugins` to `plugins: [expo(), admin({ defaultRole: 'user', adminRoles: ['admin'] })]`. No `ac`/`roles` access-control statement in v1: one `admin` role, so the default resource/action set is sufficient and a custom statement would be unused indirection.
- [x] **`src/db/auth-schema.ts`** — regenerate with `npx @better-auth/cli generate`. **Do not hand-edit** (`src/db/auth-schema.ts:1-5`). Expect `role`, `banned`, `banReason`, `banExpires` on `user` and an impersonation field on `session`. Diff-review the output: the file currently uses non-`withTimezone` timestamps and carries hand-written `relations` blocks at its tail — confirm the generator preserves or re-emits them, and re-add the relations if it drops them.
- [x] **`src/db/schema.ts`** — add `admin_audit_log`: `id` (`id('adt')`), `actorId` text NOT NULL → `user.id` (**`onDelete: 'set null'`**, nullable actor — a deleted admin must not erase the history of their actions, so this column is nullable by deliberate exception), `action` text NOT NULL (dotted verb, e.g. `request.takedown`), `targetType` text NOT NULL, `targetId` text NOT NULL (**plain text, no FK** — the target may be deleted and the row must outlive it), `reason` text, `metadata` jsonb, `createdAt` timestamptz NOT NULL default now. Index on `(targetType, targetId)` and on `createdAt`.
- [x] **`npm run db:push`** — **required.** This is the only phase with a schema change; phases 1–4 add no columns. **Applied as the equivalent additive DDL, not via `db:push`:** the command is non-viable in this database. It reports five pre-existing drift columns that hold data and are absent from `src/db/schema.ts` (`donations.method`, `donations.verified_by_center_id`, `donations.verified_at`, `donation_centers.phone`, `emergency_requests.escalated_at`) and offers to drop them. The phase-0 delta — five nullable auth columns, the `admin_audit_log` table, its FK, and its two indexes — was applied directly instead; a subsequent `db:push` then reported no admin-related change, confirming the schema is in sync. ~~**The drift is an open item for phase 5.**~~ **Resolved 2026-10-07** — the drifting columns, and the two undeclared tables behind them, were an abandoned uncommitted feature and have been dropped; `npm run db:push` now reports "No changes detected". See open question 5.
- [x] **`src/lib/server/session.ts`** — add `requireAdmin(request)`: call `requireSession`, then `throw forbidden('Admin access required')` unless the role matches. One guard, one import site; **no per-route role checks anywhere.** Returns the session so routes keep the `const { user } = await requireAdmin(request)` shape. Note the role field may be a comma-joined string, so test membership rather than equality.
- [x] **New `src/lib/server/audit.ts`** — `logAdminAction({ actorId, action, targetType, targetId, reason?, metadata? })` returning the insert so callers can hand it to `db.batch` alongside the mutation where atomicity matters (neon-http has no interactive transactions).
- [x] **New `scripts/promote-admin.ts`** — promote by email, idempotent, reusing the `auth.api` pattern from `scripts/seed.ts:69-72`. Add `"admin:promote": "tsx scripts/promote-admin.ts"` to `package.json` scripts. Document in the file header that this is the **only** way to mint the first admin, since the console cannot grant a role nobody holds yet.
- [x] **New `src/app/api/admin/me+api.ts`** — `GET`, guard `requireAdmin`, returns `{ role }`. The shell's gate, and the smallest possible target for the phase-0 negative tests.
- [x] **New `src/app/admin/_layout.tsx`** — plain `.tsx` (a base file is mandatory). `Platform.OS !== 'web'` → `<Redirect href="/" />`. On web, `Stack` with `headerShown: false`. **Not** registered inside `(tabs)`. **Two deviations from the plan as written:** (1) the directory is `admin/`, not `(admin)/` — a parenthesized group contributes nothing to the URL, so `(admin)/index.tsx` would have mapped to `/` and collided with the root gate in `src/app/index.tsx`, and `/admin` would not have existed at all. A real path segment is required to satisfy this phase's own acceptance criterion. (2) The `/api/admin/me` gate lives in `src/components/admin/console.tsx`, not in this layout: route files under `src/app` are always bundled for native, so gating here would have pulled `useAdminMe` onto every phone. The layout now does nothing on native but redirect.
- [x] **New `src/app/admin/index.tsx`** — thin route: imports and renders `AdminConsole` from `@/components/admin/console`, nothing else.
- [x] **New `src/components/admin/console.tsx`** and **`console.native.tsx`** — the web implementation and a `null`-returning stub. This pair is what keeps admin UI out of the native bundle.
- [x] **`src/constants/theme.ts`** — add `AdminMaxWidth = 1200` with a comment recording why it is not `MaxContentWidth`. Leave `MaxContentWidth` and `TabBarClearance` untouched.
- [x] **`src/types/api.ts`** — add `AdminMeResponse`. All later admin types land in this file beside the existing bodies.
- [x] **`src/hooks/api/keys.ts`** — add `admin: { me: ['admin','me'] as const, ... }` to `qk`.
- [x] **New `src/hooks/api/admin/use-admin-me.ts`** — `useAdminMe()`, with 403 **and 401** excluded from retry, mirroring how `useProfile` treats 404 as a real state (`src/hooks/api/use-profile.ts:8-21`). Deliberately **not** re-exported from the `src/hooks/api` barrel: donor screens import that barrel, so exporting admin hooks there would defeat the bundle split.

**Acceptance:** `npm run typecheck` and `npm run lint` pass. After `npm run db:push` and `npm run admin:promote <email>`, signing in as that user on web and visiting `/admin` shows the shell in both light and dark mode at phone and desktop width; the four segments are present and inert. A signed-in non-admin visiting `/admin` is redirected and `curl`ing `/api/admin/me` with their cookie returns **403** `{"error":{"code":"forbidden",...}}`; signed out returns **401**. `npx expo start --android` boots the app with no admin screen reachable and no behavior change to any tab, and the admin modules are absent from the native bundle.

---

## Phase 1 — Requests moderation

The highest-risk surface, and the reason the console exists. List and filter every `emergency_requests` row, open one with its responders and the donor behind each, and take an audited moderation action.

- [x] **New `src/components/ui/data-table.tsx`** — the one promoted primitive. `{ columns: { key, header, width?, render }[], rows, keyExtractor, onRowPress?, state, emptyTitle, emptySubtitle?, onRetry? }`. Horizontal `ScrollView` for overflow so the page itself never scrolls sideways; `accessibilityRole` on rows; 44pt minimum row height; owns all four states. Export from `src/components/ui/index.ts`.
- [x] **New `src/app/api/admin/requests+api.ts`** — `GET`, guard `requireAdmin`. Query params `status`, `urgency`, `bloodType`, `city`, `postedWithinDays`, `limit`, `offset`. Response `AdminRequestListResponse` = `{ rows: AdminRequest[]; total: number }`. Server-side pagination from the start: this table has no natural upper bound.
- [x] **New `src/app/api/admin/requests/[id]+api.ts`** — `GET`, guard `requireAdmin`. Response `AdminRequestDetail` = `AdminRequest & { responders: AdminResponder[]; auditTrail: AuditEntry[] }`. Joins `responders ⋈ user ⋈ profiles` for donor name, email, phone, blood type, city.
- [x] **New `src/app/api/admin/requests/[id]/moderate+api.ts`** — `POST`, guard `requireAdmin`. Body `{ action: 'verify' | 'expire' | 'fulfill' | 'takedown'; reason?: string }`; `reason` **required** for `takedown`, else `badRequest`. One route, not four, because the audit write is then structurally impossible to omit. Uses `db.batch` to apply the status change and the audit insert together. `throw notFound` for a missing id; `throw conflict` for a transition that makes no sense (expiring an already-expired request). `verify` records an audit row and sets no status — it is an attestation, and `request_status` has no `verified` member (see Open questions).
- [x] **`src/lib/server/serialize.ts`** — add `toAdminRequest(row, respondersCount)` and `toAdminResponder(row)`. **Neither emits a coordinate**; distance comes from the existing `distanceFrom` path. Add `toAuditEntry(row)`.
- [x] **`src/types/api.ts`** — add `AdminRequest`, `AdminResponder`, `AdminRequestDetail`, `AdminRequestListResponse`, `ModerateRequestBody`, `AuditEntry`.
- [x] **`src/hooks/api/keys.ts`** — add `adminRequests(filters)` and `adminRequest(id)`. Filters belong **in** the key here (unlike `location` in the donor app) because they change the server result set.
- [x] **New `src/hooks/api/admin/use-admin-requests.ts`** — `useAdminRequests(filters)`, `useAdminRequest(id)`, `useModerateRequest(id)`. The mutation invalidates both keys `onSettled`; **no optimistic update** — a moderation action's real outcome must be read back from the server, not assumed.
- [x] **New `src/components/admin/requests-list.tsx`** and **`request-detail.tsx`**; new route files `src/app/(admin)/requests.tsx` and `src/app/(admin)/requests/[id].tsx` (thin, importing the platform-split components).
- [x] Moderation controls: `Button variant="danger"` + `ConfirmSheet` for `takedown` and `expire`, naming the request and stating that responders will see it closed; a required reason `Input`; `useToast` on success.

**Deviations from the plan as written, and why:**

1. **Routes are `src/app/admin/requests.tsx` and `src/app/admin/requests/[id].tsx`**, not `(admin)/` — carrying forward phase 0's correction: a parenthesized group contributes nothing to the URL, and `/admin` has to be a real path segment.
2. **The shell and the access gate moved to `src/components/admin/shell.tsx`.** Phase 0 kept both inside `console.tsx` on the "it would have exactly one consumer" rule; phase 1 gave them three (console, list, detail), so the rule now points the other way. It is still *not* a `src/components/ui` primitive — it is route scaffolding for one web-only surface. `AdminShell` also owns the capability navigation, so each area is a linkable route instead of in-page state.
3. **`/admin` now redirects to `/admin/requests`** and keeps only the three not-yet-built areas' placeholders. Moderation is the reason the console exists, so it is the front door.
4. **Blood-type filtering is a row of `BloodTypeGlyph` toggles**, not a `SegmentedControl`: eight values do not fit the control, and the glyph is what donors already see. Selection is carried by the filled variant *and* `accessibilityState.selected`, never by color alone.
5. **`DataTable` rows use `accessibilityRole="list"` + `"button"`**, not a table/grid role: React Native's `AccessibilityRole` union has no table role.
6. **`verify` is refused on a closed request** (`conflict`) alongside the expire/fulfill guards — there is nothing left to attest to.
7. **`DataTable` is NOT exported from `src/components/ui/index.ts`**, contrary to this phase's own checkbox. The two instructions were in conflict: every donor screen imports that barrel, so the export put the table in the Android bundle — measured, not assumed — while the Decisions section promises "the native bundle never pulls admin screens, **the table primitive**, or admin hooks." The guarantee wins; admin components import `@/components/ui/data-table` directly, exactly as admin hooks are kept out of the `src/hooks/api` barrel. The barrel carries a comment saying why, so nobody re-adds it.

**Verification record** (run against `expo start --web` on 2026-10-07; the demo donor was promoted for the run and **revoked afterwards**, and the fixture row below was created directly in the database — *not* through `POST /api/requests`, which would have fanned real push out to real devices):

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | clean |
| Signed out — all four admin routes | **401** `{"error":{"code":"unauthorized",...}}` |
| Signed in as a non-admin — all four | **403** `{"error":{"code":"forbidden","message":"Admin access required"}}` |
| Signed in as admin — `/api/admin/me` | **200** `{"role":"admin"}` |
| List, no filters | 200, `total` 14, 14 rows (includes expired, unlike the donor feed) |
| Filters | `status=open` 1 · `status=expired` 5 · `urgency=routine` 2 · `bloodType=O-` 3 · `city=toledo` 7 (substring, case-insensitive) · `postedWithinDays=1` 1 · combined 1 |
| Empty result | `city=NowhereCity` → 200, `total` 0, 0 rows (the table shows `EmptyState`, not a blank grid) |
| Pagination | `limit=2&offset=12` → 2 rows, `total` still 14 — the pager reports the result set, not the page |
| Param validation | `status=nonsense` → 400 naming the allowed values; `limit=-3` → 400 |
| **Privacy grep** | `latitude`/`longitude`: **zero matches** in both the list and the detail response |
| Detail | 200 with the responder roster — name, email, phone, blood type, city, derived `distanceKm` — and the audit trail; unknown id → **404** |
| `takedown` with no reason / blank reason | **400** "A reason is required to take down a request" |
| Unknown action | **400** naming the four allowed actions |
| `verify` | 200, status unchanged, audit row written with `to: null` |
| `takedown` | 200, `status='expired'`, audit row with actor, reason, and `from: open → to: expired` |
| Repeat `takedown` / `verify` / `fulfill` on a closed request | **409** each, with a specific message |
| Donor-facing outcome | `GET /api/requests/[id]` resolves to `status: "expired"` — a clear closed state, **not** a 404 — and the feed drops the row |
| `/admin`, `/admin/requests`, `/admin/requests/[id]` | all 200, no Metro bundling errors |
| **Native bundle grep** (Android, dev, unminified) | `AdminShell`, `AdminGate`, `api/admin`, `use-admin-requests`, `DataTable`, and every admin copy string: **absent**. Present and expected: the `.native.tsx` stub identifiers, their route files, and `AdminMaxWidth` (a number in the shared token file). This grep is what caught deviation 7. |
| Database left as found | demo account back to `role: "user"`, fixture row and its responder removed, `admin_audit_log` back to 0 rows |

**Not yet done, and deliberately left for a human:** the design-system pass — both themes, phone and desktop width, enlarged system text, screen-reader order over `DataTable`, and the error branch with the network cut. All four states are reachable in code and the error/empty branches were exercised through the API, but none of it has been *looked at*.

**Acceptance:** `npm run lint` and `npm run typecheck` pass. On web as an admin, the list renders with skeleton rows shaped like real rows, filters narrow the result set, and an empty filter combination shows `EmptyState` rather than a blank table. Opening a request shows its responders with donor contact details and **no coordinates anywhere in the JSON response** (verify with `curl`). Taking a request down requires a reason, sets `status='expired'`, writes an `admin_audit_log` row visible in the detail view's audit trail, and the donor app shows that request as closed rather than erroring. Both themes, enlarged system text, and keyboard/screen-reader order on the table all check out. Non-admin gets 403 on all three routes.

---

## Phase 2 — Users and donors

- [x] **New `src/app/api/admin/users+api.ts`** — `GET`, guard `requireAdmin`. Search `q` across name/email/phone, filters `bloodType`/`city`, plus `limit`/`offset`. Joins `user ⋈ profiles` with a grouped `count()` over `push_tokens` for device count. **Deviation:** the join is a **left** join and the `push_tokens` count is a grouped query over the page's ids rather than a correlated subquery. A `profiles` inner join would have hidden every account that signed up and never finished onboarding — 3 of the 24 live accounts — and those are exactly the rows staff are looking for, so every profile-owned field is optional in the response instead.
- [x] **New `src/app/api/admin/users/[id]+api.ts`** — `GET` for detail (profile, donation history, appointments, responder history, **registered devices**, and the account's own audit trail); `PATCH` for correcting `lastDonationDate`. Both `requireAdmin`, both audited. `PATCH` validates the date is not in the future → `badRequest`, and `conflict`s when the account has no `profiles` row — there is nothing to write to, and creating one would invent a blood type and city the donor never gave. `null` clears the date, handing eligibility back to the newest `donations` row.
- [x] **New `src/app/api/admin/users/[id]/status+api.ts`** — `POST`, guard `requireAdmin`. Body `{ action: 'suspend' | 'reactivate' | 'delete'; reason?: string }`. Calls `auth.api.banUser` / `unbanUser` / `removeUser` server-side through the audited wrapper; the client never touches `/api/auth/admin/*`. `delete` writes its audit row **first**, with an identifying snapshot. `reason` is **required** for `suspend` and `delete`, optional for `reactivate` (it is restorative). Acting on your own account is refused with `conflict`.
- [x] **New `src/lib/server/auth-admin.ts`** — **not in the plan as written, and necessary.** The plugin's endpoints raise Better Auth `APIError`, which `handle()` does not recognise, so every plugin-side refusal (self-ban, already-banned, unknown user) would have reached staff as a bare 500. `callAuthAdmin` forwards the caller's headers so the plugin re-checks the admin session rather than trusting us, and maps its 4xx into this project's `{ error: { code, message } }` envelope; a 5xx is left to `handle()` rather than dressed up as a client error.
- [x] **`src/lib/server/serialize.ts`** — `toAdminDonor(user, profile, deviceCount)`. Emits name, email, phone, city, region, blood type, `lastDonationDate`, device count, `hasProfile`, and `banned`/`banReason`/`banExpires`. **No coordinates** — `hasLocation` reports only *whether* one is stored, which is all that affects how a donor is matched. **Deviation:** no separate `toAdminDonorDetail`; the detail route composes `toAdminDonor` with the existing `toDonation`/`toAppointment`/`toAuditEntry` mappers rather than adding a ninth mapper that would only re-emit what they already produce.
- [x] **`src/types/api.ts`**, **`src/hooks/api/keys.ts`**, **new `src/hooks/api/admin/use-admin-users.ts`**, **new `src/components/admin/users-list.tsx`** + **`user-detail.tsx`** (+ their `.native.tsx` stubs), **new routes `src/app/admin/users.tsx`** + **`users/[id].tsx`**.
- [x] Suspend and delete both behind `ConfirmSheet destructive`; delete's copy counts the donation records and appointments that go with the account and states plainly that they cannot be restored.

**Deviations from the plan as written, and why:**

1. **Routes are `src/app/admin/users.tsx` and `users/[id].tsx`**, not `(admin)/` — carrying forward phase 0's correction.
2. **`BloodTypeFilter` was extracted to `src/components/admin/blood-type-filter.tsx`.** The users list needed the identical eight-glyph control the requests list already had, which is precisely the "two real callers demonstrate the same need" threshold in `PATTERNS.md:46-56`. It stays in `src/components/admin`, **not** `src/components/ui`: both callers are console screens, and the ui barrel is what every donor screen imports.
3. **`readEnum`/`readInt` moved from `requests+api.ts` into `src/lib/server/http.ts`**, joining `readCoords`, and `readDate` was added beside them. Phases 2 and 3 needed the same param validation, and the alternative was three copies. Purely additive for every existing caller.
4. **`toSearchParams` moved into `src/hooks/api/admin/query-params.ts`**, shared by all three list hooks. It sits with the admin hooks rather than in `src/lib` for the same reason those hooks are kept out of the `src/hooks/api` barrel.
5. **Devices are surfaced as a list, not just a count.** The count alone cannot answer "would an emergency push actually reach this donor?" — the detail view shows platform and last registration per device. Push **tokens** are never emitted.

**Verification record** (run against `expo start --web` on 2026-10-07; the demo donor `maria@donornet.demo` was promoted for the run and **revoked afterwards**; a disposable account was created for the suspend/delete tests and the database was restored to its pre-run state):

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | clean |
| Signed out — every phase-2 route | **401** `{"error":{"code":"unauthorized",...}}` |
| Signed in as a non-admin — every phase-2 route | **403** `{"error":{"code":"forbidden","message":"Admin access required"}}` |
| List, no filters | 200, `total` 24 — including the 3 accounts with no `profiles` row, which an inner join would have hidden |
| Search | `q=villa` → 1 (partial **name**) · `q=miguel` → 1 (partial **email**) |
| Filters | `bloodType=A-` → 2 · `city=NowhereCity` → `total` 0, 0 rows (the table shows `EmptyState`, not a blank grid) |
| Param validation | `bloodType=XX` → **400** naming the eight allowed values |
| **Privacy grep** | `latitude`/`longitude`: **zero matches** across a 100-row list response and the detail response |
| Detail | 200 with donation history, appointments, responses, devices, and audit trail; unknown id → **404** |
| `PATCH` validation | future date → **400** "cannot be in the future" · `"not-a-date"` → **400** · `{}` → **400** naming the field |
| `PATCH` applied | 200; `profiles.last_donation_date` moved, and the audit row carried actor, reason, and `from` → `to` |
| `suspend` with no reason | **400** "A reason is required to suspend an account" |
| Unknown action | **400** naming the three allowed actions |
| Acting on your own account | **409** "You cannot change your own account status from the console" |
| `reactivate` a non-suspended account | **409** "This account is not suspended" |
| `suspend` | 200, `banned: true`; **the donor's live session went 401 immediately**, and sign-in returned **403** `BANNED_USER` with the plugin's banned message — not a generic failure |
| Repeat `suspend` | **409** "This account is already suspended" |
| `reactivate` | 200, `banned: false`; the donor signed back in (**200**) |
| `delete` with no reason | **400** "A reason is required to delete an account" |
| `delete` | **204**; the account cascaded away (0 `user` rows) and detail → **404**, **while its `user.delete` audit row survived** carrying email, name, role, city, and blood type |
| Database left as found | demo account back to `role: "user"`, test account gone, demo countdowns restored, `admin_audit_log` back to 0 rows |

**Not yet done, and deliberately left for a human:** the design-system pass — both themes, phone and desktop width, enlarged system text, screen-reader order over `DataTable`, and the error branch with the network cut. All four states are reachable in code and the empty/error branches were exercised through the API, but none of it has been *looked at*.

**Acceptance:** lint and typecheck pass. Search finds a seeded demo donor by partial name and by email; the row shows blood type, city, last donation, and a device count matching `push_tokens`. Correcting `lastDonationDate` is reflected in the donor app's eligibility calculation. A suspended user is signed out and cannot sign back in, receiving the plugin's banned message rather than a generic failure; reactivating restores access. Deleting a demo account cascades and leaves its `admin_audit_log` row intact with the identifying snapshot. No response body contains a coordinate. Non-admin gets 403 on every route.

---

## Phase 3 — Centers and appointments

The first write routes `donation_centers` has ever had.

- [x] **`src/lib/api.ts`** — added `delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })` beside `get`/`post`/`patch`. `request()` already returns `undefined` on 204, so nothing else changed. Purely additive, and the only edit to a donor-shared client file in this phase.
- [x] **New `src/app/api/admin/centers+api.ts`** — `GET` (list, with exact coordinates: `toCenter` already emits them unrounded because centers are public places) and `POST` (create). Validates coordinates with `isValidLat`/`isValidLng`, `needsUrgent` against `blood_type`, `kind` against `center_kind`, and `rating` against 0–5. `distanceKm` is seeded with `cityDistanceKm(city)`, the same per-city fallback `scripts/seed.ts` uses.
- [x] **New `src/app/api/admin/centers/[id]+api.ts`** — `PATCH` and `DELETE`, both `requireAdmin` and audited. `DELETE` refuses with `conflict` when **future, still-active** appointments reference the center, naming the count and pointing at `openNow`; the FK is `onDelete: 'cascade'`, so an unguarded delete would silently destroy donors' booked donations. `PATCH` writes only the fields the operator actually sent, and re-derives `distanceKm` when `city` changes.
- [x] **New `src/app/api/admin/appointments+api.ts`** — `GET`, filters `status`/`centerId`/`dateFrom`/`dateTo` plus `limit`/`offset`, joining center and donor. An inverted date range is a **400** rather than a silently empty result set.
- [x] **New `src/app/api/admin/appointments/[id]+api.ts`** — `POST` with `{ action: 'cancel' | 'complete' }`, audited. Calls the extracted shared transitions, so the audit row commits in the same `db.batch` as the mutation.
- [x] **New `src/lib/server/appointments.ts`** — the shared transition, extracted because the duplication was well past "a few lines": `complete` carries the donation insert, the never-move-backward `lastDonationDate` check, and the `db.batch`. Both donor routes were refactored onto it and now own only the ownership question. The helpers take an optional extra statement so the admin route's audit insert joins the same batch.
- [x] **`src/lib/server/serialize.ts`** — `toAdminAppointment(appointment, center, donor)` and `toAdminCenter(center, upcomingAppointments)`.
- [x] Types, keys, **new `src/hooks/api/admin/use-admin-centers.ts`** and **`use-admin-appointments.ts`**, components (`centers-list.tsx`, `appointments-list.tsx` + `.native.tsx` stubs), routes (`src/app/admin/centers.tsx`, `appointments.tsx`). Center create/edit is a form composing `Input` and `SegmentedControl`, **inline on the route, not a modal**.

**Deviations from the plan as written, and why:**

1. **Center validation lives in `src/lib/server/centers.ts`, not inside a route.** `PATCH` and `POST` must enforce the same rules, and the only alternative was one route importing another route's `+api.ts` module — fragile, and it would evaluate that route's exports as a side effect. The shared module also owns `countUpcomingByCenter`, the booking check that governs `DELETE`.
2. **`POST /api/admin/centers` generates the center id itself** rather than leaving it to the column's `$defaultFn`. The audit insert has to name its target in the same `db.batch`; without a known id the audit could only be written after the insert returned, leaving a window where a created center exists with no record of who created it.
3. **`DELETE` counts only *future* active appointments.** A past booking cannot be protected by refusing the delete — the visit either happened or it did not — so blocking on history would make unused old centers permanently undeletable.
4. **The shared transitions added conflict guards the donor `cancel` route did not have.** It previously cancelled unconditionally, so cancelling an already-cancelled or completed appointment silently "succeeded". The donor UI gates cancel behind `isActive`, so **no reachable donor behavior changed** — this closes an API hole rather than altering the app. Verified by re-testing both donor routes end to end.
5. **Appointments are a sub-view of the Centers area, not a fifth top-level segment.** The brief defines four capability areas; centers and the appointments booked against them are one area with two screens, so `AdminShell` gained a `subNav` slot and `CentersSubNav` reuses `SegmentedControl`. No new primitive.
6. **`needsUrgent` is edited as a single blood type** via the shared `BloodTypeFilter`, stored as a one-element array. The column is an array and the API accepts several, but a multi-select editor would be a new control for a need no operator has demonstrated; the API does not restrict what a future editor can send.

**Verification record** (run against `expo start --web` on 2026-10-07, same promoted-then-revoked demo admin; a throwaway center and four bookings were created and removed, and the database was restored to its pre-run state):

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | clean |
| Signed out / non-admin — every phase-3 route | **401** / **403** respectively |
| Centers list | 200, 5 centers, each with `upcomingAppointments` |
| Create validation | missing field → **400** "name is required" · `kind=clinic` → **400** naming the three kinds · `latitude` without `longitude` → **400** · `needsUrgent:["Z+"]` → **400** · `rating:9` → **400** |
| Create | **201**, `distanceKm` derived from the city, coordinates and `needsUrgent` stored |
| **Reaches the donor app without a seed run** | the new center appeared in `GET /api/centers` (5 → 6 centers) and was immediately bookable — a donor booked it (**201**) |
| Edit round-trip | `hours`, `openNow`, `rating`, `needsUrgent` all round-tripped; a `PATCH` of only `rating` left the others untouched; changing `city` re-derived `distanceKm` (2.2 → 7.9) |
| Unknown center | `PATCH` → **404**, `DELETE` → **404** |
| **`DELETE` with a future booking** | **409** — names the center and its booking count, then points at turning "Open now" off instead |
| `DELETE` once no active bookings remain | **204**; gone from both the admin and donor center lists, and the `center.delete` audit row holds name, kind, city, address, hours |
| Appointments list | 200, `total` 16, donor and center named; filters `status=confirmed` 7 · `completed` 2 · `cancelled` 7 · `centerId` 1 |
| **Privacy grep** | `latitude`/`longitude`: **zero matches** across a 100-row appointments response |
| Param validation | `status=nope` → **400** · `dateFrom=garbage` → **400** · inverted range → **400** "dateFrom must be on or before dateTo" |
| Unknown action / appointment | **400** naming the two actions · **404** |
| **Admin `complete` matches the donor route** | donation rows 5 → 6 **and** `last_donation_date` advanced to the visit date — the same end state the donor's own tap produces |
| Repeat admin `complete` / `cancel` a completed one | **409** each, with a specific message |
| Admin `cancel` | 200 → `cancelled`; repeat → **409** |
| **Donor-route non-regression** | donor `cancel` → `cancelled`, donor `complete` → `completed` (donation recorded, countdown advanced), repeat of each → **409**, and another user's appointment → **403** |
| Audit rows | one per mutation — `center.create`, three `center.update` (each with a `changed` from→to snapshot), `center.delete`, `appointment.complete`, `appointment.cancel` — all with the correct actor and reason |
| `/admin`, `/admin/requests`, `/admin/users`, `/admin/centers`, `/admin/appointments` | all **200**, no Metro bundling errors |
| **Native bundle check** (`expo export --platform android`, Hermes) | every admin screen, hook, `DataTable`, `BloodTypeFilter`, `CentersSubNav`, server guard, and admin-only copy string: **absent**. Present and expected: the `.native.tsx` stub export names, their route files, and `AdminMaxWidth`. Confirmed with ten strings unique to admin files, all absent — the dev-server bundle is **not** a valid test here, since dev builds load route modules lazily and contain no app code at all. |
| Web export | `expo export --platform web` succeeded; all 7 admin HTML routes and all 11 admin API functions present in the output |
| Database left as found | 5 centers, 15 appointments, 24 users, `admin_audit_log` 0 rows, demo countdowns restored, demo admin revoked |

**Not yet done, and deliberately left for a human:** the design-system pass on the three new screens — both themes, phone and desktop width, enlarged system text, screen-reader order over `DataTable` and the center form, and the error branch with the network cut.

**Acceptance:** lint and typecheck pass. Creating a center makes it appear in the donor app's `/api/centers` list and as a bookable option in `book.tsx` without a seed run. Editing hours, `openNow`, `rating`, and `needsUrgent` round-trips correctly. Deleting a center with a future appointment returns 409 with copy pointing at `openNow`; deleting an unreferenced one succeeds and is audited. Cancelling and completing an appointment from admin produces the same end state as the donor-facing routes, including the donation record on completion. Non-admin gets 403 everywhere.

---

## Phase 4 — Content and broadcast

- [x] **New `src/app/api/admin/announcements+api.ts`** and **`announcements/[id]+api.ts`** — `GET`/`POST`, `PATCH`/`DELETE`, all `requireAdmin` and audited. `tone` validated against the `announcement_tone` enum.
- [x] **New `src/app/api/admin/articles+api.ts`** and **`articles/[id]+api.ts`** — same. `body` is `text[]`, so the editor is a paragraph list, not a rich-text field; `category` validated against `article_category`; `icon` validated against a curated allow-list (see deviation 3).
- [x] **`src/lib/server/push.ts`** — **extracted, not forked.** `sendPushBatches(messages)` now holds the `CHUNK = 100` loop and the full `DeviceNotRegistered` pruning path, and `notifyMatchingDonors` calls it. Verified by reading the diff: the loop body, the recipient query, the distance filter, the message construction, and `sendBatch` are all byte-for-byte unchanged — the only edit inside `notifyMatchingDonors` is that three lines became one call. Added `resolveSegment(filters)`.
- [x] **New `src/app/api/admin/broadcast/preview+api.ts`** — `POST`, guard `requireAdmin`. Returns `{ recipientCount, deviceCount, isEveryone }` **without sending**. The two-step send is mandatory.
- [x] **New `src/app/api/admin/broadcast+api.ts`** — `POST`, guard `requireAdmin`. Body `{ segment: { bloodType?, city?, intervalElapsed? }; title; body; confirmAll? }`. Audits the segment, the resolved recipient count, and the copy verbatim **before** sending. Title capped at 65 and body at 240 characters — sized to what a lock screen shows, since the OS silently truncates longer copy mid-word. An unfiltered segment is refused without `confirmAll`.
- [x] **New `src/components/admin/content-announcements.tsx`**, **`content-articles.tsx`**, and **`broadcast.tsx`** (+ `.native.tsx` stubs); routes `src/app/admin/content.tsx`, `articles.tsx`, and `broadcast.tsx`. Broadcast is form → preview showing the recipient count → `ConfirmSheet` naming that count → send.
- [x] Types, keys, and **new `src/hooks/api/admin/use-admin-content.ts`** + **`use-broadcast.ts`**.

**Deviations from the plan as written, and why:**

1. **Three routes, not two.** The plan named `content.tsx` and `broadcast.tsx`; announcements and articles are different enough to be separate screens, so the area has three routes behind a `ContentSubNav`, exactly as phase 3 gave Centers a sub-nav for appointments. The brief still defines four capability areas, not seven — `AdminShell` already had the `subNav` slot.
2. **Validation lives in `src/lib/server/content.ts` and `src/lib/server/broadcast.ts`.** Same reasoning as `centers.ts`: `POST` and `PATCH` must enforce identical rules, and the only alternative was a route importing another route's `+api.ts`. For broadcast it matters more — if the preview parsed a segment differently from the send, staff would confirm one count while a different set of donors was written to.
3. **New `src/lib/article-icons.ts`, a curated allow-list — not free-text "is an Ionicons name".** `learn.tsx:120` renders the stored value straight into `<Ionicons name>`, and its `?? 'book'` fallback catches only null, so a typo renders as **blank space in the donor app with no error anywhere**. Validating the shape of the string could not prevent that, and importing the real glyph map server-side would pull React Native into the server bundle. One client-safe list now serves both sides: the server validates against it and the editor offers it as a picker, so an invalid icon cannot be stored at all.
4. **Broadcast excludes suspended donors.** Not in the plan. A banned account cannot sign in, so pushing to its lock screen is an alert the person is unable to act on.
5. **`resolveSegment` returns donors *and* devices.** The plan said "tokens plus a count". Staff confirm **donors**, because that is the number of people reached; devices are shown beside it since a donor with three phones is one person, not three.
6. **Send is disabled until a preview has been run for the current segment**, and changing any filter clears the preview. The plan required a two-step send; this makes it structural rather than advisory, so staff cannot confirm a count belonging to a different audience.
7. **`/admin` is now a pure redirect.** Its placeholder panels are gone: with every area built, a placeholder for a screen that exists would be a dead end.
8. **Announcement and article `DELETE` are real deletes**, unlike a request take-down. Nothing references either row, no donor has acted on one, and a stale notice in the feed is worse than its absence — so there is no soft-delete to preserve. The audit row is written first and keeps the full text, including an article's whole body.
9. **The preview is a `POST` despite being read-only**, because the segment is a structured object; smuggling it through query params would invite a hand-built URL that the send route parses differently.

**Verification record** (run against the dev server on 2026-10-07; segment counts were compared against **independently hand-written SQL**, and the fixture push tokens were deliberately invalid — `push_tokens` held **zero real devices** throughout, so nothing could reach a real person):

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | clean |
| Signed out — every phase-4 route | **401** |
| **`push.ts` extraction** | diff reviewed line by line: a pure relocation. `notifyMatchingDonors` keeps its query, distance filter and message construction; only the batch loop moved. |
| Announcement validation | missing body → 400 "title is required" · `tone=loud` → 400 naming the four tones · blank title → 400 · 40-char tag → 400 (cap 32) · `date=nope` → 400 |
| Announcement create | **201** |
| **Reaches the donor home feed with no seed run** | `GET /api/announcements` went 3 → 4 rows and the new row was **newest**, which is the one the home feed renders, with its badge text and tone |
| Announcement edit | `PATCH {tone,tag}` changed both and left `title` untouched; `PATCH {}` → 200 no-op, no audit noise; unknown id → **404** |
| Announcement delete | **204**; donor feed back to 3 rows |
| Article validation | bad category → 400 · **`icon="not-a-real-glyph"` → 400 naming the allowed icons** · `minutes=0` and `minutes=2.5` → 400 · all-blank body → 400 · body as a string → 400 |
| Article create | **201**; a blank paragraph among three was **dropped**, storing 2 |
| **Reaches the donor Learn tab with no seed run** | `GET /api/articles` went 4 → 5 rows with the right title, read time, icon and paragraph count |
| Article edit | `PATCH {body}` replaced the paragraph list and left the title alone; **an invalid icon is refused on edit too**, not only on create; unknown id → **404** |
| Article delete | **204**; Learn tab back to 4 rows |
| **Broadcast preview vs hand-written SQL** | **9 of 9 segments matched exactly** — unfiltered 5 donors/6 devices · `A+` 2/3 · `A-` 2/2 · `B+` 1/1 · `city~toledo` 2/2 · `city~cebu` 2/3 · `intervalElapsed` 3/4 · `A+ AND intervalElapsed` 1/2 · `intervalElapsed=false` 5/6. The fixture deliberately gave one donor two devices, so donors and devices diverge. |
| Segment validation | `bloodType=Z+` → 400 · `intervalElapsed="yes"` → 400 · an all-whitespace city collapses to "no filter" and correctly reports `isEveryone: true` |
| **`confirmAll` guard** | unfiltered send without it → **400** naming the consequence; **no audit row written** for the refusal |
| Copy caps | missing title/body → 400 · 70-char title → 400 (cap 65) · 250-char body → 400 (cap 240) |
| Segment matching nobody | **409** "nothing to send", not a silent no-op |
| Broadcast send | 200 with correct counts, both for a filtered segment and for the unfiltered one with `confirmAll` |
| **Audit written before the send** | both sends recorded with actor, the resolved segment, `isEveryone`, recipient and device counts, and the **title and body verbatim** |
| **`DeviceNotRegistered` pruning via the shared path** | all 6 fixture tokens were pruned from `push_tokens` by `sendBatch` after Expo rejected them — confirmed against Expo's live response, which returns `DeviceNotRegistered` with HTTP 200 for an unrecognized token |
| **Emergency fan-out after the extraction** | `notifyMatchingDonors`, awaited directly against a real request row, selected the compatible donor, sent through the extracted `sendPushBatches`, and pruned the dead token (1 → 0). Works end to end. **See open question 7** for what this exposed about the HTTP call site. |
| All eight admin pages | **200**, no Metro bundling errors |
| **Native bundle check** (`expo export --platform android`, Hermes) | positive controls present; every phase-4 screen string, hook, `ContentSubNav`, `ARTICLE_ICONS`, and server validator: **absent**. Present and expected: the three `.native.tsx` stub export names (one occurrence each) and their route files. |
| Database left as found | 3 announcements, 4 articles, 13 requests, 5 centers, 15 appointments, 24 users, `push_tokens` 0, `admin_audit_log` 0 |

**Not yet done, and deliberately left for a human:** the design-system pass on the three new screens, and **sending to a real device**, which needs an Android dev build rather than Expo Go and a genuine push token. Every other link in that chain is verified: the segment resolves correctly, the audit lands first, the transport batches, and dead tokens are pruned.

**Acceptance:** lint and typecheck pass. A new announcement appears in the donor app's home feed and a new article in `learn.tsx` without a seed run; editing and deleting round-trip. The emergency push fan-out still works identically after the extraction. A broadcast preview reports a recipient count that matches a hand-written SQL count for the same segment; a `DeviceNotRegistered` token is pruned from `push_tokens` by the shared path. An empty segment without `confirmAll` is rejected. Non-admin gets 403 everywhere.

---

## Phase 5 — Verification pass

No test framework exists (`package.json:56-67`), so this phase is static checks plus a written manual script with concrete steps and expected results.

- [ ] `npm run lint` — clean.
- [ ] `npm run typecheck` — clean.
- [ ] `npx expo export --platform web` — succeeds; confirm the admin routes are present in the output.
- [ ] **Native non-regression:** `npx expo start --android` and `--ios` boot; every tab behaves as before; `/admin` is unreachable; grep the native bundle to confirm no admin component, hook, or `DataTable` is included.
- [ ] **Negative-path matrix**, run with `curl` against every admin route added in phases 0–4: signed out → **401** `unauthorized`; signed in as a non-admin → **403** `forbidden`; signed in as an admin → 200. Record the table in this file as it is run.
- [ ] **Privacy assertion:** `curl` every admin GET route as an admin and grep each response body for `latitude` and `longitude`. Expected: **zero matches** outside the centers routes, where exact coordinates are intentional and public.
- [ ] **Audit assertion:** perform one of every mutation, then confirm `admin_audit_log` has exactly one row per action with the correct actor, action, target, and reason — and that the deleted-account row survives its target.
- [ ] **Design-system pass:** every admin screen in light and dark mode, at phone width and desktop width, with enlarged system text; all four data states reachable and correct on every table (disconnect the network for the error branch); every control ≥44pt with a label and pressed feedback; screen-reader order sensible on `DataTable`; no status conveyed by color alone.
- [ ] **Copy review:** every destructive confirmation names its specific target and states the consequence calmly; no "Are you sure?"; no alarm language on non-urgent actions.
- [ ] Update this file's **Status** line to reflect completion.

**Acceptance:** all boxes above ticked, with the negative-path matrix and the privacy grep results recorded in this file rather than asserted from memory.

---

## Open questions

1. **Does "verify" need a status, or is an audit attestation enough?** `request_status` is `open | partial | fulfilled | expired` (`src/db/schema.ts`) with no `verified` member. The plan treats verification as an audit-only attestation to avoid a schema change in phase 1, but that means **donors cannot see that staff vetted a request** — which is arguably the most valuable signal the console could produce. Adding `verified` as a boolean column on `emergency_requests` plus a `Badge` in the donor-facing `RequestCard` would be a phase-1 schema change and a donor-app UI change. Worth it, or keep v1 strictly internal?
2. **~~Is `eligibleOnly` a legitimate broadcast filter?~~ ✅ RESOLVED 2026-10-07 — keep the filter, rename it `intervalElapsed`.** `computeEligibility` measures **booking spacing** (`PH_DONATION_INTERVAL_DAYS`), not medical fitness, and `reminderPlan.md`'s safety boundaries forbid implying a medical eligibility decision. The filter is genuinely useful — without it staff would push to donors who demonstrably cannot give yet — so it stays, but it is named for what it actually measures. Phase 4 must use `intervalElapsed` in the body type, the segment query, and the UI label, and **no broadcast copy may use the word "eligible"**.
3. **Should the audit log be readable in the console beyond per-target trails?** The plan surfaces a request's own audit trail in its detail view. A global, filterable audit view is a natural fifth screen but is not in the brief's four capability areas. Add it to phase 0's shell as a fifth segment, or leave it to SQL?
4. **How many admins, and does one admin get to act on another?** The plugin's default action set includes `impersonate-admins` and admins can ban other admins. With `adminRoles: ['admin']` and no custom access-control statement, nothing stops an admin suspending a colleague. For a small staff this is probably fine; if not, it needs a custom `createAccessControl` statement and a second role, which changes phase 0.
5. **~~Is the pre-existing schema drift intentional?~~ ✅ RESOLVED 2026-10-07 — it was an abandoned, uncommitted feature, and it has been dropped.** The drift was larger than this plan recorded. The database held a complete "center operations" feature — per-center blood stock (`inventory`), escalation of a request to nearby centers (`request_centers`), center-scoped staff accounts, and center-verified donations — that existed in **no commit on either remote**: built in the working tree, pushed to the database, run live for two to three days in July 2026, then discarded. The five columns this question named were part of it, as were `profiles.role` and `profiles.staff_center_id`, a **second role mechanism competing with the `user.role` phase 0 added** (which is why phase 0's "there is no role, permission, or admin concept anywhere today" was true of the codebase and false of the database).

   **Dropped**, because it existed in no commit, all 68 rows were seed data (the 32 `inventory` rows share one timestamp two seconds after the demo users were created), no code referenced it, and as undeclared schema it made the project's own documented `npm run db:push` destructive. `npm run db:push` now reports **"No changes detected"** — safe for anyone to run for the first time in this project's history. Enum dependencies were checked before dropping: each of `stock_level`, `center_response`, and `donation_method` was used only by the table dropped alongside it.

   **Recoverable.** Snapshot `before-drift-column-drop` (`snap-plain-art-azwljwp9`, 2026-10-06T22:35:14Z) predates every drop and was verified to exist before anything was dropped. `recovered-center-ops-schema.ts` is kept as the design record and `recovered-center-ops-restore.sql` restores the two `profiles` columns exactly.

   **Dropping the implementation does not rule out the capability**, and this is worth revisiting: `POST /api/requests` currently fans push to every compatible donor within 50 km, and escalating first to centers that actually hold stock is a materially better opening move than waking hundreds of donors. If it is ever revived it **overlaps phase 1** — a staff take-down would have to resolve the request's outstanding center notifications, so `moderate` would need to account for them.
6. **Is `/admin` on the same origin acceptable, or does it need a separate deployment?** Same-origin is what `web.output: "server"` gives for free and is what this plan assumes. A separate host would mean a second deploy target and a CORS story — contradicting the brief's "no second backend" constraint, but worth confirming there is no infrastructure requirement to keep the console off the public app origin.

7. **Does the emergency push fan-out actually survive the response? ⚠️ Surfaced by phase 4, and it concerns the app's core safety feature.** `POST /api/requests` fires `void notifyMatchingDonors(row).catch(...)` — deliberately fire-and-forget, with a documented rationale that a push failure must never delay a blood request (`src/app/api/requests+api.ts:88-92`). That call site is **unchanged by this plan**.

   But during phase 4's verification, a request created through the HTTP route did **not** prune a known-dead token, while calling `notifyMatchingDonors` directly — awaited — pruned it immediately. The fan-out appears to be cut off when the response returns: the dev server tears the request context down, and the in-flight push never completes. Expo was confirmed to return `DeviceNotRegistered` with HTTP 200 for that token, so the transport was not at fault.

   If this also happens in the deployed runtime, **emergency pushes are being dropped** — the single most important thing the product does. Most serverless platforms freeze or kill the instance once a response is sent unless the work is explicitly handed off (`waitUntil`, a queue, or simply awaiting before the 201). Worth measuring in the real deployment before anything else in phase 5, because no console feature matters more than the alert going out. The fix is a trade-off against the existing rationale: awaiting makes the request slower but the push reliable.

