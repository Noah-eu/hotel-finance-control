import { describe, expect, it } from 'vitest'
import type { ExceptionCase, NormalizedTransaction } from '../../src/domain'
import type { DocumentId, ExceptionCaseId, TransactionId } from '../../src/domain'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { runMonthlyReconciliationBatch } from '../../src/monthly-batch'
import { buildReviewScreen } from '../../src/review'

describe('buildReviewScreen', () => {
  it('builds deterministic review sections for matched, unmatched, suspicious, and missing-document items', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const comgate = getRealInputFixture('comgate-export')
    const invoice = getRealInputFixture('invoice-document')

    const batch = runMonthlyReconciliationBatch({
      files: [booking, raiffeisen, comgate, invoice].map((fixture) => ({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content
      })),
      reconciliationContext: {
        runId: 'review-run-2026-03',
        requestedAt: '2026-03-18T23:00:00.000Z'
      },
      reportGeneratedAt: '2026-03-18T23:01:00.000Z'
    })

    const review = buildReviewScreen({
      batch,
      generatedAt: '2026-03-18T23:02:00.000Z'
    })

    expect(review.summary).toEqual(batch.reconciliation.summary)
    expect(review.matched).toHaveLength(1)
    expect(review.unmatched.length).toBeGreaterThan(0)
    expect(review.suspicious.length).toBeGreaterThan(0)
    expect(review.missingDocuments.length).toBeGreaterThan(0)

    expect(review.matched[0]).toMatchObject({
      kind: 'matched'
    })
    expect(review.matched[0].title).toContain('Spárovaná skupina')
    expect(review.matched[0].detail).toContain('Jistota')
    expect(review.suspicious.some((item) => item.title.includes('suspicious_private_expense'))).toBe(true)
    expect(review.missingDocuments.some((item) => item.detail.includes('no supporting invoice or receipt'))).toBe(true)
    expect(review.suspicious.some((item) => item.severity === 'high' || item.detail.length > 0)).toBe(true)
    expect(review.missingDocuments.some((item) => item.kind === 'missing-document' && item.title.startsWith('Chybějící doklad pro'))).toBe(true)
  })

  it('keeps matched items separate from exception-driven review buckets', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const batch = runMonthlyReconciliationBatch({
      files: [booking, raiffeisen].map((fixture) => ({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content
      })),
      reconciliationContext: {
        runId: 'review-run-compact',
        requestedAt: '2026-03-18T23:05:00.000Z'
      },
      reportGeneratedAt: '2026-03-18T23:06:00.000Z'
    })

    const review = buildReviewScreen({
      batch,
      generatedAt: '2026-03-18T23:07:00.000Z'
    })

    const matchedIds = new Set(review.matched.flatMap((item) => item.transactionIds))
    const exceptionIds = new Set([
      ...review.unmatched.flatMap((item) => item.transactionIds),
      ...review.suspicious.flatMap((item) => item.transactionIds),
      ...review.missingDocuments.flatMap((item) => item.transactionIds)
    ])

    for (const transactionId of matchedIds) {
      expect(exceptionIds.has(transactionId)).toBe(false)
    }
  })

  it('prefers explicit rule metadata over explanation text and severity shortcuts when bucketing exceptions', () => {
    const suspiciousByTextOnly = buildExceptionCase({
      id: toExceptionCaseId('exc:text-suspicious'),
      explanation: 'This item looks suspicious and requires review.',
      severity: 'high',
      relatedTransactionIds: [toTransactionId('txn:text-suspicious')]
    })
    const missingByTextOnly = buildExceptionCase({
      id: toExceptionCaseId('exc:text-missing'),
      explanation: 'Outgoing transaction is missing a supporting invoice or receipt.',
      severity: 'high',
      relatedTransactionIds: [toTransactionId('txn:text-missing')]
    })
    const suspiciousByRule = buildExceptionCase({
      id: toExceptionCaseId('exc:rule-suspicious'),
      ruleCode: 'suspicious_private_expense',
      explanation: 'Outgoing expense was flagged by the shared suspicious expense rule.',
      severity: 'high',
      relatedTransactionIds: [toTransactionId('txn:rule-suspicious')]
    })
    const missingByRule = buildExceptionCase({
      id: toExceptionCaseId('exc:rule-missing'),
      ruleCode: 'missing_supporting_document',
      explanation: 'Missing supporting document was detected by the shared expense-document rule.',
      severity: 'high',
      relatedTransactionIds: [toTransactionId('txn:rule-missing')]
    })

    const review = buildReviewScreen({
      generatedAt: '2026-03-19T09:00:00.000Z',
      batch: {
        files: [],
        extractedRecords: [],
        reconciliation: {
          normalizedTransactions: [
            buildTransaction({ id: toTransactionId('txn:text-suspicious'), direction: 'out' }),
            buildTransaction({ id: toTransactionId('txn:text-missing'), direction: 'out' }),
            buildTransaction({ id: toTransactionId('txn:rule-suspicious'), direction: 'out' }),
            buildTransaction({ id: toTransactionId('txn:rule-missing'), direction: 'out' })
          ],
          matching: buildMatchingResult(),
          matchGroups: [],
          exceptionCases: [
            suspiciousByTextOnly,
            missingByTextOnly,
            suspiciousByRule,
            missingByRule
          ],
          normalization: {
            warnings: [],
            trace: []
          },
          exceptions: {
            cases: [
              suspiciousByTextOnly,
              missingByTextOnly,
              suspiciousByRule,
              missingByRule
            ],
            trace: []
          },
          summary: {
            normalizedTransactionCount: 4,
            matchedGroupCount: 0,
            exceptionCount: 4,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          }
        },
        report: {
          generatedAt: '2026-03-19T09:00:00.000Z',
          summary: {
            normalizedTransactionCount: 4,
            matchedGroupCount: 0,
            exceptionCount: 4,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          transactions: []
        }
      }
    })

    expect(review.suspicious.map((item) => item.id)).toEqual([toExceptionCaseId('exc:rule-suspicious')])
    expect(review.missingDocuments.map((item) => item.id)).toEqual([toExceptionCaseId('exc:rule-missing')])
    expect(review.unmatched.map((item) => item.id)).toEqual([
      toExceptionCaseId('exc:text-suspicious'),
      toExceptionCaseId('exc:text-missing')
    ])
  })

  it('keeps unmatched uploaded documents in the missing-document review section through structured exception type', () => {
    const unmatchedDocument = buildExceptionCase({
      id: toExceptionCaseId('exc:doc:invoice-1'),
      type: 'unmatched_document',
      explanation: 'Uploaded document "invoice-1.pdf" is not linked to a reconciled transaction or match group.',
      relatedSourceDocumentIds: [toDocumentId('doc:invoice-1')]
    })

    const review = buildReviewScreen({
      generatedAt: '2026-03-19T09:10:00.000Z',
      batch: {
        files: [],
        extractedRecords: [],
        reconciliation: {
          normalizedTransactions: [],
          matching: buildMatchingResult(),
          matchGroups: [],
          exceptionCases: [unmatchedDocument],
          normalization: {
            warnings: [],
            trace: []
          },
          exceptions: {
            cases: [unmatchedDocument],
            trace: []
          },
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            exceptionCount: 1,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          }
        },
        report: {
          generatedAt: '2026-03-19T09:10:00.000Z',
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            exceptionCount: 1,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          transactions: []
        }
      }
    })

    expect(review.missingDocuments).toHaveLength(1)
    expect(review.missingDocuments[0]).toMatchObject({
      id: toExceptionCaseId('exc:doc:invoice-1'),
      kind: 'missing-document',
      sourceDocumentIds: [toDocumentId('doc:invoice-1')]
    })
    expect(review.unmatched).toHaveLength(0)
    expect(review.suspicious).toHaveLength(0)
  })
})

