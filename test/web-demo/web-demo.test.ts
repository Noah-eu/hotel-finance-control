import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { prepareUploadedMonthlyFiles, runMonthlyReconciliationBatch } from '../../src/monthly-batch'
import { buildFixtureWebDemo, buildWebDemo } from '../../src/web-demo'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { emitBrowserRuntimeBundle } from '../../src/upload-web/browser-bundle'
import { buildBrowserRuntimeStateFromSelectedFiles, createBrowserRuntime } from '../../src/upload-web/browser-runtime'

function collectRuntimePayoutDiagnosticDataFromState(state: Awaited<ReturnType<typeof buildBrowserRuntimeStateFromSelectedFiles>>) {
  const runtimeAudit = state.runtimeAudit.payoutDiagnostics

  return {
    extractedAirbnbPayoutRowRefs: runtimeAudit.extractedAirbnbPayoutRowRefs,
    extractedAirbnbRawReferences: runtimeAudit.extractedAirbnbRawReferences,
    extractedAirbnbDataReferences: runtimeAudit.extractedAirbnbDataReferences,
    extractedAirbnbReferenceCodes: runtimeAudit.extractedAirbnbReferenceCodes,
    extractedAirbnbPayoutReferences: runtimeAudit.extractedAirbnbPayoutReferences,
    workflowPayoutBatchKeys: runtimeAudit.workflowPayoutBatchKeys,
    workflowPayoutReferences: runtimeAudit.workflowPayoutReferences,
    reportMatchedPayoutReferences: runtimeAudit.reportMatchedPayoutReferences,
    reportUnmatchedPayoutReferences: runtimeAudit.reportUnmatchedPayoutReferences,
    runtimeMatchedTitleSourceValues: runtimeAudit.runtimeMatchedTitleSourceValues,
    runtimeUnmatchedTitleSourceValues: runtimeAudit.runtimeUnmatchedTitleSourceValues
  }
}

