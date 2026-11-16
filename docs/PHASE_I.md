# Phase I — Find Folks member discovery and privacy

- Ordinary members are **not** included in public search by default. They may opt in using Profile → Campus & privacy → Find Folks privacy.
- Approved active providers remain searchable as they were previously. Providers can now explicitly hide from Find Folks without removing their public services.
- A discoverable member exposes only the display name, optional public avatar, bio, general city/campus, online status if separately enabled, and follower count. Firebase UID, email, exact coordinates, and academic fields are excluded.
- The public directory merges approved providers with consenting members and honours state and campus filters; switching outside the confirmed area still requires a warning.
- New member follows are idempotent, reject self-follow, and create account-scoped in-app notifications. Existing provider follows and booking notifications remain intact.
- Hiding from Find Folks blocks new member follows and hides that member's public profile, without changing account status or past records. Their public ID remains stable if they opt in again.
- Previous `/v1/public/providers` and provider follow URLs remain available for service-linked flows.
- Migration: `apps/api/migrations/0009_phase_i_member_discovery.sql`.
- Payments and institutional billing remain disabled.

Verification: `npm run test -w @campusgigs/api`, `npm run check`, and `npm run build`.

Per-school faculty/department lists still require authoritative data for each institution. Do not label the current nationwide suggestions as institution-verified.
