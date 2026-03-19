# Hotel Finance Reconciliation System

Initial project workspace for a modular monolith focused on monthly hotel finance control.

## Current state
This repository currently contains:
- project-wide Copilot instructions
- reusable prompt files
- architecture/domain/matching docs
- initial module folder structure

## Planned module areas
- import
- extraction
- normalization
- matching
- exceptions
- reporting
- domain
- shared

## Prompt workflow (Copilot Agent)
Use the prompt system in `prompts/` to run implementation in small, consistent steps:

- Base context and invariants:
	- `prompts/master.md`
	- `prompts/prefix.md`
	- `prompts/task-template.md`
- Step prompts:
	- `prompts/01-validate-scaffold.prompt.md`
	- `prompts/02-domain-types.prompt.md`
	- `prompts/03-normalization-contracts.prompt.md`
	- `prompts/04-matching-contracts.prompt.md`
	- `prompts/05-first-normalizers.prompt.md`
- Controller prompt:
	- `prompts/run-next-step.prompt.md`

Recommended usage:
1. Start from the controller prompt (`run-next-step`) in Agent mode.
2. Let the agent inspect state, execute the next unfinished step, run the real validation commands available in the repo, report only the commands actually run using repo-relative file paths, then commit and push.
3. Repeat until all numbered steps are complete.

## Truthful quality-gate reporting

- The repository currently provides real `npm test` and `npm run typecheck` gates.
- There is currently no `npm run lint` script.
- Workflow and final reports should mention only commands that were actually run.
- Changed-file summaries should use exact repo-relative paths.

## Netlify deployment

The current repository already generates a static browser-visible uploaded monthly run via `npm run demo:web`.

Minimal Netlify setup for this repo:

- Build command: `npm run demo:web`
- Publish directory: `dist/demo`

To deploy from GitHub on Netlify:
1. Connect the `Noah-eu/hotel-finance-control` repository in Netlify.
2. Keep the detected Node version on `20` or set it explicitly in Netlify.
3. Use the build command `npm run demo:web`.
4. Use the publish directory `dist/demo`.

The repository includes `netlify.toml`, so Netlify should pick these settings up automatically.