describe('buildWebDemo', () => {
  it('renders the uploaded monthly browser flow into browser-visible HTML', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('<!doctype html>')
    expect(result.html).toContain('Hotel Finance Control – měsíční workflow pro operátora')
    expect(result.html).toContain('Soubory k nahrání')
    expect(result.html).toContain('id="monthly-files"')
    expect(result.html).toContain('Označení měsíce')
    expect(result.html).toContain('id="month-label"')
    expect(result.html).toContain('Spustit přípravu a měsíční workflow')
    expect(result.html).toContain('let browserRuntime;')
    expect(result.html).toContain("button.addEventListener('click'")
    expect(result.html).toContain('Výsledek spuštěného browser workflow')
    expect(result.html).toContain('Sekvence měsíčního běhu')
    expect(result.html).toContain('Příprava, kontrola a report v jednom pohledu')
    expect(result.html).toContain('Exportní handoff')
    expect(result.html).toContain('Airbnb payout')
    expect(result.html).not.toContain('<iframe')
    expect(result.html).not.toContain('buildBrowserRuntimeUploadState(runtimeInput)')
    expect(result.browserRun.run.review.summary.exceptionCount).toBeGreaterThan(0)
    expect(result.browserRun.run.exports.files.map((file) => file.fileName)).toContain('monthly-review-export.xlsx')
    expect(result.html).toContain('Payout matched: <strong>žádný upload</strong>')
    expect(result.html).toContain('Payout unmatched: <strong>žádný upload</strong>')
  })

  it('writes the generated demo HTML to disk when outputPath is provided', async () => {
    const outputPath = resolve('dist/test-web-demo/index.html')
    rmSync(resolve('dist/test-web-demo'), {
      recursive: true,
      force: true
    })

    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z',
      outputPath
    })

    expect(result.outputPath).toBe(outputPath)
    expect(result.runtimeAssetPath).toMatch(/^\.\/browser-runtime\.[a-f0-9]{12}\.js$/)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('Praktické spuštění měsíčního workflow')
    expect(readFileSync(outputPath, 'utf8')).toContain('Soubory k nahrání')
    expect(readFileSync(outputPath, 'utf8')).toContain('Spustit přípravu a měsíční workflow')
    expect(readFileSync(outputPath, 'utf8')).toContain('__hotelFinanceCreateBrowserRuntime')
    expect(readFileSync(outputPath, 'utf8')).toContain(`import(${JSON.stringify(result.runtimeAssetPath)})`)
    expect(readFileSync(outputPath, 'utf8')).not.toContain('import("./browser-runtime.js")')
    expect(existsSync(resolve('dist/test-web-demo', result.runtimeAssetPath!.slice(2)))).toBe(true)
    const runtimeAsset = readFileSync(resolve('dist/test-web-demo', result.runtimeAssetPath!.slice(2)), 'utf8')
    expect(runtimeAsset).not.toContain('estimateExtractedCount(')
    expect(runtimeAsset).not.toContain('buildReviewSections(')
    expect(runtimeAsset).not.toContain('buildSupportedExpenseLinks(')
    expect(runtimeAsset).toContain('ingestUploadedMonthlyFiles')
    expect(runtimeAsset).toContain('buildReviewScreen')
    expect(runtimeAsset).toContain('buildExportArtifacts')
  })

  it('uses the explicit browser runtime creator instead of fixture dataset matching', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('__hotelFinanceCreateBrowserRuntime')
    expect(result.html).toContain('import("./browser-runtime.js")')
    expect(result.html).not.toContain('/src/upload-web/browser-runtime.ts')
    expect(result.html).not.toContain('inferSourceSystem(')
    expect(result.html).not.toContain('estimateExtractedCount(')
    expect(result.html).not.toContain('estimateMatchedGroupCount(')
    expect(result.html).not.toContain('estimateExceptionCount(')
  })

  it('reuses the shared upload-web runtime builder path instead of baking demo runtime summaries into the page', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('return runtime.buildRuntimeState({')
    expect(result.html).toContain('files: (input.files || []).map((file) => ({')
    expect(result.html).toContain('window.__hotelFinanceCreateBrowserRuntime = module.createBrowserRuntime;')
  })

  it('does not inject a serialized precomputed main runtime result object into the visible page', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).not.toContain('mainRuntimeState')
    expect(result.html).not.toContain('JSON.stringify(state)')
    expect(result.html).not.toContain('window.__hotelFinanceSharedUploadWebRuntime = {')
  })

  it('loads an executable shared upload-web runtime module instead of HTML-string heuristic simulation', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('import("./browser-runtime.js")')
    expect(result.html).toContain('module.createBrowserRuntime')
    expect(result.html).not.toContain('buildSupportedExpenseLinks(files, preparedFiles)')
    expect(result.html).not.toContain('buildReviewSections(preparedFiles, files, unsupportedFiles)')
  })

  it('backs demo output with shared runtime modules instead of hand-written synthetic asset strings', async () => {
    const outputPath = resolve('dist/test-web-demo-runtime/index.html')
    rmSync(resolve('dist/test-web-demo-runtime'), {
      recursive: true,
      force: true
    })

    await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z',
      outputPath
    })

    const html = readFileSync(outputPath, 'utf8')
    const runtimeAssetMatch = html.match(/import\("(\.\/browser-runtime\.[a-f0-9]{12}\.js)"\)/)

    expect(runtimeAssetMatch?.[1]).toBeTruthy()

    const runtimeAsset = readFileSync(resolve('dist/test-web-demo-runtime', runtimeAssetMatch![1].slice(2)), 'utf8')

    expect(runtimeAsset).toContain('buildBrowserRuntimeStateFromSelectedFiles')
    expect(runtimeAsset).toContain('createBrowserRuntime')
    expect(runtimeAsset).not.toContain('Export kontrolních položek')
  })

  it('does not keep the generated main page pinned to a permanently stable browser-runtime.js asset path', async () => {
    const outputPath = resolve('dist/test-web-demo-cache-busting/index.html')
    rmSync(resolve('dist/test-web-demo-cache-busting'), {
      recursive: true,
      force: true
    })

    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z',
      outputPath
    })

    expect(result.runtimeAssetPath).toMatch(/^\.\/browser-runtime\.[a-f0-9]{12}\.js$/)
    expect(result.runtimeAssetPath).not.toBe('./browser-runtime.js')
    expect(readFileSync(outputPath, 'utf8')).not.toContain('import("./browser-runtime.js")')
  })

  it('uses the exact emitted runtime asset path returned by the bundling step', async () => {
    const outputPath = resolve('dist/test-web-demo-bundler-reference/index.html')
    rmSync(resolve('dist/test-web-demo-bundler-reference'), {
      recursive: true,
      force: true
    })

    const { runtimeAssetPath } = await emitBrowserRuntimeBundle(outputPath)
    rmSync(resolve('dist/test-web-demo-bundler-reference'), {
      recursive: true,
      force: true
    })

    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z',
      outputPath
    })

    expect(result.runtimeAssetPath).toBe(runtimeAssetPath)
    expect(readFileSync(outputPath, 'utf8')).toContain(`import(${JSON.stringify(runtimeAssetPath)})`)
  })

  it('builds and inspects the real emitted browser runtime asset with the current localized Raiffeisenbank parser logic', async () => {
    const outputPath = resolve('dist/test-web-demo-runtime-inspection/index.html')
    rmSync(resolve('dist/test-web-demo-runtime-inspection'), {
      recursive: true,
      force: true
    })

    const result = await buildWebDemo({
      generatedAt: '2026-03-19T19:00:00.000Z',
      outputPath
    })

    const runtimeAssetPath = result.runtimeAssetPath
    expect(runtimeAssetPath).toBeTruthy()
    expect(readFileSync(outputPath, 'utf8')).toContain(`import(${JSON.stringify(runtimeAssetPath)})`)

    const assetOnDisk = resolve('dist/test-web-demo-runtime-inspection', runtimeAssetPath!.slice(2))
    const runtimeAsset = readFileSync(assetOnDisk, 'utf8')

    expect(runtimeAsset).toContain('raiffeisenbank')
    expect(runtimeAsset).toContain('parseRaiffeisenbankStatement')
    expect(runtimeAsset).toContain('missing required columns')
    expect(runtimeAsset).toContain('datum", "objem", "m\\u011Bna", "proti\\xFA\\u010Det", "typ"')
    expect(runtimeAsset).toContain('datum", "objem", "mena", "protiucet", "typ"')
    expect(runtimeAsset).toContain('bookedAt: ["bookedAt", "booked_at", "bookingDate", "date", "datum"]')
    expect(runtimeAsset).toContain('amountMinor: ["amountMinor", "amount_minor", "amount", "castka", "\\u010D\\xE1stka", "objem"]')
    expect(runtimeAsset).toContain('currency: ["currency", "mena", "m\\u011Bna"]')
    expect(runtimeAsset).toContain('protiucet')
    expect(runtimeAsset).toContain('objem')
    expect(runtimeAsset).toContain('mena')
    expect(runtimeAsset).toContain('datum')
    expect(runtimeAsset).toContain('zpravaProPrijemce')
    expect(runtimeAsset).toContain('pozn\\xE1mka')
    expect(runtimeAsset).toContain('bookedat,amountminor,currency,accountid,counterparty,reference,transactiontype')
  })

  it('keeps only the currently emitted hashed browser runtime asset in static demo output', async () => {
    const outputPath = resolve('dist/test-web-demo-clean-assets/index.html')
    const outputDir = resolve('dist/test-web-demo-clean-assets')
    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const first = await buildWebDemo({
      generatedAt: '2026-03-19T19:00:00.000Z',
      outputPath
    })

    const second = await buildWebDemo({
      generatedAt: '2026-03-19T19:00:00.000Z',
      outputPath
    })

    const dirEntries = readdirSync(outputDir).filter((entry) => /^browser-runtime\.[a-f0-9]{12}\.js$/.test(entry))

    expect(readFileSync(outputPath, 'utf8')).toContain(`import(${JSON.stringify(second.runtimeAssetPath)})`)
    expect(first.runtimeAssetPath).toBe(second.runtimeAssetPath)
    expect(dirEntries).toEqual([second.runtimeAssetPath!.slice(2)])
  })

  it('changes the emitted runtime asset path deterministically when the bundle content changes', async () => {
    const outputPath = resolve('dist/test-web-demo-bundle-hash/index.html')
    rmSync(resolve('dist/test-web-demo-bundle-hash'), {
      recursive: true,
      force: true
    })

    const first = await emitBrowserRuntimeBundle(outputPath)
    const second = await emitBrowserRuntimeBundle(outputPath, {
      banner: '/* cache-bust-test: changed-content */'
    })

    expect(first.runtimeAssetPath).toMatch(/^\.\/browser-runtime\.[a-f0-9]{12}\.js$/)
    expect(second.runtimeAssetPath).toMatch(/^\.\/browser-runtime\.[a-f0-9]{12}\.js$/)
    expect(second.runtimeAssetPath).not.toBe(first.runtimeAssetPath)
  })

  it('keeps the start action on the main page tied to the shared runtime module path', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('if (!browserRuntime && typeof window.__hotelFinanceCreateBrowserRuntime === \'function\')')
    expect(result.html).toContain('const state = await browserRuntime.buildRuntimeState({')
    expect(result.html).toContain('Sdílený browser runtime se ještě načítá. Zkuste akci za okamžik znovu.')
  })

  it('replaces the visible snapshot sections with runtime-rendered prepared, review, report, and export content after start', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('id="prepared-files-section"')
    expect(result.html).toContain('id="review-summary-section"')
    expect(result.html).toContain('id="report-preview-body"')
    expect(result.html).toContain('id="export-handoff-section"')
    expect(result.html).toContain('renderRunningState(files)')
    expect(result.html).toContain('const visibleState = buildCompletedVisibleRuntimeState(state);')
    expect(result.html).toContain("applyVisibleRuntimeState(visibleState, 'completed');")
    expect(result.html).toContain('Výsledek spuštěného browser workflow')
    expect(result.html).not.toContain('původní snapshot zůstává finální odpovědí')
  })

  it('binds the top runtime summary strip to the current run state instead of leaving stale snapshot/demo numbers visible', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-21T15:30:00.000Z'
    })

    expect(result.html).toContain('id="runtime-summary-uploaded-files"')
    expect(result.html).toContain('id="runtime-summary-normalized-transactions"')
    expect(result.html).toContain('id="runtime-summary-review-items"')
    expect(result.html).toContain('id="runtime-summary-export-files"')
    expect(result.html).toContain("runtimeSummaryUploadedFiles.textContent = String(state.routingSummary?.uploadedFileCount ?? (state.fileRoutes || []).length ?? (state.preparedFiles || []).length);")
    expect(result.html).toContain("runtimeSummaryNormalizedTransactions.textContent = String(state.reviewSummary?.normalizedTransactionCount ?? state.reportSummary?.normalizedTransactionCount ?? 0);")
    expect(result.html).toContain("runtimeSummaryReviewItems.textContent = String(state.reviewSummary?.exceptionCount ?? 0);")
    expect(result.html).toContain("runtimeSummaryExportFiles.textContent = String((state.exportFiles || []).length);")
    expect(result.html).toContain("runtimeSummaryUploadedFiles.textContent = String(files.length);")
  })

  it('surfaces runtime failures visibly instead of leaving the original demo snapshot as if nothing happened', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('renderFailedState(error)')
    expect(result.html).toContain('Runtime běh selhal.')
    expect(result.html).toContain('Exportní handoff není k dispozici, protože runtime běh selhal.')
    expect(result.html).toContain('Viditelně zobrazujeme chybu místo tichého ponechání ukázkového snapshotu.')
  })

  it('runs the two current real bank files through the shared browser runtime without parser failure', async () => {
    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
          text: async () => [
            '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
            '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
          ].join('\n')
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          text: async () => [
            '"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
            '19.03.2026 06:23;1540,00;CZK;1234567890;2010;PAYOUT-BOOK-20260310;Booking BV;Příchozí platba'
          ].join('\n')
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-19T20:20:00.000Z'
    })

    expect(state.extractedRecords.map((file) => file.extractedCount)).toEqual([1, 1])
    expect(state.extractedRecords.map((file) => file.extractedRecordIds)).toEqual([['fio-row-1'], ['raif-row-1']])
    expect(state.preparedFiles.map((file) => file.sourceSystem)).toEqual(['bank', 'bank'])
  })

  it('shows truthful bank/account attribution separately from technical parser labels for the two current bank files', async () => {
    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          text: async () => [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        },
        {
          name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
          text: async () => [
            '"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
            '19.03.2026 06:23;1540,00;CZK;1234567890;2010;PAYOUT-BOOK-20260310;Booking BV;Příchozí platba'
          ].join('\n')
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-20T08:30:00.000Z'
    })

    expect(state.extractedRecords.map((file) => file.accountLabelCs)).toEqual([
      'RB účet 5599955956/5500',
      'Fio účet 8888997777'
    ])
    expect(state.extractedRecords.map((file) => file.parserDebugLabel)).toEqual(['fio', 'raiffeisenbank'])
  })

  it('keeps Airbnb reservation vs payout preview labeling truthful in the main browser runtime projection', async () => {
    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'airbnb.csv',
          text: async () => getRealInputFixture('airbnb-payout-export').rawInput.content
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-21T19:40:00.000Z'
    })

    expect(state.extractedRecords).toEqual([
      expect.objectContaining({
        fileName: 'airbnb.csv',
        extractedCount: 4,
        extractedRecordIds: ['airbnb-payout-1', 'airbnb-payout-2', 'airbnb-payout-3', 'airbnb-payout-4'],
        accountLabelCs: 'Airbnb payout report'
      })
    ])
    expect(state.reportTransactions.map((transaction) => transaction.labelCs)).toEqual([
      'Airbnb rezervace',
      'Airbnb payout',
      'Airbnb payout',
      'Airbnb payout'
    ])
    expect(state.reportTransactions.map((transaction) => transaction.subtype)).toEqual([
      'reservation',
      'transfer',
      'transfer',
      'transfer'
    ])
  })

  it('recognizes grounded exact Airbnb payout-to-RB CITIBANK matches from the real uploaded shapes', () => {
    const airbnb = getRealInputFixture('airbnb-payout-export')

    const batch = runMonthlyReconciliationBatch({
      files: prepareUploadedMonthlyFiles([
        {
          name: 'airbnb.csv',
          content: airbnb.rawInput.content,
          uploadedAt: '2026-03-21T19:45:00.000Z'
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          content: [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '15.03.2026 06:20;15.03.2026 06:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;3961,05;CZK;G-OC3WJE3SIXRO5',
            '15.03.2026 07:20;15.03.2026 07:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;4456,97;CZK;G-DXVK4YVI7MJVL',
            '15.03.2026 08:20;15.03.2026 08:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;7059,94;CZK;G-ZD5RVTGOHW3GE'
          ].join('\n'),
          uploadedAt: '2026-03-21T19:45:00.000Z'
        }
      ]),
      reconciliationContext: {
        runId: 'airbnb-rb-truthful-audit',
        requestedAt: '2026-03-21T19:45:00.000Z'
      },
      reportGeneratedAt: '2026-03-21T19:45:00.000Z'
    })

    expect(batch.reconciliation.workflowPlan?.payoutRows.filter((row) => row.platform === 'airbnb')).toEqual([
      expect.objectContaining({
        rowId: 'txn:payout:airbnb-payout-2',
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-OC3WJE3SIXRO5',
        payoutReference: 'G-OC3WJE3SIXRO5',
        amountMinor: 396105,
        currency: 'CZK'
      }),
      expect.objectContaining({
        rowId: 'txn:payout:airbnb-payout-3',
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-DXVK4YVI7MJVL',
        payoutReference: 'G-DXVK4YVI7MJVL',
        amountMinor: 445697,
        currency: 'CZK'
      }),
      expect.objectContaining({
        rowId: 'txn:payout:airbnb-payout-4',
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-ZD5RVTGOHW3GE',
        payoutReference: 'G-ZD5RVTGOHW3GE',
        amountMinor: 705994,
        currency: 'CZK'
      })
    ])
    expect(batch.reconciliation.workflowPlan?.payoutBatches.filter((row) => row.platform === 'airbnb')).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-OC3WJE3SIXRO5',
        payoutReference: 'G-OC3WJE3SIXRO5',
        expectedTotalMinor: 396105,
        currency: 'CZK'
      }),
      expect.objectContaining({
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-DXVK4YVI7MJVL',
        payoutReference: 'G-DXVK4YVI7MJVL',
        expectedTotalMinor: 445697,
        currency: 'CZK'
      }),
      expect.objectContaining({
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-ZD5RVTGOHW3GE',
        payoutReference: 'G-ZD5RVTGOHW3GE',
        expectedTotalMinor: 705994,
        currency: 'CZK'
      })
    ])
    expect((batch.reconciliation.payoutBatchMatches ?? []).filter((match) => match.payoutBatchKey.includes('airbnb-batch:'))).toEqual([
      expect.objectContaining({
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-OC3WJE3SIXRO5',
        bankTransactionId: 'txn:bank:fio-row-1',
        matched: true
      }),
      expect.objectContaining({
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-DXVK4YVI7MJVL',
        bankTransactionId: 'txn:bank:fio-row-2',
        matched: true
      }),
      expect.objectContaining({
        payoutBatchKey: 'airbnb-batch:2026-03-15:G-ZD5RVTGOHW3GE',
        bankTransactionId: 'txn:bank:fio-row-3',
        matched: true
      })
    ])
    expect(batch.report.payoutBatchMatches.filter((item) => item.platform === 'Airbnb')).toEqual([
      expect.objectContaining({
        payoutReference: 'G-OC3WJE3SIXRO5',
        bankAccountId: '5599955956/5500',
        amountMinor: 396105
      }),
      expect.objectContaining({
        payoutReference: 'G-DXVK4YVI7MJVL',
        bankAccountId: '5599955956/5500',
        amountMinor: 445697
      }),
      expect.objectContaining({
        payoutReference: 'G-ZD5RVTGOHW3GE',
        bankAccountId: '5599955956/5500',
        amountMinor: 705994
      })
    ])
    expect(batch.report.unmatchedPayoutBatches.filter((item) => item.platform === 'Airbnb')).toEqual([])
  })

  it('renders user-facing bank/account labels instead of making parser-row prefixes look like bank identity', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.browserRun.run.importedFiles.map((file) => file.sourceDocument.sourceSystem)).toContain('airbnb')
    expect(result.html).toContain('Airbnb payout')
    expect(result.html).not.toContain('Bankovní účet expected-payouts')
    expect(result.html).not.toContain('Technické ladicí údaje (debug)')
    expect(result.html).not.toContain('Technický tvar exportu (debug):')
    expect(result.html).not.toContain('Technická ID extrahovaných záznamů (debug):')
    expect(result.html).not.toContain('<details class="debug-details">')
  })

  it('shows a human-readable transaction preview for the current bank-only runtime state in default mode', async () => {
    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          text: async () => [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        },
        {
          name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
          text: async () => [
            '"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
            '19.03.2026 06:23;1540,00;CZK;1234567890;2010;PAYOUT-BOOK-20260310;Booking BV;Příchozí platba'
          ].join('\n')
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-20T09:10:00.000Z'
    })

    expect(state.extractedRecords.length).toBeGreaterThan(0)

    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('Airbnb payout')
    expect(state.reportTransactions.some((transaction) => transaction.source === 'bank')).toBe(true)
    expect(result.html).toContain("'<td><strong>' + escapeHtml(transaction.labelCs || 'Transakce') + '</strong></td>'")
    expect(result.html).not.toContain('Technické ladicí údaje (debug)')
    expect(result.html).not.toContain('Technická ID extrahovaných záznamů (debug):')
  })

  it('expects shared runtime state to provide report preview rows for the visible report table', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('if (state.reportTransactions.length === 0)')
    expect(result.html).toContain('function buildVisibleTransactionLabel(transactionId, source) {')
    expect(result.html).toContain('function buildCompletedVisibleRuntimeState(state) {')
    expect(result.html).toContain("reportTransactions: (state.reportTransactions || []).map((transaction) => ({")
    expect(result.html).toContain("labelCs: buildVisibleTransactionLabel(transaction.transactionId, transaction.source)")
  })

  it('keeps the completed operator-facing runtime projection on the full shared state so file routing and upload counts cannot disappear after completion', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-24T16:20:00.000Z'
    })

    expect(result.html).toContain('function buildCompletedVisibleRuntimeState(state) {')
    expect(result.html).toContain("const fileRoutes = Array.isArray(state.fileRoutes) ? state.fileRoutes : [];")
    expect(result.html).toContain("const hasRoutedFiles = fileRoutes.length > 0;")
    expect(result.html).toContain("uploadedFileCount: hasRoutedFiles ? fileRoutes.length : Number(state.routingSummary?.uploadedFileCount ?? 0),")
    expect(result.html).toContain("supportedFileCount: hasRoutedFiles ? fileRoutes.filter((file) => file.status === 'supported').length : Number(state.routingSummary?.supportedFileCount ?? 0),")
    expect(result.html).toContain("const visibleState = buildCompletedVisibleRuntimeState(state);")
    expect(result.html).toContain("applyVisibleRuntimeState(visibleState, 'completed');")
    expect(result.html).not.toContain("applyVisibleRuntimeState({\n            generatedAt: state.generatedAt,")
  })

  it('builds non-empty report preview rows in the shared runtime state consumed by the web demo', async () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const invoice = getRealInputFixture('invoice-document')

    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: booking.sourceDocument.fileName,
          text: async () => booking.rawInput.content
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          text: async () => raiffeisen.rawInput.content
        },
        {
          name: invoice.sourceDocument.fileName,
          text: async () => invoice.rawInput.content
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(state.reportTransactions.length).toBeGreaterThan(0)
    expect(state.reportTransactions[0]).toEqual(
      expect.objectContaining({
        transactionId: expect.any(String),
        labelCs: expect.any(String),
        source: expect.any(String),
        amount: expect.any(String),
        status: expect.any(String)
      })
    )
  })

  it('keeps truthful account attribution in the extracted runtime state for the two current bank files', async () => {
    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          text: async () => [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        },
        {
          name: 'Pohyby_na_uctu-8888997777_20260301-20260319.csv',
          text: async () => [
            '"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
            '19.03.2026 06:23;1540,00;CZK;1234567890;2010;PAYOUT-BOOK-20260310;Booking BV;Příchozí platba'
          ].join('\n')
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-20T08:30:00.000Z'
    })

    expect(state.extractedRecords.map((file) => file.accountLabelCs)).toEqual([
      'RB účet 5599955956/5500',
      'Fio účet 8888997777'
    ])
  })

  it('shows Booking extracted records as a non-bank payout source instead of a bank account label', async () => {
    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'AaOS6MOZUh8BFtEr.booking.csv',
          text: async () => [
            'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
            'Reservation;RES-BOOK-8841;2026-03-08;2026-03-10;Jan Novak;OK;CZK;Paid;1250,00;12 Mar 2026;PAYOUT-BOOK-20260310'
          ].join('\n')
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-20T18:10:00.000Z'
    })

    expect(state.extractedRecords[0]?.accountLabelCs).toBe('Booking payout report')
  })

  it('renders parser/export debug metadata only when debug mode is explicitly enabled', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z',
      debugMode: true
    })

    expect(result.html).toContain('Technické ladicí údaje (debug)')
    expect(result.html).toContain('Technický tvar exportu (debug):')
    expect(result.html).toContain('Technická ID extrahovaných záznamů (debug):')
    expect(result.html).toContain('<details class="debug-details">')
    expect(result.html).toContain('id="runtime-payout-diagnostics-section"')
    expect(result.html).toContain('id="runtime-payout-diagnostics-content"')
    expect(result.html).toContain('function buildRuntimePayoutDiagnosticsMarkup(state)')
    expect(result.html).toContain('runtimePayoutDiagnosticsContent.innerHTML = buildRuntimePayoutDiagnosticsMarkup(state);')
    expect(result.html).toContain('Runtime matched refs count:')
    expect(result.html).toContain('Extracted Airbnb payout row ids')
    expect(result.html).toContain('Po spuštění zde uvidíte přesné payout reference a titulky z aktuálního runtime běhu.')
    expect(result.html).not.toContain('airbnb-payout-1')
  })

  it('keeps the real two-file Airbnb to RB browser demo coherent and business-facing in default mode', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-20T11:40:00.000Z'
    })

    expect(result.browserRun.run.importedFiles).toHaveLength(2)
    expect(result.browserRun.run.importedFiles.map((file) => file.sourceDocument.sourceSystem)).toEqual([
      'airbnb',
      'bank'
    ])
    expect(result.browserRun.run.batch.files).toHaveLength(2)
    expect(result.browserRun.run.batch.files.map((file) => file.extractedCount)).toEqual([17, 16])
    expect(result.browserRun.run.importedFiles.map((file) => file.sourceDocument.documentType)).toEqual([
      'ota_report',
      'bank_statement'
    ])
    expect(result.html).toContain('Airbnb payout')
    expect(result.html).toContain('Spárované Airbnb / OTA payout dávky')
    expect(result.html).toContain('Nespárované payout dávky')
    expect(result.html).toContain('Položky ke kontrole')
    expect(result.html).toContain('Zatím nebyl spuštěn žádný uploadovaný runtime běh.')
    expect(result.html).not.toContain('Technické ladicí údaje (debug)')
    expect(result.html).not.toContain('Technický tvar exportu (debug):')
    expect(result.html).not.toContain('Technická ID extrahovaných záznamů (debug):')
    expect(result.html).not.toContain('<details class="debug-details">')
    expect(result.html).not.toContain('airbnb-payout-1,')
    expect(result.html).not.toContain('fio-row-1,')
  })

  it('shows unmatched reservation settlement counts in the main browser review summary wiring', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-20T11:40:00.000Z'
    })

    expect(result.html).toContain('Nespárované rezervace k úhradě')
    expect(result.html).toContain("['Nespárované rezervace k úhradě', state.reviewSections.unmatchedReservationSettlements.length]")
    expect(result.html).toContain('reviewSections: state.reviewSections')
  })

  it('includes payout-batch matches and unmatched payout batches in the visible operator review summary counts', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T10:30:00.000Z'
    })

    expect(result.html).toContain('const payoutBatchMatchedCount = ((state.reviewSections && state.reviewSections.payoutBatchMatched) || []).length;')
    expect(result.html).toContain('const payoutBatchUnmatchedCount = ((state.reviewSections && state.reviewSections.payoutBatchUnmatched) || []).length;')
    expect(result.html).toContain("['Spárované Airbnb / OTA payout dávky', payoutBatchMatchedCount]")
    expect(result.html).toContain("['Nespárované payout dávky', payoutBatchUnmatchedCount]")
    expect(result.browserRun.run.review.payoutBatchMatched).toHaveLength(15)
    expect(result.browserRun.run.review.payoutBatchUnmatched).toHaveLength(2)
    expect(result.html).toContain('Payout matched: <strong>žádný upload</strong>')
    expect(result.html).toContain('Payout unmatched: <strong>žádný upload</strong>')
  })

  it('renders dedicated payout-batch detail panels in the operator UI and wires them to shared runtime sections', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T10:35:00.000Z'
    })

    expect(result.html).toContain('id="matched-payout-batches-section"')
    expect(result.html).toContain('id="matched-payout-batches-content"')
    expect(result.html).toContain('Spárované Airbnb / OTA payout dávky')
    expect(result.html).toContain('id="unmatched-payout-batches-section"')
    expect(result.html).toContain('id="unmatched-payout-batches-content"')
    expect(result.html).toContain('Nespárované payout dávky')
    expect(result.html).toContain("matchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup((state.reviewSections && state.reviewSections.payoutBatchMatched) || []);")
    expect(result.html).toContain("unmatchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup((state.reviewSections && state.reviewSections.payoutBatchUnmatched) || []);")
  })

  it('seeds the operator-facing snapshot from the real two-file Airbnb to RB uploaded path and keeps exact payout references visible', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:00:00.000Z'
    })

    expect(result.browserRun.run.importedFiles.map((file) => file.sourceDocument.fileName)).toEqual([
      'airbnb.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(result.browserRun.run.review.payoutBatchMatched.map((item) => item.title)).toEqual([
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
    expect(result.browserRun.run.review.payoutBatchUnmatched.map((item) => item.title)).toEqual([
      'Airbnb payout dávka G-IZLCELA7C5EFN',
      'Airbnb payout dávka G-6G5WFOJO5DJCI'
    ])
    expect(result.html).toContain('Zatím nebyl spuštěn žádný uploadovaný runtime běh pro spárované payout dávky.')
    expect(result.html).toContain('Zatím nebyl spuštěn žádný uploadovaný runtime běh pro nespárované payout dávky.')
    expect(result.html).not.toContain('AIRBNB-TRANSFER:jokeland.s.r.o.:IBAN-5956-(CZK)</strong>')
  })

  it('formats payout-batch detail amounts for operators and keeps synthetic transfer descriptor only as secondary context', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:05:00.000Z'
    })

    expect(result.browserRun.run.review.payoutBatchMatched[5]?.detail).toContain('Částka: 1 152,81 Kč.')
    expect(result.browserRun.run.review.payoutBatchMatched[6]?.detail).toContain('Částka: 970,36 Kč.')
    expect(result.browserRun.run.review.payoutBatchMatched[10]?.detail).toContain('Částka: 2 248,17 Kč.')
    expect(result.browserRun.run.review.payoutBatchMatched[11]?.detail).toContain('Částka: 2 492,32 Kč.')
    expect(result.browserRun.run.review.payoutBatchMatched[12]?.detail).toContain('Částka: 18 912,42 Kč.')
    expect(result.browserRun.run.review.payoutBatchMatched[0]?.detail).not.toContain('Částka: 396105 CZK.')
    expect(result.browserRun.run.review.payoutBatchMatched.some((item) => item.detail.includes('Zdrojový transfer: AIRBNB-TRANSFER:'))).toBe(false)
    expect(result.browserRun.run.review.payoutBatchUnmatched[0]?.detail).toContain('Očekávaná částka: 8 241,96 Kč.')
    expect(result.html).toContain('Zatím nebyl spuštěn žádný uploadovaný runtime běh pro spárované payout dávky.')
  })

  it('matches the operator-visible payout-batch reference lists to the actual real two-file browser path with no missing internal refs', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:10:00.000Z'
    })

    const visibleMatchedReferences = result.browserRun.run.review.payoutBatchMatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))
    const visibleUnmatchedReferences = result.browserRun.run.review.payoutBatchUnmatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))
    const internalMatchedReferences = result.browserRun.run.report.payoutBatchMatches
      .filter((match) => match.platform === 'Airbnb')
      .map((match) => match.payoutReference)
    const internalUnmatchedReferences = result.browserRun.run.report.unmatchedPayoutBatches
      .filter((item) => item.platform === 'Airbnb')
      .map((item) => item.payoutReference)
    const internallyMatchedButNotVisible = internalMatchedReferences.filter((reference) => !visibleMatchedReferences.includes(reference))
    const internallyUnmatchedButNotVisible = internalUnmatchedReferences.filter((reference) => !visibleUnmatchedReferences.includes(reference))

    expect(visibleMatchedReferences).toEqual(internalMatchedReferences)
    expect(visibleUnmatchedReferences).toEqual(internalUnmatchedReferences)
    expect(internallyMatchedButNotVisible).toEqual([])
    expect(internallyUnmatchedButNotVisible).toEqual([])
  })

  it('accounts for all 17 extracted Airbnb payout refs across the visible matched and unmatched payout-batch panels', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:11:00.000Z'
    })

    const extractedAirbnbReferences = result.browserRun.run.batch.extractedRecords
      .filter((record) => record.sourceDocumentId.includes('airbnb'))
      .map((record) => String(record.data.payoutReference ?? ''))

    const visibleMatchedReferences = result.browserRun.run.review.payoutBatchMatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))
    const visibleUnmatchedReferences = result.browserRun.run.review.payoutBatchUnmatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))

    const visibleReferences = [...visibleMatchedReferences, ...visibleUnmatchedReferences]
    const missingFromVisiblePanels = extractedAirbnbReferences.filter((reference) => !visibleReferences.includes(reference))

    expect(extractedAirbnbReferences).toHaveLength(17)
    expect(visibleMatchedReferences).toHaveLength(15)
    expect(visibleUnmatchedReferences).toHaveLength(2)
    expect(visibleReferences).toEqual(extractedAirbnbReferences)
    expect(missingFromVisiblePanels).toEqual([])
  })

  it('keeps synthetic Airbnb transfer descriptors only in detail text and never as the primary visible payout-batch title', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:11:30.000Z'
    })

    const visibleTitles = [
      ...result.browserRun.run.review.payoutBatchMatched.map((item) => item.title),
      ...result.browserRun.run.review.payoutBatchUnmatched.map((item) => item.title)
    ]

    expect(visibleTitles.every((title) => title.startsWith('Airbnb payout dávka G-'))).toBe(true)
    expect(result.html).not.toContain('AIRBNB-TRANSFER:jokeland.s.r.o.:IBAN-5956-(CZK)</strong>')
  })

  it('keeps the visible summary counts aligned with the same payout-batch lists shown to the operator', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:12:00.000Z'
    })

    const visibleMatchedReferences = result.browserRun.run.review.payoutBatchMatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))
    const visibleUnmatchedReferences = result.browserRun.run.review.payoutBatchUnmatched
      .map((item) => item.title.replace('Airbnb payout dávka ', ''))

    expect(visibleMatchedReferences).toHaveLength(15)
    expect(visibleUnmatchedReferences).toHaveLength(2)
    expect(result.browserRun.run.review.payoutBatchMatched).toHaveLength(15)
    expect(result.browserRun.run.review.payoutBatchUnmatched).toHaveLength(2)
    expect(result.html).toContain('Payout matched: <strong>žádný upload</strong>')
    expect(result.html).toContain('Payout unmatched: <strong>žádný upload</strong>')
  })

  it('shows a visible build fingerprint for the exact operator renderer and payout-count source', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:12:30.000Z'
    })

    expect(result.html).toContain('id="build-fingerprint"')
    expect(result.runtimeAssetPath).toBeUndefined()
    expect(result.html).toContain('Build: <strong>browser-runtime</strong>')
    expect(result.html).toContain('Renderer: <strong>web-demo-operator-v3</strong>')
    expect(result.html).toContain('Payout matched: <strong>žádný upload</strong>')
    expect(result.html).toContain('Payout unmatched: <strong>žádný upload</strong>')
    expect(result.html).toContain("const buildFingerprint = document.getElementById('build-fingerprint');")
    expect(result.html).toContain('buildFingerprint.innerHTML = buildFingerprintMarkup(state);')
    expect(result.html).toContain('const buildFingerprintVersion = "browser-runtime";')
  })

  it('keeps the fresh web demo page in a neutral empty state before any upload is run', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-23T12:05:00.000Z'
    })

    expect(result.html).toContain('Payout matched: <strong>žádný upload</strong>')
    expect(result.html).toContain('Payout unmatched: <strong>žádný upload</strong>')
    expect(result.html).toContain('Zatím není k dispozici žádný uploadovaný runtime výsledek.')
    expect(result.html).toContain('Zatím nebyl spuštěn žádný uploadovaný runtime běh.')
    expect(result.html).not.toContain('id="runtime-payout-diagnostics-section"')
    expect(result.html).not.toContain('Diagnostika runtime payout dávek')
    expect(result.html).not.toContain('Po spuštění zde uvidíte přesné payout reference a titulky z aktuálního runtime běhu.')
    expect(result.html).not.toContain('Airbnb payout dávka G-OC3WJE3SIXRO5')
    expect(result.html).not.toContain('<strong>15</strong><br />Spárované Airbnb / OTA payout dávky')
    expect(result.html).not.toContain('<strong>2</strong><br />Nespárované payout dávky')
  })

  it('shows the emitted hashed runtime asset fingerprint in the published demo output path', async () => {
    const outputPath = resolve('dist/test-web-demo-fingerprint/index.html')
    rmSync(resolve('dist/test-web-demo-fingerprint'), {
      recursive: true,
      force: true
    })

    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:12:45.000Z',
      outputPath
    })

    expect(result.runtimeAssetPath).toMatch(/^\.\/browser-runtime\.[a-f0-9]{12}\.js$/)
    expect(readFileSync(outputPath, 'utf8')).toContain(`Build: <strong>${result.runtimeAssetPath!.slice(2, -3)}</strong>`)
    expect(readFileSync(outputPath, 'utf8')).toContain('Renderer: <strong>web-demo-operator-v3</strong>')
  })

  it('keeps the runtime payout diagnostics block out of the default operator-facing web demo', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:13:00.000Z'
    })

    expect(result.html).not.toContain('id="runtime-payout-diagnostics-section"')
    expect(result.html).not.toContain('id="runtime-payout-diagnostics-content"')
    expect(result.html).not.toContain('function buildRuntimePayoutDiagnosticsMarkup(state)')
    expect(result.html).not.toContain('runtimePayoutDiagnosticsContent.innerHTML = buildRuntimePayoutDiagnosticsMarkup(state);')
    expect(result.html).not.toContain('Runtime matched refs count:')
    expect(result.html).not.toContain('Runtime unmatched refs count:')
    expect(result.html).not.toContain('Extracted Airbnb payout row ids')
    expect(result.html).not.toContain('Extracted Airbnb rawReference values')
    expect(result.html).not.toContain('Extracted Airbnb data.reference values')
    expect(result.html).not.toContain('Extracted Airbnb data.referenceCode values')
    expect(result.html).not.toContain('Extracted Airbnb data.payoutReference values')
    expect(result.html).not.toContain('Workflow payout batch keys')
    expect(result.html).not.toContain('Workflow payout references')
    expect(result.html).not.toContain('Report payoutBatchMatches payoutReference values')
    expect(result.html).not.toContain('Report unmatchedPayoutBatches payoutReference values')
    expect(result.html).not.toContain('Runtime matched panel title source values')
    expect(result.html).not.toContain('Runtime unmatched panel title source values')
    expect(result.html).not.toContain('Runtime matched titles')
    expect(result.html).not.toContain('Runtime unmatched titles')
  })

  it('renders the operator-facing monthly ingestion trace from explicit file routing metadata', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-24T10:15:00.000Z'
    })

    expect(result.html).toContain('const fileRoutes = Array.isArray(state.fileRoutes) ? state.fileRoutes : [];')
    expect(result.html).toContain('Rozpoznáno souborů:')
    expect(result.html).toContain('Nepodporované nebo nerozpoznané soubory')
    expect(result.html).toContain('Booking payout statement PDF')
    expect(result.html).toContain('Podporovaný doplňkový payout dokument')
    expect(result.html).toContain('Selhání ingestu')
    expect(result.html).toContain('buildClassificationBasisLabel')
    expect(result.html).toContain('state.routingSummary?.uploadedFileCount')
    expect(result.html).not.toContain('Runtime matched refs count:')
  })

  it('renders the final operator-facing web page with Booking payout PDF under recognized supported supplements instead of unsupported files', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T17:45:00.000Z',
      month: '2026-03',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', booking.rawInput.content),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromTextLines('Bookinng35k.pdf', buildGlyphSeparatedBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Podporovaný doplňkový payout dokument')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Booking payout statement PDF')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('Soubor se nepodařilo jednoznačně přiřadit k podporovanému měsíčnímu zdroji.')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Nepodporované nebo nerozpoznané soubory</h4><ul><li><strong>Bookinng35k.pdf</strong>')
    expect(rendered.runtimeSummaryUploadedFiles.textContent).toBe('4')
  })

  it('shows the runtime payout diagnostics block only when debug mode is explicitly enabled', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:13:15.000Z',
      debugMode: true
    })

    expect(result.html).toContain('id="runtime-payout-diagnostics-section"')
    expect(result.html).toContain('id="runtime-payout-diagnostics-content"')
    expect(result.html).toContain('function buildRuntimePayoutDiagnosticsMarkup(state)')
    expect(result.html).toContain('runtimePayoutDiagnosticsContent.innerHTML = buildRuntimePayoutDiagnosticsMarkup(state);')
    expect(result.html).toContain('Runtime matched refs count:')
    expect(result.html).toContain('Runtime unmatched refs count:')
    expect(result.html).toContain('Extracted Airbnb payout row ids')
    expect(result.html).toContain('Extracted Airbnb rawReference values')
    expect(result.html).toContain('Extracted Airbnb data.reference values')
    expect(result.html).toContain('Extracted Airbnb data.referenceCode values')
    expect(result.html).toContain('Extracted Airbnb data.payoutReference values')
    expect(result.html).toContain('Workflow payout batch keys')
    expect(result.html).toContain('Workflow payout references')
    expect(result.html).toContain('Report payoutBatchMatches payoutReference values')
    expect(result.html).toContain('Report unmatchedPayoutBatches payoutReference values')
    expect(result.html).toContain('Runtime matched panel title source values')
    expect(result.html).toContain('Runtime unmatched panel title source values')
    expect(result.html).toContain('Runtime matched titles')
    expect(result.html).toContain('Runtime unmatched titles')
    expect(result.html).toContain('Po spuštění zde uvidíte přesné payout reference a titulky z aktuálního runtime běhu.')
  })

  it('keeps runtime payout diagnostics grounded in true payout references rather than extracted record ids when developer mode is enabled', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T12:13:30.000Z',
      debugMode: true
    })

    expect(result.browserRun.run.batch.extractedRecords
      .filter((record) => record.sourceDocumentId.includes('airbnb'))
      .filter((record) => record.data.rowKind === 'transfer')
      .map((record) => record.id)
    ).toContain('airbnb-payout-2')

    expect(result.browserRun.run.batch.extractedRecords
      .filter((record) => record.sourceDocumentId.includes('airbnb'))
      .filter((record) => record.data.rowKind === 'transfer')
      .map((record) => String(record.rawReference))
    ).toContain('G-OC3WJE3SIXRO5')

    expect(result.html).toContain('Extracted Airbnb payout row ids')
    expect(result.html).toContain('Extracted Airbnb rawReference values')
    expect(result.html).toContain('Zatím není k dispozici žádný uploadovaný runtime výsledek.')
    expect(result.html).not.toContain('airbnb-payout-2')
    expect(result.html).toContain('Po spuštění zde uvidíte přesné payout reference a titulky z aktuálního runtime běhu.')
  })

  it('propagates non-empty upstream payout audit layers through the live browser-upload runtime state', async () => {
    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'airbnb.csv',
          text: async () => getRealInputFixture('airbnb-payout-export').rawInput.content
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          text: async () => getRealInputFixture('raiffeisenbank-statement').rawInput.content
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-23T12:35:00.000Z'
    })

    const diagnostics = collectRuntimePayoutDiagnosticDataFromState(state)
    const runtimePayoutItemCount = state.reviewSections.payoutBatchMatched.length + state.reviewSections.payoutBatchUnmatched.length

    expect(runtimePayoutItemCount).toBeGreaterThan(0)
    expect(diagnostics.extractedAirbnbPayoutRowRefs.length).toBeGreaterThan(0)
    expect(diagnostics.extractedAirbnbRawReferences.length).toBeGreaterThan(0)
    expect(diagnostics.extractedAirbnbDataReferences.length).toBeGreaterThan(0)
    expect(diagnostics.extractedAirbnbReferenceCodes.length).toBeGreaterThan(0)
    expect(diagnostics.extractedAirbnbPayoutReferences.length).toBeGreaterThan(0)
    expect(diagnostics.workflowPayoutBatchKeys.length).toBeGreaterThan(0)
    expect(diagnostics.workflowPayoutReferences.length).toBeGreaterThan(0)
    expect(diagnostics.reportMatchedPayoutReferences.length + diagnostics.reportUnmatchedPayoutReferences.length).toBeGreaterThan(0)
    expect(diagnostics.runtimeMatchedTitleSourceValues.length + diagnostics.runtimeUnmatchedTitleSourceValues.length).toBeGreaterThan(0)
  })

  it('does not allow blank upstream payout audit lists when runtime payout review items exist', async () => {
    const state = await buildBrowserRuntimeStateFromSelectedFiles({
      files: [
        {
          name: 'airbnb.csv',
          text: async () => getRealInputFixture('airbnb-payout-export').rawInput.content
        },
        {
          name: 'Pohyby_5599955956_202603191023.csv',
          text: async () => getRealInputFixture('raiffeisenbank-statement').rawInput.content
        }
      ],
      month: '2026-03',
      generatedAt: '2026-03-23T12:36:00.000Z'
    })

    const diagnostics = collectRuntimePayoutDiagnosticDataFromState(state)

    if (state.reviewSections.payoutBatchMatched.length + state.reviewSections.payoutBatchUnmatched.length > 0) {
      expect(diagnostics.extractedAirbnbPayoutRowRefs).not.toEqual([])
      expect(diagnostics.workflowPayoutReferences).not.toEqual([])
      expect(
        diagnostics.reportMatchedPayoutReferences.length + diagnostics.reportUnmatchedPayoutReferences.length
      ).toBeGreaterThan(0)
    }
  })

  it('renders the dedicated unmatched reservation section in the main browser UI with concrete item details', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-20T11:40:00.000Z'
    })

    expect(result.html).toContain('id="unmatched-reservations-section"')
    expect(result.html).toContain('id="unmatched-reservations-content"')
    expect(result.html).toContain('function buildUnmatchedReservationDetailsMarkup(state)')
    expect(result.html).toContain('unmatchedReservationsContent.innerHTML = buildUnmatchedReservationDetailsMarkup(state);')
    expect(result.html).toContain('Detail nespárovaných rezervací se právě načítá ze sdíleného runtime běhu…')
    expect(result.html).not.toContain('noCandidate')
  })

  it('renders dedicated accommodation and ancillary settlement overview panels in the main browser UI', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-03-22T10:15:00.000Z'
    })

    expect(result.html).toContain('id="reservation-settlement-overview-section"')
    expect(result.html).toContain('id="reservation-settlement-overview-content"')
    expect(result.html).toContain('Hlavní ubytovací rezervace')
    expect(result.html).toContain('id="ancillary-settlement-overview-section"')
    expect(result.html).toContain('id="ancillary-settlement-overview-content"')
    expect(result.html).toContain('Doplňkové položky / ancillary revenue')
    expect(result.html).toContain('buildSettlementOverviewMarkup((state.reviewSections && state.reviewSections.reservationSettlementOverview) || [])')
    expect(result.html).toContain('buildSettlementOverviewMarkup((state.reviewSections && state.reviewSections.ancillarySettlementOverview) || [])')
    expect(result.html).toContain('Přehled hlavních rezervací se právě načítá ze sdíleného runtime běhu…')
    expect(result.html).toContain('Přehled doplňkových položek se právě načítá ze sdíleného runtime běhu…')
  })
})

