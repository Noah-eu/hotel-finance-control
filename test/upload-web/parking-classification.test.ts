import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { createBrowserRuntime } from '../../src/upload-web'

describe('upload-web parking classification', () => {
  it('keeps explicit Previo parking rows and strong Comgate parking signals in Parking while leaving direct-web items in Reservation+', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile(
          'reservations-export-2026-04.xlsx',
          buildPrevioWorkbookBase64FromRows([
            {
              createdAt: '01.04.2026 09:00',
              stayStartAt: '10.04.2026',
              stayEndAt: '11.04.2026',
              voucher: 'BKG-100',
              guestName: 'Booking Guest',
              channel: 'booking',
              amountText: '2500,00 CZK',
              outstandingText: '2500,00 CZK',
              roomName: 'A101'
            },
            {
              createdAt: '01.04.2026 09:10',
              stayStartAt: '12.04.2026',
              stayEndAt: '13.04.2026',
              voucher: 'AIR-100',
              guestName: 'Airbnb Guest',
              channel: 'airbnb',
              amountText: '99,00 EUR',
              outstandingText: '99,00 EUR',
              roomName: 'B201'
            },
            {
              createdAt: '01.04.2026 09:20',
              stayStartAt: '14.04.2026',
              stayEndAt: '14.04.2026',
              voucher: 'PARK-RES-1',
              guestName: 'Parking Guest',
              channel: 'parking',
              amountText: '40,00 CZK',
              outstandingText: '40,00 CZK',
              roomName: 'Parkování P1'
            },
            {
              createdAt: '01.04.2026 09:30',
              stayStartAt: '15.04.2026',
              stayEndAt: '16.04.2026',
              voucher: 'WEB-100',
              guestName: 'Web Guest',
              channel: 'direct-web',
              amountText: '450,00 CZK',
              outstandingText: '450,00 CZK',
              roomName: 'Studio 4'
            }
          ])
        ),
        createRuntimeFile(
          'comgate-portal.csv',
          [
            '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
            '"CG-PORTAL-TRX-2001";"CG-WEB-2001";"18.03.2026 09:15";"18.03.2026 09:16";"19.03.2026";"guest@example.com";"CG-WEB-2001";"JOKELAND s.r.o.";"1549,00";"CZK";"website-reservation";"0,00";"0,00";"9,00";"9,00"',
            '"CG-PARK-TRX-2002";"CG-PARK-2001";"18.03.2026 10:20";"18.03.2026 10:21";"19.03.2026";"parking@example.com";"CG-PARK-2001";"JOKELAND s.r.o.";"42,00";"CZK";"parking-fee";"0,00";"0,00";"2,00";"2,00"'
          ].join('\n')
        )
      ],
      month: '2026-04',
      generatedAt: '2026-04-07T10:15:00.000Z'
    })

    expect(result.reservationPaymentOverview.blocks.map((block) => ({
      key: block.key,
      itemCount: block.itemCount
    }))).toEqual([
      { key: 'airbnb', itemCount: 1 },
      { key: 'booking', itemCount: 1 },
      { key: 'expedia', itemCount: 0 },
      { key: 'reservation_plus', itemCount: 2 },
      { key: 'parking', itemCount: 2 }
    ])

    const parkingItems = result.reservationPaymentOverview.blocks.find((block) => block.key === 'parking')?.items ?? []
    const reservationPlusItems = result.reservationPaymentOverview.blocks.find((block) => block.key === 'reservation_plus')?.items ?? []

    expect(parkingItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Parking Guest', primaryReference: 'PARK-RES-1' }),
      expect.objectContaining({ title: 'CG-PARK-2001', primaryReference: 'CG-PARK-2001' })
    ]))
    expect(reservationPlusItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Web Guest', primaryReference: 'WEB-100' }),
      expect.objectContaining({ title: 'CG-WEB-2001', primaryReference: 'CG-WEB-2001' })
    ]))
  })
})

function createRuntimeFile(name: string, content: string) {
  return {
    name,
    async text() {
      return content
    },
    async arrayBuffer() {
      return new TextEncoder().encode(content).buffer
    }
  }
}

function createRuntimeWorkbookFile(name: string, binaryContentBase64: string) {
  return {
    name,
    async text() {
      return ''
    },
    async arrayBuffer() {
      const binary = atob(binaryContentBase64)
      const bytes = new Uint8Array(binary.length)

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }

      return bytes.buffer
    }
  }
}

function buildPrevioWorkbookBase64FromRows(rows: Array<{
  createdAt: string
  stayStartAt: string
  stayEndAt: string
  voucher: string
  guestName: string
  channel: string
  amountText: string
  outstandingText: string
  roomName: string
}>): string {
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
      row.stayStartAt,
      row.stayEndAt,
      '1',
      row.voucher,
      '1',
      row.guestName,
      'Ano',
      '',
      '',
      row.channel,
      'confirmed',
      row.amountText,
      row.outstandingText,
      row.roomName
    ])
  ])
  XLSX.utils.book_append_sheet(workbook, reservationSheet, 'Seznam rezervací')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['meta'], ['generated-for-test']]), 'meta')

  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
}