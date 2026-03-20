import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
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
      'Bankovní účet expected-payouts'
    ])
    expect(result.extractedRecords.map((file: (typeof result.extractedRecords)[number]) => file.parserDebugLabel)).toEqual(['fio', 'fio', undefined])
    expect(result.reviewSummary.normalizedTransactionCount).toBeGreaterThan(0)
    expect(result.reviewSections.matched.length + result.reviewSections.unmatched.length + result.reviewSections.suspicious.length + result.reviewSections.missingDocuments.length).toBeGreaterThan(0)
    expect(result.reportSummary.normalizedTransactionCount).toBeGreaterThan(0)
    expect(result.exportFiles.map((file: (typeof result.exportFiles)[number]) => file.fileName)).toEqual([
      'reconciliation-transactions.csv',
      'review-items.csv',
      'monthly-review-export.xlsx'
    ])
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
      accountLabelCs: 'Bankovní účet expected-payouts'
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
      'booking-batch:2026-03-10:PAYOUT-BOOK-20260310',
      'booking-batch:2026-03-10:PAYOUT-BOOK-20260310'
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
    expect(result.html).toContain('První kontrolní obrazovka měsíčního zpracování')
    expect(result.html).toContain('Spárované položky')
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
    expect(result.review.summary).toEqual(result.batch.reconciliation.summary)
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