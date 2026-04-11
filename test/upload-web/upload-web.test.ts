import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import * as XLSX from 'xlsx'
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
        classificationBasis: 'content',
        parserId: 'invoice'
      })
    ])
    expect(result.monthLabel).toBe('neuvedeno')
    expect(result.extractedRecords.some((file) => file.extractedCount > 0)).toBe(true)
    expect(result.reportSummary.matchedGroupCount).toBeGreaterThan(0)
    expect(result.reportTransactions.length).toBeGreaterThan(0)
    expect(result.reviewSections.matched.length).toBeGreaterThan(0)
    expect(result.runtimeBuildInfo).toEqual(expect.objectContaining({
      gitCommitHash: expect.any(String),
      gitCommitShortSha: expect.any(String),
      buildTimestamp: '2026-03-19T10:00:00.000Z',
      buildBranch: expect.any(String),
      buildSource: expect.any(String),
      runtimeModuleVersion: expect.any(String)
    }))
    expect(result.runtimeBuildInfo.gitCommitHash.length).toBeGreaterThan(0)
    expect(result.runtimeBuildInfo.gitCommitShortSha.length).toBeGreaterThan(0)
    expect(result.runtimeBuildInfo.buildSource.length).toBeGreaterThan(0)
    expect(result.runtimeAudit.payoutDiagnostics.workflowPayoutReferences.length).toBeGreaterThanOrEqual(0)
    expect(result.supportedExpenseLinks.length).toBeGreaterThanOrEqual(0)
    expect(result.exportFiles.map((file) => file.fileName)).toEqual([
      'reconciliation-transactions.csv',
      'review-items.csv',
      'monthly-review-export.xlsx'
    ])
  })

  it('builds a browser upload state from the exact Raiffeisenbank GPC export shape through the shared bank flow', () => {
    const gpc = getRealInputFixture('raiffeisenbank-gpc-statement')

    const result = buildBrowserRuntimeUploadState({
      files: [
        {
          name: gpc.sourceDocument.fileName,
          content: gpc.rawInput.content,
          uploadedAt: '2026-03-20T10:10:00.000Z'
        }
      ],
      runId: 'runtime-browser-upload-raiffeisen-gpc',
      generatedAt: '2026-03-20T10:10:00.000Z'
    })

    expect(result.preparedFiles).toHaveLength(1)
    expect(result.preparedFiles[0]).toMatchObject({
      fileName: 'Vypis_5599955956_CZK_2026_002.gpc',
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      classificationBasis: 'content'
    })
    expect(result.fileRoutes[0]).toMatchObject({
      status: 'supported',
      sourceSystem: 'bank',
      parserId: 'raiffeisenbank'
    })
    expect(result.extractedRecords[0]).toMatchObject({
      fileName: 'Vypis_5599955956_CZK_2026_002.gpc',
      extractedCount: 10,
      accountLabelCs: 'RB účet 5599955956',
      parserDebugLabel: 'raiffeisenbank-gpc'
    })
    expect(result.reportTransactions.length).toBeGreaterThan(0)
    expect(result.reportTransactions.every((item) => item.amount.includes('Kč'))).toBe(true)
    expect(result.reviewSections.expenseUnmatchedInflows.length).toBeGreaterThan(0)
    expect(result.reviewSections.expenseUnmatchedOutflows.length).toBeGreaterThan(0)
  })

  it('builds a browser upload state from the exact Fio GPC export shape through the shared bank flow', () => {
    const gpc = getRealInputFixture('fio-gpc-statement')

    const result = buildBrowserRuntimeUploadState({
      files: [
        {
          name: gpc.sourceDocument.fileName,
          content: gpc.rawInput.content,
          uploadedAt: '2026-04-03T17:45:00.000Z'
        }
      ],
      runId: 'runtime-browser-upload-fio-gpc',
      generatedAt: '2026-04-03T17:45:00.000Z'
    })

    expect(result.preparedFiles).toHaveLength(1)
    expect(result.preparedFiles[0]).toMatchObject({
      fileName: 'Vypis_z_uctu-8888997777_20260301-20260331_cislo-3.gpc',
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      classificationBasis: 'content'
    })
    expect(result.fileRoutes[0]).toMatchObject({
      status: 'supported',
      sourceSystem: 'bank',
      parserId: 'fio'
    })
    expect(result.extractedRecords[0]).toMatchObject({
      fileName: 'Vypis_z_uctu-8888997777_20260301-20260331_cislo-3.gpc',
      extractedCount: 7,
      accountLabelCs: 'Fio účet 8888997777',
      parserDebugLabel: 'fio-gpc'
    })
    expect(result.reportTransactions.length).toBeGreaterThan(0)
    expect(result.reviewSections.expenseUnmatchedInflows.length).toBeGreaterThan(0)
    expect(result.reviewSections.expenseUnmatchedOutflows.length).toBeGreaterThan(0)
  })

  it('keeps the exact direction-code-4 Raiffeisenbank GPC file on the supported bank path instead of ingest failure', () => {
    const gpc = getRealInputFixture('raiffeisenbank-gpc-statement-direction-4')

    const result = buildBrowserRuntimeUploadState({
      files: [
        {
          name: gpc.sourceDocument.fileName,
          content: gpc.rawInput.content,
          uploadedAt: '2026-03-20T10:20:00.000Z'
        }
      ],
      runId: 'runtime-browser-upload-raiffeisen-gpc-direction-4',
      generatedAt: '2026-03-20T10:20:00.000Z'
    })

    expect(result.preparedFiles).toHaveLength(1)
    expect(result.preparedFiles[0]).toMatchObject({
      fileName: 'Vypis_5599955956_CZK_2026_003.gpc',
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      classificationBasis: 'content'
    })
    expect(result.fileRoutes[0]).toMatchObject({
      fileName: 'Vypis_5599955956_CZK_2026_003.gpc',
      status: 'supported',
      sourceSystem: 'bank',
      parserId: 'raiffeisenbank',
      classificationBasis: 'content'
    })
    expect(result.extractedRecords[0]).toMatchObject({
      fileName: 'Vypis_5599955956_CZK_2026_003.gpc',
      extractedCount: 5,
      accountLabelCs: 'RB účet 5599955956',
      parserDebugLabel: 'raiffeisenbank-gpc'
    })
    expect(result.fileRoutes.some((route) => route.status === 'error')).toBe(false)
    expect(result.reportTransactions.every((item) => item.amount.includes('Kč'))).toBe(true)
  })

  it('keeps Fio GPC, Fio CSV, RB CSV, and RB GPC browser bank uploads supported together', () => {
    const gpcLegacy = getRealInputFixture('raiffeisenbank-gpc-statement')
    const gpcDirection4 = getRealInputFixture('raiffeisenbank-gpc-statement-direction-4')
    const fioGpc = getRealInputFixture('fio-gpc-statement')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const fio = getRealInputFixture('fio-statement')

    const result = buildBrowserRuntimeUploadState({
      files: [
        {
          name: gpcLegacy.sourceDocument.fileName,
          content: gpcLegacy.rawInput.content,
          uploadedAt: '2026-03-20T10:30:00.000Z'
        },
        {
          name: gpcDirection4.sourceDocument.fileName,
          content: gpcDirection4.rawInput.content,
          uploadedAt: '2026-03-20T10:31:00.000Z'
        },
        {
          name: fioGpc.sourceDocument.fileName,
          content: fioGpc.rawInput.content,
          uploadedAt: '2026-04-03T17:46:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-20T10:32:00.000Z'
        },
        {
          name: fio.sourceDocument.fileName,
          content: fio.rawInput.content,
          uploadedAt: '2026-03-20T10:33:00.000Z'
        }
      ],
      runId: 'runtime-browser-upload-bank-regression-guard',
      generatedAt: '2026-03-20T10:33:00.000Z'
    })

    expect(result.fileRoutes).toHaveLength(5)
    expect(result.fileRoutes.every((route) => route.status === 'supported')).toBe(true)
    expect(result.fileRoutes.map((route) => route.fileName)).toEqual([
      'Vypis_5599955956_CZK_2026_002.gpc',
      'Vypis_5599955956_CZK_2026_003.gpc',
      'Vypis_z_uctu-8888997777_20260301-20260331_cislo-3.gpc',
      'raiffeisen-2026-03.csv',
      'fio-2026-03.csv'
    ])
    expect(result.extractedRecords.slice(0, 3).map((file) => file.parserDebugLabel)).toEqual([
      'raiffeisenbank-gpc',
      'raiffeisenbank-gpc',
      'fio-gpc'
    ])
    expect(result.extractedRecords.every((file) => file.extractedCount > 0)).toBe(true)
    expect(result.extractedRecords[3]).toMatchObject({
      fileName: 'raiffeisen-2026-03.csv',
      parserDebugLabel: 'raiffeisenbank'
    })
    expect(result.extractedRecords[4]).toMatchObject({
      fileName: 'fio-2026-03.csv',
      extractedCount: expect.any(Number)
    })
  })

  it('keeps Fio parser truth and incoming-bank visibility intact next to both RB CSV and RB GPC uploads', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const fio = getRealInputFixture('fio-statement')

    for (const scenario of [
      {
        bank: getRealInputFixture('raiffeisenbank-statement'),
        expectedBankParser: 'raiffeisenbank'
      },
      {
        bank: getRealInputFixture('raiffeisenbank-gpc-statement'),
        expectedBankParser: 'raiffeisenbank-gpc'
      }
    ] as const) {
      const result = await buildBrowserRuntimeStateFromSelectedFiles({
        files: [
          createRuntimeArrayBufferTextFile(scenario.bank.sourceDocument.fileName, scenario.bank.rawInput.content, 'text/plain'),
          createRuntimeArrayBufferTextFile(fio.sourceDocument.fileName, fio.rawInput.content, 'text/csv'),
          createRuntimePdfFileFromToUnicodeTextLines(invoice.sourceDocument.fileName, invoice.rawInput.content.split('\n'))
        ],
        month: '2026-03',
        generatedAt: '2026-04-03T10:15:00.000Z'
      })

      expect(result.extractedRecords.find((file) => file.fileName === scenario.bank.sourceDocument.fileName)).toMatchObject({
        parserDebugLabel: scenario.expectedBankParser
      })
      expect(result.extractedRecords.find((file) => file.fileName === fio.sourceDocument.fileName)).toMatchObject({
        parserDebugLabel: 'fio',
        extractedRecordIds: ['fio-row-1', 'fio-row-2']
      })

      const fioInflows = result.reviewSections.expenseUnmatchedInflows.filter((item) =>
        item.expenseComparison?.bank?.supplierOrCounterparty === 'EXPEDIA TERMINAL'
      )
      const fioOutflows = result.reviewSections.expenseUnmatchedOutflows.filter((item) =>
        item.expenseComparison?.bank?.supplierOrCounterparty === 'EXPEDIA TERMINAL'
      )
      const visibleBankTransactionIds = [
        ...result.reviewSections.expenseUnmatchedInflows.flatMap((item) => item.transactionIds),
        ...result.reviewSections.expenseUnmatchedOutflows.flatMap((item) => item.transactionIds)
      ]

      expect(fioInflows.map((item) => item.expenseComparison?.bank?.reference)).toEqual(['EXP-TERM-1001', 'EXP-TERM-1002'])
      expect(fioInflows.map((item) => item.transactionIds[0])).toEqual(['txn:bank:fio-row-1', 'txn:bank:fio-row-2'])
      expect(fioOutflows).toEqual([])
      expect(new Set(visibleBankTransactionIds).size).toBe(visibleBankTransactionIds.length)
    }
  })

  it('keeps exact Fio GPC bank rows visible next to both RB CSV and RB GPC uploads', async () => {
    const fioGpc = getRealInputFixture('fio-gpc-statement')

    for (const scenario of [
      {
        bank: getRealInputFixture('raiffeisenbank-statement'),
        expectedBankParser: 'raiffeisenbank'
      },
      {
        bank: getRealInputFixture('raiffeisenbank-gpc-statement'),
        expectedBankParser: 'raiffeisenbank-gpc'
      }
    ] as const) {
      const result = await buildBrowserRuntimeStateFromSelectedFiles({
        files: [
          createRuntimeArrayBufferTextFile(scenario.bank.sourceDocument.fileName, scenario.bank.rawInput.content, 'text/plain'),
          createRuntimeArrayBufferTextFile(fioGpc.sourceDocument.fileName, fioGpc.rawInput.content, 'text/plain')
        ],
        month: '2026-03',
        generatedAt: '2026-04-03T17:50:00.000Z'
      })

      expect(result.extractedRecords.find((file) => file.fileName === scenario.bank.sourceDocument.fileName)).toMatchObject({
        parserDebugLabel: scenario.expectedBankParser
      })
      expect(result.extractedRecords.find((file) => file.fileName === fioGpc.sourceDocument.fileName)).toMatchObject({
        parserDebugLabel: 'fio-gpc',
        extractedCount: 7
      })

      const visibleFioBankTransactionIds = [
        ...result.reviewSections.expenseUnmatchedInflows.flatMap((item) => item.transactionIds),
        ...result.reviewSections.expenseUnmatchedOutflows.flatMap((item) => item.transactionIds)
      ].filter((transactionId) => transactionId.startsWith('txn:bank:fio-row-'))

      expect(visibleFioBankTransactionIds.length).toBeGreaterThan(0)
      expect(new Set(visibleFioBankTransactionIds).size).toBe(visibleFioBankTransactionIds.length)
    }
  })

  it('keeps standalone Fio and standalone RB GPC browser uploads parser-truthful', async () => {
    const fio = getRealInputFixture('fio-statement')
    const gpc = getRealInputFixture('raiffeisenbank-gpc-statement')

    const fioOnly = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(fio.sourceDocument.fileName, fio.rawInput.content, 'text/csv')
      ],
      month: '2026-03',
      generatedAt: '2026-04-03T10:20:00.000Z'
    })

    expect(fioOnly.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'fio-2026-03.csv',
        parserDebugLabel: 'fio',
        extractedRecordIds: ['fio-row-1', 'fio-row-2']
      })
    ])
    expect(fioOnly.reviewSections.expenseUnmatchedOutflows).toEqual([])
    expect(fioOnly.reviewSections.expenseUnmatchedInflows.map((item) => item.transactionIds[0])).toEqual([
      'txn:bank:fio-row-1',
      'txn:bank:fio-row-2'
    ])

    const gpcOnly = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(gpc.sourceDocument.fileName, gpc.rawInput.content, 'text/plain')
      ],
      month: '2026-03',
      generatedAt: '2026-04-03T10:21:00.000Z'
    })

    expect(gpcOnly.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'Vypis_5599955956_CZK_2026_002.gpc',
        parserDebugLabel: 'raiffeisenbank-gpc'
      })
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

  it('completes a larger mixed browser upload set progressively, isolates a broken PDF, and preserves the payout baseline', async () => {
    const bookingInvoice = getRealInputFixture('booking-invoice-pdf')
    const qrInvoice = getRealInputFixture('invoice-document-czech-pdf-with-spd-qr')
    const scanInvoice = getRealInputFixture('invoice-document-scan-pdf-with-ocr-stub')
    const handwrittenReceipt = getRealInputFixture('receipt-document-handwritten-pdf-with-ocr-stub')
    const lennerInvoice = getRealInputFixture('invoice-document')
    const dobraPayableInvoice = getRealInputFixture('invoice-document-dobra-energie-pdf')
    const dobraRefundInvoice = getRealInputFixture('invoice-document-dobra-energie-refund-pdf')
    const sparseRefundInvoice = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')
    const czechInvoice = getRealInputFixture('invoice-document-czech-pdf')
    const receipt = getRealInputFixture('receipt-document')
    const progressUpdates: Array<{ stage: string; completedFiles: number; totalFiles: number; currentFileName?: string }> = []

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbCitiContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFile(bookingInvoice.sourceDocument.fileName, bookingInvoice.rawInput.binaryContentBase64!),
        createRuntimePdfFile(qrInvoice.sourceDocument.fileName, qrInvoice.rawInput.binaryContentBase64!),
        createRuntimePdfFile(scanInvoice.sourceDocument.fileName, scanInvoice.rawInput.binaryContentBase64!),
        createRuntimePdfFile(handwrittenReceipt.sourceDocument.fileName, handwrittenReceipt.rawInput.binaryContentBase64!),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner-large-1.pdf', lennerInvoice.rawInput.content.split('\n')),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner-large-2.pdf', lennerInvoice.rawInput.content.split('\n')),
        createRuntimePdfFileFromToUnicodeTextLines('Dobra-large-payable-1.pdf', dobraPayableInvoice.rawInput.content.split('\n')),
        createRuntimePdfFileFromToUnicodeTextLines('Dobra-large-payable-2.pdf', dobraPayableInvoice.rawInput.content.split('\n')),
        createRuntimePdfFile('Dobra-Energie-preplatek-2026-03.pdf', dobraRefundInvoice.rawInput.binaryContentBase64!),
        createRuntimePdfFile('Dobra-Energie-preplatek-3804-2026-03.pdf', sparseRefundInvoice.rawInput.binaryContentBase64!),
        createRuntimePdfFileFromToUnicodeTextLines('Large-extra-invoice-a.pdf', czechInvoice.rawInput.content.split('\n')),
        createRuntimePdfFileFromToUnicodeTextLines('Large-extra-invoice-b.pdf', czechInvoice.rawInput.content.split('\n')),
        createRuntimePdfFileFromToUnicodeTextLines('Large-extra-receipt.pdf', receipt.rawInput.content.split('\n')),
        createBrokenRuntimePdfFile('broken-large-upload.pdf')
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T10:15:00.000Z',
      onProgress(progress) {
        progressUpdates.push({
          stage: progress.stage,
          completedFiles: progress.completedFiles,
          totalFiles: progress.totalFiles,
          currentFileName: progress.currentFileName
        })
      }
    })

    expect(result.fileRoutes).toHaveLength(18)
    expect(result.routingSummary.uploadedFileCount).toBe(18)
    expect(result.routingSummary.unsupportedFileCount).toBe(1)
    expect(result.routingSummary.errorFileCount).toBe(0)
    expect(result.fileRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'broken-large-upload.pdf',
          status: 'unsupported',
          intakeStatus: 'unsupported'
        })
      ])
    )
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
    expect(progressUpdates.some((progress) => progress.stage === 'preparing-selected-files' && progress.totalFiles === 18)).toBe(true)
    expect(progressUpdates.some((progress) => progress.stage === 'classifying-files')).toBe(true)
    expect(progressUpdates.some((progress) => progress.stage === 'parsing-files')).toBe(true)
    expect(progressUpdates.some((progress) => progress.stage === 'finalizing')).toBe(true)
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

  it('routes invoice_list.xls through workbook signature in the real browser runtime path and exposes signature diagnostics', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [createRuntimeWorkbookFile('invoice_list.xls', buildInvoiceListWorkbookBase64())],
      month: '2026-03',
      generatedAt: '2026-03-21T09:05:30.000Z'
    })

    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'invoice_list.xls',
        sourceSystem: 'previo',
        documentType: 'invoice_list',
        classificationBasis: 'binary-workbook',
        parserId: 'previo',
        extractedCount: expect.any(Number),
        decision: expect.objectContaining({
          runtimeWorkbookSignatureDiagnostics: expect.objectContaining({
            workbookSignatureFunctionReached: true,
            workbookSignatureDetectorName: 'detectInvoiceListWorkbookSignature',
            workbookReadSucceeded: true,
            workbookSheetNamesRaw: expect.arrayContaining(['Seznam dokladů']),
            workbookSheetNamesNormalized: expect.arrayContaining(['seznam dokladu']),
            workbookSignatureFailureReason: ''
          }),
          matchedRules: expect.arrayContaining(['binary-workbook-signature'])
        })
      })
    ])
    expect(result.fileRoutes[0]?.extractedCount ?? 0).toBeGreaterThan(0)
  })

  it('routes production invoice_list.xls workbook shape from Doklady/Položky dokladů in browser runtime', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [createRuntimeWorkbookFile('invoice_list.xls', buildInvoiceListProductionWorkbookBase64())],
      month: '2026-03',
      generatedAt: '2026-03-21T09:05:40.000Z'
    })

    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'invoice_list.xls',
        sourceSystem: 'previo',
        documentType: 'invoice_list',
        classificationBasis: 'binary-workbook',
        parserId: 'previo',
        extractedCount: expect.any(Number),
        decision: expect.objectContaining({
          runtimeWorkbookSignatureDiagnostics: expect.objectContaining({
            workbookSignatureFunctionReached: true,
            workbookReadSucceeded: true,
            workbookSignatureFailureReason: '',
            invoiceListPrimarySheetUsed: 'Doklady',
            invoiceListLineItemsSheetUsed: 'Položky dokladů',
            invoiceListPrimaryDetectedHeaderRowIndex: 2,
            invoiceListLineItemsDetectedHeaderRowIndex: 2
          }),
          matchedRules: expect.arrayContaining(['binary-workbook-signature'])
        })
      })
    ])
    expect(result.fileRoutes[0]?.extractedCount ?? 0).toBeGreaterThan(0)
    expect(result.fileRoutes[0]?.sourceSystem).not.toBe('invoice')
  })

  it('classifies and extracts the real Previo XLSX workbook shape even when the filename is generic', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', buildPrevioBrowserShapeWorkbookBase64())],
      month: '2026-03',
      generatedAt: '2026-03-21T09:06:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 1,
      supportedFileCount: 1,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'reservations-export-2026-03.xlsx',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'previo',
        documentType: 'reservation_export',
        classificationBasis: 'binary-workbook'
      })
    ])
    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'reservations-export-2026-03.xlsx',
        sourceSystem: 'previo',
        documentType: 'reservation_export'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'reservations-export-2026-03.xlsx',
        extractedCount: 1,
        accountLabelCs: 'Previo rezervační export'
      })
    ])
  })

  it('keeps bank, OTA, Comgate, and the new Previo workbook intake supported in the same browser run', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const comgate = getRealInputFixture('comgate-export-current-portal')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile('reservations-export-2026-03.xlsx', buildPrevioBrowserShapeWorkbookBase64()),
        createRuntimeFile('booking35k.csv', booking.rawInput.content),
        createRuntimeFile('Pohyby_5599955956_202603191023.csv', buildActualUploadedRbCitiContent()),
        createRuntimeFile('Klientsky_portal_comgate_2026_03_31.csv', comgate.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T09:07:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 4,
      supportedFileCount: 4,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({ fileName: 'reservations-export-2026-03.xlsx', sourceSystem: 'previo', status: 'supported' }),
      expect.objectContaining({ fileName: 'booking35k.csv', sourceSystem: 'booking', status: 'supported' }),
      expect.objectContaining({ fileName: 'Pohyby_5599955956_202603191023.csv', sourceSystem: 'bank', status: 'supported' }),
      expect.objectContaining({ fileName: 'Klientsky_portal_comgate_2026_03_31.csv', sourceSystem: 'comgate', status: 'supported' })
    ]))
  })

  it('shows exact matched Previo reservations against Booking reservation rows in browser runtime state', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile(
          'reservations-export-2026-03.xlsx',
          buildPrevioWorkbookBase64FromRows([
            {
              createdAt: '02.03.2026 09:15',
              stayStartAt: '03.03.2026',
              stayEndAt: '04.03.2026',
              voucher: '5178029336',
              guestName: 'Booking Guest 1',
              channel: 'booking',
              amountText: '44,80 EUR',
              roomName: 'A101'
            },
            {
              createdAt: '20.02.2026 10:00',
              stayStartAt: '25.02.2026',
              stayEndAt: '11.03.2026',
              voucher: '5212240106',
              guestName: 'Booking Guest 2',
              channel: 'booking',
              amountText: '856,10 EUR',
              roomName: 'A102'
            },
            {
              createdAt: '22.03.2026 13:30',
              stayStartAt: '24.03.2026',
              stayEndAt: '25.03.2026',
              voucher: '6027430941',
              guestName: 'Booking Guest 3',
              channel: 'booking',
              amountText: '64,00 EUR',
              roomName: 'A103'
            }
          ])
        ),
        createRuntimeFile(
          'booking-exact.csv',
          buildBookingBrowserUploadContentFromRows([
            {
              reservationId: '5178029336',
              checkIn: '2026-03-03',
              checkout: '2026-03-04',
              guestName: 'Booking Guest 1',
              currency: 'EUR',
              amountText: '44,80',
              payoutDate: '12 Mar 2026',
              payoutId: '015022808386'
            },
            {
              reservationId: '5212240106',
              checkIn: '2026-02-25',
              checkout: '2026-03-11',
              guestName: 'Booking Guest 2',
              currency: 'EUR',
              amountText: '856,10',
              payoutDate: '12 Mar 2026',
              payoutId: '010638445054'
            },
            {
              reservationId: '6027430941',
              checkIn: '2026-03-24',
              checkout: '2026-03-25',
              guestName: 'Booking Guest 3',
              currency: 'EUR',
              amountText: '64,00',
              payoutDate: '24 Mar 2026',
              payoutId: '010738140021'
            }
          ])
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T10:00:00.000Z'
    })

    expect(result.reviewSections.reservationSettlementOverview).toHaveLength(3)
    expect(result.reviewSections.reservationSettlementOverview).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Rezervace 5178029336',
        matchStrength: 'potvrzená shoda',
        transactionIds: ['txn:payout:booking-payout-1']
      }),
      expect.objectContaining({
        title: 'Rezervace 5212240106',
        matchStrength: 'potvrzená shoda',
        transactionIds: ['txn:payout:booking-payout-2']
      }),
      expect.objectContaining({
        title: 'Rezervace 6027430941',
        matchStrength: 'potvrzená shoda',
        transactionIds: ['txn:payout:booking-payout-3']
      })
    ]))
    expect(result.reviewSections.reservationSettlementOverview.every((item) => item.detail.includes('Kanál: Booking.'))).toBe(true)
    expect(result.reviewSections.unmatchedReservationSettlements).toEqual([])
  })

  it('shows exact Airbnb voucher-code matches from Previo in browser runtime state without changing payout batch totals', async () => {
    const airbnbContent = buildRealMixedAirbnbVoucherMatchContent()
    const expectedVoucherTitles = [
      'Rezervace HM35X35WJ8',
      'Rezervace HM4S532B32',
      'Rezervace HMXWSA222M',
      'Rezervace HMSPW3X3T9',
      'Rezervace HMY8K5DYTB'
    ]

    const baseline = await createBrowserRuntime().buildRuntimeState({
      files: [createRuntimeFile('airbnb.csv', airbnbContent)],
      month: '2026-03',
      generatedAt: '2026-03-26T10:55:00.000Z'
    })

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile(
          'reservations-export-2026-03.xlsx',
          buildPrevioWorkbookBase64FromRows([
            {
              createdAt: '07.03.2026 09:00',
              stayStartAt: '07.03.2026 14:00',
              stayEndAt: '08.03.2026 11:00',
              voucher: 'HM35X35WJ8',
              guestName: 'Eliška Geržová',
              channel: 'airbnb',
              amountText: '83,70 EUR',
              roomName: 'B201'
            },
            {
              createdAt: '07.03.2026 09:05',
              stayStartAt: '07.03.2026 14:00',
              stayEndAt: '08.03.2026 11:00',
              voucher: 'HM4S532B32',
              guestName: 'Tomasz Rybarski',
              channel: 'airbnb',
              amountText: '87,00 EUR',
              roomName: 'B202'
            },
            {
              createdAt: '08.03.2026 08:15',
              stayStartAt: '08.03.2026 14:00',
              stayEndAt: '09.03.2026 11:00',
              voucher: 'HMXWSA222M',
              guestName: 'Patrik Ševčík',
              channel: 'airbnb',
              amountText: '47,00 EUR',
              roomName: 'B203'
            },
            {
              createdAt: '09.03.2026 07:50',
              stayStartAt: '09.03.2026 14:00',
              stayEndAt: '10.03.2026 11:00',
              voucher: 'HMSPW3X3T9',
              guestName: 'Sanjar Kakharov',
              channel: 'airbnb',
              amountText: '56,00 EUR',
              roomName: 'B204'
            },
            {
              createdAt: '12.03.2026 08:45',
              stayStartAt: '12.03.2026 14:00',
              stayEndAt: '14.03.2026 11:00',
              voucher: 'HMY8K5DYTB',
              guestName: 'Yağız Alp Kayhan',
              channel: 'airbnb',
              amountText: '144,90 EUR',
              roomName: 'B205'
            }
          ])
        ),
        createRuntimeFile('airbnb.csv', airbnbContent)
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T11:00:00.000Z'
    })

    expect(result.reviewSections.reservationSettlementOverview).toHaveLength(expectedVoucherTitles.length)
    expect(result.reviewSections.reservationSettlementOverview).toEqual(expect.arrayContaining(
      expectedVoucherTitles.map((title) =>
        expect.objectContaining({
          title,
          matchStrength: 'potvrzená shoda'
        })
      )
    ))
    expect(result.reviewSections.reservationSettlementOverview.every((item) => item.detail.includes('Kanál: Airbnb.'))).toBe(true)
    expect(result.reviewSections.reservationSettlementOverview).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Rezervace HM35X35WJ8', transactionIds: ['txn:payout:airbnb-payout-8'] }),
      expect.objectContaining({ title: 'Rezervace HM4S532B32', transactionIds: ['txn:payout:airbnb-payout-9'] }),
      expect.objectContaining({ title: 'Rezervace HMXWSA222M', transactionIds: ['txn:payout:airbnb-payout-6'] }),
      expect.objectContaining({ title: 'Rezervace HMSPW3X3T9', transactionIds: ['txn:payout:airbnb-payout-4'] }),
      expect.objectContaining({ title: 'Rezervace HMY8K5DYTB', transactionIds: ['txn:payout:airbnb-payout-2'] })
    ]))
    expect(result.reviewSections.unmatchedReservationSettlements).toEqual([])
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(baseline.reviewSections.payoutBatchMatched.length)
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(baseline.reviewSections.payoutBatchUnmatched.length)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(baseline.reportSummary.payoutBatchMatchCount)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(baseline.reportSummary.unmatchedPayoutBatchCount)
  })

  it('routes the real JOKELAND client-portal CSV through the Comgate browser-upload path instead of failing as unsupported', async () => {
    const fixture = getRealInputFixture('comgate-export-current-portal')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'Klientský portál export transakcí JOKELAND s.r.o..csv',
          fixture.rawInput.content
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
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Klientský portál export transakcí JOKELAND s.r.o..csv',
        intakeStatus: 'parsed',
        parserSupported: true,
        sourceSystem: 'comgate'
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Klientský portál export transakcí JOKELAND s.r.o..csv',
        comgateHeaderDiagnostics: expect.objectContaining({
          detectedDelimiter: ';',
          parserVariant: 'current-portal',
          missingCanonicalHeaders: []
        })
      })
    )
    expect(result.reportSummary.normalizedTransactionCount).toBe(2)
    expect(result.reportTransactions).toHaveLength(2)
  })

  it('routes the attached daily Comgate settlement CSV into a supported daily-settlement Comgate parser branch', async () => {
    const fixture = getRealInputFixture('comgate-daily-payout-export')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          fixture.sourceDocument.fileName,
          fixture.rawInput.content
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-01T08:10:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 1,
      supportedFileCount: 1,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'vypis-2026-03-27_1816656820.csv',
        sourceSystem: 'comgate',
        documentType: 'payment_gateway_report',
        parserId: 'comgate'
      })
    ])
    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        extractedCount: 3,
        accountLabelCs: 'Comgate platební report'
      })
    ])
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'vypis-2026-03-27_1816656820.csv',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'comgate',
        documentType: 'payment_gateway_report',
        parserId: 'comgate'
      })
    ])
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'vypis-2026-03-27_1816656820.csv',
        sourceSystem: 'comgate',
        documentType: 'payment_gateway_report',
        status: 'supported',
        intakeStatus: 'parsed',
        parserSupported: true,
        comgateHeaderDiagnostics: expect.objectContaining({
          detectedFileKind: 'daily-settlement',
          parserVariant: 'daily-settlement',
          rawHeaders: ['Merchant', 'ID ComGate', 'Metoda', 'Potvrzen� ��stka', 'P�eveden� ��stka', 'Produkt', 'Variabiln� symbol p�evodu', 'ID od klienta'],
          canonicalHeaders: ['merchant', 'transactionId', 'paymentMethod', 'confirmedAmountMinor', 'transferredAmountMinor', 'product', 'transferReference', 'clientId'],
          containsExplicitSettlementTotal: true,
          explicitSettlementTotalMinor: 605879,
          componentRowCount: 3
        }),
        comgatePipelineDiagnostics: expect.objectContaining({
          parserVariants: ['daily-settlement'],
          extractedRecordCount: 3,
          normalizedTransactionCount: 3,
          matchingInputPayoutRowCount: 3,
          payoutBatchCount: 1,
          matchingDecisionCount: 1,
          lossBoundary: 'matching',
          lossStage: 'no-bank-candidates'
        })
      })
    )
    expect(result.reportSummary.payoutBatchMatchCount).toBe(0)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(1)
    expect(result.reviewSections.payoutBatchMatched).toEqual([])
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(1)
    expect(result.reviewSections.payoutBatchUnmatched[0]?.title).toContain('Comgate payout dávka')
  })

  it('routes real monthly Comgate mojibake CSV headers into monthly-settlement and preserves Popis/VS/client anchors in runtime normalization', async () => {
    const content = [
      '"Merchant";"Datum zalo�en�";"Datum zaplacen�";"Datum p�evodu";"M�s�c fakturace";"ID ComGate";"Metoda";"Produkt";"Popis";"E-mail pl�tce";"Variabiln� symbol pl�tce";"Variabiln� symbol p�evodu";"ID od klienta";"M�na";"Potvrzen� ��stka";"P�eveden� ��stka";"Poplatek celkem";"Poplatek mezibankovn�";"Poplatek asociace";"Poplatek zpracovatel";"Typ karty"',
      '"499465";"2026-02-26 09:28:06";"2026-02-26 09:28:41";"2026-03-02";"";"JV6Y-60HX-NNRK";"Karta online";"";"20250587";"guest@example.com";"1357656777";"1811321483";"108061915";"CZK";"7387,10";"7314,71";"72,39";"14,77";"11,52";"46,10";"EU_CONSUMER"',
      '"-";"";"";"2026-03-02";"";"";"";"suma";"-";"-";"-";"1811321483";"-";"CZK";"42788,33";"42269,01";"519,32";"113,94";"88,60";"316,78";""'
    ].join('\n')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('vypis-202603.csv', content)
      ],
      month: '2026-03',
      generatedAt: '2026-04-10T14:20:00.000Z'
    })

    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'vypis-202603.csv',
        sourceSystem: 'comgate',
        intakeStatus: 'parsed',
        parserSupported: true,
        comgateHeaderDiagnostics: expect.objectContaining({
          detectedFileKind: 'monthly-settlement',
          parserVariant: 'monthly-settlement'
        }),
        comgatePipelineDiagnostics: expect.objectContaining({
          parserVariants: ['monthly-settlement']
        })
      })
    )

    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'vypis-202603.csv',
        comgatePipelineDiagnostics: expect.objectContaining({
          parserVariants: ['monthly-settlement'],
          extractedRecordCount: 2
        })
      })
    )

    const nativeTrace = result.reservationPaymentOverviewDebug.reservationPlusNativeLinkTraces.find((trace) => trace.reference === '1811321483')
    expect(nativeTrace?.rawParsedSourceRow?.data).toEqual(expect.objectContaining({
      runtimeComgateParserVariant: 'monthly-settlement',
      rawPopis: '20250587',
      rawTransferVariableSymbol: '1811321483',
      rawPayerVariableSymbol: '1357656777',
      rawClientId: '108061915',
      normalizedPayoutReference: '1811321483',
      normalizedMerchantOrderReference: '20250587',
      normalizedClientId: '108061915'
    }))
  })

  it('shows a matched payout batch for the mini browser scenario with one daily Comgate CSV and one RB statement', async () => {
    const fixture = getRealInputFixture('comgate-daily-payout-export')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          fixture.sourceDocument.fileName,
          fixture.rawInput.content
        ),
        createRuntimeFile(
          'Pohyby_5599955956_202603271815.csv',
          buildRbComgateDailySettlementContent()
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-27T18:15:00.000Z'
    })

    expect(result.routingSummary.supportedFileCount).toBe(2)
    expect(result.extractedRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'vypis-2026-03-27_1816656820.csv',
        extractedCount: 3
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603271815.csv',
        extractedCount: 1
      })
    ]))
    expect(result.reportSummary.payoutBatchMatchCount).toBe(1)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(0)
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(1)
    expect(result.reviewSections.payoutBatchUnmatched).toEqual([])
    expect(result.reviewSections.payoutBatchMatched[0]?.title).toContain('Comgate payout dávka')
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'vypis-2026-03-27_1816656820.csv',
        comgatePipelineDiagnostics: expect.objectContaining({
          parserVariants: ['daily-settlement'],
          normalizedTransactionCount: 3,
          matchingInputPayoutRowCount: 3,
          payoutBatchCount: 1,
          matchingDecisionCount: 1,
          lossBoundary: 'no-loss',
          lossStage: 'matched'
        })
      })
    )
  })

  it('keeps the payout batch count equal to the real settlement count for a 22-file Comgate daily-only month', async () => {
    const files = Array.from({ length: 22 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      const reference = `18166568${String(index + 20).padStart(2, '0')}`
      const blankTransferReference = index < 10

      return createRuntimeFile(
        `vypis-2026-03-${day}_${reference}.csv`,
        buildSyntheticComgateDailySettlementContent({
          transferReference: blankTransferReference ? '' : reference,
          componentRows: [
            { transactionId: `CG-${day}-A`, clientId: `1089${day}01`, confirmedAmountText: '2447,50', transferredAmountText: '2423,51' },
            { transactionId: `CG-${day}-B`, clientId: `1089${day}02`, confirmedAmountText: '3059,38', transferredAmountText: '3029,40' },
            { transactionId: `CG-${day}-C`, clientId: `1089${day}03`, confirmedAmountText: '611,88', transferredAmountText: '605,88' }
          ],
          confirmedSettlementTotalText: '6118,76',
          transferredSettlementTotalText: '6058,79'
        })
      )
    })

    const result = await createBrowserRuntime().buildRuntimeState({
      files,
      month: '2026-03',
      generatedAt: '2026-03-31T18:10:00.000Z'
    })

    expect(result.reportSummary.payoutBatchMatchCount).toBe(0)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(22)
    expect(result.reviewSections.payoutBatchMatched).toEqual([])
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(22)
    expect(new Set(result.reconciliationSnapshot.unmatchedPayoutBatchKeys).size).toBe(22)
    expect(result.reconciliationSnapshot.payoutBatchDecisions).toHaveLength(22)
    expect(result.reconciliationSnapshot.payoutBatchDecisions.every((decision) => decision.componentRowCount === 3)).toBe(true)
  })

  it('matches a 42 269 Kč Comgate daily settlement batch to the corresponding RB inflow without leaving phantom batch fragments', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'vypis-2026-03-28_1816656999.csv',
          buildSyntheticComgateDailySettlementContent({
            transferReference: '',
            componentRows: [
              { transactionId: 'CG-42269-A', clientId: '109000001', confirmedAmountText: '18250,00', transferredAmountText: '18120,00' },
              { transactionId: 'CG-42269-B', clientId: '109000002', confirmedAmountText: '14120,00', transferredAmountText: '14049,00' },
              { transactionId: 'CG-42269-C', clientId: '109000003', confirmedAmountText: '10160,00', transferredAmountText: '10100,00' }
            ],
            confirmedSettlementTotalText: '42530,00',
            transferredSettlementTotalText: '42269,00'
          })
        ),
        createRuntimeFile(
          'Pohyby_5599955956_202603281910.csv',
          buildRbComgateDailySettlementContent('42269,00', '28.03.2026', 'Souhrnná výplata Comgate 2026-03-28 / 1816656999')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-28T19:10:00.000Z'
    })

    expect(result.reportSummary.payoutBatchMatchCount).toBe(1)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(0)
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(1)
    expect(result.reviewSections.payoutBatchUnmatched).toEqual([])
    expect(result.reconciliationSnapshot.matchedPayoutBatchKeys).toEqual([
      'comgate-batch:2026-03-28:1816656999'
    ])
    expect(result.reconciliationSnapshot.payoutBatchDecisions).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'comgate-batch:2026-03-28:1816656999',
        expectedBankAmountMinor: 4226900,
        componentRowCount: 3,
        matched: true,
        matchedBankTransactionId: expect.any(String),
        selectionMode: 'eligible_candidate'
      })
    ])
    expect(result.reconciliationSnapshot.inboundBankTransactions).toContainEqual(
      expect.objectContaining({
        amountMinor: 4226900,
        currency: 'CZK',
        counterparty: 'Comgate a.s.'
      })
    )
  })

  it('proves current Comgate portal gross-to-net delta is explained by aggregated fees and reaches an exact-amount RB candidate before matcher handoff', async () => {
    const fixture = getRealInputFixture('comgate-export-current-portal')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(
          'Klientský portál export transakcí JOKELAND s.r.o..csv',
          fixture.rawInput.content
        ),
        createRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRbAggregatedComgatePortalSettlementContent()
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T18:00:00.000Z'
    })

    const comgateDiagnostic = result.runtimeAudit.fileIntakeDiagnostics.find((item) =>
      item.fileName === 'Klientský portál export transakcí JOKELAND s.r.o..csv'
    )

    expect(comgateDiagnostic).toBeDefined()
    expect(comgateDiagnostic?.comgatePipelineDiagnostics).toMatchObject({
      parserVariants: ['current-portal'],
      extractedRecordCount: 2,
      extractedPaymentPurposeBreakdown: [
        { kind: 'parking', count: 1 },
        { kind: 'website-reservation', count: 1 }
      ],
      normalizedTransactionCount: 2,
      normalizedKindBreakdown: [
        { kind: 'comgate:default', count: 2 }
      ],
      currentPortalRawRowCount: 2,
      currentPortalPayoutBatchCount: 1,
      matchingInputPayoutRowCount: 2,
      payoutBatchCount: 1,
      matchingDecisionCount: 1,
      lossBoundary: 'no-loss',
      lossStage: 'matched'
    })
    expect(comgateDiagnostic?.comgatePipelineDiagnostics?.currentPortalBatchTotalsPreview).toEqual([
      {
        payoutBatchKey: 'comgate-batch:2026-03-19:CZK',
        grossTotalMinor: 159100,
        feeTotalMinor: 1100,
        netSettlementTotalMinor: 158000,
        currency: 'CZK'
      }
    ])
    expect(comgateDiagnostic?.comgatePipelineDiagnostics?.payoutBatchSummaries).toEqual([
      {
        payoutBatchKey: 'comgate-batch:2026-03-19:CZK',
        payoutReference: 'CG-WEB-2001',
        grossTotalMinor: 159100,
        feeTotalMinor: 1100,
        netSettlementTotalMinor: 158000,
        expectedBankAmountMinor: 158000,
        currency: 'CZK',
        bankCandidateCountBeforeFiltering: 1,
        bankCandidateCountAfterAmountCurrency: 1,
        bankCandidateCountAfterDateWindow: 1,
        bankCandidateCountAfterEvidenceFiltering: 1,
        matched: true,
        noMatchReason: undefined
      }
    ])
    const decision = result.reconciliationSnapshot.payoutBatchDecisions.find((item) =>
      item.payoutBatchKey === 'comgate-batch:2026-03-19:CZK'
    )

    expect(decision).toMatchObject({
      payoutBatchKey: 'comgate-batch:2026-03-19:CZK',
      grossTotalMinor: 159100,
      feeTotalMinor: 1100,
      netSettlementTotalMinor: 158000,
      expectedTotalMinor: 158000,
      expectedBankAmountMinor: 158000,
      exactAmountMatchExistsBeforeDateEvidence: true,
      componentRowCount: 2,
      componentRowAmountMinors: [154900, 4200],
      bankCandidateCountAfterAmountCurrency: 1,
      matched: true,
      matchedBankTransactionId: expect.stringMatching(/^txn:bank:/)
    })
    expect(decision?.sameCurrencyCandidateAmountMinors[0]).toBe(158000)
    expect((decision?.grossTotalMinor ?? 0) - (decision?.sameCurrencyCandidateAmountMinors[0] ?? 0)).toBe(decision?.feeTotalMinor)
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
        classificationBasis: 'content',
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

  it('routes a Czech text-layer invoice PDF by content without contaminating the known 4-file payout result', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T10:55:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 5,
      supportedFileCount: 5,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes).toContainEqual(
      expect.objectContaining({
        fileName: 'Lenner.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        classificationBasis: 'content',
        parserId: 'invoice',
        decision: expect.objectContaining({
          capability: expect.objectContaining({
            profile: 'pdf_text_layer',
            transportProfile: 'text_pdf',
            documentHints: ['invoice_like']
          }),
          ingestionBranch: 'text-pdf-parser',
          resolvedBucket: 'recognized-supported'
        })
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Lenner.pdf',
        capabilityProfile: 'pdf_text_layer',
        capabilityTransportProfile: 'text_pdf',
        capabilityDocumentHints: ['invoice_like'],
        sourceSystem: 'invoice',
        documentType: 'invoice',
        documentExtractionSummary: expect.objectContaining({
          documentKind: 'invoice',
          issuerOrCounterparty: 'Lenner Motors s.r.o.',
          customer: 'JOKELAND s.r.o.',
          referenceNumber: '141260183',
          issueDate: '2026-03-11',
          dueDate: '2026-03-25',
          taxableDate: '2026-03-11',
          paymentMethod: 'Přev. příkaz',
          totalAmountMinor: 1262952,
          totalCurrency: 'CZK',
          vatBaseAmountMinor: 1043762,
          vatAmountMinor: 219190,
          ibanHint: 'CZ4903000000000274621920',
          confidence: 'strong',
          qrDetected: false,
          missingRequiredFields: [],
          groupedHeaderBlockDebug: expect.arrayContaining([
            expect.objectContaining({
              blockTypeCandidate: 'vertical-grouped-block',
              labels: ['Datum splatnosti', 'Forma úhrady', 'Datum vystavení', 'Datum zdanitelného plnění'],
              values: ['25.03.2026', 'Přev.příkaz', '11.03.2026', '11.03.2026'],
              accepted: false,
              rejectionReason: 'missing reference label'
            })
          ]),
          rawBlockDiscoveryDebug: expect.arrayContaining([
            expect.objectContaining({
              rawLines: ['Datum splatnosti', 'Forma úhrady', 'Datum vystavení', 'Datum zdanitelného plnění'],
              blockTypeGuess: 'dates-payment'
            }),
            expect.objectContaining({
              rawLines: ['Rozpis DPH', 'DPH │ Celkem po zaokrouhlení', '21 919,90 Kč │ Záloh celkem', 'Základ DPH'],
              blockTypeGuess: 'totals-payable'
            }),
            expect.objectContaining({
              rawLines: ['S DPH │ 10 437,62 Kč │ 12 629,52 Kč │ Razítko a podpis', 'Předmět plnění', 'Servis vozidla'],
              blockTypeGuess: 'totals-vat'
            })
          ]),
          fieldExtractionDebug: expect.objectContaining({
            referenceNumber: expect.objectContaining({
              winnerRule: 'anchored-header-window',
              winnerValue: '141260183'
            }),
            issueDate: expect.objectContaining({
              winnerRule: 'grouped-combined-date-payment-row',
              winnerValue: '11.03.2026'
            }),
            paymentMethod: expect.objectContaining({
              winnerRule: 'grouped-combined-date-payment-row',
              winnerValue: 'Přev. příkaz'
            }),
            totalAmount: expect.objectContaining({
              winnerRule: 'field-specific-summary-total',
              winnerValue: '12 629,52 Kč'
            })
          })
        }),
        requiredFieldsCheck: 'passed',
        missingFields: []
      })
    )
    expect(result.fileRoutes.some((file) => file.fileName === 'Lenner.pdf' && file.status === 'error')).toBe(false)
    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(
      result.reviewSections.payoutBatchMatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(true)
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
    const lennerExpenseItem = [
      ...result.reviewSections.expenseMatched,
      ...result.reviewSections.expenseNeedsReview,
      ...result.reviewSections.expenseUnmatchedDocuments
    ].find((item) =>
      item.expenseComparison?.document.reference === '141260183'
      && item.expenseComparison?.document.supplierOrCounterparty === 'Lenner Motors s.r.o.'
    )

    expect(lennerExpenseItem).toBeDefined()
    expect(lennerExpenseItem?.expenseComparison).toMatchObject({
      document: expect.objectContaining({
        supplierOrCounterparty: 'Lenner Motors s.r.o.',
        reference: '141260183',
        issueDate: '2026-03-11',
        dueDate: '2026-03-25',
        amount: '12 629,52 Kč',
        ibanHint: 'CZ4903000000000274621920'
      })
    })
    expect(lennerExpenseItem?.evidenceSummary.some((entry) => entry.label === 'částka')).toBe(true)
    expect(lennerExpenseItem?.evidenceSummary.some((entry) => entry.label === 'datum')).toBe(true)
    expect(
      result.reviewSections.expenseMatched.length
      + result.reviewSections.expenseNeedsReview.length
      + result.reviewSections.expenseUnmatchedDocuments.length
    ).toBeGreaterThan(0)
  })

  it('routes a Booking-branded invoice PDF through the browser invoice path and keeps the payout baseline stable', async () => {
    const invoice = getRealInputFixture('booking-invoice-pdf')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFile('Booking-invoice-March.pdf', invoice.rawInput.binaryContentBase64!)
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T10:50:00.000Z'
    })

    expect(result.fileRoutes).toContainEqual(
      expect.objectContaining({
        fileName: 'Booking-invoice-March.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        classificationBasis: 'content',
        parserId: 'invoice'
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Booking-invoice-March.pdf',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        documentExtractionSummary: expect.objectContaining({
          issuerOrCounterparty: 'Booking.com B.V.',
          referenceNumber: 'BOOK-INV-2026-03',
          issueDate: '2026-03-31',
          dueDate: '2026-04-14',
          totalAmountMinor: 145642,
          totalCurrency: 'EUR',
          localAmountMinor: 3553012,
          localCurrency: 'CZK',
          finalStatus: 'parsed'
        }),
        requiredFieldsCheck: 'passed',
        missingFields: []
      })
    )
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(
      result.extractedRecords.some((file) =>
        file.fileName === 'Booking-invoice-March.pdf'
        && file.extractedRecordIds.some((recordId) => recordId.startsWith('invoice-record:'))
      )
    ).toBe(true)
  })

  it('keeps Dobrá Energie and Lenner invoice identities isolated on the browser upload path while preserving the payout baseline', async () => {
    const lennerInvoice = getRealInputFixture('invoice-document-czech-pdf')
    const dobraInvoice = getRealInputFixture('invoice-document-dobra-energie-pdf')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', lennerInvoice.rawInput.content.split('\n')),
        createRuntimePdfFileFromToUnicodeTextLines('Dobra-Energie-2026-03.pdf', dobraInvoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-30T15:20:00.000Z'
    })

    expect(result.fileRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'Lenner.pdf',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        parserId: 'invoice'
      }),
      expect.objectContaining({
        fileName: 'Dobra-Energie-2026-03.pdf',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        parserId: 'invoice'
      })
    ]))
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Lenner.pdf',
        documentExtractionSummary: expect.objectContaining({
          issuerOrCounterparty: 'Lenner Motors s.r.o.',
          referenceNumber: '141260183'
        })
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Dobra-Energie-2026-03.pdf',
        documentExtractionSummary: expect.objectContaining({
          issuerOrCounterparty: 'Dobrá Energie s.r.o.',
          referenceNumber: 'DE-2026-03-4501',
          dueDate: '2026-04-01',
          totalAmountMinor: 712500,
          summaryTotalAmountMinor: 6231803,
          totalCurrency: 'CZK',
          billingPeriod: '01.03.2026 - 31.03.2026',
          finalStatus: 'parsed'
        }),
        requiredFieldsCheck: 'passed',
        missingFields: []
      })
    )
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.extractedRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'Lenner.pdf',
        extractedRecordIds: [expect.stringMatching(/^invoice-record:/)]
      }),
      expect.objectContaining({
        fileName: 'Dobra-Energie-2026-03.pdf',
        extractedRecordIds: [expect.stringMatching(/^invoice-record:/)]
      })
    ]))
    const supplierNames = [
      ...result.reviewSections.expenseMatched,
      ...result.reviewSections.expenseNeedsReview,
      ...result.reviewSections.expenseUnmatchedDocuments
    ].map((item) => item.expenseComparison?.document.supplierOrCounterparty)

    expect(supplierNames).toContain('Lenner Motors s.r.o.')
    expect(supplierNames).toContain('Dobrá Energie s.r.o.')
  })

  it('routes Save Car and T-Mobile invoice PDFs through the shared browser invoice path and keeps them visible in unmatched expense documents without bank files', async () => {
    const saveCarInvoice = getRealInputFixture('invoice-document-save-car-pdf')
    const tmobileInvoice = getRealInputFixture('invoice-document-t-mobile-simplified-tax-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimePdfFileFromToUnicodeTextLines('Save-Car-260100011.pdf', saveCarInvoice.rawInput.content.split('\n')),
        createRuntimePdfFileFromToUnicodeTextLines('T-Mobile-SB-4346297271.pdf', tmobileInvoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-04-04T10:25:00.000Z'
    })

    expect(result.fileRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'Save-Car-260100011.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        parserId: 'invoice',
        extractedCount: 1
      }),
      expect.objectContaining({
        fileName: 'T-Mobile-SB-4346297271.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        parserId: 'invoice',
        extractedCount: 1
      })
    ]))

    expect(result.runtimeAudit.fileIntakeDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'Save-Car-260100011.pdf',
        documentExtractionSummary: expect.objectContaining({
          issuerOrCounterparty: 'Save Car s.r.o.',
          customer: 'JOKELAND s.r.o.',
          referenceNumber: '260100011',
          issueDate: '2026-03-10',
          taxableDate: '2026-03-10',
          dueDate: '2026-03-24',
          totalAmountMinor: 665500,
          totalCurrency: 'CZK',
          finalStatus: 'parsed'
        })
      }),
      expect.objectContaining({
        fileName: 'T-Mobile-SB-4346297271.pdf',
        documentExtractionSummary: expect.objectContaining({
          issuerOrCounterparty: 'T-Mobile Czech Republic a.s.',
          referenceNumber: 'SB-4346297271',
          issueDate: '2026-03-09',
          taxableDate: '2026-03-09',
          totalAmountMinor: 28900,
          totalCurrency: 'CZK',
          paymentMethod: 'Platba kartou',
          finalStatus: 'parsed'
        })
      })
    ]))

    expect(result.reviewSections.expenseUnmatchedDocuments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Nespárovaný doklad 260100011',
        expenseComparison: expect.objectContaining({
          document: expect.objectContaining({
            supplierOrCounterparty: 'Save Car s.r.o.',
            reference: '260100011',
            issueDate: '2026-03-10',
            dueDate: '2026-03-24',
            amount: '6 655,00 Kč'
          })
        })
      }),
      expect.objectContaining({
        title: 'Nespárovaný doklad SB-4346297271',
        expenseComparison: expect.objectContaining({
          document: expect.objectContaining({
            supplierOrCounterparty: 'T-Mobile Czech Republic a.s.',
            reference: 'SB-4346297271',
            issueDate: '2026-03-09',
            dueDate: '2026-03-09',
            amount: '289,00 Kč'
          })
        })
      })
    ]))
  })

  it('keeps a recognized invoice-like vendor PDF visible in unmatched expense documents even when extraction cannot emit a full invoice record', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimePdfFileFromToUnicodeTextLines('Save-Car-partial.pdf', [
          'FAKTURA - DAŇOVÝ DOKLAD',
          'Dodavatel: Save Car s.r.o.',
          'Číslo: 260100011',
          'Celkem (Kč): 6 655,00'
        ])
      ],
      month: '2026-03',
      generatedAt: '2026-04-04T10:30:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'Save-Car-partial.pdf',
        extractedCount: 0
      })
    ])
    expect(result.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'Save-Car-partial.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        parserId: 'invoice',
        extractedCount: 0
      })
    ])
    expect(result.runtimeAudit.fileIntakeDiagnostics).toEqual([
      expect.objectContaining({
        fileName: 'Save-Car-partial.pdf',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        parsedSupplierOrCounterparty: 'Save Car s.r.o.',
        parsedReferenceNumber: '260100011',
        parsedAmountMinor: 665500,
        parsedAmountCurrency: 'CZK',
        noExtractReason: 'missing-usable-date',
        documentExtractionSummary: expect.objectContaining({
          documentKind: 'invoice',
          issuerOrCounterparty: 'Save Car s.r.o.',
          referenceNumber: '260100011',
          totalAmountMinor: 665500,
          totalCurrency: 'CZK',
          finalStatus: 'needs_review'
        })
      })
    ])
    expect(result.reviewSections.expenseUnmatchedDocuments).toEqual([
      expect.objectContaining({
        title: 'Nespárovaný doklad 260100011',
        matchStrength: 'nespárováno',
        expenseComparison: expect.objectContaining({
          document: expect.objectContaining({
            supplierOrCounterparty: 'Save Car s.r.o.',
            reference: '260100011',
            amount: '6 655,00 Kč'
          })
        }),
        evidenceSummary: expect.arrayContaining([
          expect.objectContaining({ label: 'částka', value: '6 655,00 Kč' }),
          expect.objectContaining({ label: 'reference', value: '260100011' }),
          expect.objectContaining({ label: 'protistrana / dodavatel', value: 'Save Car s.r.o.' })
        ])
      })
    ])
  })

  it('matches a parsed expense invoice to an outgoing bank candidate on the real browser upload path without changing the 16 / 2 payout baseline', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndExpenseOutflows(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T12:45:00.000Z'
    })

    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)

    const lennerMatchedExpense = result.reviewSections.expenseMatched.find((item) =>
      item.expenseComparison?.document.reference === '141260183'
      && item.expenseComparison?.document.supplierOrCounterparty === 'Lenner Motors s.r.o.'
    )

    expect(lennerMatchedExpense).toMatchObject({
      matchStrength: 'potvrzená shoda',
      documentBankRelation: 'Potvrzená pravděpodobná vazba mezi dokladem a odchozí bankovní platbou.'
    })
    expect(lennerMatchedExpense?.expenseComparison).toMatchObject({
      document: expect.objectContaining({
        supplierOrCounterparty: 'Lenner Motors s.r.o.',
        reference: '141260183',
        issueDate: '2026-03-11',
        dueDate: '2026-03-25',
        amount: '12 629,52 Kč',
        ibanHint: 'CZ4903000000000274621920'
      }),
      bank: expect.objectContaining({
        supplierOrCounterparty: 'Lenner Motors s.r.o.',
        reference: 'VS 141260183 Servis vozidla',
        bookedAt: '2026-03-25T10:17:00',
        amount: '12 629,52 Kč'
      })
    })
    expect(lennerMatchedExpense?.evidenceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'částka', value: 'sedí' }),
        expect.objectContaining({ label: 'rozdíl částky', value: '0,00 Kč' }),
        expect.objectContaining({ label: 'datum', value: 'sedí' }),
        expect.objectContaining({ label: 'rozdíl dnů', value: '0 dní' }),
        expect.objectContaining({ label: 'reference', value: 'sedí' }),
        expect.objectContaining({ label: 'protistrana / dodavatel', value: 'podobná' }),
        expect.objectContaining({ label: 'zpráva banky', value: 'VS 141260183 Servis vozidla' })
      ])
    )
    expect(
      result.reviewSections.expenseUnmatchedDocuments.some((item) =>
        item.expenseComparison?.document.reference === '141260183'
      )
    ).toBe(false)
    expect(
      result.reviewSections.expenseUnmatchedOutflows.some((item) =>
        item.expenseComparison?.bank?.reference === 'Platba bez dokladu'
      )
    ).toBe(true)
    expect(
      result.reviewSections.expenseMatched.length
      + result.reviewSections.expenseNeedsReview.length
      + result.reviewSections.expenseUnmatchedDocuments.length
    ).toBe(1)
    expect(
      result.reviewSections.expenseMatched.length
      + result.reviewSections.expenseNeedsReview.length
      + result.reviewSections.expenseUnmatchedOutflows.length
    ).toBe(2)
  })

  it('matches Lenner correctly in the exact clean 2-file browser scenario on the full invoice total', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'raiffeisen-lenner.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '25.03.2026 11:24;25.03.2026 11:26;5599955956/5500;000000-1234567890/0800;Lenner Motors s.r.o.;-12629,52;CZK;Faktura 141260183'
          ].join('\n'),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T18:42:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'raiffeisen-lenner.csv',
        extractedCount: 1
      }),
      expect.objectContaining({
        fileName: 'Lenner.pdf',
        extractedCount: 1
      })
    ])

    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Lenner.pdf',
        documentExtractionSummary: expect.objectContaining({
          issuerOrCounterparty: 'Lenner Motors s.r.o.',
          referenceNumber: '141260183',
          totalAmountMinor: 1262952,
          vatBaseAmountMinor: 1043762,
          totalCurrency: 'CZK'
        })
      })
    )

    expect(result.reviewSections.expenseMatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentBankRelation: 'Potvrzená pravděpodobná vazba mezi dokladem a odchozí bankovní platbou.',
          expenseComparison: expect.objectContaining({
            document: expect.objectContaining({
              supplierOrCounterparty: 'Lenner Motors s.r.o.',
              reference: '141260183',
              amount: '12 629,52 Kč'
            }),
            bank: expect.objectContaining({
              supplierOrCounterparty: 'Lenner Motors s.r.o.',
              reference: 'Faktura 141260183',
              amount: '12 629,52 Kč'
            })
          })
        })
      ])
    )

    expect(result.reviewSections.expenseUnmatchedDocuments).toEqual([])
    expect(result.reviewSections.expenseUnmatchedOutflows).toEqual([])
  })

  it('keeps Lenner in expense review for both RB CSV and RB GPC when the GPC row only exposes a VS-style payment message', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const scenarios = [
      {
        expectedParser: 'fio',
        bankFile: createRuntimeArrayBufferTextFile(
          'raiffeisen-lenner-review.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '08.04.2026 10:15;08.04.2026 10:17;5599955956/5500;CZ4903000000000274621920;Lenner Motors s.r.o.;-12629,52;CZK;VS 141260183 Servis vozidla'
          ].join('\n'),
          'text/csv'
        )
      },
      {
        expectedParser: 'raiffeisenbank-gpc',
        bankFile: createRuntimeArrayBufferTextFile(
          'Vypis_5599955956_CZK_2026_004.gpc',
          buildRaiffeisenbankGpcLennerReviewContentWithReferenceOnlyContinuation(),
          'text/plain'
        )
      }
    ] as const

    for (const scenario of scenarios) {
      const result = await buildBrowserRuntimeStateFromSelectedFiles({
        files: [
          scenario.bankFile,
          createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
        ],
        month: '2026-04',
        generatedAt: '2026-04-03T11:20:00.000Z'
      })

      const lennerNeedsReview = result.reviewSections.expenseNeedsReview.find((item) =>
        item.expenseComparison?.document.reference === '141260183'
          && item.expenseComparison?.document.supplierOrCounterparty === 'Lenner Motors s.r.o.'
      )

      expect(result.extractedRecords[0]).toMatchObject({
        extractedCount: 1,
        parserDebugLabel: scenario.expectedParser
      })
      expect(lennerNeedsReview).toMatchObject({
        title: 'Doklad ke kontrole 141260183',
        matchStrength: 'slabší shoda',
        documentBankRelation: 'Doklad je načtený a existuje pravděpodobný odchozí bankovní kandidát, ale vazba zatím není potvrzená.',
        expenseComparison: expect.objectContaining({
          document: expect.objectContaining({
            supplierOrCounterparty: 'Lenner Motors s.r.o.',
            reference: '141260183',
            amount: '12 629,52 Kč'
          }),
          bank: expect.objectContaining({
            reference: 'VS 141260183 Servis vozidla',
            bookedAt: expect.stringContaining('2026-04-08'),
            amount: '12 629,52 Kč'
          })
        })
      })
      expect(
        result.reviewSections.expenseUnmatchedDocuments.some((item) =>
          item.expenseComparison?.document.reference === '141260183'
        )
      ).toBe(false)
      expect(
        result.reviewSections.expenseUnmatchedOutflows.some((item) =>
          item.expenseComparison?.bank?.reference === 'VS 141260183 Servis vozidla'
        )
      ).toBe(false)
    }
  })

  it('keeps Lenner in expense review on a real-browser-like RB GPC row when the usable signal only survives in counterpartyAccount', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'Vypis_5599955956_CZK_2026_004.gpc',
          buildRaiffeisenbankGpcLennerReviewContentWithServiceOnlyContinuation(),
          'text/plain'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ],
      month: '2026-04',
      generatedAt: '2026-04-03T12:30:00.000Z'
    })

    const lennerNeedsReview = result.reviewSections.expenseNeedsReview.find((item) =>
      item.expenseComparison?.document.reference === '141260183'
        && item.expenseComparison?.document.supplierOrCounterparty === 'Lenner Motors s.r.o.'
    )

    expect(result.extractedRecords[0]).toMatchObject({
      extractedCount: 1,
      parserDebugLabel: 'raiffeisenbank-gpc'
    })
    expect(lennerNeedsReview).toMatchObject({
      title: 'Doklad ke kontrole 141260183',
      matchStrength: 'slabší shoda',
      documentBankRelation: 'Doklad je načtený a existuje pravděpodobný odchozí bankovní kandidát, ale vazba zatím není potvrzená.'
    })
    expect(lennerNeedsReview?.expenseComparison).toMatchObject({
      document: expect.objectContaining({
        supplierOrCounterparty: 'Lenner Motors s.r.o.',
        reference: '141260183',
        ibanHint: 'CZ4903000000000274621920'
      }),
      bank: expect.objectContaining({
        supplierOrCounterparty: 'Servis vozidla',
        bookedAt: '2026-04-08',
        amount: '12 629,52 Kč'
      })
    })
    expect(lennerNeedsReview?.evidenceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'IBAN', value: 'sedí' }),
        expect.objectContaining({ label: 'reference', value: 'chybí' })
      ])
    )
    expect(
      result.reviewSections.expenseUnmatchedDocuments.some((item) =>
        item.expenseComparison?.document.reference === '141260183'
      )
    ).toBe(false)
  })

  it('keeps Lenner matched on the full invoice total when a browser text layer exposes only a generic total label above the VAT base', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'raiffeisen-lenner.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '25.03.2026 11:24;25.03.2026 11:26;5599955956/5500;000000-1234567890/0800;Lenner Motors s.r.o.;-12629,52;CZK;Faktura 141260183'
          ].join('\n'),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines(
          'Lenner.pdf',
          [
            'Faktura - daňový doklad',
            'Dodavatel',
            'Lenner Motors s.r.o.',
            'Odběratel',
            'JOKELAND s.r.o.',
            'Faktura číslo',
            '141260183',
            'Datum splatnosti',
            '25.03.2026',
            'Forma úhrady',
            'Přev.příkaz',
            'Datum vystavení',
            '11.03.2026',
            'Datum zdanitelného plnění',
            '11.03.2026',
            'Rozpis DPH',
            'Celkem po zaokrouhlení',
            'Základ DPH',
            '10 437,62 Kč',
            'DPH',
            '2 191,90 Kč',
            'S DPH',
            '12 629,52 Kč'
          ]
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T18:42:00.000Z'
    })

    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Lenner.pdf',
        documentExtractionSummary: expect.objectContaining({
          issuerOrCounterparty: 'Lenner Motors s.r.o.',
          referenceNumber: '141260183',
          totalAmountMinor: 1262952,
          vatBaseAmountMinor: 1043762,
          totalCurrency: 'CZK'
        })
      })
    )

    expect(result.reviewSections.expenseMatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expenseComparison: expect.objectContaining({
            document: expect.objectContaining({
              supplierOrCounterparty: 'Lenner Motors s.r.o.',
              reference: '141260183',
              amount: '12 629,52 Kč'
            }),
            bank: expect.objectContaining({
              supplierOrCounterparty: 'Lenner Motors s.r.o.',
              reference: 'Faktura 141260183',
              amount: '12 629,52 Kč'
            })
          })
        })
      ])
    )

    expect(result.reviewSections.expenseUnmatchedDocuments).toEqual([])
    expect(result.reviewSections.expenseUnmatchedOutflows).toEqual([])
  })

  it('keeps payable supplier invoices on the outgoing path and lets refund settlement invoices relate to incoming bank movements in browser review', async () => {
    const payableInvoice = getRealInputFixture('invoice-document-dobra-energie-pdf')
    const refundInvoice = getRealInputFixture('invoice-document-dobra-energie-refund-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndDobraSettlementDocuments(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Dobra-Energie-2026-03.pdf', payableInvoice.rawInput.content.split('\n')),
        createRuntimePdfFileFromToUnicodeTextLines('Dobra-Energie-preplatek-2026-03.pdf', refundInvoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-30T17:25:00.000Z'
    })

    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)

    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Dobra-Energie-2026-03.pdf',
        documentExtractionSummary: expect.objectContaining({
          settlementDirection: 'payable_outgoing',
          referenceNumber: 'DE-2026-03-4501',
          totalAmountMinor: 712500,
          summaryTotalAmountMinor: 6231803
        })
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Dobra-Energie-preplatek-2026-03.pdf',
        documentExtractionSummary: expect.objectContaining({
          settlementDirection: 'refund_incoming',
          referenceNumber: 'DE-RET-2026-03-9901',
          variableSymbol: '2026039901',
          totalAmountMinor: 245000,
          summaryTotalAmountMinor: 4985442,
          targetBankAccountHint: '5599955956/5500'
        })
      })
    )

    const payableMatchedItem = result.reviewSections.expenseMatched.find((item) =>
      item.expenseComparison?.document.reference === 'DE-2026-03-4501'
    )
    const refundMatchedItem = result.reviewSections.expenseMatched.find((item) =>
      item.expenseComparison?.document.reference === 'DE-RET-2026-03-9901'
    )

    expect(payableMatchedItem).toMatchObject({
      documentBankRelation: 'Potvrzená pravděpodobná vazba mezi dokladem a odchozí bankovní platbou.'
    })
    expect(payableMatchedItem?.expenseComparison).toMatchObject({
      document: expect.objectContaining({
        supplierOrCounterparty: 'Dobrá Energie s.r.o.',
        reference: 'DE-2026-03-4501',
        amount: '7 125,00 Kč',
        summaryTotal: '62 318,03 Kč'
      }),
      bank: expect.objectContaining({
        supplierOrCounterparty: 'Dobrá Energie s.r.o.',
        reference: 'VS 2026034501 Dodávka elektřiny',
        amount: '7 125,00 Kč'
      })
    })

    expect(refundMatchedItem).toMatchObject({
      documentBankRelation: 'Potvrzená pravděpodobná vazba mezi dokladem a příchozí bankovní platbou.'
    })
    expect(refundMatchedItem?.expenseComparison).toMatchObject({
      document: expect.objectContaining({
        supplierOrCounterparty: 'Dobrá Energie s.r.o.',
        reference: 'DE-RET-2026-03-9901',
        amount: '2 450,00 Kč',
        summaryTotal: '49 854,42 Kč',
        ibanHint: '5599955956/5500'
      }),
      bank: expect.objectContaining({
        supplierOrCounterparty: 'Dobrá Energie s.r.o.',
        reference: 'Vrácení přeplatku VS 2026039901',
        amount: '2 450,00 Kč'
      })
    })

    expect(
      result.reviewSections.expenseUnmatchedDocuments.some((item) =>
        item.expenseComparison?.document.reference === 'DE-RET-2026-03-9901'
      )
    ).toBe(false)
    expect(
      result.reviewSections.expenseUnmatchedInflows.some((item) =>
        item.expenseComparison?.bank?.reference === 'Vrácení přeplatku VS 2026039901'
      )
    ).toBe(false)
  })

  it('keeps a sparse refund settlement invoice visible in browser flow instead of recognized-with-zero-extracted and links it to the incoming Dobrá refund movement', async () => {
    const refundInvoice = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndSparseDobraRefundDocument(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Dobra-Energie-preplatek-3804-2026-03.pdf', refundInvoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-30T18:25:00.000Z'
    })

    expect(result.extractedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
          extractedCount: 1
        })
      ])
    )

    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
        documentExtractionSummary: expect.objectContaining({
          settlementDirection: 'refund_incoming',
          referenceNumber: '5125144501',
          variableSymbol: '5125144501',
          totalAmountMinor: 380400,
          targetBankAccountHint: '8888997777/2010'
        })
      })
    )

    const refundMatchedItem = result.reviewSections.expenseMatched.find((item) =>
      item.expenseComparison?.document.reference === '5125144501'
      && item.expenseComparison?.bank?.amount === '3 804,00 Kč'
    )

    expect(refundMatchedItem).toMatchObject({
      documentBankRelation: 'Potvrzená pravděpodobná vazba mezi dokladem a příchozí bankovní platbou.'
    })
    expect(refundMatchedItem?.expenseComparison).toMatchObject({
      document: expect.objectContaining({
        supplierOrCounterparty: 'Dobrá Energie s.r.o.',
        reference: '5125144501',
        dueDate: '2026-03-26',
        ibanHint: '8888997777/2010'
      }),
      bank: expect.objectContaining({
        supplierOrCounterparty: 'Dobrá Energie s.r.o.',
        reference: 'Vrácení přeplatku VS 5125144501',
        amount: '3 804,00 Kč'
      })
    })

    expect(result.reviewSections.expenseUnmatchedInflows.some((item) =>
      item.expenseComparison?.bank?.reference === 'Vrácení přeplatku VS 5125144501'
      || item.title.includes('3 804,00 Kč')
    )).toBe(false)
  })

  it('keeps the sparse Dobrá refund invoice extracted in the browser-selected PDF path when refund fields are fragmented inside TJ arrays', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithSparseDobraRefundIncoming(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextFragments('Dobra-Energie-preplatek-3804-2026-03.pdf', [
          ['Faktura - daňový doklad'],
          ['Dodavatel'],
          ['Dobrá Energie s.r.o.'],
          ['Odběratel'],
          ['JOKELAND s.r.o.'],
          ['Variabilní symbol'],
          ['5125', '144501'],
          ['Datum splatnosti'],
          ['26.03.', '2026'],
          ['Přeplatek'],
          ['3 ', '804,00 Kč'],
          ['Přeplatek bude připsán na Váš bankovní účet'],
          ['888899', '7777/2010'],
          ['Předmět plnění:'],
          ['Vyúčtování dodávky elektřiny za březen ', '2026']
        ])
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T08:15:00.000Z'
    })

    expect(result.extractedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
          extractedCount: 1
        })
      ])
    )

    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
        documentExtractionSummary: expect.objectContaining({
          settlementDirection: 'refund_incoming',
          referenceNumber: '5125144501',
          variableSymbol: '5125144501',
          dueDate: '2026-03-26',
          totalAmountMinor: 380400,
          targetBankAccountHint: '8888997777/2010',
          finalStatus: 'needs_review'
        })
      })
    )

    expect(result.reviewSections.expenseMatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expenseComparison: expect.objectContaining({
            document: expect.objectContaining({
              supplierOrCounterparty: 'Dobrá Energie s.r.o.',
              reference: '5125144501',
              dueDate: '2026-03-26',
              ibanHint: '8888997777/2010'
            }),
            bank: expect.objectContaining({
              bankAccount: '8888997777/2010',
              amount: '3 804,00 Kč',
              reference: 'Vrácení přeplatku VS 5125144501'
            })
          })
        })
      ])
    )

    expect(result.reviewSections.expenseUnmatchedInflows.some((item) =>
      item.expenseComparison?.bank?.reference === 'Vrácení přeplatku VS 5125144501'
      || item.title.includes('3 804,00 Kč')
    )).toBe(false)
  })

  it('keeps the sparse Dobrá refund invoice extracted and document-backed when the 3 804 CZK incoming refund arrives on the Fio account', async () => {
    const refundInvoice = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithSparseDobraRefundIncoming(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Dobra-Energie-preplatek-3804-2026-03.pdf', refundInvoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-30T18:45:00.000Z'
    })

    expect(result.extractedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
          extractedCount: 1
        })
      ])
    )

    const refundMatchedItem = result.reviewSections.expenseMatched.find((item) =>
      item.expenseComparison?.document.reference === '5125144501'
      && item.expenseComparison?.bank?.bankAccount === '8888997777/2010'
      && item.expenseComparison?.bank?.amount === '3 804,00 Kč'
    )

    expect(refundMatchedItem).toBeDefined()
    expect(refundMatchedItem?.expenseComparison).toMatchObject({
      document: expect.objectContaining({
        supplierOrCounterparty: 'Dobrá Energie s.r.o.',
        reference: '5125144501',
        dueDate: '2026-03-26',
        ibanHint: '8888997777/2010'
      }),
      bank: expect.objectContaining({
        supplierOrCounterparty: 'Dobrá Energie s.r.o.',
        bankAccount: '8888997777/2010',
        reference: 'Vrácení přeplatku VS 5125144501',
        amount: '3 804,00 Kč'
      })
    })

    const refundDiagnostic = result.runtimeAudit.fileIntakeDiagnostics.find((item) =>
      item.fileName === 'Dobra-Energie-preplatek-3804-2026-03.pdf'
    )

    expect(refundDiagnostic?.noExtractReason).toBeUndefined()
    expect(refundDiagnostic?.presentFields).toEqual(
      expect.arrayContaining([
        'referenceNumber',
        'issuerOrCounterparty',
        'dueDate',
        'totalAmount',
        'settlementDirection',
        'targetBankAccountHint'
      ])
    )

    const expenseReviewPage = buildBrowserReviewScreen({
      files: [
        {
          name: 'booking35k.csv',
          content: buildBooking35kBrowserUploadContent(),
          uploadedAt: '2026-03-30T18:45:00.000Z'
        },
        {
          name: 'airbnb.csv',
          content: buildRealUploadedAirbnbContentWithoutReferenceColumn(),
          uploadedAt: '2026-03-30T18:45:00.000Z'
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          uploadedAt: '2026-03-30T18:45:00.000Z'
        },
        {
          name: 'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          content: buildRealUploadedFioContentWithSparseDobraRefundIncoming(),
          uploadedAt: '2026-03-30T18:45:00.000Z'
        },
        {
          name: 'Bookinng35k.pdf',
          content: buildCzechSingleGlyphBookingPayoutStatementPdfLines().join('\n'),
          uploadedAt: '2026-03-30T18:45:00.000Z'
        },
        {
          name: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
          content: refundInvoice.rawInput.content,
          uploadedAt: '2026-03-30T18:45:00.000Z'
        }
      ],
      runId: 'browser-review-fio-dobra-refund-3804',
      generatedAt: '2026-03-30T18:45:00.000Z'
    }).html

    expect(expenseReviewPage).toContain('5125144501')
    expect(expenseReviewPage).toContain('3 804,00 Kč')
    expect(expenseReviewPage).toContain('8888997777/2010')
    expect(expenseReviewPage).not.toContain('Zatím bez načteného dokladu.')

    expect(result.reviewSections.expenseUnmatchedInflows.some((item) =>
      item.expenseComparison?.bank?.bankAccount === '8888997777/2010'
      && item.title.includes('3 804,00 Kč')
    )).toBe(false)
  })

  it('keeps the sparse Dobrá refund invoice extracted on the exact minimal real browser path with only the Fio refund movement and the binary PDF upload', async () => {
    const refundInvoice = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithSparseDobraRefundIncoming(),
          'text/csv'
        ),
        createRuntimePdfFile('Dobra-Energie-preplatek-3804-2026-03.pdf', refundInvoice.rawInput.binaryContentBase64!)
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T16:00:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
        extractedCount: 1
      }),
      expect.objectContaining({
        fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
        extractedCount: 1,
        extractedRecordIds: ['invoice-record:uploaded:invoice:2:dobra-energie-preplatek-3804-2026-03-pdf']
      })
    ])

    expect(result.runtimeAudit.fileIntakeDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
          documentExtractionSummary: expect.objectContaining({
            settlementDirection: 'refund_incoming',
            referenceNumber: '5125144501',
            totalAmountMinor: 380400,
            targetBankAccountHint: '8888997777/2010'
          })
        })
      ])
    )

    expect(result.reviewSections.expenseMatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expenseComparison: expect.objectContaining({
            document: expect.objectContaining({
              supplierOrCounterparty: 'Dobrá Energie s.r.o.',
              reference: '5125144501',
              amount: '3 804,00 Kč',
              ibanHint: '8888997777/2010'
            }),
            bank: expect.objectContaining({
              bankAccount: '8888997777/2010',
              reference: 'Vrácení přeplatku VS 5125144501',
              amount: '3 804,00 Kč'
            })
          })
        })
      ])
    )

    expect(result.reviewSections.expenseUnmatchedInflows).toEqual([])
  })

  it('emits a sparse Dobrá refund record on the minimal browser path when the refund cue amount has no explicit currency token', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithSparseDobraRefundIncoming(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Dobra-Energie-preplatek-3804-2026-03.pdf', [
          'Faktura - daňový doklad',
          'Dodavatel',
          'Dobrá Energie s.r.o.',
          'Odběratel',
          'JOKELAND s.r.o.',
          'Variabilní symbol',
          '5125144501',
          'Datum splatnosti',
          '26.03.2026',
          'Přeplatek -3 804,00',
          'Přeplatek bude připsán na Váš bankovní účet',
          '8888997777/2010',
          'Předmět plnění:',
          'Vyúčtování dodávky elektřiny za březen 2026'
        ])
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T17:25:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
        extractedCount: 1
      }),
      expect.objectContaining({
        fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
        extractedCount: 1
      })
    ])

    expect(result.runtimeAudit.fileIntakeDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'Dobra-Energie-preplatek-3804-2026-03.pdf',
          noExtractReason: undefined,
          documentExtractionSummary: expect.objectContaining({
            settlementDirection: 'refund_incoming',
            referenceNumber: '5125144501',
            dueDate: '2026-03-26',
            totalAmountMinor: 380400,
            totalCurrency: 'CZK',
            settlementAmountMinor: 380400,
            settlementCurrency: 'CZK',
            targetBankAccountHint: '8888997777/2010'
          })
        })
      ])
    )

    expect(result.reviewSections.expenseMatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expenseComparison: expect.objectContaining({
            document: expect.objectContaining({
              supplierOrCounterparty: 'Dobrá Energie s.r.o.',
              reference: '5125144501',
              amount: '3 804,00 Kč',
              dueDate: '2026-03-26',
              ibanHint: '8888997777/2010'
            }),
            bank: expect.objectContaining({
              bankAccount: '8888997777/2010',
              reference: 'Vrácení přeplatku VS 5125144501',
              amount: '3 804,00 Kč'
            })
          })
        })
      ])
    )

    expect(result.reviewSections.expenseUnmatchedInflows).toEqual([])
  })

  it('keeps bare integer CZK outgoing bank values in correct major-unit scaling on the browser upload expense path', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndIntegerExpenseOutflow(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T17:10:00.000Z'
    })

    const unmatchedOutflow = result.reviewSections.expenseUnmatchedOutflows.find((item) =>
      item.expenseComparison?.bank?.reference === 'Platba bez dokladu'
    )

    expect(unmatchedOutflow).toBeDefined()
    expect(unmatchedOutflow?.title).toBe('Nespárovaná odchozí platba 3 120,00 Kč')
    expect(unmatchedOutflow?.expenseComparison?.bank).toMatchObject({
      amount: '3 120,00 Kč',
      reference: 'Platba bez dokladu'
    })
    expect(unmatchedOutflow?.evidenceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'částka', value: '3 120,00 Kč' })
      ])
    )
    expect(unmatchedOutflow?.title).not.toContain('31,20 Kč')
    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
  })

  it('pairs an own-account RB to Fio transfer as an internal matched transfer instead of an unmatched expense outflow', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndInternalTransferOutflow(),
          'text/csv'
        ),
        createRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithInternalTransferInflow(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T19:20:00.000Z'
    })

    expect(result.reviewSections.expenseMatched.some((item) =>
      item.title === 'Vnitřní převod 5 000,00 Kč'
      && item.expenseComparison?.variant === 'bank-bank'
      && item.expenseComparison?.document.bankAccount === '5599955956/5500'
      && item.expenseComparison?.bank?.bankAccount === '8888997777/2010'
    )).toBe(true)
    expect(result.reviewSections.expenseUnmatchedOutflows.some((item) =>
      item.title.includes('5 000,00 Kč')
    )).toBe(false)
    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
  })

  it('pairs an own-account Fio to RB transfer as an internal matched transfer instead of an unmatched expense outflow', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbContentWithInternalTransferInflowOnly(),
          'text/csv'
        ),
        createRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithInternalTransferOutflowOnly(),
          'text/csv'
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T19:30:00.000Z'
    })

    expect(result.reviewSections.expenseMatched.some((item) =>
      item.title === 'Vnitřní převod 5 000,00 Kč'
      && item.expenseComparison?.variant === 'bank-bank'
      && item.expenseComparison?.document.bankAccount === '8888997777/2010'
      && item.expenseComparison?.bank?.bankAccount === '5599955956/5500'
    )).toBe(true)
    expect(result.reviewSections.expenseUnmatchedOutflows.some((item) =>
      item.title.includes('5 000,00 Kč')
    )).toBe(false)
    expect(result.reviewSections.expenseUnmatchedInflows.some((item) =>
      item.title.includes('5 000,00 Kč')
    )).toBe(false)
  })

  it('pairs the exact delayed Fio to RB own-account browser pair through the fallback own-account window instead of leaving both sides unmatched', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbContentWithDelayedActualInternalTransferInflowOnly(),
          'text/csv'
        ),
        createRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithDelayedActualInternalTransferOutflowOnly(),
          'text/csv'
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-04T22:55:00.000Z'
    })

    expect(result.reviewSections.expenseMatched.some((item) =>
      item.title === 'Vnitřní převod 5 000,00 Kč'
      && item.expenseComparison?.variant === 'bank-bank'
      && item.expenseComparison?.document.bankAccount === '8888997777/2010'
      && item.expenseComparison?.bank?.bankAccount === '5599955956/5500'
    )).toBe(true)
    expect(result.reviewSections.expenseUnmatchedOutflows.some((item) =>
      item.title.includes('5 000,00 Kč')
    )).toBe(false)
    expect(result.reviewSections.expenseUnmatchedInflows.some((item) =>
      item.title.includes('5 000,00 Kč')
    )).toBe(false)
    expect(result.runtimeAudit.internalTransferDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        outgoingAccountId: '8888997777/2010',
        incomingAccountId: '5599955956/5500',
        outgoingReference: '76526712',
        incomingReference: '71394921',
        candidateCountWithinPrimaryWindow: 0,
        candidateCountWithinExtendedFallbackWindow: 1,
        selectedDateWindow: 'extended-own-account',
        matched: true,
        dateDistance: 13,
        outgoingMentionsIncomingAccount: true,
        incomingMentionsOutgoingAccount: true
      })
    ]))
    expect(result.runtimeAudit.exactInternalTransferPairTrace).toMatchObject({
      outgoing: {
        rawRowId: expect.stringContaining('fio-row-1'),
        normalizedTransactionId: 'txn:bank:fio-row-1:uploaded-bank-2-pohyby-na-uctu-8888997777-20260301-20260331-csv',
        bankAccountId: '8888997777/2010',
        direction: 'out',
        amountMinor: 500000,
        currency: 'CZK',
        ownAccountEvidence: {
          accountRecognizedAsOwnAccount: true,
          accountHintMatchedOnCounterMovement: true,
          counterMovementRecognizedAsOwnAccount: true
        },
        candidateCountBeforeFilters: 1,
        candidateCountAfterAmountFilter: 1,
        candidateCountAfterDirectionFilter: 1,
        candidateCountAfterOwnAccountAccountHintFilter: 1,
        candidateCountAfterDateGate: 1,
        candidateCountAfterPrimaryDateGate: 0,
        candidateCountAfterExtendedDateGate: 1,
        finalMatchedOrUnmatchedReason: 'matched-within-extended-own-account-date-gate'
      },
      incoming: {
        rawRowId: expect.stringContaining('fio-row-1'),
        normalizedTransactionId: 'txn:bank:fio-row-1',
        bankAccountId: '5599955956/5500',
        direction: 'in',
        amountMinor: 500000,
        currency: 'CZK',
        ownAccountEvidence: {
          accountRecognizedAsOwnAccount: true,
          accountHintMatchedOnCounterMovement: true,
          counterMovementRecognizedAsOwnAccount: true
        },
        candidateCountBeforeFilters: 1,
        candidateCountAfterAmountFilter: 1,
        candidateCountAfterDirectionFilter: 1,
        candidateCountAfterOwnAccountAccountHintFilter: 1,
        candidateCountAfterDateGate: 1,
        candidateCountAfterPrimaryDateGate: 0,
        candidateCountAfterExtendedDateGate: 1,
        finalMatchedOrUnmatchedReason: 'matched-within-extended-own-account-date-gate'
      },
      internalTransferPairCreated: true,
      matchedTransferPairId: expect.stringContaining('expense-matched:internal-transfer:'),
      consumedInReviewProjection: true,
      visibleInUnmatchedOutgoing: false,
      visibleInUnmatchedIncoming: false
    })
  })

  it('keeps the screenshot-shaped RB same-account 5 000 pair unmatched and traces the real same-account rejection', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '13.03.2026 08:14;13.03.2026 08:15;5599955956/5500;8888997777/0008;JOKELAND s.r.o.;5000,00;CZK;71394921',
            '26.03.2026 09:00;26.03.2026 09:01;5599955956/5500;266617681/0008;Moneta / 5599955956;-5000,00;CZK;76526712'
          ].join('\n'),
          'text/csv'
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-05T10:30:00.000Z'
    })

    expect(result.reviewSections.expenseMatched.some((item) => item.title.includes('5 000,00 Kč'))).toBe(false)
    expect(result.reviewSections.expenseUnmatchedOutflows.some((item) => item.title.includes('5 000,00 Kč'))).toBe(true)
    expect(result.reviewSections.expenseUnmatchedInflows.some((item) => item.title.includes('5 000,00 Kč'))).toBe(true)
    expect(result.runtimeAudit.exactInternalTransferPairTrace).toMatchObject({
      outgoing: {
        rawRowId: 'fio-row-2',
        bankAccountId: '5599955956/5500',
        ownAccountEvidence: {
          accountRecognizedAsOwnAccount: true,
          accountHintMatchedOnCounterMovement: true,
          counterMovementRecognizedAsOwnAccount: true
        },
        candidateCountAfterOwnAccountAccountHintFilter: 0,
        finalMatchedOrUnmatchedReason: 'rejected-by-same-account-id'
      },
      incoming: {
        rawRowId: 'fio-row-1',
        bankAccountId: '5599955956/5500',
        ownAccountEvidence: {
          accountRecognizedAsOwnAccount: true,
          accountHintMatchedOnCounterMovement: true,
          counterMovementRecognizedAsOwnAccount: true
        },
        candidateCountAfterOwnAccountAccountHintFilter: 0,
        finalMatchedOrUnmatchedReason: 'rejected-by-same-account-id'
      },
      internalTransferPairCreated: false,
      matchedTransferPairId: undefined,
      consumedInReviewProjection: false,
      visibleInUnmatchedOutgoing: true,
      visibleInUnmatchedIncoming: true
    })
  })

  it('surfaces a generic unmatched incoming bank movement in the dedicated incoming bucket', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbContentWithGenericIncomingOnly(),
          'text/csv'
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T19:35:00.000Z'
    })

    expect(result.reviewSections.expenseUnmatchedInflows).toHaveLength(1)
    expect(result.reviewSections.expenseUnmatchedInflows[0]).toMatchObject({
      title: 'Nespárovaná příchozí platba 2 200,00 Kč',
      matchStrength: 'nespárováno'
    })
    expect(result.reviewSections.expenseUnmatchedOutflows).toHaveLength(0)
  })

  it('recovers invoice payment fields from a hidden SPD QR payload on the real browser upload path without changing the 16 / 2 payout baseline', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf-with-spd-qr')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFile(invoice.sourceDocument.fileName, invoice.rawInput.binaryContentBase64!)
      ],
      month: '2026-03',
      generatedAt: '2026-03-28T10:20:00.000Z'
    })

    expect(result.fileRoutes.some((file) => file.fileName === 'invoice-with-qr.pdf' && file.status === 'error')).toBe(false)
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'invoice-with-qr.pdf',
        requiredFieldsCheck: 'passed',
        missingFields: [],
        documentExtractionSummary: expect.objectContaining({
          referenceNumber: '141260183',
          issueDate: '2026-03-11',
          dueDate: '2026-03-25',
          totalAmountMinor: 1850000,
          totalCurrency: 'CZK',
          ibanHint: 'CZ4903000000000274621920',
          qrDetected: true,
          qrRawPayload: 'SPD*1.0*ACC:CZ4903000000000274621920*AM:18500.00*CC:CZK*X-VS:141260183*X-KS:0308*X-SS:1007*RN:QR%20Hotel%20Supply%20s.r.o.*MSG:Faktura%20141260183*DT:20260325',
          qrParsedFields: expect.objectContaining({
            variableSymbol: '141260183',
            message: 'Faktura 141260183',
            referenceNumber: '141260183'
          }),
          fieldProvenance: expect.objectContaining({
            referenceNumber: 'qr',
            dueDate: 'qr',
            totalAmount: 'qr',
            ibanHint: 'qr'
          }),
          qrRecoveredFields: expect.arrayContaining(['referenceNumber', 'dueDate', 'totalAmount', 'ibanHint'])
        })
      })
    )
    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
  })

  it('routes scan-like invoices through the OCR fallback adapter on the real browser upload path', async () => {
    const invoice = getRealInputFixture('invoice-document-scan-pdf-with-ocr-stub')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimePdfFile(invoice.sourceDocument.fileName, invoice.rawInput.binaryContentBase64!)
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T09:10:00.000Z'
    })

    expect(result.fileRoutes).toContainEqual(
      expect.objectContaining({
        fileName: 'invoice-scan-ocr.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'invoice',
        documentType: 'invoice',
        decision: expect.objectContaining({
          capability: expect.objectContaining({
            profile: 'pdf_image_only',
            transportProfile: 'image_pdf'
          }),
          ingestionBranch: 'ocr-required',
          resolvedBucket: 'recognized-supported'
        })
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'invoice-scan-ocr.pdf',
        requiredFieldsCheck: 'passed',
        missingFields: [],
        documentExtractionSummary: expect.objectContaining({
          referenceNumber: 'OCR-INV-2026-77',
          issueDate: '2026-03-20',
          dueDate: '2026-03-27',
          totalAmountMinor: 650000,
          totalCurrency: 'CZK',
          finalStatus: 'parsed',
          qrDetected: false,
          ocrDetected: true,
          fieldProvenance: expect.objectContaining({
            referenceNumber: 'ocr',
            totalAmount: 'ocr'
          })
        })
      })
    )
  })

  it('keeps handwritten-like receipt scans in needs_review instead of ingest failure on the browser upload path', async () => {
    const receipt = getRealInputFixture('receipt-document-handwritten-pdf-with-ocr-stub')

    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimePdfFile(receipt.sourceDocument.fileName, receipt.rawInput.binaryContentBase64!)
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T09:25:00.000Z'
    })

    expect(result.fileRoutes).toContainEqual(
      expect.objectContaining({
        fileName: 'receipt-handwritten.pdf',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'receipt',
        documentType: 'receipt'
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'receipt-handwritten.pdf',
        requiredFieldsCheck: 'failed',
        missingFields: ['referenceNumber'],
        documentExtractionSummary: expect.objectContaining({
          issuerOrCounterparty: 'Fresh Farm Market',
          paymentDate: '2026-03-22',
          totalAmountMinor: 24900,
          totalCurrency: 'CZK',
          finalStatus: 'needs_review',
          ocrDetected: true
        })
      })
    )
    expect(result.fileRoutes.some((file) => file.fileName === 'receipt-handwritten.pdf' && file.status === 'error')).toBe(false)
  })

  it('keeps browser-first multi-receipt scan PDFs as two standalone receipt documents with extracted Tesco and Potraviny totals', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimePdfFileFromToUnicodeTextLines('scan-receipts-tesco-potraviny.pdf', [
          'TESCO Praha Eden',
          'Účtenka č. TESCO-20260329-01',
          'Datum 29.03.2026 10:15',
          'Celkem 3 254,30 CZK',
          'Platba karta',
          '',
          'Potraviny U Nádraží',
          'Doklad č. POTR-20260329-77',
          'Datum 29.03.2026 11:05',
          'Celkem 645,00',
          'Hotovost'
        ])
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T09:40:00.000Z'
    })

    expect(result.fileRoutes).toContainEqual(
      expect.objectContaining({
        fileName: 'scan-receipts-tesco-potraviny.pdf',
        sourceSystem: 'receipt',
        documentType: 'receipt',
        status: 'supported',
        intakeStatus: 'parsed',
        extractedCount: 2
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'scan-receipts-tesco-potraviny.pdf',
        documentExtractionSummary: expect.objectContaining({
          sourceSystem: 'receipt',
          documentType: 'receipt',
          finalStatus: expect.stringMatching(/parsed|needs_review/),
          extractionStages: expect.arrayContaining([
            expect.objectContaining({
              stage: 'validation_and_confidence',
              notes: expect.arrayContaining(['scanClassified=true', 'segmentedDocuments=2'])
            })
          ])
        })
      })
    )
    expect(result.extractedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'scan-receipts-tesco-potraviny.pdf',
          extractedCount: 2,
          extractedRecordIds: ['receipt-record-1', 'receipt-record-2']
        })
      ])
    )
    expect(result.reviewSections.expenseUnmatchedDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'expense-unmatched-document:receipt-record-1',
          evidenceSummary: expect.arrayContaining([
            expect.objectContaining({ label: 'částka', value: '3 254,30 Kč' }),
            expect.objectContaining({ label: 'protistrana / dodavatel', value: 'TESCO Praha Eden' })
          ])
        }),
        expect.objectContaining({
          id: 'expense-unmatched-document:receipt-record-2',
          evidenceSummary: expect.arrayContaining([
            expect.objectContaining({ label: 'částka', value: '645,00 Kč' }),
            expect.objectContaining({ label: 'protistrana / dodavatel', value: 'Potraviny U Nádraží' })
          ])
        })
      ])
    )
  })

  it('routes real scan-like PDFs into expense document review instead of unsupported files on the browser upload path', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimePdfFileFromToUnicodeTextLines('Scan 2 účtenky.PDF', [
          'TESCO Praha Eden',
          'Datum 29.03.2026 10:15',
          'Celkem 3 254,30 CZK',
          '',
          'Potraviny U Nádraží',
          'Datum 29.03.2026 11:05',
          'Celkem 645,00 Kč'
        ]),
        createRuntimePdfFileFromToUnicodeTextLines('scanDatart349.PDF', [
          'DATART',
          'HP TRONIC Zlín, spol. s r.o.',
          'Daňový doklad - FAKTURA 358260017610',
          'Datum vystavení 30.03.2026',
          'Celkem k úhradě 349,00 Kč'
        ])
      ],
      month: '2026-03',
      generatedAt: '2026-03-29T09:50:00.000Z'
    })

    expect(result.routingSummary.unsupportedFileCount).toBe(0)
    expect(result.fileRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'Scan 2 účtenky.PDF',
          status: 'supported',
          intakeStatus: 'parsed',
          sourceSystem: 'receipt',
          documentType: 'receipt',
          decision: expect.objectContaining({
            ingestionBranch: 'text-pdf-parser',
            resolvedBucket: 'recognized-supported'
          })
        }),
        expect.objectContaining({
          fileName: 'scanDatart349.PDF',
          status: 'supported',
          intakeStatus: 'parsed',
          sourceSystem: 'invoice',
          documentType: 'invoice',
          decision: expect.objectContaining({
            ingestionBranch: 'text-pdf-parser',
            resolvedBucket: 'recognized-supported'
          })
        })
      ])
    )
    expect(result.reviewSections.expenseUnmatchedDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceSummary: expect.arrayContaining([
            expect.objectContaining({ label: 'částka', value: '3 254,30 Kč' }),
            expect.objectContaining({ label: 'protistrana / dodavatel', value: 'TESCO Praha Eden' })
          ])
        }),
        expect.objectContaining({
          evidenceSummary: expect.arrayContaining([
            expect.objectContaining({ label: 'částka', value: '645,00 Kč' }),
            expect.objectContaining({ label: 'protistrana / dodavatel', value: 'Potraviny U Nádraží' })
          ])
        }),
        expect.objectContaining({
          evidenceSummary: expect.arrayContaining([
            expect.objectContaining({ label: 'částka', value: '349,00 Kč' }),
            expect.objectContaining({ label: 'reference', value: '358260017610' })
          ])
        })
      ])
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'Scan 2 účtenky.PDF',
          sourceSystem: 'receipt',
          status: 'supported',
          documentExtractionSummary: expect.objectContaining({
            sourceSystem: 'receipt',
            finalStatus: expect.stringMatching(/parsed|needs_review/),
            extractionStages: expect.arrayContaining([
              expect.objectContaining({
                stage: 'validation_and_confidence',
                notes: expect.arrayContaining(['scanClassified=true', 'segmentedDocuments=2'])
              })
            ])
          })
        }),
        expect.objectContaining({
          fileName: 'scanDatart349.PDF',
          sourceSystem: 'invoice',
          status: 'supported',
          documentExtractionSummary: expect.objectContaining({
            sourceSystem: 'invoice',
            referenceNumber: '358260017610',
            totalAmountMinor: 34900
          })
        })
      ])
    )
  })

  it('surfaces truthful no-extract diagnostics when a recognized sparse refund invoice PDF is missing any usable date', async () => {
    const result = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        createRuntimePdfFileFromToUnicodeTextLines('sparse-refund-missing-date.pdf', [
          'Faktura - daňový doklad',
          'Dodavatel',
          'Dobrá Energie s.r.o.',
          'Variabilní symbol',
          '5125144501',
          'Přeplatek',
          '3 804,00 Kč',
          'Přeplatek bude připsán na Váš bankovní účet',
          '8888997777/2010'
        ])
      ],
      month: '2026-03',
      generatedAt: '2026-03-31T16:30:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'sparse-refund-missing-date.pdf',
        extractedCount: 0
      })
    ])

    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'sparse-refund-missing-date.pdf',
        requiredFieldsCheck: 'failed',
        missingFields: ['issueDate', 'dueDate'],
        presentFields: [
          'referenceNumber',
          'issuerOrCounterparty',
          'totalAmount',
          'settlementDirection',
          'targetBankAccountHint'
        ],
        noExtractReason: 'missing-usable-date',
        parsedSupplierOrCounterparty: 'Dobrá Energie s.r.o.',
        parsedReferenceNumber: '5125144501',
        parsedSettlementDirection: 'refund_incoming',
        parsedAmountMinor: 380400,
        parsedAmountCurrency: 'CZK',
        parsedTargetBankAccountHint: '8888997777/2010',
        textPreview: expect.stringContaining('Dobrá Energie s.r.o.'),
        textTailPreview: expect.stringContaining('8888997777/2010'),
        documentExtractionSummary: expect.objectContaining({
          documentKind: 'invoice',
          settlementDirection: 'refund_incoming',
          referenceNumber: '5125144501',
          totalAmountMinor: 380400,
          targetBankAccountHint: '8888997777/2010',
          finalStatus: 'needs_review'
        })
      })
    )
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
        id: 'txn:bank:fio-row-1:uploaded-bank-2-pohyby-na-uctu-8888997777-20260301-20260319-csv',
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
        bankTransactionId: 'txn:bank:fio-row-1:uploaded-bank-2-pohyby-na-uctu-8888997777-20260301-20260319-csv',
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
        id: expect.stringMatching(/^txn:bank:fio-row-1:uploaded-bank-4-pohyby-na-uctu-8888997777-20260301-20260319-csv$/),
        source: 'bank',
        direction: 'in',
        accountId: '8888997777/2010'
      })
    ])
    const inboundBankTransactions = batch.reconciliation.normalizedTransactions.filter((transaction) =>
      transaction.source === 'bank' && transaction.direction === 'in'
    )
    expect(inboundBankTransactions).toHaveLength(2)
    expect(new Set(inboundBankTransactions.map((transaction) => transaction.id)).size).toBe(2)
    expect(inboundBankTransactions.map((transaction) => transaction.id)).toEqual([
      'txn:bank:fio-row-1',
      'txn:bank:fio-row-1:uploaded-bank-4-pohyby-na-uctu-8888997777-20260301-20260319-csv'
    ])
    expect(inboundBankTransactions.map((transaction) => transaction.accountId)).toEqual([
      '5599955956/5500',
      '8888997777/2010'
    ])
    expect(batch.reconciliation.workflowPlan?.previoReservationTruth).toEqual([
      expect.objectContaining({
        reservationId: 'PREVIO-20260314',
        reference: 'PREVIO-20260314',
        sourceSystem: 'previo',
        grossRevenueMinor: 42000,
        outstandingBalanceMinor: 3000,
        currency: 'CZK',
        channel: 'direct-web',
        expectedSettlementChannels: ['comgate']
      })
    ])
    expect(batch.reconciliation.workflowPlan?.reservationSources.length).toBe(0)
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
    expect(batch.reconciliation.workflowPlan?.reservationSettlementNoMatches).toEqual([])
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
    expect(state.reviewSections.reservationSettlementOverview).toEqual([])
    expect(state.reviewSections.ancillarySettlementOverview).toEqual([])
    expect(state.reviewSections.unmatchedReservationSettlements).toEqual([])
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

    expect(result.preview.review.reservationSettlementOverview).toEqual([])
    expect(result.preview.review.ancillarySettlementOverview).toEqual([])
    expect(result.preview.review.unmatchedReservationSettlements).toEqual([])
    expect(result.html).not.toContain('Rezervace PREVIO-20260314')
    expect(result.html).not.toContain('Chybí deterministická vazba na odpovídající úhradu.')
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
    expect(result).toHaveProperty('reservationPaymentOverview')
    expect(result.reservationPaymentOverview.blocks.map((block) => block.key)).toEqual([
      'airbnb',
      'booking',
      'expedia',
      'reservation_plus',
      'parking'
    ])
    expect(result.reviewSections).toHaveProperty('reservationSettlementOverview')
    expect(result.reviewSections).toHaveProperty('ancillarySettlementOverview')
  })

  it('surfaces grounded Booking, Expedia, Reservation+, and Parking items when those source files are uploaded together', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const expedia = getRealInputFixture('expedia-payout-export')
    const comgate = getRealInputFixture('comgate-export-current-portal')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile(booking.sourceDocument.fileName, booking.rawInput.content),
        createRuntimeFile(expedia.sourceDocument.fileName, expedia.rawInput.content),
        createRuntimeFile(comgate.sourceDocument.fileName, comgate.rawInput.content)
      ],
      month: '2026-03',
      generatedAt: '2026-03-25T10:45:00.000Z'
    })

    expect(result.reservationPaymentOverview.blocks.map((block) => ({
      key: block.key,
      itemCount: block.itemCount
    }))).toEqual([
      { key: 'airbnb', itemCount: 0 },
      { key: 'booking', itemCount: 0 },
      { key: 'expedia', itemCount: 1 },
      { key: 'reservation_plus', itemCount: 1 },
      { key: 'parking', itemCount: 1 }
    ])
    expect(result.reservationPaymentOverview.summary.statusCounts).toEqual({
      paid: 3,
      partial: 0,
      unverified: 0,
      missing: 0
    })
  })

  it('keeps booking-like Previo channels in Booking, formats outstanding EUR detail values, and splits Comgate parking-like rows from website reservations', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile(
          'reservations-export-2026-03.xlsx',
          buildPrevioWorkbookBase64FromRows([
            {
              createdAt: '02.03.2026 09:15',
              stayStartAt: '03.03.2026',
              stayEndAt: '04.03.2026',
              voucher: '5178029336',
              guestName: 'Booking Guest',
              channel: 'Booking.com Prepaid',
              amountText: '46,90 EUR',
              outstandingText: '46,90 EUR',
              roomName: 'A101'
            }
          ])
        ),
        createRuntimeFile(
          'comgate-portal.csv',
          [
            '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
            '"CG-PORTAL-TRX-2001";"CG-WEB-2001";"18.03.2026 09:15";"18.03.2026 09:16";"19.03.2026";"guest@example.com";"CG-WEB-2001";"JOKELAND s.r.o.";"1549,00";"CZK";"website-reservation";"0,00";"0,00";"9,00";"9,00"',
            '"CG-PORTAL-TRX-2002";"CG-PARK-2001";"18.03.2026 10:20";"18.03.2026 10:21";"19.03.2026";"parking@example.com";"CG-PARK-2001";"JOKELAND s.r.o.";"42,00";"CZK";"parking-fee";"0,00";"0,00";"2,00";"2,00"'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T10:00:00.000Z'
    })

    expect(result.reservationPaymentOverview.blocks.map((block) => ({
      key: block.key,
      itemCount: block.itemCount
    }))).toEqual([
      { key: 'airbnb', itemCount: 0 },
      { key: 'booking', itemCount: 1 },
      { key: 'expedia', itemCount: 0 },
      { key: 'reservation_plus', itemCount: 1 },
      { key: 'parking', itemCount: 1 }
    ])

    const bookingItem = result.reservationPaymentOverview.blocks
      .find((block) => block.key === 'booking')
      ?.items[0]
    expect(bookingItem).toEqual(expect.objectContaining({
      title: 'Booking Guest',
      currency: 'EUR'
    }))
    expect(bookingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Zbývá uhradit', value: '46,90 EUR' })
    ]))
  })

  it('keeps the existing Booking payout batch baseline stable while reservation-centric Booking confirmation logic changes', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T11:30:00.000Z'
    })

    expect(
      result.reviewSections.payoutBatchMatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(true)
  })

  it('marks Greta as paid in browser runtime when a Booking payout row exists and keeps Tatiana unverified without one', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile(
          'reservations-export-2026-03.xlsx',
          buildPrevioWorkbookBase64FromRows([
            {
              createdAt: '06.03.2026 08:00',
              stayStartAt: '06.03.2026',
              stayEndAt: '08.03.2026',
              voucher: '6622415324',
              guestName: 'Greta Sieweke',
              channel: 'Booking.com Prepaid',
              amountText: '259,84 EUR',
              outstandingText: '259,84 EUR',
              roomName: 'A201'
            },
            {
              createdAt: '06.03.2026 08:10',
              stayStartAt: '06.03.2026',
              stayEndAt: '08.03.2026',
              voucher: '5280445951',
              guestName: 'Tatiana Trakaliuk',
              channel: 'Booking.com Prepaid',
              amountText: '52,26 EUR',
              outstandingText: '52,26 EUR',
              roomName: 'A202'
            }
          ])
        ),
        createRuntimeArrayBufferTextFile(
          'booking-greta.csv',
          buildBookingBrowserUploadContentFromRows([
            {
              reservationId: '6622415324',
              checkIn: '2026-03-06',
              checkout: '2026-03-08',
              guestName: 'Greta Sieweke',
              currency: 'EUR',
              amountText: '259,84',
              payoutDate: '12 Mar 2026',
              payoutId: 'PAYOUT-BOOK-20260310'
            }
          ]),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('booking-greta.pdf', [
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
          'Rezervace 6622415324',
          'Reservation 6. března 2026 8. března 2026',
          'Greta Sieweke',
          'Celkem (CZK) 6,337.07 Kč',
          'Celková částka k vyplacení € 259.84',
          'Celková částka k vyplacení (CZK)',
          'Směnný kurz 24.3955',
          'Bankovní údaje',
          'IBAN CZ65 5500 0000 0000 5599 555956'
        ])
      ],
      month: '2026-03',
      generatedAt: '2026-04-06T08:20:00.000Z'
    })

    const bookingItems = result.reservationPaymentOverview.blocks.find((block) => block.key === 'booking')?.items ?? []

    expect(bookingItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Greta Sieweke',
        primaryReference: '6622415324',
        statusKey: 'paid',
        evidenceKey: 'payout',
        transactionIds: ['txn:payout:booking-payout-1']
      }),
      expect.objectContaining({
        title: 'Tatiana Trakaliuk',
        primaryReference: '5280445951',
        statusKey: 'unverified',
        evidenceKey: 'no_evidence',
        transactionIds: []
      })
    ]))
  })

  it('marks the six explicit Booking payout PDF membership reservations as paid in browser runtime and keeps non-members unverified', async () => {
    const explicitMembershipReservations = [
      {
        reservationId: '6529631423',
        guestName: 'Sedláček Jan',
        amountText: '378,88 EUR',
        roomName: 'A201',
        createdAt: '18.03.2026 08:00',
        stayStartAt: '26.03.2026',
        stayEndAt: '28.03.2026'
      },
      {
        reservationId: '6008299863',
        guestName: 'Anatoliy Chebotaryov',
        amountText: '151,04 EUR',
        roomName: 'A202',
        createdAt: '18.03.2026 08:10',
        stayStartAt: '26.03.2026',
        stayEndAt: '27.03.2026'
      },
      {
        reservationId: '6415593183',
        guestName: 'Aryna Ponomarenko',
        amountText: '165,12 EUR',
        roomName: 'A203',
        createdAt: '19.03.2026 08:20',
        stayStartAt: '27.03.2026',
        stayEndAt: '29.03.2026'
      },
      {
        reservationId: '5159718129',
        guestName: 'Jozef Kluvanec',
        amountText: '276,48 EUR',
        roomName: 'A204',
        createdAt: '20.03.2026 08:30',
        stayStartAt: '27.03.2026',
        stayEndAt: '30.03.2026'
      },
      {
        reservationId: '6126906663',
        guestName: 'Ronny Ronald Gündel',
        amountText: '166,40 EUR',
        roomName: 'A205',
        createdAt: '21.03.2026 08:40',
        stayStartAt: '28.03.2026',
        stayEndAt: '30.03.2026'
      },
      {
        reservationId: '6354636438',
        guestName: 'Amir Fetratnejad',
        amountText: '294,40 EUR',
        roomName: 'A206',
        createdAt: '21.03.2026 08:50',
        stayStartAt: '28.03.2026',
        stayEndAt: '31.03.2026'
      }
    ]

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile(
          'reservations-export-2026-03.xlsx',
          buildPrevioWorkbookBase64FromRows([
            ...explicitMembershipReservations.map((reservation) => ({
              createdAt: reservation.createdAt,
              stayStartAt: reservation.stayStartAt,
              stayEndAt: reservation.stayEndAt,
              voucher: reservation.reservationId,
              guestName: reservation.guestName,
              channel: 'Booking.com Prepaid',
              amountText: reservation.amountText,
              outstandingText: reservation.amountText,
              roomName: reservation.roomName
            })),
            {
              createdAt: '22.03.2026 09:00',
              stayStartAt: '31.03.2026',
              stayEndAt: '02.04.2026',
              voucher: '5280445951',
              guestName: 'Tatiana Trakaliuk',
              channel: 'Booking.com Prepaid',
              amountText: '52,26 EUR',
              outstandingText: '52,26 EUR',
              roomName: 'A207'
            }
          ])
        ),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603270912.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '27.03.2026 09:10;27.03.2026 09:12;5599955956/5500;000000-9876543210/0300;Incoming bank transfer;52938,86;CZK;Settlement credit'
          ].join('\n'),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines(
          'booking-payout-statement-010738140021.pdf',
          [
            'Booking.com B.V.',
            'Výkaz plateb',
            'Datum vyplacení částky 26. března 2026',
            'ID platby 010738140021',
            'Celková částka k vyplacení 52,938.86 CZK',
            'IBAN CZ65 5500 0000 0000 5599 555956',
            ...explicitMembershipReservations.map((reservation) => `Rezervace ${reservation.reservationId}`)
          ]
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-06T10:15:00.000Z'
    })

    expect(result.reviewSections.payoutBatchMatched).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: expect.stringContaining('Booking payout 010738140021')
      })
    ]))
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(1)

    const bookingItems = result.reservationPaymentOverview.blocks.find((block) => block.key === 'booking')?.items ?? []

    expect(bookingItems).toEqual(expect.arrayContaining(
      explicitMembershipReservations.map((reservation) => expect.objectContaining({
        title: reservation.guestName,
        primaryReference: reservation.reservationId,
        statusKey: 'paid',
        evidenceKey: 'payout',
        transactionIds: [],
        sourceDocumentIds: expect.arrayContaining([
          expect.stringMatching(/^uploaded:previo:/),
          expect.stringMatching(/^uploaded:booking:.*010738140021.*pdf$/)
        ])
      }))
    ))
    expect(bookingItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Tatiana Trakaliuk',
        primaryReference: '5280445951',
        statusKey: 'unverified',
        evidenceKey: 'no_evidence',
        transactionIds: []
      })
    ]))
    expect(bookingItems).toHaveLength(7)
  })

  it('keeps raw Booking payout rows out of the reservation column and marks Denisa paid only from exact Booking row evidence', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeWorkbookFile(
          'reservations-export-2026-03.xlsx',
          buildPrevioWorkbookBase64FromRows([
            {
              createdAt: '06.03.2026 08:10',
              stayStartAt: '07.03.2026',
              stayEndAt: '09.03.2026',
              voucher: '5178029336',
              guestName: 'Denisa Hypiusová',
              channel: 'Booking.com Prepaid',
              amountText: '44,80 EUR',
              outstandingText: '44,80 EUR',
              roomName: 'A202'
            },
            {
              createdAt: '06.03.2026 08:40',
              stayStartAt: '14.03.2026',
              stayEndAt: '16.03.2026',
              voucher: '5280445951',
              guestName: 'Tatiana Trakaliuk',
              channel: 'Booking.com Prepaid',
              amountText: '52,26 EUR',
              outstandingText: '52,26 EUR',
              roomName: 'A205'
            }
          ])
        ),
        createRuntimeArrayBufferTextFile(
          'booking-batch.csv',
          buildBookingBrowserUploadContentFromRows([
            {
              reservationId: '5178029336',
              checkIn: '2026-03-07',
              checkout: '2026-03-09',
              guestName: 'Denisa Hypiusová',
              currency: 'EUR',
              amountText: '44,80',
              payoutDate: '12 Mar 2026',
              payoutId: 'PAYOUT-BOOK-20260310'
            },
            {
              reservationId: '6748282290',
              checkIn: '2026-03-09',
              checkout: '2026-03-12',
              guestName: 'Anonymous Booking Row 1',
              currency: 'EUR',
              amountText: '62,11',
              payoutDate: '12 Mar 2026',
              payoutId: 'PAYOUT-BOOK-20260310'
            },
            {
              reservationId: '6797262580',
              checkIn: '2026-03-10',
              checkout: '2026-03-13',
              guestName: 'Anonymous Booking Row 2',
              currency: 'EUR',
              amountText: '99,80',
              payoutDate: '12 Mar 2026',
              payoutId: 'PAYOUT-BOOK-20260310'
            }
          ]),
          'text/csv'
        )
      ],
      month: '2026-03',
      generatedAt: '2026-04-06T11:30:00.000Z'
    })

    const bookingItems = result.reservationPaymentOverview.blocks.find((block) => block.key === 'booking')?.items ?? []

    expect(bookingItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Denisa Hypiusová',
        primaryReference: '5178029336',
        statusKey: 'paid',
        evidenceKey: 'payout',
        transactionIds: ['txn:payout:booking-payout-1']
      }),
      expect.objectContaining({
        title: 'Tatiana Trakaliuk',
        primaryReference: '5280445951',
        statusKey: 'unverified',
        evidenceKey: 'no_evidence',
        transactionIds: []
      })
    ]))

    expect(bookingItems).toHaveLength(2)
    expect(bookingItems.map((item) => item.primaryReference)).not.toEqual(expect.arrayContaining(['6748282290', '6797262580']))
    expect(result.reviewSections.payoutBatchMatched).toEqual([])
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

  it('accepts the compact Airbnb browser upload variant and carries it into payout reconciliation without reintroducing ingest failures', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb_03_2026-03_2026.csv', buildCompactUploadedAirbnbContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Booking35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ],
      month: '2026-03',
      generatedAt: '2026-03-28T09:25:00.000Z'
    })

    expect(result.routingSummary).toEqual({
      uploadedFileCount: 5,
      supportedFileCount: 5,
      unsupportedFileCount: 0,
      errorFileCount: 0
    })
    expect(result.fileRoutes.some((file) => file.status === 'error')).toBe(false)
    expect(result.fileRoutes).toContainEqual(
      expect.objectContaining({
        fileName: 'airbnb_03_2026-03_2026.csv',
        status: 'supported',
        intakeStatus: 'parsed',
        sourceSystem: 'airbnb',
        documentType: 'ota_report'
      })
    )
    expect(result.extractedRecords).toContainEqual(
      expect.objectContaining({
        fileName: 'airbnb_03_2026-03_2026.csv',
        extractedCount: getRealUploadedAirbnbTransferRowsWithoutReferenceColumn().length,
        accountLabelCs: 'Airbnb payout report'
      })
    )
    expect(result.runtimeAudit.fileIntakeDiagnostics).toContainEqual(
      expect.objectContaining({
        fileName: 'airbnb_03_2026-03_2026.csv',
        sourceSystem: 'airbnb',
        documentType: 'ota_report',
        airbnbHeaderDiagnostics: expect.objectContaining({
          parserVariant: 'structured-export',
          rawHeaderRow: 'Datum převodu;Částka převodu;Měna;Reference code;Confirmation code;Nabídka',
          normalizedHeaders: ['payoutDate', 'amountMinor', 'currency', 'payoutReference', 'reservationId', 'listingId'],
          normalizedHeaderMap: [
            'Datum převodu -> payoutDate',
            'Částka převodu -> amountMinor',
            'Měna -> currency',
            'Reference code -> payoutReference',
            'Confirmation code -> reservationId',
            'Nabídka -> listingId'
          ],
          mappedCanonicalHeaders: expect.objectContaining({
            payoutDate: 'Datum převodu',
            payoutReference: 'Reference code',
            reservationId: 'Confirmation code',
            listingId: 'Nabídka'
          }),
          missingCanonicalHeaders: []
        })
      })
    )
    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(
      result.reviewSections.payoutBatchMatched.some((item) => item.title === 'Booking payout 010638445054 / 35 530,12 Kč')
    ).toBe(true)
    expect(
      result.reviewSections.payoutBatchMatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(15)
    expect(
      result.reviewSections.payoutBatchUnmatched.filter((item) => item.title.startsWith('Airbnb payout dávka ')).length
    ).toBe(2)
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
    expect(uploadedRun.html).toContain('class="review-amount-value"')
    expect(uploadedRun.html).toContain('class="review-amount-label">částka</span>')
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
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(3)
    expect(result.reviewSections.payoutBatchUnmatched.map((item) => item.title)).toEqual([
      'Airbnb payout dávka G-IZLCELA7C5EFN',
      'Airbnb payout dávka G-6G5WFOJO5DJCI',
      'Booking payout PAYOUT-BOOK-20260310 / 1 250,00 Kč'
    ])
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
    const bookingMatchedItem = result.reviewSections.payoutBatchMatched.find((item) =>
      item.title === 'Booking payout 010638445054 / 35 530,12 Kč'
    )
    const firstAirbnbMatched = result.reviewSections.payoutBatchMatched.find((item) =>
      item.title.startsWith('Airbnb payout dávka ')
    )
    const firstAirbnbUnmatched = result.reviewSections.payoutBatchUnmatched.find((item) =>
      item.title.startsWith('Airbnb payout dávka ')
    )

    expect(bookingMatchedItem).toBeDefined()
    expect(bookingMatchedItem).toMatchObject({
      matchStrength: 'potvrzená shoda',
      operatorExplanation: expect.stringContaining('Shoda dávky a bankovního přípisu')
    })
    expect(bookingMatchedItem?.evidenceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'částka', value: expect.stringContaining('35 530,12 Kč') }),
        expect.objectContaining({ label: 'datum', value: expect.stringContaining('payout 2026-03-12') }),
        expect.objectContaining({ label: 'dokument', value: expect.stringContaining('doplňkový payout doklad přiložen') })
      ])
    )
    expect(['potvrzená shoda', 'slabší shoda']).toContain(firstAirbnbMatched?.matchStrength)
    expect(firstAirbnbMatched?.evidenceSummary.some((entry) => entry.label === 'částka')).toBe(true)
    expect(firstAirbnbUnmatched?.matchStrength).toBe('nespárováno')
    expect(firstAirbnbUnmatched?.operatorCheckHint).toContain('Zkontrolujte ručně')
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

  it('keeps the real browser-like 4-file arrayBuffer path at 16 matched and 2 unmatched when the Fio bank export contains duplicate amount-like columns', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentWithDuplicateAmountColumnsForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T18:05:00.000Z'
    })

    const matchedAirbnbDecision = result.reconciliationSnapshot.payoutBatchDecisions.find((decision) =>
      decision.platform === 'airbnb'
      && decision.expectedBankAmountMinor === 396105
    )

    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reportSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reportSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(result.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(result.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(matchedAirbnbDecision).toEqual(
      expect.objectContaining({
        matchingAmountSource: 'batch_total',
        expectedBankAmountMinor: 396105,
        expectedBankCurrency: 'CZK',
        exactAmountMatchExistsBeforeDateEvidence: true,
        sameCurrencyCandidateAmountMinors: expect.arrayContaining([396105]),
        bankCandidateCountAfterAmountCurrency: 1,
        matched: true
      })
    )
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

  it('keeps the real browser-like 4-file arrayBuffer path at 16 matched and 2 unmatched when Airbnb bank postings land outside the normal date window but exact amounts stay unique', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(-5),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ],
      month: '2026-03',
      generatedAt: '2026-03-26T20:10:00.000Z'
    })

    const airbnbMatchedDecisions = result.reconciliationSnapshot.payoutBatchDecisions.filter((decision) =>
      decision.platform === 'airbnb' && decision.matched
    )

    expect(result.reconciliationSnapshot.matchedCount).toBe(16)
    expect(result.reconciliationSnapshot.unmatchedCount).toBe(2)
    expect(result.reconciliationSnapshot.airbnbUnmatchedHistogram).toEqual({
      noExactAmount: 2,
      dateRejected: 0,
      evidenceRejected: 0,
      ambiguous: 0,
      other: 0
    })
    expect(airbnbMatchedDecisions).toHaveLength(15)
    expect(
      airbnbMatchedDecisions.every((decision) =>
        decision.selectionMode === 'unique_exact_amount_fallback'
        && decision.bankCandidateCountAfterAmountCurrency === 1
        && decision.bankCandidateCountAfterDateWindow === 0
      )
    ).toBe(true)
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
    expect(rendered.runtimeOutput.innerHTML).toContain('id="open-expense-review-button"')
  })

  it('opens a dedicated expense review page from the upload workflow and keeps Lenner visible outside payout matching', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeUploadWebFlowMainWorkflow({
      generatedAt: '2026-03-29T14:30:00.000Z',
      month: '2026-03',
      files: [
        createRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbCitiContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    const expenseReviewPageHtml = rendered.openExpenseReviewPage()

    expect(expenseReviewPageHtml).toContain('Kontrola výdajů a dokladů')
    expect(expenseReviewPageHtml).toContain('Spárované výdaje')
    expect(expenseReviewPageHtml).toContain('Výdaje ke kontrole')
    expect(expenseReviewPageHtml).toContain('Nespárované doklady')
    expect(expenseReviewPageHtml).toContain('Nespárované odchozí platby')
    expect(expenseReviewPageHtml).toContain('<h6>Doklad</h6>')
    expect(expenseReviewPageHtml).toContain('<h6>Stav a důkazy</h6>')
    expect(expenseReviewPageHtml).toContain('<h6>Banka</h6>')
    expect(expenseReviewPageHtml).toContain('Lenner Motors s.r.o.')
    expect(expenseReviewPageHtml).toContain('141260183')
    expect(expenseReviewPageHtml).toContain('Doklad ↔ banka:')
    expect(expenseReviewPageHtml).toContain('class="review-amount-block"')
    expect(expenseReviewPageHtml).toContain('class="review-amount-label">Částka</span>')
    expect(expenseReviewPageHtml).not.toContain('<li><strong>Částka:</strong>')
    expect(expenseReviewPageHtml).not.toContain('Airbnb payout dávka')
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
  openExpenseReviewPage: () => string
}> {
  const flow = buildUploadWebFlow({
    generatedAt: input.generatedAt
  })
  const script = extractUploadWebInlineScript(flow.html)
  const elements = createUploadWebDomStub()
  let openedExpenseReviewHtml = ''
  const windowObject = {
    __hotelFinanceCreateBrowserRuntime: createBrowserRuntime,
    open() {
      openedExpenseReviewHtml = ''

      return {
        document: {
          open() {
            openedExpenseReviewHtml = ''
          },
          write(value: string) {
            openedExpenseReviewHtml += value
          },
          close() { }
        }
      }
    }
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
    runtimeOutput: elements['runtime-output'],
    openExpenseReviewPage() {
      const button = elements['open-expense-review-button']

      if (button?.listeners.click) {
        button.listeners.click()
      }

      return openedExpenseReviewHtml
    }
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
    'runtime-output',
    'open-expense-review-button'
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
    setAttribute() { },
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

function buildPrevioBrowserShapeWorkbookBase64(): string {
  return buildPrevioWorkbookBase64FromRows([
    {
      createdAt: '13.03.2026 09:15',
      stayStartAt: '14.03.2026',
      stayEndAt: '16.03.2026',
      voucher: 'PREVIO-20260314',
      guestName: 'Jan Novak',
      companyName: 'Acme Travel s.r.o.',
      channel: 'direct-web',
      amountText: '420,00',
      outstandingText: '30,00',
      roomName: 'A101'
    }
  ])
}

function buildInvoiceListWorkbookBase64(): string {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      'Voucher', 'Variabilní symbol', 'Příjezd', 'Odjezd', 'Jméno', 'Pokoje',
      'Způsob úhrady', 'Zákazník', 'ID zákazníka', 'Číslo dokladu',
      'Název', 'Celkem s DPH', 'Celkem bez DPH'
    ],
    ['RES-100', '11111111', '01.03.2026', '03.03.2026', 'Jan Novák', 'A101', 'Kartou', 'Firma X', 'C-100', 'FA-100', '', '2 000 Kč', '1 652 Kč']
  ])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Seznam dokladů')
  return XLSX.write(workbook, { type: 'base64', bookType: 'xls' })
}

function buildInvoiceListProductionWorkbookBase64(): string {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Doklady - export'],
    [''],
    ['Doklad č.', 'Voucher', 'Variabilní  symbol', 'Termín od', 'Termín do', 'Jméno hosta', 'Pokoj', 'Zákazník', 'ID zákazníka', 'Částka celkem', 'Základ DPH'],
    ['FA-20260325', 'RES-PROD-UPLOAD', '22446688', '25.03.2026', '27.03.2026', 'Dana Upload', 'D404', 'Firma Upload', 'CID-U404', '4 500 Kč', '3 719 Kč']
  ]), 'Doklady')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn', 'Hodnota'],
    ['Počet dokladů', '1']
  ]), 'Souhrn')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Položky dokladů - export'],
    [''],
    ['Doklad č.', 'Název položky', 'Částka celkem', 'Základ DPH'],
    ['FA-20260325', 'Ubytování', '4 000 Kč', '3 306 Kč'],
    ['FA-20260325', 'Parkování na den', '500 Kč', '413 Kč']
  ]), 'Položky dokladů')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn položek', 'Hodnota'],
    ['Počet položek', '2']
  ]), 'Souhrn položek')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Souhrn podle rastrů', 'Hodnota'],
    ['Rastr', 'A']
  ]), 'Souhrn podle rastrů')
  return XLSX.write(workbook, { type: 'base64', bookType: 'xls' })
}

