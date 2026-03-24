import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import {
  ingestUploadedMonthlyFiles,
  prepareUploadedMonthlyBatchFiles,
  prepareUploadedMonthlyFiles,
  runMonthlyReconciliationBatch
} from '../../src/monthly-batch'

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
    expect(result.report.summary).toEqual({
      ...result.reconciliation.summary,
      payoutBatchMatchCount: 1,
      unmatchedPayoutBatchCount: 2
    })
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
        binaryContentBase64: previo.rawInput.binaryContentBase64,
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
        content: booking.rawInput.content,
        binaryContentBase64: undefined
      },
      {
        sourceDocument: {
          id: 'uploaded:airbnb:2:airbnb-03-2026-03-2026-csv',
          sourceSystem: 'airbnb',
          documentType: 'ota_report',
          fileName: 'airbnb_03_2026-03_2026.csv',
          uploadedAt: '2026-03-18T22:40:30.000Z'
        },
        content: airbnb.rawInput.content,
        binaryContentBase64: undefined
      },
      {
        sourceDocument: {
          id: 'uploaded:expedia:3:expedia-payout-2026-03-csv',
          sourceSystem: 'expedia',
          documentType: 'ota_report',
          fileName: 'expedia-payout-2026-03.csv',
          uploadedAt: '2026-03-18T22:40:45.000Z'
        },
        content: expedia.rawInput.content,
        binaryContentBase64: undefined
      },
      {
        sourceDocument: {
          id: 'uploaded:previo:4:prehled-rezervaci-xlsx',
          sourceSystem: 'previo',
          documentType: 'reservation_export',
          fileName: 'Prehled_rezervaci.xlsx',
          uploadedAt: '2026-03-18T22:40:50.000Z'
        },
        content: previo.rawInput.content,
        binaryContentBase64: previo.rawInput.binaryContentBase64
      },
      {
        sourceDocument: {
          id: 'uploaded:invoice:5:invoice-2026-332-txt',
          sourceSystem: 'invoice',
          documentType: 'invoice',
          fileName: 'invoice-2026-332.txt',
          uploadedAt: '2026-03-18T22:41:00.000Z'
        },
        content: invoice.rawInput.content,
        binaryContentBase64: undefined
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

  it('runs the real uploaded Previo reservation workbook shape through the shared monthly flow', () => {
    const previo = getRealInputFixture('previo-reservation-export')

    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Prehled_rezervaci.xlsx',
        content: previo.rawInput.content,
        binaryContentBase64: previo.rawInput.binaryContentBase64,
        uploadedAt: '2026-03-21T09:00:00.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('previo')
    expect(prepared[0]?.sourceDocument.documentType).toBe('reservation_export')

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-previo-workbook',
        requestedAt: '2026-03-21T09:01:00.000Z'
      },
      reportGeneratedAt: '2026-03-21T09:02:00.000Z'
    })

    expect(result.files).toEqual([
      {
        sourceDocumentId: 'uploaded:previo:1:prehled-rezervaci-xlsx',
        extractedRecordIds: ['previo-reservation-1'],
        extractedCount: 1
      }
    ])
    expect(result.reconciliation.workflowPlan?.reservationSources).toEqual([
      expect.objectContaining({
        reservationId: 'PREVIO-20260314',
        sourceSystem: 'previo',
        reference: 'PREVIO-20260314',
        stayStartAt: '2026-03-14',
        stayEndAt: '2026-03-16',
        guestName: 'Jan Novak',
        channel: 'direct-web',
        grossRevenueMinor: 42000,
        currency: 'CZK'
      })
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

  it('classifies a Pohyby_na_uctu-style Fio export as bank instead of unknown', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
        content: [
          '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
          '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
        ].join('\n'),
        uploadedAt: '2026-03-19T18:15:00.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('bank')
    expect(prepared[0]?.sourceDocument.documentType).toBe('bank_statement')
    expect(prepared[0]?.sourceDocument.id).toBe('uploaded:bank:1:pohyby-na-uctu-8888997777-20260301-20260319-csv')
  })

  it('runs a real localized Fio upload shape through the shared monthly-batch parser stage', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
        content: [
          '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
          '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
        ].join('\n'),
        uploadedAt: '2026-03-19T15:05:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-real-fio-localized-upload',
        requestedAt: '2026-03-19T15:05:30.000Z'
      },
      reportGeneratedAt: '2026-03-19T15:06:00.000Z'
    })

    expect(result.files.map((file) => file.extractedCount)).toEqual([1])
    expect(result.extractedRecords[0]).toMatchObject({
      id: 'fio-row-1',
      amountMinor: 154000,
      currency: 'CZK',
      occurredAt: '2026-03-19T06:23:00',
      data: {
        sourceSystem: 'bank',
        bankParserVariant: 'fio',
        accountId: '8888997777/2010',
        counterparty: 'Comgate a.s.',
        reference: 'Platba rezervace WEB-2001'
      }
    })
  })

  it('runs a localized Fio upload with Czech bookedAt datetime values through the shared monthly-batch path', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
        content: [
          '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
          '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001',
          '19.03.2026 7:15;840,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2002'
        ].join('\n'),
        uploadedAt: '2026-03-19T17:35:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-fio-localized-datetime-upload',
        requestedAt: '2026-03-19T17:35:30.000Z'
      },
      reportGeneratedAt: '2026-03-19T17:36:00.000Z'
    })

    expect(result.files.map((file) => file.extractedCount)).toEqual([2])
    expect(result.extractedRecords.map((record) => record.occurredAt)).toEqual([
      '2026-03-19T06:23:00',
      '2026-03-19T07:15:00'
    ])
  })

  it('runs the Pohyby_na_uctu Fio export variant through the shared monthly-batch path', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
        content: [
          '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
          '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001',
          '19.03.2026 7:15;840,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2002'
        ].join('\n'),
        uploadedAt: '2026-03-19T18:16:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-fio-pohyby-na-uctu-upload',
        requestedAt: '2026-03-19T18:16:30.000Z'
      },
      reportGeneratedAt: '2026-03-19T18:17:00.000Z'
    })

    expect(result.files.map((file) => file.extractedCount)).toEqual([2])
    expect(result.extractedRecords.map((record) => record.occurredAt)).toEqual([
      '2026-03-19T06:23:00',
      '2026-03-19T07:15:00'
    ])
    expect(result.extractedRecords.map((record) => record.amountMinor)).toEqual([154000, 84000])
    expect(result.extractedRecords.map((record) => record.id)).toEqual(['fio-row-1', 'fio-row-2'])
    expect(result.extractedRecords.map((record) => record.data.bankParserVariant)).toEqual(['fio', 'fio'])
  })

  it('classifies the Pohyby na účtu Fio variant from deterministic content even with a generic filename', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'statement.csv',
        content: [
          '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
          '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
        ].join('\n'),
        uploadedAt: '2026-03-19T18:18:00.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('bank')
    expect(prepared[0]?.sourceDocument.documentType).toBe('bank_statement')
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

  it('routes a real Raiffeisenbank-style generic bank file to the Raiffeisenbank parser', () => {
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'statement.csv',
        content: raiffeisen.rawInput.content,
        uploadedAt: '2026-03-19T19:00:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-raiffeisen-generic-routing',
        requestedAt: '2026-03-19T19:00:30.000Z'
      },
      reportGeneratedAt: '2026-03-19T19:01:00.000Z'
    })

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('bank')
    expect(result.files.map((file) => file.extractedCount)).toEqual([6])
    expect(result.extractedRecords[0]?.id).toBe('raif-row-1')
    expect(result.extractedRecords[0]?.data.bankParserVariant).toBe('raiffeisenbank')
  })

  it('routes the current 5599955956 file by its Fio-style header shape instead of by filename pattern assumptions', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_5599955956_202603191023.csv',
        content: [
          '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
          '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
        ].join('\n'),
        uploadedAt: '2026-03-19T20:10:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-5599955956-content-first-routing',
        requestedAt: '2026-03-19T20:10:30.000Z'
      },
      reportGeneratedAt: '2026-03-19T20:11:00.000Z'
    })

    expect(result.files.map((file) => file.extractedCount)).toEqual([1])
    expect(result.extractedRecords.map((record) => record.id)).toEqual(['fio-row-1'])
    expect(result.extractedRecords.map((record) => record.data.bankParserVariant)).toEqual(['fio'])
    expect(result.extractedRecords[0]?.data.accountId).toBe('5599955956/5500')
  })

  it('routes the Pohyby_na_uctu shape by its own Datum/Objem/Měna/Protiúčet content shape instead of filename assumptions', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
        content: [
          '\uFEFF"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
          '19.03.2026 06:23;1250,00;CZK;5500/1234;5500;PAYOUT-BOOK-20260310;Booking BV;Příchozí platba'
        ].join('\n'),
        uploadedAt: '2026-03-19T21:00:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-pohyby-na-uctu-content-first-routing',
        requestedAt: '2026-03-19T21:00:30.000Z'
      },
      reportGeneratedAt: '2026-03-19T21:01:00.000Z'
    })

    expect(result.extractedRecords.map((record) => record.id)).toEqual(['raif-row-1'])
    expect(result.extractedRecords.map((record) => record.data.bankParserVariant)).toEqual(['raiffeisenbank'])
    expect(result.extractedRecords[0]?.data.accountId).toBe('8888997777')
  })

  it('keeps account attribution separate from parser selection when an RB-owned file uses the Fio-style export shape', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_5599955956_202603191023.csv',
        content: [
          '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
          '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
        ].join('\n'),
        uploadedAt: '2026-03-20T09:00:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-rb-owned-fio-shape',
        requestedAt: '2026-03-20T09:00:30.000Z'
      },
      reportGeneratedAt: '2026-03-20T09:01:00.000Z'
    })

    expect(result.extractedRecords[0]?.data.bankParserVariant).toBe('fio')
    expect(result.extractedRecords[0]?.data.accountId).toBe('5599955956/5500')
  })

  it('keeps account attribution separate from parser selection when a Fio-owned file uses the Datum/Objem/Měna/Protiúčet export shape', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
        content: [
          '\uFEFF"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
          '19.03.2026 06:23;1250,00;CZK;5500/1234;5500;PAYOUT-BOOK-20260310;Booking BV;Příchozí platba'
        ].join('\n'),
        uploadedAt: '2026-03-20T09:02:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-fio-owned-rb-shape',
        requestedAt: '2026-03-20T09:02:30.000Z'
      },
      reportGeneratedAt: '2026-03-20T09:03:00.000Z'
    })

    expect(result.extractedRecords[0]?.data.bankParserVariant).toBe('raiffeisenbank')
    expect(result.extractedRecords[0]?.data.accountId).toBe('8888997777')
  })

  it('runs the two current bank file shapes through the shared path without swapped parser routing', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Pohyby_5599955956_202603191023.csv',
        content: [
          '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
          '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
        ].join('\n'),
        uploadedAt: '2026-03-19T21:10:00.000Z'
      },
      {
        name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
        content: [
          '\uFEFF"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
          '"19.03.2026 06:23";"1 540,00";"CZK";"1234567890";"2010";"PAYOUT-BOOK-20260310";"Booking BV";"Příchozí platba"'
        ].join('\n'),
        uploadedAt: '2026-03-19T21:11:00.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-current-bank-shapes-content-first',
        requestedAt: '2026-03-19T21:11:30.000Z'
      },
      reportGeneratedAt: '2026-03-19T21:12:00.000Z'
    })

    expect(result.files.map((file) => file.extractedCount)).toEqual([1, 1])
    expect(result.extractedRecords.map((record) => record.id)).toEqual(['fio-row-1', 'raif-row-1'])
    expect(result.extractedRecords.map((record) => record.data.bankParserVariant)).toEqual(['fio', 'raiffeisenbank'])
    expect(result.extractedRecords[0]?.data.counterparty).toBe('Comgate a.s.')
    expect(result.extractedRecords[1]?.data.counterparty).toBe('1234567890/2010')
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

  it('classifies the real JOKELAND client-portal Comgate filename as comgate without changing bank routing', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Klientský portál export transakcí JOKELAND s.r.o..csv',
        content: [
          'paidAt,amountMinor,currency,reference,paymentPurpose,reservationId',
          '2026-03-19,154000,CZK,CG-WEB-2001,website-reservation,WEB-2001'
        ].join('\n'),
        uploadedAt: '2026-03-21T18:00:00.000Z'
      }
    ])

    expect(prepared[0]?.sourceDocument.sourceSystem).toBe('comgate')
    expect(prepared[0]?.sourceDocument.documentType).toBe('payment_gateway_report')
    expect(prepared[0]?.sourceDocument.fileName).toBe('Klientský portál export transakcí JOKELAND s.r.o..csv')
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
        content: fixture.rawInput.content,
        binaryContentBase64: fixture.rawInput.binaryContentBase64
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
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2', 'airbnb-payout-3', 'airbnb-payout-4'],
        extractedCount: 4
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
      airbnb.sourceDocument.id,
      airbnb.sourceDocument.id,
      airbnb.sourceDocument.id,
      expedia.sourceDocument.id,
      previo.sourceDocument.id
    ])
    expect(result.reconciliation.normalizedTransactions.map((transaction) => transaction.source)).toEqual([
      'airbnb',
      'airbnb',
      'airbnb',
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

  it('detects real-style Booking, Airbnb, and Comgate upload shapes from file content when filenames are opaque', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'Q3iygU5b0wLBneSGbooking10-20.csv',
        content: [
          'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
          'Reservation;RES-BOOK-8841;2026-03-08;2026-03-10;Jan Novak;OK;CZK;Paid;1250,00;12 Mar 2026;PAYOUT-BOOK-20260310'
        ].join('\n'),
        uploadedAt: '2026-03-20T12:00:00.000Z'
      },
      {
        name: 'airbnb_03_2026-03_2026.csv',
        content: [
          'Datum převodu;Částka převodu;Měna;Transfer ID;Confirmation code;Listing name',
          '12.03.2026;980,00;CZK;AIRBNB-20260312;HMA4TR9;LISTING-CZ-11'
        ].join('\n'),
        uploadedAt: '2026-03-20T12:00:00.000Z'
      },
      {
        name: 'export.csv',
        content: [
          'Datum zaplacení;Uhrazená částka;Měna;Variabilní symbol;Štítek;Číslo objednávky',
          '15.03.2026;380,00;CZK;CG-RES-991;website-reservation;WEB-RES-991'
        ].join('\n'),
        uploadedAt: '2026-03-20T12:00:00.000Z'
      }
    ])

    expect(prepared.map((file) => file.sourceDocument.sourceSystem)).toEqual(['booking', 'airbnb', 'comgate'])
    expect(prepared.map((file) => file.sourceDocument.documentType)).toEqual(['ota_report', 'ota_report', 'payment_gateway_report'])
  })

  it('separates supported and unsupported uploaded files with deterministic routing metadata', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const invoice = getRealInputFixture('invoice-document')

    const prepared = prepareUploadedMonthlyBatchFiles([
      {
        name: 'opaque.csv',
        content: booking.rawInput.content,
        uploadedAt: '2026-03-24T08:00:00.000Z'
      },
      {
        name: invoice.sourceDocument.fileName,
        content: invoice.rawInput.content,
        uploadedAt: '2026-03-24T08:01:00.000Z'
      },
      {
        name: 'notes.csv',
        content: 'foo,bar\n1,2',
        uploadedAt: '2026-03-24T08:02:00.000Z'
      }
    ])

    expect(prepared.importedFiles.map((file) => file.sourceDocument.sourceSystem)).toEqual(['booking', 'invoice'])
    expect(prepared.importedFiles.map((file) => file.routing?.classificationBasis)).toEqual(['content', 'file-name'])
    expect(prepared.importedFiles.map((file) => file.routing?.parserId)).toEqual(['booking', 'invoice'])
    expect(prepared.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'opaque.csv',
        status: 'supported',
        sourceSystem: 'booking',
        documentType: 'ota_report',
        classificationBasis: 'content',
        parserId: 'booking'
      }),
      expect.objectContaining({
        fileName: invoice.sourceDocument.fileName,
        status: 'supported',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        classificationBasis: 'file-name',
        parserId: 'invoice'
      }),
      expect.objectContaining({
        fileName: 'notes.csv',
        status: 'unsupported',
        sourceSystem: 'unknown',
        documentType: 'other',
        classificationBasis: 'unknown',
        reason: 'Soubor se nepodařilo jednoznačně přiřadit k podporovanému měsíčnímu zdroji.'
      })
    ])
  })

  it('recognizes Booking payout statement PDFs by text content even when the filename is misspelled', () => {
    const prepared = prepareUploadedMonthlyBatchFiles([
      {
        name: 'Bookinng35k.pdf',
        content: buildBookingPayoutStatementVariantContent(),
        contentFormat: 'pdf-text',
        uploadedAt: '2026-03-24T08:05:00.000Z'
      }
    ])

    expect(prepared.importedFiles).toEqual([
      expect.objectContaining({
        sourceDocument: expect.objectContaining({
          fileName: 'Bookinng35k.pdf',
          sourceSystem: 'booking',
          documentType: 'payout_statement'
        }),
        routing: expect.objectContaining({
          classificationBasis: 'content',
          parserId: 'booking-payout-statement-pdf',
          role: 'supplemental'
        })
      })
    ])
    expect(prepared.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        parserId: 'booking-payout-statement-pdf',
        role: 'supplemental'
      })
    ])
  })

  it('adds a visible warning when the same supported upload content appears twice in one monthly run', () => {
    const booking = getRealInputFixture('booking-payout-export')

    const prepared = prepareUploadedMonthlyBatchFiles([
      {
        name: 'booking-one.csv',
        content: booking.rawInput.content,
        uploadedAt: '2026-03-24T08:10:00.000Z'
      },
      {
        name: 'booking-two.csv',
        content: booking.rawInput.content,
        uploadedAt: '2026-03-24T08:10:30.000Z'
      }
    ])

    expect(prepared.importedFiles).toHaveLength(2)
    expect(prepared.fileRoutes[0]?.warnings).toEqual([])
    expect(prepared.fileRoutes[1]?.warnings).toEqual([
      'Možný duplicitní upload stejného obsahu jako booking-one.csv.'
    ])
  })

  it('surfaces the real uploaded Airbnb to RB matching outcome in the shared monthly-batch path', () => {
    const prepared = prepareUploadedMonthlyFiles([
      {
        name: 'airbnb.csv',
        content: buildActualUploadedAirbnbContent(),
        uploadedAt: '2026-03-21T20:10:00.000Z'
      },
      {
        name: 'Pohyby_5599955956_202603191023.csv',
        content: buildActualUploadedRbCitiContent(),
        uploadedAt: '2026-03-21T20:10:30.000Z'
      }
    ])

    const result = runMonthlyReconciliationBatch({
      files: prepared,
      reconciliationContext: {
        runId: 'monthly-run-airbnb-rb-actual-upload-shape',
        requestedAt: '2026-03-21T20:11:00.000Z'
      },
      reportGeneratedAt: '2026-03-21T20:12:00.000Z'
    })

    expect(result.files).toEqual([
      {
        sourceDocumentId: 'uploaded:airbnb:1:airbnb-csv',
        extractedRecordIds: [
          'airbnb-payout-1',
          'airbnb-payout-2',
          'airbnb-payout-3',
          'airbnb-payout-4',
          'airbnb-payout-5',
          'airbnb-payout-6',
          'airbnb-payout-7',
          'airbnb-payout-8',
          'airbnb-payout-9',
          'airbnb-payout-10',
          'airbnb-payout-11',
          'airbnb-payout-12',
          'airbnb-payout-13',
          'airbnb-payout-14',
          'airbnb-payout-15',
          'airbnb-payout-16',
          'airbnb-payout-17'
        ],
        extractedCount: 17
      },
      {
        sourceDocumentId: 'uploaded:bank:2:pohyby-5599955956-202603191023-csv',
        extractedRecordIds: [
          'fio-row-1',
          'fio-row-2',
          'fio-row-3',
          'fio-row-4',
          'fio-row-5',
          'fio-row-6',
          'fio-row-7',
          'fio-row-8',
          'fio-row-9',
          'fio-row-10',
          'fio-row-11',
          'fio-row-12',
          'fio-row-13',
          'fio-row-14',
          'fio-row-15',
          'fio-row-16'
        ],
        extractedCount: 16
      }
    ])

    expect(result.report.summary.payoutBatchMatchCount).toBe(15)
    expect(result.report.summary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.report.matches).toHaveLength(15)
    expect(result.report.unmatchedPayoutBatches.map((item) => item.payoutReference)).toEqual([
      'G-IZLCELA7C5EFN',
      'G-6G5WFOJO5DJCI'
    ])
    expect(result.report.unmatchedPayoutBatches.map((item) => item.reason)).toEqual([
      'Žádná bankovní položka se stejnou částkou.',
      'Žádná bankovní položka se stejnou částkou.'
    ])
  })

  it('keeps every uploaded file in an explicit intake outcome and does not disturb Airbnb payout counts when a Booking PDF supplement is added', () => {
    const bookingPdf = getRealInputFixture('booking-payout-statement-pdf')

    const result = ingestUploadedMonthlyFiles({
      files: [
        {
          name: 'airbnb.csv',
          content: buildActualUploadedAirbnbContent(),
          uploadedAt: '2026-03-24T11:00:00.000Z'
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: buildActualUploadedRbCitiContent(),
          uploadedAt: '2026-03-24T11:00:30.000Z'
        },
        {
          name: bookingPdf.sourceDocument.fileName,
          content: bookingPdf.rawInput.content,
          binaryContentBase64: bookingPdf.rawInput.binaryContentBase64,
          contentFormat: 'pdf-text',
          uploadedAt: '2026-03-24T11:01:00.000Z'
        },
        {
          name: 'booking-payout-broken.pdf',
          content: '',
          contentFormat: 'pdf-text',
          ingestError: 'PDF soubor booking-payout-broken.pdf neobsahuje deterministicky čitelnou textovou vrstvu.',
          uploadedAt: '2026-03-24T11:01:30.000Z'
        }
      ],
      reconciliationContext: {
        runId: 'monthly-run-airbnb-plus-booking-pdf-intake',
        requestedAt: '2026-03-24T11:02:00.000Z'
      },
      reportGeneratedAt: '2026-03-24T11:03:00.000Z'
    })

    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'airbnb',
        documentType: 'ota_report',
        role: 'primary',
        extractedCount: 17
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'bank',
        documentType: 'bank_statement',
        role: 'primary',
        extractedCount: 16
      }),
      expect.objectContaining({
        fileName: 'booking-payout-statement-2026-03.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        role: 'supplemental',
        parserId: 'booking-payout-statement-pdf',
        extractedCount: 1,
        extractedRecordIds: ['booking-payout-statement-1']
      }),
      expect.objectContaining({
        fileName: 'booking-payout-broken.pdf',
        status: 'error',
        intakeStatus: 'error',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        role: 'supplemental',
        errorMessage: 'PDF soubor booking-payout-broken.pdf neobsahuje deterministicky čitelnou textovou vrstvu.'
      })
    ])
    expect(result.importedFiles.map((file) => file.sourceDocument.fileName)).toEqual([
      'airbnb.csv',
      'Pohyby_5599955956_202603191023.csv',
      'booking-payout-statement-2026-03.pdf'
    ])
    expect(result.batch.report.summary.payoutBatchMatchCount).toBe(15)
    expect(result.batch.report.summary.unmatchedPayoutBatchCount).toBe(2)
  })

  it('merges Booking payout PDF supplement metadata into the Booking payout batch without changing its batch key', () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const result = ingestUploadedMonthlyFiles({
      files: [
        {
          name: 'AaOS6MOZUh8BFtEr.booking.csv',
          content: booking.rawInput.content,
          uploadedAt: '2026-03-24T11:15:00.000Z'
        },
        {
          name: 'Bookinng35k.pdf',
          content: buildBookingPayoutStatementVariantContent(),
          contentFormat: 'pdf-text',
          uploadedAt: '2026-03-24T11:15:30.000Z'
        }
      ],
      reconciliationContext: {
        runId: 'monthly-run-booking-pdf-supplement',
        requestedAt: '2026-03-24T11:16:00.000Z'
      },
      reportGeneratedAt: '2026-03-24T11:17:00.000Z'
    })

    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'AaOS6MOZUh8BFtEr.booking.csv',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'ota_report',
        role: 'primary',
        extractedCount: 1
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        role: 'supplemental',
        classificationBasis: 'content',
        parserId: 'booking-payout-statement-pdf',
        extractedCount: 1
      })
    ])
    expect(result.batch.reconciliation.workflowPlan?.payoutBatches).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        payoutReference: 'PAYOUT-BOOK-20260310',
        payoutSupplementPaymentId: 'PAYOUT-BOOK-20260310',
        payoutSupplementIbanSuffix: '5956',
        payoutSupplementReservationIds: ['RES-BOOK-8841'],
        payoutSupplementSourceDocumentIds: ['uploaded:booking:2:bookinng35k-pdf']
      })
    ])
    expect(result.batch.report.summary.payoutBatchMatchCount).toBe(0)
    expect(result.batch.report.summary.unmatchedPayoutBatchCount).toBe(1)
    expect(result.batch.report.unmatchedPayoutBatches).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        display: {
          title: 'Booking payout PAYOUT-BOOK-20260310 / 1 250,00 Kč',
          context: 'Datum payoutu: 2026-03-12 · IBAN 5956 · rezervace: 1'
        }
      })
    ])
  })
})

