Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 24 goal:
Add practical CSV/XLSX export for real monthly reconciliation work.

Do:
- inspect the reporting output, review workflow data, and browser-visible surfaces first
- add practical CSV and XLSX export for reconciliation outputs and review items
- keep exports explainable, auditable, and aligned to the shared normalized/review model
- avoid one-off UI-only formatting hacks; keep export shaping reusable
- add focused validation for exported structures and file contents

Definition of done:
- CSV/XLSX export exists for practical monthly reconciliation and review use
- exports are built from shared reporting/review data structures
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message