# CampusGigs Admin hosting — Phase B

The admin console is hosted separately at `https://campusgigsadmin-web.pages.dev` on a new Cloudflare Pages project **`campusgigsadmin-web`**. It is built from the same independent `ose6519-dev/CampusGigs` GitHub repository, from `apps/admin`, while the public CampusGigs site continues from `apps/web`.

## Authentication and authorization

- The admin page uses the same Firebase Auth project `campsell-ea245` as CampusGigs and CampSell, reusing the CampusGigs public Firebase Web App configuration.
- Every admin API request includes the Firebase ID token, which the **CampusGigs Worker** verifies against Google signing certificates.
- Every `/v1/admin/*` endpoint checks the verified Firebase UID's role in CampusGigs D1 `platform_roles`, requires `role='admin'`, a verified email, and an active profile.
- Displaying an admin screen in the frontend is never sufficient authorization. A regular member's valid Firebase login receives HTTP 403 from admin endpoints.
- No admin signup button; administrator roles must be granted through an explicitly authorized, audited server-side process.
- No CampSell database, Worker, admin hosting, or role table is referenced.

## Admin features

- Signed-in role gate and access-denied screen.
- Responsive desktop/mobile sidebar dashboard.
- Counts of members, new accounts, buying/providing preferences, and suspended accounts.
- Recent members, member directory, and search (name, Firebase UID, email, city, campus).
- Provider applications list with filters/search, protected R2 ID preview, approve/request-changes/reject actions, review notes and audit events.
- Gig listings with provider details, search, moderation reasons, remove/restore actions and moderation audit events.
- Booking, disputes and payouts remain **disabled future-phase sections**. No financial operations exist.
- Member directory is read-only. Pagination is bounded at 25 per request, and SQLite LIKE wildcards are escaped.

## Cloudflare Pages build configuration

```
Project: campusgigsadmin-web
Source: ose6519-dev/CampusGigs
Production branch: main
Root directory: /
Build command: npm run build -w @campusgigs/admin
Output directory: apps/admin/dist
```

The Pages project sets five `VITE_FIREBASE_*` public Firebase Web App values and `VITE_API_BASE_URL=https://campusgigs-api.ose6519.workers.dev` in the production environment. The admin hostname must be listed in Firebase Authentication's **Authorized domains** before Google popup login will work. The Worker `WEB_ORIGINS` binding includes `https://campusgigsadmin-web.pages.dev`.

## Verification

Run from repository root:

```bash
npm install
npm run check
npm run test -w @campusgigs/api
npm run build
```

Then test with an approved administrator UID: `GET /v1/admin/overview` returns 200; with a verified non-admin Firebase UID it returns 403; with no valid JWT it returns 401. Never use a client-side `isAdmin` flag as an authorization mechanism.
