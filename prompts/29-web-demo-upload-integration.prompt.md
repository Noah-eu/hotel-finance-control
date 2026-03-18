Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 29 goal:
Unify the currently visible browser demo with the real uploaded monthly run already built in `src/upload-web`.

Do:
- inspect `src/web-demo`, `src/upload-web`, and any current browser-visible run entrypoints first
- make the visible browser demo surface reflect the real uploaded monthly processing flow rather than a separate demo-fixture path
- reuse the existing shared uploaded monthly run, review, reporting, and export modules instead of creating a parallel app flow
- keep the implementation local/static and browser-visible without adding a backend
- preserve deterministic, explainable traceability from uploaded source files through review/report/export outputs
- add focused tests for the unified browser-visible flow and any changed entrypoint behavior

Definition of done:
- the browser-visible demo entrypoint is unified with the real uploaded monthly run flow
- no demo-fixture fallback remains in the main visible browser path unless clearly kept as an auxiliary/dev-only path
- the flow remains built on shared modules only
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
