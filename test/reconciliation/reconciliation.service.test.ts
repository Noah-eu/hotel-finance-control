import { describe, expect, it } from 'vitest'
import type { ExtractedRecord } from '../../src/domain'
import type { ReconciliationContext } from '../../src/reconciliation'
import { reconcileExtractedRecords } from '../../src/reconciliation'

const context: ReconciliationContext = {
  runId: 'recon-run-1',
  requestedAt: '2026-03-18T13:15:00.000Z'
}

function record(overrides: Partial<ExtractedRecord>): ExtractedRecord {
  return {
    id: 'record-1',
    sourceDocumentId: 'doc-1' as ExtractedRecord['sourceDocumentId'],
    recordType: 'bank-transaction',
    extractedAt: '2026-03-18T12:00:00.000Z',
    data: {},
    ...overrides
  }
}

describe('reconcileExtractedRecords', () => {
  it('normalizes, matches, and returns summary counts for a simple payout-to-bank reconciliation', () => {
    const extractedRecords: ExtractedRecord[] = [
      record({
        id: 'payout-1',
        recordType: 'payout-line',
        data: {
          platform: 'booking',
          amountMinor: 125000,
          currency: 'CZK',
          bookedAt: '2026-03-10',
          accountId: 'expected-payouts',
          reference: 'PAYOUT-ABC-1'
        }
      }),
      record({
        id: 'bank-1',
        recordType: 'bank-transaction',
        data: {
          sourceSystem: 'bank',
          amountMinor: 125000,
          currency: 'CZK',
          bookedAt: '2026-03-11',
          accountId: 'raiffeisen-main',
          reference: 'payout-abc-1'
        }
      })
    ]

    const result = reconcileExtractedRecords({ extractedRecords }, context)

    expect(result.normalizedTransactions).toHaveLength(2)
    expect(result.matchGroups).toHaveLength(1)
    expect(result.exceptionCases).toHaveLength(0)
    expect(result.summary).toEqual({
      normalizedTransactionCount: 2,
      matchedGroupCount: 1,
      exceptionCount: 0,
      unmatchedExpectedCount: 0,
      unmatchedActualCount: 0
    })
    expect(result.normalization.trace).toEqual([
      { extractedRecordId: 'payout-1', transactionIds: ['txn:payout:payout-1'] },
      { extractedRecordId: 'bank-1', transactionIds: ['txn:bank:bank-1'] }
    ])
  })

  it('keeps unsupported record types as warnings without crashing the pipeline', () => {
    const extractedRecords: ExtractedRecord[] = [
      record({
        id: 'unsupported-1',
        recordType: 'reservation-line',
        data: {
          amountMinor: 9999
        }
      })
    ]

    const result = reconcileExtractedRecords({ extractedRecords }, context)

    expect(result.normalizedTransactions).toHaveLength(0)
    expect(result.matchGroups).toHaveLength(0)
    expect(result.exceptionCases).toHaveLength(0)
    expect(result.normalization.warnings).toHaveLength(1)
    expect(result.normalization.warnings[0]).toMatchObject({
      code: 'UNSUPPORTED_RECORD_TYPE',
      extractedRecordId: 'unsupported-1'
    })
    expect(result.summary).toEqual({
      normalizedTransactionCount: 0,
      matchedGroupCount: 0,
      exceptionCount: 0,
      unmatchedExpectedCount: 0,
      unmatchedActualCount: 0
    })
  })

  it('creates exception cases for unmatched expected and actual transactions', () => {
    const extractedRecords: ExtractedRecord[] = [
      record({
        id: 'payout-2',
        recordType: 'payout-line',
        data: {
          platform: 'airbnb',
          amountMinor: 50000,
          currency: 'EUR',
          bookedAt: '2026-03-01',
          accountId: 'expected-payouts'
        }
      }),
      record({
        id: 'bank-2',
        recordType: 'bank-transaction',
        data: {
          sourceSystem: 'bank',
          amountMinor: 50000,
          currency: 'EUR',
          bookedAt: '2026-03-10',
          accountId: 'raiffeisen-main'
        }
      })
    ]

    const result = reconcileExtractedRecords({ extractedRecords }, context)

    expect(result.matchGroups).toHaveLength(0)
    expect(result.exceptionCases).toHaveLength(2)
    expect(result.summary).toEqual({
      normalizedTransactionCount: 2,
      matchedGroupCount: 0,
      exceptionCount: 2,
      unmatchedExpectedCount: 1,
      unmatchedActualCount: 1
    })
    expect(result.exceptionCases.map((item) => item.type)).toEqual([
      'unmatched_transaction',
      'unmatched_transaction'
    ])
  })

  it('attaches deterministic reservation settlement matches from the workflow plan without rewriting the main reconciliation engine', () => {
    const extractedRecords: ExtractedRecord[] = [
      record({
        id: 'previo-reservation-1',
        recordType: 'payout-line',
        rawReference: 'PREVIO-BOOK-8841',
        amountMinor: 42000,
        currency: 'CZK',
        occurredAt: '2026-03-14',
        data: {
          platform: 'previo',
          rowKind: 'accommodation',
          bookedAt: '2026-03-14',
          stayStartAt: '2026-03-14',
          stayEndAt: '2026-03-16',
          amountMinor: 42000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'PREVIO-BOOK-8841',
          reservationId: 'PREVIO-BOOK-8841',
          guestName: 'Jan Novak',
          channel: 'booking'
        }
      }),
      record({
        id: 'booking-payout-1',
        recordType: 'payout-line',
        data: {
          platform: 'booking',
          bookedAt: '2026-03-15',
          amountMinor: 42000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'BOOK-PAYOUT-8841',
          reservationId: 'PREVIO-BOOK-8841'
        }
      })
    ]

    const result = reconcileExtractedRecords({ extractedRecords }, context)

    expect(result.workflowPlan?.reservationSettlementMatches).toEqual([
      expect.objectContaining({
        reservationId: 'PREVIO-BOOK-8841',
        platform: 'booking',
        settlementKind: 'payout_row'
      })
    ])
    expect(result.reservationSettlementMatches).toEqual(result.workflowPlan?.reservationSettlementMatches)
  })
})
