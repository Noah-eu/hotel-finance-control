Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 02 goal:
Add initial core domain types and shared vocabulary foundations.

Do:
- inspect existing domain files first
- create/update minimal domain types for traceability and explainable matching
- keep money in minor units
- keep domain generic and future-proof (no source-specific hacks)
- export new types from domain index files

Definition of done:
- domain types compile
- `npm test` and `npm run typecheck` pass
- summary includes changed files and open decisions
- commit and push with a clean message
