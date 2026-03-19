Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 35 goal:
Improve support-document linking between bank outflows and invoice/receipt evidence through the shared normalization and reconciliation path only.

Do:
- inspect the existing document ingestion, normalized transaction linking, exception generation, and review/report behavior for expense-support coverage first
- harden how invoice and receipt evidence links to expense-like bank outflows using shared structured fields, deterministic linking rules, and auditable reconciliation metadata
- reduce false missing-document outcomes when usable document evidence already exists in the monthly batch, without hiding genuinely unsupported expenses
- keep suspicious/private-expense handling explainable and separate from legitimate documented outflows
- preserve traceability from source document -> extracted record -> normalized transaction -> exception/review/report outputs
- avoid UI-only fixes or manual one-off shortcuts; keep the logic inside shared ingestion/reconciliation/review modules
- add focused tests for positive and negative document-linking/support-coverage cases

Definition of done:
- support-document linking for expense outflows is more reliable and deterministic in the shared workflow
- missing-document and documented-expense outcomes remain explainable, auditable, and traceable
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
