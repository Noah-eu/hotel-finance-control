Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 09 goal:
Add the first minimal reporting/export layer on top of reconciliation output.

Do:
- inspect current `src/reporting`, `src/reconciliation`, and existing docs first
- add minimal reporting/export contracts and a small service or formatter that consumes reconciliation results
- keep output deterministic, explainable, and easy to extend
- include simple summary/report structures only; do not add UI, persistence, or file generation complexity unless clearly needed
- add focused tests for the first reporting/export behavior

Definition of done:
- reporting/export has a real module entrypoint beyond the placeholder
- the first report shape compiles and is covered by tests
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
