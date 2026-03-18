Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 17 goal:
Add deterministic Comgate ingestion.

Do:
- inspect current fixtures, extraction boundaries, and hotel payment flow requirements first
- add deterministic Comgate parsing into `ExtractedRecord` outputs
- cover direct website reservations and parking payment flows explicitly
- preserve traceability from source data through extracted outputs and keep logic parser-local
- add focused tests with deterministic fixtures and clear expected outputs

Definition of done:
- a deterministic Comgate parser exists and is covered by tests
- extracted outputs are reusable by the shared normalization and reconciliation flow
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
