import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { runMonthlyReconciliationBatch } from '../../src/monthly-batch'
import {
  buildBrowserRuntimeStateFromSelectedFiles,
  createBrowserRuntime,
  buildBrowserRuntimeUploadState,
  prepareBrowserRuntimeUploadedFilesFromSelectedFiles,
  buildBrowserUploadedMonthlyRun,
  buildBrowserExportPackage,
  buildBrowserReviewScreen,
  buildUploadedMonthlyRun,
  buildUploadedBatchPreview,
  buildUploadWebFlow
} from '../../src/upload-web'

describe('buildUploadWebFlow', () => {
  it('renders a browser-visible local upload flow with practical Czech copy', () => {
    const result = buildUploadWebFlow({
      generatedAt: '2026-03-18T20:30:00.000Z'
    })

    expect(result.html).toContain('<!doctype html>')
    expect(result.html).toContain('Hotel Finance Control – nahrání měsíčních souborů')
    expect(result.html).toContain('Připravit soubory ke zpracování')
    expect(result.html).toContain('monthly-batch')
    expect(result.html).toContain('Zatím nebyly vybrány žádné soubory.')
    expect(result.html).toContain('Pracovní postup operátora')
    expect(result.html).toContain('Měsíční workflow čeká na skutečně vybrané soubory')
    expect(result.html).toContain('window.__hotelFinanceCreateBrowserRuntime')
  })

  it('builds a runtime browser upload state from real selected files through the shared monthly flow', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const invoice = getRealInputFixture('invoice-document')

    const result = buildBrowserRuntimeUploadState({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-19T10:00:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-19T10:00:00.000Z'
        },
        {
          name: invoice.sourceDocument.fileName,
          content: invoice.rawInput.content,
          uploadedAt: '2026-03-19T10:00:00.000Z'
        }
      ],
      runId: 'runtime-browser-upload',
      generatedAt: '2026-03-19T10:00:00.000Z'
    })

    expect(result.preparedFiles).toHaveLength(3)
    expect(result.preparedFiles[0]).toMatchObject({
      fileName: 'booking-payout-2026-03.csv',
      sourceSystem: 'booking',
      documentType: 'ota_report',
      classificationBasis: 'content',
      warnings: []
    })
    expect(result.routingSummary).toEqual({
      uploadedFileCount: 3,
      supportedFileCount: 3,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'booking-payout-2026-03.csv',
        status: 'supported',
        sourceSystem: 'booking',
        classificationBasis: 'content',
        parserId: 'booking'
      }),
      expect.objectContaining({
        fileName: 'raiffeisen-2026-03.csv',
        status: 'supported',
        sourceSystem: 'bank',
        classificationBasis: 'content'
      }),
      expect.objectContaining({
        fileName: 'invoice-2026-332.txt',
        status: 'supported',
        sourceSystem: 'invoice',
        classificationBasis: 'file-name',
        parserId: 'invoice'
      })
    ])
    expect(result.monthLabel).toBe('neuvedeno')
    expect(result.extractedRecords.some((file) => file.extractedCount > 0)).toBe(true)
    expect(result.reportSummary.matchedGroupCount).toBeGreaterThan(0)
    expect(result.reportTransactions.length).toBeGreaterThan(0)
    expect(result.reviewSections.matched.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.workflowPayoutReferences.length).toBeGreaterThanOrEqual(0)
    expect(result.supportedExpenseLinks.length).toBeGreaterThanOrEqual(0)
    expect(result.exportFiles.map((file) => file.fileName)).toEqual([
      'reconciliation-transactions.csv',
      'review-items.csv',
      'monthly-review-export.xlsx'
    ])
  })

  it('exposes real upstream Airbnb payout audit layers in the browser runtime state for uploaded files', () => {
    const airbnb = getRealInputFixture('airbnb-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const result = buildBrowserRuntimeUploadState({
      files: [
        {
          name: 'airbnb.csv',
          content: airbnb.rawInput.content,
          uploadedAt: '2026-03-23T12:30:00.000Z'
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-23T12:30:00.000Z'
        }
      ],
      runId: 'browser-runtime-upload-2026-03',
      generatedAt: '2026-03-23T12:30:00.000Z'
    })

    expect(result.reviewSections.payoutBatchMatched.length + result.reviewSections.payoutBatchUnmatched.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.extractedAirbnbPayoutRowRefs.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.extractedAirbnbRawReferences.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.extractedAirbnbDataReferences.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.extractedAirbnbReferenceCodes.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.extractedAirbnbPayoutReferences.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.workflowPayoutBatchKeys.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.workflowPayoutReferences.length).toBeGreaterThan(0)
    expect(
      result.runtimeAudit.payoutDiagnostics.reportMatchedPayoutReferences.length
      + result.runtimeAudit.payoutDiagnostics.reportUnmatchedPayoutReferences.length
    ).toBeGreaterThan(0)
    expect(
      result.runtimeAudit.payoutDiagnostics.runtimeMatchedTitleSourceValues.length
      + result.runtimeAudit.payoutDiagnostics.runtimeUnmatchedTitleSourceValues.length
    ).toBeGreaterThan(0)
  })

  it('renders the upload page without baked-in runtime results and with selected-file-driven adapter logic', () => {
    const result = buildUploadWebFlow({
      generatedAt: '2026-03-19T10:15:00.000Z'
    })

    expect(result.html).toContain('Pracovní postup operátora')
    expect(result.html).toContain('skutečně vybrané soubory')
    expect(result.html).toContain('Po kliknutí na tlačítko se ke sdílenému běhu použijí právě tyto skutečně vybrané soubory.')
    expect(result.html).toContain('uploadedAt')
    expect(result.html).toContain('typeof window.__hotelFinanceCreateBrowserRuntime === \'function\'')
    expect(result.html).toContain('buildBrowserRuntimeState')
    expect(result.html).not.toContain('Promise.resolve(null)')
    expect(result.html).not.toContain('findDataset(files)')
    expect(result.html).not.toContain('contentFingerprint')
  })

  it('creates a real structured runtime state through the shared runtime builder', async () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(booking.sourceDocument.fileName, booking.rawInput.content),
        createRuntimeFile(raiffeisen.sourceDocument.fileName, raiffeisen.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-19T10:00:00.000Z'
    })

    expect(result.preparedFiles.length).toBe(2)
    expect(result.extractedRecords.length).toBe(2)
    expect(result.reviewSummary).toBeDefined()
    expect(result.reviewSections).toBeDefined()
    expect(result.reportSummary).toBeDefined()
    expect(result.reportTransactions).toBeDefined()
    expect(result.exportFiles.length).toBeGreaterThan(0)
    expect(result.supportedExpenseLinks).toBeDefined()
  })

  it('recomputes browser runtime results from selected files through the shared pipeline', async () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const invoice = getRealInputFixture('invoice-document')

    const runtime = createBrowserRuntime()

    const baseline = await runtime.buildRuntimeState({
      files: [
        createRuntimeFile(booking.sourceDocument.fileName, booking.rawInput.content),
        createRuntimeFile(raiffeisen.sourceDocument.fileName, raiffeisen.rawInput.content),
        createRuntimeFile(invoice.sourceDocument.fileName, invoice.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-19T10:00:00.000Z'
    })

    const changed = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeFile(booking.sourceDocument.fileName, booking.rawInput.content.replace('PAYOUT-BOOK-20260310', 'PAYOUT-BOOK-20260399')),
        createRuntimeFile(raiffeisen.sourceDocument.fileName, raiffeisen.rawInput.content),
        createRuntimeFile(invoice.sourceDocument.fileName, invoice.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-19T10:00:00.000Z'
    })

    expect(baseline.reportSummary.matchedGroupCount).toBeGreaterThan(0)
    expect(changed.reportSummary.matchedGroupCount).toBe(baseline.reportSummary.matchedGroupCount)
    expect(changed.preparedFiles[0].sourceDocumentId).toBe(baseline.preparedFiles[0].sourceDocumentId)
    expect(changed.reviewSections.matched[0]?.detail).not.toBe(baseline.reviewSections.matched[0]?.detail)
    expect(changed.exportFiles).toEqual(baseline.exportFiles)
  })

  it('does not depend on fixture lookup strings in the browser runtime API', async () => {
    const booking = getRealInputFixture('booking-payout-export')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [createRuntimeFile('booking-custom-name.csv', booking.rawInput.content)],
      month: '2026-03',
      generatedAt: '2026-03-19T10:00:00.000Z'
    })

    expect(result.preparedFiles[0].fileName).toBe('booking-custom-name.csv')
    expect(result.preparedFiles[0].sourceSystem).toBe('booking')
    expect(result.extractedRecords[0].extractedCount).toBeGreaterThan(0)
  })

  it('builds browser runtime state from a real uploaded Previo reservation workbook and exposes reservation-source processing truthfully', async () => {
    const previo = getRealInputFixture('previo-reservation-export')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [createRuntimeWorkbookFile('Prehled_rezervaci.xlsx', previo.rawInput.binaryContentBase64!)],
      month: '2026-03',
      generatedAt: '2026-03-21T09:05:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'Prehled_rezervaci.xlsx',
        sourceSystem: 'previo',
        documentType: 'reservation_export'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        extractedCount: 1,
        accountLabelCs: 'Previo rezervační export'
      })
    ])
  })

  it('routes the real JOKELAND client-portal CSV through the Comgate browser-upload path instead of failing as unsupported', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'Klientský portál export transakcí JOKELAND s.r.o..csv',
          [
            'paidAt,amountMinor,currency,reference,paymentPurpose,reservationId',
            '2026-03-19,154000,CZK,CG-WEB-2001,website-reservation,WEB-2001',
            '2026-03-19,4000,CZK,CG-PARK-2001,parking,PARK-2001'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T18:00:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'Klientský portál export transakcí JOKELAND s.r.o..csv',
        sourceSystem: 'comgate',
        documentType: 'payment_gateway_report'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        extractedCount: 2,
        accountLabelCs: 'Comgate platební report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(2)
    expect(result.reportTransactions).toHaveLength(2)
  })

  it('keeps the real Airbnb plus bank payout outcome stable when extra monthly files are added and surfaces unsupported files safely', async () => {
    const invoice = getRealInputFixture('invoice-document')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimeFile(invoice.sourceDocument.fileName, invoice.rawInput.content),
        createRuntimeFile('notes.csv', 'foo,bar\n1,2')
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T10:00:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 3,
      unsupportedFileCount: 1,
      errorFileCount: 0
    })
    expect(result.preparedFiles.map((file) => file.fileName)).toEqual([
      'airbnb.csv',
      'Pohyby_5599955956_202603191023.csv',
      'invoice-2026-332.txt'
    ])
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        sourceSystem: 'airbnb',
        classificationBasis: 'content',
        parserId: 'airbnb'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        status: 'supported',
        sourceSystem: 'bank',
        classificationBasis: 'content'
      }),
      expect.objectContaining({
        fileName: 'invoice-2026-332.txt',
        status: 'supported',
        sourceSystem: 'invoice',
        classificationBasis: 'file-name',
        parserId: 'invoice'
      }),
      expect.objectContaining({
        fileName: 'notes.csv',
        status: 'unsupported',
        sourceSystem: 'unknown',
        classificationBasis: 'unknown',
        reason: 'Soubor se nepodařilo jednoznačně přiřadit k podporovanému měsíčnímu zdroji.'
      })
    ])
    expect(result.extractedRecords.map((file) => ({ fileName: file.fileName, extractedCount: file.extractedCount }))).toEqual([
      { fileName: 'airbnb.csv', extractedCount: 17 },
      { fileName: 'Pohyby_5599955956_202603191023.csv', extractedCount: 16 },
      { fileName: 'invoice-2026-332.txt', extractedCount: 1 }
    ])
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(15)
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(2)
  })

  it('keeps the real browser workbook upload path free of Buffer so XLSX ingestion stays browser-safe', async () => {
    const previo = getRealInputFixture('previo-reservation-export')
    const globalWithBuffer = globalThis as typeof globalThis & { Buffer?: unknown }
    const originalBuffer = globalWithBuffer.Buffer

    try {
      delete (globalWithBuffer as { Buffer?: unknown }).Buffer

      const result = await buildBrowserRuntimeStateFromSelectedFiles({
        files: [createRuntimeWorkbookFile('Prehled_rezervaci.xlsx', previo.rawInput.binaryContentBase64!)],
        month: '2026-03',
        generatedAt: '2026-03-21T09:06:00.000Z'
      })

      expect(result.preparedFiles[0]).toMatchObject({
        fileName: 'Prehled_rezervaci.xlsx',
        sourceSystem: 'previo'
      })
      expect(result.extractedRecords[0]?.extractedCount).toBe(1)
    } finally {
      globalWithBuffer.Buffer = originalBuffer
    }
  })

  it('completes the exact combined browser-only monthly run for the current two bank files and Booking file in one session', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        ),
        createRuntimeFile(
          'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
          [
            '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
            '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
          ].join('\n')
        ),
        createRuntimeFile('AaOS6MOZUh8BFtEr.booking.csv', booking.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-20T11:35:00.000Z'
    })

    expect(result.preparedFiles).toHaveLength(3)
    expect(result.preparedFiles.map((file: (typeof result.preparedFiles)[number]) => file.sourceSystem)).toEqual(['bank', 'bank', 'booking'])
    expect(result.preparedFiles.map((file: (typeof result.preparedFiles)[number]) => file.fileName)).toEqual([
      'Pohyby_5599955956_202603191023.csv',
      'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
      'AaOS6MOZUh8BFtEr.booking.csv'
    ])
    expect(result.extractedRecords.map((file: (typeof result.extractedRecords)[number]) => file.accountLabelCs)).toEqual([
      'RB účet 5599955956/5500',
      'Fio účet 8888997777/2010',
      'Booking payout report'
    ])
    expect(result.extractedRecords.map((file: (typeof result.extractedRecords)[number]) => file.parserDebugLabel)).toEqual(['fio', 'fio', undefined])
    expect(result.reviewSummary.normalizedTransactionCount).toBeGreaterThan(0)
    expect(result.reviewSections.matched.length + result.reviewSections.unmatched.length + result.reviewSections.suspicious.length + result.reviewSections.missingDocuments.length).toBeGreaterThan(0)
    expect(result.reportSummary.normalizedTransactionCount).toBeGreaterThan(0)
    expect(result.reportTransactions.length).toBeGreaterThan(0)
    expect(result.exportFiles.map((file: (typeof result.exportFiles)[number]) => file.fileName)).toEqual([
      'reconciliation-transactions.csv',
      'review-items.csv',
      'monthly-review-export.xlsx'
    ])
  })

  it('audits the exact real 3-file browser-run and proves payoutBatchMatches stay zero because no bank inflow has the Booking batch amount', () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const batch = runMonthlyReconciliationBatch({
      files: [
        {
          sourceDocument: {
            id: 'uploaded:bank:1:pohyby-5599955956-202603191023-csv' as never,
            sourceSystem: 'bank',
            documentType: 'bank_statement',
            fileName: 'Pohyby_5599955956_202603191023.csv',
            uploadedAt: '2026-03-20T11:35:00.000Z'
          },
          content: [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        },
        {
          sourceDocument: {
            id: 'uploaded:bank:2:pohyby-na-uctu-8888997777-20260301-20260319-csv' as never,
            sourceSystem: 'bank',
            documentType: 'bank_statement',
            fileName: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
            uploadedAt: '2026-03-20T11:35:00.000Z'
          },
          content: [
            '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
            '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
          ].join('\n')
        },
        {
          sourceDocument: booking.sourceDocument,
          content: booking.rawInput.content
        }
      ],
      reconciliationContext: {
        runId: 'audit-browser-real-3-file-run',
        requestedAt: '2026-03-20T11:35:00.000Z'
      },
      reportGeneratedAt: '2026-03-20T11:35:00.000Z'
    })

    expect(batch.reconciliation.workflowPlan?.payoutBatches).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        payoutReference: 'PAYOUT-BOOK-20260310',
        expectedTotalMinor: 125000,
        currency: 'CZK',
        payoutDate: '2026-03-12'
      })
    ])

    const inboundBankTransactions = batch.reconciliation.normalizedTransactions
      .filter((transaction) => transaction.source === 'bank' && transaction.direction === 'in')
      .map((transaction) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        bookedAt: transaction.bookedAt,
        reference: transaction.reference
      }))

    expect(inboundBankTransactions).toEqual([
      {
        id: 'txn:bank:fio-row-1',
        accountId: '5599955956/5500',
        amountMinor: 154000,
        currency: 'CZK',
        bookedAt: '2026-03-19T06:23:00',
        reference: 'Platba rezervace WEB-2001'
      },
      {
        id: 'txn:bank:fio-row-1',
        accountId: '8888997777/2010',
        amountMinor: 154000,
        currency: 'CZK',
        bookedAt: '2026-03-19T06:23:00',
        reference: 'Platba rezervace WEB-2001'
      }
    ])

    expect(batch.reconciliation.payoutBatchMatches).toEqual([])
    expect(batch.reconciliation.payoutBatchNoMatchDiagnostics).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        payoutReference: 'PAYOUT-BOOK-20260310',
        expectedTotalMinor: 125000,
        currency: 'CZK',
        payoutDate: '2026-03-12',
        noMatchReason: 'noExactAmount',
        matched: false,
        eligibleCandidates: []
      })
    ])
    expect(batch.report.unmatchedPayoutBatches).toEqual([
      expect.objectContaining({
        platform: 'Booking',
        payoutReference: 'PAYOUT-BOOK-20260310',
        payoutDate: '2026-03-12',
        bankRoutingLabel: 'RB účet',
        amountMinor: 125000,
        currency: 'CZK',
        status: 'unmatched',
        reason: 'Žádná bankovní položka se stejnou částkou.'
      })
    ])
    expect(batch.reconciliation.payoutBatchNoMatchDiagnostics?.[0]?.allInboundBankCandidates).toEqual([
      expect.objectContaining({
        bankTransactionId: 'txn:bank:fio-row-1',
        bankAccountId: '5599955956/5500',
        amountMinor: 154000,
        currency: 'CZK',
        bookedAt: '2026-03-19T06:23:00',
        eligible: false,
        dateDistanceDays: 7,
        reference: 'Platba rezervace WEB-2001',
        rejectionReasons: ['noExactAmount', 'dateToleranceMiss']
      }),
      expect.objectContaining({
        bankTransactionId: 'txn:bank:fio-row-1',
        bankAccountId: '8888997777/2010',
        amountMinor: 154000,
        currency: 'CZK',
        bookedAt: '2026-03-19T06:23:00',
        eligible: false,
        dateDistanceDays: 7,
        reference: 'Platba rezervace WEB-2001',
        rejectionReasons: ['noExactAmount', 'wrongBankRouting', 'dateToleranceMiss']
      })
    ])
  })

  it('audits the exact mixed 4-file browser run truthfully and proves whether zero visible matches is data-correct or only a projection gap', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const previo = getRealInputFixture('previo-reservation-export')

    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('Prehled_rezervaci.xlsx', previo.rawInput.binaryContentBase64!),
        createRuntimeFile('AaOS6MOZUh8BFtEr.booking.csv', booking.rawInput.content),
        createRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        ),
        createRuntimeFile(
          'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
          [
            '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
            '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T16:00:00.000Z'
    })

    const batch = runMonthlyReconciliationBatch({
      files: [
        {
          sourceDocument: {
            id: 'uploaded:previo:1:prehled-rezervaci-xlsx' as never,
            sourceSystem: 'previo',
            documentType: 'reservation_export',
            fileName: 'Prehled_rezervaci.xlsx',
            uploadedAt: '2026-03-21T16:00:00.000Z'
          },
          content: previo.rawInput.content,
          binaryContentBase64: previo.rawInput.binaryContentBase64
        },
        {
          sourceDocument: booking.sourceDocument,
          content: booking.rawInput.content
        },
        {
          sourceDocument: {
            id: 'uploaded:bank:3:pohyby-5599955956-202603191023-csv' as never,
            sourceSystem: 'bank',
            documentType: 'bank_statement',
            fileName: 'Pohyby_5599955956_202603191023.csv',
            uploadedAt: '2026-03-21T16:00:00.000Z'
          },
          content: [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        },
        {
          sourceDocument: {
            id: 'uploaded:bank:4:pohyby-na-uctu-8888997777-20260301-20260319-csv' as never,
            sourceSystem: 'bank',
            documentType: 'bank_statement',
            fileName: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
            uploadedAt: '2026-03-21T16:00:00.000Z'
          },
          content: [
            '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
            '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
          ].join('\n')
        }
      ],
      reconciliationContext: {
        runId: 'audit-browser-real-4-file-run',
        requestedAt: '2026-03-21T16:00:00.000Z'
      },
      reportGeneratedAt: '2026-03-21T16:00:00.000Z'
    })

    expect(state.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'Prehled_rezervaci.xlsx',
        extractedCount: 1,
        extractedRecordIds: ['previo-reservation-1'],
        accountLabelCs: 'Previo rezervační export'
      }),
      expect.objectContaining({
        fileName: 'AaOS6MOZUh8BFtEr.booking.csv',
        extractedCount: 1,
        extractedRecordIds: ['booking-payout-1'],
        accountLabelCs: 'Booking payout report'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        extractedCount: 1,
        extractedRecordIds: ['fio-row-1'],
        accountLabelCs: 'RB účet 5599955956/5500',
        parserDebugLabel: 'fio'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
        extractedCount: 1,
        extractedRecordIds: ['fio-row-1'],
        accountLabelCs: 'Fio účet 8888997777/2010',
        parserDebugLabel: 'fio'
      })
    ])
    expect(batch.files).toEqual([
      expect.objectContaining({
        sourceDocumentId: 'uploaded:previo:1:prehled-rezervaci-xlsx',
        extractedCount: 1,
        extractedRecordIds: ['previo-reservation-1']
      }),
      expect.objectContaining({
        sourceDocumentId: 'doc-booking-browser-upload-shape-2026-03',
        extractedCount: 1,
        extractedRecordIds: ['booking-payout-1']
      }),
      expect.objectContaining({
        sourceDocumentId: 'uploaded:bank:3:pohyby-5599955956-202603191023-csv',
        extractedCount: 1,
        extractedRecordIds: ['fio-row-1']
      }),
      expect.objectContaining({
        sourceDocumentId: 'uploaded:bank:4:pohyby-na-uctu-8888997777-20260301-20260319-csv',
        extractedCount: 1,
        extractedRecordIds: ['fio-row-1']
      })
    ])
    expect(batch.extractedRecords).toHaveLength(4)
    expect(batch.extractedRecords.map((record) => record.recordType)).toEqual([
      'payout-line',
      'payout-line',
      'bank-transaction',
      'bank-transaction'
    ])
    expect(
      batch.extractedRecords.filter((record) => record.sourceDocumentId === 'uploaded:previo:1:prehled-rezervaci-xlsx')
    ).toEqual([
      expect.objectContaining({
        id: 'previo-reservation-1',
        recordType: 'payout-line',
        rawReference: 'PREVIO-20260314',
        data: expect.objectContaining({
          platform: 'previo',
          rowKind: 'accommodation'
        })
      })
    ])
    expect(batch.reconciliation.normalizedTransactions).toHaveLength(4)
    expect(batch.reconciliation.normalizedTransactions).toEqual([
      expect.objectContaining({
        id: 'txn:payout:previo-reservation-1',
        source: 'previo',
        direction: 'in'
      }),
      expect.objectContaining({
        id: 'txn:payout:booking-payout-1',
        source: 'booking',
        direction: 'in'
      }),
      expect.objectContaining({
        id: 'txn:bank:fio-row-1',
        source: 'bank',
        direction: 'in',
        accountId: '5599955956/5500'
      }),
      expect.objectContaining({
        id: 'txn:bank:fio-row-1',
        source: 'bank',
        direction: 'in',
        accountId: '8888997777/2010'
      })
    ])
    expect(batch.reconciliation.workflowPlan?.reservationSources.length).toBe(1)
    expect(batch.reconciliation.workflowPlan?.ancillaryRevenueSources.length).toBe(0)
    expect(batch.reconciliation.workflowPlan?.payoutRows).toEqual([
      expect.objectContaining({
        platform: 'booking',
        reservationId: 'RES-BOOK-8841',
        payoutReference: 'PAYOUT-BOOK-20260310',
        amountMinor: 125000,
        currency: 'CZK'
      })
    ])
    expect(batch.reconciliation.workflowPlan?.payoutBatches).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        platform: 'booking',
        payoutReference: 'PAYOUT-BOOK-20260310',
        expectedTotalMinor: 125000,
        currency: 'CZK'
      })
    ])
    expect(batch.reconciliation.workflowPlan?.directBankSettlements).toEqual([])
    expect(batch.reconciliation.workflowPlan?.reservationSettlementMatches).toEqual([])
    expect(batch.reconciliation.workflowPlan?.reservationSettlementNoMatches).toEqual([
      expect.objectContaining({
        reservationId: 'PREVIO-20260314',
        reference: 'PREVIO-20260314',
        noMatchReason: 'noCandidate',
        candidateCount: 0
      })
    ])
    expect(batch.reconciliation.payoutBatchMatches).toEqual([])
    expect(batch.report.unmatchedPayoutBatches).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        platform: 'Booking',
        payoutReference: 'PAYOUT-BOOK-20260310',
        status: 'unmatched',
        reason: 'Žádná bankovní položka se stejnou částkou.'
      })
    ])

    expect(state.reviewSections.matched).toEqual([])
    expect(state.reviewSections.unmatched.length).toBeGreaterThan(0)
    expect(batch.report.transactions).toHaveLength(4)
    expect(batch.report.transactions).toEqual([
      expect.objectContaining({ source: 'previo', status: 'exception' }),
      expect.objectContaining({ source: 'booking', status: 'exception' }),
      expect.objectContaining({ source: 'bank', status: 'exception' }),
      expect.objectContaining({ source: 'bank', status: 'exception' })
    ])
    expect(state.reportTransactions).toHaveLength(4)
    expect(state.reportTransactions).toEqual([
      expect.objectContaining({
        transactionId: expect.any(String),
        labelCs: expect.any(String),
        source: expect.any(String),
        amount: expect.any(String),
        status: expect.any(String)
      }),
      expect.objectContaining({
        transactionId: expect.any(String),
        labelCs: expect.any(String),
        source: expect.any(String),
        amount: expect.any(String),
        status: expect.any(String)
      }),
      expect.objectContaining({
        transactionId: expect.any(String),
        labelCs: expect.any(String),
        source: expect.any(String),
        amount: expect.any(String),
        status: expect.any(String)
      }),
      expect.objectContaining({
        transactionId: expect.any(String),
        labelCs: expect.any(String),
        source: expect.any(String),
        amount: expect.any(String),
        status: expect.any(String)
      })
    ])
    expect(state.reviewSections.matched).toHaveLength(0)
    expect(state.reviewSections.unmatchedReservationSettlements).toHaveLength(1)
    expect(state.reviewSections.unmatchedReservationSettlements[0]).toEqual(
      expect.objectContaining({
        title: 'Rezervace PREVIO-20260314',
        detail: expect.stringContaining('Chybí deterministická vazba na odpovídající úhradu.')
      })
    )
    expect(state.reviewSections.unmatchedReservationSettlements[0]?.detail).toContain('Kanál: Přímá rezervace.')
    expect(state.reviewSections.unmatchedReservationSettlements[0]?.detail).toContain('Pobyt: 2026-03-14 – 2026-03-16.')
    expect(state.reviewSections.unmatchedReservationSettlements[0]?.detail).toContain('Částka: 420,00 CZK.')
    expect(state.reviewSections.unmatched).toHaveLength(4)
    expect(state.reviewSections.suspicious).toHaveLength(0)
    expect(state.reviewSections.missingDocuments).toHaveLength(0)
    expect(state.reviewSections.payoutBatchMatched).toHaveLength(0)
    expect(state.reviewSections.payoutBatchUnmatched).toHaveLength(1)
    expect(state.reviewSections.payoutBatchUnmatched[0]).toEqual(
      expect.objectContaining({
        title: 'Booking payout dávka PAYOUT-BOOK-20260310',
        detail: expect.stringContaining('Žádná bankovní položka se stejnou částkou.')
      })
    )
    expect(state.reviewSections.unmatchedReservationSettlements[0]?.detail).not.toContain('noCandidate')
    expect(state.reportSummary.matchedGroupCount).toBe(batch.reconciliation.summary.matchedGroupCount)
    expect(batch.reconciliation.summary.matchedGroupCount).toBe(0)
    expect(batch.report.summary.unmatchedExpectedCount).toBe(1)
    expect(batch.report.summary.unmatchedActualCount).toBe(2)
    expect(batch.report.summary.payoutBatchMatchCount).toBe(0)
    expect(batch.report.summary.unmatchedPayoutBatchCount).toBe(1)
  })

  it('surfaces unmatched payout batches in browser runtime review sections without debug wording', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        ),
        createRuntimeFile('AaOS6MOZUh8BFtEr.booking.csv', booking.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-20T11:35:00.000Z'
    })

    expect(result.reportSummary.payoutBatchMatchCount).toBe(0)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(1)
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(1)
    expect(result.reviewSections.payoutBatchUnmatched[0]?.title).toBe('Booking payout dávka PAYOUT-BOOK-20260310')
    expect(result.reviewSections.payoutBatchUnmatched[0]?.detail).toContain('Žádná bankovní položka se stejnou částkou.')
    expect(result.reviewSections.payoutBatchUnmatched[0]?.detail).not.toContain('noExactAmount')
  })

  it('shows that the real upload-page runtime path carries unmatched payout batches in state and that the dedicated browser review html renders them', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const state = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        ),
        createRuntimeFile(
          'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
          [
            '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
            '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
          ].join('\n')
        ),
        createRuntimeFile('AaOS6MOZUh8BFtEr.booking.csv', booking.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-20T11:35:00.000Z'
    })

    expect(state.reviewSections.payoutBatchUnmatched).toHaveLength(1)
    expect(state.reviewSections.payoutBatchUnmatched[0]?.title).toBe('Booking payout dávka PAYOUT-BOOK-20260310')
    expect(state.reviewSections.payoutBatchUnmatched[0]?.detail).toContain('Žádná bankovní položka se stejnou částkou.')

    const uploadPage = buildUploadWebFlow({
      generatedAt: '2026-03-20T11:35:00.000Z'
    }).html

    expect(uploadPage).toContain('renderRuntimeReviewSection')
    expect(uploadPage).toContain('buildRuntimeState')
  })

  it('renders unmatched payout batches visibly in the main browser review html with business-facing wording', () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const outputDir = resolve(process.cwd(), 'dist/test-browser-review-unmatched-payout-batches')
    const outputPath = resolve(outputDir, 'index.html')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildBrowserReviewScreen({
      files: [
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n'),
          uploadedAt: '2026-03-20T11:35:00.000Z'
        },
        {
          name: 'AaOS6MOZUh8BFtEr.booking.csv',
          content: booking.rawInput.content,
          uploadedAt: '2026-03-20T11:35:00.000Z'
        }
      ],
      runId: 'browser-review-unmatched-payout-batches',
      generatedAt: '2026-03-20T11:35:00.000Z',
      outputPath
    })

    expect(result.preview.review.payoutBatchUnmatched).toHaveLength(1)
    expect(result.html).toContain('Nespárované payout dávky')
    expect(result.html).toContain('Booking payout dávka PAYOUT-BOOK-20260310')
    expect(result.html).toContain('Žádná bankovní položka se stejnou částkou.')
    expect(result.html).toContain('Směřování: RB účet.')
    expect(result.html).not.toContain('noExactAmount')
    expect(result.html).not.toContain('bankTransactionId')
    expect(result.html).not.toContain('parserDebugLabel')
  })

  it('renders unmatched reservation settlements visibly in the main browser review html with Czech business wording', () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const previo = getRealInputFixture('previo-reservation-export')
    const outputDir = resolve(process.cwd(), 'dist/test-browser-review-unmatched-reservations')
    const outputPath = resolve(outputDir, 'index.html')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildBrowserReviewScreen({
      files: [
        {
          name: 'Prehled_rezervaci.xlsx',
          content: previo.rawInput.content,
          binaryContentBase64: previo.rawInput.binaryContentBase64,
          uploadedAt: '2026-03-21T16:00:00.000Z'
        },
        {
          name: 'AaOS6MOZUh8BFtEr.booking.csv',
          content: booking.rawInput.content,
          uploadedAt: '2026-03-21T16:00:00.000Z'
        }
      ],
      runId: 'browser-review-unmatched-reservations',
      generatedAt: '2026-03-21T16:00:00.000Z',
      outputPath
    })

    expect(result.preview.review.unmatchedReservationSettlements).toHaveLength(1)
    expect(result.html).toContain('Nespárované rezervace k úhradě')
    expect(result.html).toContain('Rezervace PREVIO-20260314')
    expect(result.html).toContain('Chybí deterministická vazba na odpovídající úhradu.')
    expect(result.html).toContain('Kanál: Přímá rezervace.')
    expect(result.html).not.toContain('noCandidate')
  })

  it('carries additive business-facing reservation and ancillary settlement overviews in browser runtime state', async () => {
    const comgate = getRealInputFixture('comgate-export')
    const airbnb = getRealInputFixture('airbnb-payout-export')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(comgate.sourceDocument.fileName, comgate.rawInput.content),
        createRuntimeFile(airbnb.sourceDocument.fileName, airbnb.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-22T10:00:00.000Z'
    })

    expect(result.preparedFiles.map((file) => file.sourceSystem)).toEqual(['comgate', 'airbnb'])
    expect(result.extractedRecords.map((file) => file.accountLabelCs)).toEqual([
      'Comgate platební report',
      'Airbnb payout report'
    ])
    expect(result.reviewSections).toHaveProperty('reservationSettlementOverview')
    expect(result.reviewSections).toHaveProperty('ancillarySettlementOverview')
  })

  it('parses the grounded real Airbnb file on its own in browser runtime state and keeps reservation and transfer rows separate', async () => {
    const airbnb = getRealInputFixture('airbnb-payout-export')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [createRuntimeFile('airbnb_03_2026-03_2026.csv', airbnb.rawInput.content)],
      month: '2026-03',
      generatedAt: '2026-03-21T12:00:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb_03_2026-03_2026.csv',
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb_03_2026-03_2026.csv',
        extractedCount: 4,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2', 'airbnb-payout-3', 'airbnb-payout-4'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(4)
    expect(result.reportTransactions).toHaveLength(4)
  })

  it('parses the real Airbnb-only browser runtime path when the export uses slash-based US-style dates', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'airbnb.csv',
          [
            'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
            '03/20/2026;03/20/2026;Rezervace;03/18/2026;03/20/2026;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;-80,00;1 060,00',
            '03/20/2026;03/21/2026;Payout;03/18/2026;03/20/2026;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;0,00;980,00'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T13:05:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 2,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(2)
    expect(result.reportTransactions).toHaveLength(2)
  })

  it('parses the real Airbnb-only browser runtime path when payout rows carry the amount only in Vyplaceno', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [createRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content)],
      month: '2026-03',
      generatedAt: '2026-03-21T14:05:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 4,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2', 'airbnb-payout-3', 'airbnb-payout-4'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(4)
    expect(result.reportTransactions).toHaveLength(4)
    expect(result.reportTransactions.map((item) => item.amount)).toEqual(['1 060,00 Kč', '3 961,05 Kč', '4 456,97 Kč', '7 059,94 Kč'])
    expect(result.reportTransactions.map((item) => item.transactionId)).toEqual([
      'txn:payout:airbnb-payout-1',
      'txn:payout:airbnb-payout-2',
      'txn:payout:airbnb-payout-3',
      'txn:payout:airbnb-payout-4'
    ])
    expect(result.reportTransactions.map((item) => item.labelCs)).toEqual(['Airbnb rezervace', 'Airbnb payout', 'Airbnb payout', 'Airbnb payout'])
    expect(result.reportTransactions.map((item) => item.subtype)).toEqual(['reservation', 'transfer', 'transfer', 'transfer'])
  })

  it('recognizes grounded exact Airbnb payout-to-RB CITIBANK matches in browser runtime state', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '15.03.2026 06:20;15.03.2026 06:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;3961,05;CZK;G-OC3WJE3SIXRO5',
            '15.03.2026 07:20;15.03.2026 07:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;4456,97;CZK;G-DXVK4YVI7MJVL',
            '15.03.2026 08:20;15.03.2026 08:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;7059,94;CZK;G-ZD5RVTGOHW3GE'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T19:35:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 4,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2', 'airbnb-payout-3', 'airbnb-payout-4'],
        accountLabelCs: 'Airbnb payout report'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        extractedCount: 3,
        extractedRecordIds: ['fio-row-1', 'fio-row-2', 'fio-row-3'],
        accountLabelCs: 'RB účet 5599955956/5500',
        parserDebugLabel: 'fio'
      })
    ])
    expect(result.reportTransactions.map((item) => item.labelCs)).toEqual([
      'Airbnb rezervace',
      'Airbnb payout',
      'Airbnb payout',
      'Airbnb payout',
      'Bankovní transakce'
    ])
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(3)
    expect(result.reviewSections.payoutBatchMatched.map((item) => item.title)).toEqual([
      'Airbnb payout dávka G-OC3WJE3SIXRO5',
      'Airbnb payout dávka G-DXVK4YVI7MJVL',
      'Airbnb payout dávka G-ZD5RVTGOHW3GE'
    ])
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(0)
  })

  it('surfaces the real uploaded-file Airbnb to RB outcome with 15 exact matches and 2 unmatched payouts', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent())
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T20:10:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 17,
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
        accountLabelCs: 'Airbnb payout report'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        extractedCount: 16,
        accountLabelCs: 'RB účet 5599955956/5500',
        parserDebugLabel: 'fio'
      })
    ])

    expect(result.reviewSections.payoutBatchMatched).toHaveLength(15)
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(2)
    expect(result.reviewSections.payoutBatchMatched.map((item) => item.title)).toContain('Airbnb payout dávka G-OC3WJE3SIXRO5')
    expect(result.reviewSections.payoutBatchMatched.map((item) => item.title)).toContain('Airbnb payout dávka G-OLIOSSDGKKF3X')
    expect(result.reviewSections.payoutBatchUnmatched.map((item) => item.title)).toEqual([
      'Airbnb payout dávka G-IZLCELA7C5EFN',
      'Airbnb payout dávka G-6G5WFOJO5DJCI'
    ])
  })

  it('proves the exact real two-file path carries all 15 matched and 2 unmatched Airbnb payout-batch detail items visibly', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent())
      ],
      month: '2026-03',
      generatedAt: '2026-03-22T11:00:04.000Z'
    })

    expect(result.extractedRecords.map((item) => ({ fileName: item.fileName, extractedCount: item.extractedCount }))).toEqual([
      { fileName: 'airbnb.csv', extractedCount: 17 },
      { fileName: 'Pohyby_5599955956_202603191023.csv', extractedCount: 16 }
    ])

    expect(result.reportSummary.payoutBatchMatchCount).toBe(15)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(15)
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(2)
    expect(result.reviewSections.payoutBatchMatched.map((item) => item.title)).toEqual([
      'Airbnb payout dávka G-OC3WJE3SIXRO5',
      'Airbnb payout dávka G-DXVK4YVI7MJVL',
      'Airbnb payout dávka G-ZD5RVTGOHW3GE',
      'Airbnb payout dávka G-ZWNWMP6UYWNI7',
      'Airbnb payout dávka G-WLT46RY3MOZIF',
      'Airbnb payout dávka G-L4RVQL6SE24XJ',
      'Airbnb payout dávka G-TGCGGWASBTWWW',
      'Airbnb payout dávka G-TKC6CS3OTDMGN',
      'Airbnb payout dávka G-2F2LZZKYTRZ6E',
      'Airbnb payout dávka G-MUEMMKRWRPQNQ',
      'Airbnb payout dávka G-RFF4BW3JFXE6T',
      'Airbnb payout dávka G-EPATNPP5RBQDW',
      'Airbnb payout dávka G-JWVQXQVW6DET3',
      'Airbnb payout dávka G-FE2CKQSBT6E7N',
      'Airbnb payout dávka G-OLIOSSDGKKF3X'
    ])
    expect(result.reviewSections.payoutBatchUnmatched.map((item) => item.title)).toEqual([
      'Airbnb payout dávka G-IZLCELA7C5EFN',
      'Airbnb payout dávka G-6G5WFOJO5DJCI'
    ])
    expect(result.reviewSections.payoutBatchMatched.every((item) => item.detail.includes('Bankovní účet: 5599955956/5500.'))).toBe(true)
    expect(result.reviewSections.payoutBatchMatched.every((item) => item.detail.includes('Shoda dávky a bankovního přípisu'))).toBe(true)
    expect(result.reviewSections.payoutBatchUnmatched.every((item) => item.detail.includes('Žádná bankovní položka se stejnou částkou.'))).toBe(true)
  })

  it('keeps the exact real two-file Airbnb to RB reference lists identical from extraction through rendered payout-batch sections', async () => {
    const airbnbContent = buildActualUploadedAirbnbContent()
    const rbContent = buildActualUploadedRbCitiContent()

    const preview = buildUploadedBatchPreview({
      files: [
        {
          name: 'airbnb.csv',
          content: airbnbContent,
          uploadedAt: '2026-03-22T11:00:00.000Z'
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: rbContent,
          uploadedAt: '2026-03-22T11:00:01.000Z'
        }
      ],
      runId: 'browser-runtime-upload-2026-03',
      generatedAt: '2026-03-22T11:00:04.000Z'
    })

    const runtimeState = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', airbnbContent),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', rbContent)
      ],
      month: '2026-03',
      generatedAt: '2026-03-22T11:00:04.000Z'
    })

    const uploadedRun = buildBrowserUploadedMonthlyRun({
      files: [
        {
          name: 'airbnb.csv',
          content: airbnbContent,
          uploadedAt: '2026-03-22T11:00:00.000Z'
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: rbContent,
          uploadedAt: '2026-03-22T11:00:01.000Z'
        }
      ],
      runId: 'browser-runtime-upload-2026-03',
      generatedAt: '2026-03-22T11:00:04.000Z'
    })

    const airbnbSourceDocumentId = preview.importedFiles.find((file) => file.sourceDocument.fileName === 'airbnb.csv')?.sourceDocument.id

    expect(airbnbSourceDocumentId).toBeDefined()

    const extractedAirbnbReferences = preview.batch.extractedRecords
      .filter((record) => record.sourceDocumentId === airbnbSourceDocumentId)
      .map((record) => String(record.data.payoutReference ?? ''))

    const extractedRbCitibankReferences = preview.batch.extractedRecords
      .filter((record) => record.sourceDocumentId !== airbnbSourceDocumentId)
      .filter((record) => String(record.data.counterparty ?? '').toLowerCase().includes('citibank'))
      .map((record) => String(record.data.reference ?? record.rawReference ?? ''))

    const internallyMatchedReferences = preview.batch.report.payoutBatchMatches
      .filter((match) => match.platform === 'Airbnb')
      .map((match) => match.payoutReference)

    const internallyUnmatchedReferences = preview.batch.report.unmatchedPayoutBatches
      .filter((batch) => batch.platform === 'Airbnb')
      .map((batch) => batch.payoutReference)

    const renderedMatchedReferences = runtimeState.reviewSections.payoutBatchMatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))

    const renderedUnmatchedReferences = runtimeState.reviewSections.payoutBatchUnmatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))

    expect(extractedAirbnbReferences).toEqual([
      'G-OC3WJE3SIXRO5',
      'G-DXVK4YVI7MJVL',
      'G-ZD5RVTGOHW3GE',
      'G-ZWNWMP6UYWNI7',
      'G-WLT46RY3MOZIF',
      'G-L4RVQL6SE24XJ',
      'G-TGCGGWASBTWWW',
      'G-TKC6CS3OTDMGN',
      'G-2F2LZZKYTRZ6E',
      'G-MUEMMKRWRPQNQ',
      'G-RFF4BW3JFXE6T',
      'G-EPATNPP5RBQDW',
      'G-JWVQXQVW6DET3',
      'G-FE2CKQSBT6E7N',
      'G-OLIOSSDGKKF3X',
      'G-IZLCELA7C5EFN',
      'G-6G5WFOJO5DJCI'
    ])

    expect(extractedRbCitibankReferences).toEqual([
      'G-OC3WJE3SIXRO5',
      'G-DXVK4YVI7MJVL',
      'G-ZD5RVTGOHW3GE',
      'G-ZWNWMP6UYWNI7',
      'G-WLT46RY3MOZIF',
      'G-L4RVQL6SE24XJ',
      'G-TGCGGWASBTWWW',
      'G-TKC6CS3OTDMGN',
      'G-2F2LZZKYTRZ6E',
      'G-MUEMMKRWRPQNQ',
      'G-RFF4BW3JFXE6T',
      'G-EPATNPP5RBQDW',
      'G-JWVQXQVW6DET3',
      'G-FE2CKQSBT6E7N',
      'G-OLIOSSDGKKF3X',
      'NON-MATCHING-CITIBANK-ROW'
    ])

    expect(internallyMatchedReferences).toEqual([
      'G-OC3WJE3SIXRO5',
      'G-DXVK4YVI7MJVL',
      'G-ZD5RVTGOHW3GE',
      'G-ZWNWMP6UYWNI7',
      'G-WLT46RY3MOZIF',
      'G-L4RVQL6SE24XJ',
      'G-TGCGGWASBTWWW',
      'G-TKC6CS3OTDMGN',
      'G-2F2LZZKYTRZ6E',
      'G-MUEMMKRWRPQNQ',
      'G-RFF4BW3JFXE6T',
      'G-EPATNPP5RBQDW',
      'G-JWVQXQVW6DET3',
      'G-FE2CKQSBT6E7N',
      'G-OLIOSSDGKKF3X'
    ])

    expect(internallyUnmatchedReferences).toEqual([
      'G-IZLCELA7C5EFN',
      'G-6G5WFOJO5DJCI'
    ])

    expect(renderedMatchedReferences).toEqual(internallyMatchedReferences)
    expect(renderedUnmatchedReferences).toEqual(internallyUnmatchedReferences)

    expect(uploadedRun.html).toContain('<h3>Spárované Airbnb / OTA payout dávky</h3>')
    expect(uploadedRun.html).toContain('<h3>Nespárované payout dávky</h3>')
    expect(uploadedRun.html).toContain('<strong>15</strong><br />Spárované Airbnb / OTA payout dávky')
    expect(uploadedRun.html).toContain('<strong>2</strong><br />Nespárované payout dávky')
    expect(uploadedRun.html).toContain('Airbnb payout dávka G-OC3WJE3SIXRO5')
    expect(uploadedRun.html).toContain('Airbnb payout dávka G-OLIOSSDGKKF3X')
    expect(uploadedRun.html).toContain('Airbnb payout dávka G-IZLCELA7C5EFN')
    expect(uploadedRun.html).toContain('Airbnb payout dávka G-6G5WFOJO5DJCI')
  })

  it('preserves Airbnb G references through the browser-upload runtime when localized headers arrive without diacritics', async () => {
    const airbnbContent = buildActualUploadedAirbnbContentWithoutDiacritics()
    const rbContent = buildActualUploadedRbCitiContent()

    const preview = buildUploadedBatchPreview({
      files: [
        {
          name: 'airbnb.csv',
          content: airbnbContent,
          uploadedAt: '2026-03-22T11:10:00.000Z'
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: rbContent,
          uploadedAt: '2026-03-22T11:10:01.000Z'
        }
      ],
      runId: 'browser-runtime-upload-no-diacritics-2026-03',
      generatedAt: '2026-03-22T11:10:04.000Z'
    })

    const runtimeState = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', airbnbContent),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', rbContent)
      ],
      month: '2026-03',
      generatedAt: '2026-03-22T11:10:04.000Z'
    })

    const uploadedRun = buildBrowserUploadedMonthlyRun({
      files: [
        {
          name: 'airbnb.csv',
          content: airbnbContent,
          uploadedAt: '2026-03-22T11:10:00.000Z'
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: rbContent,
          uploadedAt: '2026-03-22T11:10:01.000Z'
        }
      ],
      runId: 'browser-runtime-upload-no-diacritics-2026-03',
      generatedAt: '2026-03-22T11:10:04.000Z'
    })

    const airbnbSourceDocumentId = preview.importedFiles.find((file) => file.sourceDocument.fileName === 'airbnb.csv')?.sourceDocument.id

    expect(airbnbSourceDocumentId).toBeDefined()

    const extractedAirbnbReferences = preview.batch.extractedRecords
      .filter((record) => record.sourceDocumentId === airbnbSourceDocumentId)
      .map((record) => String(record.data.payoutReference ?? ''))

    expect(extractedAirbnbReferences).toEqual([
      'G-OC3WJE3SIXRO5',
      'G-DXVK4YVI7MJVL',
      'G-ZD5RVTGOHW3GE',
      'G-ZWNWMP6UYWNI7',
      'G-WLT46RY3MOZIF',
      'G-L4RVQL6SE24XJ',
      'G-TGCGGWASBTWWW',
      'G-TKC6CS3OTDMGN',
      'G-2F2LZZKYTRZ6E',
      'G-MUEMMKRWRPQNQ',
      'G-RFF4BW3JFXE6T',
      'G-EPATNPP5RBQDW',
      'G-JWVQXQVW6DET3',
      'G-FE2CKQSBT6E7N',
      'G-OLIOSSDGKKF3X',
      'G-IZLCELA7C5EFN',
      'G-6G5WFOJO5DJCI'
    ])

    const renderedMatchedReferences = runtimeState.reviewSections.payoutBatchMatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))

    const renderedUnmatchedReferences = runtimeState.reviewSections.payoutBatchUnmatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))

    expect(renderedMatchedReferences).toEqual([
      'G-OC3WJE3SIXRO5',
      'G-DXVK4YVI7MJVL',
      'G-ZD5RVTGOHW3GE',
      'G-ZWNWMP6UYWNI7',
      'G-WLT46RY3MOZIF',
      'G-L4RVQL6SE24XJ',
      'G-TGCGGWASBTWWW',
      'G-TKC6CS3OTDMGN',
      'G-2F2LZZKYTRZ6E',
      'G-MUEMMKRWRPQNQ',
      'G-RFF4BW3JFXE6T',
      'G-EPATNPP5RBQDW',
      'G-JWVQXQVW6DET3',
      'G-FE2CKQSBT6E7N',
      'G-OLIOSSDGKKF3X'
    ])

    expect(renderedUnmatchedReferences).toEqual([
      'G-IZLCELA7C5EFN',
      'G-6G5WFOJO5DJCI'
    ])

    expect(uploadedRun.html).toContain('Airbnb payout dávka G-OC3WJE3SIXRO5')
    expect(uploadedRun.html).toContain('Airbnb payout dávka G-OLIOSSDGKKF3X')
    expect(uploadedRun.html).toContain('Airbnb payout dávka G-IZLCELA7C5EFN')
    expect(uploadedRun.html).toContain('Airbnb payout dávka G-6G5WFOJO5DJCI')
    expect(uploadedRun.html).not.toContain('AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)')
  })

  it('preserves Airbnb G references through the browser-upload runtime when the uploaded reference column uses English naming', async () => {
    const airbnbContent = [
      'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Reference code;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
      '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-OC3WJE3SIXRO5;;CZK;;3 961,05;0,00;3 961,05',
      '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 2;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-DXVK4YVI7MJVL;;CZK;;4 456,97;0,00;4 456,97',
      '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 3;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-ZD5RVTGOHW3GE;;CZK;;7 059,94;0,00;7 059,94'
    ].join('\n')

    const runtimeState = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [createRuntimeFile('airbnb.csv', airbnbContent)],
      month: '2026-03',
      generatedAt: '2026-03-23T13:22:00.000Z'
    })

    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbRawReferences).toEqual([
      'G-OC3WJE3SIXRO5',
      'G-DXVK4YVI7MJVL',
      'G-ZD5RVTGOHW3GE'
    ])
    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbReferenceCodes).toEqual([
      'G-OC3WJE3SIXRO5',
      'G-DXVK4YVI7MJVL',
      'G-ZD5RVTGOHW3GE'
    ])
    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbPayoutReferences).toEqual([
      'G-OC3WJE3SIXRO5',
      'G-DXVK4YVI7MJVL',
      'G-ZD5RVTGOHW3GE'
    ])
    expect(runtimeState.runtimeAudit.payoutDiagnostics.workflowPayoutBatchKeys).toEqual([
      'airbnb-batch:2026-03-15:G-OC3WJE3SIXRO5',
      'airbnb-batch:2026-03-15:G-DXVK4YVI7MJVL',
      'airbnb-batch:2026-03-15:G-ZD5RVTGOHW3GE'
    ])
    expect(new Set(runtimeState.runtimeAudit.payoutDiagnostics.workflowPayoutBatchKeys).size).toBe(3)
  })

  it('preserves explicit Czech payout reference values when the browser upload byte path includes a dedicated reference column', async () => {
    const airbnbContent = buildActualUploadedAirbnbContent()
    const rbContent = buildActualUploadedRbCitiContent()
    const encoded = new TextEncoder().encode(airbnbContent)
    const expectedReferences = airbnbContent
      .split('\n')
      .slice(1)
      .map((line) => line.split(';')[8] ?? '')
    const expectedMatchedReferences = rbContent
      .split('\n')
      .slice(1)
      .map((line) => line.split(';').at(-1) ?? '')
      .filter((reference) => reference.startsWith('G-'))
    const expectedUnmatchedReferences = expectedReferences.filter(
      (reference) => !expectedMatchedReferences.includes(reference)
    )

    const runtimeState = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'airbnb.csv',
          text: async () => 'corrupted fallback that does not contain Referencni values',
          arrayBuffer: async () => encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
        },
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', rbContent)
      ],
      month: '2026-03',
      generatedAt: '2026-03-23T17:00:00.000Z'
    })

    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbReferenceCodes).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbRawReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbDataReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbPayoutReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.workflowPayoutReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.workflowPayoutBatchKeys).toEqual(
      expectedReferences.map((reference) => `airbnb-batch:2026-03-15:${reference}`)
    )
    expect(runtimeState.runtimeAudit.payoutDiagnostics.reportMatchedPayoutReferences).toEqual(expectedMatchedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.reportUnmatchedPayoutReferences).toEqual(expectedUnmatchedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeMatchedTitleSourceValues).toEqual(expectedMatchedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeUnmatchedTitleSourceValues).toEqual(expectedUnmatchedReferences)
    expect(runtimeState.reviewSections.payoutBatchMatched.map((item) => item.title)).toEqual(
      expectedMatchedReferences.map((reference) => `Airbnb payout dávka ${reference}`)
    )
    expect(runtimeState.reviewSections.payoutBatchUnmatched.map((item) => item.title)).toEqual(
      expectedUnmatchedReferences.map((reference) => `Airbnb payout dávka ${reference}`)
    )
  })

  it('keeps real Airbnb payout rows distinct when the uploaded file has no payout reference column and several rows share the same payout date', async () => {
    const airbnbContent = buildRealUploadedAirbnbContentWithoutReferenceColumn()
    const rbContent = buildRealUploadedRbCitiContentForSharedAirbnbPayouts()
    const runtimeState = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeFile('airbnb.csv', airbnbContent),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', rbContent)
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T08:30:00.000Z'
    })

    const workflowBatchKeys = runtimeState.runtimeAudit.payoutDiagnostics.workflowPayoutBatchKeys
    const workflowPayoutReferences = runtimeState.runtimeAudit.payoutDiagnostics.workflowPayoutReferences
    const matchedTitles = runtimeState.reviewSections.payoutBatchMatched.map((item) => item.title)
    const unmatchedTitles = runtimeState.reviewSections.payoutBatchUnmatched.map((item) => item.title)

    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbReferenceCodes).toEqual(new Array(17).fill(''))
    expect(new Set(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbPayoutReferences)).toEqual(
      new Set(['AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'])
    )
    expect(new Set(workflowPayoutReferences)).toEqual(
      new Set(['AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'])
    )
    expect(workflowBatchKeys).toHaveLength(17)
    expect(new Set(workflowBatchKeys).size).toBe(17)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.reportMatchedPayoutReferences).toHaveLength(15)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.reportUnmatchedPayoutReferences).toHaveLength(2)
    expect(runtimeState.reviewSections.payoutBatchMatched).toHaveLength(15)
    expect(runtimeState.reviewSections.payoutBatchUnmatched).toHaveLength(2)
    expect(matchedTitles).toHaveLength(15)
    expect(unmatchedTitles).toHaveLength(2)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeMatchedTitleSourceValues).toContain('2026-03-20 / 3 961,05 Kč')
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeMatchedTitleSourceValues).toContain('2026-03-20 / 4 456,97 Kč')
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeMatchedTitleSourceValues).toContain('2026-03-20 / 7 059,94 Kč')
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeMatchedTitleSourceValues).toContain('2026-03-13 / 12 123,52 Kč')
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeMatchedTitleSourceValues).toContain('2026-03-13 / 2 248,17 Kč')
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeUnmatchedTitleSourceValues).toEqual([
      '2026-03-06 / 8 241,96 Kč',
      '2026-03-06 / 1 117,01 Kč'
    ])
    expect(matchedTitles).not.toContain('Airbnb payout dávka AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)')
    expect(unmatchedTitles).not.toContain('Airbnb payout dávka AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)')
    expect(matchedTitles).toContain('Airbnb payout dávka 2026-03-20 / 3 961,05 Kč')
    expect(matchedTitles).toContain('Airbnb payout dávka 2026-03-20 / 4 456,97 Kč')
    expect(matchedTitles).toContain('Airbnb payout dávka 2026-03-20 / 7 059,94 Kč')
    expect(matchedTitles).toContain('Airbnb payout dávka 2026-03-13 / 12 123,52 Kč')
    expect(matchedTitles).toContain('Airbnb payout dávka 2026-03-13 / 2 248,17 Kč')
    expect(unmatchedTitles).toEqual([
      'Airbnb payout dávka 2026-03-06 / 8 241,96 Kč',
      'Airbnb payout dávka 2026-03-06 / 1 117,01 Kč'
    ])

    const sharedMarch20Keys = workflowBatchKeys.filter((key) => key.includes('PAYOUT-2026-03-20'))
    expect(sharedMarch20Keys).toEqual([
      'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-396105',
      'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-445697',
      'airbnb-batch:2026-03-20:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-18:PAYOUT-2026-03-20:AMOUNT-705994'
    ])

    const sharedMarch13Keys = workflowBatchKeys.filter((key) => key.includes('PAYOUT-2026-03-13'))
    expect(sharedMarch13Keys).toEqual([
      'airbnb-batch:2026-03-13:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-11:PAYOUT-2026-03-13:AMOUNT-1212352',
      'airbnb-batch:2026-03-13:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-11:PAYOUT-2026-03-13:AMOUNT-224817',
      'airbnb-batch:2026-03-13:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-11:PAYOUT-2026-03-13:AMOUNT-249232'
    ])

    const sharedMarch06Keys = workflowBatchKeys.filter((key) => key.includes('PAYOUT-2026-03-06'))
    expect(sharedMarch06Keys).toEqual([
      'airbnb-batch:2026-03-06:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-04:PAYOUT-2026-03-06:AMOUNT-824196',
      'airbnb-batch:2026-03-06:AIRBNB-TRANSFER:JOKELAND S.R.O.:IBAN-5956-(CZK):SOURCE-2026-03-04:PAYOUT-2026-03-06:AMOUNT-111701'
    ])
  })

  it('prefers byte decoding over mis-decoded text when the uploaded Czech header would otherwise lose diacritics in browser upload', async () => {
    const cp1250HeaderBytes = Uint8Array.from([
      0x44, 0x61, 0x74, 0x75, 0x6d, 0x3b, 0x42, 0x75, 0x64, 0x65, 0x20, 0x70, 0xf8, 0x69, 0x70, 0x73, 0xe1, 0x6e, 0x20, 0x64, 0x6f, 0x20, 0x64, 0x6e, 0x65, 0x3b,
      0x54, 0x79, 0x70, 0x3b, 0x44, 0x61, 0x74, 0x75, 0x6d, 0x20, 0x7a, 0x61, 0x68, 0xe1, 0x6a, 0x65, 0x6e, 0xed, 0x3b, 0x44, 0x61, 0x74, 0x75, 0x6d, 0x20, 0x75, 0x6b, 0x6f, 0x6e, 0xe8, 0x65, 0x6e, 0xed, 0x3b,
      0x48, 0x6f, 0x73, 0x74, 0x3b, 0x4e, 0x61, 0x62, 0xed, 0x64, 0x6b, 0x61, 0x3b, 0x50, 0x6f, 0x64, 0x72, 0x6f, 0x62, 0x6e, 0x6f, 0x73, 0x74, 0x69, 0x3b,
      0x52, 0x65, 0x66, 0x65, 0x72, 0x65, 0x6e, 0xe8, 0x6e, 0xed, 0x20, 0x6b, 0xf3, 0x64, 0x3b, 0x50, 0x6f, 0x74, 0x76, 0x72, 0x7a, 0x75, 0x6a, 0xed, 0x63, 0xed, 0x20, 0x6b, 0xf3, 0x64, 0x3b,
      0x4d, 0xec, 0x6e, 0x61, 0x3b, 0xc8, 0xe1, 0x73, 0x74, 0x6b, 0x61, 0x3b, 0x56, 0x79, 0x70, 0x6c, 0x61, 0x63, 0x65, 0x6e, 0x6f, 0x3b, 0x53, 0x65, 0x72, 0x76, 0x69, 0x73, 0x6e, 0xed, 0x20, 0x70, 0x6f, 0x70, 0x6c, 0x61, 0x74, 0x65, 0x6b, 0x3b, 0x48, 0x72, 0x75, 0x62, 0xe9, 0x20, 0x76, 0xfd, 0x64, 0xec, 0x6c, 0x6b, 0x79, 0x0a,
      0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x33, 0x2d, 0x31, 0x32, 0x3b, 0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x33, 0x2d, 0x31, 0x35, 0x3b, 0x50, 0x61, 0x79, 0x6f, 0x75, 0x74, 0x3b, 0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x33, 0x2d, 0x31, 0x30, 0x3b, 0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x33, 0x2d, 0x31, 0x32, 0x3b,
      0x4a, 0x61, 0x6e, 0x20, 0x4e, 0x6f, 0x76, 0x61, 0x6b, 0x3b, 0x4a, 0x6f, 0x6b, 0x65, 0x6c, 0x61, 0x6e, 0x64, 0x20, 0x61, 0x70, 0x61, 0x72, 0x74, 0x6d, 0x65, 0x6e, 0x74, 0x3b,
      0x50, 0xf8, 0x65, 0x76, 0x6f, 0x64, 0x20, 0x4a, 0x6f, 0x6b, 0x65, 0x6c, 0x61, 0x6e, 0x64, 0x20, 0x73, 0x2e, 0x72, 0x2e, 0x6f, 0x2e, 0x2c, 0x20, 0x49, 0x42, 0x41, 0x4e, 0x20, 0x35, 0x39, 0x35, 0x36, 0x20, 0x28, 0x43, 0x5a, 0x4b, 0x29, 0x3b,
      0x47, 0x2d, 0x4f, 0x43, 0x33, 0x57, 0x4a, 0x45, 0x33, 0x53, 0x49, 0x58, 0x52, 0x4f, 0x35, 0x3b, 0x3b, 0x43, 0x5a, 0x4b, 0x3b, 0x3b, 0x33, 0x20, 0x39, 0x36, 0x31, 0x2c, 0x30, 0x35, 0x3b, 0x30, 0x2c, 0x30, 0x30, 0x3b, 0x33, 0x20, 0x39, 0x36, 0x31, 0x2c, 0x30, 0x35
    ])
    const expectedReferences = ['G-OC3WJE3SIXRO5']

    const runtimeState = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'airbnb.csv',
          text: async () => 'Datum;Bude p�ips�n do dne;Typ;Datum zah�jen�;Datum ukon�en�;Host;Nab�dka;Podrobnosti;Referen�n� k�d;Potvrzuj�c� k�d;M�na;��stka;Vyplaceno;Servisn� poplatek;Hrub� v�d�lky\n2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;P�evod Jokeland s.r.o., IBAN 5956 (CZK);G-OC3WJE3SIXRO5;;CZK;;3 961,05;0,00;3 961,05',
          arrayBuffer: async () => cp1250HeaderBytes.buffer.slice(cp1250HeaderBytes.byteOffset, cp1250HeaderBytes.byteOffset + cp1250HeaderBytes.byteLength)
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-23T17:15:00.000Z'
    })

    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbReferenceCodes).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbRawReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbDataReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.extractedAirbnbPayoutReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.workflowPayoutReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.workflowPayoutBatchKeys).toEqual([
      'airbnb-batch:2026-03-15:G-OC3WJE3SIXRO5'
    ])
    expect(runtimeState.runtimeAudit.payoutDiagnostics.reportMatchedPayoutReferences).toEqual([])
    expect(runtimeState.runtimeAudit.payoutDiagnostics.reportUnmatchedPayoutReferences).toEqual(expectedReferences)
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeMatchedTitleSourceValues).toEqual([])
    expect(runtimeState.runtimeAudit.payoutDiagnostics.runtimeUnmatchedTitleSourceValues).toEqual(expectedReferences)
    expect(runtimeState.reviewSections.payoutBatchMatched.map((item) => item.title)).toEqual([])
    expect(runtimeState.reviewSections.payoutBatchUnmatched.map((item) => item.title)).toEqual([
      'Airbnb payout dávka G-OC3WJE3SIXRO5'
    ])
  })

  it('parses the real Airbnb-only browser runtime path when reservation rows have empty Vyplaceno and non-money transfer-class rows are skipped', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'airbnb.csv',
          [
            'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
            '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;;;',
            '2026-03-12;2026-03-15;Payout;;;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;;;'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T17:20:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 1,
        extractedRecordIds: ['airbnb-payout-1'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(1)
    expect(result.reportTransactions).toHaveLength(1)
  })

  it('parses the real Airbnb-only browser runtime path when reservation rows have empty availableUntilDate and non-money transfer-class rows are skipped', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'airbnb.csv',
          [
            'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
            '2026-03-12;;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;;;',
            '2026-03-12;;Payout;;;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;;;'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T18:20:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 1,
        extractedRecordIds: ['airbnb-payout-1'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(1)
    expect(result.reportTransactions).toHaveLength(1)
  })

  it('parses the real Airbnb-only browser runtime path when service fee is empty on otherwise valid reservation and payout rows', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'airbnb.csv',
          [
            'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
            '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;;1 060,00',
            '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;;980,00'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T16:10:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 2,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(2)
    expect(result.reportTransactions).toHaveLength(2)
  })

  it('parses the real Airbnb-only browser runtime path when gross earnings is empty on otherwise valid reservation and payout rows', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'airbnb.csv',
          [
            'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
            '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;;',
            '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;;'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T16:35:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 2,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(2)
    expect(result.reportTransactions).toHaveLength(2)
  })

  it('parses the real Airbnb-only browser runtime path when payout rows have empty stay dates', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'airbnb.csv',
          [
            'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
            '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;;',
            '2026-03-12;2026-03-15;Payout;;;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;;'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T16:55:00.000Z'
    })

    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 2,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(2)
    expect(result.reportTransactions).toHaveLength(2)
  })

  it('recognizes the real Booking browser-upload shape as Booking in the shared browser path', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [createRuntimeFile('AaOS6MOZUh8BFtEr.booking.csv', booking.rawInput.content)],
      month: '2026-03',
      generatedAt: '2026-03-20T12:15:00.000Z'
    })

    expect(result.preparedFiles).toHaveLength(1)
    expect(result.preparedFiles[0]).toMatchObject({
      fileName: 'AaOS6MOZUh8BFtEr.booking.csv',
      sourceSystem: 'booking',
      documentType: 'ota_report'
    })
    expect(result.extractedRecords[0]).toMatchObject({
      fileName: 'AaOS6MOZUh8BFtEr.booking.csv',
      extractedCount: 1,
      accountLabelCs: 'Booking payout report'
    })
  })

  it('surfaces raw and normalized Booking header diagnostics as an explicit browser ingest error instead of dropping the file', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeFile(
          'AaOS6MOZUh8BFtEr.booking.csv',
          [
            'Datum vyplaty;Castka;Mena;Poznamka',
            '10.03.2026;1250,00;CZK;PAYOUT-BOOK-20260310'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-20T16:25:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 1,
      supportedFileCount: 0,
      unsupportedFileCount: 0,
      errorFileCount: 1
    })
    expect(result.preparedFiles).toEqual([])
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'AaOS6MOZUh8BFtEr.booking.csv',
        status: 'error',
        intakeStatus: 'error',
        sourceSystem: 'booking',
        documentType: 'ota_report',
        classificationBasis: 'file-name',
        parserId: 'booking',
        errorMessage: 'Booking payout export is missing required columns: payoutReference, reservationId. Raw detected header row: Datum vyplaty;Castka;Mena;Poznamka. Detected normalized headers: payoutDate, amountMinor, currency, Poznamka'
      })
    ])
  })

  it('keeps a selected Booking payout PDF visible as a supplemental intake outcome and preserves Airbnb payout counts', async () => {
    const bookingPdf = getRealInputFixture('booking-payout-statement-pdf')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFile(bookingPdf.sourceDocument.fileName, bookingPdf.rawInput.binaryContentBase64!)
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T11:30:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 3,
      supportedFileCount: 3,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        sourceSystem: 'airbnb',
        documentType: 'ota_report',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        status: 'supported',
        sourceSystem: 'bank',
        documentType: 'bank_statement',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'booking-payout-statement-2026-03.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        parserId: 'booking-payout-statement-pdf',
        role: 'supplemental',
        extractedCount: 1,
        extractedRecordIds: ['booking-payout-statement-1']
      })
    ])
    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        sourceSystem: 'airbnb',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        sourceSystem: 'bank',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'booking-payout-statement-2026-03.pdf',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        role: 'supplemental'
      })
    ])
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(15)
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(2)
  })

  it('accounts for all four selected files in the real mixed browser monthly flow when the Booking PDF requires ToUnicode decoding', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', booking.rawInput.content),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildBookingPayoutStatementVariantPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T16:10:00.000Z'
    })

    expect(result.fileRoutes).toHaveLength(4)
    expect(
      result.routingSummary.supportedFileCount
      + result.routingSummary.unsupportedFileCount
      + result.routingSummary.errorFileCount
    ).toBe(4)
    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv',
        status: 'supported',
        sourceSystem: 'booking',
        documentType: 'ota_report',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        sourceSystem: 'airbnb',
        documentType: 'ota_report',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        status: 'supported',
        sourceSystem: 'bank',
        documentType: 'bank_statement',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        parserId: 'booking-payout-statement-pdf',
        role: 'supplemental',
        extractedCount: 1
      })
    ])
    expect(result.fileRoutes.some((file) => file.fileName === 'Bookinng35k.pdf' && file.status === 'error')).toBe(false)
    expect(result.preparedFiles.map((file) => file.fileName)).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Pohyby_5599955956_202603191023.csv',
      'Bookinng35k.pdf'
    ])
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
    expect(
      result.reviewSections.payoutBatchUnmatched.some((item) => item.title.startsWith('Booking payout '))
    ).toBe(true)
  })

  it('keeps the real mixed 4-file browser outcome stable when the Booking payout PDF text is extracted as glyph-separated browser tokens', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', booking.rawInput.content),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFileFromTextLines('Bookinng35k.pdf', buildBookingPayoutStatementGlyphSeparatedPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T17:25:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        parserId: 'booking-payout-statement-pdf',
        role: 'supplemental',
        extractedCount: 1
      })
    ])
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
    expect(
      result.reviewSections.payoutBatchUnmatched.some((item) => item.title.startsWith('Booking payout '))
    ).toBe(true)
  })

  it('passes readable ToUnicode-mapped Booking PDF text cues through the browser upload contract into monthly classification', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const uploadedFiles = await prepareBrowserRuntimeUploadedFilesFromSelectedFiles({
      files: [
        createRuntimeFile('booking35k.csv', booking.rawInput.content),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildBookingPayoutStatementVariantPdfLines())
      ],
      generatedAt: '2026-03-24T16:10:00.000Z'
    })

    expect(uploadedFiles).toHaveLength(4)
    expect(uploadedFiles[3]?.content).toContain('Booking.com')
    expect(uploadedFiles[3]?.content).toContain('Payment overview')
    expect(uploadedFiles[3]).toEqual(
      expect.objectContaining({
        name: 'Bookinng35k.pdf',
        contentFormat: 'pdf-text',
        sourceDescriptor: expect.objectContaining({
          browserTextExtraction: expect.objectContaining({
            mode: 'pdf-text',
            status: 'extracted',
            detectedSignatures: expect.arrayContaining([
              'booking-branding',
              'booking-payment-id',
              'booking-payout-date',
              'booking-payout-total',
              'iban-hint',
              'booking-reservation-reference'
            ])
          })
        })
      })
    )

    const renderedRun = buildBrowserUploadedMonthlyRun({
      files: uploadedFiles,
      runId: 'browser-runtime-upload-2026-03',
      generatedAt: '2026-03-24T16:10:00.000Z'
    })

    expect(renderedRun.run.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        role: 'supplemental'
      })
    ])
    expect(renderedRun.html).toContain('<h3>Bookinng35k.pdf</h3>')
    expect(renderedRun.html).toContain('<strong>Stav:</strong> Podporovaný doplňkový payout dokument')
    expect(renderedRun.html).toContain('<strong>Zdroj:</strong> Booking payout statement PDF')
    expect(renderedRun.html).toContain('<strong>4</strong><br />Rozpoznané soubory')
    expect(renderedRun.html).toContain('<strong>0</strong><br />Nepodporované soubory')
    expect(renderedRun.html).not.toContain('Soubor se nepodařilo jednoznačně přiřadit k podporovanému měsíčnímu zdroji.')
    expect(renderedRun.html).not.toContain('<strong>Unsupported:</strong>')
  })

  it('keeps per-file intake diagnostics aligned with the final browser routing outcome for ToUnicode-mapped Booking PDFs', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', booking.rawInput.content),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildBookingPayoutStatementVariantPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T18:10:00.000Z'
    })

    expect(result.runtimeAudit.fileIntakeDiagnostics).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv',
        status: 'supported',
        classificationBasis: 'content',
        extractedTextPresent: true,
        sourceSystem: 'booking',
        documentType: 'ota_report'
      }),
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        classificationBasis: 'content',
        extractedTextPresent: true,
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        status: 'supported',
        classificationBasis: 'content',
        extractedTextPresent: true,
        sourceSystem: 'bank',
        documentType: 'bank_statement'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        mimeType: 'application/pdf',
        textExtractionMode: 'pdf-text',
        textExtractionStatus: 'extracted',
        extractedTextPresent: true,
        textPreview: expect.stringContaining('Booking.com'),
        detectedSignatures: expect.arrayContaining([
          'booking-branding',
          'booking-payment-id',
          'booking-payout-date',
          'booking-payout-total'
        ]),
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        status: 'supported',
        intakeStatus: 'parsed',
        role: 'supplemental'
      })
    ])
  })

  it('classifies a real-like Czech Booking payout PDF from full browser-extracted document text instead of only the early header preview', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const uploadedFiles = await prepareBrowserRuntimeUploadedFilesFromSelectedFiles({
      files: [
        createRuntimeFile('booking35k.csv', booking.rawInput.content),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechLateCueBookingPayoutStatementPdfLines())
      ],
      generatedAt: '2026-03-24T18:45:00.000Z'
    })

    expect(uploadedFiles[3]?.content.startsWith('Chill apartment with city view and balcony')).toBe(true)
    expect(uploadedFiles[3]?.content).toContain('Booking.com B.V.')
    expect(uploadedFiles[3]?.content).toContain('Výkaz plateb')
    expect(uploadedFiles[3]?.content).toContain('ID platby 010638445054')
    expect(uploadedFiles[3]?.content).toContain('Celkem (CZK) 35,530.12 Kč')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', booking.rawInput.content),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechLateCueBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T18:45:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        role: 'supplemental'
      })
    ])
    expect(result.runtimeAudit.fileIntakeDiagnostics).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv'
      }),
      expect.objectContaining({
        fileName: 'airbnb.csv'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        extractedTextPresent: true,
        textLength: expect.any(Number),
        textPreview: expect.stringContaining('Chill apartment'),
        textTailPreview: expect.stringContaining('Celkem (CZK) 35,530.12 Kč'),
        keywordHits: expect.arrayContaining([
          'Booking.com B.V.',
          'Výkaz plateb',
          'ID platby',
          'Datum vyplacení částky',
          'Celkem (CZK)',
          'IBAN'
        ]),
        detectedSignatures: expect.arrayContaining([
          'booking-branding',
          'booking-payout-statement-wording',
          'booking-payment-id',
          'booking-payout-date',
          'booking-payout-total',
          'iban-hint'
        ]),
        detectedSignals: expect.arrayContaining([
          'booking-branding',
          'booking-payout-statement-wording',
          'booking-payment-id',
          'booking-payout-date',
          'booking-payout-total'
        ]),
        matchedRules: expect.arrayContaining([
          'pdf-like-upload',
          'booking-payout-core-fields'
        ]),
        missingSignals: expect.any(Array),
        parserSupported: true,
        decisionConfidence: 'strong',
        parsedPaymentId: '010638445054',
        parsedPayoutDate: '2026-03-12',
        parsedPayoutTotal: '1456.42 EUR',
        parsedLocalTotal: '35530.12 CZK',
        parsedIbanHint: '5956',
        requiredFieldsCheck: 'passed',
        missingFields: [],
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        role: 'supplemental'
      })
    ])
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
  })

  it('keeps PDF ingest failures visible in browser routing instead of silently losing the selected file', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createBrokenRuntimePdfFile('booking-payout-broken.pdf')
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T11:40:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 2,
      supportedFileCount: 1,
      unsupportedFileCount: 1,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        status: 'supported',
        intakeStatus: 'parsed'
      }),
      expect.objectContaining({
        fileName: 'booking-payout-broken.pdf',
        status: 'unsupported',
        intakeStatus: 'unsupported',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        role: 'supplemental',
        reason: 'Booking payout statement vypadá jako scan bez čitelné textové vrstvy. Pro ingest je potřeba OCR.',
        decision: expect.objectContaining({
          capability: expect.objectContaining({
            profile: 'pdf_image_only'
          }),
          ingestionBranch: 'ocr-required'
        })
      })
    ])
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'booking-payout-broken.pdf',
        capabilityProfile: 'pdf_image_only',
        ingestionBranch: 'ocr-required',
        status: 'unsupported',
        intakeStatus: 'unsupported'
      })
    )
    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv'
      })
    ])
  })

  it('uses Booking payout PDF metadata in the browser operator-facing unmatched payout item', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('AaOS6MOZUh8BFtEr.booking.csv', booking.rawInput.content),
        createRuntimePdfFileFromTextLines('Bookinng35k.pdf', buildBookingPayoutStatementVariantPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T11:50:00.000Z'
    })

    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'AaOS6MOZUh8BFtEr.booking.csv',
        status: 'supported',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        role: 'supplemental'
      })
    ])
    expect(result.reportTransactions).toHaveLength(1)
    expect(result.reviewSections.payoutBatchMatched).toEqual([])
    expect(result.reviewSections.payoutBatchUnmatched).toEqual([
      expect.objectContaining({
        title: 'Booking payout PAYOUT-BOOK-20260310 / 1 250,00 Kč',
        detail: expect.stringContaining('Kontext payoutu: Datum payoutu: 2026-03-12 · IBAN 5956 · rezervace: 1.')
      })
    ])
    expect(result.reportSummary.payoutBatchMatchCount).toBe(0)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(1)
  })

  it('parses Czech Booking payout PDF core fields without leaving the supplemental document in ingest failure and enriches the unmatched Booking payout item', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechLateCueBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T19:20:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 2,
      supportedFileCount: 2,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv',
        status: 'supported',
        intakeStatus: 'parsed',
        role: 'primary'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'content',
        role: 'supplemental'
      })
    ])
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        parserExtractedPaymentId: '010638445054',
        parserExtractedPayoutDate: '2026-03-12',
        parserExtractedPayoutTotal: '1456.42 EUR',
        parserExtractedLocalTotal: '35530.12 CZK',
        validatorInputPaymentId: '010638445054',
        validatorInputPayoutDate: '2026-03-12',
        validatorInputPayoutTotal: '1456.42 EUR',
        parsedPaymentId: '010638445054',
        parsedPayoutDate: '2026-03-12',
        parsedPayoutTotal: '1456.42 EUR',
        parsedLocalTotal: '35530.12 CZK',
        parsedIbanHint: '5956',
        requiredFieldsCheck: 'passed',
        missingFields: [],
        status: 'supported',
        intakeStatus: 'parsed'
      })
    )
    expect(result.reviewSections.payoutBatchMatched).toEqual([])
    expect(result.reviewSections.payoutBatchUnmatched).toEqual([
      expect.objectContaining({
        title: 'Booking payout 010638445054 / 35 530,12 Kč',
        detail: expect.stringContaining(
          'Kontext payoutu: Datum payoutu: 2026-03-12 · Celkem payoutu: 1 456,42 EUR · IBAN 5956 · rezervace: 1.'
        )
      })
    ])
    expect(result.reportSummary.payoutBatchMatchCount).toBe(0)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(1)
  })

  it('matches a Booking payout batch in the final browser runtime when the bank line carries the PDF paymentId instead of the Booking payout reference', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContentWithBookingPaymentIdMatch()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechLateCueBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-25T10:35:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
    expect(result.reviewSections.payoutBatchMatched).toContainEqual(
      expect.objectContaining({
        title: 'Booking payout 010638445054 / 35 530,12 Kč',
        detail: expect.stringContaining(
          'Shoda dávky a bankovního přípisu podle lokální payout částky, data payoutu a ID platby Booking.'
        )
      })
    )
    expect(
      result.reviewSections.payoutBatchMatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(true)
    expect(
      result.reviewSections.payoutBatchUnmatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(false)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
  })

  it('matches the real Booking payout in the final browser runtime when the bank line carries the Booking counterparty and reference fragment', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          buildActualUploadedRbCitiContentWithBookingReferenceHintMatch()
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-25T11:10:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.reviewSections.payoutBatchMatched).toContainEqual(
      expect.objectContaining({
        title: 'Booking payout 010638445054 / 35 530,12 Kč',
        detail: expect.stringContaining(
          'Shoda dávky a bankovního přípisu podle částky, měny, povoleného směrování a pozorovaného protiúčtu.'
        )
      })
    )
    expect(result.reviewSections.payoutBatchMatched).toContainEqual(
      expect.objectContaining({
        title: 'Booking payout 010638445054 / 35 530,12 Kč',
        detail: expect.stringContaining(
          'Bankovní přípis: 2026-03-13T09:12:00 · BOOKING.COM B.V. · NO.AAOS6MOZUH8BFTER/2206371.'
        )
      })
    )
    expect(result.reviewSections.payoutBatchMatched).toContainEqual(
      expect.objectContaining({
        title: 'Booking payout 010638445054 / 35 530,12 Kč',
        detail: expect.stringContaining(
          'Kontext payoutu: Datum payoutu: 2026-03-12 · Celkem payoutu: 1 456,42 EUR · Kurz: 24.3955.'
        )
      })
    )
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
    expect(
      result.reviewSections.payoutBatchMatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(true)
    expect(
      result.reviewSections.payoutBatchUnmatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(false)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
  })

  it('keeps Booking PDF parsed in the final browser path when payout labels and values are split into separate text blocks', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSeparatedBlockBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T19:25:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 2,
      supportedFileCount: 2,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv',
        status: 'supported',
        intakeStatus: 'parsed'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        role: 'supplemental'
      })
    ])
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        parserExtractedPaymentId: '010638445054',
        parserExtractedPayoutDate: '2026-03-12',
        parserExtractedPayoutTotal: '1456.42 EUR',
        validatorInputPaymentId: '010638445054',
        validatorInputPayoutDate: '2026-03-12',
        validatorInputPayoutTotal: '1456.42 EUR',
        parsedPaymentId: '010638445054',
        parsedPayoutDate: '2026-03-12',
        parsedPayoutTotal: '1456.42 EUR',
        parsedLocalTotal: '35530.12 CZK',
        requiredFieldsCheck: 'passed',
        missingFields: []
      })
    )
  })

  it('keeps parserExtracted and validatorInput aligned in the final browser runtime when Booking labels and values are far apart in the PDF text', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechWideGapBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T19:35:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 2,
      supportedFileCount: 2,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'booking35k.csv',
        status: 'supported',
        intakeStatus: 'parsed'
      }),
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        role: 'supplemental'
      })
    ])
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        parserExtractedPaymentId: '010638445054',
        parserExtractedPayoutDate: '2026-03-12',
        parserExtractedPayoutTotal: '1456.42 EUR',
        parserExtractedLocalTotal: '35530.12 CZK',
        validatorInputPaymentId: '010638445054',
        validatorInputPayoutDate: '2026-03-12',
        validatorInputPayoutTotal: '1456.42 EUR',
        parsedPaymentId: '010638445054',
        parsedPayoutDate: '2026-03-12',
        parsedPayoutTotal: '1456.42 EUR',
        parsedLocalTotal: '35530.12 CZK',
        requiredFieldsCheck: 'passed',
        missingFields: [],
        status: 'supported',
        intakeStatus: 'parsed'
      })
    )
    expect(result.reviewSections.payoutBatchUnmatched).toEqual([
      expect.objectContaining({
        title: 'Booking payout 010638445054 / 35 530,12 Kč'
      })
    ])
  })

  it('extracts fragmented Booking PDF fields from the final browser runtime instead of collapsing payoutTotal to 1 EUR', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechFragmentedBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T19:45:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        parserExtractedPaymentId: '010638445054',
        parserExtractedPayoutDate: '2026-03-12',
        parserExtractedPayoutTotal: '1456.42 EUR',
        parserExtractedLocalTotal: '35530.12 CZK',
        validatorInputPaymentId: '010638445054',
        validatorInputPayoutDate: '2026-03-12',
        validatorInputPayoutTotal: '1456.42 EUR',
        parsedPaymentId: '010638445054',
        parsedPayoutDate: '2026-03-12',
        parsedPayoutTotal: '1456.42 EUR',
        parsedLocalTotal: '35530.12 CZK',
        requiredFieldsCheck: 'passed',
        missingFields: [],
        status: 'supported',
        intakeStatus: 'parsed'
      })
    )
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
  })

  it('extracts Booking PDF fields from the real browser text shape where the PDF text arrives one glyph per line', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T20:05:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Bookinng35k.pdf',
        parserExtractedPaymentId: '010638445054',
        parserExtractedPayoutDate: '2026-03-12',
        parserExtractedPayoutTotal: '1456.42 EUR',
        parserExtractedLocalTotal: '35530.12 CZK',
        validatorInputPaymentId: '010638445054',
        validatorInputPayoutDate: '2026-03-12',
        validatorInputPayoutTotal: '1456.42 EUR',
        parsedPaymentId: '010638445054',
        parsedPayoutDate: '2026-03-12',
        parsedPayoutTotal: '1456.42 EUR',
        parsedLocalTotal: '35530.12 CZK',
        requiredFieldsCheck: 'passed',
        missingFields: [],
        status: 'supported',
        intakeStatus: 'parsed'
      })
    )
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
  })

  it('keeps browser arrayBuffer CSV uploads on the structured path instead of downgrading them to unsupported binary capability', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent(), 'text/csv'),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-24T20:25:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'airbnb.csv',
        capabilityProfile: 'structured_tabular',
        ingestionBranch: 'structured-parser',
        status: 'supported',
        intakeStatus: 'parsed'
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        capabilityProfile: 'structured_tabular',
        ingestionBranch: 'structured-parser',
        status: 'supported',
        intakeStatus: 'parsed'
      })
    )
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
  })

  it('keeps the real browser-like 4-file arrayBuffer path aligned with the true payout result instead of dropping to 0 matched and 18 unmatched', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbCitiContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-25T14:40:00.000Z'
    })

    expect(result.reconciliationSnapshot).toMatchObject({
      sourceFunction: 'buildBrowserRuntimeUploadStateFromFiles -> batch.reconciliation',
      objectPath: 'state.reconciliationSnapshot',
      matchedCount: 16,
      unmatchedCount: 2
    })
    expect(result.reconciliationSnapshot.matchedPayoutBatchKeys).toHaveLength(16)
    expect(result.reconciliationSnapshot.unmatchedPayoutBatchKeys).toHaveLength(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
    expect(result.reviewSections.payoutBatchMatched).toContainEqual(
      expect.objectContaining({
        title: 'Booking payout 010638445054 / 35 530,12 Kč'
      })
    )
  })

  it('keeps the real browser-like 4-file arrayBuffer path at 16 matched and 2 unmatched even when Airbnb bank lines only carry generic transfer wording', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T10:05:00.000Z'
    })

    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
    expect(
      result.reviewSections.payoutBatchMatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(true)
  })

  it('keeps the real browser-like 4-file arrayBuffer path at 16 matched and 2 unmatched when Airbnb bank postings land three days before payout availability', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(-3),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T16:30:00.000Z'
    })

    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(
      result.reconciliationSnapshot.payoutBatchDecisions.filter((decision) => decision.platform === 'airbnb' && decision.matched)
    ).toHaveLength(15)
    expect(
      result.reconciliationSnapshot.payoutBatchDecisions.filter((decision) => decision.platform === 'airbnb' && !decision.matched)
    ).toHaveLength(2)
    expect(
      result.reviewSections.payoutBatchMatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(true)
  })

  it('uses Booking supplement local CZK total for bank matching when the browser-upload CSV carries the payout document total in EUR', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContentInEur(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T10:15:00.000Z'
    })

    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reconciliationSnapshot.payoutBatchDecisions).toContainEqual(
      expect.objectContaining({
        payoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
        platform: 'booking',
        expectedTotalMinor: 145642,
        documentTotalMinor: 145642,
        expectedBankAmountMinor: 3553012,
        currency: 'EUR',
        documentCurrency: 'EUR',
        expectedBankCurrency: 'CZK',
        matchingAmountSource: 'booking_local_total',
        matched: true,
        matchedBankTransactionId: 'txn:bank:fio-row-16'
      })
    )
    expect(
      result.reviewSections.payoutBatchMatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(true)
  })

  it('keeps the real browser-upload path at 16 matched and 2 unmatched when the bank CSV arrives with CR-only row separators', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          withCrOnlyLineEndings(buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch()),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T11:10:00.000Z'
    })

    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(
      result.reconciliationSnapshot.payoutBatchDecisions.some((decision) =>
        decision.payoutBatchKey.startsWith('booking-batch:')
        && decision.matched
        && decision.matchedBankTransactionId === 'txn:bank:fio-row-16'
      )
    ).toBe(true)
  })

  it('renders the actual upload page summary and payout sections from the same 16 matched / 2 unmatched runtime state in the real 4-file scenario', async () => {
    const rendered = await executeUploadWebFlowMainWorkflow({
      generatedAt: '2026-03-25T15:20:00.000Z',
      month: '2026-03',
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbCitiContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.runtimeOutput.innerHTML).toContain('<div class="metric-tile"><strong>16</strong><br />Spárované payout dávky</div>')
    expect(rendered.runtimeOutput.innerHTML).toContain('<div class="metric-tile"><strong>2</strong><br />Nespárované payout dávky</div>')
    expect(rendered.runtimeOutput.innerHTML).toContain('<strong>Spárované payout dávky:</strong> 16')
    expect(rendered.runtimeOutput.innerHTML).toContain('<strong>Nespárované payout dávky:</strong> 2')
    expect(rendered.runtimeOutput.innerHTML).toContain('Booking payout 010638445054 / 35 530,12 Kč')
  })

  it('preserves one shared Booking payout batch key across multiple reservation-linked browser-upload rows', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-batch-shape')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [createRuntimeFile('AaOS6MOZUh8BFtEr.booking.csv', booking.rawInput.content)],
      month: '2026-03',
      generatedAt: '2026-03-20T14:15:00.000Z'
    })

    expect(result.preparedFiles[0]).toMatchObject({
      sourceSystem: 'booking',
      documentType: 'ota_report'
    })
    expect(result.extractedRecords[0]?.extractedCount).toBe(2)
    expect(booking.expectedExtractedRecords.map((record) => record.data.bookingPayoutBatchKey)).toEqual([
      'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
      'booking-batch:2026-03-12:PAYOUT-BOOK-20260310'
    ])
  })

  it('writes the generated upload page to disk when outputPath is provided', () => {
    const outputDir = resolve(process.cwd(), 'dist/test-upload-web')
    const outputPath = resolve(outputDir, 'index.html')
    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildUploadWebFlow({
      generatedAt: '2026-03-18T20:30:00.000Z',
      outputPath
    })

    expect(result.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('Tato verze zůstává čistě lokální a bez backendu')
  })

  it('prepares uploaded files through the shared monthly-batch and review pipeline', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const result = buildUploadedBatchPreview({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:30:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:30:00.000Z'
        }
      ],
      runId: 'upload-preview-run',
      generatedAt: '2026-03-18T20:30:00.000Z'
    })

    expect(result.importedFiles).toHaveLength(2)
    expect(result.importedFiles[0].sourceDocument).toMatchObject({
      sourceSystem: 'booking',
      documentType: 'ota_report',
      fileName: 'booking-payout-2026-03.csv'
    })
    expect(result.importedFiles[1].sourceDocument).toMatchObject({
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      fileName: 'raiffeisen-2026-03.csv'
    })
    expect(result.batch.reconciliation.summary.matchedGroupCount).toBe(1)
    expect(result.batch.files).toHaveLength(2)
    expect(result.review.matched).toHaveLength(1)
    expect(result.review.payoutBatchMatched).toHaveLength(1)
    expect(result.review.payoutBatchUnmatched).toHaveLength(0)
  })

  it('completes the truthful Airbnb-only uploaded browser and monthly path with one reservation row and three payout rows', () => {
    const airbnb = getRealInputFixture('airbnb-payout-export')

    const result = buildUploadedMonthlyRun({
      files: [
        {
          name: 'airbnb.csv',
          content: airbnb.rawInput.content,
          uploadedAt: '2026-03-21T15:00:00.000Z'
        }
      ],
      runId: 'airbnb-only-uploaded-monthly-run',
      generatedAt: '2026-03-21T15:00:00.000Z'
    })

    const browserRuntimePromise = createBrowserRuntime().buildRuntimeState({
      files: [createRuntimeFile('airbnb.csv', airbnb.rawInput.content)],
      month: '2026-03',
      generatedAt: '2026-03-21T15:00:00.000Z'
    })

    expect(result.importedFiles).toHaveLength(1)
    expect(result.importedFiles[0]?.sourceDocument).toMatchObject({
      sourceSystem: 'airbnb',
      documentType: 'ota_report',
      fileName: 'airbnb.csv'
    })

    expect(result.batch.files).toEqual([
      expect.objectContaining({
        sourceDocumentId: expect.any(String),
        extractedCount: 4,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2', 'airbnb-payout-3', 'airbnb-payout-4']
      })
    ])

    expect(result.batch.extractedRecords).toHaveLength(4)
    expect(result.batch.extractedRecords.filter((record: (typeof result.batch.extractedRecords)[number]) => record.recordType === 'payout-line')).toHaveLength(4)
    expect(result.batch.extractedRecords.filter((record: (typeof result.batch.extractedRecords)[number]) => record.data.rowKind === 'reservation')).toHaveLength(1)
    expect(result.batch.extractedRecords.filter((record: (typeof result.batch.extractedRecords)[number]) => record.data.rowKind === 'transfer')).toHaveLength(3)
    expect(result.report.transactions).toHaveLength(4)

    return browserRuntimePromise.then((browserRuntime) => {
      expect(browserRuntime.preparedFiles).toEqual([
        expect.objectContaining({
          fileName: 'airbnb.csv',
          sourceSystem: 'airbnb',
          documentType: 'ota_report'
        })
      ])
      expect(browserRuntime.extractedRecords).toEqual([
        expect.objectContaining({
          fileName: 'airbnb.csv',
          extractedCount: 4,
          extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2', 'airbnb-payout-3', 'airbnb-payout-4'],
          accountLabelCs: 'Airbnb payout report'
        })
      ])
      expect(browserRuntime.reportSummary.normalizedTransactionCount).toBe(4)
      expect(browserRuntime.reportTransactions).toHaveLength(4)
    })
  })

  it('renders a browser-visible review screen from the shared uploaded batch preview flow', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const outputDir = resolve(process.cwd(), 'dist/test-browser-review')
    const outputPath = resolve(outputDir, 'index.html')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildBrowserReviewScreen({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:35:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:35:00.000Z'
        }
      ],
      runId: 'browser-review-run',
      generatedAt: '2026-03-18T20:35:00.000Z',
      outputPath
    })

    expect(result.preview.review.matched).toHaveLength(1)
    expect(result.preview.review.payoutBatchMatched).toHaveLength(1)
    expect(result.preview.review.payoutBatchUnmatched).toHaveLength(0)
    expect(result.html).toContain('První kontrolní obrazovka měsíčního zpracování')
    expect(result.html).toContain('Spárované položky')
    expect(result.html).toContain('Nespárované payout dávky')
    expect(result.html).toContain('Nespárované položky')
    expect(result.html).toContain('Podezřelé položky')
    expect(result.html).toContain('Chybějící doklady')
    expect(result.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('Kontrola měsíce')
  })

  it('builds practical CSV and XLSX browser export files from the shared uploaded batch preview flow', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const outputDir = resolve(process.cwd(), 'dist/test-browser-export')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildBrowserExportPackage({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:40:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:40:00.000Z'
        }
      ],
      runId: 'browser-export-run',
      generatedAt: '2026-03-18T20:40:00.000Z',
      outputDir
    })

    expect(result.preview.review.matched).toHaveLength(1)
    expect(result.preview.review.payoutBatchMatched).toHaveLength(1)
    expect(result.preview.review.payoutBatchUnmatched).toHaveLength(0)
    expect(result.exports.files).toHaveLength(3)
    expect(result.exports.files.map((file) => file.fileName)).toContain('monthly-review-export.xlsx')
    expect(existsSync(resolve(outputDir, 'review-items.csv'))).toBe(true)
  })

  it('runs one real uploaded monthly flow through preparation, review, reporting, and export handoff', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const receipt = getRealInputFixture('receipt-document')

    const result = buildUploadedMonthlyRun({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:45:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:45:00.000Z'
        },
        {
          name: receipt.sourceDocument.fileName,
          content: receipt.rawInput.content,
          uploadedAt: '2026-03-18T20:45:00.000Z'
        }
      ],
      runId: 'uploaded-monthly-run',
      generatedAt: '2026-03-18T20:45:00.000Z'
    })

    expect(result.importedFiles).toHaveLength(3)
    expect(result.batch.files).toHaveLength(3)
    expect(result.report.summary).toEqual(result.batch.report.summary)
    expect(result.review.summary).toEqual(result.batch.report.summary)
    expect(result.exports.files.map((file) => file.fileName)).toEqual([
      'reconciliation-transactions.csv',
      'review-items.csv',
      'monthly-review-export.xlsx'
    ])
    expect(result.batch.reconciliation.normalizedTransactions.some((transaction) => transaction.id === 'txn:document:receipt-record-1')).toBe(true)
  })

  it('renders one browser-visible uploaded monthly run page and writes it to disk when requested', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const invoice = getRealInputFixture('invoice-document')
    const outputDir = resolve(process.cwd(), 'dist/test-uploaded-monthly-run')
    const outputPath = resolve(outputDir, 'index.html')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildBrowserUploadedMonthlyRun({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:50:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:50:00.000Z'
        },
        {
          name: invoice.sourceDocument.fileName,
          content: invoice.rawInput.content,
          uploadedAt: '2026-03-18T20:50:00.000Z'
        }
      ],
      runId: 'browser-uploaded-monthly-run',
      generatedAt: '2026-03-18T20:50:00.000Z',
      outputDir,
      outputPath
    })

    expect(result.run.report.transactions.length).toBeGreaterThan(0)
    expect(result.run.exports.files).toHaveLength(3)
    expect(result.html).toContain('Výsledek měsíčního zpracování z nahraných souborů')
    expect(result.html).toContain('Exporty připravené ke stažení')
    expect(result.html).toContain('Trasování nahraných souborů')
    expect(result.html).toContain('Částka')
    expect(result.html).toContain('1 250,00 Kč')
    expect(result.html).toContain('Chybějící doklady')
    expect(result.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('jeden skutečný deterministický běh')
    expect(existsSync(resolve(outputDir, 'monthly-review-export.xlsx'))).toBe(true)
  })
})

