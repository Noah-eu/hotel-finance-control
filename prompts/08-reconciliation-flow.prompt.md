Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 08 goal:
Add the first end-to-end reconciliation orchestration flow.

Do:
- inspect current normalization, matching, exceptions, and top-level exports first
- add a reconciliation service or pipeline entrypoint under `src`
- accept `ExtractedRecord[]` as input
- run normalization, matching, and exception generation in sequence
- return a structured reconciliation result with normalized transactions, matching output, exception cases, and simple summary counts
- handle unsupported extracted record kinds cleanly without crashing
- add focused end-to-end tests

Definition of done:
- the reconciliation flow is exported and reusable
- summary counts and traceability are present in the result
- `npm test` and `npm run typecheck` pass
- commit and push with a clean message
