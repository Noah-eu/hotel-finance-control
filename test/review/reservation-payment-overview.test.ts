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
      invoiceListCandidateCount: 0,
      candidateCountBlockedReason: 'no_exact_counterpart_in_selected_files',
      noExactCounterpartInSelectedFiles: true,
      chosenCandidateSource: 'none',
      chosenCandidateReason: 'no_candidate'
    }))
  })

  it('merges native Comgate row into an invoice-backed Reservation+ reservation entity via exact variable symbol', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-bridge-1',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-27T10:00:00.000Z',
          amountMinor: 242351,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          rawReference: '1816656820',
          data: {
            platform: 'comgate',
            reference: '1816656820',
            paymentPurpose: 'website-reservation',
            transactionId: 'CG-BRIDGE-TRX-1',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:bridge1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 242351,
            currency: 'CZK',
            bookedAt: '2026-03-27',
            reference: '1816656820',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-bridge-1']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: 'RES-ENTITY-108929843',
              guestName: 'Eva Svobodova',
              roomName: 'B202',
              reference: 'RES-ENTITY-108929843',
              channel: 'direct_web',
              bookedAt: '2026-03-20',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-30',
              grossRevenueMinor: 302940,
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
              rowId: 'txn:comgate:bridge1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              payoutReference: '1816656820',
              payoutDate: '2026-03-27',
              amountMinor: 242351,
              matchingAmountMinor: 242351,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-header-bridge-1',
              sourceDocumentId: 'doc:invoice-list',
              recordKind: 'header',
              voucher: 'RES-ENTITY-108929843',
              variableSymbol: '1816656820',
              guestName: 'Eva Svobodova',
              roomName: 'B202',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-30',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((block) => block.key === 'reservation_plus')!
    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((trace) => trace.linkedReservationId === 'RES-ENTITY-108929843')!

    expect(resBlock.items).toHaveLength(1)
    expect(resBlock.items[0]).toEqual(expect.objectContaining({
      title: 'Eva Svobodova',
      evidenceKey: 'comgate',
      transactionIds: ['txn:comgate:bridge1']
    }))
    expect(debug.reservationPlusNativeLinkTraces.find((trace) => trace.rowId === 'txn:comgate:bridge1')).toBeUndefined()
    expect(mergeTrace).toEqual(expect.objectContaining({
      chosenLinkReason: 'exact_refId_merge',
      nativeComgateFallbackSuppressed: true,
      reservationEntityMatchedByInvoiceList: true,
      nativeRowMergedIntoReservationEntity: true,
      mergeSource: 'reservation_entity',
      mergeAnchorType: 'invoice_list_variable_symbol',
      mergedComgateRowId: 'txn:comgate:bridge1'
    }))
  })

  it('merges native monthly-settlement Comgate row via exact Popis merchantOrderReference anchor', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-monthly-bridge-1',
          sourceDocumentId: 'doc:comgate-monthly',
          recordType: 'payout-line',
          extractedAt: '2026-03-27T10:00:00.000Z',
          amountMinor: 300000,
          currency: 'CZK',
          occurredAt: '2026-03-28',
          rawReference: 'CG-MONTHLY-TRX-1',
          data: {
            platform: 'comgate',
            reference: '1816480742',
            clientId: '999900001',
            merchantOrderReference: '109047421',
            paymentPurpose: 'website-reservation',
            transactionId: 'CG-MONTHLY-TRX-1',
            comgateParserVariant: 'monthly-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:monthlyBridge1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 300000,
            currency: 'CZK',
            bookedAt: '2026-03-28',
            reference: '1816480742',
            sourceDocumentIds: ['doc:comgate-monthly'],
            extractedRecordIds: ['comgate-row-monthly-bridge-1']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: '109047421',
              guestName: 'Klara Vesela',
              roomName: 'C303',
              reference: '109047421',
              channel: 'direct_web',
              bookedAt: '2026-03-20',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-30',
              grossRevenueMinor: 302940,
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
              rowId: 'txn:comgate:monthlyBridge1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-monthly',
              payoutReference: '1816480742',
              payoutDate: '2026-03-28',
              amountMinor: 300000,
              matchingAmountMinor: 300000,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-header-monthly-bridge-1',
              sourceDocumentId: 'doc:invoice-list',
              recordKind: 'header',
              voucher: '109047421',
              variableSymbol: '1816480742',
              guestName: 'Klara Vesela',
              roomName: 'C303',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-30',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((block) => block.key === 'reservation_plus')!
    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((trace) => trace.linkedReservationId === '109047421')!

    expect(resBlock.items).toHaveLength(1)
    expect(resBlock.items[0]).toEqual(expect.objectContaining({
      title: 'Klara Vesela',
      evidenceKey: 'comgate',
      transactionIds: ['txn:comgate:monthlyBridge1']
    }))
    expect(debug.reservationPlusNativeLinkTraces.find((trace) => trace.rowId === 'txn:comgate:monthlyBridge1')).toBeUndefined()
    expect(mergeTrace).toEqual(expect.objectContaining({
      chosenLinkReason: 'exact_clientId_merge',
      nativeComgateFallbackSuppressed: true,
      reservationEntityMatchedByInvoiceList: true,
      nativeRowMergedIntoReservationEntity: true,
      mergeSource: 'reservation_entity',
      mergeAnchorType: 'reservation_id',
      mergedComgateRowId: 'txn:comgate:monthlyBridge1'
    }))
  })

  it('keeps native Comgate row separate when invoice-backed reservation entity has no deterministic merge anchor', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-bridge-2',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-27T10:00:00.000Z',
          amountMinor: 242351,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          rawReference: '1816656999',
          data: {
            platform: 'comgate',
            reference: '1816656999',
            paymentPurpose: 'website-reservation',
            transactionId: 'CG-BRIDGE-TRX-2',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:bridge2',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 242351,
            currency: 'CZK',
            bookedAt: '2026-03-27',
            reference: '1816656999',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-bridge-2']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: 'RES-ENTITY-109047421',
              guestName: 'Petr Novak',
              roomName: 'C301',
              reference: 'RES-ENTITY-109047421',
              channel: 'direct_web',
              bookedAt: '2026-03-20',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-30',
              grossRevenueMinor: 302940,
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
              rowId: 'txn:comgate:bridge2',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              payoutReference: '1816656999',
              payoutDate: '2026-03-27',
              amountMinor: 242351,
              matchingAmountMinor: 242351,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-header-bridge-2',
              sourceDocumentId: 'doc:invoice-list',
              recordKind: 'header',
              voucher: 'RES-ENTITY-109047421',
              variableSymbol: '1816480742',
              guestName: 'Petr Novak',
              roomName: 'C301',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-30',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((block) => block.key === 'reservation_plus')!
    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((trace) => trace.linkedReservationId === 'RES-ENTITY-109047421')!

    expect(resBlock.items).toHaveLength(2)
    expect(resBlock.items.some((item) => item.id === 'reservation-payment:native:txn:comgate:bridge2')).toBe(true)
    expect(mergeTrace).toEqual(expect.objectContaining({
      chosenLinkReason: 'no_merge',
      nativeComgateFallbackSuppressed: false,
      reservationEntityMatchedByInvoiceList: true,
      nativeRowMergedIntoReservationEntity: false,
      mergeSource: 'none',
      noMergeReason: 'no_candidate'
    }))
  })

  it('merges current-portal native Comgate row when reference carries deterministic reservation identity', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-cp-1',
          sourceDocumentId: 'doc:comgate-current',
          recordType: 'payout-line',
          extractedAt: '2026-03-27T10:00:00.000Z',
          amountMinor: 302940,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          rawReference: '109047421',
          data: {
            platform: 'comgate',
            reference: '109047421',
            paymentPurpose: 'website-reservation',
            transactionId: 'CG-CP-109047421',
            comgateParserVariant: 'current-portal'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:cp1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 302940,
            currency: 'CZK',
            bookedAt: '2026-03-27',
            reference: '109047421',
            sourceDocumentIds: ['doc:comgate-current'],
            extractedRecordIds: ['comgate-row-cp-1']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: '109047421',
              guestName: 'Klara Vesela',
              roomName: 'C303',
              reference: '109047421',
              channel: 'direct_web',
              bookedAt: '2026-03-20',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-30',
              grossRevenueMinor: 302940,
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
              rowId: 'txn:comgate:cp1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-current',
              payoutReference: '109047421',
              payoutDate: '2026-03-27',
              amountMinor: 302940,
              matchingAmountMinor: 302940,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-header-cp-1',
              sourceDocumentId: 'doc:invoice-list',
              recordKind: 'header',
              voucher: '109047421',
              variableSymbol: '1816480742',
              guestName: 'Klara Vesela',
              roomName: 'C303',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-30',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((block) => block.key === 'reservation_plus')!
    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((trace) => trace.linkedReservationId === '109047421')!

    expect(resBlock.items).toHaveLength(1)
    expect(resBlock.items[0]).toEqual(expect.objectContaining({
      title: 'Klara Vesela',
      evidenceKey: 'comgate',
      transactionIds: ['txn:comgate:cp1']
    }))
    expect(debug.reservationPlusNativeLinkTraces.find((trace) => trace.rowId === 'txn:comgate:cp1')).toBeUndefined()
    expect(mergeTrace).toEqual(expect.objectContaining({
      chosenLinkReason: 'exact_refId_merge',
      nativeComgateFallbackSuppressed: true,
      reservationEntityMatchedByInvoiceList: true,
      nativeRowMergedIntoReservationEntity: true,
      mergeSource: 'reservation_entity',
      mergeAnchorType: 'reservation_id',
      mergedComgateRowId: 'txn:comgate:cp1'
    }))
  })

  it('links native Reservation+ Comgate rows via invoice-list exact voucher anchor when reservation export is missing', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-inv-1',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-28T10:00:00.000Z',
          amountMinor: 242351,
          currency: 'CZK',
          occurredAt: '2026-03-28',
          rawReference: '1817482862',
          data: {
            platform: 'comgate',
            reference: '1817482862',
            clientId: '109086233',
            reservationId: '109086233',
            paymentPurpose: 'website-reservation',
            transactionId: 'CG-INV-109086233',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:inv1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 242351,
            currency: 'CZK',
            bookedAt: '2026-03-28',
            reference: '1817482862',
            reservationId: '109086233',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-inv-1']
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
              rowId: 'txn:comgate:inv1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              reservationId: '109086233',
              payoutReference: '1817482862',
              payoutDate: '2026-03-28',
              amountMinor: 242351,
              matchingAmountMinor: 242351,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-list-header-1',
              sourceDocumentId: 'doc:invoice-list',
              recordKind: 'header',
              voucher: '109086233',
              variableSymbol: '1817482862',
              guestName: 'Jan Novak',
              roomName: 'A101',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-29',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const item = overview.blocks.find((block) => block.key === 'reservation_plus')?.items[0]
    const trace = inspectReservationPaymentOverviewClassification(batch).reservationPlusNativeLinkTraces[0]

    expect(item).toEqual(expect.objectContaining({
      title: 'Jan Novak',
      subtitle: 'A101',
      primaryReference: '109086233'
    }))
    expect(item?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Jan Novak' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-27 – 2026-03-29' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: 'A101' })
    ]))
    expect(trace).toEqual(expect.objectContaining({
      linkedMainReservationId: '109086233',
      linkedGuestName: 'Jan Novak',
      linkedRoomName: 'A101',
      invoiceListCandidateCount: 1,
      invoiceListExactIdentityHits: [expect.objectContaining({ voucher: '109086233' })],
      invoiceListExactDocumentHits: [expect.objectContaining({ variableSymbol: '1817482862' })],
      chosenCandidateSource: 'invoice_list',
      chosenCandidateReason: 'exact_identity'
    }))
  })

  it('links native Reservation+ row via voucher-like merchantOrderReference when reservationId/clientId are not anchorable', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-mor-voucher-1',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-28T10:00:00.000Z',
          amountMinor: 242351,
          currency: 'CZK',
          occurredAt: '2026-03-28',
          rawReference: 'CG-MOR-1',
          data: {
            platform: 'comgate',
            reference: '1817482862',
            clientId: 'UNMAPPED-CLIENT-1',
            merchantOrderReference: 'MOR-VOUCHER-777',
            paymentPurpose: 'website-reservation',
            transactionId: 'CG-MOR-1',
            comgateParserVariant: 'monthly-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:morVoucher1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 242351,
            currency: 'CZK',
            bookedAt: '2026-03-28',
            reference: '1817482862',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-mor-voucher-1']
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
              rowId: 'txn:comgate:morVoucher1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              payoutReference: '1817482862',
              payoutDate: '2026-03-28',
              amountMinor: 242351,
              matchingAmountMinor: 242351,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-list-header-mor-voucher',
              sourceDocumentId: 'doc:invoice-list',
              recordKind: 'header',
              voucher: 'MOR-VOUCHER-777',
              variableSymbol: '1817482862',
              guestName: 'Mila Voucher',
              roomName: 'A111',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-29',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const item = overview.blocks.find((block) => block.key === 'reservation_plus')?.items[0]
    const trace = inspectReservationPaymentOverviewClassification(batch).reservationPlusNativeLinkTraces[0]

    expect(item).toEqual(expect.objectContaining({
      title: 'Mila Voucher'
    }))
    expect(trace).toEqual(expect.objectContaining({
      merchantOrderReferenceAnchorFamily: 'alpha_numeric',
      invoiceListVoucherHits: 1,
      reservationEntityBridgeHits: 0,
      linkedMainReservationId: 'MOR-VOUCHER-777',
      chosenCandidateSource: 'invoice_list',
      chosenCandidateReason: 'exact_identity',
      candidateCountBlockedReason: 'none'
    }))
  })

  it('links native Reservation+ row via document-family merchantOrderReference as exact invoice-list variable symbol', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-mor-doc-1',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-28T10:00:00.000Z',
          amountMinor: 242351,
          currency: 'CZK',
          occurredAt: '2026-03-28',
          rawReference: 'CG-MOR-2',
          data: {
            platform: 'comgate',
            reference: 'UNMAPPED-PAYOUT-REF',
            clientId: 'UNMAPPED-CLIENT-2',
            merchantOrderReference: '1816303586',
            paymentPurpose: 'website-reservation',
            transactionId: 'CG-MOR-2',
            comgateParserVariant: 'monthly-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:morDoc1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 242351,
            currency: 'CZK',
            bookedAt: '2026-03-28',
            reference: 'UNMAPPED-PAYOUT-REF',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-mor-doc-1']
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
              rowId: 'txn:comgate:morDoc1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              payoutReference: 'UNMAPPED-PAYOUT-REF',
              payoutDate: '2026-03-28',
              amountMinor: 242351,
              matchingAmountMinor: 242351,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-list-header-mor-doc',
              sourceDocumentId: 'doc:invoice-list',
              recordKind: 'header',
              voucher: 'INVOICE-VOUCHER-3586',
              variableSymbol: '1816303586',
              guestName: 'Karel Symbol',
              roomName: 'B208',
              stayStartAt: '2026-03-26',
              stayEndAt: '2026-03-28',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const item = overview.blocks.find((block) => block.key === 'reservation_plus')?.items[0]
    const trace = inspectReservationPaymentOverviewClassification(batch).reservationPlusNativeLinkTraces[0]

    expect(item).toEqual(expect.objectContaining({
      title: 'Karel Symbol'
    }))
    expect(trace).toEqual(expect.objectContaining({
      merchantOrderReferenceAnchorFamily: 'numeric',
      invoiceListVariableSymbolHits: 1,
      invoiceListInvoiceNumberHits: 0,
      linkedMainReservationId: 'INVOICE-VOUCHER-3586',
      chosenCandidateSource: 'invoice_list',
      chosenCandidateReason: 'exact_identity',
      candidateCountBlockedReason: 'none'
    }))
  })

  it('classifies unresolved monthly-settlement merchantOrderReference anchors and links only rows with exact counterparts', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-unresolved-1',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-05T15:42:56.000Z',
          amountMinor: 146160,
          currency: 'CZK',
          occurredAt: '2026-03-09',
          rawReference: 'TI62-BE9H-XUZ0',
          data: {
            platform: 'comgate',
            reference: '1813398831',
            clientId: '108286707',
            merchantOrderReference: '6121722338',
            paymentPurpose: 'website-reservation',
            transactionId: 'TI62-BE9H-XUZ0',
            comgateParserVariant: 'monthly-settlement'
          }
        },
        {
          id: 'comgate-row-unresolved-2',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-19T16:23:23.000Z',
          amountMinor: 147060,
          currency: 'CZK',
          occurredAt: '2026-03-23',
          rawReference: 'E6EZ-XCYW-D4AT',
          data: {
            platform: 'comgate',
            reference: '1815905986',
            clientId: '108806109',
            merchantOrderReference: '5159718129',
            paymentPurpose: 'website-reservation',
            transactionId: 'E6EZ-XCYW-D4AT',
            comgateParserVariant: 'monthly-settlement'
          }
        },
        {
          id: 'comgate-row-unresolved-3',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-26T16:37:53.000Z',
          amountMinor: 305938,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          rawReference: 'BHOV-M0TY-LBQV',
          data: {
            platform: 'comgate',
            reference: '1816656820',
            clientId: '108929843',
            merchantOrderReference: '6946461725',
            paymentPurpose: 'website-reservation',
            transactionId: 'BHOV-M0TY-LBQV',
            comgateParserVariant: 'monthly-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:unresolved1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 146160,
            currency: 'CZK',
            bookedAt: '2026-03-09',
            reference: '1813398831',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-unresolved-1']
          },
          {
            id: 'txn:comgate:unresolved2',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 147060,
            currency: 'CZK',
            bookedAt: '2026-03-23',
            reference: '1815905986',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-unresolved-2']
          },
          {
            id: 'txn:comgate:unresolved3',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 305938,
            currency: 'CZK',
            bookedAt: '2026-03-27',
            reference: '1816656820',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-unresolved-3']
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
              rowId: 'txn:comgate:unresolved1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              payoutReference: '1813398831',
              payoutDate: '2026-03-09',
              amountMinor: 146160,
              matchingAmountMinor: 146160,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            },
            {
              rowId: 'txn:comgate:unresolved2',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              payoutReference: '1815905986',
              payoutDate: '2026-03-23',
              amountMinor: 147060,
              matchingAmountMinor: 147060,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            },
            {
              rowId: 'txn:comgate:unresolved3',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              payoutReference: '1816656820',
              payoutDate: '2026-03-27',
              amountMinor: 305938,
              matchingAmountMinor: 305938,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-list-header-6121722338-feb',
              sourceDocumentId: 'doc:invoice-list-feb',
              recordKind: 'header',
              voucher: '6121722338',
              variableSymbol: '20260242',
              invoiceNumber: 'FA20260242',
              guestName: 'Roessler Yvonne',
              roomName: '303,Parkování 4',
              currency: 'CZK'
            },
            {
              sourceRecordId: 'invoice-list-header-6121722338-mar',
              sourceDocumentId: 'doc:invoice-list-mar',
              recordKind: 'header',
              voucher: '6121722338',
              variableSymbol: '20260322',
              invoiceNumber: 'FA20260322',
              guestName: 'Roessler Yvonne',
              roomName: '303,Parkování 4',
              currency: 'CZK'
            },
            {
              sourceRecordId: 'invoice-list-header-5159718129-feb',
              sourceDocumentId: 'doc:invoice-list-feb',
              recordKind: 'header',
              voucher: '5159718129',
              variableSymbol: '20260263',
              invoiceNumber: 'FA20260263',
              guestName: 'Kluvanec Jozef',
              roomName: '203,Parkování 1',
              currency: 'CZK'
            },
            {
              sourceRecordId: 'invoice-list-header-5159718129-mar',
              sourceDocumentId: 'doc:invoice-list-mar',
              recordKind: 'header',
              voucher: '5159718129',
              variableSymbol: '20260306',
              invoiceNumber: 'FA20260306',
              guestName: 'Kluvanec Jozef',
              roomName: '203,Parkování 1',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const traces = inspectReservationPaymentOverviewClassification(batch).reservationPlusNativeLinkTraces
    const first = traces.find((trace) => trace.reference === '1813398831')
    const second = traces.find((trace) => trace.reference === '1815905986')
    const third = traces.find((trace) => trace.reference === '1816656820')

    expect(first).toEqual(expect.objectContaining({
      merchantOrderReferenceAnchorFamily: 'numeric',
      linkedMainReservationId: '6121722338',
      linkedGuestName: 'Roessler Yvonne',
      candidateCount: 1,
      invoiceListVoucherHits: 2,
      invoiceListVariableSymbolHits: 0,
      invoiceListInvoiceNumberHits: 0,
      candidateCountBlockedReason: 'none',
      noExactCounterpartInSelectedFiles: false,
      chosenCandidateSource: 'invoice_list',
      chosenCandidateReason: 'exact_identity'
    }))
    expect(second).toEqual(expect.objectContaining({
      merchantOrderReferenceAnchorFamily: 'numeric',
      linkedMainReservationId: '5159718129',
      linkedGuestName: 'Kluvanec Jozef',
      candidateCount: 1,
      invoiceListVoucherHits: 2,
      invoiceListVariableSymbolHits: 0,
      invoiceListInvoiceNumberHits: 0,
      candidateCountBlockedReason: 'none',
      noExactCounterpartInSelectedFiles: false,
      chosenCandidateSource: 'invoice_list',
      chosenCandidateReason: 'exact_identity'
    }))
    expect(third).toEqual(expect.objectContaining({
      merchantOrderReferenceAnchorFamily: 'numeric',
      linkedMainReservationId: undefined,
      invoiceListVoucherHits: 0,
      invoiceListVariableSymbolHits: 0,
      invoiceListInvoiceNumberHits: 0,
      candidateCountBlockedReason: 'no_exact_counterpart_in_selected_files',
      noExactCounterpartInSelectedFiles: true,
      chosenCandidateReason: 'no_candidate'
    }))
  })

  it('links native parking Comgate rows via invoice-list parking line-item exact anchor', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-row-park-1',
          sourceDocumentId: 'doc:comgate',
          recordType: 'payout-line',
          extractedAt: '2026-03-28T10:00:00.000Z',
          amountMinor: 30000,
          currency: 'CZK',
          occurredAt: '2026-03-28',
          rawReference: '1817482862',
          data: {
            platform: 'comgate',
            reference: '1817482862',
            clientId: '109071283',
            reservationId: '109071283',
            paymentPurpose: 'parking',
            transactionId: 'CG-PARK-109071283',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:park1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 30000,
            currency: 'CZK',
            bookedAt: '2026-03-28',
            reference: '1817482862',
            reservationId: '109071283',
            sourceDocumentIds: ['doc:comgate'],
            extractedRecordIds: ['comgate-row-park-1']
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
              rowId: 'txn:comgate:park1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate',
              reservationId: '109071283',
              payoutReference: '1817482862',
              payoutDate: '2026-03-28',
              amountMinor: 30000,
              matchingAmountMinor: 30000,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            }
          ],
          payoutBatches: [],
          directBankSettlements: [],
          invoiceListEnrichment: [
            {
              sourceRecordId: 'invoice-list-line-1',
              sourceDocumentId: 'doc:invoice-list',
              recordKind: 'line-item',
              voucher: '109071283',
              variableSymbol: '1817482862',
              itemLabel: 'Parkování na den',
              guestName: 'Pavel Park',
              roomName: 'Parking',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-29',
              currency: 'CZK'
            }
          ]
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const item = overview.blocks.find((block) => block.key === 'parking')?.items[0]

    expect(item).toEqual(expect.objectContaining({
      blockKey: 'parking',
      title: '1817482862',
      subtitle: 'Parkovací platba'
    }))
    expect(item?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Pavel Park' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-27 – 2026-03-29' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: 'Parking' })
    ]))
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

  it('merges Comgate daily-settlement row via clientId when reservationId comes from ID od klienta', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-row-1',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 60699,
          currency: 'CZK',
          occurredAt: '2026-03-15',
          data: {
            platform: 'comgate',
            reference: '1822628730',
            clientId: '109189209',
            reservationId: '109189209',
            transactionId: 'M6F7-DQEO-J1BD',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:ds1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 60699,
            currency: 'CZK',
            bookedAt: '2026-03-15',
            reference: '1822628730',
            reservationId: '109189209',
            sourceDocumentIds: ['doc:comgate-ds'],
            extractedRecordIds: ['comgate-ds-row-1']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: '109189209',
              guestName: 'Guest A',
              roomName: 'A101',
              reference: '109189209',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-15',
              stayEndAt: '2026-03-17',
              grossRevenueMinor: 61300,
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
              rowId: 'txn:comgate:ds1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-ds',
              reservationId: '109189209',
              payoutReference: '1822628730',
              payoutDate: '2026-03-15',
              amountMinor: 60699,
              matchingAmountMinor: 60699,
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
    expect(resBlock.items[0]).toEqual(expect.objectContaining({
      id: 'reservation-payment:doc:previo:109189209',
      title: 'Guest A',
      subtitle: 'A101',
      statusKey: 'paid',
      evidenceKey: 'comgate',
      transactionIds: ['txn:comgate:ds1']
    }))
    expect(resBlock.items.find((i) => i.id.includes('native'))).toBeUndefined()
  })

  it('does not cross-merge Comgate rows under the same VS but different clientId values', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-row-A',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 60699,
          currency: 'CZK',
          occurredAt: '2026-03-15',
          data: {
            platform: 'comgate',
            reference: '1822628730',
            clientId: '109189209',
            reservationId: '109189209',
            transactionId: 'M6F7-DQEO-J1BD',
            comgateParserVariant: 'daily-settlement'
          }
        },
        {
          id: 'comgate-ds-row-B',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:01:00.000Z',
          amountMinor: 121498,
          currency: 'CZK',
          occurredAt: '2026-03-15',
          data: {
            platform: 'comgate',
            reference: '1822628730',
            clientId: '109329103',
            reservationId: '109329103',
            transactionId: 'AATZ-WCXM-2FHY',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:dsA',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 60699,
            currency: 'CZK',
            bookedAt: '2026-03-15',
            reference: '1822628730',
            reservationId: '109189209',
            sourceDocumentIds: ['doc:comgate-ds'],
            extractedRecordIds: ['comgate-ds-row-A']
          },
          {
            id: 'txn:comgate:dsB',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 121498,
            currency: 'CZK',
            bookedAt: '2026-03-15',
            reference: '1822628730',
            reservationId: '109329103',
            sourceDocumentIds: ['doc:comgate-ds'],
            extractedRecordIds: ['comgate-ds-row-B']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: '109189209',
              guestName: 'Guest A',
              roomName: 'A101',
              reference: '109189209',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-15',
              stayEndAt: '2026-03-17',
              grossRevenueMinor: 61300,
              outstandingBalanceMinor: 0,
              currency: 'CZK',
              expectedSettlementChannels: ['comgate']
            },
            {
              sourceDocumentId: 'doc:previo',
              reservationId: '109329103',
              guestName: 'Guest B',
              roomName: 'B202',
              reference: '109329103',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-15',
              stayEndAt: '2026-03-18',
              grossRevenueMinor: 122700,
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
              rowId: 'txn:comgate:dsA',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-ds',
              reservationId: '109189209',
              payoutReference: '1822628730',
              payoutDate: '2026-03-15',
              amountMinor: 60699,
              matchingAmountMinor: 60699,
              currency: 'CZK',
              bankRoutingTarget: 'rb_bank_inflow'
            },
            {
              rowId: 'txn:comgate:dsB',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-ds',
              reservationId: '109329103',
              payoutReference: '1822628730',
              payoutDate: '2026-03-15',
              amountMinor: 121498,
              matchingAmountMinor: 121498,
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

    expect(resBlock.items).toHaveLength(2)
    expect(resBlock.items.find((i) => i.title === 'Guest A')).toEqual(expect.objectContaining({
      primaryReference: '109189209',
      statusKey: 'paid',
      transactionIds: ['txn:comgate:dsA']
    }))
    expect(resBlock.items.find((i) => i.title === 'Guest B')).toEqual(expect.objectContaining({
      primaryReference: '109329103',
      statusKey: 'paid',
      transactionIds: ['txn:comgate:dsB']
    }))
  })

  it('falls back to native Comgate item when clientId is missing from daily-settlement row', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-noId',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 50000,
          currency: 'CZK',
          occurredAt: '2026-03-15',
          data: {
            platform: 'comgate',
            reference: '1822628730',
            transactionId: 'XXXX-YYYY-ZZZZ',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:noId',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 50000,
            currency: 'CZK',
            bookedAt: '2026-03-15',
            reference: '1822628730',
            sourceDocumentIds: ['doc:comgate-ds'],
            extractedRecordIds: ['comgate-ds-noId']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: 'RES-999',
              guestName: 'Orphan Guest',
              roomName: 'C303',
              reference: 'RES-999',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-15',
              stayEndAt: '2026-03-17',
              grossRevenueMinor: 50000,
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
              rowId: 'txn:comgate:noId',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-ds',
              payoutReference: '1822628730',
              payoutDate: '2026-03-15',
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
    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((t) => t.linkedReservationId === 'RES-999')

    expect(resBlock.items.find((i) => i.id.includes('native'))).toBeDefined()
    expect(mergeTrace).toEqual(expect.objectContaining({
      chosenLinkReason: 'no_merge',
      nativeComgateFallbackSuppressed: false,
      mergedComgateRowId: undefined
    }))
  })

  it('debug trace shows clientId, variableSymbol, comgateTransactionId on daily-settlement merge', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-trace',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 60699,
          currency: 'CZK',
          occurredAt: '2026-03-15',
          data: {
            platform: 'comgate',
            reference: '1822628730',
            clientId: '109189209',
            reservationId: '109189209',
            transactionId: 'M6F7-DQEO-J1BD',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:ds-trace',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 60699,
            currency: 'CZK',
            bookedAt: '2026-03-15',
            reference: '1822628730',
            reservationId: '109189209',
            sourceDocumentIds: ['doc:comgate-ds'],
            extractedRecordIds: ['comgate-ds-trace']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: '109189209',
              guestName: 'Trace DS Guest',
              roomName: 'D404',
              reference: '109189209',
              channel: 'direct_web',
              bookedAt: '2026-03-10',
              stayStartAt: '2026-03-15',
              stayEndAt: '2026-03-17',
              grossRevenueMinor: 61300,
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
              rowId: 'txn:comgate:ds-trace',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-ds',
              reservationId: '109189209',
              payoutReference: '1822628730',
              payoutDate: '2026-03-15',
              amountMinor: 60699,
              matchingAmountMinor: 60699,
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
    const mergeTrace = debug.reservationPlusComgateMergeTraces[0]!

    expect(mergeTrace).toEqual(expect.objectContaining({
      linkedReservationId: '109189209',
      chosenLinkReason: 'exact_clientId_merge',
      nativeComgateFallbackSuppressed: true,
      mergedComgateRowId: 'txn:comgate:ds-trace',
      clientId: '109189209',
      variableSymbol: '1822628730',
      comgateTransactionId: 'M6F7-DQEO-J1BD',
      reservationGuestName: 'Trace DS Guest',
      reservationRoomName: 'D404'
    }))
  })

  // ── Regression tests A–E: Comgate daily-settlement merge ──

  it('A: merges reservation-backed + native Comgate with same anchor into one paid item', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-A1',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 242351,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          data: {
            platform: 'comgate',
            reference: '1816656820',
            clientId: '108966761',
            reservationId: '108966761',
            transactionId: 'JGSV-QK5O-DR7O',
            comgateParserVariant: 'daily-settlement'
          }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          {
            id: 'txn:comgate:dsA1',
            source: 'comgate',
            subtype: 'payment',
            amountMinor: 242351,
            currency: 'CZK',
            bookedAt: '2026-03-27',
            reference: '1816656820',
            reservationId: '108966761',
            sourceDocumentIds: ['doc:comgate-ds'],
            extractedRecordIds: ['comgate-ds-A1']
          }
        ],
        workflowPlan: {
          reservationSources: [
            {
              sourceDocumentId: 'doc:previo',
              reservationId: '108966761',
              guestName: 'Jan Novak',
              roomName: 'A101',
              reference: '108966761',
              channel: 'direct_web',
              bookedAt: '2026-03-20',
              stayStartAt: '2026-03-27',
              stayEndAt: '2026-03-29',
              grossRevenueMinor: 244750,
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
              rowId: 'txn:comgate:dsA1',
              platform: 'comgate',
              sourceDocumentId: 'doc:comgate-ds',
              reservationId: '108966761',
              payoutReference: '1816656820',
              payoutDate: '2026-03-27',
              amountMinor: 242351,
              matchingAmountMinor: 242351,
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
    expect(item.title).toBe('Jan Novak')
    expect(item.statusKey).toBe('paid')
    expect(item.evidenceKey).toBe('comgate')
    expect(item.transactionIds).toEqual(['txn:comgate:dsA1'])
    expect(item.id).not.toContain('native')
  })

  it('B: multiple Comgate rows without anchor stay as separate native fallback items', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-B1',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 50000,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          data: { platform: 'comgate', reference: '1816656820', comgateParserVariant: 'daily-settlement' }
        },
        {
          id: 'comgate-ds-B2',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 60000,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          data: { platform: 'comgate', reference: '1816656820', comgateParserVariant: 'daily-settlement' }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          { id: 'txn:comgate:dsB1', source: 'comgate', subtype: 'payment', direction: 'in', amountMinor: 50000, currency: 'CZK', bookedAt: '2026-03-27', reference: '1816656820', sourceDocumentIds: ['doc:comgate-ds'], extractedRecordIds: ['comgate-ds-B1'] },
          { id: 'txn:comgate:dsB2', source: 'comgate', subtype: 'payment', direction: 'in', amountMinor: 60000, currency: 'CZK', bookedAt: '2026-03-27', reference: '1816656820', sourceDocumentIds: ['doc:comgate-ds'], extractedRecordIds: ['comgate-ds-B2'] }
        ],
        workflowPlan: {
          reservationSources: [],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            { rowId: 'txn:comgate:dsB1', platform: 'comgate', sourceDocumentId: 'doc:comgate-ds', payoutReference: '1816656820', payoutDate: '2026-03-27', amountMinor: 50000, matchingAmountMinor: 50000, currency: 'CZK', bankRoutingTarget: 'rb_bank_inflow' },
            { rowId: 'txn:comgate:dsB2', platform: 'comgate', sourceDocumentId: 'doc:comgate-ds', payoutReference: '1816656820', payoutDate: '2026-03-27', amountMinor: 60000, matchingAmountMinor: 60000, currency: 'CZK', bankRoutingTarget: 'rb_bank_inflow' }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((b) => b.key === 'reservation_plus')!

    expect(resBlock.items).toHaveLength(2)
    expect(resBlock.items.every((i) => i.id.includes('native'))).toBe(true)
    expect(resBlock.items.every((i) => i.statusKey === 'paid')).toBe(true)
  })

  it('C: same VS different clientId — each merges to its own reservation, no cross-merge', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-C1',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 242351,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          data: { platform: 'comgate', reference: '1816656820', clientId: '108966761', reservationId: '108966761', transactionId: 'JGSV-QK5O-DR7O', comgateParserVariant: 'daily-settlement' }
        },
        {
          id: 'comgate-ds-C2',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 302940,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          data: { platform: 'comgate', reference: '1816656820', clientId: '108929843', reservationId: '108929843', transactionId: 'BHOV-M0TY-LBQV', comgateParserVariant: 'daily-settlement' }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          { id: 'txn:comgate:dsC1', source: 'comgate', subtype: 'payment', amountMinor: 242351, currency: 'CZK', bookedAt: '2026-03-27', reference: '1816656820', reservationId: '108966761', sourceDocumentIds: ['doc:comgate-ds'], extractedRecordIds: ['comgate-ds-C1'] },
          { id: 'txn:comgate:dsC2', source: 'comgate', subtype: 'payment', amountMinor: 302940, currency: 'CZK', bookedAt: '2026-03-27', reference: '1816656820', reservationId: '108929843', sourceDocumentIds: ['doc:comgate-ds'], extractedRecordIds: ['comgate-ds-C2'] }
        ],
        workflowPlan: {
          reservationSources: [
            { sourceDocumentId: 'doc:previo', reservationId: '108966761', guestName: 'Jan Novak', roomName: 'A101', reference: '108966761', channel: 'direct_web', bookedAt: '2026-03-20', stayStartAt: '2026-03-27', stayEndAt: '2026-03-29', grossRevenueMinor: 244750, outstandingBalanceMinor: 0, currency: 'CZK', expectedSettlementChannels: ['comgate'] },
            { sourceDocumentId: 'doc:previo', reservationId: '108929843', guestName: 'Eva Svobodova', roomName: 'B202', reference: '108929843', channel: 'direct_web', bookedAt: '2026-03-20', stayStartAt: '2026-03-27', stayEndAt: '2026-03-30', grossRevenueMinor: 305938, outstandingBalanceMinor: 0, currency: 'CZK', expectedSettlementChannels: ['comgate'] }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            { rowId: 'txn:comgate:dsC1', platform: 'comgate', sourceDocumentId: 'doc:comgate-ds', reservationId: '108966761', payoutReference: '1816656820', payoutDate: '2026-03-27', amountMinor: 242351, matchingAmountMinor: 242351, currency: 'CZK', bankRoutingTarget: 'rb_bank_inflow' },
            { rowId: 'txn:comgate:dsC2', platform: 'comgate', sourceDocumentId: 'doc:comgate-ds', reservationId: '108929843', payoutReference: '1816656820', payoutDate: '2026-03-27', amountMinor: 302940, matchingAmountMinor: 302940, currency: 'CZK', bankRoutingTarget: 'rb_bank_inflow' }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((b) => b.key === 'reservation_plus')!

    expect(resBlock.items).toHaveLength(2)
    expect(resBlock.items.find((i) => i.title === 'Jan Novak')!.transactionIds).toEqual(['txn:comgate:dsC1'])
    expect(resBlock.items.find((i) => i.title === 'Eva Svobodova')!.transactionIds).toEqual(['txn:comgate:dsC2'])
    expect(resBlock.items.every((i) => !i.id.includes('native'))).toBe(true)
  })

  it('D: missing anchor → debug trace reports no_candidate with diagnostic values', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-D1',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 50000,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          data: { platform: 'comgate', reference: '1816656820', clientId: '108966761', reservationId: '108966761', transactionId: 'JGSV-QK5O-DR7O', comgateParserVariant: 'daily-settlement' }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          { id: 'txn:comgate:dsD1', source: 'comgate', subtype: 'payment', amountMinor: 50000, currency: 'CZK', bookedAt: '2026-03-27', reference: '1816656820', reservationId: '108966761', sourceDocumentIds: ['doc:comgate-ds'], extractedRecordIds: ['comgate-ds-D1'] }
        ],
        workflowPlan: {
          reservationSources: [
            { sourceDocumentId: 'doc:previo', reservationId: 'PREVIO-UNRELATED-999', guestName: 'Different Guest', reference: 'PREVIO-UNRELATED-999', channel: 'direct_web', bookedAt: '2026-03-20', stayStartAt: '2026-03-27', stayEndAt: '2026-03-29', grossRevenueMinor: 244750, outstandingBalanceMinor: 0, currency: 'CZK', expectedSettlementChannels: ['comgate'] }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            { rowId: 'txn:comgate:dsD1', platform: 'comgate', sourceDocumentId: 'doc:comgate-ds', reservationId: '108966761', payoutReference: '1816656820', payoutDate: '2026-03-27', amountMinor: 50000, matchingAmountMinor: 50000, currency: 'CZK', bankRoutingTarget: 'rb_bank_inflow' }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((t) => t.linkedReservationId === 'PREVIO-UNRELATED-999')!

    expect(mergeTrace.chosenLinkReason).toBe('no_merge')
    expect(mergeTrace.noMergeReason).toBe('no_candidate')
    expect(mergeTrace.candidateCount).toBe(0)
    expect(mergeTrace.comparableReservationValues).toEqual(expect.arrayContaining(['previounrelated999']))
    expect(mergeTrace.comparableNativeAnchorsSample).toEqual(expect.arrayContaining(['108966761']))
  })

  it('E: native fallback is suppressed after successful merge', () => {
    const batch = {
      extractedRecords: [
        {
          id: 'comgate-ds-E1',
          sourceDocumentId: 'doc:comgate-ds',
          recordType: 'payout-line',
          extractedAt: '2026-03-18T10:00:00.000Z',
          amountMinor: 242351,
          currency: 'CZK',
          occurredAt: '2026-03-27',
          data: { platform: 'comgate', reference: '1816656820', clientId: '108966761', reservationId: '108966761', transactionId: 'JGSV-QK5O-DR7O', comgateParserVariant: 'daily-settlement' }
        }
      ],
      reconciliation: {
        normalizedTransactions: [
          { id: 'txn:comgate:dsE1', source: 'comgate', subtype: 'payment', amountMinor: 242351, currency: 'CZK', bookedAt: '2026-03-27', reference: '1816656820', reservationId: '108966761', sourceDocumentIds: ['doc:comgate-ds'], extractedRecordIds: ['comgate-ds-E1'] }
        ],
        workflowPlan: {
          reservationSources: [
            { sourceDocumentId: 'doc:previo', reservationId: '108966761', guestName: 'Jan Novak', roomName: 'A101', reference: '108966761', channel: 'direct_web', bookedAt: '2026-03-20', stayStartAt: '2026-03-27', stayEndAt: '2026-03-29', grossRevenueMinor: 244750, outstandingBalanceMinor: 0, currency: 'CZK', expectedSettlementChannels: ['comgate'] }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [],
          payoutRows: [
            { rowId: 'txn:comgate:dsE1', platform: 'comgate', sourceDocumentId: 'doc:comgate-ds', reservationId: '108966761', payoutReference: '1816656820', payoutDate: '2026-03-27', amountMinor: 242351, matchingAmountMinor: 242351, currency: 'CZK', bankRoutingTarget: 'rb_bank_inflow' }
          ],
          payoutBatches: [],
          directBankSettlements: []
        }
      }
    } as unknown as MonthlyBatchResult

    const overview = buildReservationPaymentOverview(batch)
    const resBlock = overview.blocks.find((b) => b.key === 'reservation_plus')!

    // No native fallback card should exist
    expect(resBlock.items.filter((i) => i.id.includes('native'))).toHaveLength(0)
    expect(resBlock.items).toHaveLength(1)
    expect(resBlock.items[0]!.title).toBe('Jan Novak')

    // Debug trace confirms suppression
    const debug = inspectReservationPaymentOverviewClassification(batch)
    const mergeTrace = debug.reservationPlusComgateMergeTraces.find((t) => t.linkedReservationId === '108966761')!

    expect(mergeTrace.chosenLinkReason).toBe('exact_clientId_merge')
    expect(mergeTrace.nativeComgateFallbackSuppressed).toBe(true)
    expect(mergeTrace.candidateCount).toBe(1)
    expect(mergeTrace.mergedComgateRowId).toBe('txn:comgate:dsE1')
    expect(mergeTrace.clientId).toBe('108966761')
    expect(mergeTrace.variableSymbol).toBe('1816656820')
    expect(mergeTrace.comgateTransactionId).toBe('JGSV-QK5O-DR7O')

    // The native link trace should NOT contain this row (consumed by merge)
    expect(debug.reservationPlusNativeLinkTraces.find((t) => t.rowId === 'txn:comgate:dsE1')).toBeUndefined()
  })
})
