Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 15 goal:
Add the first deterministic Fio parser.

Do:
- inspect current fixtures, extraction contracts, and reconciliation direction first
- add deterministic extraction for Fio statement inputs into `ExtractedRecord` outputs
- focus on Expedia terminal payment flows and related bank transaction context
- preserve traceability and keep the parser isolated from normalization, matching, and UI logic
- add focused parser tests using the shared real-input fixture approach

Definition of done:
- a deterministic Fio parser exists and is covered by tests
- outputs are compatible with the shared normalization model and downstream orchestration
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
