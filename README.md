# CampusGigs — Phase F

Standalone service-marketplace foundation for Nigeria. **Not part of CampSell.**

Phases A–F include:

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
- **Desktop floating bottom navigator** on the marketplace and admin dashboard, with the full desktop sidebar/header still available.
- **Current UI revision:** the floating dock now belongs to the public marketplace only. Desktop's duplicate top links are hidden, and the dock is smaller with five balanced tabs and a curved, emphasized center button. Admin uses its existing sidebar and mobile menu without a bottom dock.
- **First-time member setup:** after Firebase email verification, new members choose how they use CampusGigs, select interests, and provide an age group, student status, school (if applicable), city and display name. Existing accounts keep their current experience.
- Improved email/password error messages, password reset, show/hide password, verification-email resend and explicit confirmation before entering the new-user setup. Firebase email verification uses a one-time **link**, not a numeric OTP.
- **Phase D service booking requests** with customer briefs, frozen service-price snapshots, idempotent request IDs, separate incoming provider requests, provider accept/decline, buyer cancellation, request history and auditable status changes.
- **Admin booking operations**: request counts, status filters, searching by buyer, service, email or ID, and read-only request details.
- Protected booking endpoints that only expose customer/provider records to the relevant Firebase UID; provider responses require active verified provider authorization.
- Tests for search input, SQL wildcard escaping, data visibility, auth rejection and all four SQL migrations.
- Phase D tests for booking validation, idempotence, actor authorization, status transition limits and schema audit triggers.
- **Phase F campus discovery:** 763 Nigerian higher-education institutions in a dated directory generated from NUC, NBTE and NCCE public registers, plus common school names/acronyms. State and selected institution are matched exactly on the Worker; free-text service/city search cannot bypass the selected scope. Some institutions may be missing or have outdated naming, so the directory is not a substitute for verification.
- Campus state/institution selection at onboarding and in Profile. Search changes to other campuses or nationwide show a visible confirmation, and returning users start with their saved profile location. This is a member-selected state, **not GPS-based state detection or proof of physical presence**.
- Public `/people` provider directory, public provider profile pages, follower counts, idempotent authenticated follow/unfollow and a personal Following panel. Private Firebase UIDs and emails are never returned by public provider endpoints.
- **Opt-in online indicator:** a green dot appears only when a member has enabled public status and the web app has checked in recently. Online visibility defaults to disabled; no exact GPS coordinates are exposed.
- Phase F tests cover campus-locked queries, alias search, profile privacy, online status and follows.

**Not yet implemented:** Paystack collection, escrow, payouts, FacePay identity checks, reviews, disputes and notifications. They require separate financial/security readiness. **Bookings only send service requests; no live payment can be charged.**

## Structure

