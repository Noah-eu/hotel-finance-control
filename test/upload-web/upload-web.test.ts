import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { runMonthlyReconciliationBatch } from '../../src/monthly-batch'
import {
  buildBrowserRuntimeStateFromSelectedFiles,
  createBrowserRuntime,
  buildBrowserRuntimeUploadState,
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
      documentType: 'ota_report'
    })
    expect(result.monthLabel).toBe('neuvedeno')
    expect(result.extractedRecords.some((file) => file.extractedCount > 0)).toBe(true)
    expect(result.reportSummary.matchedGroupCount).toBeGreaterThan(0)
    expect(result.reportTransactions.length).toBeGreaterThan(0)
    expect(result.reviewSections.matched.length).toBeGreaterThan(0)
    expect(result.supportedExpenseLinks.length).toBeGreaterThanOrEqual(0)
    expect(result.exportFiles.map((file) => file.fileName)).toEqual([
      'reconciliation-transactions.csv',
      'review-items.csv',
      'monthly-review-export.xlsx'
    ])
  })

  it('renders the upload page without baked-in runtime results and with selected-file-driven adapter logic', () => {
    const result = buildUploadWebFlow({
      generatedAt: '2026-03-19T10:15:00.000Z'
    })

    expect(result.html).toContain('Pracovní postup operátora')
    expect(result.html).toContain('skutečně vybrané soubory')
    expect(result.html).toContain('Po kliknutí na tlačítko se ke sdílenému běhu použijí právě tyto skutečně vybrané soubory.')
    expect(result.html).toContain('uploadedAt')
    expect(result.html).toContain('createBrowserRuntime()')
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
        dateDistanceDays: Number.NaN,
        reference: 'Platba rezervace WEB-2001',
        rejectionReasons: ['noExactAmount']
      }),
      expect.objectContaining({
        bankTransactionId: 'txn:bank:fio-row-1',
        bankAccountId: '8888997777/2010',
        amountMinor: 154000,
        currency: 'CZK',
        bookedAt: '2026-03-19T06:23:00',
        eligible: false,
        dateDistanceDays: Number.NaN,
        reference: 'Platba rezervace WEB-2001',
        rejectionReasons: ['noExactAmount', 'wrongBankRouting']
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
        extractedCount: 2,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(2)
    expect(result.reportTransactions).toHaveLength(2)
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
        extractedCount: 2,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(result.reportSummary.normalizedTransactionCount).toBe(2)
    expect(result.reportTransactions).toHaveLength(2)
    expect(result.reportTransactions.map((item) => item.amount)).toEqual(['1 060,00 Kč', '3 961,05 Kč'])
    expect(result.reportTransactions.map((item) => item.transactionId)).toEqual(['txn:payout:airbnb-payout-1', 'txn:payout:airbnb-payout-2'])
    expect(result.reportTransactions.map((item) => item.labelCs)).toEqual(['Airbnb rezervace', 'Airbnb payout'])
    expect(result.reportTransactions.map((item) => item.subtype)).toEqual(['reservation', 'transfer'])
  })

  it('recognizes grounded exact Airbnb payout-to-RB CITIBANK matches in browser runtime state', async () => {
    const result = await createBrowserRuntime().buildRuntimeState({
      files: [
        createRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '15.03.2026 06:20;15.03.2026 06:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;3961,05;CZK;G-OC3WJE3SIXRO5'
          ].join('\n')
        )
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T19:35:00.000Z'
    })

    expect(result.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 2,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2'],
        accountLabelCs: 'Airbnb payout report'
      }),
      expect.objectContaining({
        fileName: 'Pohyby_5599955956_202603191023.csv',
        extractedCount: 1,
        extractedRecordIds: ['fio-row-1'],
        accountLabelCs: 'RB účet 5599955956/5500',
        parserDebugLabel: 'fio'
      })
    ])
    expect(result.reportTransactions.map((item) => item.labelCs)).toEqual([
      'Airbnb rezervace',
      'Airbnb payout',
      'Bankovní transakce'
    ])
    expect(result.reviewSections.payoutBatchMatched).toHaveLength(1)
    expect(result.reviewSections.payoutBatchMatched[0]).toMatchObject({
      title: 'Airbnb payout dávka G-OC3WJE3SIXRO5'
    })
    expect(result.reviewSections.payoutBatchUnmatched).toHaveLength(0)
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

  it('surfaces raw and normalized Booking header diagnostics when browser upload fails on missing required columns', async () => {
    await expect(
      buildBrowserRuntimeStateFromSelectedFiles({
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
    ).rejects.toThrow(
      'Booking payout export is missing required columns: payoutReference, reservationId. Raw detected header row: Datum vyplaty;Castka;Mena;Poznamka. Detected normalized headers: payoutDate, amountMinor, currency, Poznamka'
    )
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

  it('completes the truthful Airbnb-only uploaded browser and monthly path with one reservation row and one payout row', () => {
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
        extractedCount: 2,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2']
      })
    ])

    expect(result.batch.extractedRecords).toHaveLength(2)
    expect(result.batch.extractedRecords.filter((record: (typeof result.batch.extractedRecords)[number]) => record.recordType === 'payout-line')).toHaveLength(2)
    expect(result.batch.extractedRecords.filter((record: (typeof result.batch.extractedRecords)[number]) => record.data.rowKind === 'reservation')).toHaveLength(1)
    expect(result.batch.extractedRecords.filter((record: (typeof result.batch.extractedRecords)[number]) => record.data.rowKind === 'transfer')).toHaveLength(1)
    expect(result.report.transactions).toHaveLength(2)

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
          extractedCount: 2,
          extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2'],
          accountLabelCs: 'Airbnb payout report'
        })
      ])
      expect(browserRuntime.reportSummary.normalizedTransactionCount).toBe(2)
      expect(browserRuntime.reportTransactions).toHaveLength(2)
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