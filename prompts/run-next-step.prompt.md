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
4. Run validation commands:
   - `npm test`
   - `npm run typecheck`
5. If validation fails or hangs, diagnose and fix only the real cause.
6. After successful validation, update `docs/implementation-roadmap.md` so the completed step is marked `done`, its notes reflect the actual repository state, and the next unfinished step is marked `next`.
7. Summarize changes briefly (files changed, architectural impact, follow-up gaps).
8. Commit with a clean message.
9. Push current branch to origin.

Guardrails:
- preserve modular monolith direction
- no business logic unless the selected step explicitly requires it
- no UI/DB/framework expansion unless required by the selected step
- keep changes minimal, structural, and reusable
- do not recreate existing scaffold unnecessarily
- do not rewrite existing completed prompt files unless the repo state proves they are materially wrong
- treat the roadmap as the durable progress record for future runs
