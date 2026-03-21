import { describe, expect, it } from 'vitest'
import type { ExtractedRecord, NormalizedTransaction } from '../../src/domain'
import { buildReconciliationWorkflowPlan, reconcileExtractedRecords } from '../../src/reconciliation'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('buildReconciliationWorkflowPlan', () => {
    it('derives Booking payout rows and payout batch entries from current normalized inputs', () => {
        const bookingBatch = getRealInputFixture('booking-payout-export-browser-upload-batch-shape')

        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: bookingBatch.expectedExtractedRecords,
            normalizedTransactions: bookingBatch.expectedNormalizedTransactions ?? [],
            requestedAt: '2026-03-20T18:40:00.000Z'
        })

        expect(plan.payoutRows).toHaveLength(2)
        expect(plan.payoutRows.map((row) => row.payoutBatchKey)).toEqual([
            'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
            'booking-batch:2026-03-12:PAYOUT-BOOK-20260310'
        ])
        expect(plan.payoutBatches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
                rowIds: ['txn:payout:booking-payout-1', 'txn:payout:booking-payout-2'],
                expectedTotalMinor: 125000
            })
        ])
    })

    it('represents the Expedia direct-bank path separately from payout batches', () => {
        const expedia = getRealInputFixture('expedia-payout-export')

        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: expedia.expectedExtractedRecords,
            normalizedTransactions: expedia.expectedNormalizedTransactions ?? [],
            requestedAt: '2026-03-20T18:41:00.000Z'
        })

        expect(plan.directBankSettlements).toEqual([
            expect.objectContaining({
                channel: 'expedia_direct_bank',
                bankRoutingTarget: 'fio_bank_inflow',
                reservationId: 'EXP-RES-1001',
                amountMinor: 65000
            })
        ])
        expect(plan.payoutRows).toHaveLength(0)
    })

    it('derives deterministic Previo reservation sources for the monthly workflow', () => {
        const previo = getRealInputFixture('previo-reservation-export')

        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: previo.expectedExtractedRecords,
            normalizedTransactions: previo.expectedNormalizedTransactions ?? [],
            requestedAt: '2026-03-20T18:41:30.000Z'
        })

        expect(plan.reservationSources).toEqual([
            expect.objectContaining({
                reservationId: 'PREVIO-20260314',
                sourceSystem: 'previo',
                reference: 'PREVIO-20260314',
                guestName: 'Jan Novak',
                channel: 'direct-web',
                stayStartAt: '2026-03-14',
                stayEndAt: '2026-03-16',
                grossRevenueMinor: 42000,
                currency: 'CZK'
            })
        ])
    })

    it('keeps expense documents separate from reservation revenue planning', () => {
        const invoice = getRealInputFixture('invoice-document')

        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: invoice.expectedExtractedRecords,
            normalizedTransactions: invoice.expectedNormalizedTransactions ?? [],
            requestedAt: '2026-03-20T18:42:00.000Z'
        })

        expect(plan.expenseDocuments).toEqual([
            expect.objectContaining({
                sourceSystem: 'invoice',
                kind: 'supplier_invoice',
                routingTarget: 'document_expense_outflow',
                expectedBankDirection: 'out'
            })
        ])
        expect(plan.payoutRows).toHaveLength(0)
        expect(plan.directBankSettlements).toHaveLength(0)
    })

    it('classifies inferable bank fee categories from normalized bank outflows', () => {
        const normalizedTransactions: NormalizedTransaction[] = [
            {
                id: 'txn:bank:fio-fee-1' as NormalizedTransaction['id'],
                direction: 'out',
                source: 'bank',
                amountMinor: 1500,
                currency: 'CZK',
                bookedAt: '2026-03-20',
                accountId: 'fio-expedia',
                counterparty: 'Terminal fee',
                reference: 'TERMINAL FEE MARCH',
                extractedRecordIds: ['fio-fee-1'],
                sourceDocumentIds: ['doc-fio-fee-1' as NormalizedTransaction['sourceDocumentIds'][number]]
            },
            {
                id: 'txn:bank:rb-fee-1' as NormalizedTransaction['id'],
                direction: 'out',
                source: 'bank',
                amountMinor: 990,
                currency: 'CZK',
                bookedAt: '2026-03-20',
                accountId: 'raiffeisen-main',
                counterparty: 'Raiffeisenbank',
                reference: 'ACCOUNT FEE MARCH',
                extractedRecordIds: ['rb-fee-1'],
                sourceDocumentIds: ['doc-rb-fee-1' as NormalizedTransaction['sourceDocumentIds'][number]]
            }
        ]

        const extractedRecords: ExtractedRecord[] = []

        const plan = buildReconciliationWorkflowPlan({
            extractedRecords,
            normalizedTransactions,
            requestedAt: '2026-03-20T18:43:00.000Z'
        })

        expect(plan.bankFeeClassifications).toEqual([
            expect.objectContaining({
                transactionId: 'txn:bank:fio-fee-1',
                category: 'fio_terminal_fee'
            }),
            expect.objectContaining({
                transactionId: 'txn:bank:rb-fee-1',
                category: 'rb_account_fee'
            })
        ])
    })

    it('attaches the produced workflow plan to reconciliation results without changing current flow outputs', () => {
        const booking = getRealInputFixture('booking-payout-export-browser-upload-shape').expectedExtractedRecords[0]
        const bank = {
            id: 'bank-1',
            sourceDocumentId: 'doc-bank-1' as ExtractedRecord['sourceDocumentId'],
            recordType: 'bank-transaction',
            extractedAt: '2026-03-20T18:44:00.000Z',
            data: {
                sourceSystem: 'bank',
                bookedAt: '2026-03-12',
                amountMinor: 125000,
                currency: 'CZK',
                accountId: 'raiffeisen-main',
                reference: 'PAYOUT-BOOK-20260310'
            }
        } satisfies ExtractedRecord

        const result = reconcileExtractedRecords(
            {
                extractedRecords: [booking, bank]
            },
            {
                runId: 'workflow-plan-attachment',
                requestedAt: '2026-03-20T18:44:00.000Z'
            }
        )

        expect(result.workflowPlan).toBeDefined()
        expect(result.workflowPlan?.payoutRows).toEqual([
            expect.objectContaining({
                payoutReference: 'PAYOUT-BOOK-20260310',
                payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310'
            })
        ])
        expect(result.matchGroups).toHaveLength(1)
    })
})