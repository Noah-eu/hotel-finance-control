Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 10 goal:
Add deterministic demo fixtures for the existing reconciliation pipeline.

Do:
- inspect current `src/domain`, `src/reconciliation`, `src/reporting`, and test structure first
- add fixture data as deterministic sample `ExtractedRecord[]` inputs for at least one matched and one exceptional reconciliation case
- add expected reconciliation and reporting outputs derived from those fixtures
- keep fixtures tiny, readable, and reusable across tests, demos, and local tooling
- avoid source-specific hacks beyond what the current deterministic pipeline already supports
- add focused tests or fixture validation where appropriate

Definition of done:
- fixture inputs and expected outputs exist in a reusable location inside the workspace
- fixtures represent deterministic pipeline behavior, not ad hoc snapshots
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
