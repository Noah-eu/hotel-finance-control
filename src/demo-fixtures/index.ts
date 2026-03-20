import type { ExtractedRecord } from '../domain'
import type { ReconciliationContext, ReconciliationResult } from '../reconciliation'
import type { ReconciliationReport } from '../reporting'

export interface DemoFixture {
  key: 'matched-payout' | 'unmatched-payout'
  description: string
  extractedRecords: ExtractedRecord[]
  reconciliationContext: ReconciliationContext
  expectedReconciliation: Pick<
    ReconciliationResult,
    'summary' | 'normalization' | 'matchGroups' | 'exceptionCases'
  >
  expectedReport: {
    summary: ReconciliationReport['summary']
    matches: ReconciliationReport['matches']
    exceptions: ReconciliationReport['exceptions']
    transactions: ReconciliationReport['transactions']
  }
}

const baseContext: ReconciliationContext = {
  runId: 'demo-run-1',
  requestedAt: '2026-03-18T18:00:00.000Z'
}

function record(overrides: Partial<ExtractedRecord>): ExtractedRecord {
  return {
    id: 'record-1',
    sourceDocumentId: 'doc-1' as ExtractedRecord['sourceDocumentId'],
    recordType: 'bank-transaction',
    extractedAt: '2026-03-18T17:00:00.000Z',
    data: {},
    ...overrides
  }
}

