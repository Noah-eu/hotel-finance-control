# Hotel Finance Reconciliation System

Build toward a reliable, extensible web application for monthly hotel finance control.

## Product goal
Users upload invoices and receipts during the month. At month end, they upload bank statements, OTA payout reports, payment gateway reports, and reservation exports. The system ingests all sources, normalizes them into a common model, reconciles expected vs actual money movements, matches expenses to documents, flags missing invoices and suspicious transactions, and produces clear monthly review outputs.

## Business context
- Two bank accounts:
  - Raiffeisenbank: Booking, Airbnb, Comgate incoming payments
  - Fio: payment terminal inflows for Expedia reservations
- Comgate includes:
  - direct website reservation payments
  - parking payments
- Both accounts also contain hotel expenses, salaries, and possibly suspicious or non-hotel spending.
- The system must help separate valid hotel transactions from unclear, missing-document, suspicious, or non-hotel transactions.

## Architecture rules
- Build an extensible modular monolith.
- Preserve clean separation:
  - import
  - extraction
  - normalization
  - matching
  - exceptions/review
  - reporting/export
- All sources must flow through a shared normalized model.
- Keep source-specific logic isolated in adapters, parser modules, or matching rules.
- Do not scatter one-off hacks across UI or business logic.
- Keep domain logic out of UI components.

## Engineering principles
- Optimize for the final system, not only the current task.
- Generalize fixes beyond the current example.
- Prefer deterministic parsing and rules first.
- Use AI/OCR only as fallback.
- Keep matching explainable, auditable, and extensible.
- Every match should have reason, score/confidence, and status.
- Preserve traceability from source document -> extracted record -> normalized transaction -> match group -> exception.
- Design for human review when certainty is incomplete.

## Expected domain direction
Core entities should evolve around:
- User
- Role
- SourceDocument
- ExtractedRecord
- NormalizedTransaction
- Reservation
- Invoice
- MatchGroup
- ExceptionCase
- Account
- Counterparty
- AuditLog

## Quality bar
- Avoid local hacks.
- Avoid duplicating business rules.
- Avoid coupling parsing, matching, and UI rendering.
- Keep naming clean and domain-driven.
- Add or update tests for important behavior.
- Prefer maintainable structure over quick patches.