Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 04 goal:
Define matching layer contracts (types/interfaces only).

Do:
- inspect current `src/matching` and domain exports
- add minimal contracts for matching input/context/candidates/explanations/results
- keep explainability first-class (reason, confidence, rule key, signals)
- export contracts from matching index
- do not implement matching algorithms yet

Definition of done:
- matching contracts compile and are reusable
- `npm test` and `npm run typecheck` pass
- summary includes design choices and gaps
- commit and push with a clean message
