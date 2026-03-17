Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 05 goal:
Add first deterministic normalizer stubs using the established contracts.

Do:
- inspect current normalization contracts and module structure
- add minimal normalizer implementations/stubs with no business-specific rules
- keep deterministic parsing-first design and explicit traceability
- avoid source-specific hacks; keep adapters/rules cleanly isolated

Definition of done:
- first normalizer stubs are wired and compile
- no UI/DB/framework complexity added
- tests/typecheck pass
- commit and push with a clean message
