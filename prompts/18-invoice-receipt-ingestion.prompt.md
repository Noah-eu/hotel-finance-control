Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 18 goal:
Prepare deterministic invoice and receipt ingestion.

Do:
- inspect current import/extraction boundaries, domain contracts, and exception needs first
- add deterministic document ingestion contracts and the first parser path for invoices and receipts
- preserve traceability from source document to extracted output to downstream normalization/matching
- keep AI/OCR out of the primary path; if mentioned, treat it only as a future fallback extension point
- add focused tests for the deterministic ingestion behavior

Definition of done:
- deterministic invoice/receipt ingestion contracts and first parser path exist
- outputs fit the shared orchestration flow without document-specific hacks in UI or matching
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
