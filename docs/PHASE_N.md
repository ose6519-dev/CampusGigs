# Phase N — Service delivery and provider availability

CampusGigs bookings now move through a verified, account-scoped workflow:

1. Buyer sends a free request; provider accepts or declines.
2. Provider marks accepted work **In progress**.
3. Provider submits a delivery note (**Ready for confirmation**).
4. Buyer checks the work and explicitly confirms receipt (**Completed**).
5. Buyer may submit one star rating (1–5) and an optional short review.

All progress changes use conditional database updates to prevent skipped or competing transitions. The existing `status` values are preserved for old bookings. Completion creates **no payment, payout, escrow, or legal settlement**. Submitted/completed work cannot be silently cancelled from the ordinary buyer cancel button.

Verified active providers can toggle whether to accept new bookings. Pausing does not prevent completion of existing accepted work. Public gig details show availability; private provider IDs and the booking idempotency key are not disclosed in detail responses.

The public provider profile displays an average rating and number of reviews only from completed, buyer-confirmed bookings. Written feedback stays private to the buyer and provider, rather than appearing publicly without moderation.

## Routes

- `GET|PUT /v1/provider/availability` — account-scoped toggle, active work count.
- `POST /v1/bookings/:id/progress` — `{action:'start'|'submit'|'confirm',note?:string}`. Submission requires a 10–500 character note.
- `POST /v1/bookings/:id/review` — `{rating:1..5,comment?:string}`.
- Existing booking detail, list and admin list now expose progress and review metadata.

## Release procedure

1. Export/backup the production D1 database.
2. Apply `apps/api/migrations/0013_phase_n_booking_progress.sql` to the existing database.
3. Build and deploy the Worker with unchanged D1, R2 and Firebase bindings.
4. Deploy both production Pages projects from the new `main` commit and verify the API health returns phase `N` with payments disabled.

The migration is additive: no existing booking or event history is deleted. Automated tests cover availability, blocked requests, ownership, duplicate progress actions, confirmation, single reviews, and input validation.