interface StubDomElement {
  id: string
  innerHTML: string
  textContent: string
  hidden: boolean
  className: string
  value: string
  files: unknown[]
  listeners: Record<string, () => void>
  setAttribute(name: string, value: string): void
  addEventListener(name: string, listener: () => void): void
}

async function executeWebDemoMainWorkflow(input: {
  generatedAt: string
  month: string
  files: Array<{
    name: string
    type?: string
    text?: () => Promise<string>
    arrayBuffer?: () => Promise<ArrayBuffer>
  }>
}): Promise<{
  preparedFilesContent: StubDomElement
  runtimeSummaryUploadedFiles: StubDomElement
}> {
  const result = await buildWebDemo({
    generatedAt: input.generatedAt
  })
  const script = extractMainInlineWebDemoScript(result.html)
  const elements = createWebDemoDomStub()
  const windowObject = {
    location: { search: '' },
    __hotelFinanceCreateBrowserRuntime: () => createBrowserRuntime()
  }

  runInNewContext(stripRuntimeBootstrap(script), {
    window: windowObject,
    document: {
      getElementById(id: string) {
        return elements[id] ?? createStubDomElement(id, elements)
      }
    },
    URLSearchParams,
    console
  })

  elements['monthly-files'].files = input.files
  elements['month-label'].value = input.month
  elements['prepare-upload'].listeners.click()

  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
  }

  return {
    preparedFilesContent: elements['prepared-files-content'],
    runtimeSummaryUploadedFiles: elements['runtime-summary-uploaded-files']
  }
}

