Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 20 goal:
Add the first real review-screen workflow baseline.

Do:
- inspect current reconciliation results, exceptions, reporting output, and demo UI surfaces first
- add the first practical review workflow layer for matched, unmatched, suspicious, and missing-document items
- keep the scope small and implementation-oriented: enough structure to review real reconciliation outputs without building a full production app
- keep domain logic in shared modules, not in the UI layer
- add focused validation for the review-screen data flow or rendering behavior

Definition of done:
- a first review-screen baseline exists for real reconciliation outputs
- matched, unmatched, suspicious, and missing-document items are visible through a deterministic review workflow surface
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
