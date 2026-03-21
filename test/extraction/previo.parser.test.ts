import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parsePrevioReservationExport } from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

function createPrevioWorkbookBase64(rows: Array<Record<string, string>>) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Seznam rezervací')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Souhrn: 'Souhrn', Hodnota: '1' }]), 'Přehled rezervací')
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
}

function createPrevioWorkbookBase64WithLeadingRows(input: {
  leadingRows: Array<Array<string>>
  headers: string[]
  rows: Array<Array<string>>
}) {
  const aoaSheet = XLSX.utils.aoa_to_sheet([
    ...input.leadingRows,
    input.headers,
    ...input.rows
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, aoaSheet, 'Seznam rezervací')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Souhrn: 'Souhrn', Hodnota: '1' }]), 'Přehled rezervací')
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
}

describe('parsePrevioReservationExport', () => {
  it('extracts deterministic payout-line records from the operational Previo reservation fixture', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: fixture.rawInput.binaryContentBase64,
      extractedAt: '2026-03-19T10:40:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'previo-reservation-1',
      recordType: 'payout-line',
      rawReference: 'PREVIO-20260314',
      data: {
        platform: 'previo',
        reservationId: 'PREVIO-20260314',
        guestName: 'Jan Novak',
        channel: 'direct-web',
        createdAt: '2026-03-13T09:15:00',
        stayStartAt: '2026-03-14',
        stayEndAt: '2026-03-16',
        outstandingBalanceMinor: 3000,
        companyName: 'Acme Travel s.r.o.',
        roomName: 'A101',
        sourceSheet: 'Seznam rezervací'
      }
    })
  })

  it('matches the expected extracted output for the Previo fixture row', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: fixture.rawInput.binaryContentBase64,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])
  })

  it('throws a clear error when required Previo reservation columns are missing', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    expect(() =>
      parsePrevioReservationExport({
        sourceDocument: fixture.sourceDocument,
        content: 'stayDate,amountMinor,currency\n2026-03-14,42000,CZK',
        extractedAt: '2026-03-19T10:40:00.000Z'
      })
    ).toThrow('Previo reservation export is missing required columns')
  })

  it('accepts operational aliases like checkIn/checkOut and guest/channel fields', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'reservationNumber,bookingReference,platform,guest,arrival,departure,grossAmount,netAmount,měna,hotelId',
        'PREVIO-9901,PREVIO-REF-9901,booking.com,Petr Svoboda,2026-03-21,2026-03-24,51000,47000,CZK,HOTEL-CZ-002'
      ].join('\n'),
      extractedAt: '2026-03-19T10:40:00.000Z'
    })

    expect(records[0]).toMatchObject({
      rawReference: 'PREVIO-REF-9901',
      occurredAt: '2026-03-21',
      data: {
        reservationId: 'PREVIO-9901',
        reference: 'PREVIO-REF-9901',
        channel: 'booking.com',
        guestName: 'Petr Svoboda',
        stayStartAt: '2026-03-21',
        stayEndAt: '2026-03-24',
        amountMinor: 51000,
        netAmountMinor: 47000,
        propertyId: 'HOTEL-CZ-002'
      }
    })
  })

  it('reads the real workbook shape from `Seznam rezervací` and does not misuse `Přehled rezervací` as row input', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: fixture.rawInput.binaryContentBase64,
      extractedAt: '2026-03-21T09:30:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]?.rawReference).toBe('PREVIO-20260314')
    expect(records[0]?.data.sourceSheet).toBe('Seznam rezervací')
    expect(records[0]?.data.workbookExtractionAudit).toMatchObject({
      sheetName: 'Seznam rezervací',
      headerRowIndex: 1,
      candidateRowCount: 1,
      skippedRowCount: 0,
      rejectedRowCount: 0,
      extractedRowCount: 1
    })
  })

  it('detects the real header row even when the workbook has leading title or blank rows before `Seznam rezervací` data', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: createPrevioWorkbookBase64WithLeadingRows({
        leadingRows: [
          ['Přehled rezervací'],
          [''],
          ['Export vytvořen 21.03.2026']
        ],
        headers: [
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
        rows: [
          [
            '13.03.2026 09:15',
            '14.03.2026',
            '16.03.2026',
            '2',
            'PREVIO-20260314',
            '2',
            'Jan Novak',
            'Ano',
            '',
            'Acme Travel s.r.o.',
            'direct-web',
            'confirmed',
            '420,00',
            '30,00',
            'A101'
          ]
        ]
      }),
      extractedAt: '2026-03-21T11:00:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]?.data.workbookExtractionAudit).toMatchObject({
      headerRowIndex: 4,
      candidateRowCount: 1,
      extractedRowCount: 1
    })
  })

  it('parses the real short Czech workbook date-time format like `01.03.26 12:30` deterministically', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: createPrevioWorkbookBase64([
        {
          'Vytvořeno': '01.03.26 12:30',
          'Termín od': '02.03.26 15:45',
          'Termín do': '04.03.26 10:15',
          'Nocí': '2',
          'Voucher': 'PREVIO-20260302',
          'Počet hostů': '2',
          'Hosté': 'Jana Novakova',
          'Check-In dokončen': 'Ano',
          'Market kody': '',
          'Firma': 'Acme Travel s.r.o.',
          'PP': 'direct-web',
          'Stav': 'confirmed',
          'Cena': '520,00',
          'Saldo': '0,00',
          'Pokoj': 'A102'
        }
      ]),
      extractedAt: '2026-03-21T12:00:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      occurredAt: '2026-03-02T15:45:00',
      data: {
        createdAt: '2026-03-01T12:30:00',
        stayStartAt: '2026-03-02T15:45:00',
        stayEndAt: '2026-03-04T10:15:00'
      }
    })
  })

  it('parses symbol-prefixed workbook amounts like `€108.00` and infers EUR deterministically', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: createPrevioWorkbookBase64([
        {
          'Vytvořeno': '01.03.26 12:30',
          'Termín od': '02.03.26 15:45',
          'Termín do': '04.03.26 10:15',
          'Nocí': '2',
          'Voucher': 'PREVIO-EUR-20260302',
          'Počet hostů': '2',
          'Hosté': 'Jana Novakova',
          'Check-In dokončen': 'Ano',
          'Market kody': '',
          'Firma': 'Euro Travel GmbH',
          'PP': 'direct-web',
          'Stav': 'confirmed',
          'Cena': '€108.00',
          'Saldo': '€8.00',
          'Pokoj': 'A102'
        }
      ]),
      extractedAt: '2026-03-21T12:10:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 10800,
      currency: 'EUR',
      data: {
        amountMinor: 10800,
        outstandingBalanceMinor: 800,
        currency: 'EUR'
      }
    })
  })

  it('parses grouped English-style workbook amounts like `2,000.00` deterministically', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: createPrevioWorkbookBase64([
        {
          'Vytvořeno': '01.03.26 12:30',
          'Termín od': '02.03.26 15:45',
          'Termín do': '04.03.26 10:15',
          'Nocí': '2',
          'Voucher': 'PREVIO-GROUPED-20260302',
          'Počet hostů': '2',
          'Hosté': 'Jana Novakova',
          'Check-In dokončen': 'Ano',
          'Market kody': '',
          'Firma': 'Acme Travel s.r.o.',
          'PP': 'direct-web',
          'Stav': 'confirmed',
          'Cena': '2,000.00',
          'Saldo': '150.00',
          'Pokoj': 'A102'
        }
      ]),
      extractedAt: '2026-03-21T12:20:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 200000,
      currency: 'CZK',
      data: {
        amountMinor: 200000,
        outstandingBalanceMinor: 15000,
        currency: 'CZK'
      }
    })
  })

  it('parses grouped English-style euro workbook amounts like `€2,000.00` and infers EUR', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: createPrevioWorkbookBase64([
        {
          'Vytvořeno': '01.03.26 12:30',
          'Termín od': '02.03.26 15:45',
          'Termín do': '04.03.26 10:15',
          'Nocí': '2',
          'Voucher': 'PREVIO-EUR-GROUPED-20260302',
          'Počet hostů': '2',
          'Hosté': 'Jana Novakova',
          'Check-In dokončen': 'Ano',
          'Market kody': '',
          'Firma': 'Euro Travel GmbH',
          'PP': 'direct-web',
          'Stav': 'confirmed',
          'Cena': '€2,000.00',
          'Saldo': '€120.00',
          'Pokoj': 'A102'
        }
      ]),
      extractedAt: '2026-03-21T12:25:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 200000,
      currency: 'EUR',
      data: {
        amountMinor: 200000,
        outstandingBalanceMinor: 12000,
        currency: 'EUR'
      }
    })
  })

  it('skips blank or non-reservation workbook rows that have an empty Voucher', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: createPrevioWorkbookBase64([
        {
          'Vytvořeno': '13.03.2026 09:15',
          'Termín od': '14.03.2026',
          'Termín do': '16.03.2026',
          'Nocí': '2',
          'Voucher': 'PREVIO-20260314',
          'Počet hostů': '2',
          'Hosté': 'Jan Novak',
          'Check-In dokončen': 'Ano',
          'Market kody': '',
          'Firma': 'Acme Travel s.r.o.',
          'PP': 'direct-web',
          'Stav': 'confirmed',
          'Cena': '420,00',
          'Saldo': '30,00',
          'Pokoj': 'A101'
        },
        {
          'Vytvořeno': '',
          'Termín od': '',
          'Termín do': '',
          'Nocí': '',
          'Voucher': '',
          'Počet hostů': '',
          'Hosté': '',
          'Check-In dokončen': '',
          'Market kody': '',
          'Firma': '',
          'PP': '',
          'Stav': '',
          'Cena': '',
          'Saldo': '',
          'Pokoj': ''
        }
      ]),
      extractedAt: '2026-03-21T10:15:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]?.rawReference).toBe('PREVIO-20260314')
  })

  it('fails truthfully for reservation-looking workbook rows with empty Voucher and no grounded fallback identifier', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    expect(() =>
      parsePrevioReservationExport({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content,
        binaryContentBase64: createPrevioWorkbookBase64([
          {
            'Vytvořeno': '13.03.2026 09:15',
            'Termín od': '14.03.2026',
            'Termín do': '16.03.2026',
            'Nocí': '2',
            'Voucher': '',
            'Počet hostů': '2',
            'Hosté': 'Jan Novak',
            'Check-In dokončen': 'Ano',
            'Market kody': '',
            'Firma': 'Acme Travel s.r.o.',
            'PP': 'direct-web',
            'Stav': 'confirmed',
            'Cena': '420,00',
            'Saldo': '30,00',
            'Pokoj': 'A101'
          }
        ]),
        extractedAt: '2026-03-21T10:16:00.000Z'
      })
    ).toThrow('Previo Voucher is missing or empty')
  })
})