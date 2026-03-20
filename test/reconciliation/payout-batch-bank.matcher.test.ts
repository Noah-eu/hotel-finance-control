import { describe, expect, it } from 'vitest'
import type { NormalizedTransaction, PayoutBatchExpectation } from '../../src/domain'
import { matchPayoutBatchesToBank, reconcileExtractedRecords } from '../../src/reconciliation'
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
})