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
})