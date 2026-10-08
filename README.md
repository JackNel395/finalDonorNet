# DonorNet

A mobile-first blood-donation app for Metro Cebu. DonorNet connects donors,
recipients, hospitals, and blood banks so people can find the right next action
quickly — check eligibility, find a nearby center, respond to an urgent request,
or book and manage a donation appointment.

> The app is currently branded **DonorNet** in-product (onboarding, donor
> card, seed data). "DonorNet" is the repository/project name; the in-app name
> has not been renamed yet.

## Features

- **Eligibility** — a 90-day recovery countdown (Philippine Red Cross criteria,
  not the US 56-day interval) that gates when a donor can book or pledge.
- **Emergency feed** — live blood requests with blood-type compatibility
  filtering and urgency sorting.
- **Booking** — pick a center, donation type, day, and time. The picker only
  offers bookable slots (nothing in the past or inside the recovery window), and
  a donor holds one upcoming appointment at a time. Rules are enforced on both
  the client and the server (`src/lib/booking.ts`).
- **Donor dashboard** — lifetime impact, donation history, achievements, and a
  digital donor card with a QR code.
- **Map** — nearby donation centers (native only).
- **Push notifications** — opt-in alerts for compatible blood needs.

## Stack

- **Expo SDK 57** (Expo Router, React Native 0.86, React 19) — app + API routes
  in one project (`+api.ts` files under `src/app/api`).
- **Neon** serverless Postgres via **Drizzle ORM** (`src/db/schema.ts`).
- **Better Auth** — email/password sessions, with the Expo plugin for native.
- **TanStack Query** for data fetching and cache.

## Getting started

Requires Node 18+ and a Neon Postgres database.

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy the template and fill in your values:

   ```bash
   cp .env.example .env
   ```

   | Variable | What it is |
   | --- | --- |
   | `DATABASE_URL` | Neon Postgres connection string (Console → Connect) |
   | `BETTER_AUTH_SECRET` | ≥32-char random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `BETTER_AUTH_URL` | Base URL the auth server runs on (e.g. `http://localhost:8081`) |

   These are server-only — never prefix them with `EXPO_PUBLIC_`.

3. **Set up the database**

   ```bash
   npm run db:push   # apply the Drizzle schema
   npm run db:seed   # centers, articles, and demo donors
   ```

4. **Run the app**

   ```bash
   npm run web       # browser preview
   # or
   npx expo start    # then open in Expo Go / a dev build
   ```

## Demo accounts

Created by `npm run db:seed` (password `donornet-demo-123`):

| Email | State |
| --- | --- |
| `maria@donornet.demo` | A+, eligible to donate |
| `daniel@donornet.demo` | A+, mid recovery window |
| `miguel@donornet.demo` | A−, eligible to donate |

## Scripts

| Command | Does |
| --- | --- |
| `npm run web` / `npm run android` / `npm run ios` | Start the app on a platform |
| `npm run db:push` | Push the Drizzle schema to the database |
| `npm run db:seed` | Seed global content and demo donors |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run lint` | Lint the project |

## Project layout

```
src/
  app/            expo-router screens + API routes (api/*+api.ts)
  components/     UI kit and shared components
  db/             Drizzle schema
  hooks/          data hooks (TanStack Query) and device state
  lib/            domain logic — eligibility, booking rules, formatting
  types/          shared domain and API types
scripts/seed.ts   database seed
```

## Notes

- The database schema is server-only; never import `src/db/schema.ts` from
  client code.
- Booking and eligibility rules live in `src/lib/blood.ts` and
  `src/lib/booking.ts` and are shared by the screens and the API so the two
  never drift.
