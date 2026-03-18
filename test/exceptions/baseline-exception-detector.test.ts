import { describe, expect, it } from 'vitest'
import type { ExceptionDetectionContext } from '../../src/exceptions'
import { detectExceptions } from '../../src/exceptions'
import type { MatchGroup, SourceDocument } from '../../src/domain'

const context: ExceptionDetectionContext = {
  runId: 'run-exc-1',
  requestedAt: '2026-03-18T10:30:00.000Z'
}

function sourceDocument(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: 'doc-1' as SourceDocument['id'],
    sourceSystem: 'invoice',
    documentType: 'invoice',
    fileName: 'invoice-1.pdf',
    uploadedAt: '2026-03-18T09:00:00.000Z',
    ...overrides
  }
}

function matchGroup(overrides: Partial<MatchGroup> = {}): MatchGroup {
  return {
    id: 'match-1' as MatchGroup['id'],
    transactionIds: ['txn-1' as MatchGroup['transactionIds'][number]],
    status: 'proposed',
    reason: 'Potential payout-bank match',
    confidence: 0.72,
    ruleKey: 'deterministic:payout-bank:1to1:v1',
    autoCreated: true,
    createdAt: '2026-03-18T09:05:00.000Z',
    ...overrides
  }
}

describe('BaselineExceptionDetector', () => {
  it('creates an exception case for unmatched transactions', () => {
    const result = detectExceptions(
      {
        unmatchedTransactions: [
          {
            transactionId: 'txn-unmatched-1' as MatchGroup['transactionIds'][number],
            reason: 'Outgoing bank transaction has no linked invoice.',
            ruleCode: 'missing_supporting_document',
            severity: 'high',
            sourceDocumentIds: ['doc-expense-1' as SourceDocument['id']],
            extractedRecordIds: ['record-1'],
            recommendedNextStep: 'Collect the missing invoice or receipt and link it to this expense transaction.'
          }
        ]
      },
      context
    )

    expect(result.cases).toHaveLength(1)
    expect(result.cases[0]).toMatchObject({
      type: 'unmatched_transaction',
      ruleCode: 'missing_supporting_document',
      severity: 'high',
      status: 'open',
      relatedTransactionIds: ['txn-unmatched-1'],
      relatedSourceDocumentIds: ['doc-expense-1'],
      relatedExtractedRecordIds: ['record-1']
    })
    expect(result.cases[0].recommendedNextStep).toContain('Collect the missing invoice or receipt')
    expect(result.trace).toEqual([
      {
        exceptionCaseId: 'exc:txn:txn-unmatched-1',
        source: 'unmatched_transaction',
        referenceId: 'txn-unmatched-1'
      }
    ])
  })

  it('creates a high severity exception for unmatched uploaded documents', () => {
    const result = detectExceptions(
      {
        unmatchedDocuments: [
          sourceDocument({
            id: 'doc-unmatched-1' as SourceDocument['id'],
            fileName: 'receipt-missing-link.pdf',
            sourceSystem: 'receipt'
          })
        ]
      },
      context
    )

    expect(result.cases).toHaveLength(1)
    expect(result.cases[0].type).toBe('unmatched_document')
    expect(result.cases[0].severity).toBe('high')
    expect(result.cases[0].recommendedNextStep).toContain('Check extraction results')
    expect(result.trace[0]).toEqual({
      exceptionCaseId: 'exc:doc:doc-unmatched-1',
      source: 'unmatched_document',
      referenceId: 'doc-unmatched-1'
    })
  })

  it('flags low confidence matches and honors default status overrides', () => {
    const result = detectExceptions(
      {
        lowConfidenceMatches: [
          {
            matchGroup: matchGroup({ id: 'match-low-1' as MatchGroup['id'], confidence: 0.18 }),
            threshold: 0.6
          }
        ]
      },
      {
        ...context,
        defaultStatus: 'in_review'
      }
    )

    expect(result.cases).toHaveLength(1)
    expect(result.cases[0]).toMatchObject({
      type: 'low_confidence_match',
      severity: 'high',
      status: 'in_review',
      relatedTransactionIds: ['txn-1']
    })
    expect(result.cases[0].explanation).toContain('below threshold 0.60')
  })

  it('preserves suspicious-expense rule metadata and traceability for review flows', () => {
    const result = detectExceptions(
      {
        unmatchedTransactions: [
          {
            transactionId: 'txn-suspicious-1' as MatchGroup['transactionIds'][number],
            reason: 'Outgoing expense txn-suspicious-1 is flagged as suspicious/private because its reference "PERSONAL-TECH" looks personal.',
            ruleCode: 'suspicious_private_expense',
            severity: 'high',
            sourceDocumentIds: ['doc-expense-2' as SourceDocument['id']],
            extractedRecordIds: ['record-2']
          }
        ]
      },
      context
    )

    expect(result.cases[0]).toMatchObject({
      type: 'unmatched_transaction',
      ruleCode: 'suspicious_private_expense',
      severity: 'high',
      relatedTransactionIds: ['txn-suspicious-1'],
      relatedSourceDocumentIds: ['doc-expense-2'],
      relatedExtractedRecordIds: ['record-2']
    })
  })
})
