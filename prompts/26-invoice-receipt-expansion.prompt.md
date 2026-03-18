Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 26 goal:
Expand deterministic invoice and receipt ingestion coverage.

Do:
- inspect the current document-ingestion contracts, invoice parser path, review needs, and fixtures first
- extend deterministic document ingestion to cover more invoice and receipt cases before any OCR/AI fallback
- keep one shared extracted/normalized model and preserve source-document traceability throughout
- treat OCR/AI only as a future fallback extension point, not the primary solution
- add focused tests for the expanded deterministic document coverage

Definition of done:
- deterministic document ingestion covers more invoice and receipt scenarios
- the expanded path remains compatible with the shared orchestration flow
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message