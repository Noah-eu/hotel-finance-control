import type { ExtractedRecord, NormalizedTransaction, SourceDocument } from '../domain'
import * as XLSX from 'xlsx'

export interface RealInputFixture {
  key:
  | 'raiffeisenbank-statement'
  | 'fio-statement'
  | 'booking-payout-export'
  | 'booking-payout-export-browser-upload-shape'
  | 'booking-payout-export-browser-upload-batch-shape'
  | 'booking-payout-statement-pdf'
  | 'airbnb-payout-export'
  | 'expedia-payout-export'
  | 'previo-reservation-export'
  | 'comgate-export'
  | 'invoice-document'
  | 'invoice-document-czech-pdf'
  | 'receipt-document'
  description: string
  sourceDocument: SourceDocument
  rawInput: {
    format: 'csv' | 'json' | 'text' | 'pdf-text'
    content: string
    binaryContentBase64?: string
  }
  expectedExtractedRecords: ExtractedRecord[]
  expectedNormalizedTransactions?: NormalizedTransaction[]
}

function sourceDocument(overrides: Partial<SourceDocument>): SourceDocument {
  return {
    id: 'doc-default' as SourceDocument['id'],
    sourceSystem: 'unknown',
    documentType: 'other',
    fileName: 'fixture.txt',
    uploadedAt: '2026-03-18T20:00:00.000Z',
    ...overrides
  }
}

function extractedRecord(overrides: Partial<ExtractedRecord>): ExtractedRecord {
  return {
    id: 'record-default',
    sourceDocumentId: 'doc-default' as ExtractedRecord['sourceDocumentId'],
    recordType: 'unknown-record',
    extractedAt: '2026-03-18T20:00:00.000Z',
    data: {},
    ...overrides
  }
}

function normalizedTransaction(overrides: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    id: 'txn-default' as NormalizedTransaction['id'],
    direction: 'in',
    source: 'unknown',
    amountMinor: 0,
    currency: 'CZK',
    bookedAt: '2026-03-18',
    accountId: 'account-default',
    extractedRecordIds: ['record-default'],
    sourceDocumentIds: ['doc-default' as NormalizedTransaction['sourceDocumentIds'][number]],
    ...overrides
  }
}

function workbookBase64(sheets: Array<{ name: string, rows: Array<Record<string, string>> }>): string {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.rows), sheet.name)
  }

  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
}

function pdfBase64FromTextLines(lines: string[]): string {
  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    ...lines.flatMap((line, index) => index === 0
      ? [`<${encodePdfHexString(line)}> Tj`]
      : ['0 -18 Td', `<${encodePdfHexString(line)}> Tj`]),
    'ET'
  ].join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []

  for (const object of objects) {
    offsets.push(pdf.length)
    pdf += object
  }

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'

  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'latin1').toString('base64')
}

function encodePdfHexString(value: string): string {
  return Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
}

