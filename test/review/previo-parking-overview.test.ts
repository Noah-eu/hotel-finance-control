import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { MonthlyBatchResult } from '../../src/monthly-batch'
import type { DocumentId } from '../../src/domain/value-types'
import { parsePrevioReservationExport } from '../../src/extraction'
import { buildReconciliationWorkflowPlan } from '../../src/reconciliation'
import { buildReservationPaymentOverview, inspectReservationPaymentOverviewClassification } from '../../src/review'

interface PrevioWorkbookRow {
  createdAt: string
  voucher: string
  channel: string
  amountText: string
  outstandingText: string
  roomName: string
  stayStartAt?: string
  stayEndAt?: string
  guestName?: string
  companyName?: string
}

function buildPrevioWorkbookBase64(rows: PrevioWorkbookRow[]): string {
  const workbook = XLSX.utils.book_new()
  const reservationSheet = XLSX.utils.aoa_to_sheet([
    ['Seznam rezervací'],
    [
      'Vytvořeno',
      'Termín od',
      'Termín do',
      'Nocí',
      'Voucher',
      'Počet hostů',
      'Hosté',
      'Check-In dokončen',
      'Market kody',
      'Firma',
      'PP',
      'Stav',
      'Cena',
      'Saldo',
      'Pokoj'
    ],
    ...rows.map((row) => [
      row.createdAt,
      row.stayStartAt ?? '',
      row.stayEndAt ?? '',
      row.stayStartAt && row.stayEndAt ? '1' : '',
      row.voucher,
      row.guestName ? '1' : '',
      row.guestName ?? '',
      row.guestName ? 'Ano' : '',
      '',
      row.companyName ?? '',
      row.channel,
      'confirmed',
      row.amountText,
      row.outstandingText,
      row.roomName
    ])
  ])

  XLSX.utils.book_append_sheet(workbook, reservationSheet, 'Seznam rezervací')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Přehled rezervací'],
    ['Počet rezervací', String(rows.length)]
  ]), 'Přehled rezervací')

  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
}

