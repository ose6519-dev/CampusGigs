# CampusGigs Phase K — institution-aware academic choices

Production scope: **CampusGigs only**. No new payment or billing features; `paymentsEnabled` remains `false`.

## Institution and state picker

- Search Nigerian institutions by official name or acronym; whole-word acronyms rank before broad matches.
- Searching by institution alone can locate schools nationwide and fill in the state automatically.
- Manually choosing a state limits institution suggestions to that state; selecting a school resets the manual filter.
- The server still rejects a school ID that does not belong to the submitted state.

## Faculty and department selection

- The public academic endpoint is `GET /v1/public/institutions/:id/academics` (no personal data).
- Verified, institution-specific cascading faculty → department lists have been reviewed against published undergraduate material for:
  - **Niger Delta University (NDU)**: <https://www.ndu.edu.ng/undergraduate>
  - **University of Lagos (UNILAG)**: <https://unilag.edu.ng/when-the-future-calls-unilag-answers-with-new-faculties-and-a-new-vision/>
- Those campus-specific pairs are validated on the server on both onboarding and changes in **Profile → Campus & privacy**. Cross-faculty choices are rejected.
- For other institutions, members see labelled nationwide suggestions and can enter their campus's official terms. These are *not* presented as verified catalogues. Existing self-reported academic details remain intact until edited; switching schools cannot carry an old faculty/department pair into another verified campus.
- Academic details remain optional. No forced migration of existing member profiles is necessary.

## Future expansion

Adding an officially verified campus requires reviewing its current faculty and department catalogue, linking the official source, and extending `apps/api/src/academicCatalog.ts`. Avoid auto-inventing faculty assignments or implying a nationwide roster is institution-specific.

Verification: `npm run test -w @campusgigs/api`, `npm run check`, `npm run build`, production API health and public academic endpoint checks.
