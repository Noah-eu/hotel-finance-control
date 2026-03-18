Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 28 goal:
Add one real end-to-end monthly processing flow using uploaded source files.

Do:
- inspect the upload flow, uploaded-file ingestion path, monthly batch entrypoint, review workflow, and export surfaces first
- add one real end-to-end monthly processing flow that starts with uploaded user files instead of demo fixtures
- keep orchestration deterministic, traceable, and explainable end to end
- keep one unified normalization model and reuse the existing shared modules throughout
- add focused validation for the real uploaded-file monthly run flow

Definition of done:
- one real end-to-end monthly processing flow exists for uploaded source files
- the flow reuses shared extraction, normalization, matching, reporting, and review infrastructure
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message