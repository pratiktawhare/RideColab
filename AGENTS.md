# AGENTS.md — RideColab Developer Reference

> This file is the single source of truth for any AI agent or developer working on this codebase.
> Read it completely before writing any code.

---

## App Identity

- **App name**: `RideColab` — defined as `APP_NAME` in `server/src/config/app.ts` and `client/constants/app.ts`. Change it there only.
- **Tagline**: "Share the road. Split the cost. Nobody profits."
- **Target**: Students and daily commuters in Pune, India.
- **Platform**: Android-first (React Native + Expo). Web admin panel.

---

## ☠️ THE MONEY RULE (Non-Negotiable)

> **The rider can NEVER charge more than the real calculated cost of the trip.**
> **The app takes NO commission and NEVER handles money.**
> **Passengers pay riders directly via UPI deep link or simulated demo payment.**

This rule MUST be enforced **server-side** on every:
- `POST /api/v1/trips` — reject if `fare_set > fare_cap`
- `POST /api/v1/bookings` — re-verify cap
- `PATCH /api/v1/trips/:id` — re-verify cap on update

Never trust the client for fare values.

---

## Repository Structure

```
RideColab/
├── client/          React Native · Expo · TypeScript · Expo Router
│   ├── app/         Expo Router screens (file-based routing)
│   ├── components/  Shared UI components
│   ├── features/    Domain features: rider/ passenger/ community/ safety/
│   ├── services/    api/ location/ notifications/ socket/
│   ├── store/       Zustand global state slices
│   ├── theme/       Design tokens (light + dark)
│   ├── i18n/        Translations: en/ hi/ mr/
│   └── assets/      Images, fonts, icons
├── server/          Express · TypeScript · Node.js 20 LTS
│   └── src/
│       ├── routes/      Express route definitions
│       ├── controllers/ Request handlers
│       ├── services/    matching/ fare/ routing/ live/ trust/ notifications/
│       ├── db/          migrations/ queries/ pool/ seed
│       ├── middleware/  authenticate/ validate/ errorHandler/ rateLimiter
│       ├── data/        vehicle_mileage.csv  ranking_weights.json
│       ├── utils/       Shared helpers
│       └── index.ts     Entry point
├── admin/           React · Vite · TypeScript — admin web panel
├── notebooks/       Python — local data science only (NOT deployed)
└── docs/            implementation-plan.md, progress-report.md, legal-note.md, evaluation.md
```

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile | Expo SDK 51+, React Native, Expo Router | EAS dev build for maps |
| Maps | @maplibre/maplibre-react-native | Requires native build |
| State | Zustand + TanStack React Query | |
| Backend | Express 5 + TypeScript + Socket.io | Node 20 LTS |
| Database | PostgreSQL 16 + PostGIS on Neon | Free tier |
| Cache | Upstash Redis (in-memory fallback) | CacheAdapter interface |
| Routing API | OpenRouteService | 2K directions/day — cache aggressively |
| Geocoding | ORS + built-in landmarks table | 1K/day — landmarks first |
| Map Tiles | OpenFreeMap | URL in MAP_TILE_URL config |
| Push | Expo Push Service | Free |
| Weather | Open-Meteo | Free, no key |
| Auth | bcrypt + JWT (access 15 min, refresh 7 days) | |
| Payments | UPI deep link only | No money handled |
| Admin | React + Vite | Deployed on Vercel/Netlify |
| Testing | Jest + Supertest + RNTL + Playwright | |

---

## Free-Tier Constraints

| Service | Limit | Rule |
|---|---|---|
| ORS Directions | 2,000/day | NEVER call at search time. Cache by rounded coords. |
| ORS Geocoding | 1,000/day | Check landmarks table first. Cache 24 h. |
| Neon DB | 500 MB, 10 GB transfer | Store route geometry once. Delete live locations post-trip. |
| Upstash Redis | 500K commands/month | Live locations + top-level cache only. In-memory fallback must always work. |
| EAS Build | 30 build-min/month | Build only at major milestones. |
| Render | Sleeps after 15 min idle | Keep-alive cron + ColdStartScreen UX. |
| Open-Meteo | Free, no key | Cache 1 h. |

---

## Path Aliases

- **Server**: Use `~/` for `server/src/` — configured in `tsconfig.json`.
- **Client**: Use `@/` for `client/` root — configured in `tsconfig.json` + `babel.config.js`.

```typescript
// Server example
import { db } from '~/db/pool';
import { AppConfig } from '~/config/app';

// Client example
import { AppButton } from '@/components/AppButton';
import { authStore } from '@/store/authStore';
```

---

## API Conventions

**All endpoints** under `/api/v1/`.

**Success response**:
```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "total": 42 } }
```

**Error response**:
```json
{ "success": false, "error": { "code": "TRIP_LIMIT_EXCEEDED", "message": "...", "details": null } }
```

**Error codes**: SCREAMING_SNAKE_CASE strings (e.g. `AUTH_INVALID`, `FARE_CAP_EXCEEDED`, `NOT_FOUND`).

---

## Coding Conventions

1. **TypeScript everywhere** — no `any` except in explicitly typed escape hatches with a `// eslint-disable` comment explaining why.
2. **Environment variables** — all read via `server/src/config/app.ts` or `client/constants/env.ts`. Never use `process.env.X` directly in route files.
3. **SQL** — always parameterised queries. Never concatenate user input into SQL strings.
4. **Logging** — use `pino` logger in server. No `console.log` in production code.
5. **Error handling** — every Express route handler must be wrapped in `try/catch` forwarding to `next(error)`. The `errorHandler` middleware formats the response.
6. **Secrets** — never hardcode. Never commit `.env`. Always use `.env.example` with comments.
7. **Git** — one commit per phase with prefix `phase-N: ...`. No force-push on main.
8. **Tests** — write tests alongside the feature. Run before committing.

---

## Design Tokens (quick reference)

| Token | Value | Use |
|---|---|---|
| Primary | #0F1B33 (deep navy) | Text, primary buttons |
| Accent | #0E9384 (teal) | Savings, active states |
| Warning | #F59E0B (amber) | Rain, warnings |
| Danger | #EF4444 (red) | SOS, destructive actions |
| Surface | #FFFFFF | Cards |
| Background | #F3F4F6 | Screen background |

---

## Legal Guardrails

- Cost-sharing only — no profit, no commission, no surge pricing.
- Weekly trip limit per rider: **14 trips** (configurable in `app_config`).
- Fare cap enforced server-side on every request.
- Maharashtra Motor Vehicle Aggregator Rules 2026 referenced in `docs/legal-note.md`.
- Disclaimer must be visible in-app: "Not a taxi service. No commission. Student project."
- India DPDP Act 2023: minimum data, consent on signup, delete on request, live location only during trip.

---

## Phase Progress

See `docs/progress-report.md` for current phase status and phase reports.
See `docs/implementation-plan.md` for the full 15-phase plan.
