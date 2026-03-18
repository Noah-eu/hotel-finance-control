Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 07 goal:
Add the baseline exceptions/review layer on top of normalization and matching outputs.

Do:
- inspect current `src/exceptions`, `src/domain`, and matching outputs first
- add minimal exception detection contracts or implementation needed for baseline review cases
- preserve explainability and traceability back to related transactions, extracted records, and source documents
- keep the implementation deterministic and reusable
- add focused tests for baseline exception creation

Definition of done:
- baseline exception detection is available from the exceptions module
- exception cases include type, severity, explanation, related records, and next-step guidance
- `npm test` and `npm run typecheck` pass
- commit and push with a clean message
