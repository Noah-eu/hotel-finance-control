Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 23 goal:
Add the first real browser review UI for monthly reconciliation outcomes.

Do:
- inspect the review module, monthly batch output, and browser/web surfaces first
- add a practical browser review screen for matched, unmatched, suspicious, and missing-document items
- keep domain logic in shared modules and keep the browser layer focused on presentation/workflow
- keep user-visible application copy practical and in Czech, while internal code structure stays English
- add focused validation for the rendered review data flow

Definition of done:
- a first browser review UI exists for real reconciliation outputs
- matched, unmatched, suspicious, and missing-document items are visible in one usable review surface
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message