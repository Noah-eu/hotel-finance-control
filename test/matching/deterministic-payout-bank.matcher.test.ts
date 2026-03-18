import { describe, expect, it } from 'vitest'
import type { NormalizedTransaction } from '../../src/domain'
import type { MatchingContext } from '../../src/matching'
import { matchTransactions } from '../../src/matching'

function tx(overrides: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    id: 'txn:default' as NormalizedTransaction['id'],
    direction: 'in',
    source: 'unknown',
    amountMinor: 10000,
    currency: 'CZK',
    bookedAt: '2026-03-01',
    accountId: 'acc-1',
    extractedRecordIds: ['er-1'],
    sourceDocumentIds: ['doc-1' as NormalizedTransaction['sourceDocumentIds'][number]],
    ...overrides
  }
}

const context: MatchingContext = {
  runId: 'run-1',
  requestedAt: '2026-03-18T10:00:00.000Z'
}

describe('DeterministicPayoutBankMatcher', () => {
  it('creates a deterministic 1:1 match for payout expected vs bank actual', () => {
    const expected = [
      tx({
        id: 'txn:payout:1' as NormalizedTransaction['id'],
        source: 'booking',
        amountMinor: 125000,
        currency: 'CZK',
        bookedAt: '2026-03-10',
        reference: 'PAYOUT-ABC-1'
      })
    ]

    const actual = [
      tx({
        id: 'txn:bank:1' as NormalizedTransaction['id'],
        source: 'bank',
        amountMinor: 125000,
        currency: 'CZK',
        bookedAt: '2026-03-11',
        reference: 'payout-abc-1'
      })
    ]

    const result = matchTransactions({ expected, actual }, context)

    expect(result.candidates).toHaveLength(1)
    expect(result.matchGroups).toHaveLength(1)
    expect(result.unmatchedExpectedIds).toHaveLength(0)
    expect(result.unmatchedActualIds).toHaveLength(0)
    expect(result.candidates[0].explanation.ruleKey).toBe('deterministic:payout-bank:1to1:v1')
    expect(result.candidates[0].explanation.confidence).toBeGreaterThanOrEqual(0.95)
  })

  it('keeps both transactions unmatched when date window is too far apart', () => {
    const expected = [
      tx({
        id: 'txn:payout:2' as NormalizedTransaction['id'],
        source: 'airbnb',
        amountMinor: 50000,
        currency: 'EUR',
        bookedAt: '2026-03-01'
      })
    ]

    const actual = [
      tx({
        id: 'txn:bank:2' as NormalizedTransaction['id'],
        source: 'bank',
        amountMinor: 50000,
        currency: 'EUR',
        bookedAt: '2026-03-10'
      })
    ]

    const result = matchTransactions({ expected, actual }, context)

    expect(result.candidates).toHaveLength(0)
    expect(result.matchGroups).toHaveLength(0)
    expect(result.unmatchedExpectedIds).toEqual(['txn:payout:2'])
    expect(result.unmatchedActualIds).toEqual(['txn:bank:2'])
  })

  it('does not force a match when multiple bank candidates fit one payout', () => {
    const expected = [
      tx({
        id: 'txn:payout:3' as NormalizedTransaction['id'],
        source: 'comgate',
        amountMinor: 70000,
        currency: 'CZK',
        bookedAt: '2026-03-15'
      })
    ]

    const actual = [
      tx({
        id: 'txn:bank:3a' as NormalizedTransaction['id'],
        source: 'bank',
        amountMinor: 70000,
        currency: 'CZK',
        bookedAt: '2026-03-15'
      }),
      tx({
        id: 'txn:bank:3b' as NormalizedTransaction['id'],
        source: 'bank',
        amountMinor: 70000,
        currency: 'CZK',
        bookedAt: '2026-03-16'
      })
    ]

    const result = matchTransactions({ expected, actual }, context)

    expect(result.candidates).toHaveLength(0)
    expect(result.matchGroups).toHaveLength(0)
    expect(result.unmatchedExpectedIds).toEqual(['txn:payout:3'])
    expect(result.unmatchedActualIds).toEqual(['txn:bank:3a', 'txn:bank:3b'])
  })
})
