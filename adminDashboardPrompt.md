# Plan prompt — DonorNet admin dashboard

Paste the block below into Claude Code **in plan mode** (shift+tab twice) at the repo root. It produces `adminPlan.md`, matching the house plan-doc style of `PLAN.md` and `reminderPlan.md`. The output of that session is the plan file only — no implementation code.

---

Write `adminPlan.md`: a phased implementation plan for a **web-only admin dashboard** inside this existing Expo Router app. Write the plan file only — no implementation code, no schema push, no dependency installs in this session.

## What I want built (the plan's subject)

An operations console for DonorNet staff, served from the same Expo app at `/admin`, rendered on **web only**. Four capability areas, all in v1:

1. **Requests moderation** — list/filter every row of `emergency_requests` (by status, urgency, blood type, city, age); open one and see its `responders` with the donor behind each; verify, expire, force-fulfil, or take down a request. This is the highest-risk surface in the app: a fake critical request fans out push to every matching donor within 50 km (`src/lib/server/push.ts`), so moderation actions need confirmation and an audit trail.
2. **Users & donors** — search `user` joined to `profiles`; view blood type, city, last donation, registered device count; suspend/reactivate and delete an account; correct a wrong `lastDonationDate`.
3. **Centers & appointments** — full CRUD on `donation_centers` (name, kind, address, city, coords, hours, `openNow`, `rating`, `needsUrgent`); list `appointments` with their center and donor, and cancel or complete one.
4. **Content & broadcast** — CRUD on `announcements` and `education_articles`; and send a push broadcast to a targeted donor segment, reusing the existing Expo push plumbing rather than a parallel sender.

## Ground truth you must build on (verified in this repo — re-check anything you intend to contradict)

**Stack and surface**
- Expo Router SDK 57, `app.json` has `"web": { "output": "server" }` and `experiments.typedRoutes: true`. Per `AGENTS.md`, consult https://docs.expo.dev/versions/v57.0.0/ for any Expo API or dependency change, and use `npx expo install`.
- API routes are `*+api.ts` files under `src/app/api/`, served by the same dev server. There is no second backend process and the plan must not introduce one.
- The app ships on iOS and Android via `src/app/(tabs)/`. **Admin routes must not reach the native bundle or the native navigator.** Decide and justify the mechanism (`.web.tsx` route files, a `Platform.OS !== 'web'` redirect in an `(admin)/_layout`, or both) and state what guarantees the native app is unaffected.

**Auth and roles**
- Better Auth 1.6.23 (`src/lib/server/auth.ts`), email+password plus the `expo()` plugin, Drizzle adapter over `src/db/schema.ts`.
- **There is no role, permission, or admin concept anywhere in the codebase today** — `src/db/auth-schema.ts` has no role column and nothing greps for one. Standing this up is phase 0 of the plan. Evaluate the Better Auth `admin` plugin against the exact 1.6.23 docs versus a hand-rolled `role` column, pick one, and say why — including what it does to `src/db/auth-schema.ts` (that file is CLI-generated and its header says regenerate, do not hand-edit), whether `npm run db:push` is needed, and how the first admin is promoted (`scripts/seed.ts` has the pattern for creating users through `auth.api.signUpEmail`).
- `requireSession(request)` in `src/lib/server/session.ts` throws a 401 envelope. Every admin route needs a `requireAdmin` sibling in the same file returning **403** (`forbidden()` already exists in `src/lib/server/http.ts`) for a signed-in non-admin. Plan this as one guard used everywhere, not per-route checks.
- Client-side gating is cosmetic. State explicitly that the server guard is the security boundary and the UI gate only avoids showing dead controls.

