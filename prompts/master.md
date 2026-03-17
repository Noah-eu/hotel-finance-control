You are working on a product called Hotel Finance Reconciliation System.

End goal:
Build a reliable, extensible web application for monthly hotel finance control. During the month, users upload invoices and receipts. At month end, they upload bank statements, OTA payout reports, payment gateway reports, and reservation exports. The system ingests all sources, normalizes the data into a common model, reconciles expected vs actual money movements, matches expenses to documents, flags missing invoices and suspicious transactions, and produces clear monthly review outputs.

Business context:
- There are 2 bank accounts:
  1) Raiffeisenbank: incoming money from Booking, Airbnb, and Comgate.
  2) Fio: incoming money from payment terminal transactions, used only for Expedia reservations.
- Comgate includes:
  - direct website reservation payments
  - parking payments
  - parking may also be purchased by guests coming from other OTAs
- Both accounts are also used for hotel expenses, salaries, and other outgoing payments.
- The owner/other users may also create non-hotel or suspicious personal spending on these accounts.
- The system must help separate valid hotel-related transactions from missing-document, unclear, suspicious, or non-hotel transactions.

What the final product must support:
- Upload and process bank statements, OTA reports, payment gateway reports, reservation exports, invoices, receipts, PDFs, CSVs, XLSX files, and fallback image/scanned documents.
- Normalize all imported data into a single internal model.
- Reconcile:
  - Booking payouts -> Raiffeisen incoming transactions
  - Airbnb payouts -> Raiffeisen incoming transactions
  - Comgate transactions -> Raiffeisen incoming transactions
  - Expedia/payment terminal flows -> Fio incoming transactions
  - Previo reservations -> OTA/payment inflows
  - invoices/receipts -> outgoing bank transactions
  - internal transfers -> matching corresponding movements
- Detect:
  - missing payouts
  - amount mismatches
  - reservation without found payment
  - payment without known source
  - expense without invoice
  - invoice without payment
  - duplicates
  - suspicious or non-hotel expenses
  - internal transfers incorrectly treated as expenses
- Provide:
  - dashboard
  - imports view
  - transactions view
  - reconciliation view
  - exceptions/review workflow
  - invoices & expenses view
  - reports and exports
  - audit trail and user roles

Architecture direction:
- Build an extensible modular monolith, not a pile of one-off scripts and not premature microservices.
- Keep strict separation of concerns:
  import -> extraction -> normalization -> matching -> exceptions/review -> reporting/export
- All sources must go through adapters/parsers into a shared normalization layer.
- Do not solve problems by hardcoding scattered source-specific hacks across UI, business logic, or reports.
- Source-specific behavior is allowed only when isolated in clean adapters, parser modules, mapping rules, or matching rules.
- Matching must be explainable, auditable, and extensible.

Core design principles:
1. Always optimize for the final system, not just the current task.
2. Never implement a shortcut that makes future sources harder to add.
3. Every change should improve the engine for future tasks, not only the current example.
4. Prefer deterministic parsing and rules first; use AI/OCR as fallback, not as the main logic.
5. Keep domain logic out of UI components.
6. Avoid duplication of business rules across modules.
7. Preserve traceability from original document -> extracted records -> normalized records -> match groups -> exceptions.
8. Make all matching outcomes explainable with reason, score/confidence, and status.
9. Design for human review where certainty is incomplete.
10. Favor composable rules and adapters over special-case branching.

Expected domain model direction:
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

Minimum expectations for transaction normalization:
- direction: in / out / internal
- source: booking / airbnb / comgate / previa / bank / invoice / receipt / terminal / manual
- subtype
- amountGross / amountNet
- currency
- bookedDate / valueDate
- counterparty
- reference
- reservationId
- invoiceNumber
- channel
- accountId
- status

Matching expectations:
- Support exact and fuzzy matching.
- Support one-to-one, one-to-many, and many-to-one cases.
- Use date tolerance, amount tolerance, references, reservation IDs, invoice numbers, counterparties, and account context.
- Each match must store:
  - status
  - reason
  - score/confidence
  - rule or method that created it
  - whether it was auto-created or manually confirmed

Exceptions expectations:
- Create explicit exception cases for reconciliation failures and ambiguities.
- Exceptions should have:
  - type
  - severity
  - explanation
  - related records
  - recommended next step
  - resolution status

Quality bar:
- Do not patch only for the current sample file.
- Do not bury core rules in ad hoc conditions.
- Do not couple parsing, matching, and UI rendering.
- Do not break existing flows unnecessarily.
- Keep naming clean and domain-driven.
- Add tests for new behavior.
- Prefer backward-compatible improvements when reasonable.
- When refactoring, improve structure, not only output.

When implementing any task:
- First think about how the requested change fits the final product.
- Reuse or improve existing architecture where possible.
- Generalize fixes beyond the current test case.
- Keep the solution clean, explicit, and maintainable.
- If the current code structure is working against the end goal, refactor toward the target architecture instead of stacking more hacks.

Output expectations for each task:
- Implement the requested change.
- Briefly summarize what was changed.
- Mention architectural impact.
- Mention any follow-up gaps if they remain.
- Add or update tests where appropriate.