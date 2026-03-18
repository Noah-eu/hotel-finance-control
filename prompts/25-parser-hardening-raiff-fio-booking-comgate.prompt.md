Work in the context of the Hotel Finance Reconciliation System described in `prompts/master.md` and `prompts/prefix.md`.

Step 25 goal:
Harden the deterministic Raiffeisenbank, Fio, Booking, and Comgate parsers for real-world variants.

Do:
- inspect current parser assumptions, representative fixtures, and extraction contracts first
- improve parser resilience for realistic column variations, formatting differences, and small source inconsistencies
- preserve deterministic parsing first, with explainable behavior and clear failures when unsupported
- avoid parser-specific hacks leaking into normalization, matching, or UI layers
- add focused tests covering hardened parser scenarios

Definition of done:
- the existing deterministic parsers are more resilient to real-world file variants
- explainability and auditability remain intact
- `npm test` and `npm run typecheck` pass
- update `docs/implementation-roadmap.md` to reflect the new state
- commit and push with a clean message