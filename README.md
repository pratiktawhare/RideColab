# RideColab 🛵🚗
### "Share the road. Split the cost. Nobody profits."

A free, peer-to-peer **cost-sharing ride pooling app** for Pune, India.
Built for students and daily commuters. Zero commission. No money handled by us.

---

## What is RideColab?

RideColab connects riders (who already have a vehicle and are making a trip) with passengers
heading along the same route — splitting only the real fuel and running cost equally.

- **Riders** post trips they're already making.
- **Passengers** search for rides along their route.
- **Cost split** is capped at the actual fuel cost. The rider can never profit.
- **Communities** (colleges, companies, societies) can form private pools.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native + Expo (TypeScript) |
| Backend API | Node.js + Express (TypeScript) |
| Database | PostgreSQL + PostGIS (Neon free) |
| Admin Panel | React + Vite (TypeScript) |
| Maps | MapLibre + OpenFreeMap tiles |
| Auth | JWT (email + password) |

---

## Prerequisites

- **Node.js** 20 LTS — [nodejs.org](https://nodejs.org)
- **npm** 9+ (comes with Node)
- **Expo CLI** — `npm install -g expo-cli`
- **Expo Go** app on your Android phone ([Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent))
- A free **Expo account** — [expo.dev](https://expo.dev) (for EAS builds)
- A free **Neon account** — [neon.tech](https://neon.tech) (PostgreSQL DB, Phase 2)

---

## Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/RideColab.git
cd RideColab

# 2. Install root + server + admin dependencies
npm install

# 3. Install client dependencies
cd client && npm install && cd ..

# 4. Set up environment variables
cp server/.env.example server/.env
cp client/.env.example client/.env
cp admin/.env.example admin/.env
# → Edit each .env file with your actual values (see Environment Variables below)

# 5. Run the server
cd server && npm run dev
# → http://localhost:4000

# 6. Run the admin panel (new terminal)
cd admin && npm run dev
# → http://localhost:5173

# 7. Run the mobile app (new terminal)
cd client && npx expo start
# → Scan the QR code with Expo Go on your phone
```

---

## Environment Variables

All required variables are documented in the `.env.example` files:
- [`server/.env.example`](server/.env.example)
- [`client/.env.example`](client/.env.example)
- [`admin/.env.example`](admin/.env.example)

Key variables to fill in:

| Variable | File | Description |
|---|---|---|
| `DATABASE_URL` | server/.env | Neon PostgreSQL connection string |
| `JWT_SECRET` | server/.env | Random secret for JWT signing |
| `ORS_API_KEY` | server/.env | OpenRouteService API key (Phase 5) |
| `EXPO_PUBLIC_API_URL` | client/.env | Your local server URL |

---

## Running Tests

```bash
# Server tests
cd server && npm test

# Admin tests
cd admin && npm test
```

---

## Mobile App — EAS Dev Build (for Map features)

The map library (`@maplibre/maplibre-react-native`) requires a native build.
Expo Go shows a placeholder image for the map screen.

To build the full app with map support:
```bash
cd client
eas build --profile development --platform android
# Install the APK on your phone, then:
npx expo start --dev-client
```

See [`docs/eas-dev-build.md`](docs/eas-dev-build.md) for the full guide.

---

## Project Structure

```
RideColab/
├── client/      Mobile app (React Native + Expo)
├── server/      Backend API (Express + TypeScript)
├── admin/       Admin panel (React + Vite)
├── notebooks/   Data science (Python, local only)
└── docs/        Plans, guides, legal notes
```

---

## Documentation

- [Implementation Plan](docs/implementation-plan.md) — 15-phase build plan
- [Progress Report](docs/progress-report.md) — Phase completion status
- [AGENTS.md](AGENTS.md) — Developer and AI agent conventions
- [Legal Note](docs/legal-note.md) — Maharashtra carpooling rules reference
- [EAS Dev Build Guide](docs/eas-dev-build.md) — Mobile build instructions

---

## Legal Disclaimer

RideColab is a **student project** that facilitates cost-sharing only.
It is not a taxi or cab aggregator. The platform takes no commission and never profits from rides.
Users are responsible for complying with applicable laws.
Verify compliance with the Maharashtra Motor Vehicle Aggregator Rules 2026 before any real-world use.

---

## Contributing

This is a student project. If you're contributing, read [`AGENTS.md`](AGENTS.md) first.
