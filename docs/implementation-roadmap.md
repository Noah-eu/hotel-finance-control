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
| 11 | `prompts/11-cli-demo.prompt.md` | done | A local `demo:cli` command now runs the pipeline on deterministic fixture data and prints a readable reconciliation report. |
| 12 | `prompts/12-minimal-web-demo.prompt.md` | done | A local `demo:web` command now generates a tiny browser-visible HTML demo from fixture-driven reconciliation and reporting output. |
| 13 | `prompts/13-real-input-fixtures.prompt.md` | done | Reusable representative real-input fixtures now exist under `src/real-input-fixtures` with expected extracted and normalized outputs plus validation tests. |
| 14 | `prompts/14-raiffeisenbank-parser.prompt.md` | done | A deterministic Raiffeisenbank parser now extracts representative OTA inflows, payroll, expense, and suspicious/private-spend rows into `ExtractedRecord` outputs with tests. |
| 15 | `prompts/15-fio-parser.prompt.md` | done | A deterministic Fio parser now extracts Expedia terminal payment-flow rows into `ExtractedRecord` outputs with focused tests. |
| 16 | `prompts/16-booking-parser.prompt.md` | done | A deterministic Booking payout/export parser now extracts payout-line records with payout references, reservation linkage, and source traceability fields using representative fixtures and focused tests. |
| 17 | `prompts/17-comgate-parser.prompt.md` | done | A deterministic Comgate parser now extracts payout-line records for website reservations and parking payment flows with source traceability fields and focused tests. |
| 18 | `prompts/18-invoice-receipt-ingestion.prompt.md` | done | Deterministic document-ingestion contracts and a first invoice parser path now exist with traceable extracted outputs, focused tests, and OCR reserved as a future fallback only. |
| 19 | `prompts/19-monthly-reconciliation-batch.prompt.md` | done | A deterministic monthly reconciliation batch entry point now routes imported source files through extraction, reconciliation, and reporting with focused end-to-end tests. |
| 20 | `prompts/20-review-screen-baseline.prompt.md` | done | A deterministic review workflow baseline now surfaces matched, unmatched, suspicious, and missing-document items from monthly reconciliation outputs with focused tests. |
| 21 | `prompts/21-real-upload-web-flow.prompt.md` | done | A first real browser-visible upload flow now exists as a local static page with practical Czech copy, file selection, and deterministic preparation for later ingestion. |
| 22 | `prompts/22-uploaded-file-ingestion.prompt.md` | done | Uploaded files now enter the shared monthly-batch and extraction pipeline through deterministic source-document preparation, traceable parser routing, and focused tests. |
| 23 | `prompts/23-browser-review-screen.prompt.md` | done | A first real browser review UI now renders matched, unmatched, suspicious, and missing-document sections directly from the shared uploaded batch preview and review workflow data. |
| 24 | `prompts/24-csv-xlsx-export.prompt.md` | done | Practical CSV and real XLSX export now exist for reconciliation transactions, review items, and monthly summaries, built directly from shared monthly-batch, reporting, and review outputs. |
| 25 | `prompts/25-parser-hardening-raiff-fio-booking-comgate.prompt.md` | done | Deterministic Raiffeisenbank, Fio, Booking, and Comgate parsers now handle realistic delimiter, header-alias, quoting, BOM, date, and amount variants while keeping clear required-column failures and shared normalization intact. |
| 26 | `prompts/26-invoice-receipt-expansion.prompt.md` | done | Deterministic document ingestion now covers realistic invoice and receipt variants through one shared parser path, a shared document normalizer, receipt routing in monthly-batch, and focused tests with clear unsupported-structure failures. |
| 27 | `prompts/27-suspicious-expense-rules.prompt.md` | done | Shared deterministic exception rules now flag suspicious/private expense-like outflows and missing supporting documents with explicit rule codes, traceability, review/report integration, and safe exclusions for legitimate payroll-style flows. |
| 28 | `prompts/28-monthly-run-from-uploaded-files.prompt.md` | done | Uploaded files now run through one real deterministic monthly flow in `upload-web`, producing a browser-visible monthly result, shared review/report outputs, and export handoff from the same shared modules without a backend or demo-fixture fallback. |
| 29 | `prompts/29-web-demo-upload-integration.prompt.md` | done | The browser-visible entrypoint in `src/web-demo` now wraps the real uploaded monthly run from `src/upload-web`, while the old fixture demo remains available only as an explicit auxiliary/dev-only helper. |
| 30 | `prompts/30-czech-user-copy-pass.prompt.md` | done | Visible browser upload, review, monthly-run, export, and auxiliary fixture-demo copy is now consistently practical Czech, while internal English symbols, file names, and traceable identifiers remain unchanged. |
| 31 | `prompts/31-review-bucketing-hardening.prompt.md` | done | Review bucketing now prefers shared structured exception metadata (`ruleCode` and exception `type`) over free-text explanation matching, keeping suspicious, missing-document, unmatched, and uploaded-document buckets deterministic and traceable. |
| 32 | `prompts/32-quality-gates-and-controller-truthfulness.prompt.md` | done | Controller and workflow guidance now report only commands actually run, use exact repo-relative changed-file summaries, and avoid fake lint claims because the repo currently exposes real test and typecheck gates but no lint script. |

