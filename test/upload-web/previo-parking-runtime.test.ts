import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { createBrowserRuntime } from '../../src/upload-web'

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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = Buffer.from(base64, 'base64')
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function createRuntimeWorkbookFile(name: string, rows: PrevioWorkbookRow[]) {
  const binaryContentBase64 = buildPrevioWorkbookBase64(rows)

  return {
    name,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    text: async () => '',
    arrayBuffer: async () => base64ToArrayBuffer(binaryContentBase64)
  }
}

describe('Previo parking runtime', () => {
  it('surfaces explicit Previo parking rows in Parkování and leaves ordinary add-ons in Reservation+', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
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
      ],
      month: '2026-03',
      generatedAt: '2026-04-07T10:20:00.000Z'
    })

    expect(state.fileRoutes.map((file) => file.fileName)).toEqual(['reservations-export-2026-03.xlsx'])
    expect(state.reservationPaymentOverview.blocks.map((block) => ({
      key: block.key,
      itemCount: block.itemCount
    }))).toEqual([
      { key: 'airbnb', itemCount: 0 },
      { key: 'booking', itemCount: 0 },
      { key: 'expedia', itemCount: 0 },
      { key: 'reservation_plus', itemCount: 2 },
      { key: 'parking', itemCount: 4 }
    ])

    const parkingTitles = state.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')?.items.map((item) => item.title) ?? []
    const reservationPlusTitles = state.reservationPaymentOverview.blocks.find((block) => block.key === 'reservation_plus')?.items.map((item) => item.title) ?? []
    const parkingItem = state.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')?.items.find((item) => item.title === 'Parkování 1')

    expect(parkingTitles).toEqual(expect.arrayContaining([
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
    expect(reservationPlusTitles).toEqual(expect.arrayContaining([
      'Jan Novak',
      'Pozdní check-out'
    ]))
  })

  it('keeps the current fallback when a parking row has no unique linked main reservation', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
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
      ],
      month: '2026-03',
      generatedAt: '2026-04-07T10:21:00.000Z'
    })

    const parkingItem = state.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')?.items[0]

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování bez pobytu',
      primaryReference: 'PREVIO-PARK-ONLY'
    }))
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Host')
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Pobyt')
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Jednotka')
  })

  it('links a parking row through exact Previo stay interval when ancillary and main vouchers differ', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
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
      ],
      month: '2026-03',
      generatedAt: '2026-04-08T07:05:00.000Z'
    })

    const parkingItem = state.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')?.items[0]

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování stay-linked',
      subtitle: 'C303',
      primaryReference: 'PREVIO-PARK-2'
    }))
    expect(parkingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Klara Vesela' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-18 – 2026-03-20' })
    ]))
  })

  it('links the Denisa-like parking row with its own reference through the unique exact stay interval', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
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
      ],
      month: '2026-03',
      generatedAt: '2026-04-08T07:20:00.000Z'
    })

    const parkingItem = state.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')?.items[0]
    const ancillaryLinkTrace = state.reservationPaymentOverviewDebug.ancillaryLinkTraces.find((trace) => trace.reference === '20250650')

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

  it('keeps the preceding reservation block linked when a later unrelated stay follows the parking row', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03-grouped.xlsx', [
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
      ],
      month: '2026-03',
      generatedAt: '2026-04-08T12:50:00.000Z'
    })

    const parkingItem = state.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')?.items.find((item) => item.primaryReference === '20250650')
    const ancillaryLinkTrace = state.reservationPaymentOverviewDebug.ancillaryLinkTraces.find((trace) => trace.reference === '20250650')

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování 1',
      subtitle: 'A205',
      primaryReference: '20250650'
    }))
    expect(parkingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Denisa Plechlova, Jozef Kluvanec, Natasa Plechlova' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-20T14:00:00 – 2026-03-22T11:00:00' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: 'A205' })
    ]))
    expect(ancillaryLinkTrace).toEqual(expect.objectContaining({
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

  it('preserves selectedFiles parser-to-linker truth when the parking row precedes the stay row', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03-denisa.xlsx', [
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
      ],
      month: '2026-03',
      generatedAt: '2026-04-08T11:45:00.000Z'
    })

    const parkingItem = state.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')?.items[0]
    const ancillaryLinkTrace = state.reservationPaymentOverviewDebug.ancillaryLinkTraces.find((trace) => trace.reference === '20250650')

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování 1',
      subtitle: 'A205',
      primaryReference: '20250650'
    }))
    expect(ancillaryLinkTrace).toEqual(expect.objectContaining({
      sourceRecordId: 'previo-ancillary-1',
      rawParsedAncillaryRow: expect.objectContaining({
        sourceRecordId: 'previo-ancillary-1',
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
      candidateSetBeforeFiltering: [expect.objectContaining({ reservationId: '5159718129' })],
      exactIdentityHits: [],
      exactStayIntervalHits: [expect.objectContaining({ reservationId: '5159718129' })],
      candidateCount: 1,
      chosenCandidateReason: 'unique_exact_stay_interval'
    }))
  })

  it('lets a Comgate parking payment confirm a Previo parking item without creating a duplicate parking identity', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
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
            outstandingText: '200,00',
            roomName: 'Parkování 1'
          }
        ]),
        {
          name: 'comgate-portal.csv',
          type: 'text/csv',
          text: async () => [
            '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
            '"CG-PORTAL-TRX-PARK-1";"PREVIO-STAY-1";"18.03.2026 10:20";"18.03.2026 10:21";"19.03.2026";"parking@example.com";"PREVIO-STAY-1";"JOKELAND s.r.o.";"200,00";"CZK";"parking";"0,00";"0,00";"2,00";"2,00"'
          ].join('\n')
        }
      ],
      month: '2026-03',
      generatedAt: '2026-04-07T10:25:00.000Z'
    })

    const parkingBlock = state.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')
    const parkingItem = parkingBlock?.items[0]

    expect(parkingBlock?.itemCount).toBe(1)
    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování 1',
      evidenceKey: 'comgate',
      statusKey: 'paid',
      transactionIds: [expect.stringContaining('txn:payout:')]
    }))
  })
})