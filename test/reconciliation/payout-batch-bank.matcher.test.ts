import { describe, expect, it } from 'vitest'
import type { NormalizedTransaction, PayoutBatchExpectation } from '../../src/domain'
import {
    diagnoseUnmatchedPayoutBatchesToBank,
    matchPayoutBatchesToBank,
    reconcileExtractedRecords
} from '../../src/reconciliation'
import { getRealInputFixture } from '../../src/real-input-fixtures'

function bankTransaction(overrides: Partial<NormalizedTransaction>): NormalizedTransaction {
    return {
        id: 'txn:bank:default' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'bank',
        amountMinor: 125000,
        currency: 'CZK',
        bookedAt: '2026-03-12',
        accountId: 'raiffeisen-main',
        extractedRecordIds: ['bank-1'],
        sourceDocumentIds: ['doc-bank-1' as NormalizedTransaction['sourceDocumentIds'][number]],
        ...overrides
    }
}

function bookingBatch(): PayoutBatchExpectation {
  return {
    payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
    platform: 'booking',
        payoutReference: 'PAYOUT-BOOK-20260310',
        payoutDate: '2026-03-12',
        bankRoutingTarget: 'rb_bank_inflow',
        rowIds: ['txn:payout:booking-payout-1', 'txn:payout:booking-payout-2'],
        expectedTotalMinor: 125000,
    currency: 'CZK'
  }
}

function bookingBatchWithSupplement(
  overrides: Partial<PayoutBatchExpectation> = {}
): PayoutBatchExpectation {
  return {
    ...bookingBatch(),
    payoutSupplementPaymentId: '010638445054',
    payoutSupplementPayoutDate: '2026-03-12',
    payoutSupplementPayoutTotalAmountMinor: 145642,
    payoutSupplementPayoutTotalCurrency: 'EUR',
    payoutSupplementLocalAmountMinor: 3553012,
    payoutSupplementLocalCurrency: 'CZK',
    payoutSupplementIbanSuffix: '5956',
    payoutSupplementReferenceHints: ['2206371'],
    payoutSupplementSourceDocumentIds: [
      'doc-booking-pdf-1' as unknown as NonNullable<PayoutBatchExpectation['payoutSupplementSourceDocumentIds']>[number]
    ],
    payoutSupplementReservationIds: ['RES-BOOK-8841'],
    ...overrides
  }
}

