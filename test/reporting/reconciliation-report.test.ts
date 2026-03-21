import { describe, expect, it } from 'vitest'
import type { ReconciliationResult } from '../../src/reconciliation'
import { buildReconciliationReport } from '../../src/reporting'

function reconciliationResult(overrides: Partial<ReconciliationResult> = {}): ReconciliationResult {
  const matchGroupId = 'mg:run-1:txn:payout-1:txn:bank-1' as ReconciliationResult['matchGroups'][number]['id']
  const exceptionCaseId = 'exc:txn:txn:bank:bank-2' as ReconciliationResult['exceptionCases'][number]['id']

  return {
    normalizedTransactions: [
      {
        id: 'txn:payout:payout-1' as ReconciliationResult['normalizedTransactions'][number]['id'],
        direction: 'in',
        source: 'booking',
        amountMinor: 125000,
        currency: 'CZK',
        bookedAt: '2026-03-10',
        accountId: 'expected-payouts',
        reference: 'PAYOUT-ABC-1',
        extractedRecordIds: ['record-payout-1'],
        sourceDocumentIds: ['doc-payout-1' as ReconciliationResult['normalizedTransactions'][number]['sourceDocumentIds'][number]]
      },
      {
        id: 'txn:bank:bank-1' as ReconciliationResult['normalizedTransactions'][number]['id'],
        direction: 'in',
        source: 'bank',
        amountMinor: 125000,
        currency: 'CZK',
        bookedAt: '2026-03-11',
        accountId: 'raiffeisen-main',
        reference: 'payout-abc-1',
        extractedRecordIds: ['record-bank-1'],
        sourceDocumentIds: ['doc-bank-1' as ReconciliationResult['normalizedTransactions'][number]['sourceDocumentIds'][number]]
      },
      {
        id: 'txn:bank:bank-2' as ReconciliationResult['normalizedTransactions'][number]['id'],
        direction: 'in',
        source: 'bank',
        amountMinor: 50000,
        currency: 'EUR',
        bookedAt: '2026-03-12',
        accountId: 'raiffeisen-main',
        extractedRecordIds: ['record-bank-2'],
        sourceDocumentIds: ['doc-bank-2' as ReconciliationResult['normalizedTransactions'][number]['sourceDocumentIds'][number]]
      }
    ],
    matching: {
      matchGroups: [
        {
          id: matchGroupId,
          transactionIds: ['txn:payout:payout-1', 'txn:bank:bank-1'] as ReconciliationResult['matchGroups'][number]['transactionIds'],
          status: 'proposed',
          reason: 'Exact deterministic match on amount, currency, direction and date window.',
          confidence: 0.95,
          ruleKey: 'deterministic:payout-bank:1to1:v1',
          autoCreated: true,
          createdAt: '2026-03-18T14:00:00.000Z'
        }
      ],
      candidates: [],
      unmatchedExpectedIds: [],
      unmatchedActualIds: ['txn:bank:bank-2' as ReconciliationResult['matching']['unmatchedActualIds'][number]]
    },
    matchGroups: [
      {
        id: matchGroupId,
        transactionIds: ['txn:payout:payout-1', 'txn:bank:bank-1'] as ReconciliationResult['matchGroups'][number]['transactionIds'],
        status: 'proposed',
        reason: 'Exact deterministic match on amount, currency, direction and date window.',
        confidence: 0.95,
        ruleKey: 'deterministic:payout-bank:1to1:v1',
        autoCreated: true,
        createdAt: '2026-03-18T14:00:00.000Z'
      }
    ],
    exceptionCases: [
      {
        id: exceptionCaseId,
        type: 'unmatched_transaction',
        severity: 'medium',
        status: 'open',
        explanation: 'Incoming bank transaction could not be matched to an expected payout.',
        relatedTransactionIds: ['txn:bank:bank-2' as ReconciliationResult['exceptionCases'][number]['relatedTransactionIds'][number]],
        relatedExtractedRecordIds: ['record-bank-2'],
        relatedSourceDocumentIds: ['doc-bank-2' as ReconciliationResult['exceptionCases'][number]['relatedSourceDocumentIds'][number]],
        recommendedNextStep: 'Review transaction classification and collect supporting documents.',
        createdAt: '2026-03-18T14:00:00.000Z'
      }
    ],
    supportedExpenseLinks: [],
    payoutBatchMatches: [],
    normalization: {
      warnings: [],
      trace: []
    },
    exceptions: {
      cases: [
        {
          id: exceptionCaseId,
          type: 'unmatched_transaction',
          severity: 'medium',
          status: 'open',
          explanation: 'Incoming bank transaction could not be matched to an expected payout.',
          relatedTransactionIds: ['txn:bank:bank-2' as ReconciliationResult['exceptionCases'][number]['relatedTransactionIds'][number]],
          relatedExtractedRecordIds: ['record-bank-2'],
          relatedSourceDocumentIds: ['doc-bank-2' as ReconciliationResult['exceptionCases'][number]['relatedSourceDocumentIds'][number]],
          recommendedNextStep: 'Review transaction classification and collect supporting documents.',
          createdAt: '2026-03-18T14:00:00.000Z'
        }
      ],
      trace: [
        {
          exceptionCaseId,
          source: 'unmatched_transaction',
          referenceId: 'txn:bank:bank-2'
        }
      ]
    },
    summary: {
      normalizedTransactionCount: 3,
      matchedGroupCount: 1,
      exceptionCount: 1,
      unmatchedExpectedCount: 0,
      unmatchedActualCount: 1
    },
    ...overrides
  }
}

