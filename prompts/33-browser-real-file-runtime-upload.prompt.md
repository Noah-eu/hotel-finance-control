Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 33 goal:
Move the current generated/uploaded browser flow toward real browser runtime handling of user-selected files while staying inside the existing shared architecture.

Do:
- inspect the current `src/upload-web`, `src/web-demo`, and shared monthly-batch preparation path first
- replace the remaining generated/demo-style file assumptions in the visible browser flow with real runtime handling of files selected by the operator where feasible in the current local/browser-only setup
- keep the flow built on the existing shared import -> extraction -> normalization -> matching -> exceptions/review -> reporting/export path only
- preserve deterministic traceability from each selected browser file into prepared source documents, review outputs, and exports
- keep user-facing browser copy practical Czech, while internal code/types/files remain English
- avoid adding a backend, fake persistence layer, or parallel upload pipeline
- add focused tests for the runtime browser file-handling path and any changed shared preparation/reporting behavior

Definition of done:
- the visible browser flow handles real user-selected files at runtime where feasible within the current local architecture
- the browser path still reuses shared monthly-batch, review, reporting, and export modules without parallel logic
- traceability from selected files into downstream outputs remains explicit and auditable
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
