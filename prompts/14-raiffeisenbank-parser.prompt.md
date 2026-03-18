Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 14 goal:
Add the first deterministic Raiffeisenbank parser.

Do:
- inspect current real-input fixtures, extraction boundaries, domain contracts, and normalization expectations first
- add deterministic extraction for Raiffeisenbank statement inputs into `ExtractedRecord` outputs
- cover flows relevant to Booking, Airbnb, Comgate, hotel expenses, payroll, and suspicious/private spending markers
- preserve traceability to source rows/documents and keep parsing explainable and auditable
- avoid UI/DB work and keep source-specific logic isolated in the parser layer

Definition of done:
- a deterministic Raiffeisenbank parser exists and is covered by focused tests
- outputs fit the shared extraction/normalization flow cleanly
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
