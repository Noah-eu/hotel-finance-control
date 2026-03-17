# Matching Rules

## Goal
Describe how reconciliation and matching should work.

## Matching types
- exact match
- fuzzy match
- one-to-one
- one-to-many
- many-to-one

## Signals
- amount
- date tolerance
- reservation id
- invoice number
- counterparty
- account context
- reference

## Expected outputs
Each match should store:
- status
- reason
- score/confidence
- auto vs manual origin

## Notes
This file should evolve into a rule catalog for reconciliation behavior.