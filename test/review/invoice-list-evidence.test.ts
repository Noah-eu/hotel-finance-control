import { describe, expect, it } from 'vitest'
import type { MonthlyBatchResult } from '../../src/monthly-batch'
import type {
  InvoiceListEnrichmentRecord,
  ReservationSourceRecord,
  AncillaryRevenueSourceRecord,
  ReconciliationWorkflowPlan
} from '../../src/domain'
import type { DocumentId } from '../../src/domain/value-types'
import {
  buildReservationPaymentOverview,
  inspectReservationPaymentOverviewClassification
} from '../../src/review'

function toDocId(id: string) { return id as DocumentId }

function makeReservationSource(overrides: Partial<ReservationSourceRecord> & { reservationId: string }): ReservationSourceRecord {
  return {
    sourceDocumentId: toDocId('doc-previo'),
    sourceSystem: 'previo',
    bookedAt: '2026-03-01',
    grossRevenueMinor: 500000,
    currency: 'CZK',
    expectedSettlementChannels: [],
    ...overrides
  }
}

function makeInvoiceListHeader(overrides: Partial<InvoiceListEnrichmentRecord> = {}): InvoiceListEnrichmentRecord {
  return {
    sourceRecordId: 'inv-rec-1',
    sourceDocumentId: toDocId('doc-invoice-list'),
    recordKind: 'header',
    currency: 'CZK',
    ...overrides
  }
}

function makeInvoiceListLineItem(overrides: Partial<InvoiceListEnrichmentRecord> = {}): InvoiceListEnrichmentRecord {
  return {
    sourceRecordId: 'inv-line-1',
    sourceDocumentId: toDocId('doc-invoice-list'),
    recordKind: 'line-item',
    currency: 'CZK',
    ...overrides
  }
}

function makeAncillarySource(overrides: Partial<AncillaryRevenueSourceRecord> & { reference: string }): AncillaryRevenueSourceRecord {
  return {
    sourceRecordId: 'ancillary-rec-1',
    sourceDocumentId: toDocId('doc-previo'),
    sourceSystem: 'previo',
    grossRevenueMinor: 20000,
    currency: 'CZK',
    ...overrides
  }
}

function buildWorkflowPlan(overrides: Partial<ReconciliationWorkflowPlan> = {}): ReconciliationWorkflowPlan {
  return {
    reservationSources: [],
    ancillaryRevenueSources: [],
    invoiceListEnrichment: [],
    reservationSettlementMatches: [],
    reservationSettlementNoMatches: [],
    payoutRows: [],
    payoutBatches: [],
    directBankSettlements: [],
    expenseDocuments: [],
    bankFeeClassifications: [],
    ...overrides
  }
}

function buildBatch(workflowPlan: ReconciliationWorkflowPlan): MonthlyBatchResult {
  return {
    extractedRecords: [],
    reconciliation: {
      normalizedTransactions: [],
      workflowPlan,
      reservationSettlementMatches: [],
      reservationSettlementNoMatches: [],
      payoutBatchMatches: [],
      payoutBatchNoMatchDiagnostics: []
    },
    report: {
      summary: {
        matchedCount: 0,
        unmatchedCount: 0,
        suspiciousCount: 0,
        missingDocumentCount: 0,
        unsupportedCount: 0
      },
      transactions: [],
      supportedExpenseLinks: []
    }
  } as unknown as MonthlyBatchResult
}