export const demoFixtures: DemoFixture[] = [
  {
    key: 'matched-payout',
    description: 'Booking payout matches one incoming bank transaction deterministically.',
    reconciliationContext: baseContext,
    extractedRecords: [
      record({
        id: 'payout-demo-1',
        recordType: 'payout-line',
        sourceDocumentId: 'doc-payout-demo-1' as ExtractedRecord['sourceDocumentId'],
        data: {
          platform: 'booking',
          amountMinor: 125000,
          currency: 'CZK',
          bookedAt: '2026-03-10',
          accountId: 'expected-payouts',
          reference: 'PAYOUT-DEMO-1'
        }
      }),
      record({
        id: 'bank-demo-1',
        recordType: 'bank-transaction',
        sourceDocumentId: 'doc-bank-demo-1' as ExtractedRecord['sourceDocumentId'],
        data: {
          sourceSystem: 'bank',
          amountMinor: 125000,
          currency: 'CZK',
          bookedAt: '2026-03-11',
          accountId: 'raiffeisen-main',
          reference: 'payout-demo-1'
        }
      })
    ],
    expectedReconciliation: {
      summary: {
        normalizedTransactionCount: 2,
        matchedGroupCount: 1,
        exceptionCount: 0,
        unmatchedExpectedCount: 0,
        unmatchedActualCount: 0
      },
      normalization: {
        warnings: [],
        trace: [
          { extractedRecordId: 'payout-demo-1', transactionIds: ['txn:payout:payout-demo-1' as ReconciliationResult['normalizedTransactions'][number]['id']] },
          { extractedRecordId: 'bank-demo-1', transactionIds: ['txn:bank:bank-demo-1' as ReconciliationResult['normalizedTransactions'][number]['id']] }
        ]
      },
      matchGroups: [
        {
          id: 'mg:demo-run-1:txn:payout:payout-demo-1:txn:bank:bank-demo-1' as ReconciliationResult['matchGroups'][number]['id'],
          transactionIds: [
            'txn:payout:payout-demo-1',
            'txn:bank:bank-demo-1'
          ] as ReconciliationResult['matchGroups'][number]['transactionIds'],
          status: 'proposed',
          reason: 'Exact deterministic match on amount, currency, direction, date window and identifier signal.',
          confidence: 1,
          ruleKey: 'deterministic:payout-bank:1to1:v1',
          autoCreated: true,
          createdAt: '2026-03-18T18:00:00.000Z'
        }
      ],
      exceptionCases: []
    },
    expectedReport: {
      summary: {
        normalizedTransactionCount: 2,
        matchedGroupCount: 1,
        exceptionCount: 0,
        unmatchedExpectedCount: 0,
        unmatchedActualCount: 0,
        payoutBatchMatchCount: 1
      },
      matches: [
        {
          matchGroupId: 'mg:demo-run-1:txn:payout:payout-demo-1:txn:bank:bank-demo-1',
          transactionIds: ['txn:payout:payout-demo-1', 'txn:bank:bank-demo-1'],
          confidence: 1,
          reason: 'Exact deterministic match on amount, currency, direction, date window and identifier signal.',
          ruleKey: 'deterministic:payout-bank:1to1:v1'
        }
      ],
      exceptions: [],
      transactions: [
        {
          transactionId: 'txn:payout:payout-demo-1',
          source: 'booking',
          direction: 'in',
          amountMinor: 125000,
          currency: 'CZK',
          bookedAt: '2026-03-10',
          reference: 'PAYOUT-DEMO-1',
          status: 'matched'
        },
        {
          transactionId: 'txn:bank:bank-demo-1',
          source: 'bank',
          direction: 'in',
          amountMinor: 125000,
          currency: 'CZK',
          bookedAt: '2026-03-11',
          reference: 'payout-demo-1',
          status: 'matched'
        }
      ]
    }
  },
  {
    key: 'unmatched-payout',
    description: 'Airbnb payout and incoming bank movement stay unmatched and become exception cases.',
    reconciliationContext: {
      ...baseContext,
      runId: 'demo-run-2'
    },
    extractedRecords: [
      record({
        id: 'payout-demo-2',
        recordType: 'payout-line',
        sourceDocumentId: 'doc-payout-demo-2' as ExtractedRecord['sourceDocumentId'],
        data: {
          platform: 'airbnb',
          amountMinor: 50000,
          currency: 'EUR',
          bookedAt: '2026-03-01',
          accountId: 'expected-payouts'
        }
      }),
      record({
        id: 'bank-demo-2',
        recordType: 'bank-transaction',
        sourceDocumentId: 'doc-bank-demo-2' as ExtractedRecord['sourceDocumentId'],
        data: {
          sourceSystem: 'bank',
          amountMinor: 50000,
          currency: 'EUR',
          bookedAt: '2026-03-10',
          accountId: 'raiffeisen-main'
        }
      })
    ],
    expectedReconciliation: {
      summary: {
        normalizedTransactionCount: 2,
        matchedGroupCount: 0,
        exceptionCount: 2,
        unmatchedExpectedCount: 1,
        unmatchedActualCount: 1
      },
      normalization: {
        warnings: [],
        trace: [
          { extractedRecordId: 'payout-demo-2', transactionIds: ['txn:payout:payout-demo-2' as ReconciliationResult['normalizedTransactions'][number]['id']] },
          { extractedRecordId: 'bank-demo-2', transactionIds: ['txn:bank:bank-demo-2' as ReconciliationResult['normalizedTransactions'][number]['id']] }
        ]
      },
      matchGroups: [],
      exceptionCases: [
        {
          id: 'exc:txn:txn:payout:payout-demo-2' as ReconciliationResult['exceptionCases'][number]['id'],
          type: 'unmatched_transaction',
          severity: 'medium',
          status: 'open',
          explanation: 'Expected incoming transaction could not be matched to an actual bank movement.',
          relatedTransactionIds: ['txn:payout:payout-demo-2' as ReconciliationResult['exceptionCases'][number]['relatedTransactionIds'][number]],
          relatedExtractedRecordIds: ['payout-demo-2'],
          relatedSourceDocumentIds: ['doc-payout-demo-2' as ReconciliationResult['exceptionCases'][number]['relatedSourceDocumentIds'][number]],
          recommendedNextStep: 'Review transaction classification and collect supporting documents.',
          createdAt: '2026-03-18T18:00:00.000Z'
        },
        {
          id: 'exc:txn:txn:bank:bank-demo-2' as ReconciliationResult['exceptionCases'][number]['id'],
          type: 'unmatched_transaction',
          severity: 'medium',
          status: 'open',
          explanation: 'Incoming bank transaction could not be matched to an expected payout.',
          relatedTransactionIds: ['txn:bank:bank-demo-2' as ReconciliationResult['exceptionCases'][number]['relatedTransactionIds'][number]],
          relatedExtractedRecordIds: ['bank-demo-2'],
          relatedSourceDocumentIds: ['doc-bank-demo-2' as ReconciliationResult['exceptionCases'][number]['relatedSourceDocumentIds'][number]],
          recommendedNextStep: 'Review transaction classification and collect supporting documents.',
          createdAt: '2026-03-18T18:00:00.000Z'
        }
      ]
    },
    expectedReport: {
      summary: {
        normalizedTransactionCount: 2,
        matchedGroupCount: 0,
        exceptionCount: 2,
        unmatchedExpectedCount: 1,
        unmatchedActualCount: 1,
        payoutBatchMatchCount: 0
      },
      matches: [],
      exceptions: [
        {
          exceptionCaseId: 'exc:txn:txn:payout:payout-demo-2',
          type: 'unmatched_transaction',
          ruleCode: undefined,
          severity: 'medium',
          explanation: 'Expected incoming transaction could not be matched to an actual bank movement.',
          relatedTransactionIds: ['txn:payout:payout-demo-2'],
          relatedExtractedRecordIds: ['payout-demo-2'],
          relatedSourceDocumentIds: ['doc-payout-demo-2'],
          recommendedNextStep: 'Review transaction classification and collect supporting documents.'
        },
        {
          exceptionCaseId: 'exc:txn:txn:bank:bank-demo-2',
          type: 'unmatched_transaction',
          ruleCode: undefined,
          severity: 'medium',
          explanation: 'Incoming bank transaction could not be matched to an expected payout.',
          relatedTransactionIds: ['txn:bank:bank-demo-2'],
          relatedExtractedRecordIds: ['bank-demo-2'],
          relatedSourceDocumentIds: ['doc-bank-demo-2'],
          recommendedNextStep: 'Review transaction classification and collect supporting documents.'
        }
      ],
      transactions: [
        {
          transactionId: 'txn:payout:payout-demo-2',
          source: 'airbnb',
          direction: 'in',
          amountMinor: 50000,
          currency: 'EUR',
          bookedAt: '2026-03-01',
          reference: undefined,
          status: 'exception'
        },
        {
          transactionId: 'txn:bank:bank-demo-2',
          source: 'bank',
          direction: 'in',
          amountMinor: 50000,
          currency: 'EUR',
          bookedAt: '2026-03-10',
          reference: undefined,
          status: 'exception'
        }
      ]
    }
  }
]

export function getDemoFixture(key: DemoFixture['key']): DemoFixture {
  const fixture = demoFixtures.find((item) => item.key === key)

  if (!fixture) {
    throw new Error(`Unknown demo fixture: ${key}`)
  }

  return fixture
}
