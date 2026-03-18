Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 13 goal:
Add representative deterministic real-input fixtures for the first real hotel-finance sources.

Do:
- inspect current demo fixtures, domain contracts, extraction/normalization flow, and docs first
- add deterministic sample inputs modeled after real hotel-finance source formats (bank statements, OTA exports, payment gateway exports, invoice/receipt inputs)
- include expected extracted-record outputs and, where useful, expected normalized outputs
- keep fixtures compact, explainable, auditable, and reusable across parser tests and end-to-end flows
- avoid fake business shortcuts; model realistic source shapes without adding parser logic yet

Definition of done:
- reusable real-input fixtures exist in the workspace
- fixtures cover representative hotel-finance sources and expected deterministic outputs
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
