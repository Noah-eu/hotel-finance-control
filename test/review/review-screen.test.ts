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

    expect(review.summary).toEqual(batch.report.summary)
    expect(review.matched).toHaveLength(1)
    expect(review.payoutBatchMatched).toHaveLength(1)
    expect(review.payoutBatchUnmatched).toHaveLength(2)
    expect(review.unmatched.length).toBeGreaterThan(0)
    expect(review.suspicious.length).toBeGreaterThan(0)
    expect(review.missingDocuments.length).toBeGreaterThan(0)

    expect(review.matched[0]).toMatchObject({
      kind: 'matched'
    })
    expect(review.matched[0].title).toContain('Spárovaná skupina')
    expect(review.matched[0].detail).toContain('Jistota')
    expect(review.suspicious.some((item) => item.title.includes('suspicious_private_expense'))).toBe(true)
    expect(review.missingDocuments.some((item) => item.detail.includes('no structured supporting invoice or receipt match'))).toBe(true)
    expect(review.suspicious.some((item) => item.severity === 'high' || item.detail.length > 0)).toBe(true)
    expect(review.missingDocuments.some((item) => item.kind === 'missing-document' && item.title.startsWith('Chybějící doklad pro'))).toBe(true)
    expect(
      review.payoutBatchUnmatched.some((item) => item.detail.includes('Směřování: RB účet.'))
      || review.reservationSettlementOverview.some((item) => item.detail.includes('RB účet') || item.detail.includes('Fio účet'))
    ).toBe(true)
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
          supportedExpenseLinks: [],
          payoutBatchMatches: [],
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
            payoutBatchMatchCount: 0,
            unmatchedPayoutBatchCount: 0,
            exceptionCount: 4,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          supportedExpenseLinks: [],
          payoutBatchMatches: [],
          unmatchedPayoutBatches: [],
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
          supportedExpenseLinks: [],
          payoutBatchMatches: [],
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
            payoutBatchMatchCount: 0,
            unmatchedPayoutBatchCount: 0,
            exceptionCount: 1,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          supportedExpenseLinks: [],
          payoutBatchMatches: [],
          unmatchedPayoutBatches: [],
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

  it('shows payout-batch matches as separate matched review items without double-counting exceptions', () => {
    const review = buildReviewScreen({
      generatedAt: '2026-03-19T09:20:00.000Z',
      batch: {
        files: [],
        extractedRecords: [],
        reconciliation: {
          normalizedTransactions: [],
          matching: buildMatchingResult(),
          matchGroups: [],
          exceptionCases: [],
          supportedExpenseLinks: [],
          workflowPlan: {
            reservationSources: [],
            ancillaryRevenueSources: [],
            reservationSettlementMatches: [],
            reservationSettlementNoMatches: [],
            payoutRows: [
              {
                rowId: 'txn:payout:payout-1',
                platform: 'booking',
                sourceDocumentId: toDocumentId('doc-payout-1'),
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
              bankTransactionId: toTransactionId('txn:bank:bank-1'),
              bankAccountId: 'raiffeisen-main',
              amountMinor: 125000,
              currency: 'CZK',
              confidence: 0.99,
              ruleKey: 'deterministic:payout-batch-bank:1to1:v1',
              matched: true,
              reasons: ['amountExact', 'currencyExact'],
              evidence: [{ key: 'payoutReference', value: 'PAYOUT-ABC-1' }]
            }
          ],
          normalization: {
            warnings: [],
            trace: []
          },
          exceptions: {
            cases: [],
            trace: []
          },
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          }
        },
        report: {
          generatedAt: '2026-03-19T09:20:00.000Z',
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            payoutBatchMatchCount: 1,
            unmatchedPayoutBatchCount: 0,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          supportedExpenseLinks: [],
          payoutBatchMatches: [
            {
              payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-ABC-1',
              platform: 'Booking',
              payoutReference: 'PAYOUT-ABC-1',
              payoutDate: '2026-03-10',
              bankAccountId: 'raiffeisen-main',
              amountMinor: 125000,
              currency: 'CZK',
              status: 'matched',
              confidence: 0.99,
              reason: 'Shoda dávky a bankovního přípisu podle částky, měny a povoleného směrování.',
              evidence: ['payoutReference: PAYOUT-ABC-1'],
              display: {
                title: 'Booking payout dávka PAYOUT-ABC-1'
              }
            }
          ],
          unmatchedPayoutBatches: [],
          transactions: []
        }
      }
    })

    expect(review.matched).toHaveLength(0)
    expect(review.payoutBatchMatched).toHaveLength(1)
    expect(review.payoutBatchUnmatched).toHaveLength(0)
    expect(review.payoutBatchMatched[0]).toMatchObject({
      title: 'Booking payout dávka PAYOUT-ABC-1'
    })
    expect(review.payoutBatchMatched[0]?.matchStrength).toBe('slabší shoda')
    expect(review.payoutBatchMatched[0]?.evidenceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'částka', value: '1 250,00 Kč · měna sedí' }),
        expect.objectContaining({ label: 'datum', value: 'payout 2026-03-10' }),
        expect.objectContaining({ label: 'protistrana / účet', value: 'raiffeisen-main' })
      ])
    )
    expect(review.summary.payoutBatchMatchCount).toBe(1)
    expect(review.summary.unmatchedPayoutBatchCount).toBe(0)
    expect(review.unmatched).toHaveLength(0)
  })

  it('shows unmatched payout batches as separate business-facing unmatched review items', () => {
    const review = buildReviewScreen({
      generatedAt: '2026-03-19T09:25:00.000Z',
      batch: {
        files: [],
        extractedRecords: [],
        reconciliation: {
          normalizedTransactions: [],
          matching: buildMatchingResult(),
          matchGroups: [],
          exceptionCases: [],
          supportedExpenseLinks: [],
          workflowPlan: {
            reservationSources: [],
            ancillaryRevenueSources: [],
            reservationSettlementMatches: [],
            reservationSettlementNoMatches: [],
            payoutRows: [
              {
                rowId: 'txn:payout:payout-1',
                platform: 'booking',
                sourceDocumentId: toDocumentId('doc-payout-1'),
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
          payoutBatchMatches: [],
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
          ],
          normalization: {
            warnings: [],
            trace: []
          },
          exceptions: {
            cases: [],
            trace: []
          },
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          }
        },
        report: {
          generatedAt: '2026-03-19T09:25:00.000Z',
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            payoutBatchMatchCount: 0,
            unmatchedPayoutBatchCount: 1,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          supportedExpenseLinks: [],
          payoutBatchMatches: [],
          unmatchedPayoutBatches: [
            {
              payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-ABC-1',
              platform: 'Booking',
              payoutReference: 'PAYOUT-ABC-1',
              payoutDate: '2026-03-10',
              bankRoutingLabel: 'RB účet',
              amountMinor: 125000,
              currency: 'CZK',
              status: 'unmatched',
              reason: 'Žádná bankovní položka se stejnou částkou.',
              display: {
                title: 'Booking payout dávka PAYOUT-ABC-1'
              }
            }
          ],
          transactions: []
        }
      }
    })

    expect(review.matched).toHaveLength(0)
    expect(review.payoutBatchMatched).toHaveLength(0)
    expect(review.payoutBatchUnmatched).toHaveLength(1)
    expect(review.payoutBatchUnmatched[0]).toMatchObject({
      kind: 'unmatched',
      title: 'Booking payout dávka PAYOUT-ABC-1'
    })
    expect(review.payoutBatchUnmatched[0]?.matchStrength).toBe('nespárováno')
    expect(review.payoutBatchUnmatched[0]?.evidenceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'částka', value: '1 250,00 Kč' }),
        expect.objectContaining({ label: 'datum', value: '2026-03-10' }),
        expect.objectContaining({ label: 'protistrana / účet', value: 'RB účet' })
      ])
    )
    expect(review.payoutBatchUnmatched[0]?.detail).toContain('Žádná bankovní položka se stejnou částkou.')
    expect(review.payoutBatchUnmatched[0]?.detail).toContain('Směřování: RB účet.')
    expect(review.payoutBatchUnmatched[0]?.detail).not.toContain('noExactAmount')
  })

  it('shows the matched bank-line summary on Booking payout review items resolved from supplement reference hints', () => {
    const review = buildReviewScreen({
      generatedAt: '2026-03-25T11:30:00.000Z',
      batch: {
        files: [],
        extractedRecords: [],
        reconciliation: {
          normalizedTransactions: [],
          matching: buildMatchingResult(),
          matchGroups: [],
          exceptionCases: [],
          supportedExpenseLinks: [],
          workflowPlan: {
            reservationSources: [],
            ancillaryRevenueSources: [],
            reservationSettlementMatches: [],
            reservationSettlementNoMatches: [],
            payoutRows: [],
            payoutBatches: [],
            directBankSettlements: [],
            expenseDocuments: [],
            bankFeeClassifications: []
          },
          payoutBatchMatches: [],
          payoutBatchNoMatchDiagnostics: [],
          normalization: {
            warnings: [],
            trace: []
          },
          exceptions: {
            cases: [],
            trace: []
          },
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          }
        },
        report: {
          generatedAt: '2026-03-25T11:30:00.000Z',
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            payoutBatchMatchCount: 1,
            unmatchedPayoutBatchCount: 0,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          supportedExpenseLinks: [],
          payoutBatchMatches: [
            {
              payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
              platform: 'Booking',
              payoutReference: 'PAYOUT-BOOK-20260310',
              payoutDate: '2026-03-12',
              bankAccountId: 'raiffeisen-main',
              matchedBankSummary: '2026-03-13T09:12:00 · BOOKING.COM B.V. · NO.AAOS6MOZUH8BFTER/2206371',
              amountMinor: 3553012,
              currency: 'CZK',
              status: 'matched',
              confidence: 0.992,
              reason: 'Shoda dávky a bankovního přípisu podle lokální payout částky, data payoutu, Booking protiúčtu a booking reference hintu.',
              evidence: ['referenceHints: 2206371'],
              display: {
                title: 'Booking payout 010638445054 / 35 530,12 Kč',
                context: 'Datum payoutu: 2026-03-12 · Celkem payoutu: 1 456,42 EUR · IBAN 5956'
              }
            }
          ],
          unmatchedPayoutBatches: [],
          transactions: []
        }
      }
    })

    expect(review.payoutBatchMatched[0]).toMatchObject({
      title: 'Booking payout 010638445054 / 35 530,12 Kč'
    })
    expect(review.payoutBatchMatched[0]?.matchStrength).toBe('potvrzená shoda')
    expect(review.payoutBatchMatched[0]?.evidenceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'reference', value: expect.stringContaining('PAYOUT-BOOK-20260310') }),
        expect.objectContaining({ label: 'protistrana / účet', value: expect.stringContaining('BOOKING.COM B.V.') })
      ])
    )
    expect(review.payoutBatchMatched[0]?.detail).toContain(
      'Bankovní přípis: 2026-03-13T09:12:00 · BOOKING.COM B.V. · NO.AAOS6MOZUH8BFTER/2206371.'
    )
  })

  it('uses explicit payout-batch display metadata instead of re-deriving titles from synthetic payout references', () => {
    const review = buildReviewScreen({
      generatedAt: '2026-03-24T10:10:00.000Z',
      batch: {
        files: [],
        extractedRecords: [],
        reconciliation: {
          normalizedTransactions: [],
          matching: buildMatchingResult(),
          matchGroups: [],
          exceptionCases: [],
          supportedExpenseLinks: [],
          workflowPlan: {
            reservationSources: [],
            ancillaryRevenueSources: [],
            reservationSettlementMatches: [],
            reservationSettlementNoMatches: [],
            payoutRows: [
              {
                rowId: 'txn:payout:airbnb-transfer-1',
                platform: 'airbnb',
                sourceDocumentId: toDocumentId('doc-airbnb-1'),
                payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
                payoutDate: '2026-03-20',
                payoutBatchKey: 'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-396105',
                amountMinor: 396105,
                currency: 'CZK',
                bankRoutingTarget: 'rb_bank_inflow'
              }
            ],
            payoutBatches: [
              {
                payoutBatchKey: 'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-396105',
                platform: 'airbnb',
                payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
                payoutDate: '2026-03-20',
                bankRoutingTarget: 'rb_bank_inflow',
                rowIds: ['txn:payout:airbnb-transfer-1'],
                expectedTotalMinor: 396105,
                currency: 'CZK'
              }
            ],
            directBankSettlements: [],
            expenseDocuments: [],
            bankFeeClassifications: []
          },
          payoutBatchMatches: [
            {
              payoutBatchKey: 'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-396105',
              payoutBatchRowIds: ['txn:payout:airbnb-transfer-1'],
              bankTransactionId: 'txn:bank:rb-1' as never,
              bankAccountId: 'raiffeisen-main',
              amountMinor: 396105,
              currency: 'CZK',
              confidence: 0.97,
              ruleKey: 'payout-bank:airbnb',
              matched: true,
              reasons: ['amountExact'],
              evidence: []
            }
          ],
          payoutBatchNoMatchDiagnostics: [
            {
              payoutBatchKey: 'airbnb-batch:2026-03-21:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-19:PAYOUT-2026-03-21:AMOUNT-824196',
              payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
              platform: 'airbnb',
              expectedTotalMinor: 824196,
              currency: 'CZK',
              payoutDate: '2026-03-21',
              bankRoutingTarget: 'rb_bank_inflow',
              eligibleCandidates: [],
              allInboundBankCandidates: [],
              noMatchReason: 'noExactAmount',
              matched: false
            }
          ],
          normalization: {
            warnings: [],
            trace: []
          },
          exceptions: {
            cases: [],
            trace: []
          },
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          }
        },
        report: {
          generatedAt: '2026-03-24T10:10:00.000Z',
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            payoutBatchMatchCount: 1,
            unmatchedPayoutBatchCount: 1,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          supportedExpenseLinks: [],
          payoutBatchMatches: [
            {
              payoutBatchKey: 'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-396105',
              platform: 'Airbnb',
              payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
              payoutDate: '2026-03-20',
              bankAccountId: 'raiffeisen-main',
              amountMinor: 396105,
              currency: 'CZK',
              status: 'matched',
              confidence: 0.97,
              reason: 'Shoda dávky a bankovního přípisu podle částky, měny a povoleného směrování.',
              evidence: [],
              display: {
                title: 'Airbnb payout dávka 2026-03-20 / 3 961,05 Kč',
                context: 'Reference payoutu: AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
              }
            }
          ],
          unmatchedPayoutBatches: [
            {
              payoutBatchKey: 'airbnb-batch:2026-03-21:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-19:PAYOUT-2026-03-21:AMOUNT-824196',
              platform: 'Airbnb',
              payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
              payoutDate: '2026-03-21',
              bankRoutingLabel: 'RB účet',
              amountMinor: 824196,
              currency: 'CZK',
              status: 'unmatched',
              reason: 'Žádná bankovní položka se stejnou částkou.',
              display: {
                title: 'Airbnb payout dávka 2026-03-21 / 8 241,96 Kč',
                context: 'Reference payoutu: AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
              }
            }
          ],
          transactions: []
        }
      }
    })

    expect(review.payoutBatchMatched[0]?.title).toBe('Airbnb payout dávka 2026-03-20 / 3 961,05 Kč')
    expect(review.payoutBatchUnmatched[0]?.title).toBe('Airbnb payout dávka 2026-03-21 / 8 241,96 Kč')
    expect(review.payoutBatchMatched[0]?.matchStrength).toBe('slabší shoda')
    expect(review.payoutBatchUnmatched[0]?.matchStrength).toBe('nespárováno')
    expect(review.payoutBatchMatched[0]?.title).not.toContain('AIRBNB-TRANSFER:')
    expect(review.payoutBatchUnmatched[0]?.title).not.toContain('AIRBNB-TRANSFER:')
    expect(review.payoutBatchMatched[0]?.detail).toContain('Částka: 3 961,05 Kč.')
    expect(review.payoutBatchUnmatched[0]?.detail).toContain('Očekávaná částka: 8 241,96 Kč.')
  })

  it('shows explicit document-to-bank relation status for parsed documents that still need manual review', () => {
    const unmatchedDocument = buildExceptionCase({
      id: toExceptionCaseId('exc:doc:invoice-qr'),
      type: 'unmatched_document',
      explanation: 'Uploaded document "invoice-qr.pdf" is not linked to a reconciled transaction or match group.',
      relatedSourceDocumentIds: [toDocumentId('doc:invoice-qr')]
    })

    const review = buildReviewScreen({
      generatedAt: '2026-03-29T11:00:00.000Z',
      batch: {
        files: [],
        extractedRecords: [
          {
            id: 'invoice-record-qr',
            sourceDocumentId: toDocumentId('doc:invoice-qr'),
            recordType: 'invoice-document',
            extractedAt: '2026-03-29T11:00:00.000Z',
            amountMinor: 1850000,
            currency: 'CZK',
            occurredAt: '2026-03-25',
            data: {
              sourceSystem: 'invoice',
              invoiceNumber: 'QR-141260183',
              amountMinor: 1850000,
              currency: 'CZK'
            }
          }
        ],
        reconciliation: {
          normalizedTransactions: [],
          matching: buildMatchingResult(),
          matchGroups: [],
          exceptionCases: [unmatchedDocument],
          supportedExpenseLinks: [],
          payoutBatchMatches: [],
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
          generatedAt: '2026-03-29T11:00:00.000Z',
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            payoutBatchMatchCount: 0,
            unmatchedPayoutBatchCount: 0,
            exceptionCount: 1,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          supportedExpenseLinks: [],
          payoutBatchMatches: [],
          unmatchedPayoutBatches: [],
          transactions: []
        }
      }
    })

    expect(review.missingDocuments[0]?.matchStrength).toBe('vyžaduje kontrolu')
    expect(review.missingDocuments[0]?.documentBankRelation).toBe('Doklad je načtený, ale zatím bez potvrzené bankovní vazby.')
  })

  it('shows reservation-settlement no-matches as a separate business-facing review section without raw matcher codes', () => {
    const previo = getRealInputFixture('previo-reservation-export')
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const batch = runMonthlyReconciliationBatch({
      files: [
        {
          sourceDocument: {
            id: 'uploaded:previo:1:prehled-rezervaci-xlsx' as DocumentId,
            sourceSystem: 'previo',
            documentType: 'reservation_export',
            fileName: 'Prehled_rezervaci.xlsx',
            uploadedAt: '2026-03-21T16:00:00.000Z'
          },
          content: previo.rawInput.content,
          binaryContentBase64: previo.rawInput.binaryContentBase64
        },
        {
          sourceDocument: booking.sourceDocument,
          content: booking.rawInput.content
        }
      ],
      reconciliationContext: {
        runId: 'review-reservation-no-match',
        requestedAt: '2026-03-21T16:00:00.000Z'
      },
      reportGeneratedAt: '2026-03-21T16:00:00.000Z'
    })

    const review = buildReviewScreen({
      batch,
      generatedAt: '2026-03-21T16:00:00.000Z'
    })

    expect(review.unmatchedReservationSettlements).toHaveLength(1)
    expect(review.unmatchedReservationSettlements[0]).toMatchObject({
      kind: 'unmatched-reservation-settlement',
      title: 'Rezervace PREVIO-20260314'
    })
    expect(review.unmatchedReservationSettlements[0]?.detail).toContain('Chybí deterministická vazba na odpovídající úhradu.')
    expect(review.unmatchedReservationSettlements[0]?.detail).toContain('Kanál: Přímá rezervace.')
    expect(review.unmatchedReservationSettlements[0]?.detail).toContain('Pobyt: 2026-03-14 – 2026-03-16.')
    expect(review.unmatchedReservationSettlements[0]?.detail).toContain('Částka: 420,00 CZK.')
    expect(review.unmatchedReservationSettlements[0]?.detail).not.toContain('noCandidate')
  })

  it('uses Booking payout supplement display metadata in the unmatched payout review item', () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const bookingPdf = getRealInputFixture('booking-payout-statement-pdf')

    const batch = runMonthlyReconciliationBatch({
      files: [
        {
          sourceDocument: booking.sourceDocument,
          content: booking.rawInput.content
        },
        {
          sourceDocument: bookingPdf.sourceDocument,
          content: bookingPdf.rawInput.content,
          binaryContentBase64: bookingPdf.rawInput.binaryContentBase64
        }
      ],
      reconciliationContext: {
        runId: 'review-booking-payout-pdf-supplement',
        requestedAt: '2026-03-24T12:30:00.000Z'
      },
      reportGeneratedAt: '2026-03-24T12:31:00.000Z'
    })

    const review = buildReviewScreen({
      batch,
      generatedAt: '2026-03-24T12:31:00.000Z'
    })

    expect(review.payoutBatchMatched).toEqual([])
    expect(review.payoutBatchUnmatched).toEqual([
      expect.objectContaining({
        title: 'Booking payout PAYOUT-BOOK-20260310 / 1 250,00 Kč',
        detail: expect.stringContaining('Kontext payoutu: Datum payoutu: 2026-03-12 · IBAN 5956 · rezervace: 1.')
      })
    ])
  })

  it('surfaces separate accommodation and ancillary settlement overview items with expected path and candidate status', () => {
    const review = buildReviewScreen({
      generatedAt: '2026-03-22T09:00:00.000Z',
      batch: {
        files: [],
        extractedRecords: [],
        reconciliation: {
          normalizedTransactions: [],
          matching: buildMatchingResult(),
          matchGroups: [],
          exceptionCases: [],
          supportedExpenseLinks: [],
          workflowPlan: {
            reservationSources: [
              {
                reservationId: 'PREVIO-CG-20260314',
                sourceDocumentId: toDocumentId('doc-previo-1'),
                sourceSystem: 'previo',
                bookedAt: '2026-03-14',
                reference: 'PREVIO-CG-20260314',
                guestName: 'Jan Novak',
                channel: 'comgate',
                stayStartAt: '2026-03-14',
                stayEndAt: '2026-03-16',
                grossRevenueMinor: 42000,
                currency: 'CZK',
                roomName: 'A101',
                expectedSettlementChannels: ['comgate']
              }
            ],
            ancillaryRevenueSources: [
              {
                sourceDocumentId: toDocumentId('doc-previo-1'),
                sourceSystem: 'previo',
                reference: 'PREVIO-CG-20260314',
                reservationId: 'PREVIO-CG-20260314',
                bookedAt: '2026-03-14',
                itemLabel: 'Parkování 1',
                channel: 'comgate',
                grossRevenueMinor: 4000,
                currency: 'CZK'
              }
            ],
            reservationSettlementMatches: [
              {
                reservationId: 'PREVIO-CG-20260314',
                reference: 'PREVIO-CG-20260314',
                sourceDocumentId: toDocumentId('doc-previo-1'),
                settlementKind: 'payout_row',
                matchedRowId: 'txn:payout:comgate-row-1',
                platform: 'comgate',
                amountMinor: 42000,
                currency: 'CZK',
                confidence: 1,
                reasons: ['reservationIdExact', 'amountExact', 'channelAligned'],
                evidence: []
              }
            ],
            reservationSettlementNoMatches: [],
            payoutRows: [
              {
                rowId: 'txn:payout:comgate-row-1',
                platform: 'comgate',
                sourceDocumentId: toDocumentId('doc-comgate-1'),
                reservationId: 'PREVIO-CG-20260314',
                payoutReference: 'CG-SETTLEMENT-ACCOM',
                payoutDate: '2026-03-15',
                payoutBatchKey: 'comgate-batch:2026-03-15:CG-SETTLEMENT-ACCOM',
                amountMinor: 42000,
                currency: 'CZK',
                bankRoutingTarget: 'rb_bank_inflow'
              },
              {
                rowId: 'txn:payout:comgate-row-2',
                platform: 'comgate',
                sourceDocumentId: toDocumentId('doc-comgate-1'),
                reservationId: 'PREVIO-CG-20260314',
                payoutReference: 'CG-SETTLEMENT-PARK',
                payoutDate: '2026-03-15',
                payoutBatchKey: 'comgate-batch:2026-03-15:CG-SETTLEMENT-PARK',
                amountMinor: 4000,
                currency: 'CZK',
                bankRoutingTarget: 'rb_bank_inflow'
              }
            ],
            payoutBatches: [],
            directBankSettlements: [],
            expenseDocuments: [],
            bankFeeClassifications: []
          },
          payoutBatchMatches: [],
          normalization: {
            warnings: [],
            trace: []
          },
          exceptions: {
            cases: [],
            trace: []
          },
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          }
        },
        report: {
          generatedAt: '2026-03-22T09:00:00.000Z',
          summary: {
            normalizedTransactionCount: 0,
            matchedGroupCount: 0,
            payoutBatchMatchCount: 0,
            unmatchedPayoutBatchCount: 0,
            exceptionCount: 0,
            unmatchedExpectedCount: 0,
            unmatchedActualCount: 0
          },
          matches: [],
          exceptions: [],
          supportedExpenseLinks: [],
          payoutBatchMatches: [],
          unmatchedPayoutBatches: [],
          transactions: []
        }
      }
    })

    expect(review.reservationSettlementOverview).toHaveLength(1)
    expect(review.reservationSettlementOverview[0]?.title).toBe('Rezervace PREVIO-CG-20260314')
    expect(review.reservationSettlementOverview[0]?.detail).toContain('Typ položky: Hlavní ubytovací rezervace.')
    expect(review.reservationSettlementOverview[0]?.detail).toContain('Jednotka: A101.')
    expect(review.reservationSettlementOverview[0]?.detail).toContain('Očekávaná cesta úhrady: očekávaná úhrada přes platební bránu na RB účet, typicky se stopou Comgate v protiúčtu.')
    expect(review.reservationSettlementOverview[0]?.detail).toContain('Pasuje s kandidátem: Platební brána')
    expect(review.ancillarySettlementOverview).toHaveLength(1)
    expect(review.ancillarySettlementOverview[0]?.detail).toContain('Typ položky: Doplňková položka.')
    expect(review.ancillarySettlementOverview[0]?.detail).toContain('Položka: Parkování 1.')
    expect(review.ancillarySettlementOverview[0]?.detail).toContain('Očekávaná cesta úhrady: očekávaná úhrada přes platební bránu na RB účet, typicky se stopou Comgate v protiúčtu.')
    expect(review.ancillarySettlementOverview[0]?.detail).toContain('Pasuje s kandidátem: Platební brána')
    expect(review.reservationSettlementOverview[0]?.detail).not.toContain('noCandidate')
    expect(review.ancillarySettlementOverview[0]?.detail).not.toContain('noCandidate')
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