function createRuntimeFile(name: string, content: string) {
  return {
    name,
    async text() {
      return content
    }
  }
}

function createRuntimeArrayBufferTextFile(name: string, content: string, type = 'text/plain') {
  return {
    name,
    type,
    async text() {
      return content
    },
    async arrayBuffer() {
      const bytes = new TextEncoder().encode(content)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
  }
}

async function executeUploadWebFlowMainWorkflow(input: {
  generatedAt: string
  month: string
  files: Array<{
    name: string
    type?: string
    text?: () => Promise<string>
    arrayBuffer?: () => Promise<ArrayBuffer>
  }>
}): Promise<{
  html: string
  uploadSummary: StubDomElement
  runtimeOutput: StubDomElement
}> {
  const flow = buildUploadWebFlow({
    generatedAt: input.generatedAt
  })
  const script = extractUploadWebInlineScript(flow.html)
  const elements = createUploadWebDomStub()
  const windowObject = {
    __hotelFinanceCreateBrowserRuntime: createBrowserRuntime
  }

  runInNewContext(script, {
    window: windowObject,
    document: {
      getElementById(id: string) {
        return elements[id] ?? createStubDomElement(id, elements)
      }
    },
    console,
    Array
  })

  elements['monthly-files'].files = input.files
  elements['month-label'].value = input.month
  elements['prepare-upload'].listeners.click()

  for (let index = 0; index < 50; index += 1) {
    if (
      elements['runtime-output'].innerHTML.includes('3. Výsledek sdíleného měsíčního běhu')
      || elements['runtime-output'].innerHTML.includes('Zpracování se nepodařilo dokončit.')
    ) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    html: flow.html,
    uploadSummary: elements['upload-summary'],
    runtimeOutput: elements['runtime-output']
  }
}

function extractUploadWebInlineScript(html: string): string {
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/)

  if (!match?.[1]) {
    throw new Error('Upload-web inline script not found.')
  }

  const script = match[1]
  const runtimeStart = script.indexOf("const fileInput = document.getElementById('monthly-files');")

  if (runtimeStart === -1) {
    throw new Error('Upload-web runtime body not found.')
  }

  return script.slice(runtimeStart)
}

