# Implementation Roadmap

This roadmap tracks the repo's implementation milestones in prompt order and records what is already complete in the workspace.

## Milestone status

| Step | Prompt | Status | Notes |
| --- | --- | --- | --- |
| 01 | `prompts/01-validate-scaffold.prompt.md` | done | TypeScript scaffold validated, tests and typecheck established. |
| 02 | `prompts/02-domain-types.prompt.md` | done | Core domain and value types for traceability and reconciliation vocabulary exist under `src/domain`. |
| 03 | `prompts/03-normalization-contracts.prompt.md` | done | Normalization contracts and traceability outputs exist under `src/normalization/contracts.ts`. |
| 04 | `prompts/04-matching-contracts.prompt.md` | done | Matching contracts and explainability fields exist under `src/matching/contracts.ts`. |
| 05 | `prompts/05-first-normalizers.prompt.md` | done | Deterministic `bank-transaction` and `payout-line` normalizers plus registry wiring exist. |
| 06 | `prompts/06-first-matcher.prompt.md` | done | Deterministic payout-to-bank one-to-one matcher exists with focused tests. |
| 07 | `prompts/07-exceptions-baseline.prompt.md` | done | Baseline exception detector exists for unmatched transactions/documents and low-confidence matches. |
| 08 | `prompts/08-reconciliation-flow.prompt.md` | done | End-to-end reconciliation orchestration exists with normalization, matching, exceptions, and summary counts. |
| 09 | `prompts/09-reporting-export.prompt.md` | done | Reporting/export now builds a deterministic reconciliation report with summary, matches, exceptions, and transaction-level statuses. |
| 10 | `prompts/10-demo-fixtures.prompt.md` | done | Reusable deterministic fixture inputs and expected reconciliation/report outputs now exist under `src/demo-fixtures` with validation tests. |
| 11 | `prompts/11-cli-demo.prompt.md` | next | Add a local CLI-style demo command that runs the pipeline on fixture data and prints a readable report. |
| 12 | `prompts/12-minimal-web-demo.prompt.md` | planned | Add the first tiny browser-visible local demo layer that renders fixture-driven reconciliation output without becoming a production UI. |

## Current implemented modules

- `src/domain`: shared vocabulary and core entity types
- `src/normalization`: contracts, normalizers, registry, mixed-record normalization service
- `src/matching`: contracts, deterministic payout-to-bank matcher, service entrypoint
- `src/exceptions`: baseline deterministic exception generation
- `src/reconciliation`: end-to-end orchestration entrypoint with summary counts
- `src/reporting`: minimal reconciliation report contracts and formatter built on reconciliation results
- `src/demo-fixtures`: reusable deterministic demo inputs plus expected reconciliation and reporting outputs

## Upcoming workflow milestones

- Step 10 focuses on deterministic demo fixtures: sample `ExtractedRecord[]` inputs plus expected reconciliation and reporting outputs that can support tests, demos, and local tooling.
- Step 11 focuses on a local CLI demo entrypoint that runs the existing pipeline against fixture data and prints a readable report for manual inspection.
- Step 12 focuses on a minimal local web demo: a tiny browser-visible layer that presents fixture-driven results without introducing a production application architecture.

## Next step selection rule

The next unfinished step is the first roadmap row whose status is not `done`.

## Roadmap update rule

After a step is completed successfully:
1. mark that step as `done`
2. update its notes to match the real repository state
3. mark the following unfinished step as `next`
4. if no unfinished step remains yet, leave all recorded steps as `done` until a new roadmap row is added
5. keep all already completed steps intact unless the repo state proves they were recorded incorrectly
