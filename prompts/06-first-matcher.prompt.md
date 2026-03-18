Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 06 goal:
Add the first deterministic matcher on top of the existing normalization and matching contracts.

Do:
- inspect current `src/matching`, `src/normalization`, and relevant tests first
- add a minimal deterministic matcher for the first real reconciliation path
- keep matching explainable with reason, confidence, rule key, and signals
- prefer deterministic one-to-one logic first, without broad fuzzy matching yet
- add focused tests for matched and unmatched outcomes

Definition of done:
- the first matcher is wired through the matching module entrypoint
- traceable deterministic behavior is covered by tests
- `npm test` and `npm run typecheck` pass
- commit and push with a clean message