describe('buildReconciliationReport', () => {
  it('builds a deterministic report shape from reconciliation output', () => {
    const report = buildReconciliationReport({
      reconciliation: reconciliationResult(),
      generatedAt: '2026-03-18T15:00:00.000Z'
    })

    expect(report.summary).toEqual({
      normalizedTransactionCount: 3,
      matchedGroupCount: 1,
      payoutBatchMatchCount: 0,
      unmatchedPayoutBatchCount: 0,
      exceptionCount: 1,
      unmatchedExpectedCount: 0,
      unmatchedActualCount: 1
    })
    expect(report.matches).toHaveLength(1)
    expect(report.payoutBatchMatches).toHaveLength(0)
    expect(report.exceptions).toHaveLength(1)
    expect(report.transactions).toHaveLength(3)
  })

  it('marks matched, exception, and unmatched transaction statuses explicitly', () => {
    const report = buildReconciliationReport({
      reconciliation: reconciliationResult({
        exceptionCases: [],
        exceptions: { cases: [], trace: [] },
        normalizedTransactions: [
          ...reconciliationResult().normalizedTransactions,
          {
            id: 'txn:payout:orphan-1' as ReconciliationResult['normalizedTransactions'][number]['id'],
            direction: 'in',
            source: 'airbnb',
            amountMinor: 70000,
            currency: 'EUR',
            bookedAt: '2026-03-14',
            accountId: 'expected-payouts',
            extractedRecordIds: ['record-orphan-1'],
            sourceDocumentIds: ['doc-orphan-1' as ReconciliationResult['normalizedTransactions'][number]['sourceDocumentIds'][number]]
          }
        ],
        summary: {
          normalizedTransactionCount: 4,
          matchedGroupCount: 1,
          exceptionCount: 0,
          unmatchedExpectedCount: 1,
          unmatchedActualCount: 1
        }
      }),
      generatedAt: '2026-03-18T15:00:00.000Z'
    })

    expect(report.transactions.find((item) => item.transactionId === 'txn:payout:payout-1')?.status).toBe('matched')
    expect(report.transactions.find((item) => item.transactionId === 'txn:bank:bank-2')?.status).toBe('unmatched')
    expect(report.transactions.find((item) => item.transactionId === 'txn:payout:orphan-1')?.status).toBe('unmatched')
  })

  it('surfaces payout-batch matches separately without double-counting transaction matches', () => {
    const report = buildReconciliationReport({
      reconciliation: reconciliationResult({
        workflowPlan: {
          reservationSources: [],
          ancillaryRevenueSources: [],
          payoutRows: [
            {
              rowId: 'txn:payout:payout-1',
              platform: 'booking',
              sourceDocumentId: 'doc-payout-1' as never,
              payoutReference: 'PAYOUT-ABC-1',
              payoutDate: '2026-03-10',
              payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-ABC-1',
              amountMinor: 125000,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [
            {
              payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-ABC-1',
              platform: 'booking',
              payoutReference: 'PAYOUT-ABC-1',
              payoutDate: '2026-03-10',
              bankRoutingTarget: 'rb_bank_inflow',
              rowIds: ['txn:payout:payout-1'],
              expectedTotalMinor: 125000,
              currency: 'CZK'
            }
          ],
          directBankSettlements: [],
          expenseDocuments: [],
          bankFeeClassifications: []
        },
        payoutBatchMatches: [
          {
            payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-ABC-1',
            payoutBatchRowIds: ['txn:payout:payout-1'],
            bankTransactionId: 'txn:bank:bank-1' as ReconciliationResult['normalizedTransactions'][number]['id'],
            bankAccountId: 'raiffeisen-main',
            amountMinor: 125000,
            currency: 'CZK',
            confidence: 0.99,
            ruleKey: 'deterministic:payout-batch-bank:1to1:v1',
            matched: true,
            reasons: ['amountExact', 'currencyExact', 'payoutReferenceAligned'],
            evidence: [{ key: 'payoutReference', value: 'PAYOUT-ABC-1' }]
          }
        ]
      }),
      generatedAt: '2026-03-18T15:00:00.000Z'
    })

    expect(report.payoutBatchMatches).toEqual([
      expect.objectContaining({
        platform: 'Booking',
        payoutReference: 'PAYOUT-ABC-1',
        bankAccountId: 'raiffeisen-main',
        status: 'matched'
      })
    ])
    expect(report.summary.matchedGroupCount).toBe(1)
    expect(report.summary.payoutBatchMatchCount).toBe(1)
    expect(report.summary.unmatchedPayoutBatchCount).toBe(0)
    expect(report.matches).toHaveLength(1)
  })

  it('surfaces unmatched payout-batch diagnostics separately with business-facing Czech reason text', () => {
    const report = buildReconciliationReport({
      reconciliation: reconciliationResult({
        payoutBatchNoMatchDiagnostics: [
          {
            payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-ABC-1',
            payoutReference: 'PAYOUT-ABC-1',
            platform: 'booking',
            expectedTotalMinor: 125000,
            currency: 'CZK',
            payoutDate: '2026-03-10',
            bankRoutingTarget: 'rb_bank_inflow',
            eligibleCandidates: [],
            allInboundBankCandidates: [],
            noMatchReason: 'noExactAmount',
            matched: false
          }
        ]
      }),
      generatedAt: '2026-03-18T15:00:00.000Z'
    })

    expect(report.unmatchedPayoutBatches).toEqual([
      expect.objectContaining({
        platform: 'Booking',
        payoutReference: 'PAYOUT-ABC-1',
        payoutDate: '2026-03-10',
        bankRoutingLabel: 'RB účet',
        amountMinor: 125000,
        currency: 'CZK',
        status: 'unmatched',
        reason: 'Žádná bankovní položka se stejnou částkou.'
      })
    ])
    expect(report.summary.matchedGroupCount).toBe(1)
    expect(report.summary.payoutBatchMatchCount).toBe(0)
    expect(report.summary.unmatchedPayoutBatchCount).toBe(1)
    expect(report.matches).toHaveLength(1)
  })
})