function extractMainInlineWebDemoScript(html: string): string {
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/)

  if (!match?.[1]) {
    throw new Error('Main web-demo inline script not found.')
  }

  const script = match[1]
  const runtimeStart = script.indexOf("const fileInput = document.getElementById('monthly-files');")

  if (runtimeStart === -1) {
    throw new Error('Main web-demo runtime body not found.')
  }

  return script.slice(runtimeStart)
}

function stripRuntimeBootstrap(script: string): string {
  return script
}

function createWebDemoDomStub(): Record<string, StubDomElement> {
  const elements: Record<string, StubDomElement> = {}
  const ids = [
    'monthly-files',
    'month-label',
    'prepare-upload',
    'runtime-output',
    'runtime-stage-copy',
    'build-fingerprint',
    'runtime-summary-uploaded-files',
    'runtime-summary-normalized-transactions',
    'runtime-summary-review-items',
    'runtime-summary-export-files',
    'prepared-files-section',
    'prepared-files-content',
    'review-summary-section',
    'review-summary-content',
    'report-preview-body',
    'reservation-settlement-overview-section',
    'reservation-settlement-overview-content',
    'ancillary-settlement-overview-section',
    'ancillary-settlement-overview-content',
    'matched-payout-batches-section',
    'matched-payout-batches-content',
    'unmatched-payout-batches-section',
    'unmatched-payout-batches-content',
    'unmatched-reservations-section',
    'unmatched-reservations-content',
    'export-handoff-section',
    'export-handoff-content'
  ]

  for (const id of ids) {
    createStubDomElement(id, elements)
  }

  return elements
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

function createWebDemoRuntimeFile(name: string, content: string) {
  return {
    name,
    async text() {
      return content
    }
  }
}

function createWebDemoRuntimePdfFileFromTextLines(name: string, lines: string[]) {
  const binary = Buffer.from(buildWebDemoRuntimePdfFromTextLines(lines), 'base64')

  return {
    name,
    type: 'application/pdf',
    async text() {
      return ''
    },
    async arrayBuffer() {
      return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
    }
  }
}

function buildWebDemoRuntimePdfFromTextLines(lines: string[]): string {
  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    ...lines.flatMap((line, index) => index === 0
      ? [`<${encodeWebDemoPdfHexString(line)}> Tj`]
      : ['0 -18 Td', `<${encodeWebDemoPdfHexString(line)}> Tj`]),
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

function encodeWebDemoPdfHexString(value: string): string {
  return Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
}

function buildGlyphSeparatedBookingPayoutStatementPdfLines(): string[] {
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

describe('buildFixtureWebDemo', () => {
  it('keeps the old fixture demo available as an explicit auxiliary path', () => {
    const result = buildFixtureWebDemo({
      fixtureKey: 'matched-payout',
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('Pomocná ukázka párování nad fixture daty')
    expect(result.html).toContain('Pomocná ukázka fixture')
    expect(result.html).toContain('1 250,00 Kč')
    expect(result.fixture.key).toBe('matched-payout')
  })
})
