# RideColab — Complete Implementation Plan
### "Share the road. Split the cost. Nobody profits."

> **App name constant**: `APP_NAME = "RideColab"` in `server/src/config/app.ts` and `client/constants/app.ts`
> **This document wins** over `docs/project-brief.pdf` wherever they conflict.

---

## ⚠️ CRITICAL PROCESS RULES — READ BEFORE STARTING

**You MUST complete each phase fully before moving to the next.**

At the end of every phase you must:
1. Run linting, type-checks and automated tests.
2. Actually run and verify the functionality (start the server, call endpoints, check screens).
3. Produce a **Phase Report** in `docs/progress-report.md` covering: what was built, files changed, how to run and test it, test results, screenshots/recordings where possible, known issues, and assumptions made.
4. Make a **git commit** with message: `phase-N: <short description>`.
5. Update `docs/progress-report.md` to mark the phase ✅ Complete.
6. **STOP and ask the user: "Phase N is complete. Approve and continue to Phase N+1?"**

**Never start the next phase until the user replies with explicit approval.**

### 🔑 API Keys and Secrets Rule (MANDATORY)

**Whenever a phase requires an API key, database URL, or any secret value:**
1. **STOP immediately** — do not proceed or use placeholder values in real config.
2. Create or update the `.env.example` file with the variable name and a clear description.
3. **Tell the user exactly what is needed**, where to get it (with the signup/settings URL), and which file to put it in.
4. Wait for the user to confirm they have filled in the `.env` file before continuing.

**Examples of when to stop and ask:**
- `DATABASE_URL` — Neon PostgreSQL connection string (Phase 2)
- `REDIS_URL` — Upstash Redis REST URL (Phase 2, optional)
- `ORS_API_KEY` — OpenRouteService API key (Phase 5)
- `MAP_TILE_URL` — OpenFreeMap or MapTiler tile style URL (Phase 4)
- `EXPO_PUBLIC_API_URL` — Your server's URL (Phase 4)
- `SERVER_CHAT_SECRET` — Secret for chat encryption key derivation (Phase 8)
- `EXPO_PUSH_ACCESS_TOKEN` — Expo push notification token (Phase 8)
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (Phase 3, optional)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — Seed admin user credentials (Phase 2)

**Never hardcode a secret. Never skip asking. Never assume the user has already set it.**

---

## Decisions & Clarifications Log

| # | Decision | Detail |
|---|---|---|
| 1 | App name | **RideColab** everywhere (not PoolRide). |
| 2 | Photo uploads | **Removed** — no vehicle or profile photo uploads anywhere in the app. |
| 3 | Chat encryption | **Added** — AES-256-GCM; key derived per booking via HKDF; stored as encrypted body + IV. |
| 4 | E2E testing | **Supertest** for server, **Playwright** for admin panel. No Detox. |
| 5 | Live location DB writes | Batch writes — hot state in Redis/in-memory; async DB flush every 30 s. |

---

## Project-Brief Reconciliation Notes

The brief (docs/project-brief.pdf) mentions OTP/phone login and a Python FastAPI ML service.
This plan replaces those with email+password JWT auth (optional free Google OAuth) and Node.js-based
ranking with JSON weights exported from local notebooks. All other brief content is preserved.

---

## Repository Layout

```
RideColab/
├── client/                  # React Native · Expo · TypeScript · Expo Router
│   ├── app/                 # Expo Router screens
│   ├── components/
│   ├── features/            # rider/ passenger/ community/ safety/
│   ├── services/            # api/ location/ notifications/ socket/
│   ├── store/               # Zustand slices
│   ├── theme/               # design tokens (light/dark)
│   ├── i18n/                # en/ hi/ mr/
│   └── assets/
├── server/                  # Express · TypeScript
│   └── src/
│       ├── routes/
│       ├── controllers/
│       ├── services/        # matching/ fare/ routing/ live/ trust/ notifications/
│       ├── db/              # migrations/ queries/
│       ├── middleware/
│       ├── data/            # vehicle_mileage.csv  ranking_weights.json
│       ├── utils/
│       └── index.ts
├── admin/                   # React · Vite · TypeScript
├── notebooks/               # Python — local only
├── docs/                    # PDFs, plans, API docs, legal note, progress report
├── README.md
├── AGENTS.md
└── .gitignore
```

---

## Global Tech Stack

