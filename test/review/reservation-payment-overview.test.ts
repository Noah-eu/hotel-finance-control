import { describe, expect, it } from 'vitest'
import type { MonthlyBatchResult } from '../../src/monthly-batch'
import { buildReservationPaymentOverview } from '../../src/review'

describe('buildReservationPaymentOverview', () => {
  it('groups reservation and payment items by source with conservative statuses', () => {
    const batch = {
      extractedRecords: [],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:booking-row-1',
            source: 'booking',
            subtype: 'payout',
            amountMinor: 420000,
            currency: 'CZK',
            bookedAt: '2026-03-05',
            reference: 'booking-payout-1',
            reservationId: 'BKG-1',
            sourceDocumentIds: ['doc:booking'],
            extractedRecordIds: []
          },
          {
            id: 'txn:parking-row-1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 25000,
            currency: 'CZK',
            bookedAt: '2026-03-11',
            reference: 'PARK-1',
            reservationId: 'WEB-1',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: []
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo-booking',
              reservationId: 'BKG-1',
              guestName: 'Eva Booking',
              roomName: 'A101',
              reference: 'booking-ref-1',
              channel: 'booking',
              bookedAt: '2026-03-02',
              stayStartAt: '2026-03-10',
              stayEndAt: '2026-03-12',
              grossRevenueMinor: 420000,
              outstandingBalanceMinor: 0,
              currency: 'CZK',
              expectedSettlementChannels: ['booking']
            },
            {
              sourceDocumentId: 'doc:previo-airbnb',
              reservationId: 'AIR-1',
              guestName: 'Adam Airbnb',
              roomName: 'B201',
              reference: 'air-ref-1',
              channel: 'airbnb',
              bookedAt: '2026-03-03',
              stayStartAt: '2026-03-15',
              stayEndAt: '2026-03-17',
              grossRevenueMinor: 20000,
              outstandingBalanceMinor: 0,
              currency: 'EUR',
              expectedSettlementChannels: ['airbnb']
            },
            {
              sourceDocumentId: 'doc:previo-web',
              reservationId: 'WEB-1',
              guestName: 'Wendy Web',
              roomName: 'C301',
              reference: 'web-ref-1',
              channel: 'direct_web',
              bookedAt: '2026-03-04',
              stayStartAt: '2026-03-18',
              stayEndAt: '2026-03-20',
              grossRevenueMinor: 300000,
              outstandingBalanceMinor: 300000,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [
            {
              sourceDocumentId: 'doc:previo-parking',
              reservationId: 'WEB-1',
              reference: 'PARK-1',
              itemLabel: 'Parkování',
              channel: 'parking',
              bookedAt: '2026-03-11',
              grossRevenueMinor: 25000,
              outstandingBalanceMinor: 0,
              currency: 'CZK'
            }
          ],
          reservationSettlementMatches: [
            {
              sourceDocumentId: 'doc:previo-booking',
              reservationId: 'BKG-1',
              matchedRowId: 'txn:booking-row-1',
              amountMinor: 420000,
              currency: 'CZK',
              platform: 'booking'
            }
          ],
          reservationSettlementNoMatches: [
            {
              sourceDocumentId: 'doc:previo-airbnb',
              reservationId: 'AIR-1',
              noMatchReason: 'noCandidate'
            }
          ],
          payoutRows: [
            {
              rowId: 'txn:booking-row-1',
              platform: 'booking',
              reservationId: 'BKG-1',
              payoutReference: 'booking-payout-1',
              payoutDate: '2026-03-05',
              amountMinor: 420000,
              matchingAmountMinor: 420000,
              currency: 'CZK'
            },
            {
              rowId: 'txn:parking-row-1',
              platform: 'comgate',
              reservationId: 'WEB-1',
              payoutReference: 'PARK-1',
              payoutDate: '2026-03-11',
              amountMinor: 25000,
              matchingAmountMinor: 25000,
              currency: 'CZK'
            }
          ],
          directBankSettlements: [
            {
              settlementId: 'settlement:expedia-1',
              reservationId: 'EXP-1',
              bookedAt: '2026-03-14',
              amountMinor: 510000,
              currency: 'CZK',
              accountIdHint: 'fio-main'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const blockByKey = Object.fromEntries(overview.blocks.map((block) => [block.key, block]))

    expect(overview.summary.itemCount).toBe(5)
    expect(overview.summary.statusCounts).toEqual({
      paid: 3,
      partial: 0,
      unverified: 1,
      missing: 1
    })

    expect(blockByKey.airbnb.items).toEqual([
      expect.objectContaining({
        title: 'Adam Airbnb',
        primaryReference: 'AIR-1',
        statusKey: 'unverified',
        evidenceKey: 'no_evidence'
      })
    ])
    expect(blockByKey.booking.items).toEqual([
      expect.objectContaining({
        title: 'Eva Booking',
        primaryReference: 'BKG-1',
        statusKey: 'paid',
        evidenceKey: 'payout',
        transactionIds: ['txn:booking-row-1']
      })
    ])
    expect(blockByKey.expedia.items).toEqual([
      expect.objectContaining({
        title: 'EXP-1',
        statusKey: 'paid',
        evidenceKey: 'terminal',
        transactionIds: ['settlement:expedia-1']
      })
    ])
    expect(blockByKey.reservation_plus.items).toEqual([
      expect.objectContaining({
        title: 'Wendy Web',
        primaryReference: 'WEB-1',
        statusKey: 'missing',
        evidenceKey: 'no_evidence'
      })
    ])
    expect(blockByKey.parking.items).toEqual([
      expect.objectContaining({
        title: 'Parkování',
        primaryReference: 'PARK-1',
        statusKey: 'paid',
        evidenceKey: 'comgate',
        transactionIds: ['txn:parking-row-1']
      })
    ])
  })
})