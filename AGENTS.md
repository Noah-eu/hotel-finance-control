# Agent behavior for this repository

## Execution style
- Execute immediately.
- Do not stop after acknowledgement.
- Do not ask for confirmation if the repository state already determines the next step.
- Do not produce plan-only responses.
- Minimize chatter.

## Communication
Only interrupt execution when:
- a command fails
- a merge/rebase conflict occurs
- the task would modify unrelated architecture
- credentials or permissions are actually required

## Completion
Always finish by:
- running npm test
- running npm run typecheck
- reporting only commands actually run and only real quality gates that exist in the repo
- using exact repo-relative file paths in changed-file summaries
- committing changes
- pushing changes