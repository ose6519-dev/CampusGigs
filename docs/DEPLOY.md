# CampusGigs Phase A — deploy and verify

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
- Pages: `campusgigs` → `https://campusgigs-97y.pages.dev` (**project created, first deployment pending**).
- Worker: `campusgigs-api` → `https://campusgigs-api.ose6519.workers.dev` (**deployed**).
- D1: `campusgigs-db` (`d6e582ae-173a-412d-a345-f516bd40f2f2`; first migration applied).
- R2: `campusgigs-media` (created, reserved for provider verification files in Phase B).

The above D1 and R2 already exist under the chosen account; **do not recreate or rename them**. Never bind a CampSell resource ID.

`apps/api/cloudflare.config.ts` already binds these CampusGigs resources and uses Firebase project ID `campsell-ea245` and origin `https://campusgigs-97y.pages.dev`. Keep `DB`, `MEDIA`, `FIREBASE_PROJECT_ID`, `WEB_ORIGINS` unchanged.

Migration `apps/api/migrations/0001_profiles.sql` has been applied **only** to `campusgigs-db`.

## Firebase login setup

1. The CampusGigs Firebase Web App is already registered under the same Firebase project as CampSell.
2. `campusgigs-97y.pages.dev` has been added to Firebase Authentication's authorized domains.
3. Six `VITE_FIREBASE_*` and `VITE_API_BASE_URL` environment settings have been configured on the CampusGigs Pages project, using its new Firebase Web App ID `1:730162931074:web:1a6c535fe1695d1a951b9b`.
4. The Worker is configured to verify Firebase tokens for the correct project. Firebase credentials remain private; only the public Web App configuration is in the frontend.

## Cloudflare Pages

The `campusgigs` Pages project already exists and has **no deployment**. It is a Direct Upload project, so a separate build is required. It cannot be converted to Git integration in place.

- Build command: `npm run build -w @campusgigs/web`.
- Build output directory: `apps/web/dist`.
- Prepared upload archive: `/workspace/shared/CampusGigs-phase-a.zip` (contains `_redirects`, `index.html`, and assets at the root).
- Production branch: `main`; choose **production**, not preview, for the upload.
- The Cloudflare plugin can configure Pages but the assets upload API currently returns `403 Authorization failed`, even when using the Pages upload JWT. The Cloudflare dashboard alternative reached a sign-in wall and secure sign-in was not completed. **Do not claim the website is live.**

The Worker is already deployed. Do not use `cf deploy --temporary-account`, which would target a different Cloudflare account. To finish the Pages upload, use the correct account's dashboard Direct Upload UI or configure local Wrangler with the correct account permissions.

## Verification checklist

- `npm run check` and `npm run build` succeed.
- All four Phase A tests pass.
- API `GET /health` reports `{ "service": "campusgigs-api", "status": "ok", "phase": "A" }`.
- Without a token, `GET /v1/me` returns `401`.
- The live authenticated UI-to-Worker flow is **not verified** until the Pages frontend is deployed.
- Sending a different UID in a profile update is rejected; callers cannot edit `role` or `account_status`.
- `PATCH /v1/me` persists a display name, campus, city or bio in **CampusGigs D1 only**.
- Buying/Providing switch saves the preference but does not unlock provider operations.
- Login on CampSell remains unchanged; no CampSell database or Worker is read or written.
- The CampusGigs website links to CampSell; reciprocal CampSell link will be prepared separately, with explicit approval before any CampSell change.

**Payment safety:** D1 accounting does not itself provide regulated escrow custody. Verify Paystack Starter account settlement/manual transfer capabilities and the legal basis for holding customer funds before enabling checkout.

Stop here and request user confirmation before Phase B.
