import { describe, expect, it } from 'vitest'
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
})