function buildPrevioWorkbookBase64FromRows(rows: Array<{
  createdAt: string
  stayStartAt: string
  stayEndAt: string
  voucher: string
  guestName: string
  companyName?: string
  channel: string
  amountText: string
  outstandingText?: string
  roomName?: string
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
      row.companyName ?? '',
      row.channel,
      'confirmed',
      row.amountText,
      row.outstandingText ?? '0,00',
      row.roomName ?? 'A101'
    ])
  ])
  XLSX.utils.book_append_sheet(workbook, reservationSheet, 'Seznam rezervací')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Přehled rezervací'],
    ['Počet rezervací', String(rows.length)]
  ]), 'Přehled rezervací')
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
}

function buildBookingBrowserUploadContentFromRows(rows: Array<{
  reservationId: string
  checkIn: string
  checkout: string
  guestName: string
  currency: string
  amountText: string
  payoutDate: string
  payoutId: string
}>): string {
  return [
    'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
    ...rows.map((row) => [
      'Reservation',
      row.reservationId,
      row.checkIn,
      row.checkout,
      row.guestName,
      'OK',
      row.currency,
      'Paid',
      row.amountText,
      row.payoutDate,
      row.payoutId
    ].join(';'))
  ].join('\n')
}

function buildRealMixedAirbnbVoucherMatchContent(): string {
  return [
    'Datum,Bude připsán do dne,Typ,Potvrzující kód,Datum zahájení,Datum ukončení,Host,Nabídka,Podrobnosti,Měna,Částka,Vyplaceno,Servisní poplatek,Hrubé výdělky',
    '03/13/2026,03/20/2026,Payout,,,,,,"Převod Jokeland s.r.o., IBAN 5956 (CZK)",CZK,,4456.97,,',
    '03/13/2026,,Rezervace,HMY8K5DYTB,03/12/2026,03/14/2026,Yağız Alp Kayhan,Studio apartmán s balkónem v centru Prahy,,EUR,122.44,,22.46,144.90',
    '03/10/2026,03/17/2026,Payout,,,,,,"Převod Jokeland s.r.o., IBAN 5956 (CZK)",CZK,,1152.81,,',
    '03/10/2026,,Rezervace,HMSPW3X3T9,03/09/2026,03/10/2026,Sanjar Kakharov,Studio apartmán s balkónem v centru Prahy,,EUR,47.32,,8.68,56.00',
    '03/09/2026,03/16/2026,Payout,,,,,,"Převod Jokeland s.r.o., IBAN 5956 (CZK)",CZK,,970.36,,',
    '03/09/2026,,Rezervace,HMXWSA222M,03/08/2026,03/09/2026,Patrik Ševčík,Studio apartmán s balkónem v centru Prahy,,EUR,39.71,,7.29,47.00',
    '03/09/2026,03/13/2026,Payout,,,,,,"Převod Jokeland s.r.o., IBAN 5956 (CZK)",CZK,,3518.94,,',
    '03/09/2026,,Rezervace,HM35X35WJ8,03/07/2026,03/08/2026,Eliška Geržová,Studio apartmán s balkónem v centru Prahy,,EUR,70.73,,12.97,83.70',
    '03/09/2026,,Rezervace,HM4S532B32,03/07/2026,03/08/2026,Tomasz Rybarski,"Studio apartmán se saunou, vířivkou  v centru",,EUR,73.51,,13.49,87.00'
  ].join('\n')
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

function createRuntimePdfFileFromToUnicodeTextFragments(name: string, lines: string[][]) {
  return createRuntimePdfFile(name, buildRuntimePdfBase64FromToUnicodeTextFragments(lines))
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

function buildRuntimePdfBase64FromToUnicodeTextFragments(lines: string[][]): string {
  const definition = buildToUnicodeFragmentPdfDefinition(lines)
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

function buildToUnicodeFragmentPdfDefinition(lines: string[][]): {
  contentStream: string
  toUnicodeStream: string
} {
  const codeByCharacter = new Map<string, string>()
  const mappingEntries: Array<{ code: string; unicodeHex: string }> = []
  let nextCodePoint = 1

  const encodeFragment = (fragment: string): string => Array.from(fragment).map((character) => {
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

  const encodedLines = lines.map((line) => line.map(encodeFragment))
  const contentStream = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    ...encodedLines.flatMap((line, index) => {
      const encodedLine = line.length === 1
        ? `<${line[0]}> Tj`
        : `[${line.map((fragment) => `<${fragment}>`).join(' 0 ')}] TJ`

      return index === 0
        ? [encodedLine]
        : ['0 -18 Td', encodedLine]
    }),
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

function buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndExpenseOutflows(daysShift = 0): string {
  return [
    buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(daysShift),
    '25.03.2026 10:15;25.03.2026 10:17;5599955956/5500;CZ4903000000000274621920;Lenner Motors s.r.o.;-12629,52;CZK;VS 141260183 Servis vozidla',
    '26.03.2026 11:20;26.03.2026 11:23;5599955956/5500;000000-1111111111/0100;Dodavatel bez dokladu;-4500,00;CZK;Platba bez dokladu'
  ].join('\n')
}

function buildRaiffeisenbankGpcLennerReviewContentWithReferenceOnlyContinuation(): string {
  return [
    '0740000005599955956JOKELAND s.r.o.',
    buildRaiffeisenbankGpcTransactionLine({
      mainAccountId: '0000005599955956',
      counterpartyPrefix: '000000',
      counterpartyAccountNumber: '0274621920',
      counterpartyBankCode: '0300',
      amountMinor: '000001262952',
      directionCode: '4',
      valueAt: '080426',
      bookedAt: '080426'
    }),
    '078VS 141260183 Servis vozidla'
  ].join('\n')
}

function buildRaiffeisenbankGpcLennerReviewContentWithServiceOnlyContinuation(): string {
  return [
    '0740000005599955956JOKELAND s.r.o.',
    buildRaiffeisenbankGpcTransactionLine({
      mainAccountId: '0000005599955956',
      counterpartyPrefix: '000000',
      counterpartyAccountNumber: '0274621920',
      counterpartyBankCode: '0300',
      amountMinor: '000001262952',
      directionCode: '1',
      valueAt: '080426',
      bookedAt: '080426'
    }),
    '078Servis vozidla'
  ].join('\n')
}

function buildRaiffeisenbankGpcTransactionLine(input: {
  mainAccountId: string
  counterpartyPrefix: string
  counterpartyAccountNumber: string
  counterpartyBankCode: string
  amountMinor: string
  directionCode: string
  valueAt: string
  bookedAt: string
}): string {
  const chars = Array.from({ length: 128 }, () => ' ')
  writeRaiffeisenbankGpcField(chars, 0, 3, '075')
  writeRaiffeisenbankGpcField(chars, 3, 19, input.mainAccountId)
  writeRaiffeisenbankGpcField(chars, 19, 25, input.counterpartyPrefix)
  writeRaiffeisenbankGpcField(chars, 25, 35, input.counterpartyAccountNumber)
  writeRaiffeisenbankGpcField(chars, 35, 39, input.counterpartyBankCode)
  writeRaiffeisenbankGpcField(chars, 47, 48, '5')
  writeRaiffeisenbankGpcField(chars, 48, 60, input.amountMinor)
  writeRaiffeisenbankGpcField(chars, 60, 61, input.directionCode)
  writeRaiffeisenbankGpcField(chars, 91, 97, input.valueAt)
  writeRaiffeisenbankGpcField(chars, 122, 128, input.bookedAt)

  return chars.join('')
}

function writeRaiffeisenbankGpcField(buffer: string[], start: number, end: number, value: string): void {
  const normalized = value.padEnd(end - start, ' ').slice(0, end - start)
  buffer.splice(start, end - start, ...normalized)
}

function buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndDobraSettlementDocuments(): string {
  return [
    buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
    '24.03.2026 10:15;24.03.2026 10:17;5599955956/5500;CZ6508000000192000145399;Dobrá Energie s.r.o.;-7125,00;CZK;VS 2026034501 Dodávka elektřiny',
    '25.03.2026 09:05;25.03.2026 09:07;5599955956/5500;000000-2222333344/0800;Dobrá Energie s.r.o.;2450,00;CZK;Vrácení přeplatku VS 2026039901'
  ].join('\n')
}

function buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndSparseDobraRefundDocument(): string {
  return [
    buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
    '25.03.2026 09:05;25.03.2026 09:07;5599955956/5500;000000-2222333344/0800;Dobrá Energie s.r.o.;3804,00;CZK;Vrácení přeplatku VS 5125144501'
  ].join('\n')
}

function buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndIntegerExpenseOutflow(): string {
  return [
    buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
    '25.03.2026 10:15;25.03.2026 10:17;5599955956/5500;CZ4903000000000274621920;Lenner Motors s.r.o.;-12629,52;CZK;VS 141260183 Servis vozidla',
    '26.03.2026 11:20;26.03.2026 11:23;5599955956/5500;000000-1111111111/0100;Dodavatel bez dokladu;-3120;CZK;Platba bez dokladu'
  ].join('\n')
}

function buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndInternalTransferOutflow(): string {
  return [
    buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
    '25.03.2026 10:15;25.03.2026 10:17;5599955956/5500;CZ4903000000000274621920;Lenner Motors s.r.o.;-12629,52;CZK;VS 141260183 Servis vozidla',
    '27.03.2026 09:00;27.03.2026 09:01;5599955956/5500;8888997777/2010;Převod na vlastní Fio účet;-5000,00;CZK;Převod na Fio účet 8888997777/2010'
  ].join('\n')
}

function buildRealUploadedFioContentWithInternalTransferInflow(): string {
  return [
    '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
    '27.03.2026 09:02;5000,00;CZK;8888997777/2010;5599955956/5500;Převod z vlastního RB účtu;Převod z RB 5599955956/5500'
  ].join('\n')
}

function buildRealUploadedRbContentWithInternalTransferInflowOnly(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '27.03.2026 09:02;27.03.2026 09:04;5599955956/5500;8888997777/2010;Převod z vlastního Fio účtu;5000,00;CZK;Převod z Fio 8888997777/2010'
  ].join('\n')
}

function buildRealUploadedFioContentWithInternalTransferOutflowOnly(): string {
  return [
    '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
    '27.03.2026 09:00;-5000,00;CZK;8888997777/2010;5599955956/5500;Převod na vlastní RB účet;Převod na RB 5599955956/5500'
  ].join('\n')
}

function buildRealUploadedRbContentWithDelayedActualInternalTransferInflowOnly(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '13.03.2026 08:14;13.03.2026 08:15;5599955956/5500;8888997777/0008;JOKELAND s.r.o.;5000,00;CZK;71394921'
  ].join('\n')
}

function buildRealUploadedFioContentWithDelayedActualInternalTransferOutflowOnly(): string {
  return [
    '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
    '26.03.2026 09:00;-5000,00;CZK;8888997777/2010;266617681/0008;Moneta / 5599955956;76526712'
  ].join('\n')
}

function buildRealUploadedFioContentWithSparseDobraRefundIncoming(): string {
  return [
    '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
    '26.03.2026 08:12;3804,00;CZK;8888997777/2010;000000-2222333344/0800;Dobrá Energie s.r.o.;Vrácení přeplatku VS 5125144501'
  ].join('\n')
}

function buildRealUploadedRbContentWithGenericIncomingOnly(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '29.03.2026 12:00;29.03.2026 12:02;5599955956/5500;000000-4444555566/0100;Neznámý příjemce;2200,00;CZK;Příchozí platba bez vazby'
  ].join('\n')
}

function buildRbAggregatedComgatePortalSettlementContent(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '19.03.2026 11:50;19.03.2026 11:52;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1580,00;CZK;Souhrnná výplata Comgate portal 2026-03-19'
  ].join('\n')
}

function buildRbComgateDailySettlementContent(
  amountText = '6058,79',
  bookedAtDate = '27.03.2026',
  reference = 'Souhrnná výplata Comgate 2026-03-27 / 1816656820'
): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    `${bookedAtDate} 18:15;${bookedAtDate} 18:17;5599955956/5500;000000-1234567890/0100;Comgate a.s.;${amountText};CZK;${reference}`
  ].join('\n')
}

