import type { ExtractedRecord, NormalizedTransaction, SourceDocument } from '../domain'

export interface RealInputFixture {
  key:
    | 'raiffeisenbank-statement'
    | 'fio-statement'
    | 'booking-payout-export'
    | 'airbnb-payout-export'
    | 'expedia-payout-export'
    | 'previo-reservation-export'
    | 'comgate-export'
    | 'invoice-document'
  | 'receipt-document'
  description: string
  sourceDocument: SourceDocument
  rawInput: {
    format: 'csv' | 'json' | 'text' | 'pdf-text'
    content: string
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
        extractedRecordIds: ['booking-payout-1'],
        sourceDocumentIds: ['doc-booking-payout-2026-03' as NormalizedTransaction['sourceDocumentIds'][number]]
      })
    ]
  },
  {
    key: 'airbnb-payout-export',
    description: 'Representative Airbnb payout export with payout reference, confirmation code, and listing linkage.',
    sourceDocument: sourceDocument({
      id: 'doc-airbnb-payout-2026-03' as SourceDocument['id'],
      sourceSystem: 'airbnb',
      documentType: 'ota_report',
      fileName: 'airbnb-payout-2026-03.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'payoutDate,amountMinor,currency,payoutReference,reservationId,listingId',
        '2026-03-12,98000,CZK,AIRBNB-20260312,HMA4TR9,LISTING-CZ-11'
      ].join('\n')
    },
    expectedExtractedRecords: [
      extractedRecord({
        id: 'airbnb-payout-1',
        sourceDocumentId: 'doc-airbnb-payout-2026-03' as ExtractedRecord['sourceDocumentId'],
        recordType: 'payout-line',
        rawReference: 'AIRBNB-20260312',
        amountMinor: 98000,
        currency: 'CZK',
        occurredAt: '2026-03-12',
        data: {
          platform: 'airbnb',
          bookedAt: '2026-03-12',
          amountMinor: 98000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'AIRBNB-20260312',
          reservationId: 'HMA4TR9',
          propertyId: 'LISTING-CZ-11',
          listingId: 'LISTING-CZ-11'
        }
      })
    ],
    expectedNormalizedTransactions: [
      normalizedTransaction({
        id: 'txn:payout:airbnb-payout-1' as NormalizedTransaction['id'],
        direction: 'in',
        source: 'airbnb',
        amountMinor: 98000,
        currency: 'CZK',
        bookedAt: '2026-03-12',
        accountId: 'expected-payouts',
        reference: 'AIRBNB-20260312',
        reservationId: 'HMA4TR9',
        extractedRecordIds: ['airbnb-payout-1'],
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
    description: 'Representative Previo reservation export for direct reservation expectations on the shared payout-line path.',
    sourceDocument: sourceDocument({
      id: 'doc-previo-reservations-2026-03' as SourceDocument['id'],
      sourceSystem: 'previo',
      documentType: 'reservation_export',
      fileName: 'previo-reservations-2026-03.csv'
    }),
    rawInput: {
      format: 'csv',
      content: [
        'stayDate,amountMinor,currency,reservationReference,reservationId,propertyId',
        '2026-03-14,42000,CZK,PREVIO-20260314,PREVIO-8841,HOTEL-CZ-001'
      ].join('\n')
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
          bookedAt: '2026-03-14',
          amountMinor: 42000,
          currency: 'CZK',
          accountId: 'expected-payouts',
          reference: 'PREVIO-20260314',
          reservationId: 'PREVIO-8841',
          propertyId: 'HOTEL-CZ-001'
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
        reservationId: 'PREVIO-8841',
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