```text
CampusGigs/
├── apps/
│   ├── api/
│   │   ├── cloudflare.config.ts      # CampusGigs-only Worker/D1/R2 bindings
│   │   ├── migrations/0001_profiles.sql
│   │   ├── migrations/0002_providers_gigs.sql
│   │   ├── migrations/0003_bookings.sql
│   │   ├── migrations/0004_member_onboarding.sql
│   │   ├── migrations/0005_campus_social.sql
│   │   ├── migrations/0006_institution_directory.sql
│   │   ├── src/auth.ts               # Verified Firebase JWT
│   │   ├── src/index.ts              # Authorized API endpoints
│   │   ├── src/phaseB.ts             # Provider workflows, R2 and gigs
│   │   ├── src/publicGigs.ts         # Parameterized discovery query and validation
│   │   ├── src/institutions.ts       # Strict state/school scope and online flag
│   │   ├── src/bookings.ts           # Scoped, auditable booking requests and admin read view
│   │   ├── src/bookingValidation.ts  # Strict request IDs and status input
│   │   ├── src/onboardingValidation.ts # Validated member setup data
│   │   ├── src/providerValidation.ts # Strict provider/gig input checks
│   │   ├── src/validation.ts         # Input constraints
│   │   └── tests/phase-a.test.mjs
│   └── web/
│       ├── .env.example              # Firebase Web config template
│       ├── src/App.tsx               # Pages and profile UI
│       ├── src/ProviderWorkspace.tsx # Apply, verify, create services
│       ├── src/BrowseGigs.tsx        # Search, filters, real gig cards
│       ├── src/GigDetail.tsx         # Gallery, provider and price details
│       ├── src/BookingWorkspace.tsx  # Buyer/provider request dashboard
│       ├── src/WelcomeSetup.tsx      # Three-step first-time experience
│       ├── src/phase-e.css           # Native mobile/desktop dock and auth UX
│       ├── src/phase-f.css           # Campus, directory and social UI
│       ├── src/InstitutionPicker.tsx # State/school autocomplete
│       ├── src/PeopleDirectory.tsx  # Search verified provider profiles
│       ├── src/ProviderPublicProfile.tsx # Public profile and following
│       ├── src/firebase.ts           # Client-side Firebase login
│       ├── src/api.ts                # Bearer token API calls
│       └── src/styles.css
│   └── admin/                       # Separate admin-only Cloudflare Pages frontend
│       ├── src/App.tsx              # Guarded admin dashboard and members
│       ├── src/ProviderApprovals.tsx # Provider ID review
│       ├── src/GigModeration.tsx     # Gig moderation
│       ├── src/AdminBookings.tsx     # Admin booking search and tracking
│       ├── src/phase-d.css           # Admin desktop dock and bookings UI
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

## Phase A + B + C + D API

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Worker health |
| `GET` | `/v1/me` | Firebase ID token | Create/read only your own profile |
| `PATCH` | `/v1/me` | Firebase ID token | Edit allowed profile fields |
| `PATCH` | `/v1/me/mode` | Firebase ID token | Set buying/providing display preference |

Only the verified Firebase UID determines profile ownership. Clients cannot set account status, UID or administrative roles. `providing` mode alone gives **no** provider privileges: publishing requires a distinct approved `provider_profiles` row. New identities must complete welcome setup before accessing member services.

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
| `PATCH` | `/v1/me/onboarding` | Verified Firebase member | Save first-time interests, age group, school and mode |
| `GET` | `/v1/bookings?role=buyer\|provider` | Firebase member | Own requests or incoming provider requests |
| `POST` | `/v1/bookings` | Verified Firebase member | Request active approved gig; idempotent per buyer/request ID |
| `GET` | `/v1/bookings/:id` | Buyer or provider only | Private details and status timeline |
| `POST` | `/v1/bookings/:id/decision` | Active approved provider | Accept or decline a pending request |
| `POST` | `/v1/bookings/:id/cancel` | Buyer only | Cancel a requested or accepted booking |
| `GET` | `/v1/admin/bookings` | D1 admin | Read-only booking overview, status counts and details |

All provider/admin actions require Firebase ID-token verification and D1 authorization. ID evidence is **never** served by a public route; private R2 keys are not returned by the application APIs. Price amounts are **integer kobo**. Images are MIME/signature validated and uploads have per-UID write limits. Provider decisions and moderation are recorded in audit tables.

### Phase C discovery query

`GET /v1/public/gigs?q=logo&category=Design%20%26%20Creative&location=Yenagoa&locationType=online&sort=newest&minPrice=1000&maxPrice=25000&limit=12&offset=0`

Only active gigs belonging to active, approved providers and active accounts appear. `minPrice` and `maxPrice` are **naira** values for browsing; stored prices remain **integer kobo**. Accepted sorts: `newest`, `price_low`, `price_high`, `fastest`. The response returns `gigs`, `nextOffset` or `null`, and `paymentsEnabled:false`. Public gig detail and image routes use the same status checks, so moderated or suspended providers cannot expose removed listings through direct URLs.

### Important account distinction

The same Firebase project gives users the same identity on both websites. Because browser storage is origin-scoped, users may still sign in again when moving between CampSell and CampusGigs.

### Phase D booking safety

The service request sends a description to the provider and freezes the published service price at the time of booking. The provider can accept or decline, and the customer can cancel. Acceptance is **not an order payment, service completion confirmation, or Paystack charge**. All changes are restricted by Firebase UID and written to the D1 audit table. Even if multiple requests arrive at once, a retry with the same buyer/request ID is not charged or duplicated.

### Payment launch restriction

Paystack's current guidance lists manual payouts and Transfers for eligible Registered Businesses, rather than Starter accounts. Verify business eligibility and a separate webhook delivery mechanism before enabling money handling in Phases D/E. A D1 ledger is not a regulated custodial escrow account.
