# CampusGigs Phases A–D — deploy and verify

This project uses the new Cloudflare `cf` CLI and `cloudflare.config.ts` for the API, and Cloudflare Pages for the React frontend. **Do not change any existing CampSell project.**

## Confirmed setup (16 November 2026)

- Cloudflare account: **`ose6519@gmail.com`** (confirmed by connected Cloudflare plugin).
- GitHub repository: **`ose6519-dev/CampusGigs`** (`main` branch).
- Firebase project: **`campsell-ea245`** (same authentication identity store as CampSell).
- Firebase Web App: **`CampusGigs`** (new registration under that project; CampSell's app unchanged).
- Initial admin: **`campsell.services@gmail.com`**; its verified Firebase UID has the admin role in *CampusGigs D1 only*.
- Paystack handling remains disabled until later phases and settlement eligibility checks.

## Resources — new names only

- GitHub repository: `ose6519-dev/CampusGigs` (exists).
- Pages: `campusgigs` → `https://campusgigs-97y.pages.dev` (**GitHub-connected production deployment live**).
- Separate admin Pages: `campusgigsadmin-web` → `https://campusgigsadmin-web.pages.dev`.
- Worker: `campusgigs-api` → `https://campusgigs-api.ose6519.workers.dev` (**deployed**).
- D1: `campusgigs-db` (`d6e582ae-173a-412d-a345-f516bd40f2f2`; profile, provider/gig, and booking migrations).
- R2: `campusgigs-media` (private provider ID evidence and gig images).

The above D1 and R2 already exist under the chosen account; **do not recreate or rename them**. Never bind a CampSell resource ID.

`apps/api/cloudflare.config.ts` already binds these CampusGigs resources and uses Firebase project ID `campsell-ea245` and origin `https://campusgigs-97y.pages.dev`. Keep `DB`, `MEDIA`, `FIREBASE_PROJECT_ID`, `WEB_ORIGINS` unchanged.

Migration `apps/api/migrations/0001_profiles.sql` initializes profiles, roles and rate limits. Migration `0002_providers_gigs.sql` adds provider applications, approvals, badges, gigs, images and admin events. Phase D migration `0003_bookings.sql` adds service requests and booking-event audit trails. Migration `0004_member_onboarding.sql` adds first-time profile preferences and marks existing profiles as already onboarded. Apply migrations in number order **only** to the independent CampusGigs D1 database before updating the Worker; never touch CampSell D1.

## Firebase login setup

1. The CampusGigs Firebase Web App is already registered under the same Firebase project as CampSell.
2. `campusgigs-97y.pages.dev` has been added to Firebase Authentication's authorized domains.
3. Five `VITE_FIREBASE_*` settings and `VITE_API_BASE_URL` have been configured on the CampusGigs Pages project, using its new Firebase Web App ID `1:730162931074:web:1a6c535fe1695d1a951b9b`.
4. The Worker is configured to verify Firebase tokens for the correct project. Firebase credentials remain private; only the public Web App configuration is in the frontend.

## Cloudflare Pages

The Cloudflare Pages API successfully connected **the existing empty `campusgigs` project** to the GitHub repository, without deleting it or changing its hostname. A successful `main` production deployment was then created directly from GitHub commit `d96816af0eec53bb3b9e5ba5e5c2f2e3a0a17439`.

- Build command: `npm run build -w @campusgigs/web`.
- Build output directory: `apps/web/dist`.
- GitHub source: `ose6519-dev/CampusGigs`.
- Production branch: `main`, automatic production deployment enabled.
- Preview branch deployments disabled by configuration.
- First successful production deployment ID: `512835a7-6106-4430-b928-1530d8edc2f1`.
- The earlier asset-upload API limitation is bypassed using the authenticated GitHub source build; no browser upload is needed.

The Worker is already deployed. Do not use `cf deploy --temporary-account`, which would target a different Cloudflare account. Future website changes should be committed to GitHub `main` and built by Cloudflare Pages.

## Verification checklist

- `npm run check` and `npm run build` succeed.
- All Phase A, B, C and D tests pass.
- API `GET /health` reports `{ "service": "campusgigs-api", "status": "ok", "phase": "D", "bookingsEnabled": true, "paymentsEnabled": false }`.
- Without a token, `GET /v1/me` returns `401`.
- The live homepage, category list, CampSell links and sign-in modal have been verified in the browser.
- A real signed-in Firebase user completing an API profile request still needs end-to-end verification.
- Sending a different UID in a profile update is rejected; callers cannot edit `role` or `account_status`.
- `PATCH /v1/me` persists a display name, campus, city or bio in **CampusGigs D1 only**.
- Buying/Providing switch saves the preference but only an approved provider can publish gigs.
- An application uploads a private image through `/v1/provider/evidence`; only the D1 admin may retrieve it.
- Admin approval creates a `provider_profiles` row; mere Firebase sign-in or `providing` mode does not.
- A verified provider can create a gig and attach up to four images. Admin removal hides it from public listing and image endpoints.
- A signed-in verified customer can request a gig once per request ID; the provider sees it under Incoming requests and can accept or decline, and the buyer can cancel.
- Booking history is private to the buyer/provider, and the admin can read service requests but cannot forge provider acceptance.
- The public marketplace has curved bottom navigation on phone and a smaller floating dock on desktop. The separate admin site intentionally has **no** bottom navigation and keeps its sidebar/hamburger.
- Email/password depends on Firebase Authentication → Sign-in method → Email/Password being enabled; frontend builds cannot activate the provider themselves. Verification is a link, not a numeric OTP.
- Paystack checkout, seller payouts and FacePay remain disabled until financial/security readiness is confirmed.
- Login on CampSell remains unchanged; no CampSell database or Worker is read or written.
- The CampusGigs website links to CampSell; reciprocal CampSell link will be prepared separately, with explicit approval before any CampSell change.

**Payment safety:** D1 accounting does not itself provide regulated escrow custody. Verify Paystack Starter account settlement/manual transfer capabilities and the legal basis for holding customer funds before enabling checkout.

Do not launch checkout automatically when a provider accepts a request. The request workflow does not move money or guarantee service completion.
