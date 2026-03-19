import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { prepareUploadedMonthlyFiles, runMonthlyReconciliationBatch } from '../../src/monthly-batch'

describe('runMonthlyReconciliationBatch', () => {
  it('runs deterministic extraction, reconciliation, and reporting over representative monthly files', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const comgate = getRealInputFixture('comgate-export')
    const invoice = getRealInputFixture('invoice-document')

    const result = runMonthlyReconciliationBatch({
      files: [booking, raiffeisen, comgate, invoice].map((fixture) => ({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content
      })),
      reconciliationContext: {
        runId: 'monthly-run-2026-03',
        requestedAt: '2026-03-18T22:30:00.000Z'
      },
      reportGeneratedAt: '2026-03-18T22:31:00.000Z'
    })

    expect(result.files).toEqual([
      {
        sourceDocumentId: booking.sourceDocument.id,
        extractedRecordIds: ['booking-payout-1'],
        extractedCount: 1
      },
      {
        sourceDocumentId: raiffeisen.sourceDocument.id,
        extractedRecordIds: ['raif-row-1', 'raif-row-2', 'raif-row-3', 'raif-row-4', 'raif-row-5', 'raif-row-6'],
        extractedCount: 6
      },
      {
        sourceDocumentId: comgate.sourceDocument.id,
        extractedRecordIds: ['comgate-row-1', 'comgate-row-2'],
        extractedCount: 2
      },
      {
        sourceDocumentId: invoice.sourceDocument.id,
        extractedRecordIds: ['invoice-record-1'],
        extractedCount: 1
      }
    ])

    expect(result.extractedRecords).toHaveLength(10)
    expect(result.reconciliation.summary).toEqual({
      normalizedTransactionCount: 10,
      matchedGroupCount: 1,
      exceptionCount: 8,
      unmatchedExpectedCount: 2,
      unmatchedActualCount: 2
    })
    expect(result.report.summary).toEqual(result.reconciliation.summary)
    expect(result.report.matches).toHaveLength(1)
    expect(result.report.exceptions).toHaveLength(8)
    expect(
      result.report.exceptions.some(
        (exceptionCase) => exceptionCase.ruleCode === 'suspicious_private_expense'
      )
    ).toBe(true)
    expect(
      result.report.exceptions.some(
        (exceptionCase) => exceptionCase.ruleCode === 'missing_supporting_document'
      )
    ).toBe(true)
  })

  it('fails clearly when a source document has no configured parser', () => {
    expect(() =>
      runMonthlyReconciliationBatch({
        files: [
          {
            sourceDocument: {
              id: 'doc-unknown' as never,
              sourceSystem: 'unknown',
              documentType: 'other',
              fileName: 'unknown.csv',
              uploadedAt: '2026-03-18T22:30:00.000Z'
            },
            content: 'anything'
          }
        ],
        reconciliationContext: {
          runId: 'monthly-run-error',
          requestedAt: '2026-03-18T22:30:00.000Z'
        },
        reportGeneratedAt: '2026-03-18T22:31:00.000Z'
      })
    ).toThrow('No monthly batch parser configured')
  })

  it('prepares uploaded files into shared imported monthly source files with traceable source documents', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const airbnb = getRealInputFixture('airbnb-payout-export')
    const expedia = getRealInputFixture('expedia-payout-export')
    const previo = getRealInputFixture('previo-reservation-export')
    const invoice = getRealInputFixture('invoice-document')

    const files = prepareUploadedMonthlyFiles([
      {
        name: booking.sourceDocument.fileName,
        content: booking.rawInput.content,
        uploadedAt: '2026-03-18T22:40:00.000Z'
      },
      {
        name: airbnb.sourceDocument.fileName,
        content: airbnb.rawInput.content,
        uploadedAt: '2026-03-18T22:40:30.000Z'
      },
      {
        name: expedia.sourceDocument.fileName,
        content: expedia.rawInput.content,
        uploadedAt: '2026-03-18T22:40:45.000Z'
      },
      {
        name: previo.sourceDocument.fileName,
        content: previo.rawInput.content,
        uploadedAt: '2026-03-18T22:40:50.000Z'
      },
      {
        name: invoice.sourceDocument.fileName,
        content: invoice.rawInput.content,
        uploadedAt: '2026-03-18T22:41:00.000Z'
      }
    ])

    expect(files).toEqual([
      {
        sourceDocument: {
          id: 'uploaded:booking:1:booking-payout-2026-03-csv',
          sourceSystem: 'booking',
          documentType: 'ota_report',
          fileName: 'booking-payout-2026-03.csv',
          uploadedAt: '2026-03-18T22:40:00.000Z'
        },
        content: booking.rawInput.content
      },
      {
        sourceDocument: {
          id: 'uploaded:airbnb:2:airbnb-payout-2026-03-csv',
          sourceSystem: 'airbnb',
          documentType: 'ota_report',
          fileName: 'airbnb-payout-2026-03.csv',
          uploadedAt: '2026-03-18T22:40:30.000Z'
        },
        content: airbnb.rawInput.content
      },
      {
        sourceDocument: {
          id: 'uploaded:expedia:3:expedia-payout-2026-03-csv',
          sourceSystem: 'expedia',
          documentType: 'ota_report',
          fileName: 'expedia-payout-2026-03.csv',
          uploadedAt: '2026-03-18T22:40:45.000Z'
        },
        content: expedia.rawInput.content
      },
      {
        sourceDocument: {
          id: 'uploaded:previo:4:previo-reservations-2026-03-csv',
          sourceSystem: 'previo',
          documentType: 'reservation_export',
          fileName: 'previo-reservations-2026-03.csv',
          uploadedAt: '2026-03-18T22:40:50.000Z'
        },
        content: previo.rawInput.content
      },
      {
        sourceDocument: {
          id: 'uploaded:invoice:5:invoice-2026-332-txt',
          sourceSystem: 'invoice',
          documentType: 'invoice',
          fileName: 'invoice-2026-332.txt',
          uploadedAt: '2026-03-18T22:41:00.000Z'
        },
        content: invoice.rawInput.content
      }
    ])
  })

  it('infers shared uploaded source systems from deterministic CSV content even when filenames are generic', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const fio = getRealInputFixture('fio-statement')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const comgate = getRealInputFixture('comgate-export')

    const files = prepareUploadedMonthlyFiles([
      {
        name: 'statement.csv',
        content: fio.rawInput.content,
        uploadedAt: '2026-03-19T12:00:00.000Z'
      },
      {
        name: 'bank.csv',
        content: raiffeisen.rawInput.content,
        uploadedAt: '2026-03-19T12:01:00.000Z'
      },
      {
        name: 'provider.csv',
        content: comgate.rawInput.content,
        uploadedAt: '2026-03-19T12:02:00.000Z'
      },
      {
        name: 'report.csv',
        content: booking.rawInput.content,
        uploadedAt: '2026-03-19T12:03:00.000Z'
      }
    ])

    expect(files.map((file) => file.sourceDocument.sourceSystem)).toEqual([
      'bank',
      'bank',
      'comgate',
      'booking'
    ])

    expect(files.map((file) => file.sourceDocument.documentType)).toEqual([
      'bank_statement',
      'bank_statement',
      'payment_gateway_report',
      'ota_report'
    ])
  })

  it('keeps a Fio bank CSV classified as bank when transaction rows mention Comgate a.s.', () => {
    const fioWithComgateCounterparty = [
      'Datum provedení;Datum zaúčtování;Zaúčtovaná částka;Měna účtu;Název protiúčtu;Zpráva pro příjemce',
      '19.03.2026;19.03.2026;1540,00;CZK;Comgate a.s.;Platba kartou rezervace'
    ].join('\n')

    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'statement.csv',
        content: fioWithComgateCounterparty,
        uploadedAt: '2026-03-19T12:05:00.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('bank')
    expect(prepared[0]?.sourceDocument.documentType).toBe('bank_statement')
  })

  it('classifies a real Fio-style header with extra intermediate columns as bank and routes it as Fio', () => {
    const fioWithExtraColumns = [
      'Datum provedení;Kód banky;Datum zaúčtování;Typ pohybu;Zaúčtovaná částka;Zůstatek;Měna účtu;Název protiúčtu',
      '19.03.2026;2010;19.03.2026;Bezhotovostní příjem;1540,00;25000,00;CZK;Comgate a.s.'
    ].join('\n')

    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_5599955956_202603191023.csv',
        content: fioWithExtraColumns,
        uploadedAt: '2026-03-19T12:05:30.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('bank')
    expect(prepared[0]?.sourceDocument.id).toBe('uploaded:bank:1:pohyby-5599955956-202603191023-csv')
  })

  it('classifies a generic-filename Raiffeisenbank CSV by its Czech bank headers', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'statement.csv',
        content: [
          'Datum;Objem;Měna;Protiúčet;Typ',
          '19.03.2026;1250,00;CZK;5500/1234;Příchozí platba'
        ].join('\n'),
        uploadedAt: '2026-03-19T12:06:00.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('bank')
    expect(prepared[0]?.sourceDocument.documentType).toBe('bank_statement')
  })

  it('classifies a real Raiffeisenbank-style header with extra intermediate columns as bank and routes it as Raiffeisenbank', () => {
    const raiffeisenWithExtraColumns = [
      'Datum;Číslo účtu;Objem;Měna;Název protiúčtu;Protiúčet;Zpráva;Typ',
      '19.03.2026;123456789/5500;1250,00;CZK;Booking BV;5500/1234;PAYOUT-BOOK-20260310;Příchozí platba'
    ].join('\n')

    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'statement.csv',
        content: raiffeisenWithExtraColumns,
        uploadedAt: '2026-03-19T12:06:30.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('bank')
    expect(prepared[0]?.sourceDocument.id).toBe('uploaded:bank:1:statement-csv')
  })

  it('classifies a real Comgate export from its deterministic headers instead of generic content mentions', () => {
    const comgate = getRealInputFixture('comgate-export')

    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'provider.csv',
        content: comgate.rawInput.content,
        uploadedAt: '2026-03-19T12:07:00.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('comgate')
    expect(prepared[0]?.sourceDocument.documentType).toBe('payment_gateway_report')
  })

  it('routes generic uploaded filenames to the correct shared parser based on deterministic content signatures', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const fio = getRealInputFixture('fio-statement')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const comgate = getRealInputFixture('comgate-export')

    const preparedFiles = prepareUploadedMonthlyFiles([
      {
        name: 'statement.csv',
        content: fio.rawInput.content,
        uploadedAt: '2026-03-19T12:00:00.000Z'
      },
      {
        name: 'bank.csv',
        content: raiffeisen.rawInput.content,
        uploadedAt: '2026-03-19T12:01:00.000Z'
      },
      {
        name: 'gateway.csv',
        content: comgate.rawInput.content,
        uploadedAt: '2026-03-19T12:02:00.000Z'
      },
      {
        name: 'payout.csv',
        content: booking.rawInput.content,
        uploadedAt: '2026-03-19T12:03:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: preparedFiles,
      reconciliationContext: {
        runId: 'monthly-run-generic-upload-names',
        requestedAt: '2026-03-19T12:10:00.000Z'
      },
      reportGeneratedAt: '2026-03-19T12:10:30.000Z'
    })

    expect(result.files.map((file) => file.extractedCount)).toEqual([2, 6, 2, 1])
    expect(result.reconciliation.normalizedTransactions.map((transaction) => transaction.source)).toEqual([
      'bank',
      'bank',
      'bank',
      'bank',
      'bank',
      'bank',
      'bank',
      'bank',
      'comgate',
      'comgate',
      'booking'
    ])
  })

  it('runs added Airbnb, Expedia, and Previo files through the shared monthly-batch path with traceability intact', () => {
    const airbnb = getRealInputFixture('airbnb-payout-export')
    const expedia = getRealInputFixture('expedia-payout-export')
    const previo = getRealInputFixture('previo-reservation-export')

    const result = runMonthlyReconciliationBatch({
      files: [airbnb, expedia, previo].map((fixture) => ({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content
      })),
      reconciliationContext: {
        runId: 'monthly-run-step-34',
        requestedAt: '2026-03-19T10:45:00.000Z'
      },
      reportGeneratedAt: '2026-03-19T10:46:00.000Z'
    })

    expect(result.files).toEqual([
      {
        sourceDocumentId: airbnb.sourceDocument.id,
        extractedRecordIds: ['airbnb-payout-1'],
        extractedCount: 1
      },
      {
        sourceDocumentId: expedia.sourceDocument.id,
        extractedRecordIds: ['expedia-payout-1'],
        extractedCount: 1
      },
      {
        sourceDocumentId: previo.sourceDocument.id,
        extractedRecordIds: ['previo-reservation-1'],
        extractedCount: 1
      }
    ])
    expect(result.extractedRecords.map((record) => record.sourceDocumentId)).toEqual([
      airbnb.sourceDocument.id,
      expedia.sourceDocument.id,
      previo.sourceDocument.id
    ])
    expect(result.reconciliation.normalizedTransactions.map((transaction) => transaction.source)).toEqual([
      'airbnb',
      'expedia',
      'previo'
    ])
  })

  it('keeps the shared monthly-batch path deterministic for realistic parser variants', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const result = runMonthlyReconciliationBatch({
      files: [
        {
          sourceDocument: booking.sourceDocument,
          content: [
            'datumVyplaty;netAmount;měna;paymentReference;bookingId;hotelId',
            '10.03.2026;1250,00;CZK;PAYOUT-BOOK-20260310;RES-BOOK-8841;HOTEL-CZ-001'
          ].join('\n')
        },
        {
          sourceDocument: raiffeisen.sourceDocument,
          content: [
            '\uFEFFdatum;částka;měna;účet;protistrana;poznámka;typ',
            '10.03.2026;1250,00;CZK;raiffeisen-main;Booking BV;PAYOUT-BOOK-20260310;booking-payout'
          ].join('\n')
        }
      ],
      reconciliationContext: {
        runId: 'monthly-run-variant',
        requestedAt: '2026-03-18T22:30:00.000Z'
      },
      reportGeneratedAt: '2026-03-18T22:31:00.000Z'
    })

    expect(result.extractedRecords).toHaveLength(2)
    expect(result.reconciliation.summary).toEqual({
      normalizedTransactionCount: 2,
      matchedGroupCount: 1,
      exceptionCount: 0,
      unmatchedExpectedCount: 0,
      unmatchedActualCount: 0
    })
    expect(result.files).toEqual([
      {
        sourceDocumentId: booking.sourceDocument.id,
        extractedRecordIds: ['booking-payout-1'],
        extractedCount: 1
      },
      {
        sourceDocumentId: raiffeisen.sourceDocument.id,
        extractedRecordIds: ['raif-row-1'],
        extractedCount: 1
      }
    ])
  })

  it('routes uploaded receipts through the shared monthly-batch document path with traceability', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'účtenka-2026-03-55.txt',
        content: [
          'Číslo účtenky: RCPT-2026-03-55',
          'Obchod: Metro Cash & Carry',
          'Datum nákupu: 20.03.2026',
          'Zaplaceno: 24.90 CZK',
          'Kategorie: supplies',
          'Poznámka: Cleaning materials'
        ].join('\n'),
        uploadedAt: '2026-03-18T22:45:00.000Z'
      }
    ])

    expect(prepared[0].sourceDocument).toEqual({
      id: 'uploaded:receipt:1:tenka-2026-03-55-txt',
      sourceSystem: 'receipt',
      documentType: 'receipt',
      fileName: 'účtenka-2026-03-55.txt',
      uploadedAt: '2026-03-18T22:45:00.000Z'
    })

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'receipt-run-2026-03',
        requestedAt: '2026-03-18T22:45:30.000Z'
      },
      reportGeneratedAt: '2026-03-18T22:46:00.000Z'
    })

    expect(result.files).toEqual([
      {
        sourceDocumentId: 'uploaded:receipt:1:tenka-2026-03-55-txt',
        extractedRecordIds: ['receipt-record-1'],
        extractedCount: 1
      }
    ])
    expect(result.extractedRecords[0]).toMatchObject({
      recordType: 'receipt-document',
      rawReference: 'RCPT-2026-03-55',
      sourceDocumentId: 'uploaded:receipt:1:tenka-2026-03-55-txt'
    })
    expect(result.reconciliation.summary).toEqual({
      normalizedTransactionCount: 1,
      matchedGroupCount: 0,
      exceptionCount: 1,
      unmatchedExpectedCount: 0,
      unmatchedActualCount: 0
    })
  })

  it('reduces false missing-document flags when a matching invoice is present in the same monthly batch', () => {
    const invoice = getRealInputFixture('invoice-document')

    const result = runMonthlyReconciliationBatch({
      files: [
        {
          sourceDocument: {
            id: 'doc-bank-expense-supported' as never,
            sourceSystem: 'bank',
            documentType: 'bank_statement',
            fileName: 'raiffeisen-expense-supported.csv',
            uploadedAt: '2026-03-19T11:10:00.000Z'
          },
          content: [
            'bookedAt,amountMinor,currency,accountId,counterparty,reference,transactionType',
            '2026-03-20,-1850000,CZK,raiffeisen-main,Laundry Supply s.r.o.,INV-2026-332,expense'
          ].join('\n')
        },
        {
          sourceDocument: invoice.sourceDocument,
          content: invoice.rawInput.content
        }
      ],
      reconciliationContext: {
        runId: 'monthly-run-supported-expense',
        requestedAt: '2026-03-19T11:10:00.000Z'
      },
      reportGeneratedAt: '2026-03-19T11:11:00.000Z'
    })

    expect(result.reconciliation.supportedExpenseLinks).toHaveLength(1)
    expect(result.reconciliation.supportedExpenseLinks[0]).toMatchObject({
      expenseTransactionId: 'txn:bank:raif-row-1',
      supportTransactionId: 'txn:document:invoice-record-1'
    })
    expect(result.report.exceptions.some((item) => item.ruleCode === 'missing_supporting_document')).toBe(false)
    expect(result.reconciliation.exceptionCases.some((item) => item.ruleCode === 'missing_supporting_document')).toBe(false)
  })

  it('avoids over-flagging known legitimate payroll outflows as missing-document or suspicious expenses', () => {
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const result = runMonthlyReconciliationBatch({
      files: [
        {
          sourceDocument: raiffeisen.sourceDocument,
          content: [
            'bookedAt,amountMinor,currency,accountId,counterparty,reference,transactionType',
            '2026-03-18,-55000,CZK,raiffeisen-main,Hotel payroll,PAYROLL-MAR-2026,payroll'
          ].join('\n')
        }
      ],
      reconciliationContext: {
        runId: 'payroll-run-2026-03',
        requestedAt: '2026-03-18T22:47:00.000Z'
      },
      reportGeneratedAt: '2026-03-18T22:48:00.000Z'
    })

    expect(result.reconciliation.exceptionCases).toHaveLength(1)
    expect(result.reconciliation.exceptionCases[0]).toMatchObject({
      type: 'unmatched_transaction',
      ruleCode: undefined
    })
    expect(result.reconciliation.exceptionCases[0].explanation).not.toContain('suspicious/private')
    expect(result.reconciliation.exceptionCases[0].explanation).not.toContain('supporting invoice or receipt')
  })
})