**Server conventions to follow exactly, not reinvent**
- `handle()` wraps every route so a thrown `ApiError` becomes `{ error: { code, message } }` and anything else becomes a 500 — `src/lib/server/http.ts`. Helpers available: `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `json`, `readJson`, `readCoords`.
- Row to domain mapping lives only in `src/lib/server/serialize.ts` (Drizzle `Date` to ISO string). Admin responses that differ from the donor-facing ones need their own `toAdminX` mappers there, not inline shaping in route files.
- **Privacy constraint, load-bearing:** `profiles.latitude/longitude` are fuzzed to ~1 km and the schema comment says *never serialized to any client*; request coords are rounded to 3 decimals in `toEmergencyRequest`. Decide per admin surface what an admin may see, and justify every place you loosen it. Default to the existing fuzzing unless there is a stated operational reason.
- `src/lib/server/push.ts` sends to Expo directly in batches of at most 100 and prunes `DeviceNotRegistered` tokens. The broadcast feature must reuse this module's batching and pruning.

**Client conventions**
- Data goes through TanStack Query hooks in `src/hooks/api/`, with every key registered in `src/hooks/api/keys.ts` (`qk`). Admin keys belong there too.
- `src/lib/api.ts` (`api.get/post/patch`) is the only fetch path; it has no `delete` method. If any admin action needs DELETE, say so and plan the addition there rather than calling `fetch` directly.
- There is **no test framework in this repo** (no test files, no test script). The verification phase must be built from what exists: `npm run lint`, `npm run typecheck`, a web build, and a written manual QA script with concrete steps and expected results — including the negative cases (non-admin hits each route and gets 403; signed-out gets 401).

**Design system — `AGENTS.md` makes this binding**
- Read `design-system/README.md`, then `COMPONENTS.md` and `PATTERNS.md` before specifying any UI. Tokens come from `src/constants/theme.ts` (`Colors`, `Spacing`, `Radius`, `Shadow`, `Spring`); no literal visual values.
- Compose `src/components/ui/*` (`Card`, `Badge`, `Button`, `Input`, `EmptyState`, `Skeleton`, `SegmentedControl`, `StatTile`, `ConfirmSheet`, `Toast`, `ScreenHeader`, `SectionHeader`) and `ThemedText` variants. Promote a new primitive only when its role and API are smaller than its implementation — and name which admin pattern, if any, earns one (a data table is the likely candidate; argue it).
- Light and dark both work; every interactive surface gets accessible semantics, a 44pt target, and pressed feedback; every data surface gets loading, empty, error, and success states.
- **Tension to resolve explicitly:** `MaxContentWidth` is 640 and `TabBarClearance` is 120 — both tuned for a phone. An admin table at desktop width needs a stated, justified exception, not a silent override. Say what the admin layout's width and chrome rules are and where they live.
- Urgency and status never ride on color alone. Destructive moderation actions ("take down", "delete account") need a confirmation step and copy that is specific and calm.

## Shape of the plan file

Match `reminderPlan.md`'s structure:

- **Title plus a 2–3 sentence statement of the problem** this solves for staff, not a feature list.
- **Status line** declaring the file the single source of truth for progress, with every task a `[ ]` checkbox to tick as work lands.
- **Safety and privacy boundaries** — a short non-negotiable section constraining every phase: what admin data exposure is permitted, what the audit trail records, what a moderation action can and cannot do to a live request that donors are already en route to.
- **Assumptions and dependencies table** — the claim in one column, the file/line or doc URL that evidences it in the other. Verify each against the repo as you write; flag anything you could not confirm instead of asserting it.
- **Decisions** — role mechanism, web-only enforcement, audit-log table or not, table primitive or not, layout width exception. Each with its alternative and why it lost.
- **Phases**, each independently shippable and verifiable, in dependency order. Suggested spine, adjust if you find better: (0) role plus `requireAdmin` plus an `/admin` shell only an admin can reach; (1) requests moderation; (2) users and donors; (3) centers and appointments; (4) content and broadcast; (5) verification pass. State the phase-0 walking skeleton explicitly — I want to sign in as an admin and see an empty shell before any domain feature exists.
- **Per phase:** files added or changed with their paths, new API routes with method, path, guard, and request/response types (and where those types go in `src/types/api.ts`), schema changes with whether `npm run db:push` is needed, and the acceptance check for that phase.
- **Open questions** — anything you could not resolve from the repo or the Expo 57 docs, stated as a question for me rather than papered over with an assumption.

Prefer reusing what exists over adding. Where you propose something genuinely new (an audit table, a table primitive, a `delete` verb on the api client), justify it against the alternative of composing what is already here.