function buildActualUploadedAirbnbContent(): string {
  return [
    'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-OC3WJE3SIXRO5;;CZK;;3 961,05;0,00;3 961,05',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 2;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-DXVK4YVI7MJVL;;CZK;;4 456,97;0,00;4 456,97',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 3;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-ZD5RVTGOHW3GE;;CZK;;7 059,94;0,00;7 059,94',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 4;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-ZWNWMP6UYWNI7;;CZK;;15 701,41;0,00;15 701,41',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 5;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-WLT46RY3MOZIF;;CZK;;1 112,59;0,00;1 112,59',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 6;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-L4RVQL6SE24XJ;;CZK;;1 152,81;0,00;1 152,81',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 7;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-TGCGGWASBTWWW;;CZK;;970,36;0,00;970,36',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 8;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-TKC6CS3OTDMGN;;CZK;;9 785,73;0,00;9 785,73',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 9;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-2F2LZZKYTRZ6E;;CZK;;3 518,94;0,00;3 518,94',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 10;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-MUEMMKRWRPQNQ;;CZK;;12 123,52;0,00;12 123,52',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 11;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-RFF4BW3JFXE6T;;CZK;;2 248,17;0,00;2 248,17',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 12;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-EPATNPP5RBQDW;;CZK;;2 492,32;0,00;2 492,32',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 13;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-JWVQXQVW6DET3;;CZK;;18 912,42;0,00;18 912,42',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 14;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-FE2CKQSBT6E7N;;CZK;;9 771,27;0,00;9 771,27',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 15;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-OLIOSSDGKKF3X;;CZK;;1 475,08;0,00;1 475,08',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 16;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-IZLCELA7C5EFN;;CZK;;8 241,96;0,00;8 241,96',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 17;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-6G5WFOJO5DJCI;;CZK;;1 117,01;0,00;1 117,01'
  ].join('\n')
}

