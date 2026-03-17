Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 03 goal:
Define normalization layer contracts (types/interfaces only).

Do:
- inspect current `src/normalization` and domain exports
- add minimal contracts for normalization input/context/result/warnings
- keep explicit traceability from extracted records to normalized transactions
- export contracts from normalization index
- do not add parser/normalizer business logic yet

Definition of done:
- normalization contracts are type-safe and minimal
- scaffold remains runnable
- `npm test` and `npm run typecheck` pass
- commit and push with a clean message
