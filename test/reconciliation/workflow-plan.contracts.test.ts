import { describe, expect, it } from 'vitest'
import type {
    BankFeeClassification,
    DirectBankSettlementExpectation,
    ExpenseDocumentExpectation,
    PayoutBatchExpectation,
    PayoutRowExpectation,
    ReconciliationWorkflowPlan,
    ReservationSourceRecord
} from '../../src/domain'

describe('reconciliation workflow business contracts', () => {
    it('allows a previo reservation source record to settle through Booking, Airbnb, or Comgate payout paths', () => {
        const reservation: ReservationSourceRecord = {
            reservationId: 'PREVIO-8841',
            sourceDocumentId: 'doc-previo-1' as ReservationSourceRecord['sourceDocumentId'],
            sourceSystem: 'previo',
            bookedAt: '2026-03-14',
            propertyId: 'HOTEL-CZ-001',
            grossRevenueMinor: 42000,
            currency: 'CZK',
            expectedSettlementChannels: ['booking', 'airbnb', 'comgate']
        }

        expect(reservation.expectedSettlementChannels).toEqual(['booking', 'airbnb', 'comgate'])
    })

    it('allows an Expedia reservation to settle through the direct Fio bank path', () => {
        const directBankSettlement: DirectBankSettlementExpectation = {
            settlementId: 'expedia-direct-1',
            channel: 'expedia_direct_bank',
            reservationId: 'EXP-RES-1001',
            bankRoutingTarget: 'fio_bank_inflow',
            accountIdHint: 'fio-expedia',
            bookedAt: '2026-03-11',
            amountMinor: 65000,
            currency: 'CZK'
        }

        expect(directBankSettlement.channel).toBe('expedia_direct_bank')
        expect(directBankSettlement.bankRoutingTarget).toBe('fio_bank_inflow')
    })

    it('represents multiple payout rows belonging to one payout batch for later bank matching', () => {
        const payoutRows: PayoutRowExpectation[] = [
            {
                rowId: 'booking-row-1',
                platform: 'booking',
                sourceDocumentId: 'doc-booking-1' as PayoutRowExpectation['sourceDocumentId'],
                reservationId: 'RES-BOOK-8841',
                payoutReference: 'PAYOUT-BOOK-20260310',
                payoutDate: '2026-03-10',
                payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-BOOK-20260310',
                amountMinor: 80000,
                currency: 'CZK',
                bankRoutingTarget: 'rb_bank_inflow'
            },
            {
                rowId: 'booking-row-2',
                platform: 'booking',
                sourceDocumentId: 'doc-booking-1' as PayoutRowExpectation['sourceDocumentId'],
                reservationId: 'RES-BOOK-8842',
                payoutReference: 'PAYOUT-BOOK-20260310',
                payoutDate: '2026-03-10',
                payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-BOOK-20260310',
                amountMinor: 45000,
                currency: 'CZK',
                bankRoutingTarget: 'rb_bank_inflow'
            }
        ]

        const payoutBatch: PayoutBatchExpectation = {
            payoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-BOOK-20260310',
            platform: 'booking',
            payoutReference: 'PAYOUT-BOOK-20260310',
            payoutDate: '2026-03-10',
            bankRoutingTarget: 'rb_bank_inflow',
            rowIds: ['booking-row-1', 'booking-row-2'],
            expectedTotalMinor: 125000,
            currency: 'CZK'
        }

        expect(new Set(payoutRows.map((row) => row.payoutBatchKey))).toEqual(
            new Set([payoutBatch.payoutBatchKey])
        )
        expect(payoutBatch.expectedTotalMinor).toBe(125000)
    })

    it('keeps expense documents on a separate matching path from reservation revenue', () => {
        const expense: ExpenseDocumentExpectation = {
            documentId: 'doc-invoice-1' as ExpenseDocumentExpectation['documentId'],
            kind: 'supplier_invoice',
            sourceSystem: 'invoice',
            bookedAt: '2026-03-19',
            amountMinor: 1850000,
            currency: 'CZK',
            expectedBankDirection: 'out',
            routingTarget: 'document_expense_outflow',
            documentReference: 'INV-2026-332'
        }

        expect(expense.routingTarget).toBe('document_expense_outflow')
        expect(expense.expectedBankDirection).toBe('out')
    })

    it('represents bank fee categories for Fio terminal fees and RB account fees', () => {
        const fioFee: BankFeeClassification = {
            transactionId: 'txn:bank:fio-fee-1' as BankFeeClassification['transactionId'],
            category: 'fio_terminal_fee',
            bankRoutingTarget: 'fio_bank_inflow',
            bankAccountId: 'fio-expedia',
            reason: 'Payment terminal settlement fee charged on Fio account.'
        }

        const rbFee: BankFeeClassification = {
            transactionId: 'txn:bank:rb-fee-1' as BankFeeClassification['transactionId'],
            category: 'rb_account_fee',
            bankRoutingTarget: 'rb_bank_inflow',
            bankAccountId: 'raiffeisen-main',
            reason: 'Raiffeisenbank current-account operating fee.'
        }

        expect(fioFee.category).toBe('fio_terminal_fee')
        expect(rbFee.category).toBe('rb_account_fee')
    })

    it('groups the business workflow into an explicit reconciliation plan structure', () => {
        const plan: ReconciliationWorkflowPlan = {
            reservationSources: [
                {
                    reservationId: 'PREVIO-8841',
                    sourceDocumentId: 'doc-previo-1' as ReservationSourceRecord['sourceDocumentId'],
                    sourceSystem: 'previo',
                    bookedAt: '2026-03-14',
                    propertyId: 'HOTEL-CZ-001',
                    grossRevenueMinor: 42000,
                    currency: 'CZK',
                    expectedSettlementChannels: ['booking', 'airbnb', 'comgate']
                }
            ],
            ancillaryRevenueSources: [],
            reservationSettlementMatches: [],
            reservationSettlementNoMatches: [],
            payoutRows: [],
            payoutBatches: [],
            directBankSettlements: [],
            expenseDocuments: [],
            bankFeeClassifications: []
        }

        expect(plan.reservationSources[0]?.expectedSettlementChannels).toContain('booking')
    })
})