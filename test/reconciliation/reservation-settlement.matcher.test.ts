import { describe, expect, it } from 'vitest'
import type { DocumentId } from '../../src/domain/value-types'
import { matchReservationSourcesToSettlements } from '../../src/reconciliation/reservation-settlement.matcher'

describe('matchReservationSourcesToSettlements', () => {
  it('treats Booking payout supplement reservation IDs as strong row-level evidence', () => {
    const result = matchReservationSourcesToSettlements({
      reservationSources: [
        {
          sourceDocumentId: 'doc:previo-greta' as DocumentId,
          sourceSystem: 'previo',
          reservationId: '6622415324',
          reference: '6622415324',
          guestName: 'Greta Sieweke',
          channel: 'booking',
          bookedAt: '2026-03-01',
          stayStartAt: '2026-03-10',
          stayEndAt: '2026-03-12',
          grossRevenueMinor: 25984,
          outstandingBalanceMinor: 25984,
          currency: 'EUR',
          expectedSettlementChannels: ['booking']
        },
        {
          sourceDocumentId: 'doc:previo-no-payout' as DocumentId,
          sourceSystem: 'previo',
          reservationId: '7722415324',
          reference: '7722415324',
          guestName: 'Booking Guest Without Payout',
          channel: 'booking',
          bookedAt: '2026-03-01',
          stayStartAt: '2026-03-10',
          stayEndAt: '2026-03-12',
          grossRevenueMinor: 19900,
          outstandingBalanceMinor: 19900,
          currency: 'EUR',
          expectedSettlementChannels: ['booking']
        }
      ],
      payoutRows: [
        {
          rowId: 'txn:booking-payout-row-greta',
          platform: 'booking',
          sourceDocumentId: 'doc:booking-csv' as DocumentId,
          payoutReference: '010638445054',
          payoutDate: '2026-03-12',
          payoutBatchKey: 'booking-batch:2026-03-12:010638445054',
          amountMinor: 25984,
          currency: 'EUR',
          bankRoutingTarget: 'rb_bank_inflow',
          payoutSupplementReservationIds: ['6622415324'],
          payoutSupplementSourceDocumentIds: ['doc:booking-pdf-greta' as DocumentId]
        }
      ],
      directBankSettlements: []
    })

    expect(result.matches).toEqual([
      expect.objectContaining({
        sourceDocumentId: 'doc:previo-greta',
        reservationId: '6622415324',
        matchedRowId: 'txn:booking-payout-row-greta',
        platform: 'booking',
        amountMinor: 25984,
        reasons: expect.arrayContaining(['payoutSupplementReservationIdExact', 'amountExact', 'channelAligned']),
        evidence: expect.arrayContaining([
          expect.objectContaining({ key: 'payoutSupplementReservationId', value: '6622415324' }),
          expect.objectContaining({ key: 'payoutSupplementSourceDocumentId', value: 'doc:booking-pdf-greta' })
        ])
      })
    ])
    expect(result.noMatches).toEqual([
      expect.objectContaining({
        sourceDocumentId: 'doc:previo-no-payout',
        reservationId: '7722415324',
        noMatchReason: 'noCandidate'
      })
    ])
  })
})