# CampusGigs — Phase C

Standalone service-marketplace foundation for Nigeria. **Not part of CampSell.**

Phases A–C include:

- Responsive gold / black / white buyer-facing website (desktop and mobile).
- Firebase Auth (Google + email/password), using the **same Firebase project as CampSell** when configured.
- Cloudflare Worker API that verifies Firebase ID-token signatures against Google's current public certificates and checks issuer/audience/expiry.
- Private Cloudflare D1 profiles, roles, and basic rate-limit storage.
- Profile creation and editing, campus/city/bio, Buying/Providing preference.
- **Separate CampusGigs Admin dashboard** in `apps/admin`, hosted independently from the buyer site. Server-side UID-role checks, member statistics, and read-only directory.
- Link to CampSell; no access to CampSell's database or deployment.
- Provider application form: skills, campus/city, bio, private student/government ID upload to R2.
- Separate admin review dashboard: view private IDs, approve, request corrections, reject; provider gold verification badge.
- Verified-provider gig creation, four R2 images per gig, prices stored as integer **kobo**, location and future payment-option selection.
- Admin gig moderation with removal/restoration and audit records.
- **Customer-facing gig discovery:** text search, category, campus/city, online/in-person, naira price filters, sorting and paginated results.
- **Individual gig detail pages** with real R2 image galleries, public verified-provider information, price, delivery and related gigs.
- Refresh-safe, shareable `/gigs` and `/gigs/:id` links, polished two-column phone cards and native-feeling Android/iOS layouts.
- Compact Android/iOS-style bottom navigation and bold typography on both sites.
- Tests for search input, SQL wildcard escaping, data visibility, auth rejection and both SQL migrations.

**Not yet implemented:** bookings, Paystack, escrow, payouts, reviews, disputes, cron and notifications. These belong to Phases D–F. **No live payment can be charged by Phase C code.**

## Structure

```text
CampusGigs/
├── apps/
│   ├── api/
│   │   ├── cloudflare.config.ts      # CampusGigs-only Worker/D1/R2 bindings
│   │   ├── migrations/0001_profiles.sql
│   │   ├── migrations/0002_providers_gigs.sql
│   │   ├── src/auth.ts               # Verified Firebase JWT
│   │   ├── src/index.ts              # Authorized API endpoints
│   │   ├── src/phaseB.ts             # Provider workflows, R2 and gigs
│   │   ├── src/publicGigs.ts         # Parameterized discovery query and validation
│   │   ├── src/providerValidation.ts # Strict provider/gig input checks
│   │   ├── src/validation.ts         # Input constraints
│   │   └── tests/phase-a.test.mjs
│   └── web/
│       ├── .env.example              # Firebase Web config template
│       ├── src/App.tsx               # Pages and profile UI
│       ├── src/ProviderWorkspace.tsx # Apply, verify, create services
│       ├── src/BrowseGigs.tsx        # Search, filters, real gig cards
│       ├── src/GigDetail.tsx         # Gallery, provider and price details
│       ├── src/firebase.ts           # Client-side Firebase login
│       ├── src/api.ts                # Bearer token API calls
│       └── src/styles.css
│   └── admin/                       # Separate admin-only Cloudflare Pages frontend
│       ├── src/App.tsx              # Guarded admin dashboard and members
│       ├── src/ProviderApprovals.tsx # Provider ID review
│       ├── src/GigModeration.tsx     # Gig moderation
│       ├── src/api.ts               # Firebase bearer-token API calls
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
See [docs/ADMIN.md](docs/ADMIN.md) for the separate admin dashboard hosting and security model.

## Phase A + B + C API

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Worker health |
| `GET` | `/v1/me` | Firebase ID token | Create/read only your own profile |
| `PATCH` | `/v1/me` | Firebase ID token | Edit allowed profile fields |
| `PATCH` | `/v1/me/mode` | Firebase ID token | Set buying/providing display preference |

Only the verified Firebase UID determines profile ownership. Clients cannot set account status, UID or administrative roles. `providing` mode alone gives **no** provider privileges: publishing requires a distinct approved `provider_profiles` row.

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/v1/provider` | Member | Own provider application and badge |
| `POST` | `/v1/provider/evidence` | Verified member | Upload private ID image (4 MB max) |
| `POST` | `/v1/provider/application` | Verified member | Submit or resubmit application |
| `GET` | `/v1/provider/gigs` | Member | Own gig listings |
| `POST` | `/v1/provider/gigs` | Approved provider | Create an active gig |
| `POST` | `/v1/provider/gigs/:id/images` | Gig owner/provider | Add gig image (maximum four) |
| `GET` | `/v1/public/gigs` | Public | Filtered, sorted, paginated approved gig listings |
| `GET` | `/v1/public/gigs/:id` | Public | Gig details, published gallery IDs and related listings |
| `GET` | `/v1/public/gigs/:id/images/:imageId` | Public | Active gig image only |
| `GET` | `/v1/admin/providers` | D1 admin | Review applications |
| `GET` | `/v1/admin/providers/:id/evidence` | D1 admin | Private ID image |
| `POST` | `/v1/admin/providers/:id/review` | D1 admin | Approve/reject/request changes |
| `GET` | `/v1/admin/gigs` | D1 admin | Moderate all gigs |
| `POST` | `/v1/admin/gigs/:id/moderate` | D1 admin | Remove/restore listing |

All provider/admin actions require Firebase ID-token verification and D1 authorization. ID evidence is **never** served by a public route; private R2 keys are not returned by the application APIs. Price amounts are **integer kobo**. Images are MIME/signature validated and uploads have per-UID write limits. Provider decisions and moderation are recorded in audit tables.

### Phase C discovery query

`GET /v1/public/gigs?q=logo&category=Design%20%26%20Creative&location=Yenagoa&locationType=online&sort=newest&minPrice=1000&maxPrice=25000&limit=12&offset=0`

Only active gigs belonging to active, approved providers and active accounts appear. `minPrice` and `maxPrice` are **naira** values for browsing; stored prices remain **integer kobo**. Accepted sorts: `newest`, `price_low`, `price_high`, `fastest`. The response returns `gigs`, `nextOffset` or `null`, and `paymentsEnabled:false`. Public gig detail and image routes use the same status checks, so moderated or suspended providers cannot expose removed listings through direct URLs.

### Important account distinction

The same Firebase project gives users the same identity on both websites. Because browser storage is origin-scoped, users may still sign in again when moving between CampSell and CampusGigs.

### Payment launch restriction

Paystack's current guidance lists manual payouts and Transfers for eligible Registered Businesses, rather than Starter accounts. Verify business eligibility and a separate webhook delivery mechanism before enabling money handling in Phases D/E. A D1 ledger is not a regulated custodial escrow account.
