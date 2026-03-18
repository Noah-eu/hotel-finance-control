Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 30 goal:
Clean up Czech user-facing copy across the visible upload, review, monthly-run, and export surfaces.

Do:
- inspect current user-facing copy in `src/upload-web`, `src/web-demo`, and any related browser-visible output paths first
- improve clarity, consistency, and practical wording for Czech operators using the system during monthly finance control
- keep internal code, types, symbols, and file names in English
- avoid mixing business logic changes into this copy pass unless a directly related wording/label issue requires a small structural cleanup
- add or update focused tests if visible labels, titles, or structured browser output assertions change

Definition of done:
- Czech browser-visible copy is more consistent and practical across upload/review/export surfaces
- no internal symbol renaming or architecture drift is introduced
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
