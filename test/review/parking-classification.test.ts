import { describe, expect, it } from 'vitest'
import type { MonthlyBatchResult } from '../../src/monthly-batch'
import { buildReservationPaymentOverview } from '../../src/review'

describe('reservation payment overview parking classification', () => {
  it('routes explicit Previo parking reservation rows into Parking while keeping Booking, Airbnb, and Reservation+ unchanged', () => {
    const batch = {
      extractedRecords: [],
      reconciliation: {
        normalizedTransactions: [],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo-booking',
              reservationId: 'BKG-100',
              guestName: 'Booking Guest',
              roomName: 'A101',
              reference: 'BKG-100',
              channel: 'booking',
              bookedAt: '2026-04-01',
              stayStartAt: '2026-04-10',
              stayEndAt: '2026-04-11',
              grossRevenueMinor: 250000,
              outstandingBalanceMinor: 250000,
              currency: 'CZK',
              expectedSettlementChannels: ['booking']
            },
            {
              sourceDocumentId: 'doc:previo-airbnb',
              reservationId: 'AIR-100',
              guestName: 'Airbnb Guest',
              roomName: 'B201',
              reference: 'AIR-100',
              channel: 'airbnb',
              bookedAt: '2026-04-01',
              stayStartAt: '2026-04-12',
              stayEndAt: '2026-04-13',
              grossRevenueMinor: 9900,
              outstandingBalanceMinor: 9900,
              currency: 'EUR',
              expectedSettlementChannels: ['airbnb']
            },
            {
              sourceDocumentId: 'doc:previo-parking',
              reservationId: 'PARK-RES-1',
              guestName: 'Parking Guest',
              roomName: 'Parkování P1',
              reference: 'PARK-RES-1',
              channel: 'parking',
              bookedAt: '2026-04-01',
              stayStartAt: '2026-04-14',
              stayEndAt: '2026-04-14',
              grossRevenueMinor: 4000,
              outstandingBalanceMinor: 4000,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            },
            {
              sourceDocumentId: 'doc:previo-web',
              reservationId: 'WEB-100',
              guestName: 'Web Guest',
              roomName: 'Studio 4',
              reference: 'WEB-100',
              channel: 'direct-web',
              bookedAt: '2026-04-01',
              stayStartAt: '2026-04-15',
              stayEndAt: '2026-04-16',
              grossRevenueMinor: 45000,
              outstandingBalanceMinor: 45000,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const blockByKey = Object.fromEntries(overview.blocks.map((block) => [block.key, block]))

    expect(blockByKey.booking.items).toEqual([
      expect.objectContaining({ title: 'Booking Guest', primaryReference: 'BKG-100' })
    ])
    expect(blockByKey.airbnb.items).toEqual([
      expect.objectContaining({ title: 'Airbnb Guest', primaryReference: 'AIR-100' })
    ])
    expect(blockByKey.parking.items).toEqual([
      expect.objectContaining({ title: 'Parking Guest', primaryReference: 'PARK-RES-1' })
    ])
    expect(blockByKey.reservation_plus.items).toEqual([
      expect.objectContaining({ title: 'Web Guest', primaryReference: 'WEB-100' })
    ])
  })

  it('uses strong Comgate parking signals while leaving ambiguous reservation-plus codes out of Parking', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'record:comgate:parking',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-04-07T09:00:00.000Z',
          amountMinor: 4200,
          currency: 'CZK',
          occurredAt: '2026-04-07',
          data: {
            reference: 'CG-PARK-2001',
            transactionId: 'CG-PARK-TRX-1'
          }
        },
        {
          id: 'record:comgate:ambiguous',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-04-07T09:00:00.000Z',
          amountMinor: 6100,
          currency: 'CZK',
          occurredAt: '2026-04-07',
          data: {
            reference: 'CG-PARKSIDE-2001',
            transactionId: 'CG-PORTAL-TRX-2'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:parking',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 4000,
            currency: 'CZK',
            bookedAt: '2026-04-07',
            reference: 'CG-PARK-2001',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['record:comgate:parking']
          },
          {
            id: 'txn:comgate:ambiguous',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 6000,
            currency: 'CZK',
            bookedAt: '2026-04-07',
            reference: 'CG-PARKSIDE-2001',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['record:comgate:ambiguous']
          }
        ],
        workflowPlan: {
          reservationSources: [],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            {
              rowId: 'txn:comgate:parking',
              platform: 'comgate',
              reservationId: 'PARK-2001',
              payoutReference: 'CG-PARK-2001',
              payoutDate: '2026-04-07',
              amountMinor: 4200,
              matchingAmountMinor: 4000,
              currency: 'CZK'
            },
            {
              rowId: 'txn:comgate:ambiguous',
              platform: 'comgate',
              reservationId: 'WEB-2001',
              payoutReference: 'CG-PARKSIDE-2001',
              payoutDate: '2026-04-07',
              amountMinor: 6100,
              matchingAmountMinor: 6000,
              currency: 'CZK'
            }
          ],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const blockByKey = Object.fromEntries(overview.blocks.map((block) => [block.key, block]))

    expect(blockByKey.parking.items).toEqual([
      expect.objectContaining({
        title: 'CG-PARK-2001',
        primaryReference: 'PARK-2001',
        evidenceKey: 'comgate'
      })
    ])
    expect(blockByKey.reservation_plus.items).toEqual([
      expect.objectContaining({
        title: 'WEB-2001',
        primaryReference: 'WEB-2001',
        evidenceKey: 'comgate'
      })
    ])
  })
})