| Layer | Choice |
|---|---|
| Mobile | Expo SDK 51+, React Native, Expo Router, TypeScript |
| Maps | @maplibre/maplibre-react-native (EAS dev build required) |
| State | Zustand + TanStack React Query |
| Backend | Node.js 20 LTS, Express 5, TypeScript, Socket.io |
| DB | PostgreSQL 16 + PostGIS on Neon free tier |
| Cache | Upstash Redis free (in-memory fallback behind CacheAdapter interface) |
| Routing | OpenRouteService free (2K directions/day) — cached aggressively |
| Geocoding | ORS geocoding (1K/day) + built-in Pune landmarks table |
| Map Tiles | OpenFreeMap (config URL, switchable) |
| Push | Expo Push Service (free) |
| Build | EAS Build (preview APK) + EAS Update (OTA) |
| Admin | React + Vite on Vercel/Netlify free |
| Auth | bcrypt + JWT access (15 min) + refresh (7 days), optional Google OAuth |
| Payments | UPI deep link (upi://pay) — no money handled by us |
| Weather | Open-Meteo (free, no key) |
| Testing | Jest + Supertest (server), Jest + RNTL (client), Playwright (admin) |
| Lint | ESLint + Prettier |
| API Docs | swagger-jsdoc + swagger-ui-express |

---

## Local Dev Quick Reference

```
Terminal 1: cd server && npm run dev       → http://localhost:4000
Terminal 2: cd admin  && npm run dev       → http://localhost:5173
Terminal 3: cd client && npx expo start    → Scan QR in Expo Go (or EAS dev build for maps)
API Docs:   http://localhost:4000/api/v1/docs
```

Mobile testing options:
- **Expo Go** (Play Store) — instant; works for all non-map screens.
- **Android Emulator** (Android Studio) — same capability as Expo Go.
- **EAS Dev Build** (one-time, recommended for maps):
  `eas build --profile development --platform android`

---

---

# PHASE 1 — Foundation

## Goals
Bootstrap the monorepo with all tooling, a minimal Expo app that boots, an Express health endpoint,
an admin scaffold, AGENTS.md, README, and a clean git history.

## Detailed Tasks
1. **Monorepo init**: `git init`, root `package.json` (workspaces: client, server, admin),
   `.gitignore` (node_modules, .env, dist, *.apk, __pycache__, .DS_Store).
2. **Root tooling**: ESLint v9 (flat config), Prettier, TypeScript 5 `tsconfig.base.json`,
   Husky + lint-staged pre-commit hook.
3. **AGENTS.md**: Stack, folder map, money rule, free-tier constraints, coding conventions.
4. **README.md**: Overview, one-command setup, links to AGENTS.md and this plan.
5. **`server/`**: Express + TypeScript; `GET /api/v1/health` returns `{ status, version, ts, cold_start_ms }`;
   `GET /api/v1/version` returns `{ version, minClientVersion, apkUrl }`;
   `src/config/app.ts` exports `APP_NAME = "RideColab"` and all Zod-validated env vars;
   pino logger; helmet, cors, express-rate-limit; one passing health-check test.
6. **`client/`**: `create-expo-app` TypeScript template; Expo Router; path aliases;
   `constants/app.ts` with `APP_NAME`; placeholder five-tab navigator
   (Home, Activity, Community, Savings, Account); `theme/tokens.ts` (palette, spacing, radii, typography);
   app boots to five-tab shell.
7. **`admin/`**: `create vite` React+TypeScript; bare "RideColab Admin" heading; Vite dev server runs.
8. **`.env.example`** in server/, client/, admin/ with all env vars and comments. No secrets committed.
9. **`docs/`**: This file (implementation-plan.md), progress-report.md, api-docs.md stub,
   legal-note.md stub, evaluation.md stub.
10. **Git commit**: `phase-1: foundation — monorepo, tooling, health endpoint, Expo shell, admin scaffold`.

## Key Files Created
```
RideColab/
├── package.json, .gitignore, .eslintrc, .prettierrc, tsconfig.base.json
├── README.md, AGENTS.md
├── server/src/index.ts, config/app.ts, routes/health.ts, tests/health.test.ts
├── client/app/_layout.tsx, app/(tabs)/*, constants/app.ts, theme/tokens.ts
├── admin/src/main.tsx, src/App.tsx
└── docs/implementation-plan.md, progress-report.md, api-docs.md, legal-note.md, evaluation.md
```

## API Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/v1/health | none | Liveness probe |
| GET | /api/v1/version | none | Latest version + APK URL |

## Acceptance Checklist
- [ ] `npm run lint` at root passes with zero errors.
- [ ] `npm test` in server/ passes (health check test).
- [ ] `npx expo start` in client/ shows QR; Expo Go loads the 5-tab shell.
- [ ] `npm run dev` in admin/ serves the scaffold page.
- [ ] `curl http://localhost:4000/api/v1/health` returns `{"status":"ok",...}`.
- [ ] No `.env` file committed; `.env.example` exists in all three packages.
- [ ] `AGENTS.md` present and complete.
- [ ] `docs/progress-report.md` Phase 1 row marked ✅.

---

# PHASE 2 — Database and Server Core

## Goals
Neon PostgreSQL + PostGIS, all migrations, seed data, config module, global error handling,
structured logging, rate limiting, API-docs skeleton.

## Detailed Tasks
1. **Neon setup**: `CREATE EXTENSION IF NOT EXISTS postgis;` — verify with `SELECT PostGIS_Version();`.
   `DATABASE_URL` in env.
2. **Migrations**: Raw SQL in `server/src/db/migrations/` numbered `001_…`. Run via `migrate.ts`.
3. **Full schema** (~28 tables) with PostGIS geometry types, GiST spatial indexes,
   B-tree indexes on common filters, TIMESTAMPTZ everywhere, `updated_at` triggers.
4. **Seed script** (`src/db/seed.ts`):
   - ~30 Pune landmarks.
   - Vehicle catalog from vehicle_mileage.csv (~80–100 rows, ARAI figures, clearly marked placeholder).
   - Fuel prices: petrol ₹106, diesel ₹92, CNG ₹85/kg, electricity ₹8/kWh.
   - Demo admin user (from env), demo community "PICT Pune" with invite code.
   - Two demo users + vehicles. `app_config` rows for all runtime flags.
5. **Config module**: `db.ts` (pg pool + PostGIS helpers), `redis.ts` (CacheAdapter interface:
   UpstashRedisAdapter + InMemoryAdapter chosen by env), `app.ts` (Zod-validated env vars).
6. **Middleware**: helmet, cors, rate-limit, pino-http, `errorHandler.ts`, `validate.ts` (Zod middleware).
7. **API docs**: swagger-jsdoc + swagger-ui-express at `/api/v1/docs`.
8. **Tests**: PostGIS extension present, seed data queryable, error handler shape correct.

## Key Tables (abbreviated)
| Table | Purpose |
|---|---|
| users | Accounts, trust score, consent, weekly trip count |
| vehicle_catalog | Make/model/fuel lookup with mileage figures |
| vehicles | User's registered vehicles (ref catalog, plate only) |
| fuel_prices | Admin-editable, used by fare engine |
| trips | Posted trips with PostGIS route geometry |
| bookings | Trip reservations with state machine |
| live_locations | GPS points during active trips (deleted post-trip) |
| messages | Encrypted chat (body_encrypted + iv) |
| communities | Invite-code based groups |
| app_config | Runtime feature flags and config values |

## Acceptance Checklist
- [ ] `SELECT PostGIS_Version()` returns version string from Neon.
- [ ] All 28+ tables present in public schema.
- [ ] `SELECT * FROM fuel_prices` returns 4 rows.
- [ ] `GET /api/v1/docs` loads Swagger UI.
- [ ] Unknown endpoint returns `{"success":false,"error":{...}}`.
- [ ] DB integration tests pass.
- [ ] Server starts with `REDIS_URL=""` — health returns 200 (in-memory fallback).

---

# PHASE 3 — Auth and Profiles

## Goals
Full JWT auth, consent screen, profile CRUD, emergency contacts, Rider/Passenger mode,
vehicle selection from catalog, insurance/licence self-declaration.

## Detailed Tasks
1. **Auth endpoints**: register (bcrypt cost 12), login, refresh (token rotation), logout,
   optional Google OAuth (free GCP OAuth project).
2. **authenticate middleware**: Verify JWT; attach `req.user`.
3. **Consent**: `POST /auth/consent` — records `consent_given_at`; required before any action.
4. **Profile**: `GET/PATCH /users/me` (name, gender optional, upi_id, language),
   `DELETE /users/me` (DPDP anonymise).
5. **Emergency contacts**: CRUD up to 3 (`/users/me/emergency-contacts`).
6. **Mode switch**: `PATCH /users/me/settings` — `mode: "rider" | "passenger"`.
7. **Vehicle routes**: Browse catalog, add vehicle (catalog_id + plate_number only), delete.
8. **Self-declaration**: `POST /users/me/declarations` — `has_valid_licence`, `has_insurance`;
   required before posting first trip.
9. **Trust score init**: `trust_scores` row inserted on registration with score=10.
10. **Client**: Login, Register, Consent screens; Profile edit; Vehicle selection (cascading dropdowns:
    Type→Make→Model→Variant→Fuel); Emergency contacts screen.
11. **Client state**: `authStore` (tokens in expo-secure-store), `userStore` (profile).
12. **API client** (`services/api/client.ts`): auto-refresh interceptor, error normaliser,
    cold-start retry with back-off (show "Waking up the server…" toast if > 3 s).

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/register | none | Create account |
| POST | /auth/login | none | Login |
| POST | /auth/refresh | none | Rotate refresh token |
| POST | /auth/logout | JWT | Invalidate refresh token |
| POST | /auth/consent | JWT | Record consent |
| GET | /users/me | JWT | Get profile |
| PATCH | /users/me | JWT | Update profile |
| DELETE | /users/me | JWT | Delete/anonymise account |
| GET/POST/DELETE | /users/me/emergency-contacts(/:id) | JWT | Emergency contacts CRUD |
| PATCH | /users/me/settings | JWT | Mode switch + preferences |
| GET | /catalog/vehicles | none | Browse vehicle catalog |
| GET/POST/DELETE | /users/me/vehicles(/:id) | JWT | My vehicles |
| POST | /users/me/declarations | JWT | Licence + insurance declaration |

## Acceptance Checklist
- [ ] `POST /auth/register` → 201 with tokens.
- [ ] Wrong password login → 401.
- [ ] Token refresh works; old refresh token invalidated.
- [ ] `DELETE /users/me` anonymises the row.
- [ ] Vehicle cascading selector works end-to-end.
- [ ] Cold-start toast appears when API is slow.
- [ ] All tests pass.

---

# PHASE 4 — Mobile App Shell and Design System

## Goals
Complete navigation, polished design system (light + dark), reusable component library,
map screen with animated bottom sheet, skeleton loaders, cold-start screen, i18n scaffold,
EAS dev build instructions.

## Design Palette
| Token | Value | Use |
|---|---|---|
| Primary | #0F1B33 (deep navy) | Text, primary buttons |
| Accent | #0E9384 (teal) | Savings, active tab, positive |
| Warning | #F59E0B (amber) | Warnings, rain |
| Danger | #EF4444 (red) | SOS, destructive |
| Surface | #FFFFFF | Cards |
| Background | #F3F4F6 | Screen background |

## Key Components
- `AppButton` — primary/secondary/ghost/danger, loading state, haptic, 44px+ touch target.
- `MatchCard` — name, trust badge, gender badge, vehicle, pickup, walk distance, detour,
  time, fare share, seats, community badge, "Why this match" chips.
- `SkeletonLoader` — animated shimmer (Reanimated).
- `EmptyState`, `ErrorState`.
- `ColdStartScreen` — animated logo + "Waking up the server…" (triggered when API > 3 s).
- `BottomSheetModal` — `@gorhom/bottom-sheet`, 3 snap points (80px / 50% / 90%).
- `RiderPassengerToggle` — animated, prominent, floating on Home screen.

## EAS Dev Build Note
`@maplibre/maplibre-react-native` requires native code — does not work in Expo Go.
Use a placeholder image in Expo Go. For map testing, build once:
`eas build --profile development --platform android`
Document in `docs/eas-dev-build.md`.

## Acceptance Checklist
- [ ] EAS dev build installs on Android; MapLibre map loads centred on Pune.
- [ ] Bottom sheet snaps at 3 points with smooth Reanimated animation.
- [ ] RiderPassengerToggle animates and fires haptic.
- [ ] Dark mode switch (Account) applies to all screens.
- [ ] SkeletonLoader shows then fades on data load.
- [ ] ColdStartScreen appears when API takes > 3 s.
- [ ] Switch device language to Hindi → Auth screens show Hindi strings.

---

# PHASE 5 — Maps, Geocoding, Routing and Trip Posting

## Goals
Place search (ORS + Pune landmarks), route fetch (once, cached), post-a-trip flow,
recurring trips, weekly trip counter enforcement.

## Key Design Choices
- **Geocoding**: Check `landmarks` table first → then ORS (cache 24 h by query hash).
  Rate limit: 40 calls/min, 1,000/day counter in Redis/memory.
- **Route cache**: ORS Directions called once per corridor; stored as PostGIS LINESTRING
  in `route_cache` table. Zero ORS calls at search time.
- **Weekly counter**: Configurable limit (default 14) from `app_config`; resets every Monday
  midnight via `node-cron`. Also materialise on demand if cron missed (Render sleep mitigation).
- **Recurring trips**: iCal RRULE; materialised daily for next 7 days by cron.

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /geocoding/search | JWT | Search places (landmarks first, then ORS) |
| GET | /geocoding/landmarks | none | Built-in Pune quick-picks |
| POST | /trips | JWT | Post a trip |
| GET | /trips/mine | JWT | Rider's own trips |
| GET | /trips/:id | JWT | Trip detail |
| PATCH | /trips/:id | JWT | Edit trip (while status=open) |
| DELETE | /trips/:id | JWT | Cancel trip |

## Acceptance Checklist
- [ ] Search "Hinjewadi" → from landmarks (0 ORS calls confirmed by log).
- [ ] Posted trip has valid PostGIS LINESTRING: `SELECT ST_IsValid(route) FROM trips`.
- [ ] `POST /trips` when weekly_trips_used = 14 → 403.
- [ ] Recurring trip → 5 rows materialised for next 5 weekdays.
- [ ] Route polyline appears on map in client.

---

# PHASE 6 — Fare Engine

## Goals
Complete fare calculation (low/high/cap), partial-route segment splitting,
server-side cap enforcement, "Why this price" receipt, admin fuel-price editor.
Exhaustive unit tests (≥ 20 cases).

## Core Formula
```
REAL_WORLD_FACTOR = app_config['fare.real_world_factor']  (default 0.8)

cost_per_km_low  = fuel_price / claimed_kmpl
cost_per_km_high = fuel_price / (claimed_kmpl × REAL_WORLD_FACTOR)   ← CAP

EVs: cost_per_km = (kwh_per_100km / 100) × electricity_price_per_kwh

fare_share (full)    = fare_set / (1 + num_passengers)
fare_share (partial) = fare_set × segment_fraction / occupants_on_segment
  segment_fraction   = ST_Length(ST_LineSubstring(route, loc_A, loc_B))
                     / ST_Length(route)
```
Server rejects `fare_set > cap` with 422. Receipt shows all inputs + legal note.

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /fare/estimate | JWT | Fare range for origin, dest, vehicle, passengers |
| GET | /bookings/:id/receipt | JWT | "Why this price" receipt |
| GET | /admin/fuel-prices | admin JWT | List fuel prices |
| PATCH | /admin/fuel-prices/:id | admin JWT | Update a fuel price |

## Acceptance Checklist
- [ ] ≥ 20 unit tests — all pass.
- [ ] 10 km petrol trip (15 kmpl, ₹106, RWF=0.8) → low ≈ ₹70.67, high ≈ ₹88.33.
- [ ] `fare_set = cap` → accepted; `fare_set = cap + 1` → 422.
- [ ] Partial booking fare_share correct (PostGIS ST_LineSubstring verified).
- [ ] Admin updates fuel price → next estimate uses new value.

---

# PHASE 7 — Matching Engine

## Goals
PostGIS corridor search (zero ORS calls at search time), match scoring with configurable weights,
all filters, smart pickup points, match cards UI, passenger search screen.

## Stage 1 — PostGIS SQL Filter
```sql
WHERE status = 'open'
  AND seats_available > 0
  AND ST_DWithin(route::geography, pickup_geog, $radius_m)
  AND ST_DWithin(route::geography, dropoff_geog, $radius_m)
  AND ST_LineLocatePoint(route, pickup_pt) < ST_LineLocatePoint(route, dropoff_pt)
  AND departure_time BETWEEN $earliest AND $latest
  AND ($community_id IS NULL OR community_id = $community_id)
  AND ($women_only = false OR is_women_only = true)
  AND ($vehicle_type IS NULL OR catalog.type = $vehicle_type)
```

## Stage 2 — JS/TS Scoring
Weights from `server/src/data/ranking_weights.json` (replaced by Phase 13 learned weights):
```json
{ "route_overlap": 0.30, "time_fit": 0.25, "detour": 0.20, "trust": 0.15, "preferences": 0.10 }
```
All detour estimates use stored geometry — no ORS calls.

## Smart Pickup Points
`ST_ClosestPoint(route, passenger_pickup)` → nearest point on route.
If a landmark exists within 200 m, prefer its name as the suggested meeting spot.

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /search/rides | JWT | Passenger search — returns scored matches |

## Acceptance Checklist
- [ ] Seed 20 trips; search Hinjewadi→Kothrud → ≥ 1 match returned.
- [ ] Smart pickup is on the route line (PostGIS verify).
- [ ] Out-of-order trip not returned.
- [ ] Women-only filter works; community filter works.
- [ ] Response < 2 s with 100 seeded trips.
- [ ] Editing ranking_weights.json changes score order without restart.

---

# PHASE 8 — Booking Flow

## Goals
Complete booking state machine, ride code, push notifications, AES-256 encrypted masked chat
(Socket.io), cancellations + streak, backup-match fallback.

## State Machine
```
pending → accepted → started → completed
           ↓                   ↓
        declined            cancelled
```

## Chat Encryption
- AES-256-GCM; key = HKDF(booking_id + SERVER_CHAT_SECRET, "ridecolab-chat").
- Client encrypts body before sending; server stores `body_encrypted` (base64) + `iv`.
- Decryption key provided only to authenticated booking participants.
- Messages never readable from raw DB rows.

## Key Features
- **Ride code**: 6-char alphanumeric generated at ride start; passenger shows to rider.
- **Push notifications**: On request, accept, cancel, start, complete.
- **Cancellation streak**: 3+ in 7 days → warning; 5+ → posting suspended.
- **Backup-match**: On cancellation/decline → auto re-search → push + `backup_matches` Socket event.

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /bookings | JWT | Request a booking |
| GET | /bookings/mine | JWT | My bookings |
| GET | /bookings/:id | JWT | Booking detail |
| POST | /bookings/:id/accept | JWT (rider) | Accept |
| POST | /bookings/:id/decline | JWT (rider) | Decline |
| POST | /bookings/:id/cancel | JWT | Cancel |
| POST | /bookings/:id/start | JWT (rider) | Start (verify ride code) |
| POST | /bookings/:id/complete | JWT (rider) | Complete ride |
| GET | /bookings/:id/messages | JWT | Chat history (decrypted for participant) |

## Acceptance Checklist
- [ ] Full lifecycle: request → accept → start (ride code verified) → complete.
- [ ] Chat: message sent by user A received by user B in real-time.
- [ ] Chat body in DB is not human-readable (encrypted).
- [ ] 5 cancellations → `POST /trips` returns 403.
- [ ] Backup matches pushed on decline.
- [ ] All tests pass.

---

# PHASE 9 — Live Ride and Safety

## Goals
Live GPS tracking, public live-share link page, SOS, helmet check, route deviation +
long-stop alerts, safe-arrival check-in, night rules.

## Architecture
- Client emits `location_update` every 5 s during active trip via Socket.io.
- Server: hot state in Redis/in-memory (CacheAdapter); async DB flush every 30 s.
- DB records deleted after trip completes (DPDP compliance).

## Safety Features
| Feature | Trigger | Action |
|---|---|---|
| Live share link | POST /trips/:id/live-share | share_token → public /share/:token page (MapLibre, no login) |
| SOS | Button press | SMS deep link to emergency contacts + ride_events log + admin notification |
| Helmet check | Bike trip, before start | Mandatory dialog for rider + passenger; logged, not blocked |
| Deviation alert | > 300 m off route for > 120 s | Socket.io deviation_alert to all occupants |
| Long-stop alert | Stationary > 5 min in active trip | Socket.io long_stop_alert |
| Safe-arrival check-in | 10 min after ETA | Push prompt; 15 min no response → notify emergency contacts |
| Night rules (21:00–05:00) | Night trip with female passenger | Non-dismissible check-in; suggest women-only |

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /trips/:id/live-share | JWT | Generate share token |
| GET | /live/:trip_id | JWT (occupant) | Latest live locations |
| POST | /trips/:id/sos | JWT | Log SOS event |
| GET | /share/:token | none (public) | Live share HTML page |
| POST | /bookings/:id/helmet-check | JWT | Log helmet check |
| POST | /bookings/:id/safe-arrival | JWT | Log safe arrival |

## Acceptance Checklist
- [ ] Rider location appears on passenger's live map within 10 s.
- [ ] `/share/:token` (no login) shows map with rider pin.
- [ ] SOS logs ride_events row and appears in admin log.
- [ ] Deviation: 400 m off route → `deviation_alert` received.
- [ ] With `REDIS_URL=""` → live location works (in-memory fallback).

---

# PHASE 10 — Payments, Ratings and Trust

## Goals
UPI deep link / demo payment, weekly settle-up ledger, ratings with tags,
trust score v1, reports/block.

## UPI Deep Link
```
upi://pay?pa={rider_upi_id}&pn={rider_name}&am={fare_share}&cu=INR&tn=RideColab+fare
```
If rider has no UPI ID → informative message. Demo mode (app_config flag) → simulated payment screen.

## Trust Score v1
```
trust_score =
  profile_completeness × 15     (0–15)
+ community_member × 10         (0 or 10)
+ min(trips_completed × 2, 30)  (0–30)
+ avg_rating_normalized × 25    (0–25)
+ (1 − cancellation_rate) × 20  (0–20)
```
Badges: New (0-20) | Regular (21-50) | Trusted (51-75) | Verified (76-100).

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /bookings/:id/rate | JWT | Submit rating (1-5, tags, comment) |
| GET | /users/:id/ratings | JWT | Public ratings |
| GET | /users/me/savings | JWT | Money saved, CO2, streak |
| POST | /reports | JWT | File a report |
| POST | /users/:id/block | JWT | Block a user |
| GET | /pools/:id/ledger | JWT | Pool ledger for a week |
| POST | /pools/:id/ledger/settle | JWT | Mark week settled |

## Acceptance Checklist
- [ ] "Pay via UPI" opens UPI app pre-filled correctly.
- [ ] Rating outside 24 h window → 403.
- [ ] Trust score formula verified manually for a sample user.
- [ ] Blocked user cannot book the blocker's trips.
- [ ] Savings dashboard shows correct money_saved and CO2.

---

# PHASE 11 — Communities and Admin Panel

## Goals
Community request/approval/join, feed, rides-needed board, leaderboard, announcements;
full admin web panel (users, reports, communities, fuel prices, config, SOS log, stats).

## Community Flow
1. User submits request form → `pending` community in DB.
2. Admin approves in admin panel → 6-char alphanumeric invite code generated.
3. User enters invite code → joined instantly. Labelled "Joined via invite code" — no per-user verification.

## Admin Panel Sections
- **Dashboard**: stats cards (users, active trips, reports pending, communities).
- **Users**: search/filter table, suspend/unsuspend.
- **Reports**: list, mark reviewed.
- **Communities**: pending/approved list, approve/reject, create directly, view invite code.
- **Fuel prices**: editable table.
- **App config**: key-value editor for all app_config rows.
- **SOS log**: all SOS events with timestamp and user info.
- **Stats**: daily trips chart, weekly active users.

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /communities/request | JWT | Request a new community |
| GET | /communities | JWT | List approved communities |
| POST | /communities/:id/join | JWT | Join via invite code |
| GET | /communities/:id/feed | JWT | Community feed |
| POST | /communities/:id/posts | JWT | Create post |
| GET | /communities/:id/leaderboard | JWT | Leaderboard (cached 1 h) |
| GET | /communities/:id/rides-needed | JWT | Rides-needed board |
| POST | /admin/communities/:id/approve | admin JWT | Approve community |
| GET | /admin/stats | admin JWT | Dashboard stats |
| GET | /admin/users | admin JWT | User management |
| PATCH | /admin/users/:id/suspend | admin JWT | Suspend user |
| GET | /admin/reports | admin JWT | Reports list |
| GET | /admin/sos-log | admin JWT | SOS events |
| GET/PATCH | /admin/config | admin JWT | App config read/write |

## Acceptance Checklist
- [ ] Community request → admin approves → invite code → user joins.
- [ ] Community-only search (community_id filter) works.
- [ ] Admin panel login with non-admin creds → 403.
- [ ] Admin edits fuel price → server uses new value.
- [ ] Leaderboard ranks users correctly.

---

# PHASE 12 — Creative Features Pack

## Goals
Rain mode, timetable suggestions + reminders, commute pools, preferences,
savings dashboard + badges, quick-picks, shareable trip card, offline handling.

## Feature Summary
| Feature | Implementation |
|---|---|
| Rain mode | Open-Meteo API (cache 1 h); warning if precipitation > 50% at departure hour for bike rides; "Switch to car" button |
| Timetable suggestions | `schedules` table; daily cron 7 AM sends push "Leave by X:XX to catch a ride" |
| Commute pools | `pools` table; pool members get priority booking; weekly ledger auto-created |
| Savings dashboard | Money saved, CO2 avoided (tree animation), streak, badges grid, community leaderboard widget |
| Badges | first_ride, ten_trips, eco_warrior, reliable_rider, trusted_commuter, community_star — auto-awarded |
| Quick-picks | Pune landmarks chip bar; Home/College/Office saved places in Account |
| Shareable trip card | react-native-view-shot → image (route + savings + branding); native share sheet |
| Offline handling | netinfo detect; queue mutations in Zustand persist store; retry on reconnect; cached results banner |

## API Endpoints (new)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /weather/pune | none | Rain forecast (Open-Meteo, cached) |
| GET/POST/DELETE | /users/me/schedules(/:id) | JWT | Timetable CRUD |
| GET | /users/me/schedule-suggestions | JWT | Today's suggested rides |
| GET/POST | /pools(/:id/join) | JWT | Pools list + join |
| GET | /users/me/badges | JWT | My badges |

## Acceptance Checklist
- [ ] Rain warning appears when precipitation > 50% (mocked).
- [ ] Schedule → push notification fires at correct time.
- [ ] Pool → trip → ledger entry created after completion.
- [ ] `first_ride` badge auto-awarded after first completed trip.
- [ ] Shareable card captures and opens share sheet.
- [ ] Offline: rate trip offline → queues → submits on reconnect.

---

# PHASE 13 — Data Science

## Goals
Local Python notebooks: Pune trip simulator, baseline vs corridor matching comparison,
learned ranking weights exported to ranking_weights.json, evaluation write-up.
All results labelled **SIMULATED**.

## Notebooks
| Notebook | Content |
|---|---|
| 01_network.ipynb | OSMnx Pune driving network; cached as pune_network.graphml |
| 02_simulator.ipynb | 5,000 synthetic trips + 8,000 requests (Pune zones, peak distributions) |
| 03_baseline.ipynb | Nearest-start-point matching; compute match rate, detour, wait, seats filled |
| 04_corridor_matching.ipynb | Shapely buffer corridor match; compare to baseline |
| 05_acceptance_simulation.ipynb | Simulate accept/reject; generate 10,000 training rows |
| 06_model.ipynb | Logistic regression + optional gradient boosting; export ranking_weights.json |
| 07_pickup_clustering.ipynb | DBSCAN on pickup points (optional) |
| 08_demand_heatmap.ipynb | Morning/evening peak heatmap (optional) |

## Output
- `server/src/data/ranking_weights.json` updated with learned coefficients.
- Server reloads weights with 60 s TTL — no restart needed.
- `docs/evaluation.md` with metrics table (SIMULATED label on every result).

## Acceptance Checklist
- [ ] All 6 main notebooks run to completion.
- [ ] AUC > 0.7 (simulated) printed by 06_model.ipynb.
- [ ] ranking_weights.json updated; search score order changes.
- [ ] docs/evaluation.md has metrics table + SIMULATED disclaimer.

---

# PHASE 14 — Hardening and Polish

## Goals
E2E tests, security review, privacy + legal screens, i18n completion (en/hi/mr),
accessibility, performance pass, empty/error states, UI polish to the design direction.

## Key Tasks
1. **E2E**: Supertest — full server flow (register→trip→book→rate). Playwright — admin panel
   (approve community, edit fuel price). At least 5 test scenarios.
2. **Security**: `npm audit`; auth rate limit (5 attempts/15 min/IP); parameterised SQL only;
   JWT expiry + invalid signature rejection; CORS whitelist; Helmet headers.
3. **Privacy screens**: Consent re-display if updated; "Delete my data"; "What data we store"
   (reference DPDP Act 2023).
4. **Legal screens**: Disclaimer — "Cost-sharing only. Not a taxi service. No commission.
   Student project. Not a licensed transport service." Terms and Privacy Policy as Markdown
   rendered in-app. `docs/legal-note.md` completed with Maharashtra Motor Vehicle Aggregator
   Rules 2026 reference.
5. **i18n**: Complete en/hi/mr for all screens. Label: "machine-translated — verify before production."
6. **Accessibility**: accessibilityLabel + accessibilityRole on all interactive elements;
   44px touch targets; ≥ 4.5:1 contrast; TalkBack test.
7. **Performance**: `compression` middleware; `EXPLAIN ANALYZE` search query (verify GiST);
   Neon keep-alive query on startup; FlatList with getItemLayout for match results.
8. **UI polish**: All colours from tokens; smooth transitions; MatchCard final style;
   loading states on all buttons; zero layout jumps; no blank screens.

## Acceptance Checklist
- [ ] `npm audit --audit-level=high` → 0 HIGH/CRITICAL.
- [ ] E2E: register→savings flow completes without error.
- [ ] 6th login attempt within 15 min → 429.
- [ ] TalkBack reads "Post a ride" button correctly.
- [ ] `EXPLAIN ANALYZE` shows GiST index on search query.
- [ ] Legal disclaimer accessible from Account → About.
- [ ] Zero blank screens anywhere in the app.

---

# PHASE 15 — Deployment and Distribution

## Goals
Server on Render, DB on Neon, admin on Vercel/Netlify, EAS preview APK, EAS Update OTA,
in-app update prompt, keep-alive cron, full README, demo script, pilot checklist.

## Deployment Steps
1. **Neon production**: Migrations + seed; schema snapshot at `docs/db-schema.sql`.
2. **Render** (server): GitHub → Web Service free; build `npm install && npm run build`;
   start `node dist/index.js`; all env vars set.
   Keep-alive: cron-job.org pings `/api/v1/health` every 14 min.
3. **Vercel/Netlify** (admin): GitHub → static build; `VITE_API_BASE_URL` = Render URL.
4. **EAS Build** (`preview` profile): `eas build --profile preview --platform android` → APK URL
   in `GET /api/v1/version`.
5. **EAS Update**: `eas update --branch production --message "v1.0.0-pilot"`.
   In-app: check `Updates.checkForUpdateAsync()` on foreground; non-blocking "Update available"
   banner → reload. `GET /api/v1/version` has `minClientVersion`; if client < min → mandatory screen.
6. **Docs**:
   - README.md: prerequisites, 5-command setup, env table, test guide, EAS dev build guide,
     Mermaid architecture diagram, legal disclaimer.
   - docs/demo-script.md: 10-minute viva demo steps.
   - docs/pilot-checklist.md: 20–30 person pilot test guide.
   - docs/report-notes.md: project report section headings.
7. **Git tag**: `v1.0.0-pilot`.

## Acceptance Checklist
- [ ] `curl https://{render-url}/api/v1/health` → 200 from production.
- [ ] Admin panel loads on Vercel/Netlify URL.
- [ ] EAS APK installs on real Android device; all flows work on production URLs.
- [ ] OTA update: `eas update` → "Update available" banner → reloads.
- [ ] README setup works on a fresh machine.
- [ ] `docs/demo-script.md` works end-to-end in < 10 minutes.
- [ ] `v1.0.0-pilot` tag on GitHub.

---

## Cross-Cutting Conventions

### API Response Shapes
```json
// Success
{ "success": true, "data": { ... }, "meta": { "page": 1, "total": 42 } }

// Error
{ "success": false, "error": { "code": "TRIP_LIMIT_EXCEEDED", "message": "...", "details": null } }
```

### Money Rule (enforced server-side on every request — non-negotiable)
> The rider can NEVER charge more than the real calculated trip cost.
> The app takes NO commission and NEVER handles money.
> Enforce on every POST /bookings and PATCH /trips.

### Free-Tier Limits
| Service | Limit | Mitigation |
|---|---|---|
| ORS Directions | 2,000/day | Cache by rounded coords; never call at search time |
| ORS Geocoding | 1,000/day | Landmarks table first; cache 24 h |
| Neon DB | 500 MB, 10 GB transfer | Store geometry once; delete live locations post-trip |
| Upstash Redis | 500K commands/month | Live locations + cache only; in-memory fallback |
| EAS Build | 30 build-min/month | Build only for major milestones |
| Render | Sleeps after 15 min | Keep-alive cron + ColdStartScreen UX |
| Open-Meteo | Free, no key | Cache 1 h |

### Coding Conventions
- TypeScript everywhere; no `any` except explicitly typed escape hatches.
- Path aliases: `@/` for client root, `~/` for server `src/`.
- All env vars via `src/config/app.ts` — never `process.env.X` directly in routes.
- SQL: always parameterised — no string concatenation.
- Every route handler wrapped in try/catch → errorHandler.
- No `console.log` in production code — use `pino` logger.
- Git: one commit per phase with prefix `phase-N: ...`; no force-push on main.

---

*RideColab Implementation Plan — v1.1*
*Updated: 2026-10-15 | User-reviewed decisions applied.*
*This document is the source of truth. docs/project-brief.pdf is background only.*
