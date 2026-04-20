import type { ExtractedRecord, NormalizedTransaction, SourceDocument } from '../domain'
import * as XLSX from 'xlsx'

export interface RealInputFixture {
  key:
  | 'raiffeisenbank-statement'
  | 'raiffeisenbank-gpc-statement'
  | 'raiffeisenbank-gpc-statement-direction-4'
  | 'fio-gpc-statement'
  | 'fio-statement'
  | 'booking-payout-export'
  | 'booking-payout-export-browser-upload-shape'
  | 'booking-payout-export-browser-upload-batch-shape'
  | 'booking-payout-statement-pdf'
  | 'booking-payout-statement-pdf-czk-main-total'
  | 'airbnb-payout-export'
  | 'expedia-payout-export'
  | 'previo-reservation-export'
  | 'comgate-export'
  | 'comgate-export-current-portal'
  | 'comgate-daily-payout-export'
  | 'invoice-document'
  | 'booking-invoice-pdf'
  | 'invoice-document-czech-pdf'
  | 'invoice-document-retail-tax-pdf'
  | 'invoice-document-save-car-pdf'
  | 'invoice-document-t-mobile-simplified-tax-pdf'
  | 'invoice-document-dobra-energie-pdf'
  | 'invoice-document-dobra-energie-refund-pdf'
  | 'invoice-document-dobra-energie-refund-sparse-pdf'
  | 'invoice-document-czech-pdf-with-spd-qr'
  | 'invoice-document-scan-pdf-with-ocr-stub'
  | 'receipt-document'
  | 'receipt-document-handwritten-pdf-with-ocr-stub'
  description: string
  sourceDocument: SourceDocument
  rawInput: {
    format: 'csv' | 'json' | 'text' | 'pdf-text'
    content: string
    binaryContentBase64?: string
  }
  expectedExtractedRecords: ExtractedRecord[]
  expectedExtractionResult?: 'records' | 'none'
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

function pdfBase64FromTextLines(
  lines: string[],
  options: {
    hiddenPayloadComments?: string[]
  } = {}
): string {
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

  for (const payload of options.hiddenPayloadComments ?? []) {
    pdf += `\n% ${payload}`
  }

  return Buffer.from(pdf, 'latin1').toString('base64')
}

function buildOcrStubPayloadComment(input: {
  documentKind: 'invoice' | 'receipt'
  fields: Record<string, string>
  adapter?: 'ocr' | 'vision'
}): string {
  const payload = Buffer.from(JSON.stringify({
    documentKind: input.documentKind,
    adapter: input.adapter ?? 'ocr',
    fields: input.fields
  }), 'utf8').toString('base64')

  return `HFC_OCR_STUB:${payload}`
}

function encodePdfHexString(value: string): string {
  return Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
}

const raiffeisenbankGpcSampleExcerpt = [
  '0740000005599955956JOKELAND s.r.o.     01022600000003308872+00000002922598+000000438538330000000434675590002280226',
  '0750000005599955956000000000000000000085517392600000001926441000000000000000011780000000000310126PK: 547872XXXXXX280501011010226',
  '078DEKUJEME, ROHLIK.CZ, Prague 8, CZE',
  '0750000005599955956000019278400027700085534837950000006670001003042230800010000000000000000020226                    01011020226',
  '078PRE recepce',
  '0750000005599955956000000255084011800085539457840000015454792000000000000260000000000000000020226BOOKING.COM B.V.    01011020226',
  '078NO.ONX09V3VWDRDC0IX/2206371',
  '0750000005599955956000000045701802400085548793070000000508201100260225500270003080000000000020226                    01011020226',
  '0750000005599955956000000721738100200085548820200000012321001002026002000550000000000000000020226Eden Laundry s.r.o. 01011020226',
  '078pr�delna Eden',
  '0750000005599955956000000517001189900085550713560000000086502000000000000550000000000000000020226Global Payments Euro01011020226',
  '078SOA/CZ0240000029079/PRZ/AS/ECZ/0112769/02/26 29-01-26 T90,00 -P3,50  C',
  '079hill Apartments',
  '0750000005599955956000000400023010300085555531440000001973282000000000000260000000000000000020226CITIBANK EUROPE PLC 01011020226',
  '078G-E6GN3KCZCKWUB/ROC/G-E6GN3KCZCKWUB',
  '0750000005599955956000000400023010300085555537020000003392542000000000000260000000000000000020226CITIBANK EUROPE PLC 01011020226',
  '078G-3HTLYHKWOAXY4/ROC/G-3HTLYHKWOAXY4',
  '0750000005599955956000000400023010300085555751950000006415212000000000000260000000000000000020226CITIBANK EUROPE PLC 01011020226',
  '078G-ZSR3LBSAHDH4I/ROC/G-ZSR3LBSAHDH4I',
  '0750000005599955956000000210735891700085570542930000001128672180260421500270000000000000000030226Comgate a.s.        01011030226'
].join('\n')

const raiffeisenbankGpcDirection4SampleExcerpt = [
  '0740000005599955956JOKELAND s.r.o.     01032600000002922598+00000011254963+000000574079870000000657403520003310326',
  '0750000005599955956000000000000000000086627047390000000439801000000000000000011780000000000270226PK: 408361XXXXXX437101011010326',
  '078Tesco Praha Eden, Praha 10, CZE',
  '0750000005599955956000000255084011800086658207850000053883712000000000000260000000000000000020326BOOKING.COM B.V.    01011020326',
  '078NO.4O3Q6FCNR9XC1EBN/2206371',
  '0750000005599955956000000000000000000086710092850000003419004000000000000000011780000000000280226                    01011030326',
  '078Alza.cz, Prague, CZE',
  '0750000005599955956000000000000000000086888142260000003698004000000000000000011780000000000050326                    01011070326',
  '078Alza.cz a.s., Prague, CZE',
  '0750000005599955956000000000000000000087403570170000000317004000000000000000011780000000000170326                    01011190326',
  '078Alza.cz a.s., Prague, CZE'
].join('\n')

const fioGpcSampleExcerpt = [
  '0740000008888997777JOKELAND s.r.o.     01032600000002958335+00000000584893+000000163897880000000140163460003310326FIO           ',
  '0750000008888997777000000000000000000275090587100000030000001000000530900000000000000000000010326Výběr z bankomatu: M00203010326',
  '0750000008888997777000000099900178800275162924210000048796942000000000000201000000000000000030326Fio banka, a.s.     00203030326',
  '0750000008888997777000000205535408300275163458910000040000001000000000000080000000000000000030326výplata eder        00203030326',
  '0750000008888997777000000000000000000275162904750000000966181000000000000000000000000000000030326Zaúčtování POS termi00203030326',
  '0750000008888997777000000512597523400275268286400000001201171202670324200201000000000000000100326previo              00203100326',
  '0750000008888997777000000559995595600275320753270000005000001000000000000550000000000000000130326hotel RB            00203130326',
  '0750000008888997777000000000000000000275339131420000000427001000000530900000000000000000000140326Nákup: www.ppl.cz - 00203140326'
].join('\n')

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
    key: 'raiffeisenbank-gpc-statement',
    description: 'Deterministic excerpt from the real Raiffeisenbank GPC sample with actual 074/075/078/079 line offsets.',
    sourceDocument: sourceDocument({
      id: 'doc-raif-gpc-2026-02' as SourceDocument['id'],
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      fileName: 'Vypis_5599955956_CZK_2026_002.gpc'
    }),
    rawInput: {
      format: 'text',
      content: raiffeisenbankGpcSampleExcerpt
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'raif-row-1',
        sourceDocumentId: 'doc-raif-gpc-2026-02' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: 'PK: 547872XXXXXX2805',
        amountMinor: -192644,
        currency: 'CZK',
        occurredAt: '2026-02-01',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank-gpc',
          bankStatementSource: 'raiffeisenbank',
          bookedAt: '2026-02-01',
          valueAt: '2026-01-31',
          amountMinor: -192644,
          currency: 'CZK',
          accountId: '5599955956',
          counterparty: 'DEKUJEME, ROHLIK.CZ, Prague 8, CZE',
          reference: 'PK: 547872XXXXXX2805',
          transactionType: 'Odchozí platba'
        }
      }),
      extractedRecord({
        id: 'raif-row-2',
        sourceDocumentId: 'doc-raif-gpc-2026-02' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: '55348379',
        amountMinor: -667000,
        currency: 'CZK',
        occurredAt: '2026-02-02',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank-gpc',
          bankStatementSource: 'raiffeisenbank',
          bookedAt: '2026-02-02',
          valueAt: '2026-02-02',
          amountMinor: -667000,
          currency: 'CZK',
          accountId: '5599955956',
          counterparty: 'PRE recepce',
          counterpartyAccount: '19-2784000277/0008',
          reference: '55348379',
          transactionType: 'Odchozí platba'
        }
      }),
      extractedRecord({
        id: 'raif-row-3',
        sourceDocumentId: 'doc-raif-gpc-2026-02' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: 'NO.ONX09V3VWDRDC0IX/2206371',
        amountMinor: 1545479,
        currency: 'CZK',
        occurredAt: '2026-02-02',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank-gpc',
          bankStatementSource: 'raiffeisenbank',
          bookedAt: '2026-02-02',
          valueAt: '2026-02-02',
          amountMinor: 1545479,
          currency: 'CZK',
          accountId: '5599955956',
          counterparty: 'BOOKING.COM B.V.',
          counterpartyAccount: '2550840118/0008',
          reference: 'NO.ONX09V3VWDRDC0IX/2206371',
          transactionType: 'Příchozí platba'
        }
      }),
      extractedRecord({
        id: 'raif-row-10',
        sourceDocumentId: 'doc-raif-gpc-2026-02' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: '55705429',
        amountMinor: 112867,
        currency: 'CZK',
        occurredAt: '2026-02-03',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank-gpc',
          bankStatementSource: 'raiffeisenbank',
          bookedAt: '2026-02-03',
          valueAt: '2026-02-03',
          amountMinor: 112867,
          currency: 'CZK',
          accountId: '5599955956',
          counterparty: 'Comgate a.s.',
          counterpartyAccount: '2107358917/0008',
          reference: '55705429',
          transactionType: 'Příchozí platba'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:bank:raif-row-1' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'bank',
        amountMinor: 192644,
        currency: 'CZK',
        bookedAt: '2026-02-01',
        valueAt: '2026-01-31',
        accountId: '5599955956',
        counterparty: 'DEKUJEME, ROHLIK.CZ, Prague 8, CZE',
        reference: 'PK: 547872XXXXXX2805',
        extractedRecordIds: ['raif-row-1'],
        sourceDocumentIds: ['doc-raif-gpc-2026-02' as NormalizedTransaction['sourceDocumentIds'][number]]
      }),
      normalizedTransaction({
        id: 'txn:bank:raif-row-3' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'bank',
        amountMinor: 1545479,
        currency: 'CZK',
        bookedAt: '2026-02-02',
        valueAt: '2026-02-02',
        accountId: '5599955956',
        counterparty: 'BOOKING.COM B.V.',
        reference: 'NO.ONX09V3VWDRDC0IX/2206371',
        extractedRecordIds: ['raif-row-3'],
        sourceDocumentIds: ['doc-raif-gpc-2026-02' as NormalizedTransaction['sourceDocumentIds'][number]]
      }),
      normalizedTransaction({
        id: 'txn:bank:raif-row-10' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'bank',
        amountMinor: 112867,
        currency: 'CZK',
        bookedAt: '2026-02-03',
        valueAt: '2026-02-03',
        accountId: '5599955956',
        counterparty: 'Comgate a.s.',
        reference: '55705429',
        extractedRecordIds: ['raif-row-10'],
        sourceDocumentIds: ['doc-raif-gpc-2026-02' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'raiffeisenbank-gpc-statement-direction-4',
    description: 'Deterministic excerpt from the real Raiffeisenbank GPC sample where card-merchant debits use direction code 4.',
    sourceDocument: sourceDocument({
      id: 'doc-raif-gpc-2026-03-direction-4' as SourceDocument['id'],
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      fileName: 'Vypis_5599955956_CZK_2026_003.gpc'
    }),
    rawInput: {
      format: 'text',
      content: raiffeisenbankGpcDirection4SampleExcerpt
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'raif-row-1',
        sourceDocumentId: 'doc-raif-gpc-2026-03-direction-4' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: 'PK: 408361XXXXXX4371',
        amountMinor: -43980,
        currency: 'CZK',
        occurredAt: '2026-03-01',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank-gpc',
          bankStatementSource: 'raiffeisenbank',
          bookedAt: '2026-03-01',
          valueAt: '2026-02-27',
          amountMinor: -43980,
          currency: 'CZK',
          accountId: '5599955956',
          counterparty: 'Tesco Praha Eden, Praha 10, CZE',
          reference: 'PK: 408361XXXXXX4371',
          transactionType: 'Odchozí platba'
        }
      }),
      extractedRecord({
        id: 'raif-row-2',
        sourceDocumentId: 'doc-raif-gpc-2026-03-direction-4' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: 'NO.4O3Q6FCNR9XC1EBN/2206371',
        amountMinor: 5388371,
        currency: 'CZK',
        occurredAt: '2026-03-02',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank-gpc',
          bankStatementSource: 'raiffeisenbank',
          bookedAt: '2026-03-02',
          valueAt: '2026-03-02',
          amountMinor: 5388371,
          currency: 'CZK',
          accountId: '5599955956',
          counterparty: 'BOOKING.COM B.V.',
          counterpartyAccount: '2550840118/0008',
          reference: 'NO.4O3Q6FCNR9XC1EBN/2206371',
          transactionType: 'Příchozí platba'
        }
      }),
      extractedRecord({
        id: 'raif-row-3',
        sourceDocumentId: 'doc-raif-gpc-2026-03-direction-4' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: '67100928',
        amountMinor: -341900,
        currency: 'CZK',
        occurredAt: '2026-03-03',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank-gpc',
          bankStatementSource: 'raiffeisenbank',
          bookedAt: '2026-03-03',
          valueAt: '2026-02-28',
          amountMinor: -341900,
          currency: 'CZK',
          accountId: '5599955956',
          counterparty: 'Alza.cz, Prague, CZE',
          reference: '67100928',
          transactionType: 'Odchozí platba'
        }
      })
    ]
  },
  {
    key: 'fio-gpc-statement',
    description: 'Deterministic excerpt from the real Fio GPC sample with exact 074/075 line offsets and no continuation records.',
    sourceDocument: sourceDocument({
      id: 'doc-fio-gpc-2026-03' as SourceDocument['id'],
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      fileName: 'Vypis_z_uctu-8888997777_20260301-20260331_cislo-3.gpc'
    }),
    rawInput: {
      format: 'text',
      content: fioGpcSampleExcerpt
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'fio-row-1',
        sourceDocumentId: 'doc-fio-gpc-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: '50905871',
        amountMinor: -3000000,
        currency: 'CZK',
        occurredAt: '2026-03-01',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'fio-gpc',
          bankStatementSource: 'fio',
          bookedAt: '2026-03-01',
          valueAt: '2026-03-01',
          amountMinor: -3000000,
          currency: 'CZK',
          accountId: '8888997777',
          counterparty: 'Výběr z bankomatu: M',
          reference: '50905871',
          transactionType: 'Odchozí platba'
        }
      }),
      extractedRecord({
        id: 'fio-row-2',
        sourceDocumentId: 'doc-fio-gpc-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: '51629242',
        amountMinor: 4879694,
        currency: 'CZK',
        occurredAt: '2026-03-03',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'fio-gpc',
          bankStatementSource: 'fio',
          bookedAt: '2026-03-03',
          valueAt: '2026-03-03',
          amountMinor: 4879694,
          currency: 'CZK',
          accountId: '8888997777',
          counterparty: 'Fio banka, a.s.',
          counterpartyAccount: '999001788/0027',
          reference: '51629242',
          transactionType: 'Příchozí platba'
        }
      }),
      extractedRecord({
        id: 'fio-row-6',
        sourceDocumentId: 'doc-fio-gpc-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'bank-transaction',
        rawReference: '53207532',
        amountMinor: -500000,
        currency: 'CZK',
        occurredAt: '2026-03-13',
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'fio-gpc',
          bankStatementSource: 'fio',
          bookedAt: '2026-03-13',
          valueAt: '2026-03-13',
          amountMinor: -500000,
          currency: 'CZK',
          accountId: '8888997777',
          counterparty: 'hotel RB',
          counterpartyAccount: '5599955956/0027',
          reference: '53207532',
          transactionType: 'Odchozí platba'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:bank:fio-row-2' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'bank',
        amountMinor: 4879694,
        currency: 'CZK',
        bookedAt: '2026-03-03',
        valueAt: '2026-03-03',
        accountId: '8888997777',
        counterparty: 'Fio banka, a.s.',
        reference: '51629242',
        extractedRecordIds: ['fio-row-2'],
        sourceDocumentIds: ['doc-fio-gpc-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      }),
      normalizedTransaction({
        id: 'txn:bank:fio-row-6' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'bank',
        amountMinor: 500000,
        currency: 'CZK',
        bookedAt: '2026-03-13',
        valueAt: '2026-03-13',
        accountId: '8888997777',
        counterparty: 'hotel RB',
        reference: '53207532',
        extractedRecordIds: ['fio-row-6'],
        sourceDocumentIds: ['doc-fio-gpc-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
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
          payoutTotalRaw: '1250.00 CZK',
          payoutTotalAmountMinor: 125000,
          payoutTotalCurrency: 'CZK',
          localTotalRaw: '1250.00 CZK',
          localAmountMinor: 125000,
          localCurrency: 'CZK',
          ibanSuffix: '5956',
          reservationIds: ['RES-BOOK-8841']
        }
      })
    ]
  },
  {
    key: 'booking-payout-statement-pdf-czk-main-total',
    description: 'Representative Booking payout statement PDF where the main payout total is already the CZK bank-settlement amount.',
    sourceDocument: sourceDocument({
      id: 'doc-booking-payout-statement-czk-main-total-2026-03' as SourceDocument['id'],
      sourceSystem: 'booking',
      documentType: 'payout_statement',
      fileName: 'booking-payout-statement-czk-main-total-2026-03.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Booking.com B.V.',
        'Výkaz plateb',
        'Datum vyplacení částky 26. března 2026',
        'ID platby 010738140021',
        'Celková částka k vyplacení 52,938.86 CZK',
        'IBAN CZ65 5500 0000 0000 5599 555956',
        'Rezervace RES-BOOK-9901'
      ].join('\n'),
      binaryContentBase64: pdfBase64FromTextLines([
        'Booking.com B.V.',
        'Výkaz plateb',
        'Datum vyplacení částky 26. března 2026',
        'ID platby 010738140021',
        'Celková částka k vyplacení 52,938.86 CZK',
        'IBAN CZ65 5500 0000 0000 5599 555956',
        'Rezervace RES-BOOK-9901'
      ])
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'booking-payout-statement-1',
        sourceDocumentId: 'doc-booking-payout-statement-czk-main-total-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-supplement',
        rawReference: '010738140021',
        amountMinor: 5293886,
        currency: 'CZK',
        occurredAt: '2026-03-26',
        data: {
          platform: 'booking',
          supplementRole: 'payout_statement',
          paymentId: '010738140021',
          payoutDate: '2026-03-26',
          amountMinor: 5293886,
          currency: 'CZK',
          payoutTotalRaw: '52938.86 CZK',
          payoutTotalAmountMinor: 5293886,
          payoutTotalCurrency: 'CZK',
          localTotalRaw: '52938.86 CZK',
          localAmountMinor: 5293886,
          localCurrency: 'CZK',
          ibanSuffix: '5956',
          referenceHints: ['RES-BOOK-9901'],
          reservationIds: ['RES-BOOK-9901']
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
          settlementProjectionEligibility: 'intake_only',
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
          paymentPurpose: 'website-reservation',
          comgateParserVariant: 'legacy'
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
          paymentPurpose: 'parking',
          comgateParserVariant: 'legacy'
        }
      })
    ]
  },
  {
    key: 'comgate-export-current-portal',
    description: 'Current Comgate klientský portál export transakcí CSV with fee columns and without reservation linkage columns.',
    sourceDocument: sourceDocument({
      id: 'doc-comgate-portal-2026-03' as SourceDocument['id'],
      sourceSystem: 'comgate',
      documentType: 'payment_gateway_report',
      fileName: 'Klientský portál export transakcí JOKELAND s.r.o..csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
        '"CG-PORTAL-TRX-2001";"CG-WEB-2001";"18.03.2026 09:15";"18.03.2026 09:16";"19.03.2026";"guest@example.com";"CG-WEB-2001";"JOKELAND s.r.o.";"1549,00";"CZK";"website-reservation";"0,00";"0,00";"9,00";"9,00"',
        '"CG-PORTAL-TRX-2002";"CG-PARK-2001";"18.03.2026 10:20";"18.03.2026 10:21";"19.03.2026";"parking@example.com";"CG-PARK-2001";"JOKELAND s.r.o.";"42,00";"CZK";"parking";"0,00";"0,00";"2,00";"2,00"'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'comgate-row-1',
        sourceDocumentId: 'doc-comgate-portal-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'CG-WEB-2001',
        amountMinor: 154900,
        currency: 'CZK',
        occurredAt: '2026-03-19',
        data: {
          platform: 'comgate',
          bookedAt: '2026-03-19',
          amountMinor: 154900,
          currency: 'CZK',
          accountId: 'expected-payouts',
          totalFeeMinor: 900,
          processorFeeMinor: 900,
          reference: 'CG-WEB-2001',
          paymentPurpose: 'website-reservation',
          transactionId: 'CG-PORTAL-TRX-2001',
          comgateParserVariant: 'current-portal'
        }
      }),
      extractedRecord({
        id: 'comgate-row-2',
        sourceDocumentId: 'doc-comgate-portal-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'CG-PARK-2001',
        amountMinor: 4200,
        currency: 'CZK',
        occurredAt: '2026-03-19',
        data: {
          platform: 'comgate',
          bookedAt: '2026-03-19',
          amountMinor: 4200,
          currency: 'CZK',
          accountId: 'expected-payouts',
          totalFeeMinor: 200,
          processorFeeMinor: 200,
          reference: 'CG-PARK-2001',
          paymentPurpose: 'parking',
          transactionId: 'CG-PORTAL-TRX-2002',
          comgateParserVariant: 'current-portal'
        }
      })
    ]
  },
  {
    key: 'comgate-daily-payout-export',
    description: 'Comgate daily payout CSV shape with per-payment rows and an explicit settlement-total summary row.',
    sourceDocument: sourceDocument({
      id: 'doc-comgate-daily-payout-2026-03' as SourceDocument['id'],
      sourceSystem: 'comgate',
      documentType: 'payment_gateway_report',
      fileName: 'vypis-2026-03-27_1816656820.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        '"Merchant";"ID ComGate";"Metoda";"Potvrzen� ��stka";"P�eveden� ��stka";"Produkt";"Variabiln� symbol p�evodu";"ID od klienta"',
        '"499465";"JGSV-QK5O-DR7O";"Karta online";"2447,50";"2423,51";"";"1816656820";"108966761"',
        '"499465";"BHOV-M0TY-LBQV";"Karta online";"3059,38";"3029,40";"";"1816656820";"108929843"',
        '"499465";"5V2K-MLZM-ETAK";"Karta online";"611,88";"605,88";"";"1816656820";"108592573"',
        '"suma";"";"";"6118,76";"6058,79";"";"";""'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'comgate-row-1',
        sourceDocumentId: 'doc-comgate-daily-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'JGSV-QK5O-DR7O',
        amountMinor: 242351,
        data: {
          platform: 'comgate',
          accountId: 'expected-payouts',
          amountMinor: 242351,
          confirmedAmountMinor: 244750,
          transferredAmountMinor: 242351,
          reference: '1816656820',
          transactionId: 'JGSV-QK5O-DR7O',
          clientId: '108966761',
          reservationId: '108966761',
          merchant: '499465',
          paymentMethod: 'Karta online',
          explicitSettlementTotalMinor: 605879,
          explicitSettlementGrossTotalMinor: 611876,
          comgateParserVariant: 'daily-settlement'
        }
      }),
      extractedRecord({
        id: 'comgate-row-2',
        sourceDocumentId: 'doc-comgate-daily-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'BHOV-M0TY-LBQV',
        amountMinor: 302940,
        data: {
          platform: 'comgate',
          accountId: 'expected-payouts',
          amountMinor: 302940,
          confirmedAmountMinor: 305938,
          transferredAmountMinor: 302940,
          reference: '1816656820',
          transactionId: 'BHOV-M0TY-LBQV',
          clientId: '108929843',
          reservationId: '108929843',
          merchant: '499465',
          paymentMethod: 'Karta online',
          explicitSettlementTotalMinor: 605879,
          explicitSettlementGrossTotalMinor: 611876,
          comgateParserVariant: 'daily-settlement'
        }
      }),
      extractedRecord({
        id: 'comgate-row-3',
        sourceDocumentId: 'doc-comgate-daily-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: '5V2K-MLZM-ETAK',
        amountMinor: 60588,
        data: {
          platform: 'comgate',
          accountId: 'expected-payouts',
          amountMinor: 60588,
          confirmedAmountMinor: 61188,
          transferredAmountMinor: 60588,
          reference: '1816656820',
          transactionId: '5V2K-MLZM-ETAK',
          clientId: '108592573',
          reservationId: '108592573',
          merchant: '499465',
          paymentMethod: 'Karta online',
          explicitSettlementTotalMinor: 605879,
          explicitSettlementGrossTotalMinor: 611876,
          comgateParserVariant: 'daily-settlement'
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
        id: 'invoice-record:doc-invoice-2026-332',
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
          referenceHints: ['INV-2026-332'],
          description: 'Laundry and linens'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-2026-332' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        amountMinor: 1850000,
        currency: 'CZK',
        bookedAt: '2026-03-19',
        accountId: 'document-expenses',
        counterparty: 'Laundry Supply s.r.o.',
        reference: 'INV-2026-332',
        referenceHints: ['INV-2026-332'],
        invoiceNumber: 'INV-2026-332',
        extractedRecordIds: ['invoice-record:doc-invoice-2026-332'],
        sourceDocumentIds: ['doc-invoice-2026-332' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'booking-invoice-pdf',
    description: 'Representative Booking.com invoice PDF fixture for browser document intake and deterministic invoice parsing.',
    sourceDocument: sourceDocument({
      id: 'doc-booking-invoice-2026-03' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'booking-invoice-2026-03.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Booking.com B.V.',
        'Invoice number: BOOK-INV-2026-03',
        'Invoice date: 2026-03-31',
        'Due date: 2026-04-14',
        'Billing period: 2026-03-01 to 2026-03-31',
        'Total payable: 1 456,42 EUR',
        'Total payable (CZK): 35 530,12 CZK',
        'Payment reference: BOOK-INV-2026-03',
        'Property reference: CHILL-APT-PRG',
        'IBAN: NL91ABNA0417164300',
        'Invoice type: Commission invoice'
      ].join('\n'),
      binaryContentBase64: pdfBase64FromTextLines([
        'Booking.com B.V.',
        'Invoice number: BOOK-INV-2026-03',
        'Invoice date: 2026-03-31',
        'Due date: 2026-04-14',
        'Billing period: 2026-03-01 to 2026-03-31',
        'Total payable: 1 456,42 EUR',
        'Total payable (CZK): 35 530,12 CZK',
        'Payment reference: BOOK-INV-2026-03',
        'Property reference: CHILL-APT-PRG',
        'IBAN: NL91ABNA0417164300',
        'Invoice type: Commission invoice'
      ])
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-booking-invoice-2026-03',
        sourceDocumentId: 'doc-booking-invoice-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: 'BOOK-INV-2026-03',
        amountMinor: 145642,
        currency: 'EUR',
        occurredAt: '2026-03-31',
        data: {
          sourceSystem: 'invoice',
          invoiceNumber: 'BOOK-INV-2026-03',
          supplier: 'Booking.com B.V.',
          issueDate: '2026-03-31',
          dueDate: '2026-04-14',
          amountMinor: 145642,
          currency: 'EUR',
          description: 'Commission invoice',
          ibanHint: 'NL91ABNA0417164300',
          billingPeriod: '2026-03-01 to 2026-03-31',
          localAmountMinor: 3553012,
          localCurrency: 'CZK',
          referenceHints: ['BOOK-INV-2026-03', 'CHILL-APT-PRG']
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-booking-invoice-2026-03' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        amountMinor: 145642,
        currency: 'EUR',
        bookedAt: '2026-03-31',
        accountId: 'document-expenses',
        counterparty: 'Booking.com B.V.',
        reference: 'BOOK-INV-2026-03',
        invoiceNumber: 'BOOK-INV-2026-03',
        extractedRecordIds: ['invoice-record:doc-booking-invoice-2026-03'],
        sourceDocumentIds: ['doc-booking-invoice-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
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
        'Faktura',
        'číslo',
        'Datum splatnosti',
        'Forma úhrady',
        'Datum vystavení',
        'Datum zdanitelného plnění',
        '25.03.2026',
        'Přev.příkaz',
        '11.03.2026',
        '11.03.2026',
        '141260183',
        'Strana 1/1',
        'Iban:',
        'CZ4903000000000274621920',
        'Rozpis DPH',
        'DPH │ Celkem po zaokrouhlení',
        '21 919,90 Kč │ Záloh celkem',
        'Základ DPH',
        '10 437,62 Kč',
        'DPH',
        '2 191,90 Kč',
        'S DPH │ 10 437,62 Kč │ 12 629,52 Kč │ Razítko a podpis',
        'Předmět plnění:',
        'Servis vozidla'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-lenner-141260183',
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
        id: 'txn:document:invoice-record:doc-invoice-lenner-141260183' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        amountMinor: 1262952,
        currency: 'CZK',
        bookedAt: '2026-03-11',
        accountId: 'document-expenses',
        counterparty: 'Lenner Motors s.r.o.',
        reference: '141260183',
        invoiceNumber: '141260183',
        extractedRecordIds: ['invoice-record:doc-invoice-lenner-141260183'],
        sourceDocumentIds: ['doc-invoice-lenner-141260183' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-retail-tax-pdf',
    description: 'Retail tax invoice PDF fixture with VAT-summary totals and embedded payment-terminal slip noise.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-retail-tax-358260021513' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'Datart-retail-tax-invoice.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Daňový doklad - FAKTURA 358260021513',
        'Dodavatel',
        'HP TRONIC Zlín, spol. s r.o.',
        'nám. Práce 2523',
        '760 01 Zlín',
        'IČO: 66699053',
        'DIČ: CZ66699053',
        'Koncový zákazník',
        'JOKELAND s.r.o.',
        'Datum vystavení',
        '28.03.2026',
        'Datum uskutečnění zdaň. plnění',
        '28.03.2026',
        'Datum splatnosti',
        '28.03.2026',
        'DPH | Základ | Celkem CZK',
        '397,09 | 1 890,91 | 2 288,00',
        'Celkem k úhradě s DPH',
        '2 288,00 CZK',
        'Platební terminál',
        'Částka CZK',
        '2 290,00',
        'Datum a čas transakce',
        '28/03/2026 16:54:25',
        'Autorizační kód',
        '123456',
        'Strana 1/2',
        'Strana 2/2'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-retail-tax-358260021513',
        sourceDocumentId: 'doc-invoice-retail-tax-358260021513' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: '358260021513',
        amountMinor: 228800,
        currency: 'CZK',
        occurredAt: '2026-03-28',
        data: {
          sourceSystem: 'invoice',
          settlementDirection: 'payable_outgoing',
          invoiceNumber: '358260021513',
          supplier: 'HP TRONIC Zlín, spol. s r.o.',
          issueDate: '2026-03-28',
          dueDate: '2026-03-28',
          taxableDate: '2026-03-28',
          amountMinor: 228800,
          currency: 'CZK',
          settlementAmountMinor: 228800,
          settlementCurrency: 'CZK',
          referenceHints: ['358260021513'],
          vatBaseAmountMinor: 189091,
          vatBaseCurrency: 'CZK',
          vatAmountMinor: 39709,
          vatCurrency: 'CZK'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-retail-tax-358260021513' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        settlementDirection: 'payable_outgoing',
        amountMinor: 228800,
        currency: 'CZK',
        bookedAt: '2026-03-28',
        accountId: 'document-expenses',
        counterparty: 'HP TRONIC Zlín, spol. s r.o.',
        reference: '358260021513',
        referenceHints: ['358260021513'],
        invoiceNumber: '358260021513',
        extractedRecordIds: ['invoice-record:doc-invoice-retail-tax-358260021513'],
        sourceDocumentIds: ['doc-invoice-retail-tax-358260021513' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-save-car-pdf',
    description: 'POHODA-like supplier invoice PDF fixture with explicit supplier and customer blocks plus total in Celkem (Kč).',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-save-car-260100011' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'Save-Car-260100011.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'FAKTURA - DAŇOVÝ DOKLAD',
        'Dodavatel: Save Car s.r.o.',
        'Odběratel: JOKELAND s.r.o.',
        'Číslo: 260100011',
        'Datum vystavení: 10.03.2026',
        'Datum uskutečnění plnění: 10.03.2026',
        'Datum splatnosti: 24.03.2026',
        'Celkem (Kč): 6 655,00'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-save-car-260100011',
        sourceDocumentId: 'doc-invoice-save-car-260100011' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: '260100011',
        amountMinor: 665500,
        currency: 'CZK',
        occurredAt: '2026-03-10',
        data: {
          sourceSystem: 'invoice',
          invoiceNumber: '260100011',
          supplier: 'Save Car s.r.o.',
          customer: 'JOKELAND s.r.o.',
          issueDate: '2026-03-10',
          dueDate: '2026-03-24',
          taxableDate: '2026-03-10',
          amountMinor: 665500,
          currency: 'CZK',
          referenceHints: ['260100011']
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-save-car-260100011' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        amountMinor: 665500,
        currency: 'CZK',
        bookedAt: '2026-03-10',
        accountId: 'document-expenses',
        counterparty: 'Save Car s.r.o.',
        reference: '260100011',
        referenceHints: ['260100011'],
        invoiceNumber: '260100011',
        extractedRecordIds: ['invoice-record:doc-invoice-save-car-260100011'],
        sourceDocumentIds: ['doc-invoice-save-car-260100011' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-t-mobile-simplified-tax-pdf',
    description: 'Simplified tax document PDF fixture with invoice-style routing, inline number, and bare supplier header line.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-t-mobile-sb-4346297271' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'T-Mobile-SB-4346297271.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'ZJEDNODUŠENÝ DAŇOVÝ DOKLAD',
        'T-Mobile Czech Republic a.s.',
        'č.: SB-4346297271',
        'Datum vystavení: 09.03.2026',
        'Datum uskutečnění plnění: 09.03.2026',
        'Datum splatnosti: 09.03.2026',
        'Celkem k úhradě: 289,00 Kč',
        'Forma úhrady: Platba kartou'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-t-mobile-sb-4346297271',
        sourceDocumentId: 'doc-invoice-t-mobile-sb-4346297271' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: 'SB-4346297271',
        amountMinor: 28900,
        currency: 'CZK',
        occurredAt: '2026-03-09',
        data: {
          sourceSystem: 'invoice',
          settlementDirection: 'payable_outgoing',
          invoiceNumber: 'SB-4346297271',
          supplier: 'T-Mobile Czech Republic a.s.',
          issueDate: '2026-03-09',
          dueDate: '2026-03-09',
          taxableDate: '2026-03-09',
          amountMinor: 28900,
          currency: 'CZK',
          settlementAmountMinor: 28900,
          settlementCurrency: 'CZK',
          paymentMethod: 'Platba kartou',
          referenceHints: ['SB-4346297271']
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-t-mobile-sb-4346297271' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        settlementDirection: 'payable_outgoing',
        amountMinor: 28900,
        currency: 'CZK',
        bookedAt: '2026-03-09',
        accountId: 'document-expenses',
        counterparty: 'T-Mobile Czech Republic a.s.',
        reference: 'SB-4346297271',
        referenceHints: ['SB-4346297271'],
        invoiceNumber: 'SB-4346297271',
        extractedRecordIds: ['invoice-record:doc-invoice-t-mobile-sb-4346297271'],
        sourceDocumentIds: ['doc-invoice-t-mobile-sb-4346297271' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-dobra-energie-pdf',
    description: 'Readable Dobrá Energie supplier invoice PDF fixture for deterministic supplier identity extraction and browser intake coverage.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-dobra-energie-2026034501' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'Dobra-Energie-2026-03.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Faktura - daňový doklad',
        'Dodavatel',
        'Dobrá Energie s.r.o.',
        'Nádražní 12',
        '602 00 Brno',
        'Odběratel',
        'JOKELAND s.r.o.',
        'Faktura číslo',
        'DE-2026-03-4501',
        'Variabilní symbol',
        '2026034501',
        'Datum vystavení',
        '18.03.2026',
        'Datum zdanitelného plnění',
        '18.03.2026',
        'Datum splatnosti',
        '01.04.2026',
        'Forma úhrady',
        'Přev.příkaz',
        'Období',
        '01.03.2026 - 31.03.2026',
        'IBAN:',
        'CZ6508000000192000145399',
        'Celkem',
        '62 318,03 Kč',
        'Nedoplatek',
        '7 125,00 Kč',
        'Předmět plnění:',
        'Dodávka elektřiny'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-dobra-energie-2026034501',
        sourceDocumentId: 'doc-invoice-dobra-energie-2026034501' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: 'DE-2026-03-4501',
        amountMinor: 712500,
        currency: 'CZK',
        occurredAt: '2026-03-18',
        data: {
          sourceSystem: 'invoice',
          settlementDirection: 'payable_outgoing',
          invoiceNumber: 'DE-2026-03-4501',
          variableSymbol: '2026034501',
          supplier: 'Dobrá Energie s.r.o.',
          customer: 'JOKELAND s.r.o.',
          issueDate: '2026-03-18',
          dueDate: '2026-04-01',
          taxableDate: '2026-03-18',
          amountMinor: 712500,
          currency: 'CZK',
          settlementAmountMinor: 712500,
          settlementCurrency: 'CZK',
          summaryTotalAmountMinor: 6231803,
          summaryTotalCurrency: 'CZK',
          paymentMethod: 'Přev. příkaz',
          description: 'Dodávka elektřiny',
          billingPeriod: '01.03.2026 - 31.03.2026',
          referenceHints: ['DE-2026-03-4501', '2026034501'],
          ibanHint: 'CZ6508000000192000145399'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-dobra-energie-2026034501' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        settlementDirection: 'payable_outgoing',
        amountMinor: 712500,
        currency: 'CZK',
        bookedAt: '2026-03-18',
        accountId: 'document-expenses',
        counterparty: 'Dobrá Energie s.r.o.',
        reference: 'DE-2026-03-4501',
        referenceHints: ['DE-2026-03-4501', '2026034501'],
        invoiceNumber: 'DE-2026-03-4501',
        variableSymbol: '2026034501',
        extractedRecordIds: ['invoice-record:doc-invoice-dobra-energie-2026034501'],
        sourceDocumentIds: ['doc-invoice-dobra-energie-2026034501' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-dobra-energie-refund-pdf',
    description: 'Readable Dobrá Energie overpayment settlement invoice PDF fixture for incoming refund routing and bank linking hints.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-dobra-energie-refund-2026039901' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'Dobra-Energie-preplatek-2026-03.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Faktura - daňový doklad',
        'Dodavatel',
        'Dobrá Energie s.r.o.',
        'Nádražní 12',
        '602 00 Brno',
        'Odběratel',
        'JOKELAND s.r.o.',
        'Faktura číslo',
        'DE-RET-2026-03-9901',
        'Variabilní symbol',
        '2026039901',
        'Datum vystavení',
        '21.03.2026',
        'Datum splatnosti',
        '25.03.2026',
        'Celkem',
        '49 854,42 Kč',
        'Přeplatek',
        '2 450,00 Kč',
        'Přeplatek bude připsán na Váš bankovní účet',
        '5599955956/5500',
        'Předmět plnění:',
        'Vyúčtování dodávky elektřiny za březen 2026'
      ].join('\n'),
      binaryContentBase64: pdfBase64FromTextLines([
        'Faktura - daňový doklad',
        'Dodavatel',
        'Dobrá Energie s.r.o.',
        'Nádražní 12',
        '602 00 Brno',
        'Odběratel',
        'JOKELAND s.r.o.',
        'Faktura číslo',
        'DE-RET-2026-03-9901',
        'Variabilní symbol',
        '2026039901',
        'Datum vystavení',
        '21.03.2026',
        'Datum splatnosti',
        '25.03.2026',
        'Celkem',
        '49 854,42 Kč',
        'Přeplatek',
        '2 450,00 Kč',
        'Přeplatek bude připsán na Váš bankovní účet',
        '5599955956/5500',
        'Předmět plnění:',
        'Vyúčtování dodávky elektřiny za březen 2026'
      ])
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-dobra-energie-refund-2026039901',
        sourceDocumentId: 'doc-invoice-dobra-energie-refund-2026039901' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: 'DE-RET-2026-03-9901',
        amountMinor: 245000,
        currency: 'CZK',
        occurredAt: '2026-03-21',
        data: {
          sourceSystem: 'invoice',
          settlementDirection: 'refund_incoming',
          invoiceNumber: 'DE-RET-2026-03-9901',
          variableSymbol: '2026039901',
          supplier: 'Dobrá Energie s.r.o.',
          customer: 'JOKELAND s.r.o.',
          issueDate: '2026-03-21',
          dueDate: '2026-03-25',
          amountMinor: 245000,
          currency: 'CZK',
          settlementAmountMinor: 245000,
          settlementCurrency: 'CZK',
          summaryTotalAmountMinor: 4985442,
          summaryTotalCurrency: 'CZK',
          description: 'Vyúčtování dodávky elektřiny za březen 2026',
          targetBankAccountHint: '5599955956/5500',
          referenceHints: ['DE-RET-2026-03-9901', '2026039901']
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-dobra-energie-refund-2026039901' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'invoice',
        subtype: 'supplier_refund',
        settlementDirection: 'refund_incoming',
        amountMinor: 245000,
        currency: 'CZK',
        bookedAt: '2026-03-21',
        accountId: 'document-refunds',
        counterparty: 'Dobrá Energie s.r.o.',
        reference: 'DE-RET-2026-03-9901',
        referenceHints: ['DE-RET-2026-03-9901', '2026039901'],
        invoiceNumber: 'DE-RET-2026-03-9901',
        variableSymbol: '2026039901',
        targetBankAccountHint: '5599955956/5500',
        extractedRecordIds: ['invoice-record:doc-invoice-dobra-energie-refund-2026039901'],
        sourceDocumentIds: ['doc-invoice-dobra-energie-refund-2026039901' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-dobra-energie-refund-sparse-pdf',
    description: 'Sparse Dobrá Energie overpayment settlement invoice PDF fixture that omits issue date but still carries enough evidence for incoming refund document linking in browser flow.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-dobra-energie-refund-sparse-5125144501' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Faktura - daňový doklad',
        'Dodavatel',
        'Dobrá Energie s.r.o.',
        'Odběratel',
        'JOKELAND s.r.o.',
        'Variabilní symbol',
        '5125144501',
        'Datum splatnosti',
        '26.03.2026',
        'Přeplatek',
        '3 804,00 Kč',
        'Přeplatek bude připsán na Váš bankovní účet',
        '8888997777/2010',
        'Předmět plnění:',
        'Vyúčtování dodávky elektřiny za březen 2026'
      ].join('\n'),
      binaryContentBase64: pdfBase64FromTextLines([
        'Faktura - daňový doklad',
        'Dodavatel',
        'Dobrá Energie s.r.o.',
        'Odběratel',
        'JOKELAND s.r.o.',
        'Variabilní symbol',
        '5125144501',
        'Datum splatnosti',
        '26.03.2026',
        'Přeplatek',
        '3 804,00 Kč',
        'Přeplatek bude připsán na Váš bankovní účet',
        '8888997777/2010',
        'Předmět plnění:',
        'Vyúčtování dodávky elektřiny za březen 2026'
      ])
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-dobra-energie-refund-sparse-5125144501',
        sourceDocumentId: 'doc-invoice-dobra-energie-refund-sparse-5125144501' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: '5125144501',
        amountMinor: 380400,
        currency: 'CZK',
        occurredAt: '2026-03-26',
        data: {
          sourceSystem: 'invoice',
          settlementDirection: 'refund_incoming',
          invoiceNumber: '5125144501',
          variableSymbol: '5125144501',
          supplier: 'Dobrá Energie s.r.o.',
          customer: 'JOKELAND s.r.o.',
          dueDate: '2026-03-26',
          amountMinor: 380400,
          currency: 'CZK',
          settlementAmountMinor: 380400,
          settlementCurrency: 'CZK',
          description: 'Vyúčtování dodávky elektřiny za březen 2026',
          targetBankAccountHint: '8888997777/2010',
          referenceHints: ['5125144501']
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-dobra-energie-refund-sparse-5125144501' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'invoice',
        subtype: 'supplier_refund',
        settlementDirection: 'refund_incoming',
        amountMinor: 380400,
        currency: 'CZK',
        bookedAt: '2026-03-26',
        accountId: 'document-refunds',
        counterparty: 'Dobrá Energie s.r.o.',
        reference: '5125144501',
        referenceHints: ['5125144501'],
        invoiceNumber: '5125144501',
        variableSymbol: '5125144501',
        targetBankAccountHint: '8888997777/2010',
        extractedRecordIds: ['invoice-record:doc-invoice-dobra-energie-refund-sparse-5125144501'],
        sourceDocumentIds: ['doc-invoice-dobra-energie-refund-sparse-5125144501' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-czech-pdf-with-spd-qr',
    description: 'Representative Czech invoice PDF fixture with hidden SPD / QR Platba payload for browser QR fallback recovery.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-qr-141260183' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'invoice-with-qr.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: [
        'Faktura - daňový doklad',
        'Dodavatel',
        'QR Hotel Supply s.r.o.',
        'Odběratel',
        'JOKELAND s.r.o.',
        'Datum vystavení',
        '11.03.2026',
        'Předmět plnění:',
        'Softwarová licence'
      ].join('\n'),
      binaryContentBase64: pdfBase64FromTextLines(
        [
          'Faktura - daňový doklad',
          'Dodavatel',
          'QR Hotel Supply s.r.o.',
          'Odběratel',
          'JOKELAND s.r.o.',
          'Datum vystavení',
          '11.03.2026',
          'Předmět plnění:',
          'Softwarová licence'
        ],
        {
          hiddenPayloadComments: [
            'SPD*1.0*ACC:CZ4903000000000274621920*AM:18500.00*CC:CZK*X-VS:141260183*X-KS:0308*X-SS:1007*RN:QR%20Hotel%20Supply%20s.r.o.*MSG:Faktura%20141260183*DT:20260325'
          ]
        }
      )
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-qr-141260183',
        sourceDocumentId: 'doc-invoice-qr-141260183' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: '141260183',
        amountMinor: 1850000,
        currency: 'CZK',
        occurredAt: '2026-03-11',
        data: {
          sourceSystem: 'invoice',
          invoiceNumber: '141260183',
          supplier: 'QR Hotel Supply s.r.o.',
          customer: 'JOKELAND s.r.o.',
          issueDate: '2026-03-11',
          dueDate: '2026-03-25',
          amountMinor: 1850000,
          currency: 'CZK',
          description: 'Softwarová licence',
          ibanHint: 'CZ4903000000000274621920'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-qr-141260183' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        amountMinor: 1850000,
        currency: 'CZK',
        bookedAt: '2026-03-11',
        accountId: 'document-expenses',
        counterparty: 'QR Hotel Supply s.r.o.',
        reference: '141260183',
        invoiceNumber: '141260183',
        extractedRecordIds: ['invoice-record:doc-invoice-qr-141260183'],
        sourceDocumentIds: ['doc-invoice-qr-141260183' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'invoice-document-scan-pdf-with-ocr-stub',
    description: 'Scan-like invoice PDF with hidden OCR stub payload for browser fallback tests.',
    sourceDocument: sourceDocument({
      id: 'doc-invoice-ocr-2026-077' as SourceDocument['id'],
      sourceSystem: 'invoice',
      documentType: 'invoice',
      fileName: 'invoice-scan-ocr.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: '',
      binaryContentBase64: pdfBase64FromTextLines([], {
        hiddenPayloadComments: [
          buildOcrStubPayloadComment({
            documentKind: 'invoice',
            fields: {
              referenceNumber: 'OCR-INV-2026-77',
              issuerOrCounterparty: 'Scan Laundry Supply s.r.o.',
              customer: 'JOKELAND s.r.o.',
              issueDate: '2026-03-20',
              dueDate: '2026-03-27',
              taxableDate: '2026-03-20',
              paymentMethod: 'Bankovní převod',
              totalAmount: '6 500,00 CZK',
              vatBaseAmount: '5 371,90 CZK',
              vatAmount: '1 128,10 CZK',
              ibanHint: 'CZ4903000000000274621920',
              note: 'Scan invoice OCR payload'
            }
          })
        ]
      })
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'invoice-record:doc-invoice-ocr-2026-077',
        sourceDocumentId: 'doc-invoice-ocr-2026-077' as ExtractedRecord['sourceDocumentId'],
        recordType: 'invoice-document',
        rawReference: 'OCR-INV-2026-77',
        amountMinor: 650000,
        currency: 'CZK',
        occurredAt: '2026-03-20',
        data: {
          sourceSystem: 'invoice',
          invoiceNumber: 'OCR-INV-2026-77',
          supplier: 'Scan Laundry Supply s.r.o.',
          customer: 'JOKELAND s.r.o.',
          issueDate: '2026-03-20',
          dueDate: '2026-03-27',
          taxableDate: '2026-03-20',
          amountMinor: 650000,
          currency: 'CZK',
          paymentMethod: 'Bankovní převod',
          description: 'Scan invoice OCR payload',
          vatBaseAmountMinor: 537190,
          vatBaseCurrency: 'CZK',
          vatAmountMinor: 112810,
          vatCurrency: 'CZK',
          ibanHint: 'CZ4903000000000274621920'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:invoice-record:doc-invoice-ocr-2026-077' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'invoice',
        amountMinor: 650000,
        currency: 'CZK',
        bookedAt: '2026-03-20',
        accountId: 'document-expenses',
        counterparty: 'Scan Laundry Supply s.r.o.',
        reference: 'OCR-INV-2026-77',
        invoiceNumber: 'OCR-INV-2026-77',
        extractedRecordIds: ['invoice-record:doc-invoice-ocr-2026-077'],
        sourceDocumentIds: ['doc-invoice-ocr-2026-077' as NormalizedTransaction['sourceDocumentIds'][number]]
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
        id: 'txn:document:receipt-record-1:doc-receipt-2026-03-55' as NormalizedTransaction['id'],
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
  },
  {
    key: 'receipt-document-handwritten-pdf-with-ocr-stub',
    description: 'Handwritten-like receipt PDF with partial OCR stub payload that should land in needs_review.',
    sourceDocument: sourceDocument({
      id: 'doc-receipt-ocr-2026-04-01' as SourceDocument['id'],
      sourceSystem: 'receipt',
      documentType: 'receipt',
      fileName: 'receipt-handwritten.pdf'
    }),
    rawInput: {
      format: 'pdf-text',
      content: '',
      binaryContentBase64: pdfBase64FromTextLines([], {
        hiddenPayloadComments: [
          buildOcrStubPayloadComment({
            documentKind: 'receipt',
            fields: {
              issuerOrCounterparty: 'Fresh Farm Market',
              paymentDate: '2026-03-22',
              totalAmount: '249,00 CZK',
              note: 'Handwritten grocery receipt'
            }
          })
        ]
      })
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'receipt-record-1',
        sourceDocumentId: 'doc-receipt-ocr-2026-04-01' as ExtractedRecord['sourceDocumentId'],
        recordType: 'receipt-document',
        amountMinor: 24900,
        currency: 'CZK',
        occurredAt: '2026-03-22',
        data: {
          sourceSystem: 'receipt',
          merchant: 'Fresh Farm Market',
          purchaseDate: '2026-03-22',
          amountMinor: 24900,
          currency: 'CZK',
          description: 'Handwritten grocery receipt'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:document:receipt-record-1:doc-receipt-ocr-2026-04-01' as NormalizedTransaction['id'],
        direction: 'out',
        source: 'receipt',
        amountMinor: 24900,
        currency: 'CZK',
        bookedAt: '2026-03-22',
        accountId: 'document-expenses',
        counterparty: 'Fresh Farm Market',
        extractedRecordIds: ['receipt-record-1'],
        sourceDocumentIds: ['doc-receipt-ocr-2026-04-01' as NormalizedTransaction['sourceDocumentIds'][number]]
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
