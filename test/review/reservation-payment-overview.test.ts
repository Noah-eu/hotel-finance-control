import { describe, expect, it } from 'vitest'
import type { MonthlyBatchResult } from '../../src/monthly-batch'
import { buildReservationPaymentOverview, inspectReservationPaymentOverviewClassification } from '../../src/review'

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
              sourceDocumentId: 'doc:previo-web',
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
        subtitle: 'C301',
        primaryReference: 'PARK-1',
        statusKey: 'paid',
        evidenceKey: 'comgate',
        transactionIds: ['txn:parking-row-1'],
        detailEntries: expect.arrayContaining([
          expect.objectContaining({ labelCs: 'Host', value: 'Wendy Web' }),
          expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-18 – 2026-03-20' }),
          expect.objectContaining({ labelCs: 'Jednotka', value: 'C301' })
        ])
      })
    ])
  })

  it('keeps booking-like fallback channels in the Booking block, formats outstanding minor values, and splits Comgate parking rows robustly', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'record:comgate:web',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 154900,
          currency: 'CZK',
          occurredAt: '2026-03-19',
          data: {
            paymentPurpose: 'website-reservation',
            reference: 'CG-WEB-2001',
            transactionId: 'CG-PORTAL-TRX-2001'
          }
        },
        {
          id: 'record:comgate:parking',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 4200,
          currency: 'CZK',
          occurredAt: '2026-03-19',
          data: {
            paymentPurpose: 'parking-fee',
            reference: 'CG-PARK-2001',
            transactionId: 'CG-PORTAL-TRX-2002'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:web',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 154000,
            currency: 'CZK',
            bookedAt: '2026-03-19',
            reference: 'CG-WEB-2001',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['record:comgate:web']
          },
          {
            id: 'txn:comgate:parking',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 4000,
            currency: 'CZK',
            bookedAt: '2026-03-19',
            reference: 'CG-PARK-2001',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['record:comgate:parking']
          }
        ],
        workflowPlan: {
          reservationSources: [],
          previoReservationTruth: [
            {
              sourceDocumentId: 'doc:previo-booking',
              reservationId: '5178029336',
              guestName: 'Booking Guest',
              roomName: 'A101',
              reference: '5178029336',
              channel: 'Booking.com Prepaid',
              bookedAt: '2026-03-02',
              stayStartAt: '2026-03-03',
              stayEndAt: '2026-03-04',
              grossRevenueMinor: 4690,
              outstandingBalanceMinor: 4690,
              currency: 'EUR',
              expectedSettlementChannels: []
            }
          ],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            {
              rowId: 'txn:comgate:web',
              platform: 'comgate',
              reservationId: 'WEB-1',
              payoutReference: 'CG-WEB-2001',
              payoutDate: '2026-03-19',
              amountMinor: 154900,
              matchingAmountMinor: 154000,
              currency: 'CZK'
            },
            {
              rowId: 'txn:comgate:parking',
              platform: 'comgate',
              reservationId: 'PARK-1',
              payoutReference: 'CG-PARK-2001',
              payoutDate: '2026-03-19',
              amountMinor: 4200,
              matchingAmountMinor: 4000,
              currency: 'CZK'
            }
          ],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const blockByKey = Object.fromEntries(overview.blocks.map((block) => [block.key, block]))

    expect(blockByKey.booking.items).toEqual([
      expect.objectContaining({
        title: 'Booking Guest',
        primaryReference: '5178029336',
        detailEntries: expect.arrayContaining([
          expect.objectContaining({ labelCs: 'Zbývá uhradit', value: '46,90 EUR' })
        ])
      })
    ])
    expect(blockByKey.reservation_plus.items).toEqual([
      expect.objectContaining({
        title: 'WEB-1',
        primaryReference: 'WEB-1'
      })
    ])
    expect(blockByKey.parking.items).toEqual([
      expect.objectContaining({
        title: 'CG-PARK-2001',
        primaryReference: 'PARK-1'
      })
    ])
  })

  it('enriches native Reservation+ Comgate rows when a unique reservation anchor resolves by exact identity', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-1',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 38000,
          currency: 'CZK',
          occurredAt: '2026-03-15',
          data: {
            platform: 'comgate',
            reference: 'CG-RES-991',
            reservationId: 'WEB-RES-991',
            paymentPurpose: 'website-reservation',
            bookedAt: '2026-03-15',
            comgateParserVariant: 'legacy'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:web',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 38000,
            currency: 'CZK',
            bookedAt: '2026-03-15',
            reference: 'CG-RES-991',
            reservationId: 'WEB-RES-991',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-1']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo-web',
              reservationId: 'WEB-RES-991',
              guestName: 'Wendy Web',
              roomName: 'C301',
              reference: 'WEB-RES-991',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-18',
              stayEndAt: '2026-03-20',
              grossRevenueMinor: 38000,
              outstandingBalanceMinor: 0,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            {
              rowId: 'txn:comgate:web',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              reservationId: 'WEB-RES-991',
              payoutReference: 'CG-RES-991',
              payoutDate: '2026-03-15',
              amountMinor: 38000,
              matchingAmountMinor: 38000,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((block) => block.key === 'reservation_plus')!
    const mergedItem = resBlock.items.find((entry) => entry.id === 'reservation-payment:doc:previo-web:WEB-RES-991')
    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((t) => t.linkedReservationId === 'WEB-RES-991')

    expect(resBlock.items).toHaveLength(1)
    expect(mergedItem).toEqual(expect.objectContaining({
      title: 'Wendy Web',
      subtitle: 'C301',
      primaryReference: 'WEB-RES-991',
      statusKey: 'paid',
      evidenceKey: 'comgate',
      transactionIds: ['txn:comgate:web']
    }))
    expect(mergedItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Jednotka', value: 'C301' })
    ]))
    expect(mergeTrace).toEqual(expect.objectContaining({
      linkedReservationId: 'WEB-RES-991',
      chosenLinkReason: 'exact_refId_merge',
      nativeComgateFallbackSuppressed: true,
      mergedComgateRowId: 'txn:comgate:web',
      reservationGuestName: 'Wendy Web',
      reservationRoomName: 'C301'
    }))
  })

  it('uses the deterministic preceding parent rule for Reservation+ ancillary rows with ambiguous exact stay matches', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'previo-reservation-1',
          sourceDocumentId: 'doc:previo-web',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T09:30:00.000Z',
          amountMinor: 42000,
          currency: 'EUR',
          occurredAt: '2026-03-18',
          rawReference: '5159718129',
          data: {
            platform: 'previo',
            reference: '5159718129',
            reservationId: '5159718129',
            bookedAt: '2026-03-18',
            stayStartAt: '2026-03-20T14:00:00',
            stayEndAt: '2026-03-22T11:00:00',
            guestName: 'Denisa Plechlová,Jozef Kluvanec,Nataša Plechlová',
            roomName: '203',
            channel: 'direct_web'
          }
        },
        {
          id: 'previo-ancillary-2',
          sourceDocumentId: 'doc:previo-web',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T09:31:00.000Z',
          amountMinor: 6000,
          currency: 'EUR',
          occurredAt: '2026-03-18',
          rawReference: 'ADDON-20250650',
          data: {
            platform: 'previo',
            rowKind: 'ancillary',
            reference: 'ADDON-20250650',
            bookedAt: '2026-03-18',
            stayStartAt: '2026-03-20T14:00:00',
            stayEndAt: '2026-03-22T11:00:00',
            itemLabel: 'Pozdní check-in',
            channel: 'Alfred'
          }
        },
        {
          id: 'previo-reservation-3',
          sourceDocumentId: 'doc:previo-web',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T09:32:00.000Z',
          amountMinor: 43000,
          currency: 'EUR',
          occurredAt: '2026-03-18',
          rawReference: '6126906663',
          data: {
            platform: 'previo',
            reference: '6126906663',
            reservationId: '6126906663',
            bookedAt: '2026-03-18',
            stayStartAt: '2026-03-20T14:00:00',
            stayEndAt: '2026-03-22T11:00:00',
            guestName: 'Host 204',
            roomName: '204',
            channel: 'direct_web'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo-web',
              reservationId: '5159718129',
              guestName: 'Denisa Plechlová,Jozef Kluvanec,Nataša Plechlová',
              roomName: '203',
              reference: '5159718129',
              channel: 'direct_web',
              bookedAt: '2026-03-18',
              stayStartAt: '2026-03-20T14:00:00',
              stayEndAt: '2026-03-22T11:00:00',
              grossRevenueMinor: 42000,
              outstandingBalanceMinor: 0,
              currency: 'EUR',
              expectedSettlementChannels: ['comgate']
            },
            {
              sourceDocumentId: 'doc:previo-web',
              reservationId: '6126906663',
              guestName: 'Host 204',
              roomName: '204',
              reference: '6126906663',
              channel: 'direct_web',
              bookedAt: '2026-03-18',
              stayStartAt: '2026-03-20T14:00:00',
              stayEndAt: '2026-03-22T11:00:00',
              grossRevenueMinor: 43000,
              outstandingBalanceMinor: 0,
              currency: 'EUR',
              expectedSettlementChannels: ['comgate']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [
            {
              sourceRecordId: 'previo-ancillary-2',
              sourceDocumentId: 'doc:previo-web',
              sourceSystem: 'previo',
              reference: 'ADDON-20250650',
              bookedAt: '2026-03-18',
              stayStartAt: '2026-03-20T14:00:00',
              stayEndAt: '2026-03-22T11:00:00',
              itemLabel: 'Pozdní check-in',
              channel: 'Alfred',
              grossRevenueMinor: 6000,
              outstandingBalanceMinor: 0,
              currency: 'EUR'
            }
          ],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const item = overview.blocks.find((block) => block.key === 'reservation_plus')?.items.find((entry) => entry.primaryReference === 'ADDON-20250650')
    const trace = inspectReservationPaymentOverviewClassification(batch).ancillaryLinkTraces.find((entry) => entry.reference === 'ADDON-20250650')

    expect(item?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Denisa Plechlová,Jozef Kluvanec,Nataša Plechlová' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-20T14:00:00 – 2026-03-22T11:00:00' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: '203' })
    ]))
    expect(trace).toEqual(expect.objectContaining({
      linkedMainReservationId: '5159718129',
      linkedRoomName: '203',
      chosenCandidateReason: 'nearest_preceding_parent_block'
    }))
  })

  it('keeps native Reservation+ Comgate rows without a reservation anchor on the fallback path', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-1',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-19T10:00:00.000Z',
          amountMinor: 154900,
          currency: 'CZK',
          occurredAt: '2026-03-19',
          rawReference: 'CG-WEB-2001',
          data: {
            platform: 'comgate',
            reference: 'CG-WEB-2001',
            paymentPurpose: 'website-reservation',
            bookedAt: '2026-03-19',
            transactionId: 'CG-PORTAL-TRX-2001',
            comgateParserVariant: 'current-portal'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:web',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 154000,
            currency: 'CZK',
            bookedAt: '2026-03-19',
            reference: 'CG-WEB-2001',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-1']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo-web',
              reservationId: 'WEB-RES-991',
              guestName: 'Wendy Web',
              roomName: 'C301',
              reference: 'WEB-RES-991',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-18',
              stayEndAt: '2026-03-20',
              grossRevenueMinor: 154000,
              outstandingBalanceMinor: 0,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            {
              rowId: 'txn:comgate:web',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              payoutReference: 'CG-WEB-2001',
              payoutDate: '2026-03-19',
              amountMinor: 154900,
              matchingAmountMinor: 154000,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const item = overview.blocks.find((block) => block.key === 'reservation_plus')?.items[0]
    const trace = inspectReservationPaymentOverviewClassification(batch).reservationPlusNativeLinkTraces[0]

    expect(item).toEqual(expect.objectContaining({
      title: 'CG-WEB-2001',
      primaryReference: 'CG-WEB-2001'
    }))
    expect(item?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Host')
    expect(item?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Pobyt')
    expect(item?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Jednotka')
    expect(trace).toEqual(expect.objectContaining({
      reference: 'CG-WEB-2001',
      linkedMainReservationId: undefined,
      chosenCandidateReason: 'no_candidate'
    }))
  })

  it('marks Greta as paid from unique Booking payout-row evidence and keeps Tatiana unverified without payout-row evidence', () => {
    const batch = {
      extractedRecords: [],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:booking-greta-row',
            source: 'booking',
            subtype: 'payout',
            amountMinor: 25984,
            currency: 'EUR',
            bookedAt: '2026-03-12',
            reference: '010638445054',
            sourceDocumentIds: ['doc:booking-csv'],
            extractedRecordIds: []
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:booking-reservations-greta',
              reservationId: '6622415324',
              guestName: 'Greta Sieweke',
              roomName: 'A201',
              reference: '6622415324',
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
              sourceDocumentId: 'doc:booking-reservations-tatiana',
              reservationId: '5280445951',
              guestName: 'Tatiana Trakaliuk',
              roomName: 'A202',
              reference: '5280445951',
              channel: 'booking',
              bookedAt: '2026-03-05',
              stayStartAt: '2026-03-14',
              stayEndAt: '2026-03-16',
              grossRevenueMinor: 5226,
              outstandingBalanceMinor: 5226,
              currency: 'EUR',
              expectedSettlementChannels: ['booking']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [
            {
              sourceDocumentId: 'doc:booking-payout-pdf-greta',
              reservationId: '6622415324',
              matchedRowId: 'txn:booking-greta-row',
              settlementKind: 'payout_row',
              platform: 'booking',
              amountMinor: 25984,
              currency: 'EUR',
              confidence: 1,
              reasons: ['payoutSupplementReservationIdExact', 'amountExact', 'channelAligned'],
              evidence: [
                { key: 'payoutSupplementReservationId', value: '6622415324' },
                { key: 'payoutSupplementSourceDocumentId', value: 'doc:booking-pdf-greta' }
              ]
            }
          ],
          reservationSettlementNoMatches: [
            {
              sourceDocumentId: 'doc:booking-reservations-greta',
              reservationId: '6622415324',
              candidateCount: 0,
              noMatchReason: 'noCandidate'
            },
            {
              sourceDocumentId: 'doc:booking-reservations-tatiana',
              reservationId: '5280445951',
              candidateCount: 0,
              noMatchReason: 'noCandidate'
            }
          ],
          payoutRows: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const bookingItems = overview.blocks.find((block) => block.key === 'booking')?.items ?? []

    expect(bookingItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Greta Sieweke',
        primaryReference: '6622415324',
        statusKey: 'paid',
        evidenceKey: 'payout',
        transactionIds: ['txn:booking-greta-row']
      }),
      expect.objectContaining({
        title: 'Tatiana Trakaliuk',
        primaryReference: '5280445951',
        statusKey: 'unverified',
        evidenceKey: 'no_evidence'
      })
    ]))
  })

  it('marks the six explicit Booking payout PDF membership reservations as paid and keeps non-members outside the batch unverified', () => {
    const previousDebugReference = (globalThis as { __HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__?: string })
      .__HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__
      ; (globalThis as { __HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__?: string })
        .__HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__ = '6529631423'

    const explicitMembershipReservations = [
      {
        reservationId: '6529631423',
        guestName: 'Sedláček Jan',
        roomName: 'A201',
        bookedAt: '2026-03-18',
        stayStartAt: '2026-03-26',
        stayEndAt: '2026-03-28',
        grossRevenueMinor: 37888
      },
      {
        reservationId: '6008299863',
        guestName: 'Anatoliy Chebotaryov',
        roomName: 'A202',
        bookedAt: '2026-03-18',
        stayStartAt: '2026-03-26',
        stayEndAt: '2026-03-27',
        grossRevenueMinor: 15104
      },
      {
        reservationId: '6415593183',
        guestName: 'Aryna Ponomarenko',
        roomName: 'A203',
        bookedAt: '2026-03-19',
        stayStartAt: '2026-03-27',
        stayEndAt: '2026-03-29',
        grossRevenueMinor: 16512
      },
      {
        reservationId: '5159718129',
        guestName: 'Jozef Kluvanec',
        roomName: 'A204',
        bookedAt: '2026-03-20',
        stayStartAt: '2026-03-27',
        stayEndAt: '2026-03-30',
        grossRevenueMinor: 27648
      },
      {
        reservationId: '6126906663',
        guestName: 'Ronny Ronald Gündel',
        roomName: 'A205',
        bookedAt: '2026-03-21',
        stayStartAt: '2026-03-28',
        stayEndAt: '2026-03-30',
        grossRevenueMinor: 16640
      },
      {
        reservationId: '6354636438',
        guestName: 'Amir Fetratnejad',
        roomName: 'A206',
        bookedAt: '2026-03-21',
        stayStartAt: '2026-03-28',
        stayEndAt: '2026-03-31',
        grossRevenueMinor: 29440
      }
    ]

    const batch = {
      extractedRecords: [],
      reconciliation: {
        normalizedTransactions: [],
        payoutBatchMatches: [
          {
            payoutBatchKey: 'booking-batch:2026-03-26:010738140021',
            payoutBatchRowIds: [],
            bankTransactionId: 'txn:bank:booking-batch-1',
            bankAccountId: '5599955956/5500',
            amountMinor: 5293886,
            currency: 'CZK',
            confidence: 1,
            ruleKey: 'booking-batch-bank-match',
            matched: true,
            reasons: ['amountExact', 'currencyExact', 'directionInbound', 'routingAllowed'],
            evidence: []
          }
        ],
        workflowPlan: {
          reservationSources: [
            ...explicitMembershipReservations.map((reservation) => ({
              sourceDocumentId: `doc:previo:${reservation.reservationId}`,
              reservationId: reservation.reservationId,
              guestName: reservation.guestName,
              roomName: reservation.roomName,
              reference: reservation.reservationId,
              channel: 'booking',
              bookedAt: reservation.bookedAt,
              stayStartAt: reservation.stayStartAt,
              stayEndAt: reservation.stayEndAt,
              grossRevenueMinor: reservation.grossRevenueMinor,
              outstandingBalanceMinor: reservation.grossRevenueMinor,
              currency: 'EUR',
              expectedSettlementChannels: ['booking']
            })),
            {
              sourceDocumentId: 'doc:previo-tatiana',
              reservationId: '5280445951',
              guestName: 'Tatiana Trakaliuk',
              roomName: 'A207',
              reference: '5280445951',
              channel: 'booking',
              bookedAt: '2026-03-22',
              stayStartAt: '2026-03-31',
              stayEndAt: '2026-04-02',
              grossRevenueMinor: 5226,
              outstandingBalanceMinor: 5226,
              currency: 'EUR',
              expectedSettlementChannels: ['booking']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [
            ...explicitMembershipReservations.map((reservation) => ({
              sourceDocumentId: `doc:previo:${reservation.reservationId}`,
              reservationId: reservation.reservationId,
              candidateCount: 0,
              noMatchReason: 'noCandidate' as const
            })),
            {
              sourceDocumentId: 'doc:previo-tatiana',
              reservationId: '5280445951',
              candidateCount: 0,
              noMatchReason: 'noCandidate'
            }
          ],
          payoutRows: [],
          payoutBatches: [
            {
              payoutBatchKey: 'booking-batch:2026-03-26:010738140021',
              platform: 'booking',
              payoutReference: '010738140021',
              payoutDate: '2026-03-26',
              bankRoutingTarget: 'rb_bank_inflow',
              rowIds: [],
              expectedTotalMinor: 5293886,
              currency: 'CZK',
              componentReservationIds: [],
              payoutSupplementReferenceHints: explicitMembershipReservations.map((reservation) => reservation.reservationId),
              payoutSupplementReservationIds: [],
              payoutSupplementSourceDocumentIds: ['uploaded:booking:25:010738140021-pdf']
            }
          ],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    try {
      const overview = buildReservationPaymentOverview(batch)
      const bookingItems = overview.blocks.find((block) => block.key === 'booking')?.items ?? []

      expect(bookingItems).toEqual(expect.arrayContaining(
        explicitMembershipReservations.map((reservation) => expect.objectContaining({
          title: reservation.guestName,
          primaryReference: reservation.reservationId,
          statusKey: 'paid',
          evidenceKey: 'payout',
          transactionIds: [],
          paidAmountMinor: reservation.grossRevenueMinor,
          sourceDocumentIds: expect.arrayContaining([
            `doc:previo:${reservation.reservationId}`,
            'uploaded:booking:25:010738140021-pdf'
          ])
        }))
      ))
      expect(bookingItems).toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: 'Sedláček Jan',
          statusDetailCs: expect.stringContaining('010738140021'),
          detailEntries: expect.arrayContaining([
            expect.objectContaining({ labelCs: 'Booking payout batch', value: '010738140021 (2026-03-26)' }),
            expect.objectContaining({ labelCs: 'Potvrzení', value: 'spárovaná Booking payout dávka + Booking payout statement PDF' }),
            expect.objectContaining({ labelCs: 'DEBUG Booking matched batch', value: '010738140021' }),
            expect.objectContaining({ labelCs: 'DEBUG Booking candidate count', value: '1' }),
            expect.objectContaining({ labelCs: 'DEBUG Booking membership hit', value: 'yes' }),
            expect.objectContaining({ labelCs: 'DEBUG Booking amount hit', value: 'yes' }),
            expect.objectContaining({ labelCs: 'DEBUG Booking confirmation source', value: 'matched_batch_reference_hint' })
          ])
        }),
        expect.objectContaining({
          title: 'Tatiana Trakaliuk',
          primaryReference: '5280445951',
          statusKey: 'unverified',
          evidenceKey: 'no_evidence',
          transactionIds: []
        })
      ]))
      expect(bookingItems).toHaveLength(7)
    } finally {
      if (previousDebugReference) {
        ; (globalThis as { __HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__?: string })
          .__HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__ = previousDebugReference
      } else {
        delete (globalThis as { __HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__?: string })
          .__HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__
      }
    }
  })

  it('does not render raw Booking payout rows in the reservation column and marks Denisa paid only from exact Booking row evidence', () => {
    const batch = {
      extractedRecords: [],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:payout:booking-payout-2',
            source: 'booking',
            subtype: 'payout',
            amountMinor: 4480,
            currency: 'EUR',
            bookedAt: '2026-03-12',
            reference: 'PAYOUT-BOOK-20260310',
            reservationId: '5178029336',
            sourceDocumentIds: ['doc:booking-csv'],
            extractedRecordIds: []
          },
          {
            id: 'txn:payout:booking-payout-3',
            source: 'booking',
            subtype: 'payout',
            amountMinor: 6211,
            currency: 'EUR',
            bookedAt: '2026-03-12',
            reference: 'PAYOUT-BOOK-20260310',
            reservationId: '6748282290',
            sourceDocumentIds: ['doc:booking-csv'],
            extractedRecordIds: []
          },
          {
            id: 'txn:payout:booking-payout-4',
            source: 'booking',
            subtype: 'payout',
            amountMinor: 9980,
            currency: 'EUR',
            bookedAt: '2026-03-12',
            reference: 'PAYOUT-BOOK-20260310',
            reservationId: '6797262580',
            sourceDocumentIds: ['doc:booking-csv'],
            extractedRecordIds: []
          }
        ],
        payoutBatchMatches: [],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo-denisa',
              reservationId: '5178029336',
              guestName: 'Denisa Hypiusová',
              roomName: 'A202',
              reference: '5178029336',
              channel: 'booking',
              bookedAt: '2026-03-03',
              stayStartAt: '2026-03-07',
              stayEndAt: '2026-03-09',
              grossRevenueMinor: 4480,
              outstandingBalanceMinor: 4480,
              currency: 'EUR',
              expectedSettlementChannels: ['booking']
            },
            {
              sourceDocumentId: 'doc:previo-tatiana',
              reservationId: '5280445951',
              guestName: 'Tatiana Trakaliuk',
              roomName: 'A202',
              reference: '5280445951',
              channel: 'booking',
              bookedAt: '2026-03-05',
              stayStartAt: '2026-03-14',
              stayEndAt: '2026-03-16',
              grossRevenueMinor: 5226,
              outstandingBalanceMinor: 5226,
              currency: 'EUR',
              expectedSettlementChannels: ['booking']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [
            {
              sourceDocumentId: 'doc:previo-denisa',
              reservationId: '5178029336',
              candidateCount: 0,
              noMatchReason: 'noCandidate'
            },
            {
              sourceDocumentId: 'doc:previo-tatiana',
              reservationId: '5280445951',
              candidateCount: 0,
              noMatchReason: 'noCandidate'
            }
          ],
          payoutRows: [
            {
              rowId: 'txn:payout:booking-payout-2',
              platform: 'booking',
              sourceDocumentId: 'doc:booking-csv',
              reservationId: '5178029336',
              payoutReference: 'PAYOUT-BOOK-20260310',
              payoutDate: '2026-03-12',
              payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
              amountMinor: 4480,
              currency: 'EUR',
              bankRoutingTarget: 'rb_bank_inflow'
            },
            {
              rowId: 'txn:payout:booking-payout-3',
              platform: 'booking',
              sourceDocumentId: 'doc:booking-csv',
              reservationId: '6748282290',
              payoutReference: 'PAYOUT-BOOK-20260310',
              payoutDate: '2026-03-12',
              payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
              amountMinor: 6211,
              currency: 'EUR',
              bankRoutingTarget: 'rb_bank_inflow'
            },
            {
              rowId: 'txn:payout:booking-payout-4',
              platform: 'booking',
              sourceDocumentId: 'doc:booking-csv',
              reservationId: '6797262580',
              payoutReference: 'PAYOUT-BOOK-20260310',
              payoutDate: '2026-03-12',
              payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
              amountMinor: 9980,
              currency: 'EUR',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const bookingItems = overview.blocks.find((block) => block.key === 'booking')?.items ?? []

    expect(bookingItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Denisa Hypiusová',
        primaryReference: '5178029336',
        statusKey: 'paid',
        evidenceKey: 'payout',
        transactionIds: ['txn:payout:booking-payout-2'],
        sourceDocumentIds: expect.arrayContaining(['doc:previo-denisa', 'doc:booking-csv'])
      }),
      expect.objectContaining({
        title: 'Tatiana Trakaliuk',
        primaryReference: '5280445951',
        statusKey: 'unverified',
        evidenceKey: 'no_evidence',
        transactionIds: []
      })
    ]))

    expect(bookingItems).toHaveLength(2)
    expect(bookingItems.map((item) => item.primaryReference)).not.toEqual(expect.arrayContaining(['6748282290', '6797262580']))
  })

  it('keeps Airbnb and Reservation+ native items while filtering raw Booking payout rows from the reservation-centric view', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'rec:airbnb-1',
          sourceDocumentId: 'doc:airbnb-1',
          recordType: 'payout-line',
          extractedAt: '2026-03-12T10:00:00.000Z',
          data: {
            listingName: 'Studio A',
            stayStartAt: '2026-03-10',
            stayEndAt: '2026-03-12',
            guestName: 'Airbnb Guest',
            confirmationCode: 'HMX123',
            payoutReference: 'G-ABC'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:airbnb:1',
            source: 'airbnb',
            subtype: 'reservation',
            amountMinor: 12244,
            currency: 'EUR',
            bookedAt: '2026-03-13',
            reference: 'G-ABC',
            reservationId: 'AIRBNB-RES-1',
            sourceDocumentIds: ['doc:airbnb-1'],
            extractedRecordIds: ['rec:airbnb-1']
          },
          {
            id: 'txn:comgate:1',
            source: 'comgate',
            subtype: 'payout',
            amountMinor: 154900,
            currency: 'CZK',
            bookedAt: '2026-03-19',
            reference: 'CG-WEB-2001',
            sourceDocumentIds: ['doc:comgate-1'],
            extractedRecordIds: []
          },
          {
            id: 'txn:booking:raw-1',
            source: 'booking',
            subtype: 'payout',
            amountMinor: 9980,
            currency: 'EUR',
            bookedAt: '2026-03-12',
            reference: 'PAYOUT-BOOK-20260310',
            reservationId: '6748282290',
            sourceDocumentIds: ['doc:booking-csv'],
            extractedRecordIds: []
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
              rowId: 'txn:comgate:1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-1',
              payoutReference: 'CG-WEB-2001',
              payoutDate: '2026-03-19',
              payoutBatchKey: 'comgate-batch:2026-03-19:CZK',
              amountMinor: 154900,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            },
            {
              rowId: 'txn:booking:raw-1',
              platform: 'booking',
              sourceDocumentId: 'doc:booking-csv',
              reservationId: '6748282290',
              payoutReference: 'PAYOUT-BOOK-20260310',
              payoutDate: '2026-03-12',
              payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
              amountMinor: 9980,
              currency: 'EUR',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)

    expect(overview.blocks.find((block) => block.key === 'booking')?.items).toEqual([])
    expect(overview.blocks.find((block) => block.key === 'airbnb')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Airbnb Guest',
        primaryReference: 'HMX123'
      })
    ]))
    expect(overview.blocks.find((block) => block.key === 'reservation_plus')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'CG-WEB-2001',
        evidenceKey: 'comgate'
      })
    ]))
  })

  it('merges Previo reservation + Comgate payment with same refId into one paid item with host', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-merge',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 250000,
          currency: 'CZK',
          occurredAt: '2026-03-15',
          data: {
            platform: 'comgate',
            reference: 'CG-REF-5001',
            reservationId: 'RES-5001',
            paymentPurpose: 'website-reservation',
            bookedAt: '2026-03-15'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:merge',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 250000,
            currency: 'CZK',
            bookedAt: '2026-03-15',
            reference: 'CG-REF-5001',
            reservationId: 'RES-5001',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-merge']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: 'RES-5001',
              guestName: 'Jan Novák',
              roomName: 'D401',
              reference: 'RES-5001',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-20',
              stayEndAt: '2026-03-22',
              grossRevenueMinor: 250000,
              outstandingBalanceMinor: 0,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            {
              rowId: 'txn:comgate:merge',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              reservationId: 'RES-5001',
              payoutReference: 'CG-REF-5001',
              payoutDate: '2026-03-15',
              amountMinor: 250000,
              matchingAmountMinor: 250000,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((b) => b.key === 'reservation_plus')!

    expect(resBlock.items).toHaveLength(1)
    const merged = resBlock.items[0]!
    expect(merged.id).toBe('reservation-payment:doc:previo:RES-5001')
    expect(merged.title).toBe('Jan Novák')
    expect(merged.subtitle).toBe('D401')
    expect(merged.statusKey).toBe('paid')
    expect(merged.evidenceKey).toBe('comgate')
    expect(merged.transactionIds).toEqual(['txn:comgate:merge'])
    expect(merged.sourceDocumentIds).toContain('doc:previo')
    expect(merged.sourceDocumentIds).toContain('doc:comgate')

    const nativeItem = resBlock.items.find((i) => i.id.includes('native'))
    expect(nativeItem).toBeUndefined()
  })

  it('leaves Previo reservation unverified when no matching Comgate refId exists', () => {
    const batch = {
      extractedRecords: [],
      reconciliation: {
        normalizedTransactions: [],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: 'RES-ALONE-1',
              guestName: 'Eva Samotná',
              roomName: 'E501',
              reference: 'RES-ALONE-1',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-20',
              stayEndAt: '2026-03-22',
              grossRevenueMinor: 180000,
              outstandingBalanceMinor: 180000,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((b) => b.key === 'reservation_plus')!

    expect(resBlock.items).toHaveLength(1)
    const item = resBlock.items[0]!
    expect(item.title).toBe('Eva Samotná')
    expect(item.statusKey).toBe('missing')
    expect(item.evidenceKey).toBe('no_evidence')

    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((t) => t.linkedReservationId === 'RES-ALONE-1')
    expect(mergeTrace).toEqual(expect.objectContaining({
      chosenLinkReason: 'no_merge',
      nativeComgateFallbackSuppressed: false
    }))
  })

  it('keeps native Comgate item as fallback without host when no reservation anchor exists', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-orphan',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 50000,
          currency: 'CZK',
          occurredAt: '2026-03-16',
          data: {
            platform: 'comgate',
            reference: 'CG-ORPHAN-99',
            reservationId: 'ORPHAN-99',
            paymentPurpose: 'website-reservation',
            bookedAt: '2026-03-16'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:orphan',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 50000,
            currency: 'CZK',
            bookedAt: '2026-03-16',
            reference: 'CG-ORPHAN-99',
            reservationId: 'ORPHAN-99',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-orphan']
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
              rowId: 'txn:comgate:orphan',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              reservationId: 'ORPHAN-99',
              payoutReference: 'CG-ORPHAN-99',
              payoutDate: '2026-03-16',
              amountMinor: 50000,
              matchingAmountMinor: 50000,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((b) => b.key === 'reservation_plus')!

    expect(resBlock.items).toHaveLength(1)
    const item = resBlock.items[0]!
    expect(item.id).toBe('reservation-payment:native:txn:comgate:orphan')
    expect(item.statusKey).toBe('paid')
    expect(item.evidenceKey).toBe('comgate')
    expect(item.detailEntries.find((d) => d.labelCs === 'Host')).toBeUndefined()
  })

  it('produces consistent debug trace for Reservation+ Comgate merge', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-trace-row',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 120000,
          currency: 'CZK',
          occurredAt: '2026-03-17',
          data: {
            platform: 'comgate',
            reference: 'CG-TRACE-88',
            reservationId: 'RES-TRACE-88',
            paymentPurpose: 'website-reservation',
            bookedAt: '2026-03-17'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:trace',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 120000,
            currency: 'CZK',
            bookedAt: '2026-03-17',
            reference: 'CG-TRACE-88',
            reservationId: 'RES-TRACE-88',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-trace-row']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: 'RES-TRACE-88',
              guestName: 'Trace Guest',
              roomName: 'F601',
              reference: 'RES-TRACE-88',
              channel: 'direct_web',
              bookedAt: '2026-03-12',
              stayStartAt: '2026-03-20',
              stayEndAt: '2026-03-23',
              grossRevenueMinor: 120000,
              outstandingBalanceMinor: 0,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            {
              rowId: 'txn:comgate:trace',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              reservationId: 'RES-TRACE-88',
              payoutReference: 'CG-TRACE-88',
              payoutDate: '2026-03-17',
              amountMinor: 120000,
              matchingAmountMinor: 120000,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTraces = debug.reservationPlusComgateMergeTraces

    expect(mergeTraces).toHaveLength(1)
    expect(mergeTraces[0]).toEqual(expect.objectContaining({
      finalOverviewItemId: 'reservation-payment:doc:previo:RES-TRACE-88',
      linkedReservationId: 'RES-TRACE-88',
      linkedPaymentReference: 'txn:comgate:trace',
      chosenLinkReason: 'exact_refId_merge',
      nativeComgateFallbackSuppressed: true,
      mergedComgateRowId: 'txn:comgate:trace',
      mergedComgateSourceDocumentId: 'doc:comgate',
      reservationGuestName: 'Trace Guest',
      reservationRoomName: 'F601',
      reservationStayStartAt: '2026-03-20',
      reservationStayEndAt: '2026-03-23'
    }))

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((b) => b.key === 'reservation_plus')!
    expect(resBlock.items).toHaveLength(1)
    expect(resBlock.items.find((i) => i.id.includes('native'))).toBeUndefined()
  })
})