function buildBatchFromPrevioRows(rows: PrevioWorkbookRow[]): MonthlyBatchResult {
  const extractedRecords = parsePrevioReservationExport({
    sourceDocument: {
      id: 'doc-previo-parking-overview' as DocumentId,
      sourceSystem: 'previo',
      documentType: 'reservation_export',
      fileName: 'previo-parking-overview.xlsx',
      uploadedAt: '2026-04-07T10:00:00.000Z'
    },
    content: 'previo-parking-overview',
    binaryContentBase64: buildPrevioWorkbookBase64(rows),
    extractedAt: '2026-04-07T10:00:00.000Z'
  })

  const workflowPlan = buildReconciliationWorkflowPlan({
    extractedRecords,
    normalizedTransactions: [],
    requestedAt: '2026-04-07T10:00:05.000Z'
  })

  return {
    extractedRecords,
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

describe('Previo parking overview', () => {
  it('puts explicit Previo parking add-ons into Parkování while leaving ordinary add-ons in Reservation+', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '13.03.2026 09:15',
        stayStartAt: '14.03.2026',
        stayEndAt: '16.03.2026',
        voucher: 'PREVIO-STAY-1',
        guestName: 'Jan Novak',
        companyName: 'Acme Travel',
        channel: 'direct-web',
        amountText: '420,00',
        outstandingText: '30,00',
        roomName: 'A101'
      },
      {
        createdAt: '13.03.2026 09:20',
        voucher: 'PREVIO-STAY-1',
        channel: 'comgate',
        amountText: '200,00',
        outstandingText: '0,00',
        roomName: 'Parkování 1'
      },
      {
        createdAt: '13.03.2026 09:21',
        voucher: 'PREVIO-STAY-2',
        channel: 'direct-web',
        amountText: '180,00',
        outstandingText: '0,00',
        roomName: 'Parkování 2'
      },
      {
        createdAt: '13.03.2026 09:22',
        voucher: 'PREVIO-STAY-3',
        channel: 'comgate',
        amountText: '250,00',
        outstandingText: '0,00',
        roomName: 'Parking Deck A'
      },
      {
        createdAt: '13.03.2026 09:23',
        voucher: 'PREVIO-STAY-4',
        channel: 'direct-web',
        amountText: '220,00',
        outstandingText: '0,00',
        roomName: 'Parkovaci misto P3'
      },
      {
        createdAt: '13.03.2026 09:24',
        voucher: 'PREVIO-STAY-5',
        channel: 'direct-web',
        amountText: '150,00',
        outstandingText: '0,00',
        roomName: 'Pozdní check-out'
      }
    ])

    const overview = buildReservationPaymentOverview(batch)
    const parkingBlock = overview.blocks.find((block) => block.key === 'parking')
    const reservationPlusBlock = overview.blocks.find((block) => block.key === 'reservation_plus')
    const parkingItem = parkingBlock?.items.find((item) => item.title === 'Parkování 1')

    expect(parkingBlock?.itemCount).toBe(4)
    expect(parkingBlock?.items.map((item) => item.title)).toEqual(expect.arrayContaining([
      'Parkování 1',
      'Parkování 2',
      'Parking Deck A',
      'Parkovaci misto P3'
    ]))
    expect(parkingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Jan Novak' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-14 – 2026-03-16' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: 'A101' })
    ]))
    expect(reservationPlusBlock?.itemCount).toBe(2)
    expect(reservationPlusBlock?.items.map((item) => item.title)).toEqual(expect.arrayContaining([
      'Jan Novak',
      'Pozdní check-out'
    ]))
  })

  it('keeps fallback parking detail when no unique linked main reservation exists', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '13.03.2026 09:15',
        stayStartAt: '14.03.2026',
        stayEndAt: '16.03.2026',
        voucher: 'PREVIO-STAY-OTHER',
        guestName: 'Jana Svobodova',
        companyName: 'Acme Travel',
        channel: 'direct-web',
        amountText: '420,00',
        outstandingText: '30,00',
        roomName: 'B202'
      },
      {
        createdAt: '13.03.2026 09:20',
        voucher: 'PREVIO-PARK-ONLY',
        channel: 'comgate',
        amountText: '200,00',
        outstandingText: '0,00',
        roomName: 'Parkování bez pobytu'
      }
    ])

    const overview = buildReservationPaymentOverview(batch)
    const parkingItem = overview.blocks.find((block) => block.key === 'parking')?.items[0]

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování bez pobytu',
      primaryReference: 'PREVIO-PARK-ONLY'
    }))
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Host')
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Pobyt')
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Jednotka')
  })

  it('links a parking row through exact Previo stay interval when ancillary and main vouchers differ', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '13.03.2026 09:15',
        stayStartAt: '18.03.2026',
        stayEndAt: '20.03.2026',
        voucher: 'PREVIO-STAY-2',
        guestName: 'Klara Vesela',
        companyName: 'Acme Travel',
        channel: 'direct-web',
        amountText: '520,00',
        outstandingText: '0,00',
        roomName: 'C303'
      },
      {
        createdAt: '13.03.2026 09:20',
        stayStartAt: '18.03.2026',
        stayEndAt: '20.03.2026',
        voucher: 'PREVIO-PARK-2',
        channel: 'comgate',
        amountText: '220,00',
        outstandingText: '0,00',
        roomName: 'Parkování stay-linked'
      }
    ])

    const parkingItem = buildReservationPaymentOverview(batch).blocks.find((block) => block.key === 'parking')?.items[0]

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování stay-linked',
      subtitle: 'C303',
      primaryReference: 'PREVIO-PARK-2'
    }))
    expect(parkingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Klara Vesela' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-18 – 2026-03-20' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: 'C303' })
    ]))
  })

  it('links the Denisa-like parking row with its own reference through the unique exact stay interval', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '18.03.26 09:30',
        stayStartAt: '20.03.26 14:00',
        stayEndAt: '22.03.26 11:00',
        voucher: '5159718129',
        guestName: 'Denisa Plechlova, Jozef Kluvanec, Natasa Plechlova',
        companyName: '',
        channel: 'Booking.com XML',
        amountText: '420,00EUR',
        outstandingText: '0,00EUR',
        roomName: 'A205'
      },
      {
        createdAt: '18.03.26 09:31',
        voucher: '20250650',
        channel: 'Alfred',
        amountText: '60,00EUR',
        outstandingText: '0,00EUR',
        roomName: 'Parkování 1'
      }
    ])

    const overview = buildReservationPaymentOverview(batch)
    const overviewDebug = inspectReservationPaymentOverviewClassification(batch)
    const parkingItem = overview.blocks.find((block) => block.key === 'parking')?.items[0]
    const ancillaryLinkTrace = overviewDebug.ancillaryLinkTraces.find((trace) => trace.reference === '20250650')

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování 1',
      subtitle: 'A205',
      primaryReference: '20250650',
      currency: 'EUR'
    }))
    expect(parkingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Denisa Plechlova, Jozef Kluvanec, Natasa Plechlova' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-20T14:00:00 – 2026-03-22T11:00:00' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: 'A205' })
    ]))
    expect(ancillaryLinkTrace).toEqual(expect.objectContaining({
      reference: '20250650',
      stayStartAt: '2026-03-20T14:00:00',
      stayEndAt: '2026-03-22T11:00:00',
      candidateCount: 1,
      linkedMainReservationId: '5159718129',
      linkedGuestName: 'Denisa Plechlova, Jozef Kluvanec, Natasa Plechlova',
      chosenCandidateReason: 'unique_exact_stay_interval'
    }))
  })

  it('keeps the preceding reservation block linked when a later unrelated stay follows the parking row', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '18.03.26 09:30',
        stayStartAt: '20.03.26 14:00',
        stayEndAt: '22.03.26 11:00',
        voucher: '5159718129',
        guestName: 'Denisa Plechlova, Jozef Kluvanec, Natasa Plechlova',
        companyName: '',
        channel: 'Booking.com XML',
        amountText: '420,00EUR',
        outstandingText: '0,00EUR',
        roomName: 'A205'
      },
      {
        createdAt: '18.03.26 09:30',
        voucher: 'A205-MEAL',
        channel: 'Booking.com XML',
        amountText: '15,00EUR',
        outstandingText: '0,00EUR',
        roomName: 'Snídaně'
      },
      {
        createdAt: '18.03.26 09:31',
        voucher: '20250650',
        channel: 'Alfred',
        amountText: '60,00EUR',
        outstandingText: '0,00EUR',
        roomName: 'Parkování 1'
      },
      {
        createdAt: '18.03.26 09:40',
        stayStartAt: '23.03.26 14:00',
        stayEndAt: '24.03.26 11:00',
        voucher: '5159718130',
        guestName: 'Guest Three',
        companyName: '',
        channel: 'Booking.com XML',
        amountText: '210,00EUR',
        outstandingText: '0,00EUR',
        roomName: 'A206'
      }
    ])

    const overview = buildReservationPaymentOverview(batch)
    const overviewDebug = inspectReservationPaymentOverviewClassification(batch)
    const parkingItem = overview.blocks.find((block) => block.key === 'parking')?.items.find((item) => item.primaryReference === '20250650')
    const ancillaryLinkTrace = overviewDebug.ancillaryLinkTraces.find((trace) => trace.reference === '20250650')

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování 1',
      subtitle: 'A205',
      primaryReference: '20250650',
      currency: 'EUR'
    }))
    expect(parkingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Denisa Plechlova, Jozef Kluvanec, Natasa Plechlova' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-20T14:00:00 – 2026-03-22T11:00:00' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: 'A205' })
    ]))
    expect(ancillaryLinkTrace).toEqual(expect.objectContaining({
      reference: '20250650',
      stayStartAt: '2026-03-20T14:00:00',
      stayEndAt: '2026-03-22T11:00:00',
      rawParsedAncillaryRow: expect.objectContaining({
        data: expect.objectContaining({
          stayStartAt: '2026-03-20T14:00:00',
          stayEndAt: '2026-03-22T11:00:00'
        })
      }),
      normalizedAncillaryRow: expect.objectContaining({
        stayStartAt: '2026-03-20T14:00:00',
        stayEndAt: '2026-03-22T11:00:00'
      }),
      overviewLinkingInput: expect.objectContaining({
        stayStartAt: '2026-03-20T14:00:00',
        stayEndAt: '2026-03-22T11:00:00'
      }),
      candidateCount: 1,
      linkedMainReservationId: '5159718129',
      linkedGuestName: 'Denisa Plechlova, Jozef Kluvanec, Natasa Plechlova',
      chosenCandidateReason: 'unique_exact_stay_interval'
    }))
  })

  it('uses the nearest preceding reservation block when multiple stays share the same exact interval', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '18.03.26 09:10',
        stayStartAt: '20.03.26 14:00',
        stayEndAt: '22.03.26 11:00',
        voucher: 'HMT2QMDN8E',
        guestName: 'Host 304',
        companyName: '',
        channel: 'Booking.com XML',
        amountText: '420,00EUR',
        outstandingText: '0,00EUR',
        roomName: '304'
      },
      {
        createdAt: '18.03.26 09:20',
        stayStartAt: '20.03.26 14:00',
        stayEndAt: '22.03.26 11:00',
        voucher: 'HMSH9FKX8F',
        guestName: 'Host 301',
        companyName: '',
        channel: 'Booking.com XML',
        amountText: '410,00EUR',
        outstandingText: '0,00EUR',
        roomName: '301'
      },
      {
        createdAt: '18.03.26 09:30',
        stayStartAt: '20.03.26 14:00',
        stayEndAt: '22.03.26 11:00',
        voucher: '5159718129',
        guestName: 'Denisa Plechlová,Jozef Kluvanec,Nataša Plechlová',
        companyName: '',
        channel: 'Booking.com XML',
        amountText: '420,00EUR',
        outstandingText: '0,00EUR',
        roomName: '203'
      },
      {
        createdAt: '18.03.26 09:31',
        voucher: '20250650',
        channel: 'Alfred',
        amountText: '60,00EUR',
        outstandingText: '0,00EUR',
        roomName: 'Parkování 1'
      },
      {
        createdAt: '18.03.26 09:32',
        stayStartAt: '20.03.26 14:00',
        stayEndAt: '22.03.26 11:00',
        voucher: '6126906663',
        guestName: 'Host 204',
        companyName: '',
        channel: 'Booking.com XML',
        amountText: '430,00EUR',
        outstandingText: '0,00EUR',
        roomName: '204'
      },
      {
        createdAt: '18.03.26 09:33',
        stayStartAt: '20.03.26 14:00',
        stayEndAt: '22.03.26 11:00',
        voucher: '6415593183',
        guestName: 'Host 202',
        companyName: '',
        channel: 'Booking.com XML',
        amountText: '440,00EUR',
        outstandingText: '0,00EUR',
        roomName: '202'
      }
    ])

    const overview = buildReservationPaymentOverview(batch)
    const overviewDebug = inspectReservationPaymentOverviewClassification(batch)
    const parkingItem = overview.blocks.find((block) => block.key === 'parking')?.items.find((item) => item.primaryReference === '20250650')
    const ancillaryLinkTrace = overviewDebug.ancillaryLinkTraces.find((trace) => trace.reference === '20250650')

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování 1',
      subtitle: '203',
      primaryReference: '20250650'
    }))
    expect(parkingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Denisa Plechlová,Jozef Kluvanec,Nataša Plechlová' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-20T14:00:00 – 2026-03-22T11:00:00' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: '203' })
    ]))
    expect(ancillaryLinkTrace).toEqual(expect.objectContaining({
      reference: '20250650',
      candidateCount: 5,
      linkedMainReservationId: '5159718129',
      linkedGuestName: 'Denisa Plechlová,Jozef Kluvanec,Nataša Plechlová',
      linkedRoomName: '203',
      exactStayIntervalHits: expect.arrayContaining([
        expect.objectContaining({ reservationId: 'HMT2QMDN8E' }),
        expect.objectContaining({ reservationId: 'HMSH9FKX8F' }),
        expect.objectContaining({ reservationId: '5159718129' }),
        expect.objectContaining({ reservationId: '6126906663' }),
        expect.objectContaining({ reservationId: '6415593183' })
      ]),
      chosenCandidateReason: 'nearest_preceding_parent_block'
    }))
  })

    it('preserves parser, normalization, and linker input truth for selectedFiles-shaped parking rows that appear before the stay row', () => {
      const batch = buildBatchFromPrevioRows([
        {
          createdAt: '18.03.26 09:31',
          voucher: '20250650',
          channel: 'Alfred',
          amountText: '60,00EUR',
          outstandingText: '0,00EUR',
          roomName: 'Parkování 1'
        },
        {
          createdAt: '18.03.26 09:30',
          stayStartAt: '20.03.26 14:00',
          stayEndAt: '22.03.26 11:00',
          voucher: '5159718129',
          guestName: 'Denisa Plechlova, Jozef Kluvanec, Natasa Plechlova',
          companyName: '',
          channel: 'Booking.com XML',
          amountText: '420,00EUR',
          outstandingText: '0,00EUR',
          roomName: 'A205'
        }
      ])

      const overviewDebug = inspectReservationPaymentOverviewClassification(batch)
      const ancillaryLinkTrace = overviewDebug.ancillaryLinkTraces.find((trace) => trace.reference === '20250650')

      expect(ancillaryLinkTrace).toEqual(expect.objectContaining({
        sourceRecordId: 'previo-ancillary-1',
        stayStartAt: '2026-03-20T14:00:00',
        stayEndAt: '2026-03-22T11:00:00',
        rawParsedAncillaryRow: expect.objectContaining({
          sourceRecordId: 'previo-ancillary-1',
          rawReference: '20250650',
          data: expect.objectContaining({
            rowKind: 'ancillary',
            stayStartAt: '2026-03-20T14:00:00',
            stayEndAt: '2026-03-22T11:00:00',
            channel: 'Alfred'
          })
        }),
        normalizedAncillaryRow: expect.objectContaining({
          sourceRecordId: 'previo-ancillary-1',
          reference: '20250650',
          stayStartAt: '2026-03-20T14:00:00',
          stayEndAt: '2026-03-22T11:00:00'
        }),
        overviewLinkingInput: expect.objectContaining({
          sourceDocumentId: 'doc-previo-parking-overview',
          reference: '20250650',
          reservationId: '20250650',
          stayStartAt: '2026-03-20T14:00:00',
          stayEndAt: '2026-03-22T11:00:00'
        }),
        candidateSetBeforeFiltering: [expect.objectContaining({
          reservationId: '5159718129',
          stayStartAt: '2026-03-20T14:00:00',
          stayEndAt: '2026-03-22T11:00:00'
        })],
        exactIdentityHits: [],
        exactStayIntervalHits: [expect.objectContaining({ reservationId: '5159718129' })],
        candidateCount: 1,
        chosenCandidateReason: 'unique_exact_stay_interval'
      }))
    })

  it('keeps fallback when exact stay interval points to multiple main reservations', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '13.03.2026 09:20',
        stayStartAt: '25.03.2026',
        stayEndAt: '27.03.2026',
        voucher: 'PREVIO-PARK-AMB',
        channel: 'comgate',
        amountText: '220,00',
        outstandingText: '0,00',
        roomName: 'Parkování ambiguous'
      },
      {
        createdAt: '13.03.2026 09:15',
        stayStartAt: '25.03.2026',
        stayEndAt: '27.03.2026',
        voucher: 'PREVIO-STAY-A',
        guestName: 'Prvni Host',
        companyName: 'Acme Travel',
        channel: 'direct-web',
        amountText: '420,00',
        outstandingText: '0,00',
        roomName: 'A101'
      },
      {
        createdAt: '13.03.2026 09:16',
        stayStartAt: '25.03.2026',
        stayEndAt: '27.03.2026',
        voucher: 'PREVIO-STAY-B',
        guestName: 'Druhy Host',
        companyName: 'Acme Travel',
        channel: 'direct-web',
        amountText: '430,00',
        outstandingText: '0,00',
        roomName: 'A102'
      }
    ])

    const overview = buildReservationPaymentOverview(batch)
    const overviewDebug = inspectReservationPaymentOverviewClassification(batch)
    const parkingItem = overview.blocks.find((block) => block.key === 'parking')?.items[0]
    const ancillaryLinkTrace = overviewDebug.ancillaryLinkTraces.find((trace) => trace.reference === 'PREVIO-PARK-AMB')

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování ambiguous',
      primaryReference: 'PREVIO-PARK-AMB'
    }))
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Host')
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Pobyt')
    expect(ancillaryLinkTrace).toEqual(expect.objectContaining({
      candidateCount: 2,
      linkedMainReservationId: undefined,
      chosenCandidateReason: 'ambiguous_exact_stay_interval'
    }))
  })
})