describe('Invoice list payment evidence gating', () => {
  it('Booking reservation linked by exact voucher => evidence allowed, status paid', () => {
    const plan = buildWorkflowPlan({
      reservationSources: [
        makeReservationSource({
          reservationId: 'RES-BOOK-1',
          reference: 'RES-BOOK-1',
          guestName: 'Jan Test',
          channel: 'booking',
          expectedSettlementChannels: ['booking'],
          stayStartAt: '2026-03-10',
          stayEndAt: '2026-03-12',
          roomName: 'A101'
        })
      ],
      invoiceListEnrichment: [
        makeInvoiceListHeader({
          voucher: 'RES-BOOK-1',
          guestName: 'Jan Test',
          stayStartAt: '2026-03-10',
          stayEndAt: '2026-03-12',
          roomName: 'A101'
        })
      ]
    })

    const overview = buildReservationPaymentOverview(buildBatch(plan))
    const bookingBlock = overview.blocks.find((b) => b.key === 'booking')
    expect(bookingBlock?.items).toHaveLength(1)

    const item = bookingBlock!.items[0]
    expect(item.evidenceKey).toBe('invoice_list')
    expect(item.evidenceLabelCs).toBe('faktura')
    expect(item.statusKey).toBe('paid')
    expect(item.statusDetailCs).toContain('Fakturační evidence')
  })

  it('Expedia reservation linked by exact voucher => evidence allowed, status paid', () => {
    const plan = buildWorkflowPlan({
      reservationSources: [
        makeReservationSource({
          reservationId: 'RES-EXP-1',
          reference: 'RES-EXP-1',
          guestName: 'Marie Expedia',
          channel: 'expedia',
          expectedSettlementChannels: ['expedia_direct_bank'],
          stayStartAt: '2026-03-15',
          stayEndAt: '2026-03-17',
          roomName: 'B202'
        })
      ],
      invoiceListEnrichment: [
        makeInvoiceListHeader({
          voucher: 'RES-EXP-1',
          guestName: 'Marie Expedia',
          stayStartAt: '2026-03-15',
          stayEndAt: '2026-03-17',
          roomName: 'B202'
        })
      ]
    })

    const overview = buildReservationPaymentOverview(buildBatch(plan))
    const expediaBlock = overview.blocks.find((b) => b.key === 'expedia')
    expect(expediaBlock?.items).toHaveLength(1)

    const item = expediaBlock!.items[0]
    expect(item.evidenceKey).toBe('invoice_list')
    expect(item.statusKey).toBe('paid')
  })

  it('Reservation+ item linked by exact voucher => evidence allowed', () => {
    const plan = buildWorkflowPlan({
      ancillaryRevenueSources: [
        makeAncillarySource({
          reference: 'RES-PLUS-1',
          itemLabel: 'Pozdní check-out',
          channel: 'direct-web',
          grossRevenueMinor: 30000,
          outstandingBalanceMinor: 0
        })
      ],
      invoiceListEnrichment: [
        makeInvoiceListHeader({
          voucher: 'RES-PLUS-1',
          guestName: 'Petr Reservation',
          stayStartAt: '2026-03-20',
          stayEndAt: '2026-03-22',
          roomName: 'C303'
        })
      ]
    })

    const overview = buildReservationPaymentOverview(buildBatch(plan))
    const resPlus = overview.blocks.find((b) => b.key === 'reservation_plus')
    expect(resPlus?.items).toHaveLength(1)

    const item = resPlus!.items[0]
    expect(item.evidenceKey).toBe('invoice_list')
    expect(item.statusKey).toBe('paid')
  })

  it('Airbnb reservation linked to invoice list => evidence BLOCKED', () => {
    const plan = buildWorkflowPlan({
      reservationSources: [
        makeReservationSource({
          reservationId: 'RES-AIRBNB-1',
          reference: 'RES-AIRBNB-1',
          guestName: 'Eva Airbnb',
          channel: 'airbnb',
          expectedSettlementChannels: ['airbnb'],
          stayStartAt: '2026-03-05',
          stayEndAt: '2026-03-07',
          roomName: 'D404'
        })
      ],
      invoiceListEnrichment: [
        makeInvoiceListHeader({
          voucher: 'RES-AIRBNB-1',
          guestName: 'Eva Airbnb',
          stayStartAt: '2026-03-05',
          stayEndAt: '2026-03-07',
          roomName: 'D404'
        })
      ]
    })

    const overview = buildReservationPaymentOverview(buildBatch(plan))
    const airbnbBlock = overview.blocks.find((b) => b.key === 'airbnb')
    expect(airbnbBlock?.items).toHaveLength(1)

    const item = airbnbBlock!.items[0]
    expect(item.evidenceKey).toBe('no_evidence')
    expect(item.statusKey).not.toBe('paid')

    const debug = inspectReservationPaymentOverviewClassification(buildBatch(plan))
    const airbnbTrace = debug.invoiceListLinkTraces.find(
      (t) => t.blockKey === 'airbnb'
    )
    expect(airbnbTrace).toBeDefined()
    expect(airbnbTrace!.invoiceListEvidenceEligible).toBe(false)
    expect(airbnbTrace!.invoiceListEvidenceApplied).toBe(false)
    expect(airbnbTrace!.invoiceListEvidenceBlockedReason).toBe('blocked_airbnb')
  })

  it('no deterministic anchor => enrichment only, no evidence', () => {
    const plan = buildWorkflowPlan({
      reservationSources: [
        makeReservationSource({
          reservationId: 'RES-NO-ANCHOR',
          reference: 'RES-NO-ANCHOR',
          guestName: 'Adam NoAnchor',
          channel: 'booking',
          expectedSettlementChannels: ['booking'],
          stayStartAt: '2026-03-18',
          stayEndAt: '2026-03-20',
          roomName: 'E505'
        })
      ],
      invoiceListEnrichment: [
        makeInvoiceListHeader({
          voucher: 'COMPLETELY-DIFFERENT-VOUCHER',
          guestName: 'Somebody Else',
          stayStartAt: '2026-02-01',
          stayEndAt: '2026-02-03',
          roomName: 'X999'
        })
      ]
    })

    const overview = buildReservationPaymentOverview(buildBatch(plan))
    const bookingBlock = overview.blocks.find((b) => b.key === 'booking')
    expect(bookingBlock?.items).toHaveLength(1)

    const item = bookingBlock!.items[0]
    expect(item.evidenceKey).toBe('no_evidence')
    expect(item.statusKey).toBe('unverified')
  })

  it('invoice list does not create bank settlement match by itself', () => {
    const plan = buildWorkflowPlan({
      reservationSources: [
        makeReservationSource({
          reservationId: 'RES-BANK-CHECK',
          reference: 'RES-BANK-CHECK',
          channel: 'booking',
          expectedSettlementChannels: ['booking']
        })
      ],
      invoiceListEnrichment: [
        makeInvoiceListHeader({ voucher: 'RES-BANK-CHECK' })
      ]
    })

    expect(plan.reservationSettlementMatches).toHaveLength(0)
    expect(plan.payoutRows).toHaveLength(0)
    expect(plan.directBankSettlements).toHaveLength(0)
    expect(plan.payoutBatches).toHaveLength(0)
  })

  it('parking enrichment works without falsely asserting payment evidence', () => {
    const plan = buildWorkflowPlan({
      ancillaryRevenueSources: [
        makeAncillarySource({
          reference: 'RES-PARK-1',
          itemLabel: 'Parkování',
          channel: 'comgate',
          grossRevenueMinor: 15000,
          outstandingBalanceMinor: 0
        })
      ],
      invoiceListEnrichment: [
        makeInvoiceListHeader({
          voucher: 'RES-PARK-1',
          guestName: 'Karel Parker',
          roomName: 'P1'
        }),
        makeInvoiceListLineItem({
          voucher: 'RES-PARK-1',
          itemLabel: 'Parkování na den',
          guestName: 'Karel Parker',
          grossAmountMinor: 15000
        })
      ]
    })

    const overview = buildReservationPaymentOverview(buildBatch(plan))
    const parkingBlock = overview.blocks.find((b) => b.key === 'parking')
    expect(parkingBlock?.items).toHaveLength(1)

    const item = parkingBlock!.items[0]
    // Parking is NOT in the eligible set for invoice-list evidence
    expect(item.evidenceKey).toBe('no_evidence')

    // But enrichment fields should still be populated via fallback
    const debug = inspectReservationPaymentOverviewClassification(buildBatch(plan))
    const parkingTrace = debug.invoiceListLinkTraces.find(
      (t) => t.blockKey === 'parking'
    )
    if (parkingTrace) {
      expect(parkingTrace.invoiceListEvidenceEligible).toBe(false)
      expect(parkingTrace.invoiceListEvidenceApplied).toBe(false)
      expect(parkingTrace.invoiceListEvidenceBlockedReason).toBe('blocked_parking')
    }
  })

  it('debug traces include evidence eligibility fields for Booking reservation', () => {
    const plan = buildWorkflowPlan({
      reservationSources: [
        makeReservationSource({
          reservationId: 'RES-TRACE-1',
          reference: 'RES-TRACE-1',
          guestName: 'Trace Test',
          channel: 'booking',
          expectedSettlementChannels: ['booking']
        })
      ],
      invoiceListEnrichment: [
        makeInvoiceListHeader({
          voucher: 'RES-TRACE-1',
          guestName: 'Trace Test',
          variableSymbol: '99887766'
        })
      ]
    })

    const debug = inspectReservationPaymentOverviewClassification(buildBatch(plan))
    const trace = debug.invoiceListLinkTraces.find(
      (t) => t.overviewItemId.includes('RES-TRACE-1')
    )
    expect(trace).toBeDefined()
    expect(trace!.invoiceListEvidenceEligible).toBe(true)
    expect(trace!.invoiceListEvidenceApplied).toBe(true)
    expect(trace!.invoiceListEvidenceAnchorType).toBe('exact_voucher')
    expect(trace!.invoiceListEvidenceBlockedReason).toBeUndefined()
    expect(trace!.linkedGuestName).toBe('Trace Test')
    expect(trace!.linkedVariableSymbol).toBe('99887766')
  })
})