## Current implemented modules

- `src/domain`: shared vocabulary and core entity types
- `src/normalization`: contracts, normalizers, registry, mixed-record normalization service
- `src/matching`: contracts, deterministic payout-to-bank matcher, service entrypoint
- `src/exceptions`: deterministic exception generation for unmatched transactions/documents, low-confidence matches, suspicious/private expenses, and missing supporting documents
- `src/reconciliation`: end-to-end orchestration entrypoint with summary counts
- `src/reporting`: minimal reconciliation report contracts and formatter built on reconciliation results
- `src/export`: shared CSV/XLSX export layer for reconciliation transactions, review items, and monthly summaries built from shared batch/report/review outputs
- `src/monthly-batch`: deterministic monthly import-to-extraction-to-reconciliation-to-report orchestration over representative real source files
- `src/review`: deterministic review workflow surface for matched, unmatched, suspicious, and missing-document reconciliation outcomes
- `src/upload-web`: local static browser-visible upload flow plus shared uploaded-batch preparation, browser review rendering, export package generation, and one browser-visible uploaded monthly run result built from the same shared outputs
- `src/demo-fixtures`: reusable deterministic demo inputs plus expected reconciliation and reporting outputs
- `src/real-input-fixtures`: representative deterministic raw-source fixtures plus expected extracted outputs for bank, payout, invoice, and receipt inputs, with normalized expectations where current shared normalizers apply
- `src/extraction`: deterministic Raiffeisenbank and Fio bank-statement parsers, Booking and Comgate payout/export parsers, plus shared deterministic invoice and receipt document parsers
- `src/cli-demo`: local CLI demo entrypoint and formatter built on shared demo fixtures, reconciliation, and reporting
- `src/web-demo`: browser-visible wrapper over the real uploaded monthly run from `src/upload-web`, with the old fixture demo retained only as an explicit auxiliary/dev-only helper

## Upcoming workflow milestones

- Step 13 focuses on representative deterministic real-input fixtures that model actual hotel-finance source formats and expected parser outputs.
- Step 14 focuses on deterministic Raiffeisenbank parsing for Booking, Airbnb, Comgate, expense, payroll, and suspicious/private bank flows.
- Step 15 focuses on deterministic Fio parsing for Expedia terminal payment flows.
- Step 16 focuses on deterministic Booking payout/export ingestion into extracted records.
- Step 17 focuses on deterministic Comgate ingestion for website reservations and parking.
- Step 18 focuses on deterministic invoice and receipt ingestion contracts plus the first parser path, with AI/OCR only as fallback.
- Step 19 focuses on a monthly reconciliation batch entry point over real imported files.
- Step 20 focuses on the first real review-screen workflow layer for matched, unmatched, suspicious, and missing-document items.
- Step 21 focuses on the first real browser-visible upload flow for user-provided files, minimal but usable, without a fake backend.
- Step 22 focuses on connecting uploaded files into the existing monthly batch and extraction pipeline.
- Step 23 focuses on the first browser review UI for matched, unmatched, suspicious, and missing-document items.
- Step 24 focuses on practical CSV/XLSX export for real monthly reconciliation and review work.
- Step 25 focuses on hardening the existing deterministic Raiffeisenbank, Fio, Booking, and Comgate parsers against real-world variants.
- Step 26 focuses on expanding deterministic invoice and receipt ingestion coverage before any OCR/AI fallback.
- Step 27 focuses on the first explicit suspicious/private expense and missing-document review rules.
- Step 28 focuses on one real end-to-end monthly processing flow built from uploaded source files rather than demo fixtures.
- Step 29 unified the currently visible browser demo with the real uploaded monthly run already implemented in `src/upload-web`.
- Step 30 completed a Czech user-copy cleanup pass across the upload, review, monthly-run, export, and auxiliary fixture-demo browser surfaces.
- Step 31 hardened review bucketing to rely on explicit structured rule metadata instead of fragile free-text heuristics wherever possible.
- Step 32 made quality-gate and controller reporting truthful and repo-relative, removing fake lint expectations because the repo currently exposes real test and typecheck gates but no lint script.

## Current roadmap status

Steps `01` through `32` are complete.

## Next step selection rule

The next unfinished step is the first roadmap row whose status is not `done`.

## Roadmap update rule

After a step is completed successfully:
1. mark that step as `done`
2. update its notes to match the real repository state
3. mark the following unfinished step as `next`
4. if no unfinished step remains yet, leave all recorded steps as `done` until a new roadmap row is added
5. keep all already completed steps intact unless the repo state proves they were recorded incorrectly
