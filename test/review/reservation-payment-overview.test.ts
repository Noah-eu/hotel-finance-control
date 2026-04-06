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

  it('promotes Booking reservations to paid from a matched payout batch only when the PDF supplement explicitly proves batch membership', () => {
    const batch = {
      extractedRecords: [],
      reconciliation: {
        normalizedTransactions: [],
        payoutBatchMatches: [
          {
            payoutBatchKey: 'booking-batch:2026-03-12:010638445054',
            payoutBatchRowIds: [],
            bankTransactionId: 'txn:bank:booking-batch-1',
            bankAccountId: '5599955956/5500',
            amountMinor: 633707,
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
            {
              sourceDocumentId: 'doc:previo-greta',
              reservationId: '6622415324',
              guestName: 'Greta Sieweke',
              roomName: 'A201',
              reference: '6622415324',
              channel: 'booking',
              bookedAt: '2026-03-01',
              stayStartAt: '2026-03-06',
              stayEndAt: '2026-03-08',
              grossRevenueMinor: 25984,
              outstandingBalanceMinor: 25984,
              currency: 'EUR',
              expectedSettlementChannels: ['booking']
            },
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
              outstandingBalanceMinor: 0,
              currency: 'EUR',
              expectedSettlementChannels: ['booking']
            },
            {
              sourceDocumentId: 'doc:previo-tatiana',
              reservationId: '5280445951',
              guestName: 'Tatiana Trakaliuk',
              roomName: 'A203',
              reference: '5280445951',
              channel: 'booking',
              bookedAt: '2026-03-05',
              stayStartAt: '2026-03-14',
              stayEndAt: '2026-03-16',
              grossRevenueMinor: 5226,
              outstandingBalanceMinor: 0,
              currency: 'EUR',
              expectedSettlementChannels: ['booking']
            }
          ],
          previoReservationTruth: [],
          ancillaryRevenueSources: [],
          reservationSettlementMatches: [],
          reservationSettlementNoMatches: [
            {
              sourceDocumentId: 'doc:previo-greta',
              reservationId: '6622415324',
              candidateCount: 0,
              noMatchReason: 'noCandidate'
            },
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
          payoutRows: [],
          payoutBatches: [
            {
              payoutBatchKey: 'booking-batch:2026-03-12:010638445054',
              platform: 'booking',
              payoutReference: '010638445054',
              payoutDate: '2026-03-12',
              bankRoutingTarget: 'rb_bank_inflow',
              rowIds: [],
              expectedTotalMinor: 633707,
              currency: 'CZK',
              componentReservationIds: ['6622415324', '5178029336'],
              payoutSupplementReservationIds: ['6622415324', '5178029336'],
              payoutSupplementSourceDocumentIds: ['uploaded:booking:25:015022808386-pdf']
            }
          ],
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
        transactionIds: [],
        sourceDocumentIds: ['doc:previo-greta', 'uploaded:booking:25:015022808386-pdf'],
        statusDetailCs: expect.stringContaining('Booking payout statement PDF'),
        detailEntries: expect.arrayContaining([
          expect.objectContaining({ labelCs: 'Booking payout batch', value: '010638445054 (2026-03-12)' })
        ])
      }),
      expect.objectContaining({
        title: 'Denisa Hypiusová',
        primaryReference: '5178029336',
        statusKey: 'paid',
        evidenceKey: 'payout',
        paidAmountMinor: 4480,
        transactionIds: []
      }),
      expect.objectContaining({
        title: 'Tatiana Trakaliuk',
        primaryReference: '5280445951',
        statusKey: 'unverified',
        evidenceKey: 'no_evidence',
        transactionIds: []
      })
    ]))
  })
})