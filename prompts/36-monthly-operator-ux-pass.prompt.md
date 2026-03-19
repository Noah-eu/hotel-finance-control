Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 36 goal:
Improve the operator-facing monthly workflow for real usage while preserving traceability, auditability, and the shared modular architecture.

Do:
- inspect the current visible browser upload, monthly-run, review, and export flow from an operator monthly-control perspective first
- improve operator-facing workflow clarity, sequencing, summaries, and review/export affordances in the existing browser surfaces without moving business logic into the UI
- keep user-facing app copy in Czech and maintain the existing truthful reporting and repo-relative workflow conventions
- preserve explainable traceability from uploaded files through review items, report rows, and exports
- keep implementation inside the shared modular monolith structure; do not add local hacks, fake backend behavior, or a parallel UI-specific reconciliation layer
- add focused tests for any changed visible browser workflow behavior or shared rendering helpers

Definition of done:
- the browser monthly workflow is more practical for a real operator while preserving auditable traceability
- shared business logic remains outside the UI and the architecture stays consistent
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
