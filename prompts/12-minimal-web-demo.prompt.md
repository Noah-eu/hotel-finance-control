Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 12 goal:
Add the first minimal local web demo for the reconciliation flow.

Do:
- inspect current fixtures, reporting output, scripts, and repository shape first
- add the smallest practical browser-visible local demo that renders fixture-driven reconciliation output
- keep this step clearly scoped as a local demo layer, not a production-ready UI or app shell
- reuse existing pipeline and reporting logic; do not duplicate domain logic in the demo layer
- prefer simple, maintainable local tooling over framework expansion unless the repository state clearly calls for it
- add focused validation for the demo output assembly where appropriate

Definition of done:
- a tiny local/browser-visible demo exists and can show deterministic reconciliation/report data
- the implementation remains separate from core domain/reconciliation logic
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
