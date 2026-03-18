Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 22 goal:
Connect uploaded files into the existing monthly batch and extraction pipeline.

Do:
- inspect the upload flow, extraction module, and monthly batch entrypoint first
- connect uploaded files into the deterministic parser-routing and batch orchestration flow
- preserve source-document traceability from uploaded file through extracted records and reconciliation output
- keep one unified normalization model and avoid parallel ingestion paths
- add focused validation using representative uploaded-file inputs

Definition of done:
- uploaded files can enter the existing extraction and monthly batch pipeline
- the flow reuses shared modules rather than duplicating orchestration logic
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message