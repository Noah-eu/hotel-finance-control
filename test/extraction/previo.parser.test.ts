import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parsePrevioReservationExport } from '../../src/extraction'
import { buildReconciliationWorkflowPlan } from '../../src/reconciliation'
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
      headerColumnIndexes: {
        Voucher: 4,
        'Termín od': 1,
        'Termín do': 2,
        Hosté: 6,
        PP: 10,
        Cena: 12,
        Saldo: 13,
        Stav: 11
      },
      sampleCandidateRows: [
        {
          Voucher: 'PREVIO-20260314',
          'Termín od': '14.03.2026',
          'Termín do': '16.03.2026',
          Hosté: 'Jan Novak',
          PP: 'direct-web',
          Cena: '420,00',
          Saldo: '30,00',
          Stav: 'confirmed'
        }
      ],
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

  it('maps `Termín od` and `Termín do` from the correct columns even when a header-like legend block appears earlier in the sheet', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: createPrevioWorkbookBase64WithLeadingRows({
        leadingRows: [
          ['Voucher', 'Termín od', 'Termín do', 'Hosté', 'PP', 'Cena', 'Saldo', 'Stav'],
          ['Legenda', 'P = potvrzeno', 'R = rezervace', 'Hosté', 'PP', 'Cena', 'Saldo', 'Stav'],
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
      extractedAt: '2026-03-21T13:10:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      occurredAt: '2026-03-14',
      data: {
        stayStartAt: '2026-03-14',
        stayEndAt: '2026-03-16'
      }
    })
    expect(records[0]?.data.workbookExtractionAudit).toMatchObject({
      headerRowIndex: 5,
      sampleCandidateRows: [
        {
          Voucher: 'PREVIO-20260314',
          'Termín od': '14.03.2026',
          'Termín do': '16.03.2026',
          Stav: 'confirmed'
        }
      ]
    })
  })

  it('does not interpret legend status text like `P = potvrzeno` as reservation date fields', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    expect(() =>
      parsePrevioReservationExport({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content,
        binaryContentBase64: createPrevioWorkbookBase64WithLeadingRows({
          leadingRows: [
            ['Voucher', 'Termín od', 'Termín do', 'Hosté', 'PP', 'Cena'],
            ['Legenda', 'P = potvrzeno', 'R = rezervace', 'Hosté', 'PP', 'Cena']
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
          rows: []
        }),
        extractedAt: '2026-03-21T13:15:00.000Z'
      })
    ).not.toThrow('Previo Termín od has unsupported date format: P = potvrzeno')
  })

  it('keeps real reservation rows with valid one-letter `Stav` values like `P` and `J`', () => {
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
          'Voucher': 'PREVIO-P-20260314',
          'Počet hostů': '2',
          'Hosté': 'Jan Novak',
          'Check-In dokončen': 'Ano',
          'Market kody': '',
          'Firma': 'Acme Travel s.r.o.',
          'PP': 'direct-web',
          'Stav': 'P',
          'Cena': '420,00',
          'Saldo': '30,00',
          'Pokoj': 'A101'
        },
        {
          'Vytvořeno': '15.03.2026 10:00',
          'Termín od': '18.03.2026',
          'Termín do': '19.03.2026',
          'Nocí': '1',
          'Voucher': 'PREVIO-J-20260318',
          'Počet hostů': '1',
          'Hosté': 'Eva Nova',
          'Check-In dokončen': 'Ne',
          'Market kody': '',
          'Firma': '',
          'PP': 'direct-web',
          'Stav': 'J',
          'Cena': '250,00',
          'Saldo': '0,00',
          'Pokoj': 'A102'
        }
      ]),
      extractedAt: '2026-03-21T14:00:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records.map((record) => record.rawReference)).toEqual([
      'PREVIO-P-20260314',
      'PREVIO-J-20260318'
    ])
  })

  it('skips the bottom legend row while keeping the real reservation row above it', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: createPrevioWorkbookBase64WithLeadingRows({
        leadingRows: [],
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
            'P',
            '420,00',
            '30,00',
            'A101'
          ],
          [
            '',
            'O = opce',
            'P = potvrzeno',
            '',
            'J = jiné',
            '',
            '',
            '',
            '',
            '',
            '',
            'S = storno',
            'U = ubytován',
            '',
            ''
          ]
        ]
      }),
      extractedAt: '2026-03-21T14:05:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]?.rawReference).toBe('PREVIO-20260314')
    expect(records[0]?.data.workbookExtractionAudit).toMatchObject({
      candidateRowCount: 2,
      skippedRowCount: 1,
      extractedRowCount: 1
    })
  })

  it('preserves parking/add-on rows as ancillary expected revenue instead of treating them as main accommodation stays', () => {
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
          'PP': 'booking',
          'Stav': 'P',
          'Cena': '420,00',
          'Saldo': '30,00',
          'Pokoj': 'A101'
        },
        {
          'Vytvořeno': '13.03.2026 09:20',
          'Termín od': '',
          'Termín do': '',
          'Nocí': '',
          'Voucher': 'PREVIO-20260314',
          'Počet hostů': '',
          'Hosté': '',
          'Check-In dokončen': '',
          'Market kody': '',
          'Firma': '',
          'PP': 'comgate',
          'Stav': 'P',
          'Cena': '200,00',
          'Saldo': '0,00',
          'Pokoj': 'Parkování 1'
        }
      ]),
      extractedAt: '2026-03-21T15:00:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      recordType: 'payout-line',
      rawReference: 'PREVIO-20260314',
      data: {
        rowKind: 'accommodation',
        reservationId: 'PREVIO-20260314',
        guestName: 'Jan Novak',
        roomName: 'A101'
      }
    })
    expect(records[1]).toMatchObject({
      recordType: 'expected-revenue-line',
      rawReference: 'PREVIO-20260314',
      amountMinor: 20000,
      data: {
        rowKind: 'ancillary',
        reservationId: 'PREVIO-20260314',
        guestName: undefined,
        itemLabel: 'Parkování 1',
        roomName: 'Parkování 1',
        channel: 'comgate'
      }
    })
  })

  it('carries accommodation and ancillary Previo rows separately in the workflow plan', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const extractedRecords = parsePrevioReservationExport({
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
          'PP': 'booking',
          'Stav': 'P',
          'Cena': '420,00',
          'Saldo': '30,00',
          'Pokoj': 'A101'
        },
        {
          'Vytvořeno': '13.03.2026 09:20',
          'Termín od': '',
          'Termín do': '',
          'Nocí': '',
          'Voucher': 'PREVIO-20260314',
          'Počet hostů': '',
          'Hosté': '',
          'Check-In dokončen': '',
          'Market kody': '',
          'Firma': '',
          'PP': 'comgate',
          'Stav': 'P',
          'Cena': '200,00',
          'Saldo': '0,00',
          'Pokoj': 'Parkování 1'
        }
      ]),
      extractedAt: '2026-03-21T15:05:00.000Z'
    })

    const plan = buildReconciliationWorkflowPlan({
      extractedRecords,
      normalizedTransactions: [],
      requestedAt: '2026-03-21T15:05:30.000Z'
    })

    expect(plan.reservationSources).toEqual([
      expect.objectContaining({
        reservationId: 'PREVIO-20260314',
        guestName: 'Jan Novak',
        grossRevenueMinor: 42000,
        channel: 'booking'
      })
    ])
    expect(plan.ancillaryRevenueSources).toEqual([
      expect.objectContaining({
        reference: 'PREVIO-20260314',
        reservationId: 'PREVIO-20260314',
        itemLabel: 'Parkování 1',
        grossRevenueMinor: 20000,
        channel: 'comgate'
      })
    ])
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
        binaryContentBase64: createPrevioWorkbookBase64WithLeadingRows({
          leadingRows: [],
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
              'PREVIO-HEADER-CONTEXT',
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
            ],
            [
              '13.03.2026 09:15',
              '14.03.2026',
              '16.03.2026',
              '2',
              '',
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
        extractedAt: '2026-03-21T10:16:00.000Z'
      })
    ).toThrow('Previo Voucher is missing or empty')
  })
})