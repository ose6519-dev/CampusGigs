# Phase H — School-first discovery and Find Folks

## Public experience

- Search the recognised Nigerian institution directory by school name or acronym without first choosing a state during welcome setup and under Profile → Campus & privacy. Selecting a result automatically supplies its canonical state and name.
- Member faculty/department are optional, searchable and self-reported. Nationwide example suggestions are provided; **they are not a verified school-by-school faculty or department directory**. Students can type the official names used by their institution.
- Under Find Folks, verified providers appear in small profile rows with image/initial, name, campus/state, green online indicator when opted in and active, and an inline Follow/Following button.
- Existing cross-campus search warnings and per-state/institution scoping stay in place. Public profile discovery does not publish private Firebase UIDs or self-reported academic details.

## Data and behavior

- Migration `0008_phase_h_academics.sql` adds optional `faculty` and `department` fields to `profiles` without changing existing onboarding status.
- `PATCH /v1/me/onboarding` and `PATCH /v1/me/location` accept both academic fields together, validate lengths and reject markup. Selecting a different school in the UI clears the former academic selection.
- Follow/unfollow uses the existing authenticated, idempotent `PUT`/`DELETE /v1/me/follows/:publicId` APIs; no new provider or billing privileges are introduced.
- Payments and automatic institutional billing remain disabled; no school charges were configured.

## Checks

- `npm run test -w @campusgigs/api`
- `npm run check`
- `npm run build`

## Known limitation

The 763 institutions in the canonical directory do not include an authenticated list of every faculty and department. Adding per-school validated academic choices requires maintained official school catalogs or an admin verification workflow. Until then, academic names are self-reported and not treated as verified campus affiliation.
