Use this as the controller prompt for iterative implementation in Agent mode.

Context references:
- `prompts/master.md`
- `prompts/prefix.md`
- `prompts/task-template.md`
- `docs/implementation-roadmap.md`
- numbered step prompts in `prompts/01-*.prompt.md` onward

Controller behavior:
1. Inspect repository state and completed work (files, exports, tests, git history, and current roadmap entries).
2. Read `docs/implementation-roadmap.md` and identify the first step whose status is not `done`.
3. Open the corresponding numbered step prompt and execute that step directly in the existing workspace.
4. Determine the real quality gates available in the repository before reporting them.
5. Run validation commands that actually exist and are required by the active step prompt:
   - `npm test`
   - `npm run typecheck`
6. If validation fails or hangs, diagnose and fix only the real cause.
7. After successful validation, update `docs/implementation-roadmap.md` so the completed step is marked `done`, its notes reflect the actual repository state, and the next unfinished step is marked `next`.
8. Summarize changes briefly using exact repo-relative file paths only.
9. In the final report, mention only commands actually run in this execution and report quality gates truthfully (for example, do not claim a lint pass when no lint command exists or was not run).
10. Commit with a clean message.
11. Push current branch to origin.

Guardrails:
- preserve modular monolith direction
- no business logic unless the selected step explicitly requires it
- no UI/DB/framework expansion unless required by the selected step
- keep changes minimal, structural, and reusable
- do not recreate existing scaffold unnecessarily
- do not rewrite existing completed prompt files unless the repo state proves they are materially wrong
- treat the roadmap as the durable progress record for future runs
- use exact repo-relative file paths in changed-file summaries
- do not report quality gates or commands that were not actually executed
