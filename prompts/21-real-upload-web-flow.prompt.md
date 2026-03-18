Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 21 goal:
Add the first real browser-visible upload flow for user-provided monthly source files.

Do:
- inspect the current web demo, monthly batch entrypoint, and review surfaces first
- add a minimal but usable browser upload flow for real user-provided files
- keep the implementation static/local with no fake backend layer
- keep user-visible application copy practical and in Czech, while internal code structure stays English
- preserve deterministic, traceable file handling so later ingestion can reuse the same path
- add focused validation for the upload flow behavior or output generation

Definition of done:
- a first browser-visible real upload flow exists and is usable locally
- the flow is prepared for later ingestion without introducing backend hacks
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message