function buildExceptionCase(overrides: Partial<ExceptionCase> & Pick<ExceptionCase, 'id' | 'explanation'>): ExceptionCase {
  return {
    id: overrides.id,
    type: overrides.type ?? 'unmatched_transaction',
    ruleCode: overrides.ruleCode,
    severity: overrides.severity ?? 'medium',
    status: overrides.status ?? 'open',
    explanation: overrides.explanation,
    relatedTransactionIds: overrides.relatedTransactionIds ?? [],
    relatedExtractedRecordIds: overrides.relatedExtractedRecordIds ?? [],
    relatedSourceDocumentIds: overrides.relatedSourceDocumentIds ?? [],
    recommendedNextStep: overrides.recommendedNextStep,
    createdAt: overrides.createdAt ?? '2026-03-19T09:00:00.000Z',
    resolvedAt: overrides.resolvedAt
  }
}

function buildMatchingResult() {
  return {
    matchGroups: [],
    candidates: [],
    unmatchedExpectedIds: [],
    unmatchedActualIds: []
  }
}

function toExceptionCaseId(value: string): ExceptionCaseId {
  return value as ExceptionCaseId
}

function toTransactionId(value: string): TransactionId {
  return value as TransactionId
}

function toDocumentId(value: string): DocumentId {
  return value as DocumentId
}

function buildTransaction(
  overrides: Partial<NormalizedTransaction> & Pick<NormalizedTransaction, 'id' | 'direction'>
): NormalizedTransaction {
  return {
    id: overrides.id,
    direction: overrides.direction,
    source: overrides.source ?? 'bank',
    amountMinor: overrides.amountMinor ?? 1000,
    currency: overrides.currency ?? 'CZK',
    bookedAt: overrides.bookedAt ?? '2026-03-19T09:00:00.000Z',
    valueAt: overrides.valueAt,
    accountId: overrides.accountId ?? 'acct:test',
    counterparty: overrides.counterparty,
    reference: overrides.reference,
    reservationId: overrides.reservationId,
    invoiceNumber: overrides.invoiceNumber,
    extractedRecordIds: overrides.extractedRecordIds ?? [],
    sourceDocumentIds: overrides.sourceDocumentIds ?? []
  }
}