export const realInputFixtures: RealInputFixture[] = [
  {
    key: 'raiffeisenbank-statement',
    description: 'Representative Raiffeisenbank CSV statement with Booking, Airbnb, Comgate, payroll, expense, and suspicious/private spend rows.',
    sourceDocument: sourceDocument({
      id: 'doc-raif-2026-03' as SourceDocument['id'],
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      fileName: 'raiffeisen-2026-03.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'bookedAt,amountMinor,currency,accountId,counterparty,reference,transactionType',
        '2026-03-10,125000,CZK,raiffeisen-main,Booking BV,PAYOUT-BOOK-20260310,booking-payout',
        '2026-03-12,98000,CZK,raiffeisen-main,AIRBNB PAYOUT,AIRBNB-20260312,airbnb-payout',
        '2026-03-15,42000,CZK,raiffeisen-main,Comgate,CG-ORDER-845,comgate-settlement',
        '2026-03-18,-55000,CZK,raiffeisen-main,Hotel payroll,PAYROLL-MAR-2026,payroll',
        '2026-03-20,-18500,CZK,raiffeisen-main,Laundry Supply s.r.o.,INV-2026-332,expense',
        '2026-03-21,-2400,CZK,raiffeisen-main,Electro World,PERSONAL-TECH,suspicious-private'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'raif-row-1',
        sourceDocumentId: 'doc-raif-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: 'PAYOUT-BOOK-20260310',
        amountMinor: 125000,
        currency: 'CZK',
        occurredAt: '2026-03-10',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank',
          bookedAt: '2026-03-10',
          amountMinor: 125000,
          currency: 'CZK',
          accountId: 'raiffeisen-main',
          counterparty: 'Booking BV',
          reference: 'PAYOUT-BOOK-20260310',
          transactionType: 'booking-payout'
        }
      }),
      extractedRecord({
        id: 'raif-row-4',
        sourceDocumentId: 'doc-raif-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: 'PAYROLL-MAR-2026',
        amountMinor: -55000,
        currency: 'CZK',
        occurredAt: '2026-03-18',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank',
          bookedAt: '2026-03-18',
          amountMinor: -55000,
          currency: 'CZK',
          accountId: 'raiffeisen-main',
          counterparty: 'Hotel payroll',
          reference: 'PAYROLL-MAR-2026',
          transactionType: 'payroll'
        }
      }),
      extractedRecord({
        id: 'raif-row-6',
        sourceDocumentId: 'doc-raif-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: 'PERSONAL-TECH',
        amountMinor: -2400,
        currency: 'CZK',
        occurredAt: '2026-03-21',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank',
          bookedAt: '2026-03-21',
          amountMinor: -2400,
          currency: 'CZK',
          accountId: 'raiffeisen-main',
          counterparty: 'Electro World',
          reference: 'PERSONAL-TECH',
          transactionType: 'suspicious-private'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:bank:raif-row-1' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'bank',
        amountMinor: 125000,
        currency: 'CZK',
        bookedAt: '2026-03-10',
        accountId: 'raiffeisen-main',
        counterparty: 'Booking BV',
        reference: 'PAYOUT-BOOK-20260310',
        extractedRecordIds: ['raif-row-1'],
        sourceDocumentIds: ['doc-raif-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      }),
      normalizedTransaction({
        id: 'txn:bank:raif-row-4' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'bank',
        amountMinor: 55000,
        currency: 'CZK',
        bookedAt: '2026-03-18',
        accountId: 'raiffeisen-main',
        counterparty: 'Hotel payroll',
        reference: 'PAYROLL-MAR-2026',
        extractedRecordIds: ['raif-row-4'],
        sourceDocumentIds: ['doc-raif-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'fio-statement',
    description: 'Representative Fio CSV statement focused on Expedia terminal payment flows.',
    sourceDocument: sourceDocument({
      id: 'doc-fio-2026-03' as SourceDocument['id'],
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      fileName: 'fio-2026-03.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'bookedAt,amountMinor,currency,accountId,counterparty,reference,transactionType',
        '2026-03-11,65000,CZK,fio-expedia,EXPEDIA TERMINAL,EXP-TERM-1001,expedia-terminal',
        '2026-03-12,44000,CZK,fio-expedia,EXPEDIA TERMINAL,EXP-TERM-1002,expedia-terminal'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'fio-row-1',
        sourceDocumentId: 'doc-fio-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: 'EXP-TERM-1001',
        amountMinor: 65000,
        currency: 'CZK',
        occurredAt: '2026-03-11',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'fio',
          bookedAt: '2026-03-11',
          amountMinor: 65000,
          currency: 'CZK',
          accountId: 'fio-expedia',
          counterparty: 'EXPEDIA TERMINAL',
          reference: 'EXP-TERM-1001',
          transactionType: 'expedia-terminal'
        }
      })
    ]
  },
  {
    key: 'booking-payout-export',
    description: 'Representative Booking payout export with payout references and reservation linkage.',
    sourceDocument: sourceDocument({
      id: 'doc-booking-payout-2026-03' as SourceDocument['id'],
      sourceSystem: 'booking',
      documentType: 'ota_report',
      fileName: 'booking-payout-2026-03.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'payoutDate,amountMinor,currency,payoutReference,reservationId,propertyId',
        '2026-03-10,125000,CZK,PAYOUT-BOOK-20260310,RES-BOOK-8841,HOTEL-CZ-001'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'booking-payout-1',
        sourceDocumentId: 'doc-booking-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'PAYOUT-BOOK-20260310',
        amountMinor: 125000,
        currency: 'CZK',
        occurredAt: '2026-03-10',
        data: {
          platform: 'booking',
          bookedAt: '2026-03-10',
          amountMinor: 125000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'PAYOUT-BOOK-20260310',
          bookingPayoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-BOOK-20260310',
          reservationId: 'RES-BOOK-8841',
          propertyId: 'HOTEL-CZ-001'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:payout:booking-payout-1' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'booking',
        amountMinor: 125000,
        currency: 'CZK',
        bookedAt: '2026-03-10',
        accountId: 'expected-payouts',
        reference: 'PAYOUT-BOOK-20260310',
        reservationId: 'RES-BOOK-8841',
        bookingPayoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-BOOK-20260310',
        extractedRecordIds: ['booking-payout-1'],
        sourceDocumentIds: ['doc-booking-payout-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'booking-payout-export-browser-upload-shape',
    description: 'Minimal anonymized Booking payout export matching the real browser-upload header shape from diagnostics.',
    sourceDocument: sourceDocument({
      id: 'doc-booking-browser-upload-shape-2026-03' as SourceDocument['id'],
      sourceSystem: 'booking',
      documentType: 'ota_report',
      fileName: 'AaOS6MOZUh8BFtEr.booking.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
        'Reservation;RES-BOOK-8841;2026-03-08;2026-03-10;Jan Novak;OK;CZK;Paid;1250,00;12 Mar 2026;PAYOUT-BOOK-20260310'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'booking-payout-1',
        sourceDocumentId: 'doc-booking-browser-upload-shape-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'PAYOUT-BOOK-20260310',
        amountMinor: 125000,
        currency: 'CZK',
        occurredAt: '2026-03-12',
        data: {
          platform: 'booking',
          bookedAt: '2026-03-12',
          amountMinor: 125000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'PAYOUT-BOOK-20260310',
          bookingPayoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
          reservationId: 'RES-BOOK-8841'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:payout:booking-payout-1' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'booking',
        amountMinor: 125000,
        currency: 'CZK',
        bookedAt: '2026-03-12',
        accountId: 'expected-payouts',
        reference: 'PAYOUT-BOOK-20260310',
        reservationId: 'RES-BOOK-8841',
        bookingPayoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        extractedRecordIds: ['booking-payout-1'],
        sourceDocumentIds: ['doc-booking-browser-upload-shape-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'booking-payout-export-browser-upload-batch-shape',
    description: 'Minimal anonymized real Booking browser-upload shape with multiple reservation-linked rows sharing one payout batch.',
    sourceDocument: sourceDocument({
      id: 'doc-booking-browser-upload-batch-shape-2026-03' as SourceDocument['id'],
      sourceSystem: 'booking',
      documentType: 'ota_report',
      fileName: 'AaOS6MOZUh8BFtEr.booking.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
        'Reservation;RES-BOOK-8841;2026-03-08;2026-03-10;Jan Novak;OK;CZK;Paid;800,00;12 Mar 2026;PAYOUT-BOOK-20260310',
        'Reservation;RES-BOOK-8842;2026-03-09;2026-03-10;Eva Svobodova;OK;CZK;Paid;450,00;12 Mar 2026;PAYOUT-BOOK-20260310'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'booking-payout-1',
        sourceDocumentId: 'doc-booking-browser-upload-batch-shape-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'PAYOUT-BOOK-20260310',
        amountMinor: 80000,
        currency: 'CZK',
        occurredAt: '2026-03-12',
        data: {
          platform: 'booking',
          bookedAt: '2026-03-12',
          amountMinor: 80000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'PAYOUT-BOOK-20260310',
          bookingPayoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
          reservationId: 'RES-BOOK-8841'
        }
      }),
      extractedRecord({
        id: 'booking-payout-2',
        sourceDocumentId: 'doc-booking-browser-upload-batch-shape-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'PAYOUT-BOOK-20260310',
        amountMinor: 45000,
        currency: 'CZK',
        occurredAt: '2026-03-12',
        data: {
          platform: 'booking',
          bookedAt: '2026-03-12',
          amountMinor: 45000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'PAYOUT-BOOK-20260310',
          bookingPayoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
          reservationId: 'RES-BOOK-8842'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:payout:booking-payout-1' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'booking',
        amountMinor: 80000,
        currency: 'CZK',
        bookedAt: '2026-03-12',
        accountId: 'expected-payouts',
        reference: 'PAYOUT-BOOK-20260310',
        reservationId: 'RES-BOOK-8841',
        bookingPayoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        extractedRecordIds: ['booking-payout-1'],
        sourceDocumentIds: ['doc-booking-browser-upload-batch-shape-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      }),
      normalizedTransaction({
        id: 'txn:payout:booking-payout-2' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'booking',
        amountMinor: 45000,
        currency: 'CZK',
        bookedAt: '2026-03-12',
        accountId: 'expected-payouts',
        reference: 'PAYOUT-BOOK-20260310',
        reservationId: 'RES-BOOK-8842',
        bookingPayoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        extractedRecordIds: ['booking-payout-2'],
        sourceDocumentIds: ['doc-booking-browser-upload-batch-shape-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'booking-payout-statement-pdf',
    description: 'Representative Booking payout statement PDF captured as deterministic extracted text plus a text-selectable PDF binary for browser upload supplements.',
    sourceDocument: sourceDocument({
      id: 'doc-booking-payout-statement-2026-03' as SourceDocument['id'],
      sourceSystem: 'booking',
      documentType: 'payout_statement',
      fileName: 'booking-payout-statement-2026-03.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Booking.com payout statement',
        'Payment ID: PAYOUT-BOOK-20260310',
        'Payment date: 2026-03-12',
        'Payout total: 1 250,00 CZK',
        'IBAN: CZ65 5500 0000 0000 5599 555956',
        'Included reservations:',
        'RES-BOOK-8841 1 250,00 CZK'
      ].join('\n'),
      binaryContentBase64: pdfBase64FromTextLines([
        'Booking.com payout statement',
        'Payment ID: PAYOUT-BOOK-20260310',
        'Payment date: 2026-03-12',
        'Payout total: 1 250,00 CZK',
        'IBAN: CZ65 5500 0000 0000 5599 555956',
        'Included reservations:',
        'RES-BOOK-8841 1 250,00 CZK'
      ])
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'booking-payout-statement-1',
        sourceDocumentId: 'doc-booking-payout-statement-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-supplement',
        rawReference: 'PAYOUT-BOOK-20260310',
        amountMinor: 125000,
        currency: 'CZK',
        occurredAt: '2026-03-12',
        data: {
          platform: 'booking',
          supplementRole: 'payout_statement',
          paymentId: 'PAYOUT-BOOK-20260310',
          payoutDate: '2026-03-12',
          amountMinor: 125000,
          currency: 'CZK',
          ibanSuffix: '5956',
          reservationIds: ['RES-BOOK-8841']
        }
      })
    ]
  },
  {
    key: 'airbnb-payout-export',
    description: 'Representative Airbnb mixed export with reservation rows and transfer rows from the real grounded vocabulary.',
    sourceDocument: sourceDocument({
      id: 'doc-airbnb-payout-2026-03' as SourceDocument['id'],
      sourceSystem: 'airbnb',
      documentType: 'ota_report',
      fileName: 'airbnb_03_2026-03_2026.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;-80,00;1 060,00',
        '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-OC3WJE3SIXRO5;;CZK;;3 961,05;0,00;3 961,05',
        '2026-03-13;2026-03-15;Payout;2026-03-11;2026-03-13;Petra Svobodova;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-DXVK4YVI7MJVL;;CZK;;4 456,97;0,00;4 456,97',
        '2026-03-14;2026-03-15;Payout;2026-03-12;2026-03-14;Martin Dvorak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-ZD5RVTGOHW3GE;;CZK;;7 059,94;0,00;7 059,94'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'airbnb-payout-1',
        sourceDocumentId: 'doc-airbnb-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
        amountMinor: 106000,
        currency: 'CZK',
        occurredAt: '2026-03-12',
        data: {
          platform: 'airbnb',
          rowKind: 'reservation',
          bookedAt: '2026-03-12',
          amountMinor: 106000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
          reservationId: 'AIRBNB-RES:hma4tr9:2026-03-10:2026-03-12:106000',
          stayStartAt: '2026-03-10',
          stayEndAt: '2026-03-12',
          guestName: 'Jan Novak',
          listingName: 'Jokeland apartment',
          details: 'Rezervace HMA4TR9',
          referenceCode: 'REF-HMA4TR9',
          confirmationCode: 'HMA4TR9',
          paidOutAmountMinor: 98000,
          serviceFeeMinor: -8000,
          grossEarningsMinor: 106000,
          sourceDate: '2026-03-12',
          availableUntilDate: '2026-03-12'
        }
      }),
      extractedRecord({
        id: 'airbnb-payout-2',
        sourceDocumentId: 'doc-airbnb-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'G-OC3WJE3SIXRO5',
        amountMinor: 396105,
        currency: 'CZK',
        occurredAt: '2026-03-15',
        data: {
          platform: 'airbnb',
          rowKind: 'transfer',
          bookedAt: '2026-03-15',
          amountMinor: 396105,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'G-OC3WJE3SIXRO5',
          stayStartAt: '2026-03-10',
          stayEndAt: '2026-03-12',
          guestName: 'Jan Novak',
          listingName: 'Jokeland apartment',
          details: 'Převod Jokeland s.r.o., IBAN 5956 (CZK)',
          referenceCode: 'G-OC3WJE3SIXRO5',
          paidOutAmountMinor: 396105,
          serviceFeeMinor: 0,
          grossEarningsMinor: 396105,
          sourceDate: '2026-03-12',
          availableUntilDate: '2026-03-15',
          transferDescriptor: 'Převod Jokeland s.r.o.',
          payoutReference: 'G-OC3WJE3SIXRO5',
          payoutBatchKey: 'G-OC3WJE3SIXRO5',
          transferBatchDescriptor: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
        }
      })
      ,
      extractedRecord({
        id: 'airbnb-payout-3',
        sourceDocumentId: 'doc-airbnb-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'G-DXVK4YVI7MJVL',
        amountMinor: 445697,
        currency: 'CZK',
        occurredAt: '2026-03-15',
        data: {
          platform: 'airbnb',
          rowKind: 'transfer',
          bookedAt: '2026-03-15',
          amountMinor: 445697,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'G-DXVK4YVI7MJVL',
          stayStartAt: '2026-03-11',
          stayEndAt: '2026-03-13',
          guestName: 'Petra Svobodova',
          listingName: 'Jokeland apartment',
          details: 'Převod Jokeland s.r.o., IBAN 5956 (CZK)',
          referenceCode: 'G-DXVK4YVI7MJVL',
          paidOutAmountMinor: 445697,
          serviceFeeMinor: 0,
          grossEarningsMinor: 445697,
          sourceDate: '2026-03-13',
          availableUntilDate: '2026-03-15',
          transferDescriptor: 'Převod Jokeland s.r.o.',
          payoutReference: 'G-DXVK4YVI7MJVL',
          payoutBatchKey: 'G-DXVK4YVI7MJVL',
          transferBatchDescriptor: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
        }
      }),
      extractedRecord({
        id: 'airbnb-payout-4',
        sourceDocumentId: 'doc-airbnb-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'G-ZD5RVTGOHW3GE',
        amountMinor: 705994,
        currency: 'CZK',
        occurredAt: '2026-03-15',
        data: {
          platform: 'airbnb',
          rowKind: 'transfer',
          bookedAt: '2026-03-15',
          amountMinor: 705994,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'G-ZD5RVTGOHW3GE',
          stayStartAt: '2026-03-12',
          stayEndAt: '2026-03-14',
          guestName: 'Martin Dvorak',
          listingName: 'Jokeland apartment',
          details: 'Převod Jokeland s.r.o., IBAN 5956 (CZK)',
          referenceCode: 'G-ZD5RVTGOHW3GE',
          paidOutAmountMinor: 705994,
          serviceFeeMinor: 0,
          grossEarningsMinor: 705994,
          sourceDate: '2026-03-14',
          availableUntilDate: '2026-03-15',
          transferDescriptor: 'Převod Jokeland s.r.o.',
          payoutReference: 'G-ZD5RVTGOHW3GE',
          payoutBatchKey: 'G-ZD5RVTGOHW3GE',
          transferBatchDescriptor: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:payout:airbnb-payout-1' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'airbnb',
        subtype: 'reservation',
        amountMinor: 106000,
        currency: 'CZK',
        bookedAt: '2026-03-12',
        accountId: 'expected-payouts',
        reference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
        reservationId: 'AIRBNB-RES:hma4tr9:2026-03-10:2026-03-12:106000',
        extractedRecordIds: ['airbnb-payout-1'],
        sourceDocumentIds: ['doc-airbnb-payout-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      }),
      normalizedTransaction({
        id: 'txn:payout:airbnb-payout-2' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'airbnb',
        subtype: 'transfer',
        amountMinor: 396105,
        currency: 'CZK',
        bookedAt: '2026-03-15',
        accountId: 'expected-payouts',
        reference: 'G-OC3WJE3SIXRO5',
        extractedRecordIds: ['airbnb-payout-2'],
        sourceDocumentIds: ['doc-airbnb-payout-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      }),
      normalizedTransaction({
        id: 'txn:payout:airbnb-payout-3' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'airbnb',
        subtype: 'transfer',
        amountMinor: 445697,
        currency: 'CZK',
        bookedAt: '2026-03-15',
        accountId: 'expected-payouts',
        reference: 'G-DXVK4YVI7MJVL',
        extractedRecordIds: ['airbnb-payout-3'],
        sourceDocumentIds: ['doc-airbnb-payout-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      }),
      normalizedTransaction({
        id: 'txn:payout:airbnb-payout-4' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'airbnb',
        subtype: 'transfer',
        amountMinor: 705994,
        currency: 'CZK',
        bookedAt: '2026-03-15',
        accountId: 'expected-payouts',
        reference: 'G-ZD5RVTGOHW3GE',
        extractedRecordIds: ['airbnb-payout-4'],
        sourceDocumentIds: ['doc-airbnb-payout-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'expedia-payout-export',
    description: 'Representative Expedia payout export with itinerary reference and property linkage.',
    sourceDocument: sourceDocument({
      id: 'doc-expedia-payout-2026-03' as SourceDocument['id'],
      sourceSystem: 'expedia',
      documentType: 'ota_report',
      fileName: 'expedia-payout-2026-03.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'payoutDate,amountMinor,currency,payoutReference,reservationId,propertyId',
        '2026-03-11,65000,CZK,EXP-TERM-1001,EXP-RES-1001,HOTEL-CZ-001'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'expedia-payout-1',
        sourceDocumentId: 'doc-expedia-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'EXP-TERM-1001',
        amountMinor: 65000,
        currency: 'CZK',
        occurredAt: '2026-03-11',
        data: {
          platform: 'expedia',
          bookedAt: '2026-03-11',
          amountMinor: 65000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'EXP-TERM-1001',
          reservationId: 'EXP-RES-1001',
          propertyId: 'HOTEL-CZ-001'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:payout:expedia-payout-1' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'expedia',
        amountMinor: 65000,
        currency: 'CZK',
        bookedAt: '2026-03-11',
        accountId: 'expected-payouts',
        reference: 'EXP-TERM-1001',
        reservationId: 'EXP-RES-1001',
        extractedRecordIds: ['expedia-payout-1'],
        sourceDocumentIds: ['doc-expedia-payout-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'previo-reservation-export',
    description: 'Operational Previo reservation export for deterministic reservation-source expectations on the shared payout-line path.',
    sourceDocument: sourceDocument({
      id: 'doc-previo-reservations-2026-03' as SourceDocument['id'],
      sourceSystem: 'previo',
      documentType: 'reservation_export',
      fileName: 'Prehled_rezervaci.xlsx'
    }),
    rawInput: {
      format: 'json',
      content: 'Previo reservation workbook fixture: Seznam rezervací + Přehled rezervací.',
      binaryContentBase64: workbookBase64([
        {
          name: 'Seznam rezervací',
          rows: [
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
            }
          ]
        },
        {
          name: 'Přehled rezervací',
          rows: [
            {
              Souhrn: 'Pouze agregovaný přehled',
              Hodnota: '1 rezervace'
            }
          ]
        }
      ])
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'previo-reservation-1',
        sourceDocumentId: 'doc-previo-reservations-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'PREVIO-20260314',
        amountMinor: 42000,
        currency: 'CZK',
        occurredAt: '2026-03-14',
        data: {
          platform: 'previo',
          rowKind: 'accommodation',
          bookedAt: '2026-03-14',
          createdAt: '2026-03-13T09:15:00',
          stayStartAt: '2026-03-14',
          stayEndAt: '2026-03-16',
          amountMinor: 42000,
          outstandingBalanceMinor: 3000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'PREVIO-20260314',
          reservationId: 'PREVIO-20260314',
          guestName: 'Jan Novak',
          channel: 'direct-web',
          companyName: 'Acme Travel s.r.o.',
          roomName: 'A101',
          itemLabel: undefined,
          sourceSheet: 'Seznam rezervací',
          workbookExtractionAudit: {
            sheetName: 'Seznam rezervací',
            headerRowIndex: 1,
            headerRowValues: [
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
            headerColumnIndexes: {
              'Vytvořeno': 0,
              'Termín od': 1,
              'Termín do': 2,
              'Nocí': 3,
              Voucher: 4,
              'Počet hostů': 5,
              Hosté: 6,
              'Check-In dokončen': 7,
              'Market kody': 8,
              Firma: 9,
              PP: 10,
              Stav: 11,
              Cena: 12,
              Saldo: 13,
              Pokoj: 14
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
          }
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:payout:previo-reservation-1' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'previo',
        amountMinor: 42000,
        currency: 'CZK',
        bookedAt: '2026-03-14',
        accountId: 'expected-payouts',
        reference: 'PREVIO-20260314',
        reservationId: 'PREVIO-20260314',
        extractedRecordIds: ['previo-reservation-1'],
        sourceDocumentIds: ['doc-previo-reservations-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'comgate-export',
    description: 'Representative Comgate export covering direct website reservations and parking payments.',
    sourceDocument: sourceDocument({
      id: 'doc-comgate-2026-03' as SourceDocument['id'],
      sourceSystem: 'comgate',
      documentType: 'payment_gateway_report',
      fileName: 'comgate-2026-03.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'paidAt,amountMinor,currency,reference,paymentPurpose,reservationId',
        '2026-03-15,38000,CZK,CG-RES-991,website-reservation,WEB-RES-991',
        '2026-03-16,4000,CZK,CG-PARK-551,parking,PARK-551'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'comgate-row-1',
        sourceDocumentId: 'doc-comgate-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'CG-RES-991',
        amountMinor: 38000,
        currency: 'CZK',
        occurredAt: '2026-03-15',
        data: {
          platform: 'comgate',
          bookedAt: '2026-03-15',
          amountMinor: 38000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'CG-RES-991',
          reservationId: 'WEB-RES-991',
          paymentPurpose: 'website-reservation'
        }
      }),
      extractedRecord({
        id: 'comgate-row-2',
        sourceDocumentId: 'doc-comgate-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'CG-PARK-551',
        amountMinor: 4000,
        currency: 'CZK',
        occurredAt: '2026-03-16',
        data: {
          platform: 'comgate',
          bookedAt: '2026-03-16',
          amountMinor: 4000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'CG-PARK-551',
          reservationId: 'PARK-551',
          paymentPurpose: 'parking'
        }
      })
    ]
  },
  {
    key: 'invoice-document',
    description: 'Representative invoice text fixture for deterministic invoice/receipt ingestion preparation.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-2026-332' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'invoice-2026-332.txt'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Invoice No: INV-2026-332',
        'Supplier: Laundry Supply s.r.o.',
        'Issue date: 2026-03-19',
        'Due date: 2026-03-26',
        'Total: 18 500 CZK',
        'Service: Laundry and linens'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record-1',
        sourceDocumentId: 'doc-invoice-2026-332' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: 'INV-2026-332',
        amountMinor: 1850000,
        currency: 'CZK',
        occurredAt: '2026-03-19',
        data: {
          sourceSystem: 'invoice',
          invoiceNumber: 'INV-2026-332',
          supplier: 'Laundry Supply s.r.o.',
          issueDate: '2026-03-19',
          dueDate: '2026-03-26',
          amountMinor: 1850000,
          currency: 'CZK',
          description: 'Laundry and linens'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record-1' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        amountMinor: 1850000,
        currency: 'CZK',
        bookedAt: '2026-03-19',
        accountId: 'document-expenses',
        counterparty: 'Laundry Supply s.r.o.',
        reference: 'INV-2026-332',
        invoiceNumber: 'INV-2026-332',
        extractedRecordIds: ['invoice-record-1'],
        sourceDocumentIds: ['doc-invoice-2026-332' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-czech-pdf',
    description: 'Representative Czech text-layer invoice PDF fixture for browser document intake and invoice parsing.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-lenner-141260183' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'Lenner.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Faktura - daňový doklad',
        'Dodavatel',
        'Lenner Motors s.r.o.',
        'Odběratel',
        'JOKELAND s.r.o.',
        'Datum zdanitelného plnění',
        'Forma úhrady',
        'Datum vystavení',
        '25.03.2026',
        'Strana 1/1',
        'Faktura číslo',
        '141260183',
        'Forma úhrady',
        'Přev.příkaz',
        'Datum vystavení',
        '11.03.2026',
        'Datum zdanitelného plnění',
        '11.03.2026',
        'Datum splatnosti',
        '25.03.2026',
        'Iban:',
        'CZ4903000000000274621920',
        'DPH',
        'Celkem po zaokrouhlení',
        '21 919,90 Kč',
        'Záloh celkem',
        'Rozpis DPH',
        'Základ DPH',
        '10 437,62',
        'DPH',
        '2 191,90',
        'Celkem po zaokrouhlení',
        '12 629,52',
        'Celkem Kč k úhradě',
        '12 629,52',
        'K úhradě',
        '12 629,52',
        'Předmět plnění:',
        'Servis vozidla'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record-1',
        sourceDocumentId: 'doc-invoice-lenner-141260183' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: '141260183',
        amountMinor: 1262952,
        currency: 'CZK',
        occurredAt: '2026-03-11',
        data: {
          sourceSystem: 'invoice',
          invoiceNumber: '141260183',
          supplier: 'Lenner Motors s.r.o.',
          customer: 'JOKELAND s.r.o.',
          issueDate: '2026-03-11',
          dueDate: '2026-03-25',
          taxableDate: '2026-03-11',
          amountMinor: 1262952,
          currency: 'CZK',
          paymentMethod: 'Přev. příkaz',
          description: 'Servis vozidla',
          vatBaseAmountMinor: 1043762,
          vatBaseCurrency: 'CZK',
          vatAmountMinor: 219190,
          vatCurrency: 'CZK',
          ibanHint: 'CZ4903000000000274621920'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record-1' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        amountMinor: 1262952,
        currency: 'CZK',
        bookedAt: '2026-03-11',
        accountId: 'document-expenses',
        counterparty: 'Lenner Motors s.r.o.',
        reference: '141260183',
        invoiceNumber: '141260183',
        extractedRecordIds: ['invoice-record-1'],
        sourceDocumentIds: ['doc-invoice-lenner-141260183' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'receipt-document',
    description: 'Representative receipt text fixture for deterministic hotel expense receipt ingestion.',
    sourceDocument: sourceDocument({
      id: 'doc-receipt-2026-03-55' as SourceDocument['id'],
      sourceSystem: 'receipt',
      documentType: 'receipt',
      fileName: 'receipt-2026-03-55.txt'
    }),
    rawInput: {
      format: 'text',
      content: [
        'Receipt No: RCPT-2026-03-55',
        'Merchant: Metro Cash & Carry',
        'Purchase date: 2026-03-20',
        'Total: 2 490 CZK',
        'Category: supplies',
        'Note: Cleaning materials'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'receipt-record-1',
        sourceDocumentId: 'doc-receipt-2026-03-55' as ExtractedRecord['sourceDocumentId'],
        recordType: 'receipt-document',
        rawReference: 'RCPT-2026-03-55',
        amountMinor: 249000,
        currency: 'CZK',
        occurredAt: '2026-03-20',
        data: {
          sourceSystem: 'receipt',
          receiptNumber: 'RCPT-2026-03-55',
          merchant: 'Metro Cash & Carry',
          purchaseDate: '2026-03-20',
          amountMinor: 249000,
          currency: 'CZK',
          category: 'supplies',
          description: 'Cleaning materials'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:receipt-record-1' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'receipt',
        amountMinor: 249000,
        currency: 'CZK',
        bookedAt: '2026-03-20',
        accountId: 'document-expenses',
        counterparty: 'Metro Cash & Carry',
        reference: 'RCPT-2026-03-55',
        extractedRecordIds: ['receipt-record-1'],
        sourceDocumentIds: ['doc-receipt-2026-03-55' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  }
]

export function getRealInputFixture(key: RealInputFixture['key']): RealInputFixture {
  const fixture = realInputFixtures.find((item) => item.key === key)

  if (!fixture) {
    throw new Error(`Unknown real input fixture: ${key}`)
  }

  return fixture
}
