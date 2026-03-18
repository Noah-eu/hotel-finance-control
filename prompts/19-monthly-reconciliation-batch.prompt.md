Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 19 goal:
Add the first monthly reconciliation batch entry point over real imported files.

Do:
- inspect current import, extraction, normalization, reconciliation, reporting, and fixture/parser surfaces first
- add one end-to-end monthly processing entry point that runs imported source files through extraction, normalization, matching, exceptions, and reporting
- keep orchestration deterministic, traceable, and explainable
- avoid UI/database expansion in this step; focus on reusable batch application flow
- add focused tests for the monthly batch path using deterministic inputs

Definition of done:
- a monthly reconciliation batch entry point exists and is covered by focused tests
- the flow reuses shared modules instead of duplicating parser or reconciliation logic
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
