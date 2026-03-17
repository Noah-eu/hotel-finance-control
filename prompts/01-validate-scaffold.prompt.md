Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 01 goal:
Validate the current scaffold without recreating it.

Do:
- inspect current TypeScript scaffold files
- run `npm install`
- run `npm test`
- run `npm run typecheck`
- fix only real breakages or inconsistencies
- keep changes minimal and structural

Definition of done:
- install/test/typecheck pass
- no unnecessary scaffold rewrites
- summary lists inspected files and any actual fixes
- commit and push with a clean message