describe('matchPayoutBatchesToBank', () => {
    it('matches one Booking payout batch to one RB bank inflow deterministically', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [bookingBatch()],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:booking-1' as NormalizedTransaction['id'],
                    reference: 'PAYOUT-BOOK-20260310'
                })
            ]
        })

        expect(matches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
                bankTransactionId: 'txn:bank:booking-1',
                matched: true,
                ruleKey: 'deterministic:payout-batch-bank:1to1:v1'
            })
        ])
        expect(matches[0]?.reasons).toContain('payoutReferenceAligned')
    })

    it('prefers the observed platform counterparty clue when multiple exact-amount RB candidates exist', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [bookingBatch()],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:booking-clue' as NormalizedTransaction['id'],
                    counterparty: 'Booking BV',
                    bookedAt: '2026-03-12'
                }),
                bankTransaction({
                    id: 'txn:bank:non-clue' as NormalizedTransaction['id'],
                    counterparty: 'Some Other Merchant',
                    bookedAt: '2026-03-13'
                })
            ]
        })

        expect(matches).toEqual([
            expect.objectContaining({
                bankTransactionId: 'txn:bank:booking-clue'
            })
        ])
        expect(matches[0]?.reasons).toContain('counterpartyClueAligned')
    })

    it('matches a Booking payout batch by supplemental paymentId and local bank amount when the bank line does not contain the Booking payout reference', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [bookingBatchWithSupplement({
                expectedTotalMinor: 145642,
                currency: 'EUR'
            })],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:booking-payment-id' as NormalizedTransaction['id'],
                    amountMinor: 3553012,
                    currency: 'CZK',
                    bookedAt: '2026-03-12',
                    counterparty: 'Incoming bank transfer',
                    reference: '010638445054'
                })
            ]
        })

        expect(matches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
                bankTransactionId: 'txn:bank:booking-payment-id',
                amountMinor: 3553012,
                currency: 'CZK',
                matched: true
            })
        ])
        expect(matches[0]?.reasons).toContain('supplementPaymentIdAligned')
        expect(matches[0]?.evidence).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'paymentId', value: '010638445054' })
        ]))
    })

    it('matches a Booking payout batch by supplemental reference hint when the bank line carries the local amount, Booking counterparty, and property reference fragment', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [bookingBatchWithSupplement({
                expectedTotalMinor: 145642,
                currency: 'EUR',
                payoutSupplementReservationIds: undefined
            })],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:booking-reference-hint' as NormalizedTransaction['id'],
                    amountMinor: 3553012,
                    currency: 'CZK',
                    bookedAt: '2026-03-13',
                    counterparty: 'BOOKING.COM B.V.',
                    reference: 'NO.AAOS6MOZUH8BFTER/2206371'
                }),
                bankTransaction({
                    id: 'txn:bank:booking-other' as NormalizedTransaction['id'],
                    amountMinor: 3553012,
                    currency: 'CZK',
                    bookedAt: '2026-03-13',
                    counterparty: 'BOOKING.COM B.V.',
                    reference: 'NO.AAOS6MOZUH8BFTER/9999999'
                })
            ]
        })

        expect(matches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
                bankTransactionId: 'txn:bank:booking-reference-hint',
                amountMinor: 3553012,
                currency: 'CZK',
                matched: true,
                reasons: expect.arrayContaining([
                    'supplementReferenceHintAligned',
                    'counterpartyClueAligned'
                ]),
                evidence: expect.arrayContaining([
                    expect.objectContaining({ key: 'referenceHints', value: '2206371' }),
                    expect.objectContaining({ key: 'bankCounterparty', value: 'BOOKING.COM B.V.' }),
                    expect.objectContaining({ key: 'bankReference', value: 'NO.AAOS6MOZUH8BFTER/2206371' })
                ])
            })
        ])
    })

    it('leaves ambiguous bank candidates unmatched', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [bookingBatch()],
            bankTransactions: [
                bankTransaction({ id: 'txn:bank:booking-a' as NormalizedTransaction['id'] }),
                bankTransaction({ id: 'txn:bank:booking-b' as NormalizedTransaction['id'], bookedAt: '2026-03-13' })
            ]
        })

        expect(matches).toEqual([])
    })

    it('does not match a wrong-amount bank inflow', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [bookingBatch()],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:wrong-amount' as NormalizedTransaction['id'],
                    amountMinor: 124999,
                    reference: 'PAYOUT-BOOK-20260310'
                })
            ]
        })

        expect(matches).toEqual([])
    })

    it('does not match a wrong-bank routing candidate when routing is explicit', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [bookingBatch()],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:fio-candidate' as NormalizedTransaction['id'],
                    accountId: 'fio-expedia',
                    reference: 'PAYOUT-BOOK-20260310'
                })
            ]
        })

        expect(matches).toEqual([])
    })

    it('diagnoses exact-amount failure when real bank inflows exist but none match the batch total', () => {
        const diagnostics = diagnoseUnmatchedPayoutBatchesToBank({
            payoutBatches: [bookingBatch()],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:rb-real' as NormalizedTransaction['id'],
                    amountMinor: 154000,
                    bookedAt: '2026-03-19',
                    accountId: '5599955956/5500',
                    reference: 'Platba rezervace WEB-2001'
                }),
                bankTransaction({
                    id: 'txn:bank:fio-real' as NormalizedTransaction['id'],
                    amountMinor: 154000,
                    bookedAt: '2026-03-19',
                    accountId: '8888997777/2010',
                    reference: 'Platba rezervace WEB-2001'
                })
            ]
        })

        expect(diagnostics).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
                expectedTotalMinor: 125000,
                currency: 'CZK',
                payoutDate: '2026-03-12',
                noMatchReason: 'noExactAmount',
                matched: false
            })
        ])
        expect(diagnostics[0]?.eligibleCandidates).toEqual([])
        expect(diagnostics[0]?.allInboundBankCandidates).toEqual([
            expect.objectContaining({
                bankTransactionId: 'txn:bank:rb-real',
                bankAccountId: '5599955956/5500',
                amountMinor: 154000,
                bookedAt: '2026-03-19',
                rejectionReasons: ['noExactAmount', 'dateToleranceMiss']
            }),
            expect.objectContaining({
                bankTransactionId: 'txn:bank:fio-real',
                bankAccountId: '8888997777/2010',
                amountMinor: 154000,
                bookedAt: '2026-03-19',
                rejectionReasons: ['noExactAmount', 'wrongBankRouting', 'dateToleranceMiss']
            })
        ])
    })

    it('matches a unique Airbnb exact-amount RB candidate even when the bank line only carries generic transfer wording', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [{
                payoutBatchKey: 'airbnb-batch:2026-03-15:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK)',
                platform: 'airbnb',
                payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
                payoutDate: '2026-03-15',
                bankRoutingTarget: 'rb_bank_inflow',
                rowIds: ['txn:payout:airbnb-payout-2'],
                expectedTotalMinor: 98000,
                currency: 'CZK'
            }],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:airbnb-noclued' as NormalizedTransaction['id'],
                    amountMinor: 98000,
                    accountId: '5599955956/5500',
                    bookedAt: '2026-03-15',
                    counterparty: 'Other Bank Clearing',
                    reference: 'Settlement credit'
                })
            ]
        })

        expect(matches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'airbnb-batch:2026-03-15:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK)',
                bankTransactionId: 'txn:bank:airbnb-noclued',
                matched: true,
                amountMinor: 98000,
                currency: 'CZK'
            })
        ])
        expect(matches[0]?.reasons).not.toContain('counterpartyClueAligned')
    })

    it('keeps a unique Airbnb exact-amount RB candidate eligible when the bank posting lands three days before the payout availability date', () => {
        const matches = matchPayoutBatchesToBank({
            payoutBatches: [{
                payoutBatchKey: 'airbnb-batch:2026-03-15:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK)',
                platform: 'airbnb',
                payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
                payoutDate: '2026-03-15',
                bankRoutingTarget: 'rb_bank_inflow',
                rowIds: ['txn:payout:airbnb-payout-2'],
                expectedTotalMinor: 98000,
                currency: 'CZK'
            }],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:airbnb-three-day-gap' as NormalizedTransaction['id'],
                    amountMinor: 98000,
                    accountId: '5599955956/5500',
                    bookedAt: '2026-03-12',
                    counterparty: 'Incoming bank transfer',
                    reference: 'Settlement credit'
                })
            ]
        })

        expect(matches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'airbnb-batch:2026-03-15:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK)',
                bankTransactionId: 'txn:bank:airbnb-three-day-gap',
                matched: true,
                amountMinor: 98000,
                currency: 'CZK'
            })
        ])
    })

    it('keeps a Booking payout batch unmatched when only the local amount exists but no booking evidence aligns on the bank line', () => {
        const diagnostics = diagnoseUnmatchedPayoutBatchesToBank({
            payoutBatches: [bookingBatchWithSupplement({
                expectedTotalMinor: 145642,
                currency: 'EUR'
            })],
            bankTransactions: [
                bankTransaction({
                    id: 'txn:bank:booking-generic' as NormalizedTransaction['id'],
                    amountMinor: 3553012,
                    currency: 'CZK',
                    bookedAt: '2026-03-12',
                    counterparty: 'Incoming bank transfer',
                    reference: 'Settlement credit'
                })
            ]
        })

        expect(diagnostics).toEqual([
            expect.objectContaining({
                expectedTotalMinor: 3553012,
                currency: 'CZK',
                noMatchReason: 'counterpartyClueMismatch',
                matched: false
            })
        ])
        expect(diagnostics[0]?.allInboundBankCandidates[0]).toEqual(
            expect.objectContaining({
                amountMinor: 3553012,
                currency: 'CZK',
                evidenceScore: 0,
                rejectionReasons: []
            })
        )
    })

    it('attaches payout-batch matches into reconciliation flow conservatively', () => {
        const bookingBatchFixture = getRealInputFixture('booking-payout-export-browser-upload-batch-shape')
        const bankRecord = {
            id: 'bank-1',
            sourceDocumentId: 'doc-bank-1' as ReturnType<typeof getRealInputFixture>['expectedExtractedRecords'][number]['sourceDocumentId'],
            recordType: 'bank-transaction',
            extractedAt: '2026-03-20T19:10:00.000Z',
            data: {
                sourceSystem: 'bank',
                bookedAt: '2026-03-12',
                amountMinor: 125000,
                currency: 'CZK',
                accountId: 'raiffeisen-main',
                reference: 'PAYOUT-BOOK-20260310'
            }
        }

        const result = reconcileExtractedRecords(
            {
                extractedRecords: [...bookingBatchFixture.expectedExtractedRecords, bankRecord as never]
            },
            {
                runId: 'payout-batch-bank-conservative',
                requestedAt: '2026-03-20T19:10:00.000Z'
            }
        )

        expect(result.payoutBatchMatches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
                matched: true,
                bankTransactionId: 'txn:bank:bank-1'
            })
        ])
        expect(result.matchGroups).toHaveLength(0)
    })

    it('attaches payout-batch no-match diagnostics into reconciliation flow conservatively', () => {
        const bookingFixture = getRealInputFixture('booking-payout-export-browser-upload-shape')

        const result = reconcileExtractedRecords(
            {
                extractedRecords: [
                    ...bookingFixture.expectedExtractedRecords,
                    {
                        id: 'bank-rb-real',
                        sourceDocumentId: 'doc-bank-rb-real' as ReturnType<typeof getRealInputFixture>['expectedExtractedRecords'][number]['sourceDocumentId'],
                        recordType: 'bank-transaction',
                        extractedAt: '2026-03-20T19:35:00.000Z',
                        data: {
                            sourceSystem: 'bank',
                            bookedAt: '2026-03-19',
                            amountMinor: 154000,
                            currency: 'CZK',
                            accountId: '5599955956/5500',
                            reference: 'Platba rezervace WEB-2001'
                        }
                    } as never,
                    {
                        id: 'bank-fio-real',
                        sourceDocumentId: 'doc-bank-fio-real' as ReturnType<typeof getRealInputFixture>['expectedExtractedRecords'][number]['sourceDocumentId'],
                        recordType: 'bank-transaction',
                        extractedAt: '2026-03-20T19:35:00.000Z',
                        data: {
                            sourceSystem: 'bank',
                            bookedAt: '2026-03-19',
                            amountMinor: 154000,
                            currency: 'CZK',
                            accountId: '8888997777/2010',
                            reference: 'Platba rezervace WEB-2001'
                        }
                    } as never
                ]
            },
            {
                runId: 'payout-batch-bank-no-match-diagnostics',
                requestedAt: '2026-03-20T19:35:00.000Z'
            }
        )

        expect(result.payoutBatchMatches).toEqual([])
        expect(result.payoutBatchNoMatchDiagnostics).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
                payoutReference: 'PAYOUT-BOOK-20260310',
                expectedTotalMinor: 125000,
                noMatchReason: 'noExactAmount'
            })
        ])
    })
})
