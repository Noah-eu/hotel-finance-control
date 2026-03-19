Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 34 goal:
Add practical deterministic source-system coverage for Expedia, Airbnb, and Previo through the shared extraction, normalization, and reconciliation flow.

Do:
- inspect the existing parser, normalizer, matching, and representative fixture coverage for current source systems first
- add representative real-input fixtures and deterministic parser paths for Expedia, Airbnb, and Previo source formats that are next most useful for the monthly hotel workflow
- route the new sources through the existing shared extraction -> normalization -> matching/reconciliation path rather than through source-specific UI logic
- preserve explainability, auditability, and source-document traceability for all new records
- add or extend matching/report/review coverage only where the new sources require shared deterministic behavior
- add focused tests for parser outputs, normalized transactions, and any new deterministic matching or review behavior introduced by these source systems

Definition of done:
- representative deterministic support exists for Expedia, Airbnb, and Previo through the shared modules
- new source-system records remain traceable from source document to extracted and normalized outputs
- no parallel source-specific browser/business-logic flow is introduced
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
