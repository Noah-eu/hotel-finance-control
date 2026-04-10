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

function buildInvoiceListWorkbookBase64(): string {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Doklady - export'],
    [''],
    ['Doklad č.', 'Voucher', 'Variabilní symbol', 'Termín od', 'Termín do', 'Jméno hosta', 'Pokoj', 'Částka celkem', 'Základ DPH'],
    ['FA-20260327', 'RES-ENTITY-108929843', '1816656820', '27.03.2026', '30.03.2026', 'Eva Svobodova', 'B202', '302 940 Kč', '250 364 Kč']
  ]), 'Doklady')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn', 'Hodnota'],
    ['Počet dokladů', '1']
  ]), 'Souhrn')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Položky dokladů - export'],
    [''],
    ['Doklad č.', 'Název položky', 'Částka celkem', 'Základ DPH'],
    ['FA-20260327', 'Ubytování', '302 940 Kč', '250 364 Kč']
  ]), 'Položky dokladů')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn položek', 'Hodnota'],
    ['Počet položek', '1']
  ]), 'Souhrn položek')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn podle rastrů', 'Hodnota'],
    ['Rastr', 'A']
  ]), 'Souhrn podle rastrů')
  return XLSX.write(workbook, { type: 'base64', bookType: 'xls' })
}

function buildInvoiceListWorkbookBase64ForCurrentPortalBridge(): string {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Doklady - export'],
    [''],
    ['Doklad č.', 'Voucher', 'Variabilní symbol', 'Termín od', 'Termín do', 'Jméno hosta', 'Pokoj', 'Částka celkem', 'Základ DPH'],
    ['FA-20260328', '109047421', '1816480742', '27.03.2026', '30.03.2026', 'Klara Vesela', 'C303', '302 940 Kč', '250 364 Kč']
  ]), 'Doklady')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn', 'Hodnota'],
    ['Počet dokladů', '1']
  ]), 'Souhrn')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Položky dokladů - export'],
    [''],
    ['Doklad č.', 'Název položky', 'Částka celkem', 'Základ DPH'],
    ['FA-20260328', 'Ubytování', '302 940 Kč', '250 364 Kč']
  ]), 'Položky dokladů')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn položek', 'Hodnota'],
    ['Počet položek', '1']
  ]), 'Souhrn položek')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn podle rastrů', 'Hodnota'],
    ['Rastr', 'A']
  ]), 'Souhrn podle rastrů')
  return XLSX.write(workbook, { type: 'base64', bookType: 'xls' })
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

function createRuntimeInvoiceListFile(name: string) {
  const binaryContentBase64 = buildInvoiceListWorkbookBase64()

  return {
    name,
    type: 'application/vnd.ms-excel',
    text: async () => '',
    arrayBuffer: async () => base64ToArrayBuffer(binaryContentBase64)
  }
}

function createRuntimeInvoiceListFileForCurrentPortalBridge(name: string) {
  const binaryContentBase64 = buildInvoiceListWorkbookBase64ForCurrentPortalBridge()

  return {
    name,
    type: 'application/vnd.ms-excel',
    text: async () => '',
    arrayBuffer: async () => base64ToArrayBuffer(binaryContentBase64)
  }
}