function buildBookingPayoutStatementVariantContent(): string {
  return [
    'Booking.com',
    'Payout summary',
    'Payment',
    'ID',
    'PAYOUT-BOOK-20260310',
    'Payment',
    'date',
    '2026-03-12',
    'Transfer',
    'total',
    '1 250,00 CZK',
    'IBAN',
    'CZ65 5500 0000 0000 5599 555956',
    'Included',
    'reservations',
    'RES-BOOK-8841 1 250,00 CZK'
  ].join('\n')
}

function buildActualUploadedRbCitiContent(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '15.03.2026 06:20;15.03.2026 06:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;3961,05;CZK;G-OC3WJE3SIXRO5',
    '15.03.2026 06:21;15.03.2026 06:24;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;4456,97;CZK;G-DXVK4YVI7MJVL',
    '15.03.2026 06:22;15.03.2026 06:25;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;7059,94;CZK;G-ZD5RVTGOHW3GE',
    '15.03.2026 06:23;15.03.2026 06:26;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;15701,41;CZK;G-ZWNWMP6UYWNI7',
    '15.03.2026 06:24;15.03.2026 06:27;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;1112,59;CZK;G-WLT46RY3MOZIF',
    '15.03.2026 06:25;15.03.2026 06:28;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;1152,81;CZK;G-L4RVQL6SE24XJ',
    '15.03.2026 06:26;15.03.2026 06:29;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;970,36;CZK;G-TGCGGWASBTWWW',
    '15.03.2026 06:27;15.03.2026 06:30;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;9785,73;CZK;G-TKC6CS3OTDMGN',
    '15.03.2026 06:28;15.03.2026 06:31;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;3518,94;CZK;G-2F2LZZKYTRZ6E',
    '15.03.2026 06:29;15.03.2026 06:32;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;12123,52;CZK;G-MUEMMKRWRPQNQ',
    '15.03.2026 06:30;15.03.2026 06:33;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;2248,17;CZK;G-RFF4BW3JFXE6T',
    '15.03.2026 06:31;15.03.2026 06:34;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;2492,32;CZK;G-EPATNPP5RBQDW',
    '15.03.2026 06:32;15.03.2026 06:35;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;18912,42;CZK;G-JWVQXQVW6DET3',
    '15.03.2026 06:33;15.03.2026 06:36;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;9771,27;CZK;G-FE2CKQSBT6E7N',
    '15.03.2026 06:34;15.03.2026 06:37;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;1475,08;CZK;G-OLIOSSDGKKF3X',
    '15.03.2026 06:35;15.03.2026 06:38;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;555,55;CZK;NON-MATCHING-CITIBANK-ROW'
  ].join('\n')
}
