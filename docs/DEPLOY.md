# CampusGigs Phase A — deploy and verify

This project uses the new Cloudflare `cf` CLI and `cloudflare.config.ts` for the API, and Cloudflare Pages for the React frontend. **Do not change any existing CampSell project.**

## Before deploying (two user decisions required)

1. Select which connected Cloudflare account is for CampusGigs: `perelsa6519@gmail.com` or `perelsablacky@gmail.com`. The separate `ose6519@gmail.com` Cloudflare connection currently has no accessible Cloudflare account.
2. Provide the existing Firebase project's **public Web App configuration** (`apiKey`, `authDomain`, `projectId`, `appId`, optional `messagingSenderId`) and confirm `campsell.services@gmail.com` as initial admin, or give a different email.

## Resources — new names only

- GitHub repository: `ose6519-dev/CampusGigs` (exists).
- Pages: `campusgigs` → `https://campusgigs.pages.dev`.
- Worker: `campusgigs-api`.
- D1: `campusgigs-db`.
- R2: `campusgigs-media` (reserved for provider verification files in Phase B).

Create D1 and R2 in the selected Cloudflare account; never bind a CampSell resource ID. Use `cf cli search "create D1 database"` / `cf cli search "create R2 bucket"` and inspect the matching command's `--help` before running. Use a dry-run when the command offers it.

Update `apps/api/cloudflare.config.ts` only with the newly created CampusGigs resource IDs and actual Firebase project ID. Keep the binding names `DB`, `MEDIA`, `FIREBASE_PROJECT_ID`, `WEB_ORIGINS` unchanged.

Apply `apps/api/migrations/0001_profiles.sql` **only** to `campusgigs-db`. Confirm the target database ID and run D1 migrations with `cf d1 migrations apply` (verify `--help` flags before invoking). Record the resulting schema version in the deployment notes.

## Firebase login setup

1. Open your Firebase Console → existing CampSell Firebase project → Project settings → Your apps → Web App config.
2. Copy that app's public config to the build environment. Do **not** create another Firebase project if accounts must be shared.
3. Firebase Console → Authentication → Settings → Authorised domains: add `campusgigs.pages.dev`.
4. Ensure Google and email/password providers are enabled if you intend to offer both.
5. Populate `VITE_FIREBASE_*` and `VITE_API_BASE_URL` in the Pages build environment. Set `VITE_API_BASE_URL` to the **CampusGigs Worker** URL, never CampSell's API.
6. On the API Worker, set `FIREBASE_PROJECT_ID` to the exact Firebase project ID. When the value is still `SET_FIREBASE_PROJECT_ID`, protected endpoints fail closed.

## Cloudflare Pages

Create a **new** Pages project from `ose6519-dev/CampusGigs`.

- Root directory: repository root.
- Install command: `npm install`.
- Build command: `npm run build -w @campusgigs/web`.
- Build output directory: `apps/web/dist`.
- Production branch: `main`.
- Environment variables: copy the required `VITE_` keys from `apps/web/.env.example` with their real public values. Use the full deployed API URL for `VITE_API_BASE_URL`.

Do not attempt to deploy the API until Firebase ID and D1/R2 bindings have been correctly configured. `cf deploy --dry-run` can validate the Worker build locally. For actual deploys, the Cloudflare CLI must be signed in to the account chosen above.

## Verification checklist

- `npm run check` and `npm run build` succeed.
- API `GET /health` reports `{ "service": "campusgigs-api", "status": "ok", "phase": "A" }`.
- Without a token, `GET /v1/me` returns `401`.
- With a genuine Firebase ID token from the intended project, `GET /v1/me` returns the matching Firebase UID and a CampusGigs-only profile.
- Sending a different UID in a profile update is rejected; callers cannot edit `role` or `account_status`.
- `PATCH /v1/me` persists a display name, campus, city or bio in **CampusGigs D1 only**.
- Buying/Providing switch saves the preference but does not unlock provider operations.
- Login on CampSell remains unchanged; no CampSell database or Worker is read or written.
- The CampusGigs website links to CampSell; reciprocal CampSell link will be prepared separately, with explicit approval before any CampSell change.

Stop here and request user confirmation before Phase B.
