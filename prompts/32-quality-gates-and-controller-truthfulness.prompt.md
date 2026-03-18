Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 32 goal:
Make quality gates and controller reporting truthful and repo-relative.

Do:
- inspect current package scripts, repo docs, controller prompt expectations, and recent reporting language first
- determine whether the repository has a real lint gate; if not, either add one cleanly or remove any fake lint expectation from workflow/reporting surfaces
- ensure quality-gate reporting reflects only checks that are actually run and uses repo-relative file references in user-facing summaries where appropriate
- keep the workflow accurate, reproducible, and aligned with the real repository state
- add or update focused tests/docs checks only where directly useful for maintaining truthful controller behavior

Definition of done:
- quality-gate expectations and controller reporting are truthful and repo-relative
- there is no fake lint claim remaining in the active workflow if no real lint gate exists
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message
