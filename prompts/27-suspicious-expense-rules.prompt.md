Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 27 goal:
Add the first explicit suspicious/private expense and missing-document review rules.

Do:
- inspect current exceptions, review outputs, expense flows, and supporting-document expectations first
- add the first explicit deterministic rules for suspicious/private expenses and missing supporting documents
- keep rule outputs explainable, auditable, and reusable by review/reporting flows
- avoid burying business rules inside UI rendering or ad hoc parser conditions
- add focused tests for the new review-rule behavior

Definition of done:
- suspicious/private expense and missing-document review rules exist and are explainable
- the rules feed shared exception/review outputs without local hacks
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message