function createRuntimeTextFile(name: string, content: string, type = 'text/csv') {
  const bytes = new TextEncoder().encode(content)

  return {
    name,
    type,
    text: async () => content,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
}

describe('Reservation+ runtime enrichment', () => {
  it('enriches anchored native Comgate Reservation+ items with host, stay, and unit details', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
          {
            createdAt: '13.03.2026 09:15',
            stayStartAt: '18.03.2026',
            stayEndAt: '20.03.2026',
            voucher: 'WEB-RES-991',
            guestName: 'Wendy Web',
            companyName: 'Acme Travel',
            channel: 'direct-web',
            amountText: '420,00',
            outstandingText: '0,00',
            roomName: 'C301'
          }
        ]),
        createRuntimeTextFile(
          'comgate-legacy.csv',
          [
            'Datum zaplacení;Uhrazená částka;Měna;Variabilní symbol;Štítek;Číslo objednávky',
            '15.03.2026;380,00;CZK;CG-RES-991;website-reservation;WEB-RES-991'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-08T16:30:00.000Z'
    })

    const item = state.reservationPaymentOverview.blocks.find((block) => block.key === 'reservation_plus')?.items.find((entry) => entry.evidenceKey === 'comgate' && entry.transactionIds.length > 0)
    const mergeTrace = state.reservationPaymentOverviewDebug.reservationPlusComgateMergeTraces[0]

    expect(item).toEqual(expect.objectContaining({
      title: 'Wendy Web',
      subtitle: 'C301',
      primaryReference: 'WEB-RES-991',
      statusKey: 'paid',
      evidenceKey: 'comgate'
    }))
    expect(item?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Jednotka', value: 'C301' })
    ]))
    expect(item?.dateValue).toBe('2026-03-18 – 2026-03-20')
    expect(mergeTrace).toEqual(expect.objectContaining({
      linkedReservationId: 'WEB-RES-991',
      chosenLinkReason: 'exact_refId_merge',
      nativeComgateFallbackSuppressed: true,
      reservationGuestName: 'Wendy Web',
      reservationRoomName: 'C301'
    }))
  })

  it('keeps pure native Comgate Reservation+ items without a reservation anchor on the fallback path', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
          {
            createdAt: '13.03.2026 09:15',
            stayStartAt: '18.03.2026',
            stayEndAt: '20.03.2026',
            voucher: 'WEB-RES-991',
            guestName: 'Wendy Web',
            companyName: 'Acme Travel',
            channel: 'direct-web',
            amountText: '1540,00',
            outstandingText: '0,00',
            roomName: 'C301'
          }
        ]),
        createRuntimeTextFile(
          'comgate-current-portal.csv',
          [
            '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
            '"CG-PORTAL-TRX-2001";"CG-WEB-2001";"18.03.2026 09:15";"18.03.2026 09:16";"19.03.2026";"guest@example.com";"CG-WEB-2001";"JOKELAND s.r.o.";"1549,00";"CZK";"website-reservation";"0,00";"0,00";"9,00";"9,00"'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-08T16:45:00.000Z'
    })

    const item = state.reservationPaymentOverview.blocks.find((block) => block.key === 'reservation_plus')?.items.find((entry) => entry.evidenceKey === 'comgate' && entry.transactionIds.length > 0)
    const trace = state.reservationPaymentOverviewDebug.reservationPlusNativeLinkTraces[0]

    expect(item).toEqual(expect.objectContaining({
      title: 'CG-WEB-2001',
      primaryReference: 'CG-WEB-2001'
    }))
    expect(item?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Host')
    expect(item?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Pobyt')
    expect(item?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Jednotka')
    expect(trace).toEqual(expect.objectContaining({
      reference: 'CG-WEB-2001',
      chosenCandidateSource: 'none',
      chosenCandidateReason: 'no_candidate'
    }))
  })

  it('merges native Comgate row into invoice-backed Reservation+ runtime entity via exact variable symbol', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
          {
            createdAt: '13.03.2026 09:15',
            stayStartAt: '27.03.2026',
            stayEndAt: '30.03.2026',
            voucher: 'RES-ENTITY-108929843',
            guestName: 'Eva Svobodova',
            companyName: 'Acme Travel',
            channel: 'direct-web',
            amountText: '302940,00',
            outstandingText: '0,00',
            roomName: 'B202'
          }
        ]),
        createRuntimeInvoiceListFile('invoice_list.xls'),
        createRuntimeTextFile(
          'comgate-current-portal.csv',
          [
            '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
            '"CG-PORTAL-TRX-3001";"";"27.03.2026 09:15";"27.03.2026 09:16";"28.03.2026";"guest@example.com";"1816656820";"JOKELAND s.r.o.";"302940,00";"CZK";"website-reservation";"0,00";"0,00";"0,00";"0,00"'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-10T10:45:00.000Z'
    })

    const reservationPlusItems = state.reservationPaymentOverview.blocks.find((block) => block.key === 'reservation_plus')?.items ?? []
    const mergedItem = reservationPlusItems.find((entry) => entry.title === 'Eva Svobodova')
    const nativeFallbackItem = reservationPlusItems.find((entry) => entry.id.includes('reservation-payment:native:'))
    const mergeTrace = state.reservationPaymentOverviewDebug.reservationPlusComgateMergeTraces
      .find((trace) => trace.linkedReservationId === 'RES-ENTITY-108929843')

    expect(mergedItem).toEqual(expect.objectContaining({
      title: 'Eva Svobodova',
      evidenceKey: 'comgate'
    }))
    expect(mergedItem?.transactionIds.length).toBeGreaterThan(0)
    expect(nativeFallbackItem).toBeUndefined()
    expect(mergeTrace).toEqual(expect.objectContaining({
      chosenLinkReason: 'exact_refId_merge',
      nativeComgateFallbackSuppressed: true,
      reservationEntityMatchedByInvoiceList: true,
      nativeRowMergedIntoReservationEntity: true,
      mergeSource: 'reservation_entity',
      mergeAnchorType: 'invoice_list_variable_symbol'
    }))
  })

  it('merges current-portal native Comgate row when reference carries reservation identity from ID od klienta', async () => {
    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', [
          {
            createdAt: '13.03.2026 09:15',
            stayStartAt: '27.03.2026',
            stayEndAt: '30.03.2026',
            voucher: '109047421',
            guestName: 'Klara Vesela',
            companyName: 'Acme Travel',
            channel: 'direct-web',
            amountText: '302940,00',
            outstandingText: '0,00',
            roomName: 'C303'
          }
        ]),
        createRuntimeInvoiceListFileForCurrentPortalBridge('invoice_list.xls'),
        createRuntimeTextFile(
          'comgate-current-portal.csv',
          [
            '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
            '"CG-PORTAL-TRX-3002";"109047421";"27.03.2026 09:15";"27.03.2026 09:16";"28.03.2026";"guest@example.com";"JOKELAND s.r.o.";"302940,00";"CZK";"website-reservation";"0,00";"0,00";"0,00";"0,00"'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-10T11:15:00.000Z'
    })

    const reservationPlusItems = state.reservationPaymentOverview.blocks.find((block) => block.key === 'reservation_plus')?.items ?? []
    const mergedItem = reservationPlusItems.find((entry) => entry.title === 'Klara Vesela')
    const nativeFallbackItem = reservationPlusItems.find((entry) => entry.id.includes('reservation-payment:native:'))
    const mergeTrace = state.reservationPaymentOverviewDebug.reservationPlusComgateMergeTraces
      .find((trace) => trace.linkedReservationId === '109047421')

    expect(mergedItem).toEqual(expect.objectContaining({
      title: 'Klara Vesela',
      evidenceKey: 'comgate'
    }))
    expect(mergedItem?.transactionIds.length).toBeGreaterThan(0)
    expect(nativeFallbackItem).toBeUndefined()
    expect(mergeTrace).toEqual(expect.objectContaining({
      reservationEntityMatchedByInvoiceList: true,
      reservationGuestName: 'Klara Vesela',
      reservationRoomName: 'C303'
    }))
  })
})