function buildSyntheticComgateDailySettlementContent(input: {
  transferReference: string
  componentRows: Array<{
    transactionId: string
    clientId: string
    confirmedAmountText: string
    transferredAmountText: string
  }>
  confirmedSettlementTotalText: string
  transferredSettlementTotalText: string
}): string {
  const rows = input.componentRows.map((row) => [
    '"499465"',
    `"${row.transactionId}"`,
    '"Karta online"',
    `"${row.confirmedAmountText}"`,
    `"${row.transferredAmountText}"`,
    '""',
    `"${input.transferReference}"`,
    `"${row.clientId}"`
  ].join(';'))

  return [
    '"Merchant";"ID ComGate";"Metoda";"Potvrzen� ��stka";"P�eveden� ��stka";"Produkt";"Variabiln� symbol p�evodu";"ID od klienta"',
    ...rows,
    `"suma";"";"";"${input.confirmedSettlementTotalText}";"${input.transferredSettlementTotalText}";"";"";""`
  ].join('\n')
}

function buildRealUploadedRbGenericContentWithDuplicateAmountColumnsForSharedAirbnbPayoutsWithBookingReferenceHintMatch(
  daysShift = 0
): string {
  return [
    buildRealUploadedRbGenericContentWithDuplicateAmountColumnsForSharedAirbnbPayouts(daysShift),
    '13.03.2026 09:10;13.03.2026 09:12;35530,12;35530,12;CZK;5599955956/5500;000000-9876543210/0300;BOOKING.COM B.V.;NO.AAOS6MOZUH8BFTER/2206371'
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

function buildCompactUploadedAirbnbContent(): string {
  const [header, ...rows] = buildActualUploadedAirbnbContent().split('\n')
  const sourceHeaders = header.split(';')
  const headerIndex = Object.fromEntries(sourceHeaders.map((sourceHeader, index) => [sourceHeader, index]))

  return [
    'Datum převodu;Částka převodu;Měna;Reference code;Confirmation code;Nabídka',
    ...rows
      .filter((row) => row.trim().length > 0)
      .map((row, index) => {
        const cells = row.split(';')
        return [
          cells[headerIndex['Bude připsán do dne']] || cells[headerIndex.Datum],
          cells[headerIndex.Vyplaceno] || cells[headerIndex.Částka],
          cells[headerIndex.Měna],
          cells[headerIndex['Referenční kód']] || `AIRBNB-COMPACT-REF-${String(index + 1).padStart(2, '0')}`,
          cells[headerIndex['Potvrzující kód']] || `AIRBNB-COMPACT-${String(index + 1).padStart(2, '0')}`,
          cells[headerIndex.Nabídka]
        ].join(';')
      })
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

function buildRealUploadedRbGenericContentWithDuplicateAmountColumnsForSharedAirbnbPayouts(daysShift = 0): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Objem";"Zaúčtovaná částka";"Měna účtu";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
    ...getRealUploadedAirbnbTransferRowsWithoutReferenceColumn()
      .filter((row) => row.bankMatched)
      .map((row, index) => {
        const bookedAt = formatRbDateTime(row.payoutDate, 20 + index, daysShift)
        const postedAt = formatRbDateTime(row.payoutDate, 23 + index, daysShift)

        return [
          bookedAt,
          postedAt,
          row.amountText.replace(/\s+/g, ''),
          `${90 + index}9999,99`,
          'CZK',
          '5599955956/5500',
          '000000-1234567890/0100',
          'Incoming bank transfer',
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