function createUploadWebDomStub(): Record<string, StubDomElement> {
  const elements: Record<string, StubDomElement> = {}
  const ids = [
    'monthly-files',
    'month-label',
    'prepare-upload',
    'upload-summary',
    'runtime-output'
  ]

  for (const id of ids) {
    createStubDomElement(id, elements)
  }

  return elements
}

interface StubDomElement {
  id: string
  innerHTML: string
  textContent: string
  hidden: boolean
  className: string
  value: string
  files: Array<{
    name: string
    type?: string
    text?: () => Promise<string>
    arrayBuffer?: () => Promise<ArrayBuffer>
    size?: number
  }>
  listeners: Record<string, () => void>
  setAttribute: (name: string, value: string) => void
  addEventListener: (name: string, listener: () => void) => void
}

function createStubDomElement(
  id: string,
  elements: Record<string, StubDomElement>
): StubDomElement {
  const element: StubDomElement = {
    id,
    innerHTML: '',
    textContent: '',
    hidden: false,
    className: '',
    value: '',
    files: [],
    listeners: {},
    setAttribute() {},
    addEventListener(name: string, listener: () => void) {
      element.listeners[name] = listener
    }
  }

  elements[id] = element
  return element
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

function createRuntimePdfFile(name: string, binaryContentBase64: string) {
  return {
    name,
    type: 'application/pdf',
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

function createRuntimePdfFileFromTextLines(name: string, lines: string[]) {
  return createRuntimePdfFile(name, buildRuntimePdfBase64FromTextLines(lines))
}

function createRuntimePdfFileFromToUnicodeTextLines(name: string, lines: string[]) {
  return createRuntimePdfFile(name, buildRuntimePdfBase64FromToUnicodeTextLines(lines))
}

function createBrokenRuntimePdfFile(name: string) {
  return {
    name,
    type: 'application/pdf',
    async text() {
      return ''
    },
    async arrayBuffer() {
      const bytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
  }
}

function buildRuntimePdfBase64FromTextLines(lines: string[]): string {
  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    ...lines.flatMap((line, index) => index === 0
      ? [`<${encodeRuntimePdfHexString(line)}> Tj`]
      : ['0 -18 Td', `<${encodeRuntimePdfHexString(line)}> Tj`]),
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

function buildRuntimePdfBase64FromToUnicodeTextLines(lines: string[]): string {
  const definition = buildToUnicodePdfDefinition(lines)
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${definition.contentStream.length} >>\nstream\n${definition.contentStream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /MockBookingFont /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>\nendobj\n',
    `6 0 obj\n<< /Length ${definition.toUnicodeStream.length} >>\nstream\n${definition.toUnicodeStream}\nendstream\nendobj\n`,
    '7 0 obj\n<< /Type /Font /Subtype /CIDFontType2 /BaseFont /MockBookingFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>\nendobj\n'
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

function buildToUnicodePdfDefinition(lines: string[]): {
  contentStream: string
  toUnicodeStream: string
} {
  const codeByCharacter = new Map<string, string>()
  const mappingEntries: Array<{ code: string; unicodeHex: string }> = []
  let nextCodePoint = 1

  const encodedLines = lines.map((line) =>
    Array.from(line).map((character) => {
      const existingCode = codeByCharacter.get(character)

      if (existingCode) {
        return existingCode
      }

      const code = nextCodePoint.toString(16).toUpperCase().padStart(4, '0')
      nextCodePoint += 1
      codeByCharacter.set(character, code)
      mappingEntries.push({
        code,
        unicodeHex: character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
      })
      return code
    }).join('')
  )

  const contentStream = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    ...encodedLines.flatMap((line, index) => index === 0
      ? [`<${line}> Tj`]
      : ['0 -18 Td', `<${line}> Tj`]),
    'ET'
  ].join('\n')

  const toUnicodeStream = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    `${mappingEntries.length} beginbfchar`,
    ...mappingEntries.map((entry) => `<${entry.code}> <${entry.unicodeHex}>`),
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end'
  ].join('\n')

  return {
    contentStream,
    toUnicodeStream
  }
}

function encodeRuntimePdfHexString(value: string): string {
  return Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
}

function buildBookingPayoutStatementVariantPdfLines(): string[] {
  return [
    'Booking.com',
    'Payment overview',
    'Payment ID: PAYOUT-BOOK-20260310',
    'Payment date: 2026-03-12',
    'Transfer total: 1 250,00 CZK',
    'IBAN: CZ65 5500 0000 0000 5599 555956',
    'Included reservations:',
    'RES-BOOK-8841 1 250,00 CZK'
  ]
}

function buildBooking35kBrowserUploadContent(): string {
  return [
    'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
    'Reservation;RES-BOOK-8841;2026-03-08;2026-03-10;Jan Novak;OK;CZK;Paid;35530,12;12 Mar 2026;PAYOUT-BOOK-20260310'
  ].join('\n')
}

function buildBooking35kBrowserUploadContentInEur(): string {
  return [
    'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
    'Reservation;RES-BOOK-8841;2026-03-08;2026-03-10;Jan Novak;OK;EUR;Paid;1456,42;12 Mar 2026;PAYOUT-BOOK-20260310'
  ].join('\n')
}

function buildCzechLateCueBookingPayoutStatementPdfLines(): string[] {
  return [
    'Chill apartment with city view and balcony',
    'Sokolská 55, Nové Město',
    '120 00 Prague 2',
    'Czech Republic',
    'Jokeland s.r.o.',
    'Property reference CHILL-APT-PRG',
    'Reservation contact summary',
    'Building access instructions',
    'Booking.com B.V.',
    'Výkaz plateb',
    'Datum vyplacení částky 12. března 2026',
    'ID platby 010638445054',
    'Celková částka k vyplacení € 1,456.42',
    'Celkem (CZK) 35,530.12 Kč',
    'IBAN CZ65 5500 0000 0000 5599 555956',
    'Rezervace RES-BOOK-8841'
  ]
}

function buildCzechSeparatedBlockBookingPayoutStatementPdfLines(): string[] {
  return [
    'Booking.com B.V.',
    'Výkaz plateb',
    'Datum vyplacení částky',
    'ID platby',
    'Celková částka k vyplacení',
    'Celkem (CZK)',
    'IBAN',
    '12. března 2026',
    '010638445054',
    '€ 1,456.42',
    '35,530.12 Kč',
    'CZ65 5500 0000 0000 5599 555956',
    'Rezervace RES-BOOK-8841'
  ]
}

function buildCzechWideGapBookingPayoutStatementPdfLines(): string[] {
  return [
    'Chill apartment with city view and balcony',
    'Sokolská 55, Nové Město',
    '120 00 Prague 2',
    'Czech Republic',
    'Jokeland s.r.o.',
    'Booking.com B.V.',
    'Výkaz plateb',
    'Datum vyplacení částky',
    'ID platby',
    'Celková částka k vyplacení',
    'Celkem (CZK)',
    'IBAN',
    'Reservation contact summary',
    'House rules acknowledgement',
    'Guest arrival instructions',
    'Late check-in details',
    'Reservation note A',
    'Reservation note B',
    'Reservation note C',
    'Reservation note D',
    'Reservation note E',
    'Reservation note F',
    'Reservation note G',
    'Reservation note H',
    'Reservation note I',
    'Reservation note J',
    'Reservation note K',
    'Reservation note L',
    '12. března 2026',
    '010638445054',
    '€ 1,456.42',
    '35,530.12 Kč',
    'CZ65 5500 0000 0000 5599 555956',
    'Rezervace RES-BOOK-8841'
  ]
}

function buildCzechFragmentedBookingPayoutStatementPdfLines(): string[] {
  return [
    'Chill apartment with city view and balcony',
    'Sokolská 55, Nové Město',
    '120 00 Prague 2',
    'Czech Republic',
    'Jokeland s.r.o.',
    'Booking.com B.V.',
    'Výkaz plateb',
    'Reservation contact summary',
    'Building access instructions',
    'Datum vyplacení částky',
    'Celková částka k vyplacení',
    'ID platby',
    'Celkem (CZK)',
    'IBAN',
    '12.',
    'března',
    '2026',
    '€ 1',
    ',456.42',
    '0106',
    '3844',
    '5054',
    '35,530.12 Kč',
    'CZ65 5500 0000 0000 5599 555956',
    'Rezervace RES-BOOK-8841'
  ]
}

function buildCzechSingleGlyphBookingPayoutStatementPdfLines(): string[] {
  return Array.from([
    'Chill apartments',
    'Sokolská 64',
    '120 00 Prague',
    'ID ubytování 2206371',
    'Booking.com B.V.',
    'Výkaz plateb',
    'Datum vyplacení částky 12. března 2026',
    'ID platby 010638445054',
    'Typ faktury',
    'Referenční číslo',
    'Typ platby',
    'Příjezd',
    'Odjezd',
    'Jméno hosta',
    'Měna',
    'Částka',
    'Rezervace 5029129741',
    'Reservation 6. března 2026 8. března 2026',
    'Celkem (CZK) 35,530.12 Kč',
    'Celková částka k vyplacení € 1,456.42',
    'Celková částka k vyplacení (CZK)',
    'Směnný kurz 24.3955',
    'Bankovní údaje',
    'IBAN CZ65 5500 0000 0000 5599 555956'
  ].join(''))
}

function buildBookingPayoutStatementFragmentedPdfLines(): string[] {
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
    'RES-BOOK-8841'
  ]
}

function buildBookingPayoutStatementGlyphSeparatedPdfLines(): string[] {
  return [
    'Booking.com',
    'Payment overview',
    'Payment ID: P A Y O U T - B O O K - 2 0 2 6 0 3 1 0',
    'Payment date: 2 0 2 6 - 0 3 - 1 2',
    'Transfer total: 1 2 5 0 , 0 0 C Z K',
    'IBAN: C Z 6 5 5 5 0 0 0 0 0 0 0 0 0 0 5 5 9 9 5 5 5 9 5 6',
    'Included reservations: RES-BOOK-8841 1 250,00 CZK'
  ]
}

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

function buildActualUploadedAirbnbContentWithoutDiacritics(): string {
  return [
    'Datum;Bude pripsan do dne;Typ;Datum zahajeni;Datum ukonceni;Host;Nabidka;Podrobnosti;Referencni kod;Potvrzujici kod;Mena;Castka;Vyplaceno;Servisni poplatek;Hrube vydelky',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-OC3WJE3SIXRO5;;CZK;;3 961,05;0,00;3 961,05',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 2;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-DXVK4YVI7MJVL;;CZK;;4 456,97;0,00;4 456,97',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 3;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-ZD5RVTGOHW3GE;;CZK;;7 059,94;0,00;7 059,94',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 4;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-ZWNWMP6UYWNI7;;CZK;;15 701,41;0,00;15 701,41',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 5;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-WLT46RY3MOZIF;;CZK;;1 112,59;0,00;1 112,59',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 6;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-L4RVQL6SE24XJ;;CZK;;1 152,81;0,00;1 152,81',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 7;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-TGCGGWASBTWWW;;CZK;;970,36;0,00;970,36',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 8;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-TKC6CS3OTDMGN;;CZK;;9 785,73;0,00;9 785,73',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 9;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-2F2LZZKYTRZ6E;;CZK;;3 518,94;0,00;3 518,94',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 10;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-MUEMMKRWRPQNQ;;CZK;;12 123,52;0,00;12 123,52',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 11;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-RFF4BW3JFXE6T;;CZK;;2 248,17;0,00;2 248,17',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 12;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-EPATNPP5RBQDW;;CZK;;2 492,32;0,00;2 492,32',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 13;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-JWVQXQVW6DET3;;CZK;;18 912,42;0,00;18 912,42',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 14;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-FE2CKQSBT6E7N;;CZK;;9 771,27;0,00;9 771,27',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 15;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-OLIOSSDGKKF3X;;CZK;;1 475,08;0,00;1 475,08',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 16;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-IZLCELA7C5EFN;;CZK;;8 241,96;0,00;8 241,96',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 17;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-6G5WFOJO5DJCI;;CZK;;1 117,01;0,00;1 117,01'
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

function buildActualUploadedRbCitiContentWithBookingPaymentIdMatch(): string {
  return [
    buildActualUploadedRbCitiContent(),
    '12.03.2026 09:10;12.03.2026 09:12;5599955956/5500;000000-9876543210/0300;Incoming bank transfer;35530,12;CZK;010638445054'
  ].join('\n')
}

function buildActualUploadedRbCitiContentWithBookingReferenceHintMatch(): string {
  return [
    buildActualUploadedRbCitiContent(),
    '13.03.2026 09:10;13.03.2026 09:12;5599955956/5500;000000-9876543210/0300;BOOKING.COM B.V.;35530,12;CZK;NO.AAOS6MOZUH8BFTER/2206371'
  ].join('\n')
}

function buildRealUploadedRbCitiContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(): string {
  return [
    buildRealUploadedRbCitiContentForSharedAirbnbPayouts(),
    '13.03.2026 09:10;13.03.2026 09:12;5599955956/5500;000000-9876543210/0300;BOOKING.COM B.V.;35530,12;CZK;NO.AAOS6MOZUH8BFTER/2206371'
  ].join('\n')
}

function buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(daysShift = 0): string {
  return [
    buildRealUploadedRbGenericContentForSharedAirbnbPayouts(daysShift),
    '13.03.2026 09:10;13.03.2026 09:12;5599955956/5500;000000-9876543210/0300;BOOKING.COM B.V.;35530,12;CZK;NO.AAOS6MOZUH8BFTER/2206371'
  ].join('\n')
}

function buildRealUploadedAirbnbContentWithoutReferenceColumn(): string {
  return [
    'Datum;Bude připsán do dne;Typ;Potvrzující kód;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
    ...getRealUploadedAirbnbTransferRowsWithoutReferenceColumn().map((row) => [
      row.sourceDate,
      row.payoutDate,
      'Payout',
      '',
      '',
      '',
      row.guestName,
      'Jokeland apartment',
      'Převod Jokeland s.r.o., IBAN 5956 (CZK)',
      'CZK',
      '',
      row.amountText,
      '0,00',
      row.amountText
    ].join(';'))
  ].join('\n')
}

function buildRealUploadedRbCitiContentForSharedAirbnbPayouts(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    ...getRealUploadedAirbnbTransferRowsWithoutReferenceColumn()
      .filter((row) => row.bankMatched)
      .map((row, index) => {
        const bookedAt = formatRbDateTime(row.payoutDate, 20 + index)
        const postedAt = formatRbDateTime(row.payoutDate, 23 + index)

        return [
          bookedAt,
          postedAt,
          '5599955956/5500',
          '000000-1234567890/0100',
          'CITIBANK EUROPE PLC',
          row.amountText.replace(/\s+/g, ''),
          'CZK',
          'Settlement credit'
        ].join(';')
      })
  ].join('\n')
}

function buildRealUploadedRbGenericContentForSharedAirbnbPayouts(daysShift = 0): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    ...getRealUploadedAirbnbTransferRowsWithoutReferenceColumn()
      .filter((row) => row.bankMatched)
      .map((row, index) => {
        const bookedAt = formatRbDateTime(row.payoutDate, 20 + index, daysShift)
        const postedAt = formatRbDateTime(row.payoutDate, 23 + index, daysShift)

        return [
          bookedAt,
          postedAt,
          '5599955956/5500',
          '000000-1234567890/0100',
          'Incoming bank transfer',
          row.amountText.replace(/\s+/g, ''),
          'CZK',
          'Settlement credit'
        ].join(';')
      })
  ].join('\n')
}

function withCrOnlyLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n/g, '\r')
}

function getRealUploadedAirbnbTransferRowsWithoutReferenceColumn(): Array<{
  sourceDate: string
  payoutDate: string
  guestName: string
  amountText: string
  bankMatched: boolean
}> {
  return [
    { sourceDate: '2026-03-18', payoutDate: '2026-03-20', guestName: 'Jan Novak', amountText: '3 961,05', bankMatched: true },
    { sourceDate: '2026-03-18', payoutDate: '2026-03-20', guestName: 'Host 2', amountText: '4 456,97', bankMatched: true },
    { sourceDate: '2026-03-18', payoutDate: '2026-03-20', guestName: 'Host 3', amountText: '7 059,94', bankMatched: true },
    { sourceDate: '2026-03-17', payoutDate: '2026-03-19', guestName: 'Host 4', amountText: '15 701,41', bankMatched: true },
    { sourceDate: '2026-03-16', payoutDate: '2026-03-18', guestName: 'Host 5', amountText: '1 112,59', bankMatched: true },
    { sourceDate: '2026-03-15', payoutDate: '2026-03-17', guestName: 'Host 6', amountText: '1 152,81', bankMatched: true },
    { sourceDate: '2026-03-14', payoutDate: '2026-03-16', guestName: 'Host 7', amountText: '970,36', bankMatched: true },
    { sourceDate: '2026-03-13', payoutDate: '2026-03-15', guestName: 'Host 8', amountText: '9 785,73', bankMatched: true },
    { sourceDate: '2026-03-12', payoutDate: '2026-03-14', guestName: 'Host 9', amountText: '3 518,94', bankMatched: true },
    { sourceDate: '2026-03-11', payoutDate: '2026-03-13', guestName: 'Host 10', amountText: '12 123,52', bankMatched: true },
    { sourceDate: '2026-03-11', payoutDate: '2026-03-13', guestName: 'Host 11', amountText: '2 248,17', bankMatched: true },
    { sourceDate: '2026-03-11', payoutDate: '2026-03-13', guestName: 'Host 12', amountText: '2 492,32', bankMatched: true },
    { sourceDate: '2026-03-10', payoutDate: '2026-03-12', guestName: 'Host 13', amountText: '18 912,42', bankMatched: true },
    { sourceDate: '2026-03-09', payoutDate: '2026-03-11', guestName: 'Host 14', amountText: '9 771,27', bankMatched: true },
    { sourceDate: '2026-03-08', payoutDate: '2026-03-10', guestName: 'Host 15', amountText: '1 475,08', bankMatched: true },
    { sourceDate: '2026-03-04', payoutDate: '2026-03-06', guestName: 'Host 16', amountText: '8 241,96', bankMatched: false },
    { sourceDate: '2026-03-04', payoutDate: '2026-03-06', guestName: 'Host 17', amountText: '1 117,01', bankMatched: false }
  ]
}

function formatRbDateTime(isoDate: string, minute: number, dayShift = 0): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + dayShift)
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${day}.${month}.${year} 06:${String(minute).padStart(2, '0')}`
}
