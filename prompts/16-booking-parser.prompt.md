Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 16 goal:
Add deterministic Booking payout/export ingestion.

Do:
- inspect current fixtures, extraction boundaries, normalization expectations, and matching needs first
- add deterministic Booking payout/export parsing into `ExtractedRecord` outputs
- preserve fields needed for explainable reconciliation such as payout references, dates, amounts, reservation references, and source traceability
- keep Booking-specific logic isolated in parser/extraction modules
- add focused tests using the real-input fixtures introduced earlier

Definition of done:
- a deterministic Booking parser exists and is covered by tests
- extracted outputs fit the shared normalization path without special UI/report hacks
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
