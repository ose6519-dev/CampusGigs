# CampusGigs Phase J — saved searches, handles, ranked discovery

Scope is CampusGigs exclusively. Billing stays disabled.

- Unique, case-insensitive C-Gigs usernames (`@username`) are generated for existing and new Firebase-backed accounts. Members can choose their own from **Profile → Campus & privacy**. Reserved names and invalid characters are rejected; concurrent claims are protected by D1 unique index.
- Public usernames appear only on the existing publicly discoverable listings. Ordinary members remain private until opt-in. Public search never returns Firebase UIDs or email addresses.
- `Find Folks` and public gigs support username matching, including the `@` prefix. Exact matches and prefix matches rank ahead of broad text matches while state and institution restrictions are enforced first.
- Search history is saved on **explicit search submission**, not on every keystroke. Signed-in verified members get private per-account D1 history, while guests get local device-only history. Maximum 20 per account/device, with individual removal and clear-per-surface actions.
- Re-running a search from a different state or institution must pass the existing off-campus warning. Search history does not silently change account campus settings.
- API: `PATCH /v1/me/username`, `GET|POST|DELETE /v1/me/search-history`, `DELETE /v1/me/search-history/:uuid`; allowed `?kind=gigs|people` on clear.

Release sequence: back up CampusGigs D1, run `0010_phase_j_search.sql`, deploy Worker with existing D1/R2/Firebase/CORS bindings, release `main` to both Cloudflare Pages projects, verify public search and API health.

This is deterministic relevance ranking, not behavioural profiling or a machine-learning recommendation system. Institution faculty/department catalogue verification remains a separate priority.
