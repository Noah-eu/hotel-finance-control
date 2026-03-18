import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { runMonthlyReconciliationBatch } from '../../src/monthly-batch'

describe('runMonthlyReconciliationBatch', () => {
  it('runs deterministic extraction, reconciliation, and reporting over representative monthly files', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const comgate = getRealInputFixture('comgate-export')
    const invoice = getRealInputFixture('invoice-document')

    const result = runMonthlyReconciliationBatch({
      files: [booking, raiffeisen, comgate, invoice].map((fixture) => ({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content
      })),
      reconciliationContext: {
        runId: 'monthly-run-2026-03',
        requestedAt: '2026-03-18T22:30:00.000Z'
      },
      reportGeneratedAt: '2026-03-18T22:31:00.000Z'
    })

    expect(result.files).toEqual([
      {
        sourceDocumentId: booking.sourceDocument.id,
        extractedRecordIds: ['booking-payout-1'],
        extractedCount: 1
      },
      {
        sourceDocumentId: raiffeisen.sourceDocument.id,
        extractedRecordIds: ['raif-row-1', 'raif-row-2', 'raif-row-3', 'raif-row-4', 'raif-row-5', 'raif-row-6'],
        extractedCount: 6
      },
      {
        sourceDocumentId: comgate.sourceDocument.id,
        extractedRecordIds: ['comgate-row-1', 'comgate-row-2'],
        extractedCount: 2
      },
      {
        sourceDocumentId: invoice.sourceDocument.id,
        extractedRecordIds: ['invoice-record-1'],
        extractedCount: 1
      }
    ])

    expect(result.extractedRecords).toHaveLength(10)
    expect(result.reconciliation.summary).toEqual({
      normalizedTransactionCount: 9,
      matchedGroupCount: 1,
      exceptionCount: 7,
      unmatchedExpectedCount: 2,
      unmatchedActualCount: 2
    })
    expect(result.report.summary).toEqual(result.reconciliation.summary)
    expect(result.report.matches).toHaveLength(1)
    expect(result.report.exceptions).toHaveLength(7)
  })

  it('fails clearly when a source document has no configured parser', () => {
    expect(() =>
      runMonthlyReconciliationBatch({
        files: [
          {
            sourceDocument: {
              id: 'doc-unknown' as never,
              sourceSystem: 'unknown',
              documentType: 'other',
              fileName: 'unknown.csv',
              uploadedAt: '2026-03-18T22:30:00.000Z'
            },
            content: 'anything'
          }
        ],
        reconciliationContext: {
          runId: 'monthly-run-error',
          requestedAt: '2026-03-18T22:30:00.000Z'
        },
        reportGeneratedAt: '2026-03-18T22:31:00.000Z'
      })
    ).toThrow('No monthly batch parser configured')
  })
})