Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 31 goal:
Reduce fragile review categorization heuristics by preferring explicit structured rule metadata where appropriate.

Do:
- inspect current review bucketing logic, exception metadata, and report/review tests first
- replace or reduce free-text inference for suspicious and missing-document sections where explicit `ruleCode` or other structured fields already exist or can be cleanly extended
- preserve explainability, auditability, and traceability through the shared exception/review/report path
- avoid UI-only hacks; keep the logic in shared workflow modules
- add focused positive and negative tests for the hardened bucketing behavior

Definition of done:
- review bucketing relies more on explicit structured metadata and less on fragile text matching
- suspicious and missing-document items still surface correctly in the shared review/report flow
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
