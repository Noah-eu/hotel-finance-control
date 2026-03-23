import { describe, expect, it } from 'vitest'
import type { ExtractedRecord, NormalizedTransaction } from '../../src/domain'
import { parseAirbnbPayoutExport } from '../../src/extraction'
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

    it('keeps Airbnb reservation-derived transactions out of payoutRows while preserving transfer-derived rows', () => {
        const airbnb = getRealInputFixture('airbnb-payout-export')

        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: airbnb.expectedExtractedRecords,
            normalizedTransactions: airbnb.expectedNormalizedTransactions ?? [],
            requestedAt: '2026-03-21T20:10:00.000Z'
        })

        expect(plan.payoutRows).toEqual([
            expect.objectContaining({
                rowId: 'txn:payout:airbnb-payout-2',
                platform: 'airbnb',
                payoutReference: 'G-OC3WJE3SIXRO5',
                payoutBatchKey: 'airbnb-batch:2026-03-15:G-OC3WJE3SIXRO5',
                amountMinor: 396105,
                currency: 'CZK'
            }),
            expect.objectContaining({
                rowId: 'txn:payout:airbnb-payout-3',
                platform: 'airbnb',
                payoutReference: 'G-DXVK4YVI7MJVL',
                payoutBatchKey: 'airbnb-batch:2026-03-15:G-DXVK4YVI7MJVL',
                amountMinor: 445697,
                currency: 'CZK'
            }),
            expect.objectContaining({
                rowId: 'txn:payout:airbnb-payout-4',
                platform: 'airbnb',
                payoutReference: 'G-ZD5RVTGOHW3GE',
                payoutBatchKey: 'airbnb-batch:2026-03-15:G-ZD5RVTGOHW3GE',
                amountMinor: 705994,
                currency: 'CZK'
            })
        ])
        expect(plan.payoutRows.find((row) => row.rowId === 'txn:payout:airbnb-payout-1')).toBeUndefined()
    })

    it('builds Airbnb payout batches only from transfer-derived payout rows', () => {
        const airbnb = getRealInputFixture('airbnb-payout-export')

        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: airbnb.expectedExtractedRecords,
            normalizedTransactions: airbnb.expectedNormalizedTransactions ?? [],
            requestedAt: '2026-03-21T20:11:00.000Z'
        })

        expect(plan.payoutBatches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'airbnb-batch:2026-03-15:G-OC3WJE3SIXRO5',
                payoutReference: 'G-OC3WJE3SIXRO5',
                rowIds: ['txn:payout:airbnb-payout-2'],
                expectedTotalMinor: 396105,
                currency: 'CZK'
            }),
            expect.objectContaining({
                payoutBatchKey: 'airbnb-batch:2026-03-15:G-DXVK4YVI7MJVL',
                payoutReference: 'G-DXVK4YVI7MJVL',
                rowIds: ['txn:payout:airbnb-payout-3'],
                expectedTotalMinor: 445697,
                currency: 'CZK'
            }),
            expect.objectContaining({
                payoutBatchKey: 'airbnb-batch:2026-03-15:G-ZD5RVTGOHW3GE',
                payoutReference: 'G-ZD5RVTGOHW3GE',
                rowIds: ['txn:payout:airbnb-payout-4'],
                expectedTotalMinor: 705994,
                currency: 'CZK'
            })
        ])
    })

    it('keeps real Airbnb payout rows distinct when payout dates and transfer descriptors repeat but paid-out amounts differ', () => {
        const sourceDocument = getRealInputFixture('airbnb-payout-export').sourceDocument
        const extractedRecords = parseAirbnbPayoutExport({
            sourceDocument,
            content: [
                'Datum;Bude připsán do dne;Typ;Potvrzující kód;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
                '2026-03-18;2026-03-20;Payout;;;;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);CZK;;3 961,05;0,00;3 961,05',
                '2026-03-18;2026-03-20;Payout;;;;Host 2;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);CZK;;4 456,97;0,00;4 456,97',
                '2026-03-18;2026-03-20;Payout;;;;Host 3;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);CZK;;7 059,94;0,00;7 059,94'
            ].join('\n'),
            extractedAt: '2026-03-24T08:00:00.000Z'
        })

        const reconciliation = reconcileExtractedRecords(
            { extractedRecords },
            {
                runId: 'real-airbnb-shared-payout-date',
                requestedAt: '2026-03-24T08:00:00.000Z'
            }
        )

        const plan = reconciliation.workflowPlan!

        expect(extractedRecords.map((record) => String(record.data.payoutReference ?? ''))).toEqual([
            'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
            'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
            'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
        ])
        expect(plan.payoutRows.map((row) => row.payoutReference)).toEqual([
            'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
            'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
            'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
        ])
        expect(plan.payoutRows.map((row) => row.payoutBatchKey)).toEqual([
            'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-396105',
            'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-445697',
            'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-705994'
        ])
        expect(plan.payoutBatches).toEqual([
            expect.objectContaining({
                payoutBatchKey: 'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-396105',
                payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
                expectedTotalMinor: 396105
            }),
            expect.objectContaining({
                payoutBatchKey: 'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-445697',
                payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
                expectedTotalMinor: 445697
            }),
            expect.objectContaining({
                payoutBatchKey: 'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-705994',
                payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
                expectedTotalMinor: 705994
            })
        ])
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
        expect(plan.reservationSettlementMatches).toEqual([])
    })

    it('matches a Previo accommodation reservation to a Booking payout row by unique deterministic evidence', () => {
        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: [
                {
                    id: 'previo-reservation-1',
                    sourceDocumentId: 'doc-previo-1' as ExtractedRecord['sourceDocumentId'],
                    recordType: 'payout-line',
                    extractedAt: '2026-03-20T18:45:00.000Z',
                    rawReference: 'PREVIO-BOOK-8841',
                    amountMinor: 42000,
                    currency: 'CZK',
                    occurredAt: '2026-03-14',
                    data: {
                        platform: 'previo',
                        rowKind: 'accommodation',
                        bookedAt: '2026-03-14',
                        stayStartAt: '2026-03-14',
                        stayEndAt: '2026-03-16',
                        amountMinor: 42000,
                        currency: 'CZK',
                        reference: 'PREVIO-BOOK-8841',
                        reservationId: 'PREVIO-BOOK-8841',
                        guestName: 'Jan Novak',
                        channel: 'booking'
                    }
                }
            ],
            normalizedTransactions: [
                {
                    id: 'txn:payout:booking-payout-1' as NormalizedTransaction['id'],
                    direction: 'in',
                    source: 'booking',
                    amountMinor: 42000,
                    currency: 'CZK',
                    bookedAt: '2026-03-15',
                    accountId: 'expected-payouts',
                    reference: 'BOOK-SETTLEMENT-8841',
                    reservationId: 'PREVIO-BOOK-8841',
                    extractedRecordIds: ['booking-payout-1'],
                    sourceDocumentIds: ['doc-booking-1' as NormalizedTransaction['sourceDocumentIds'][number]]
                }
            ],
            requestedAt: '2026-03-20T18:45:30.000Z'
        })

        expect(plan.reservationSettlementMatches).toEqual([
            expect.objectContaining({
                reservationId: 'PREVIO-BOOK-8841',
                settlementKind: 'payout_row',
                matchedRowId: 'txn:payout:booking-payout-1',
                platform: 'booking',
                amountMinor: 42000,
                reasons: expect.arrayContaining(['reservationIdExact', 'amountExact'])
            })
        ])
        expect(plan.reservationSettlementNoMatches).toEqual([])
    })

    it('leaves ambiguous reservation settlement candidates unmatched instead of guessing', () => {
        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: [
                {
                    id: 'previo-reservation-1',
                    sourceDocumentId: 'doc-previo-1' as ExtractedRecord['sourceDocumentId'],
                    recordType: 'payout-line',
                    extractedAt: '2026-03-20T18:46:00.000Z',
                    rawReference: 'PREVIO-BOOK-8841',
                    amountMinor: 42000,
                    currency: 'CZK',
                    occurredAt: '2026-03-14',
                    data: {
                        platform: 'previo',
                        rowKind: 'accommodation',
                        bookedAt: '2026-03-14',
                        stayStartAt: '2026-03-14',
                        stayEndAt: '2026-03-16',
                        amountMinor: 42000,
                        currency: 'CZK',
                        reference: 'PREVIO-BOOK-8841',
                        reservationId: 'PREVIO-BOOK-8841',
                        guestName: 'Jan Novak',
                        channel: 'booking'
                    }
                }
            ],
            normalizedTransactions: [
                {
                    id: 'txn:payout:booking-payout-1' as NormalizedTransaction['id'],
                    direction: 'in',
                    source: 'booking',
                    amountMinor: 42000,
                    currency: 'CZK',
                    bookedAt: '2026-03-15',
                    accountId: 'expected-payouts',
                    reference: 'BOOK-SETTLEMENT-8841-A',
                    reservationId: 'PREVIO-BOOK-8841',
                    extractedRecordIds: ['booking-payout-1'],
                    sourceDocumentIds: ['doc-booking-1' as NormalizedTransaction['sourceDocumentIds'][number]]
                },
                {
                    id: 'txn:payout:booking-payout-2' as NormalizedTransaction['id'],
                    direction: 'in',
                    source: 'booking',
                    amountMinor: 42000,
                    currency: 'CZK',
                    bookedAt: '2026-03-15',
                    accountId: 'expected-payouts',
                    reference: 'BOOK-SETTLEMENT-8841-B',
                    reservationId: 'PREVIO-BOOK-8841',
                    extractedRecordIds: ['booking-payout-2'],
                    sourceDocumentIds: ['doc-booking-2' as NormalizedTransaction['sourceDocumentIds'][number]]
                }
            ],
            requestedAt: '2026-03-20T18:46:30.000Z'
        })

        expect(plan.reservationSettlementMatches).toEqual([])
        expect(plan.reservationSettlementNoMatches).toEqual([
            expect.objectContaining({
                reservationId: 'PREVIO-BOOK-8841',
                noMatchReason: 'ambiguousCandidates',
                candidateCount: 2
            })
        ])
    })

    it('does not match when the expected channel or amount is wrong', () => {
        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: [
                {
                    id: 'previo-reservation-1',
                    sourceDocumentId: 'doc-previo-1' as ExtractedRecord['sourceDocumentId'],
                    recordType: 'payout-line',
                    extractedAt: '2026-03-20T18:47:00.000Z',
                    rawReference: 'PREVIO-CG-8841',
                    amountMinor: 42000,
                    currency: 'CZK',
                    occurredAt: '2026-03-14',
                    data: {
                        platform: 'previo',
                        rowKind: 'accommodation',
                        bookedAt: '2026-03-14',
                        stayStartAt: '2026-03-14',
                        stayEndAt: '2026-03-16',
                        amountMinor: 42000,
                        currency: 'CZK',
                        reference: 'PREVIO-CG-8841',
                        reservationId: 'PREVIO-CG-8841',
                        guestName: 'Jan Novak',
                        channel: 'comgate'
                    }
                }
            ],
            normalizedTransactions: [
                {
                    id: 'txn:payout:booking-payout-1' as NormalizedTransaction['id'],
                    direction: 'in',
                    source: 'booking',
                    amountMinor: 42000,
                    currency: 'CZK',
                    bookedAt: '2026-03-15',
                    accountId: 'expected-payouts',
                    reference: 'BOOK-SETTLEMENT-8841',
                    reservationId: 'PREVIO-CG-8841',
                    extractedRecordIds: ['booking-payout-1'],
                    sourceDocumentIds: ['doc-booking-1' as NormalizedTransaction['sourceDocumentIds'][number]]
                },
                {
                    id: 'txn:payout:comgate-payout-1' as NormalizedTransaction['id'],
                    direction: 'in',
                    source: 'comgate',
                    amountMinor: 41000,
                    currency: 'CZK',
                    bookedAt: '2026-03-15',
                    accountId: 'expected-payouts',
                    reference: 'CG-SETTLEMENT-8841',
                    reservationId: 'PREVIO-CG-8841',
                    extractedRecordIds: ['comgate-payout-1'],
                    sourceDocumentIds: ['doc-comgate-1' as NormalizedTransaction['sourceDocumentIds'][number]]
                }
            ],
            requestedAt: '2026-03-20T18:47:30.000Z'
        })

        expect(plan.reservationSettlementMatches).toEqual([])
        expect(plan.reservationSettlementNoMatches).toEqual([
            expect.objectContaining({
                reservationId: 'PREVIO-CG-8841',
                noMatchReason: 'channelMismatch'
            })
        ])
    })

    it('can match the Expedia direct-bank path separately from payout rows', () => {
        const expedia = getRealInputFixture('expedia-payout-export')

        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: [
                {
                    id: 'previo-reservation-1',
                    sourceDocumentId: 'doc-previo-1' as ExtractedRecord['sourceDocumentId'],
                    recordType: 'payout-line',
                    extractedAt: '2026-03-20T18:48:00.000Z',
                    rawReference: 'EXP-RES-1001',
                    amountMinor: 65000,
                    currency: 'CZK',
                    occurredAt: '2026-03-11',
                    data: {
                        platform: 'previo',
                        rowKind: 'accommodation',
                        bookedAt: '2026-03-11',
                        stayStartAt: '2026-03-11',
                        stayEndAt: '2026-03-12',
                        amountMinor: 65000,
                        currency: 'CZK',
                        reference: 'EXP-RES-1001',
                        reservationId: 'EXP-RES-1001',
                        guestName: 'Jan Novak',
                        channel: 'expedia_direct_bank'
                    }
                },
                ...expedia.expectedExtractedRecords
            ],
            normalizedTransactions: expedia.expectedNormalizedTransactions ?? [],
            requestedAt: '2026-03-20T18:48:30.000Z'
        })

        expect(plan.reservationSettlementMatches).toEqual([
            expect.objectContaining({
                reservationId: 'EXP-RES-1001',
                settlementKind: 'direct_bank_settlement',
                matchedSettlementId: 'txn:payout:expedia-payout-1',
                platform: 'expedia_direct_bank'
            })
        ])
    })

    it('does not treat ancillary revenue rows as accommodation reservation settlement matches', () => {
        const plan = buildReconciliationWorkflowPlan({
            extractedRecords: [
                {
                    id: 'previo-ancillary-1',
                    sourceDocumentId: 'doc-previo-1' as ExtractedRecord['sourceDocumentId'],
                    recordType: 'expected-revenue-line',
                    extractedAt: '2026-03-20T18:49:00.000Z',
                    rawReference: 'PREVIO-20260314',
                    amountMinor: 20000,
                    currency: 'CZK',
                    data: {
                        platform: 'previo',
                        rowKind: 'ancillary',
                        bookedAt: '2026-03-14',
                        amountMinor: 20000,
                        currency: 'CZK',
                        reference: 'PREVIO-20260314',
                        reservationId: 'PREVIO-20260314',
                        itemLabel: 'Parkování 1',
                        channel: 'comgate'
                    }
                }
            ],
            normalizedTransactions: [
                {
                    id: 'txn:payout:comgate-payout-1' as NormalizedTransaction['id'],
                    direction: 'in',
                    source: 'comgate',
                    amountMinor: 20000,
                    currency: 'CZK',
                    bookedAt: '2026-03-14',
                    accountId: 'expected-payouts',
                    reference: 'PREVIO-20260314',
                    reservationId: 'PREVIO-20260314',
                    extractedRecordIds: ['comgate-payout-1'],
                    sourceDocumentIds: ['doc-comgate-1' as NormalizedTransaction['sourceDocumentIds'][number]]
                }
            ],
            requestedAt: '2026-03-20T18:49:30.000Z'
        })

        expect(plan.ancillaryRevenueSources).toEqual([
            expect.objectContaining({
                reference: 'PREVIO-20260314',
                itemLabel: 'Parkování 1'
            })
        ])
        expect(plan.reservationSettlementMatches).toEqual([])
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
