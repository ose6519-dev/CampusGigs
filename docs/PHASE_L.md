# CampusGigs Phase L — personalised campus discovery

The home page now fetches `GET /v1/me/recommended-gigs` for a signed-in member with a saved state. This is a deterministic, account-specific recommendation feed; it does not use behavioural profiling or machine learning.

Ranking priorities:

1. Active services matching one of up to five chosen signup interests.
2. Active services from a provider the member follows.
3. Most recently published active services in that same location.

Safety:

- The endpoint never accepts client-controlled state, institution or category filters; member location and interests are read from verified Firebase identity and Cloudflare D1.
- A saved institution restricts gigs to that exact institution **and state**. Without an institution, the selected state still applies. Without a saved state, the result is empty rather than quietly expanding nationwide.
- Only active gigs of active, approved providers are eligible. Rejected, draft, paused and cross-campus work is excluded.
- Results show normal public gig information; no member private identifiers are exposed. The endpoint returns `paymentsEnabled: false`.
- Signed-out users continue to see the existing public local feed. If recommendations cannot load, the member's visible home page falls back to the same strictly scoped public listings.

The member homepage uses the short heading **Skills for you.** and retains the Browse all gigs action. Tests cover ranking, interest validation, follower preference, strict campus scope and missing-location behaviour.
