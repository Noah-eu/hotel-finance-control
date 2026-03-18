Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 11 goal:
Add the first local CLI demo for the reconciliation pipeline.

Do:
- inspect current fixture data, reconciliation entrypoints, reporting module, and package scripts first
- add a local command or script that loads deterministic fixture data, runs the reconciliation pipeline, builds a report, and prints a readable console summary
- keep the CLI demo simple, local, deterministic, and easy to run from the existing workspace
- avoid introducing a full command framework unless clearly justified by the current project shape
- add focused tests around the demo formatting or output assembly where useful
- update package scripts or minimal documentation only if needed for local execution

Definition of done:
- a local command exists that runs the pipeline on fixture data and prints a readable report
- the implementation reuses existing reconciliation and reporting modules instead of duplicating logic
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
