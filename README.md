# CampusGigs — Phase A

Standalone service-marketplace foundation for Nigeria. **Not part of CampSell.**

Phase A includes:

- Responsive gold / black / white buyer-facing website (desktop and mobile).
- Firebase Auth (Google + email/password), using the **same Firebase project as CampSell** when configured.
- Cloudflare Worker API that verifies Firebase ID-token signatures against Google's current public certificates and checks issuer/audience/expiry.
- Private Cloudflare D1 profiles, roles, and basic rate-limit storage.
- Profile creation and editing, campus/city/bio, Buying/Providing preference.
- Link to CampSell; no access to CampSell's database or deployment.
- Tests for input validation, auth rejection and SQL schema.

**Not yet implemented:** provider applications/verification, live listings, search, bookings, Paystack, escrow, payouts, reviews, disputes, cron and notifications. These belong to Phases B–F. No live payment can be charged by this Phase A code.

## Structure

```text
CampusGigs/
├── apps/
│   ├── api/
│   │   ├── cloudflare.config.ts      # CampusGigs-only Worker/D1/R2 bindings
│   │   ├── migrations/0001_profiles.sql
│   │   ├── src/auth.ts               # Verified Firebase JWT
│   │   ├── src/index.ts              # Authorized API endpoints
│   │   ├── src/validation.ts         # Input constraints
│   │   └── tests/phase-a.test.mjs
│   └── web/
│       ├── .env.example              # Firebase Web config template
│       ├── src/App.tsx               # Pages and profile UI
│       ├── src/firebase.ts           # Client-side Firebase login
│       ├── src/api.ts                # Bearer token API calls
│       └── src/styles.css
└── docs/DEPLOY.md                    # Setup, verification, pending choices
```

## Install, check, and run

Requirements: Node.js 24+ and npm.

```bash
npm install
npm run check
npm run test -w @campusgigs/api
npm run build
```

Create `apps/web/.env` using `apps/web/.env.example` with the existing Firebase project's **public web app config** and local API URL. Never commit `.env` or credentials.

```bash
npm run dev:web
# in a second terminal:
npm run dev:api
```

Follow [docs/DEPLOY.md](docs/DEPLOY.md) for Cloudflare resource creation, migrations, Google authorised domain, and production variables.

## Phase A API

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Worker health |
| `GET` | `/v1/me` | Firebase ID token | Create/read only your own profile |
| `PATCH` | `/v1/me` | Firebase ID token | Edit allowed profile fields |
| `PATCH` | `/v1/me/mode` | Firebase ID token | Set buying/providing display preference |

Only the verified Firebase UID determines profile ownership. Clients cannot set account status, UID or administrative roles. `providing` mode gives **no** provider privileges until the admin approval system exists in Phase B.

### Important account distinction

The same Firebase project gives users the same identity on both websites. Because browser storage is origin-scoped, users may still sign in again when moving between CampSell and CampusGigs.

### Payment launch restriction

Paystack's current guidance lists manual payouts and Transfers for eligible Registered Businesses, rather than Starter accounts. Verify business eligibility and a separate webhook delivery mechanism before enabling money handling in Phases D/E. A D1 ledger is not a regulated custodial escrow account.
