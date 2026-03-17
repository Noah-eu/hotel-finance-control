Work in the context of the Hotel Finance Reconciliation System described earlier.

Keep these invariants:
- build toward the final product, not a one-off fix
- preserve clean separation: import -> extraction -> normalization -> matching -> exceptions/review -> reporting
- all sources must flow through a shared normalized model
- matching must remain explainable, auditable, and extensible
- avoid local hacks and narrow fixes unless isolated as clean adapters or rules
- generalize changes beyond the current test case
- keep domain logic out of UI
- add or update tests for important behavior

Task:
--------------------------------------------------
