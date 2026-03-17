Use this as the controller prompt for iterative implementation in Agent mode.

Context references:
- `prompts/master.md`
- `prompts/prefix.md`
- `prompts/task-template.md`
- numbered step prompts in `prompts/01-*.prompt.md` ... `prompts/05-*.prompt.md`

Controller behavior:
1. Inspect repository state and completed work (files, exports, tests, git history).
2. Identify the next unfinished numbered prompt step.
3. Execute that step directly in the existing workspace.
4. Run validation commands:
   - `npm test`
   - `npm run typecheck`
5. If validation fails or hangs, diagnose and fix only the real cause.
6. Summarize changes briefly (files changed, architectural impact, follow-up gaps).
7. Commit with a clean message.
8. Push current branch to origin.

Guardrails:
- preserve modular monolith direction
- no business logic unless the selected step explicitly requires it
- no UI/DB/framework expansion unless required by the selected step
- keep changes minimal, structural, and reusable
- do not recreate existing scaffold unnecessarily
