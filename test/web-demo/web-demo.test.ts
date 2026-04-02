import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { prepareUploadedMonthlyFiles, runMonthlyReconciliationBatch } from '../../src/monthly-batch'
import { buildFixtureWebDemo, buildWebDemo } from '../../src/web-demo'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { emitBrowserRuntimeBundle } from '../../src/upload-web/browser-bundle'
import { buildBrowserRuntimeStateFromSelectedFiles } from '../../src/upload-web/browser-runtime'
import { emitBrowserRuntimeAssets } from '../../src/upload-web'

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
    expect(result.html).toContain('id="clear-month-workspace-button"')
    expect(result.html).toContain('Spustit přípravu a měsíční workflow')
    expect(result.html).toContain('Soubory i ruční rozhodnutí se ukládají zvlášť pro každý měsíc')
    expect(result.html).toContain('let browserRuntime;')
    expect(result.html).toContain("button.addEventListener('click'")
    expect(result.html).toContain('Výsledek spuštěného browser workflow')
    expect(result.html).toContain('Sekvence měsíčního běhu')
    expect(result.html).toContain('Kompaktní přehled měsíčního běhu')
    expect(result.html).toContain('id="open-expense-review-button"')
    expect(result.html).toContain('id="open-control-detail-button"')
    expect(result.html).toContain('id="expense-detail-search"')
    expect(result.html).toContain('id="expense-detail-sort"')
    expect(result.html).toContain('id="expense-filter-expenseUnmatchedOutflows"')
    expect(result.html).toContain('id="expense-filter-expenseUnmatchedInflows"')
    expect(result.html).toContain('main.operator-shell')
    expect(result.html).toContain('class="operator-shell"')
    expect(result.html).toContain('width: min(100%, calc(100vw - 64px));')
    expect(result.html).toContain('max-width: none;')
    expect(result.html).toContain('grid-template-columns: repeat(5, minmax(0, 1fr));')
    expect(result.html).toContain('expense-summary-grid')
    expect(result.html).toContain('expense-summary-tile')
    expect(result.html).toContain('grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));')
    expect(result.html.indexOf('id="expense-unmatched-outflows-section"')).toBeGreaterThan(-1)
    expect(result.html.indexOf('id="expense-unmatched-inflows-section"')).toBeGreaterThan(result.html.indexOf('id="expense-unmatched-outflows-section"'))
    expect(result.html.indexOf('id="expense-manual-matched-section"')).toBeGreaterThan(result.html.indexOf('id="expense-unmatched-inflows-section"'))
    expect(result.html).not.toContain('grid-template-columns: minmax(0, 1fr) minmax(200px, 240px) minmax(0, 1fr);')
    expect(result.html).not.toContain('window.open(')
    expect(result.html).not.toContain('about:blank')
    expect(result.html).toContain('Exportní handoff')
    expect(result.html).toContain('Výběr Excel exportu pro aktuální měsíc')
    expect(result.html).toContain('Stáhnout Excel export')
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
    expect(readFileSync(outputPath, 'utf8')).toContain('__hotelFinanceBuildWorkspaceExcelExport')
    expect(readFileSync(outputPath, 'utf8')).toContain(`import(${JSON.stringify(result.runtimeAssetPath)})`)
    expect(readFileSync(outputPath, 'utf8')).not.toContain('import("./browser-runtime.js")')
    expect(existsSync(resolve('dist/test-web-demo', result.runtimeAssetPath!.slice(2)))).toBe(true)
    const runtimeAsset = readFileSync(resolve('dist/test-web-demo', result.runtimeAssetPath!.slice(2)), 'utf8')
    expect(runtimeAsset).not.toContain('estimateExtractedCount(')
    expect(runtimeAsset).not.toContain('buildReviewSections(')
    expect(runtimeAsset).not.toContain('buildSupportedExpenseLinks(')
    expect(runtimeAsset).toContain('__HOTEL_FINANCE_BUILD_PROVENANCE__')
    expect(runtimeAsset).toContain('ingestUploadedMonthlyFiles')
    expect(runtimeAsset).toContain('buildReviewScreen')
    expect(runtimeAsset).toContain('buildExportArtifacts')
    expect(runtimeAsset).toContain('buildBrowserRuntimeWorkspaceExcelExport')
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

    const [runtimeAssetPath] = await emitBrowserRuntimeAssets(outputPath, {
      generatedAt: '2026-03-18T19:00:00.000Z'
    })
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
    expect(result.html).toContain("runtimeSummaryUploadedFiles.textContent = String(visibleState.routingSummary?.uploadedFileCount ?? (visibleState.fileRoutes || []).length ?? (visibleState.preparedFiles || []).length);")
    expect(result.html).toContain("runtimeSummaryNormalizedTransactions.textContent = String(visibleState.reviewSummary?.normalizedTransactionCount ?? visibleState.reportSummary?.normalizedTransactionCount ?? 0);")
    expect(result.html).toContain("runtimeSummaryReviewItems.textContent = String(visibleState.reviewSummary?.exceptionCount ?? 0);")
    expect(result.html).toContain("runtimeSummaryExportFiles.textContent = String((visibleState.exportFiles || []).length);")
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

    expect(result.html).toContain('const payoutProjection = getVisiblePayoutProjection(state);')
    expect(result.html).toContain('const payoutBatchMatchedCount = payoutProjection.matchedCount;')
    expect(result.html).toContain('const payoutBatchUnmatchedCount = payoutProjection.unmatchedCount;')
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
    expect(result.html).toContain("matchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup(payoutProjection.matchedItems || [], 'control', 'matched');")
    expect(result.html).toContain("unmatchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup(payoutProjection.unmatchedItems || [], 'control', 'payoutBatchUnmatched');")
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
    expect(result.html).toContain('buildFingerprint.innerHTML = buildFingerprintMarkup(visibleState);')
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

  it('renders the final operator-facing web page with a ToUnicode-mapped Booking payout PDF under recognized supported supplements instead of unsupported files', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T17:45:00.000Z',
      month: '2026-03',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', booking.rawInput.content),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildBookingPayoutStatementVariantPdfLines())
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

  it('shows readable ToUnicode-mapped PDF intake trace on the actual final page only when debug mode is enabled through the live URL', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const defaultRendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T18:05:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-final-default-trace',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', booking.rawInput.content),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildBookingPayoutStatementVariantPdfLines())
      ]
    })

    const debugRendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T18:05:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-final-debug-trace',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', booking.rawInput.content),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildBookingPayoutStatementVariantPdfLines())
      ]
    })

    expect(defaultRendered.runtimeFileIntakeDiagnosticsSection.hidden).toBe(true)
    expect(defaultRendered.runtimePayoutProjectionDebugSection.hidden).toBe(true)
    expect(debugRendered.runtimeFileIntakeDiagnosticsSection.hidden).toBe(false)
    expect(debugRendered.runtimePayoutProjectionDebugSection.hidden).toBe(false)
    expect(debugRendered.html).toContain('id="runtime-file-intake-diagnostics-section"')
    expect(debugRendered.html).toContain('id="runtime-payout-projection-debug-section"')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Bookinng35k.pdf')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('MIME: application/pdf')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Browser extraction: extracted / pdf-text')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Extrahovaný text: ano')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Text preview: Booking.com Payment overview')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('booking-branding')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('booking-payment-id')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Rozhodnutí klasifikátoru: booking / payout_statement / content')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Routování: Booking payout statement PDF · supplemental')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser paymentId: PAYOUT-BOOK-20260310')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser payoutDate: 2026-03-12')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser payoutTotal: 1250.00 CZK')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser ibanHint: 5956')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Finální bucket: supplemental supported · Podporovaný doplňkový payout dokument')
    expect(debugRendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
  })

  it('renders the final operator page with a real-like Czech Booking payout PDF as a supported supplement instead of unsupported even when the head preview is just property details', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T19:05:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-final-czech-booking-pdf',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', booking.rawInput.content),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechLateCueBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Podporovaný doplňkový payout dokument')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Booking payout statement PDF')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Nepodporované nebo nerozpoznané soubory</h4><ul><li><strong>Bookinng35k.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>Bookinng35k.pdf</strong>')
    expect(rendered.runtimeSummaryUploadedFiles.textContent).toBe('4')
  })

  it('shows full-document PDF handoff evidence in debug mode by exposing text length, head preview, tail preview, and keyword hits from the actual final page', async () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')
    const debugRendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T19:15:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-final-czech-booking-debug',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', booking.rawInput.content),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechLateCueBookingPayoutStatementPdfLines())
      ]
    })

    expect(debugRendered.runtimeFileIntakeDiagnosticsSection.hidden).toBe(false)
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Bookinng35k.pdf')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Délka textu:')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Text preview: Chill apartment with city view and balcony')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Text tail: března 2026 ID platby 010638445054 Celková čá')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Keyword hits:')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Booking.com B.V.')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Výkaz plateb')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('ID platby')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Datum vyplacení částky')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Celkem (CZK)')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Celková částka k vyplacení')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('IBAN')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Reservation reference')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('booking-payout-total')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Rozhodnutí klasifikátoru: booking / payout_statement / content')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Decision reason: confidence=strong · parser=ano · matched=pdf-like-upload, booking-payout-core-fields')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.paymentId: 010638445054')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.payoutDate: 2026-03-12')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.payoutTotal: 1456.42 EUR')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.paymentId: 010638445054')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.payoutDate: 2026-03-12')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.payoutTotal: 1456.42 EUR')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser paymentId: 010638445054')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser payoutDate: 2026-03-12')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser payoutTotal: 1456.42 EUR')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser localTotal: 35530.12 CZK')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser ibanHint: 5956')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
    expect(debugRendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Finální bucket: supplemental supported · Podporovaný doplňkový payout dokument')
    expect(debugRendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
  })

  it('renders the final built operator page without Booking PDF ingest failure when payout labels and values are split into separate blocks', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T19:30:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-separated-booking-pdf',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSeparatedBlockBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 2 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>Bookinng35k.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser paymentId: 010638445054')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser payoutDate: 2026-03-12')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parser payoutTotal: 1456.42 EUR')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
  })

  it('renders the final built operator page without Booking PDF ingest failure when required fields are far from labels in the extracted PDF text', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T19:40:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-wide-gap-booking-pdf',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechWideGapBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>Bookinng35k.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.paymentId: 010638445054')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.payoutDate: 2026-03-12')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.payoutTotal: 1456.42 EUR')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.paymentId: 010638445054')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.payoutDate: 2026-03-12')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.payoutTotal: 1456.42 EUR')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
  })

  it('renders the final built operator page with fragmented Booking PDF fields resolved to full values instead of 1 EUR', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T19:50:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-fragmented-booking-pdf',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechFragmentedBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>Bookinng35k.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.paymentId: 010638445054')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.payoutDate: 2026-03-12')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.payoutTotal: 1456.42 EUR')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.localTotal: 35530.12 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.paymentId: 010638445054')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.payoutDate: 2026-03-12')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.payoutTotal: 1456.42 EUR')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
    expect(rendered.runtimeSummaryUploadedFiles.textContent).toBe('4')
  })

  it('renders the final built operator page with the real one-glyph-per-line Booking PDF shape parsed into full validator fields', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T20:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-single-glyph-booking-pdf',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Textové PDF')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>Bookinng35k.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Capability: Textové PDF / pdf_text_layer / confidence=strong')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Ingestion branch: textové PDF / text-pdf-parser')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.paymentId: 010638445054')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.payoutDate: 2026-03-12')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.payoutTotal: 1456.42 EUR')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('parserExtracted.localTotal: 35530.12 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.paymentId: 010638445054')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.payoutDate: 2026-03-12')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('validatorInput.payoutTotal: 1456.42 EUR')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
    expect(rendered.runtimeSummaryUploadedFiles.textContent).toBe('4')
  })

  it('matches the Booking payout on the final built page when the bank line only carries the Booking PDF paymentId and local total', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-25T10:45:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-booking-supplement-bank-match',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          buildActualUploadedRbCitiContentWithBookingPaymentIdMatch()
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechLateCueBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain(
      'Shoda dávky a bankovního přípisu podle lokální payout částky, data payoutu a ID platby Booking.'
    )
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain(
      'Kontext payoutu: Datum payoutu: 2026-03-12 · Celkem payoutu: 1 456,42 EUR · IBAN 5956 · rezervace: 1.'
    )
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).not.toContain('Booking payout 010638445054 / 35 530,12 Kč')
  })

  it('matches the Booking payout on the final built page when the bank line carries the Booking counterparty and reference fragment', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-25T11:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-booking-reference-hint-bank-match',
      files: [
        createWebDemoRuntimeFile('booking35k.csv', buildBooking35kBrowserUploadContent()),
        createWebDemoRuntimeFile('airbnb.csv', buildActualUploadedAirbnbContent()),
        createWebDemoRuntimeFile(
          'Pohyby_5599955956_202603191023.csv',
          buildActualUploadedRbCitiContentWithBookingReferenceHintMatch()
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain(
      'Shoda dávky a bankovního přípisu podle částky, měny, povoleného směrování a pozorovaného protiúčtu.'
    )
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain(
      'Bankovní přípis: 2026-03-13T09:12:00 · BOOKING.COM B.V. · NO.AAOS6MOZUH8BFTER/2206371.'
    )
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain(
      'Kontext payoutu: Datum payoutu: 2026-03-12 · Celkem payoutu: 1 456,42 EUR · Kurz: 24.3955.'
    )
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).not.toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.runtimeSummaryUploadedFiles.textContent).toBe('4')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('renders browser arrayBuffer CSV uploads through capability-aware structured routing on the built page', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T20:45:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-arraybuffer-structured-routing',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content, 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content, 'text/csv'),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Strukturovaný export')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Capability: Strukturovaný export / structured_tabular / confidence=strong')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Ingestion branch: strukturovaný parser / structured-parser')
    expect(rendered.runtimeSummaryUploadedFiles.textContent).toBe('4')
  })

  it('keeps the actual browser-like built page aligned with 16 matched and 2 unmatched payout batches for the real 4-file scenario', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-25T14:55:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-arraybuffer-real-4-file-payout-truth',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbCitiContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).not.toContain('Booking payout 010638445054 / 35 530,12 Kč')
  })

  it('keeps the actual built page aligned with 16 matched and 2 unmatched payout batches when Airbnb bank lines only carry generic transfer wording', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-26T10:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-arraybuffer-real-4-file-generic-bank-transfer-wording',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reportSummary matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reviewSummary matched:</strong> 16')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('keeps the actual built page aligned with 16 matched and 2 unmatched payout batches when the Fio bank export contains duplicate amount-like columns', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-26T18:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-arraybuffer-real-4-file-duplicate-fio-amount-columns',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentWithDuplicateAmountColumnsForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('matching source batch_total')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('exact amount pre-date/evidence ano')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('same-currency bank amounts')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('3')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('961,05 CZK')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('keeps the actual built page aligned with 16 matched and 2 unmatched payout batches when Airbnb bank postings land three days before payout availability', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-26T16:40:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-arraybuffer-real-4-file-airbnb-three-day-bank-gap',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(-3),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reportSummary matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reviewSummary matched:</strong> 16')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('shows the Airbnb unmatched histogram and exact-amount fallback decisions on the actual built page when bank postings fall outside the normal date window', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-26T20:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-arraybuffer-real-4-file-airbnb-exact-amount-fallback',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(-5),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Airbnb unmatched histogram:</strong> noExactAmount=2 · dateRejected=0 · evidenceRejected=0 · ambiguous=0 · other=0')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('selection mode unique_exact_amount_fallback')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('component rows 1')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('nearest amount delta')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('shows Booking document total and local bank matching total separately on the actual built page when the CSV carries the payout document total in EUR', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-26T10:30:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-arraybuffer-real-4-file-booking-eur-batch',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContentInEur(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('document total')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('1')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('456,42 EUR')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('bank matching total')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('35')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('530,12 CZK')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('matching source booking_local_total')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).not.toContain('Booking payout 010638445054 / 35 530,12 Kč')
  })

  it('keeps the actual built page aligned with 16 matched and 2 unmatched payout batches when the bank CSV uses CR-only row separators', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-26T11:25:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-arraybuffer-real-4-file-cr-only-bank-csv',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          withCrOnlyLineEndings(buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch()),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('txn:bank:fio-row-16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation batch decisions:')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Inbound bank transaction snapshot:')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('renders debug-only runtime markers and one authoritative payout projection snapshot on the actual built page', async () => {
    const generatedAt = '2026-03-25T16:05:00.000Z'
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt,
      month: '2026-03',
      outputDirName: 'test-web-demo-payout-projection-debug-snapshot',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbCitiContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    const gitCommitHash = resolveCurrentGitCommitHash()

    expect(rendered.runtimePayoutProjectionDebugSection.hidden).toBe(false)
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain(`Git commit:</strong> <code>${gitCommitHash}</code>`)
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain(`Git short SHA:</strong> <code>${gitCommitHash.slice(0, 7)}</code>`)
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain(`Build timestamp:</strong> <code>${generatedAt}</code>`)
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain(`Build branch:</strong> <code>${resolveCurrentGitBranchLabel()}</code>`)
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Build source:</strong> <code>local</code>')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Runtime module version:</strong> <code>browser-runtime.')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Renderer version:</strong> <code>web-demo-operator-v3</code>')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Payout projection version:</strong> <code>payout-projection-v4</code>')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Reconciliation source:</strong> <code>buildBrowserRuntimeUploadStateFromFiles -&gt; batch.reconciliation</code>')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Reconciliation object path:</strong> <code>state.reconciliationSnapshot</code>')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Projection source:</strong> <code>buildCompletedVisibleRuntimeState -&gt; collectVisiblePayoutProjection</code>')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Projection object path:</strong> <code>state.finalPayoutProjection</code>')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Matched payout count:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Unmatched payout count:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reportSummary matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reportSummary unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reviewSummary matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reviewSummary unmatched:</strong> 2')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Matched review section count:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Unmatched review section count:</strong> 2')
    expect(rendered.buildFingerprint.innerHTML).toContain('Payout matched: <strong>16</strong>')
    expect(rendered.buildFingerprint.innerHTML).toContain('Payout unmatched: <strong>2</strong>')
    expect(rendered.lastVisiblePayoutProjection).toMatchObject({
      sourceFunction: 'buildCompletedVisibleRuntimeState -> collectVisiblePayoutProjection',
      objectPath: 'state.finalPayoutProjection',
      matchedCount: 16,
      unmatchedCount: 2,
      matchedSectionCount: 16,
      unmatchedSectionCount: 2
    })
    expect((rendered.lastVisiblePayoutProjection as { matchedIds: string[] }).matchedIds).toHaveLength(16)
    expect((rendered.lastVisiblePayoutProjection as { unmatchedIds: string[] }).unmatchedIds).toHaveLength(2)
    expect((rendered.lastVisibleRuntimeState as { finalPayoutProjection?: { matchedCount: number; unmatchedCount: number } }).finalPayoutProjection).toMatchObject({
      matchedCount: 16,
      unmatchedCount: 2
    })
    expect((rendered.lastVisibleRuntimeState as { reportSummary?: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number } }).reportSummary).toMatchObject({
      payoutBatchMatchCount: 16,
      unmatchedPayoutBatchCount: 2
    })
    expect((rendered.lastVisibleRuntimeState as { reviewSummary?: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number } }).reviewSummary).toMatchObject({
      payoutBatchMatchCount: 16,
      unmatchedPayoutBatchCount: 2
    })
    expect((rendered.lastVisibleRuntimeState as { reconciliationSnapshot?: { matchedCount: number; unmatchedCount: number } }).reconciliationSnapshot).toMatchObject({
      matchedCount: 16,
      unmatchedCount: 2
    })
  })

  it('renders scan-like PDFs on the OCR branch instead of treating them as ingest failures in the built page', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-24T21:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-ocr-branch',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content),
        createWebDemoRuntimePdfFile('booking-payout-broken.pdf', buildBrokenRuntimePdfBase64())
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 1 · Nepodporováno: 1 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Scan / OCR potřeba')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>booking-payout-broken.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Capability: Scan / OCR potřeba / pdf_image_only / confidence=strong')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Ingestion branch: OCR potřeba / ocr-required')
  })

  it('shows a Czech text-layer invoice PDF as a recognized text PDF document without changing the known 16 / 2 payout result', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-26T11:05:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-invoice-text-pdf',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 5 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Lenner.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Dodavatelská faktura')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Textové PDF')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>Lenner.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Lenner.pdf')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Transport profile: Textové PDF / text_pdf')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document hints: invoice_like')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Keyword hits: Faktura, Faktura - daňový doklad')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document summary: invoice · ref 141260183 · issuer Lenner Motors s.r.o.')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('total 12 629,52 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document customer: JOKELAND s.r.o.')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final referenceNumber: 141260183')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final issueDate: 2026-03-11')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Raw block #')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Raw block lines: Datum splatnosti | Forma úhrady | Datum vystavení | Datum zdanitelného plnění')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Raw block lines: Rozpis DPH | DPH │ Celkem po zaokrouhlení | 21 919,90 Kč │ Záloh celkem | Základ DPH')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Raw block lines: S DPH │ 10 437,62 Kč │ 12 629,52 Kč │ Razítko a podpis | Předmět plnění | Servis vozidla')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Grouped header block candidate #')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('vertical-grouped-block / score=')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('rejected / missing reference label')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Grouped header block labels: Datum splatnosti | Forma úhrady | Datum vystavení | Datum zdanitelného plnění')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Grouped header block values: 25.03.2026 | Přev.příkaz | 11.03.2026 | 11.03.2026')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document dueDate: 2026-03-25')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document taxableDate: 2026-03-11')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final totalAmount: 12 629,52 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final totalAmountMinor: 1262952')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final totalCurrency: CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document paymentMethod: Přev. příkaz')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document ibanHint: CZ4903000000000274621920')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document VAT base: 10 437,62 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document VAT: 2 191,90 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('QR detected: no')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field referenceNumber: winner anchored-header-window / 141260183')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field referenceNumber candidates: 141260183')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field issueDate: winner grouped-combined-date-payment-row / 11.03.2026')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field taxableDate: winner grouped-combined-date-payment-row / 11.03.2026')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field paymentMethod: winner grouped-combined-date-payment-row / Přev. příkaz')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field paymentMethod candidates: Přev.příkaz')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field totalAmount: winner field-specific-summary-total / 12 629,52 Kč')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field totalAmount candidates: 10 437,62 Kč | 12 629,52 Kč')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('10 437,62 Kč [not-money]')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Stav:</strong> potvrzená shoda')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Stav:</strong> slabší shoda')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Důkazy:</strong> částka:')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Ruční kontrola:</strong>')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).toContain('Stav:</strong> nespárováno')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).not.toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).not.toContain('Lenner')
    expect(rendered.appShell.className).toBe('operator-shell')
    expect(rendered.mainDashboardView.hidden).toBe(false)
    expect(rendered.expenseReviewSummaryContent.innerHTML).toContain('Spárované výdaje')
    expect(rendered.expenseReviewSummaryContent.innerHTML).toContain('Výdaje ke kontrole')
    expect(rendered.expenseReviewSummaryContent.innerHTML).toContain('Nespárované doklady')
    expect(rendered.expenseReviewSummaryContent.innerHTML).toContain('Nespárované odchozí platby')
    expect(rendered.controlDetailLauncherSummaryContent.innerHTML).toContain('Spárované payout dávky')
    expect(rendered.controlDetailLauncherSummaryContent.innerHTML).toContain('Nespárované payout dávky')

    const controlDetailView = rendered.openControlDetailPage()

    expect(rendered.mainDashboardView.hidden).toBe(true)
    expect(controlDetailView.hidden).toBe(false)
    expect(rendered.expenseDetailView.hidden).toBe(true)
    expect(rendered.appShell.className).toBe('operator-shell')
    expect(rendered.controlDetailPageSummaryContent.innerHTML).toContain('Hlavní ubytovací rezervace')
    expect(rendered.controlDetailPageSummaryContent.innerHTML).toContain('Doplňkové položky')
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).toContain('Stav:</strong> nespárováno')

    const matchedPayoutSummaryCount = extractSummaryCount(rendered.controlDetailPageSummaryContent.innerHTML, 'Spárované payout dávky')
    const unmatchedPayoutSummaryCount = extractSummaryCount(rendered.controlDetailPageSummaryContent.innerHTML, 'Nespárované payout dávky')
    const reservationSummaryCount = extractSummaryCount(rendered.controlDetailPageSummaryContent.innerHTML, 'Hlavní ubytovací rezervace')
    const ancillarySummaryCount = extractSummaryCount(rendered.controlDetailPageSummaryContent.innerHTML, 'Doplňkové položky')
    const unmatchedReservationsSummaryCount = extractSummaryCount(rendered.controlDetailPageSummaryContent.innerHTML, 'Nespárované rezervace k úhradě')

    expect(extractSummaryCount(rendered.controlDetailLauncherSummaryContent.innerHTML, 'Spárované payout dávky')).toBe(matchedPayoutSummaryCount)
    expect(extractSummaryCount(rendered.controlDetailLauncherSummaryContent.innerHTML, 'Nespárované payout dávky')).toBe(unmatchedPayoutSummaryCount)
    expect(extractSummaryCount(rendered.controlDetailLauncherSummaryContent.innerHTML, 'Hlavní ubytovací rezervace')).toBe(reservationSummaryCount)
    expect(extractSummaryCount(rendered.controlDetailLauncherSummaryContent.innerHTML, 'Doplňkové položky')).toBe(ancillarySummaryCount)
    expect(extractSummaryCount(rendered.controlDetailLauncherSummaryContent.innerHTML, 'Nespárované rezervace k úhradě')).toBe(unmatchedReservationsSummaryCount)

    expect(matchedPayoutSummaryCount).toBe(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1)
    expect(unmatchedPayoutSummaryCount).toBe(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1)
    expect(reservationSummaryCount).toBe(rendered.reservationSettlementOverviewContent.innerHTML.split('<li><strong>').length - 1)
    expect(ancillarySummaryCount).toBe(rendered.ancillarySettlementOverviewContent.innerHTML.split('<li><strong>').length - 1)
    expect(unmatchedReservationsSummaryCount).toBe(rendered.unmatchedReservationsContent.innerHTML.split('<li><strong>').length - 1)

    rendered.backToMainOverviewFromControl()
    expect(rendered.mainDashboardView.hidden).toBe(false)
    expect(rendered.controlDetailView.hidden).toBe(true)
    expect(rendered.appShell.className).toBe('operator-shell')

    const expenseDetailView = rendered.openExpenseReviewPage()

    expect(rendered.mainDashboardView.hidden).toBe(true)
    expect(rendered.controlDetailView.hidden).toBe(true)
    expect(expenseDetailView.hidden).toBe(false)
    expect(rendered.appShell.className).toBe('operator-shell')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('Spárované výdaje')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('Výdaje ke kontrole')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('Nespárované doklady')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('Nespárované odchozí platby')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('Nespárované příchozí platby')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('data-expense-bucket-key="expenseMatched"')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('data-expense-bucket-key="expenseNeedsReview"')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('data-expense-bucket-key="expenseUnmatchedDocuments"')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('data-expense-bucket-key="expenseUnmatchedOutflows"')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('data-expense-bucket-key="expenseUnmatchedInflows"')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('Lenner Motors s.r.o.')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('141260183')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('Doklad ↔ banka:')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('Částka:')
    const renderedExpenseEvidenceHtml = rendered.expenseMatchedContent.innerHTML
      + rendered.expenseReviewContent.innerHTML
      + rendered.expenseUnmatchedDocumentsContent.innerHTML

    expect(renderedExpenseEvidenceHtml).toContain('VS 141260183 Servis vozidla')
    expect(renderedExpenseEvidenceHtml).toContain('rozdíl částky:')
    expect(renderedExpenseEvidenceHtml).toContain('rozdíl dnů:')
    expect(renderedExpenseEvidenceHtml).toContain('zpráva banky:')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('<div class="expense-item-header">')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('<div class="expense-zone"><h6>Doklad</h6>')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('<div class="expense-zone expense-status"><h6>Stav a důkazy</h6>')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('<div class="expense-zone"><h6>Banka</h6>')
    expect(rendered.expenseMatchedContent.innerHTML + rendered.expenseReviewContent.innerHTML + rendered.expenseUnmatchedDocumentsContent.innerHTML).not.toContain('Airbnb payout dávka')

    const expenseMatchedSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseMatched')
    const expenseReviewSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseNeedsReview')
    const expenseUnmatchedDocumentsSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedDocuments')
    const expenseUnmatchedOutflowsSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedOutflows')
    const expenseUnmatchedInflowsSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedInflows')
    const expenseMatchedLauncherCount = extractExpenseBucketCount(rendered.expenseReviewSummaryContent.innerHTML, 'expenseMatched')
    const expenseReviewLauncherCount = extractExpenseBucketCount(rendered.expenseReviewSummaryContent.innerHTML, 'expenseNeedsReview')
    const expenseUnmatchedDocumentsLauncherCount = extractExpenseBucketCount(rendered.expenseReviewSummaryContent.innerHTML, 'expenseUnmatchedDocuments')
    const expenseUnmatchedOutflowsLauncherCount = extractExpenseBucketCount(rendered.expenseReviewSummaryContent.innerHTML, 'expenseUnmatchedOutflows')
    const expenseUnmatchedInflowsLauncherCount = extractExpenseBucketCount(rendered.expenseReviewSummaryContent.innerHTML, 'expenseUnmatchedInflows')

    expect(expenseMatchedLauncherCount).toBe(expenseMatchedSummaryCount)
    expect(expenseReviewLauncherCount).toBe(expenseReviewSummaryCount)
    expect(expenseUnmatchedDocumentsLauncherCount).toBe(expenseUnmatchedDocumentsSummaryCount)
    expect(expenseUnmatchedOutflowsLauncherCount).toBe(expenseUnmatchedOutflowsSummaryCount)
    expect(expenseUnmatchedInflowsLauncherCount).toBe(expenseUnmatchedInflowsSummaryCount)

    expect(expenseMatchedSummaryCount).toBe(rendered.expenseMatchedContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(expenseReviewSummaryCount).toBe(rendered.expenseReviewContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(expenseUnmatchedDocumentsSummaryCount).toBe(rendered.expenseUnmatchedDocumentsContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(expenseUnmatchedOutflowsSummaryCount).toBe(rendered.expenseUnmatchedOutflowsContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(expenseUnmatchedInflowsSummaryCount).toBe(rendered.expenseUnmatchedInflowsContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(expenseMatchedSummaryCount + expenseReviewSummaryCount).toBeGreaterThanOrEqual(1)
    expect(expenseUnmatchedOutflowsSummaryCount).toBeGreaterThanOrEqual(1)

    rendered.backToMainOverviewFromExpense()
    expect(rendered.mainDashboardView.hidden).toBe(false)
    expect(rendered.expenseDetailView.hidden).toBe(true)
  })

  it('shows SPD QR fallback payload and provenance for invoice-like PDFs without changing the stable 16 / 2 payout result', async () => {
    const qrInvoice = getRealInputFixture('invoice-document-czech-pdf-with-spd-qr')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-28T10:35:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-invoice-qr-spd',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFile(qrInvoice.sourceDocument.fileName, qrInvoice.rawInput.binaryContentBase64!)
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 5 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>invoice-with-qr.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('invoice-with-qr.pdf')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('QR detected: yes')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('QR raw payload: SPD*1.0*ACC:CZ4903000000000274621920*AM:18500.00*CC:CZK*X-VS:141260183*X-KS:0308*X-SS:1007*RN:QR%20Hotel%20Supply%20s.r.o.*MSG:Faktura%20141260183*DT:20260325')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('QR parsed fields: account=CZ4903000000000274621920 | ibanHint=CZ4903000000000274621920 | amountMinor=1850000 | currency=CZK | variableSymbol=141260183 | constantSymbol=0308 | specificSymbol=1007 | recipientName=QR Hotel Supply s.r.o. | message=Faktura 141260183 | dueDate=2026-03-25 | referenceNumber=141260183')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('QR recovered fields: referenceNumber, dueDate, totalAmount, ibanHint')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('QR confirmed fields: issuerOrCounterparty')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final field provenance:')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('referenceNumber=qr')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('dueDate=qr')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('totalAmount=qr')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('ibanHint=qr')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('issuerOrCounterparty=text+qr-confirmed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
  })

  it('lets the operator manually confirm a review-worthy expense pair and keeps counts aligned', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T15:45:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-expense-manual-confirm',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.openExpenseReviewPage()

    expect(rendered.expenseReviewContent.innerHTML).toContain('Potvrdit shodu')
    expect(rendered.expenseReviewContent.innerHTML).toContain('Není to shoda')

    const stateBefore = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = stateBefore.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()

    rendered.confirmExpenseReviewItem(String(reviewItemId))

    const stateAfter = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseMatched: Array<{ manualDecision?: string; manualSourceReviewItemId?: string }>
        expenseNeedsReview: Array<unknown>
      }
    }

    expect(stateAfter.reviewSections.expenseNeedsReview).toHaveLength(0)
    expect(
      stateAfter.reviewSections.expenseMatched.some((item) =>
        item.manualDecision === 'confirmed'
        && item.manualSourceReviewItemId === reviewItemId
      )
    ).toBe(true)
    expect(rendered.expenseMatchedContent.innerHTML).toContain('Ručně potvrzená shoda')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('Lenner Motors s.r.o.')
    expect(rendered.expenseReviewContent.innerHTML).toContain('Žádné výdaje ke kontrole.')

    const expenseMatchedSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseMatched')
    const expenseReviewSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseNeedsReview')

    expect(expenseMatchedSummaryCount).toBe(rendered.expenseMatchedContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(expenseReviewSummaryCount).toBe(rendered.expenseReviewContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)

    const reloaded = await rendered.reloadWithSameStorage()
    reloaded.openExpenseReviewPage()

    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseMatched: Array<{ id: string; manualDecision?: string; manualSourceReviewItemId?: string }>
        expenseNeedsReview: Array<unknown>
      }
    }

    expect(reloadedState.reviewSections.expenseNeedsReview).toHaveLength(0)
    expect(
      reloadedState.reviewSections.expenseMatched.some((item) =>
        item.manualDecision === 'confirmed'
        && item.manualSourceReviewItemId === reviewItemId
      )
    ).toBe(true)
    expect(reloaded.expenseMatchedContent.innerHTML).toContain('Ručně potvrzená shoda')

    const confirmedItemId = reloadedState.reviewSections.expenseMatched.find((item) =>
      item.manualSourceReviewItemId === reviewItemId
    )?.id

    expect(confirmedItemId).toBeTruthy()

    reloaded.undoConfirmedExpenseReviewItem(String(confirmedItemId))

    const undoneState = reloaded.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseMatched: Array<unknown>
        expenseNeedsReview: Array<{ id: string }>
      }
    }

    expect(undoneState.reviewSections.expenseMatched).toHaveLength(0)
    expect(undoneState.reviewSections.expenseNeedsReview.map((item) => item.id)).toContain(String(reviewItemId))
    expect(reloaded.expenseReviewContent.innerHTML).toContain('Potvrdit shodu')
  })

  it('filters, searches, sorts, and keeps full totals stable on the expense detail page', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T15:50:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-expense-filters-and-sorting',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.openExpenseReviewPage()

    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('data-expense-bucket-key="expenseNeedsReview"')
    expect(rendered.expenseDetailVisibleCount.textContent).toBe('Zobrazeno položek: 2')

    const fullReviewCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseNeedsReview')
    const fullOutflowCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedOutflows')

    expect(fullReviewCount).toBe(1)
    expect(fullOutflowCount).toBe(1)

    rendered.setExpenseDetailSearch('lenner')
    expect(rendered.expenseDetailVisibleCount.textContent).toBe('Zobrazeno položek: 1')
    expect(rendered.expenseReviewContent.innerHTML).toContain('Lenner Motors s.r.o.')
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).toContain('Žádné nespárované odchozí platby.')
    expect(extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseNeedsReview')).toBe(fullReviewCount)
    expect(extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedOutflows')).toBe(fullOutflowCount)

    const reviewState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = reviewState.reviewSections.expenseNeedsReview[0]?.id
    expect(reviewItemId).toBeTruthy()

    rendered.confirmExpenseReviewItem(String(reviewItemId))
    expect(rendered.expenseMatchedContent.innerHTML).toContain('Ručně potvrzená shoda')
    expect(rendered.expenseReviewContent.innerHTML).toContain('Žádné výdaje ke kontrole.')
    expect(rendered.expenseDetailVisibleCount.textContent).toBe('Zobrazeno položek: 1')

    rendered.setExpenseDetailSearch('')
    rendered.setExpenseDetailFilter('manualConfirmed')
    expect(rendered.expenseDetailVisibleCount.textContent).toBe('Zobrazeno položek: 1')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('Ručně potvrzená shoda')
    expect(rendered.expenseReviewContent.innerHTML).toContain('Žádné výdaje ke kontrole.')

    const confirmedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseMatched: Array<{ id: string; manualSourceReviewItemId?: string }>
      }
    }
    const confirmedItemId = confirmedState.reviewSections.expenseMatched.find((item) => item.manualSourceReviewItemId === reviewItemId)?.id
    expect(confirmedItemId).toBeTruthy()

    rendered.undoConfirmedExpenseReviewItem(String(confirmedItemId))
    rendered.setExpenseDetailFilter('expenseNeedsReview')
    expect(rendered.expenseDetailVisibleCount.textContent).toBe('Zobrazeno položek: 1')
    expect(rendered.expenseReviewContent.innerHTML).toContain('Lenner Motors s.r.o.')

    rendered.setExpenseDetailSearch('VS 141260183')
    expect(rendered.expenseDetailVisibleCount.textContent).toBe('Zobrazeno položek: 1')
    rendered.rejectExpenseReviewItem(String(reviewItemId))
    rendered.setExpenseDetailSearch('')
    rendered.setExpenseDetailFilter('expenseUnmatchedOutflows')
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).toContain('Ručně zamítnuto')
    expect(rendered.expenseDetailVisibleCount.textContent).toBe('Zobrazeno položek: 2')

    rendered.setExpenseDetailSort('newest')
    const outflowTitlesNewest = extractExpenseItemTitles(rendered.expenseUnmatchedOutflowsContent.innerHTML)
    rendered.setExpenseDetailSort('oldest')
    const outflowTitlesOldest = extractExpenseItemTitles(rendered.expenseUnmatchedOutflowsContent.innerHTML)

    expect(outflowTitlesNewest).toHaveLength(2)
    expect(outflowTitlesOldest).toHaveLength(2)
    expect(outflowTitlesNewest).not.toEqual(outflowTitlesOldest)
    expect(extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseNeedsReview')).toBe(0)
    expect(extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedOutflows')).toBe(fullOutflowCount + 1)
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('lets the operator reject a review-worthy expense pair and does not immediately re-suggest the same pair', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T15:55:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-expense-manual-reject',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.openExpenseReviewPage()

    const stateBefore = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = stateBefore.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()

    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const stateAfter = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<unknown>
        expenseUnmatchedDocuments: Array<{ manualDecision?: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ manualDecision?: string; manualSourceReviewItemId?: string }>
      }
    }

    expect(stateAfter.reviewSections.expenseNeedsReview).toHaveLength(0)
    expect(
      stateAfter.reviewSections.expenseUnmatchedDocuments.some((item) =>
        item.manualDecision === 'rejected'
        && item.manualSourceReviewItemId === reviewItemId
      )
    ).toBe(true)
    expect(
      stateAfter.reviewSections.expenseUnmatchedOutflows.some((item) =>
        item.manualDecision === 'rejected'
        && item.manualSourceReviewItemId === reviewItemId
      )
    ).toBe(true)
    expect(rendered.expenseReviewContent.innerHTML).toContain('Žádné výdaje ke kontrole.')
    expect(rendered.expenseUnmatchedDocumentsContent.innerHTML).toContain('Ručně zamítnuto')
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).toContain('Ručně zamítnuto')
    expect(rendered.expenseReviewContent.innerHTML).not.toContain('VS 141260183 Servis vozidla')

    const expenseReviewSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseNeedsReview')
    const expenseUnmatchedDocumentsSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedDocuments')
    const expenseUnmatchedOutflowsSummaryCount = extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedOutflows')

    expect(expenseReviewSummaryCount).toBe(rendered.expenseReviewContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(expenseUnmatchedDocumentsSummaryCount).toBe(rendered.expenseUnmatchedDocumentsContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(expenseUnmatchedOutflowsSummaryCount).toBe(rendered.expenseUnmatchedOutflowsContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)

    const reloaded = await rendered.reloadWithSameStorage()
    reloaded.openExpenseReviewPage()

    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<unknown>
        expenseUnmatchedDocuments: Array<{ id: string; manualDecision?: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ manualDecision?: string; manualSourceReviewItemId?: string }>
      }
    }

    expect(reloadedState.reviewSections.expenseNeedsReview).toHaveLength(0)
    expect(
      reloadedState.reviewSections.expenseUnmatchedDocuments.some((item) =>
        item.manualDecision === 'rejected'
        && item.manualSourceReviewItemId === reviewItemId
      )
    ).toBe(true)
    expect(
      reloadedState.reviewSections.expenseUnmatchedOutflows.some((item) =>
        item.manualDecision === 'rejected'
        && item.manualSourceReviewItemId === reviewItemId
      )
    ).toBe(true)

    const rejectedDocumentItemId = reloadedState.reviewSections.expenseUnmatchedDocuments.find((item) =>
      item.manualSourceReviewItemId === reviewItemId
    )?.id

    expect(rejectedDocumentItemId).toBeTruthy()

    reloaded.undoRejectedExpenseReviewItem(String(rejectedDocumentItemId))

    const undoneState = reloaded.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
        expenseUnmatchedDocuments: Array<{ manualSourceReviewItemId?: string }>
      }
    }

    expect(undoneState.reviewSections.expenseNeedsReview.map((item) => item.id)).toContain(String(reviewItemId))
    expect(
      undoneState.reviewSections.expenseUnmatchedDocuments.some((item) =>
        item.manualSourceReviewItemId === reviewItemId
      )
    ).toBe(false)
    expect(reloaded.expenseReviewContent.innerHTML).toContain('Potvrdit shodu')
  })

  it('restores the last used month workspace with persisted manual expense confirmation after reload', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-workspace-restore',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.openExpenseReviewPage()
    const stateBefore = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = stateBefore.reviewSections.expenseNeedsReview[0]?.id
    expect(reviewItemId).toBeTruthy()

    rendered.confirmExpenseReviewItem(String(reviewItemId))

    await rendered.awaitLastWorkspacePersistence()

    const restored = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:12:00.000Z',
      month: '',
      outputDirName: 'test-web-demo-month-workspace-restore-reload',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: []
    })

    expect(restored.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 5')
    expect(restored.expenseReviewSummaryContent.innerHTML).toContain('data-expense-bucket-key="expenseMatched"')
    restored.openExpenseReviewPage()

    const restoredState = restored.getLastVisibleRuntimeState() as {
      runId: string
      reviewSections: {
        expenseMatched: Array<{ id: string; manualDecision?: string; manualSourceReviewItemId?: string }>
        expenseNeedsReview: Array<unknown>
      }
    }

    expect(restoredState.runId).toContain('2026-03')
    expect(restoredState.reviewSections.expenseNeedsReview).toHaveLength(0)
    expect(
      restoredState.reviewSections.expenseMatched.some((item) =>
        item.manualDecision === 'confirmed'
        && item.manualSourceReviewItemId === reviewItemId
      )
    ).toBe(true)
    expect(restored.expenseMatchedContent.innerHTML).toContain('Ručně potvrzená shoda')
    expect(extractExpenseBucketCount(restored.expenseDetailSummaryContent.innerHTML, 'expenseMatched'))
      .toBe(restored.expenseMatchedContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(restored.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(restored.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('creates one manual match group from multiple same-month unmatched payout items and removes them from the unmatched bucket', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T13:00:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-create',
      locationSearch: '?debug=1',
      files: createManualMatchPayoutWorkflowFiles()
    })

    rendered.openControlDetailPage()

    const reservationsBefore = extractSummaryCount(rendered.controlDetailPageSummaryContent.innerHTML, 'Nespárované rezervace k úhradě')
    const stateBefore = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        payoutBatchUnmatched: Array<{ id: string; title: string }>
      }
    }

    expect(stateBefore.reviewSections.payoutBatchUnmatched).toHaveLength(2)

    for (const item of stateBefore.reviewSections.payoutBatchUnmatched) {
      rendered.selectManualMatchItem('control', 'payoutBatchUnmatched', item.id)
    }

    expect(rendered.controlManualMatchSummary.innerHTML).toContain('Vybráno položek:</strong> 2')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).toContain('Vybrat pro ruční spárování')

    rendered.openManualMatchConfirm('control')
    rendered.confirmManualMatchGroup('control', 'Ruční celek pro dva payouty')

    const stateAfter = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; note?: string | null; selectedReviewItemIds: string[] }>
      reviewSections: {
        payoutBatchUnmatched: Array<unknown>
      }
      reviewSummary: { unmatchedPayoutBatchCount: number }
    }

    expect(stateAfter.reviewSections.payoutBatchUnmatched).toHaveLength(0)
    expect(stateAfter.reviewSummary.unmatchedPayoutBatchCount).toBe(0)
    expect(stateAfter.manualMatchGroups).toHaveLength(1)
    expect(stateAfter.manualMatchGroups[0]?.selectedReviewItemIds).toHaveLength(2)
    expect(stateAfter.manualMatchGroups[0]?.note).toBe('Ruční celek pro dva payouty')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).toContain('Žádné položky v této sekci.')
    expect(rendered.controlManualMatchedContent.innerHTML).toContain('Ruční celek pro dva payouty')
    expect(rendered.controlManualMatchedContent.innerHTML).toContain(stateBefore.reviewSections.payoutBatchUnmatched[0]?.title)
    expect(rendered.controlManualMatchedContent.innerHTML).toContain(stateBefore.reviewSections.payoutBatchUnmatched[1]?.title)
    expect(extractSummaryCount(rendered.controlDetailPageSummaryContent.innerHTML, 'Nespárované rezervace k úhradě')).toBe(reservationsBefore)
    expect(rendered.buildFingerprint.innerHTML).toContain('Payout matched: <strong>16</strong>')
    expect(rendered.buildFingerprint.innerHTML).toContain('Payout unmatched: <strong>0</strong>')
  })

  it('keeps the manual match group after reload, isolates it by month, and deletes it on explicit month clear', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T13:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-reload-source',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: createManualMatchPayoutWorkflowFiles()
    })

    rendered.openControlDetailPage()
    const marchStateBefore = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        payoutBatchUnmatched: Array<{ id: string }>
      }
    }

    for (const item of marchStateBefore.reviewSections.payoutBatchUnmatched) {
      rendered.selectManualMatchItem('control', 'payoutBatchUnmatched', item.id)
    }
    rendered.openManualMatchConfirm('control')
    rendered.confirmManualMatchGroup('control', 'Persistovaná ruční group')
    await rendered.awaitLastWorkspacePersistence()

    const reloaded = await rendered.reloadWithSameStorage()
    reloaded.openControlDetailPage()

    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      runId: string
      manualMatchGroups: Array<{ id: string; note?: string | null }>
      reviewSections: {
        payoutBatchUnmatched: Array<unknown>
      }
    }

    expect(reloadedState.runId).toContain('2026-03')
    expect(reloadedState.reviewSections.payoutBatchUnmatched).toHaveLength(0)
    expect(reloadedState.manualMatchGroups).toHaveLength(1)
    expect(reloadedState.manualMatchGroups[0]?.note).toBe('Persistovaná ruční group')
    expect(reloaded.controlManualMatchedContent.innerHTML).toContain('Persistovaná ruční group')

    const april = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T13:11:00.000Z',
      month: '2026-04',
      outputDirName: 'test-web-demo-manual-match-month-isolation',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv')
      ]
    })

    april.openControlDetailPage()
    const aprilState = april.getLastVisibleRuntimeState() as {
      runId: string
      manualMatchGroups: Array<unknown>
    }

    expect(aprilState.runId).toContain('2026-04')
    expect(aprilState.manualMatchGroups).toEqual([])
    expect(april.controlManualMatchedContent.innerHTML).toContain('Zatím nebyla vytvořená žádná ruční match group pro tento měsíc.')

    await reloaded.clearCurrentMonthWorkspace()

    const reloadedAfterClear = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T13:12:00.000Z',
      month: '',
      outputDirName: 'test-web-demo-manual-match-reload-cleared',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: []
    })

    expect(reloadedAfterClear.getLastVisibleRuntimeState()).toMatchObject({ runId: expect.stringContaining('2026-04') })
    await reloadedAfterClear.changeMonth('2026-03')
    expect(reloadedAfterClear.controlManualMatchedContent.innerHTML).toContain('Po spuštění se zde objeví ruční match groups vytvořené z nespárovaných položek.')
  })

  it('undoes a manual match group and returns the items back into the original unmatched flow', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T13:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-undo',
      locationSearch: '?debug=1',
      files: createManualMatchPayoutWorkflowFiles()
    })

    rendered.openControlDetailPage()
    const stateBefore = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        payoutBatchUnmatched: Array<{ id: string; title: string }>
      }
    }

    for (const item of stateBefore.reviewSections.payoutBatchUnmatched) {
      rendered.selectManualMatchItem('control', 'payoutBatchUnmatched', item.id)
    }
    rendered.openManualMatchConfirm('control')
    rendered.confirmManualMatchGroup('control', 'Dočasná group')

    const createdState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string }>
      reviewSections: {
        payoutBatchUnmatched: Array<unknown>
      }
    }

    const groupId = createdState.manualMatchGroups[0]?.id
    expect(groupId).toBeTruthy()
    expect(createdState.reviewSections.payoutBatchUnmatched).toHaveLength(0)

    rendered.removeManualMatchGroup('control', String(groupId))

    const restoredState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<unknown>
      reviewSections: {
        payoutBatchUnmatched: Array<{ title: string }>
      }
    }

    expect(restoredState.manualMatchGroups).toEqual([])
    expect(restoredState.reviewSections.payoutBatchUnmatched).toHaveLength(2)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).toContain(stateBefore.reviewSections.payoutBatchUnmatched[0]?.title)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).toContain(stateBefore.reviewSections.payoutBatchUnmatched[1]?.title)
  })

  it('keeps same-month additive uploads from destroying an existing manual match group', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T13:30:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-additive-source',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: createManualMatchPayoutWorkflowFiles()
    })

    rendered.openControlDetailPage()
    const stateBefore = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        payoutBatchUnmatched: Array<{ id: string }>
      }
    }

    for (const item of stateBefore.reviewSections.payoutBatchUnmatched) {
      rendered.selectManualMatchItem('control', 'payoutBatchUnmatched', item.id)
    }
    rendered.openManualMatchConfirm('control')
    rendered.confirmManualMatchGroup('control', 'Přetrvá i po additive uploadu')
    await rendered.awaitLastWorkspacePersistence()

    const additive = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T13:31:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-additive-next',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    additive.openControlDetailPage()
    const additiveState = additive.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
      manualMatchGroups: Array<{ note?: string | null }>
      reviewSections: {
        payoutBatchUnmatched: Array<unknown>
      }
    }

    expect(additiveState.fileRoutes).toHaveLength(5)
    expect(additiveState.manualMatchGroups).toHaveLength(1)
    expect(additiveState.manualMatchGroups[0]?.note).toBe('Přetrvá i po additive uploadu')
    expect(additiveState.reviewSections.payoutBatchUnmatched).toHaveLength(0)
    expect(additive.controlManualMatchedContent.innerHTML).toContain('Přetrvá i po additive uploadu')
    expect(additive.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 5')
  })

  it('creates a manual group from an invoice and first payment, then extends it with a second payment in the same month', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T19:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-expense-extend',
      locationSearch: '?debug=1',
      files: createManualMatchExpenseWorkflowFiles()
    })

    rendered.openExpenseReviewPage()
    const stateBefore = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = stateBefore.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()
    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const rejectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string; title: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ id: string; title: string; manualSourceReviewItemId?: string }>
      }
    }

    expect(rejectedState.reviewSections.expenseUnmatchedDocuments.length).toBeGreaterThanOrEqual(1)
    expect(rejectedState.reviewSections.expenseUnmatchedOutflows.length).toBeGreaterThanOrEqual(2)

    const documentItem = rejectedState.reviewSections.expenseUnmatchedDocuments.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const firstOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const secondOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.id !== firstOutflow.id)!

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedDocuments', documentItem.id)
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', firstOutflow.id)
    rendered.openManualMatchConfirm('expense')
    rendered.confirmManualMatchGroup('expense', 'Faktura + první platba')

    const createdState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[] }>
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string }>
        expenseUnmatchedOutflows: Array<{ id: string }>
      }
    }

    const groupId = createdState.manualMatchGroups[0]?.id
    expect(groupId).toBeTruthy()
    expect(createdState.manualMatchGroups[0]?.selectedReviewItemIds).toEqual([documentItem.id, firstOutflow.id])
    expect(createdState.reviewSections.expenseUnmatchedDocuments.some((item) => item.id === documentItem.id)).toBe(false)
    expect(createdState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === firstOutflow.id)).toBe(false)
    expect(createdState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === secondOutflow.id)).toBe(true)

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', secondOutflow.id)
    expect(rendered.expenseManualMatchedContent.innerHTML).toContain('Přidat vybrané do této skupiny')
    rendered.addSelectedToManualMatchGroup('expense', String(groupId))

    const extendedState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[]; updatedAt?: string }>
      reviewSections: {
        expenseUnmatchedOutflows: Array<{ id: string }>
      }
    }

    expect(extendedState.manualMatchGroups).toHaveLength(1)
    expect(extendedState.manualMatchGroups[0]?.selectedReviewItemIds).toEqual([documentItem.id, firstOutflow.id, secondOutflow.id])
    expect(extendedState.manualMatchGroups[0]?.updatedAt).toBeTruthy()
    expect(extendedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === secondOutflow.id)).toBe(false)
    expect(rendered.expenseManualMatchedContent.innerHTML).toContain(documentItem.title)
    expect(rendered.expenseManualMatchedContent.innerHTML).toContain(firstOutflow.title)
    expect(rendered.expenseManualMatchedContent.innerHTML).toContain(secondOutflow.title)
  })

  it('keeps an extended manual group after reload and isolates it from another month', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T19:30:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-expense-extend-reload-source',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: createManualMatchExpenseWorkflowFiles()
    })

    rendered.openExpenseReviewPage()
    const sourceState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = sourceState.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()
    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const rejectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ id: string; manualSourceReviewItemId?: string }>
      }
    }
    const documentItem = rejectedState.reviewSections.expenseUnmatchedDocuments.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const firstOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const secondOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.id !== firstOutflow.id)!

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedDocuments', documentItem.id)
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', firstOutflow.id)
    rendered.openManualMatchConfirm('expense')
    rendered.confirmManualMatchGroup('expense', 'Reload extend group')

    let groupId = (rendered.getLastVisibleRuntimeState() as { manualMatchGroups: Array<{ id: string }> }).manualMatchGroups[0]!.id
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', secondOutflow.id)
    rendered.addSelectedToManualMatchGroup('expense', groupId)
    await rendered.awaitLastWorkspacePersistence()

    const reloaded = await rendered.reloadWithSameStorage()
    reloaded.openExpenseReviewPage()
    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      runId: string
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[] }>
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string }>
        expenseUnmatchedOutflows: Array<{ id: string }>
      }
    }

    expect(reloadedState.runId).toContain('2026-03')
    expect(reloadedState.manualMatchGroups).toHaveLength(1)
    expect(reloadedState.manualMatchGroups[0]?.selectedReviewItemIds).toHaveLength(3)
    expect(reloadedState.reviewSections.expenseUnmatchedDocuments.some((item) => item.id === documentItem.id)).toBe(false)
    expect(reloadedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === firstOutflow.id)).toBe(false)
    expect(reloadedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === secondOutflow.id)).toBe(false)

    const april = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T19:31:00.000Z',
      month: '2026-04',
      outputDirName: 'test-web-demo-manual-match-expense-extend-month-isolation',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv')
      ]
    })

    april.openExpenseReviewPage()
    const aprilState = april.getLastVisibleRuntimeState() as {
      runId: string
      manualMatchGroups: Array<unknown>
    }

    expect(aprilState.runId).toContain('2026-04')
    expect(aprilState.manualMatchGroups).toEqual([])
  })

  it('keeps a remaining outflow selectable after reload when one manual group already exists', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T19:35:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-expense-remaining-outflow-reload',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: createManualMatchExpenseWorkflowFiles()
    })

    rendered.openExpenseReviewPage()
    const sourceState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = sourceState.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()
    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const rejectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ id: string; title: string; manualSourceReviewItemId?: string }>
      }
    }
    const documentItem = rejectedState.reviewSections.expenseUnmatchedDocuments.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const firstOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const secondOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.id !== firstOutflow.id)!

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedDocuments', documentItem.id)
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', firstOutflow.id)
    rendered.openManualMatchConfirm('expense')
    rendered.confirmManualMatchGroup('expense', 'Reload remaining outflow')
    await rendered.awaitLastWorkspacePersistence()

    const reloaded = await rendered.reloadWithSameStorage()
    reloaded.openExpenseReviewPage()

    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[] }>
      reviewSections: {
        expenseUnmatchedOutflows: Array<{ id: string }>
      }
    }

    const groupId = reloadedState.manualMatchGroups[0]?.id
    expect(groupId).toBeTruthy()
    expect(reloadedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === secondOutflow.id)).toBe(true)

    reloaded.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', secondOutflow.id)
    expect(reloaded.expenseManualMatchSummary.innerHTML).toContain('Vybráno položek:</strong> 1')
    expect(reloaded.expenseManualMatchedContent.innerHTML).toContain('Přidat vybrané do této skupiny')

    reloaded.addSelectedToManualMatchGroup('expense', String(groupId))

    const extendedState = reloaded.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ selectedReviewItemIds: string[] }>
      reviewSections: {
        expenseUnmatchedOutflows: Array<{ id: string }>
      }
    }

    expect(extendedState.manualMatchGroups[0]?.selectedReviewItemIds).toEqual([documentItem.id, firstOutflow.id, secondOutflow.id])
    expect(extendedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === secondOutflow.id)).toBe(false)
  })

  it('keeps a valid 40 000 Kc outflow selectable when another manual group already exists', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-02T08:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-expense-40k-selectable',
      locationSearch: '?debug=1',
      files: createManualMatchExpenseWorkflowFilesWithFortyThousandOutflow()
    })

    rendered.openExpenseReviewPage()
    const sourceState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = sourceState.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()
    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const rejectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ id: string; title: string; manualSourceReviewItemId?: string }>
      }
    }
    const documentItem = rejectedState.reviewSections.expenseUnmatchedDocuments.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const groupedOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const fortyThousandOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.title.includes('40 000,00'))!
    const fortyThousandSelectionId = buildManualMatchSelectionElementId('expense', 'expenseUnmatchedOutflows', fortyThousandOutflow.id)

    expect(fortyThousandOutflow.id.startsWith('expense-unmatched-outflow:')).toBe(true)
    expect(rejectedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === fortyThousandOutflow.id)).toBe(true)
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).toContain(fortyThousandSelectionId)
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).not.toMatch(new RegExp(`<input id="${fortyThousandSelectionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*disabled`))

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedDocuments', documentItem.id)
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', groupedOutflow.id)
    rendered.openManualMatchConfirm('expense')
    rendered.confirmManualMatchGroup('expense', '40k truth base group')

    const createdState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ selectedReviewItemIds: string[] }>
      reviewSections: {
        expenseUnmatchedOutflows: Array<{ id: string; title: string }>
      }
    }

    expect(createdState.manualMatchGroups[0]?.selectedReviewItemIds).toEqual([documentItem.id, groupedOutflow.id])
    expect(createdState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === fortyThousandOutflow.id)).toBe(true)
    expect(createdState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === groupedOutflow.id)).toBe(false)
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).toContain(fortyThousandSelectionId)

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', fortyThousandOutflow.id)
    expect(rendered.expenseManualMatchSummary.innerHTML).toContain('Vybráno položek:</strong> 1')

    const selectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedOutflows: Array<{ id: string }>
      }
    }

    expect(selectedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === fortyThousandOutflow.id)).toBe(true)
  })

  it('keeps the valid 40 000 Kc outflow selectable after reload until it is truly grouped', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-02T08:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-expense-40k-selectable-reload',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: createManualMatchExpenseWorkflowFilesWithFortyThousandOutflow()
    })

    rendered.openExpenseReviewPage()
    const sourceState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = sourceState.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()
    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const rejectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ id: string; title: string; manualSourceReviewItemId?: string }>
      }
    }
    const documentItem = rejectedState.reviewSections.expenseUnmatchedDocuments.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const groupedOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const fortyThousandOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.title.includes('40 000,00'))!
    const fortyThousandSelectionId = buildManualMatchSelectionElementId('expense', 'expenseUnmatchedOutflows', fortyThousandOutflow.id)

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedDocuments', documentItem.id)
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', groupedOutflow.id)
    rendered.openManualMatchConfirm('expense')
    rendered.confirmManualMatchGroup('expense', '40k reload base group')
    await rendered.awaitLastWorkspacePersistence()

    const reloaded = await rendered.reloadWithSameStorage()
    reloaded.openExpenseReviewPage()

    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ selectedReviewItemIds: string[] }>
      reviewSections: {
        expenseUnmatchedOutflows: Array<{ id: string; title: string }>
      }
    }

    expect(reloadedState.manualMatchGroups[0]?.selectedReviewItemIds).toEqual([documentItem.id, groupedOutflow.id])
    expect(reloadedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === fortyThousandOutflow.id)).toBe(true)
    expect(reloaded.expenseUnmatchedOutflowsContent.innerHTML).toContain(fortyThousandSelectionId)

    reloaded.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', fortyThousandOutflow.id)
    expect(reloaded.expenseManualMatchSummary.innerHTML).toContain('Vybráno položek:</strong> 1')
  })

  it('does not keep a truly grouped outflow selectable while leaving the 40 000 Kc outflow available', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-02T08:30:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-expense-40k-grouped-guard',
      locationSearch: '?debug=1',
      files: createManualMatchExpenseWorkflowFilesWithFortyThousandOutflow()
    })

    rendered.openExpenseReviewPage()
    const sourceState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = sourceState.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()
    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const rejectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ id: string; title: string; manualSourceReviewItemId?: string }>
      }
    }
    const documentItem = rejectedState.reviewSections.expenseUnmatchedDocuments.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const groupedOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const fortyThousandOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.title.includes('40 000,00'))!
    const groupedSelectionId = buildManualMatchSelectionElementId('expense', 'expenseUnmatchedOutflows', groupedOutflow.id)
    const fortyThousandSelectionId = buildManualMatchSelectionElementId('expense', 'expenseUnmatchedOutflows', fortyThousandOutflow.id)

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedDocuments', documentItem.id)
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', groupedOutflow.id)
    rendered.openManualMatchConfirm('expense')
    rendered.confirmManualMatchGroup('expense', '40k grouped guard base group')

    const groupedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedOutflows: Array<{ id: string }>
      }
    }

    expect(groupedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === groupedOutflow.id)).toBe(false)
    expect(groupedState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === fortyThousandOutflow.id)).toBe(true)
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).not.toContain(groupedSelectionId)
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).toContain(fortyThousandSelectionId)
  })

  it('deduplicates re-adding the same item and blocks extending a group with an item already assigned to another group', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T19:40:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-extend-guards',
      locationSearch: '?debug=1',
      files: createManualMatchExpenseWorkflowFiles()
    })

    rendered.openExpenseReviewPage()
    const expenseState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = expenseState.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()
    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const rejectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ id: string; manualSourceReviewItemId?: string }>
      }
    }

    const documentId = rejectedState.reviewSections.expenseUnmatchedDocuments.find((item) => item.manualSourceReviewItemId === reviewItemId)!.id
    const firstOutflowId = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.manualSourceReviewItemId === reviewItemId)!.id
    const secondOutflowId = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.id !== firstOutflowId)!.id

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedDocuments', documentId)
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', firstOutflowId)
    rendered.openManualMatchConfirm('expense')
    rendered.confirmManualMatchGroup('expense', 'Guard target group')
    let guardState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[] }>
    }
    const firstGroupId = guardState.manualMatchGroups[0]!.id

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', secondOutflowId)
    rendered.addSelectedToManualMatchGroup('expense', firstGroupId)
    guardState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[] }>
    }
    expect(guardState.manualMatchGroups[0]?.selectedReviewItemIds).toEqual([documentId, firstOutflowId, secondOutflowId])

    rendered.forceManualMatchSelection([secondOutflowId])
    rendered.debugExtendManualMatchGroup(firstGroupId)
    guardState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[] }>
    }
    expect(guardState.manualMatchGroups[0]?.selectedReviewItemIds).toEqual([documentId, firstOutflowId, secondOutflowId])

    rendered.openControlDetailPage()
    const controlState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        payoutBatchUnmatched: Array<{ id: string }>
      }
    }
    expect(controlState.reviewSections.payoutBatchUnmatched.length).toBeGreaterThanOrEqual(2)
    const groupTwoItemIds = controlState.reviewSections.payoutBatchUnmatched.slice(0, 2).map((item) => item.id)
    rendered.selectManualMatchItem('control', 'payoutBatchUnmatched', groupTwoItemIds[0]!)
    rendered.selectManualMatchItem('control', 'payoutBatchUnmatched', groupTwoItemIds[1]!)
    rendered.openManualMatchConfirm('control')
    rendered.confirmManualMatchGroup('control', 'Jiná ruční group')

    const twoGroupState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[] }>
    }
    expect(twoGroupState.manualMatchGroups).toHaveLength(2)
    const secondGroupId = twoGroupState.manualMatchGroups[1]!.id

    rendered.forceManualMatchSelection([groupTwoItemIds[0]!])
    rendered.debugExtendManualMatchGroup(firstGroupId)

    const blockedState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<{ id: string; selectedReviewItemIds: string[] }>
    }
    const blockedFirstGroup = blockedState.manualMatchGroups.find((group) => group.id === firstGroupId)
    const blockedSecondGroup = blockedState.manualMatchGroups.find((group) => group.id === secondGroupId)

    expect(blockedFirstGroup?.selectedReviewItemIds).toEqual([documentId, firstOutflowId, secondOutflowId])
    expect(blockedSecondGroup?.selectedReviewItemIds).toEqual(groupTwoItemIds)
  })

  it('undoes an extended manual group and returns all grouped items to unmatched buckets', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T19:50:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-manual-match-extend-undo',
      locationSearch: '?debug=1',
      files: createManualMatchExpenseWorkflowFiles()
    })

    rendered.openExpenseReviewPage()
    const beforeState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = beforeState.reviewSections.expenseNeedsReview[0]?.id

    expect(reviewItemId).toBeTruthy()
    rendered.rejectExpenseReviewItem(String(reviewItemId))

    const rejectedState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string; title: string; manualSourceReviewItemId?: string }>
        expenseUnmatchedOutflows: Array<{ id: string; title: string; manualSourceReviewItemId?: string }>
      }
    }

    const documentItem = rejectedState.reviewSections.expenseUnmatchedDocuments.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const firstOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.manualSourceReviewItemId === reviewItemId)!
    const secondOutflow = rejectedState.reviewSections.expenseUnmatchedOutflows.find((item) => item.id !== firstOutflow.id)!

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedDocuments', documentItem.id)
    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', firstOutflow.id)
    rendered.openManualMatchConfirm('expense')
    rendered.confirmManualMatchGroup('expense', 'Undo extended group')
    const groupId = (rendered.getLastVisibleRuntimeState() as { manualMatchGroups: Array<{ id: string }> }).manualMatchGroups[0]!.id

    rendered.selectManualMatchItem('expense', 'expenseUnmatchedOutflows', secondOutflow.id)
    rendered.addSelectedToManualMatchGroup('expense', groupId)
    rendered.removeManualMatchGroup('expense', groupId)

    const undoneState = rendered.getLastVisibleRuntimeState() as {
      manualMatchGroups: Array<unknown>
      reviewSections: {
        expenseUnmatchedDocuments: Array<{ id: string }>
        expenseUnmatchedOutflows: Array<{ id: string }>
      }
    }

    expect(undoneState.manualMatchGroups).toEqual([])
    expect(undoneState.reviewSections.expenseUnmatchedDocuments.some((item) => item.id === documentItem.id)).toBe(true)
    expect(undoneState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === firstOutflow.id)).toBe(true)
    expect(undoneState.reviewSections.expenseUnmatchedOutflows.some((item) => item.id === secondOutflow.id)).toBe(true)
  })

  it('appends uploads within the same month, deduplicates exact re-uploads, isolates months, and clears only the selected month workspace', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const monthAFirst = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-workspace-append-a1',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    const firstState = monthAFirst.getLastVisibleRuntimeState() as { fileRoutes: Array<unknown> }
    expect(firstState.fileRoutes).toHaveLength(2)

    const monthASecond = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:21:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-workspace-append-a2',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        )
      ]
    })

    const secondState = monthASecond.getLastVisibleRuntimeState() as { fileRoutes: Array<{ fileName: string }> }
    expect(secondState.fileRoutes).toHaveLength(3)
    expect(secondState.fileRoutes.map((item) => item.fileName)).toEqual([
      'booking35k.csv',
      'Bookinng35k.pdf',
      'Pohyby_5599955956_202603191023.csv'
    ])

    const monthB = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:22:00.000Z',
      month: '2026-04',
      outputDirName: 'test-web-demo-month-workspace-append-b',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv')
      ]
    })

    const monthBState = monthB.getLastVisibleRuntimeState() as { fileRoutes: Array<{ fileName: string }>; runId: string }
    expect(monthBState.runId).toContain('2026-04')
    expect(monthBState.fileRoutes).toHaveLength(1)

    await monthB.changeMonth('2026-03')
    const switchedBackState = monthB.getLastVisibleRuntimeState() as { fileRoutes: Array<{ fileName: string }>; runId: string }
    expect(switchedBackState.runId).toContain('2026-03')
    expect(switchedBackState.fileRoutes).toHaveLength(3)

    await monthB.clearCurrentMonthWorkspace()
    expect(monthB.preparedFilesContent.innerHTML).not.toContain('Rozpoznáno souborů: 3')

    await monthB.changeMonth('2026-04')
    const monthBAfterClear = monthB.getLastVisibleRuntimeState() as { fileRoutes: Array<{ fileName: string }>; runId: string }
    expect(monthBAfterClear.runId).toContain('2026-04')
    expect(monthBAfterClear.fileRoutes).toHaveLength(1)

    const reloaded = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:23:00.000Z',
      month: '',
      outputDirName: 'test-web-demo-month-workspace-append-reload',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: []
    })
    const reloadedState = reloaded.getLastVisibleRuntimeState() as { runId: string; fileRoutes: Array<{ fileName: string }> }
    expect(reloadedState.runId).toContain('2026-04')
    expect(reloadedState.fileRoutes).toHaveLength(1)
  })

  it('keeps a generic Previo workbook upload classified as reservation source input across month workspace reload', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T18:05:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-previo-workbook-reload-source',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeWorkbookFile('reservations-export-2026-03.xlsx', buildPrevioBrowserShapeWorkbookBase64())
      ]
    })

    const initialState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string; sourceSystem: string; status: string; intakeStatus: string }>
      preparedFiles: Array<{ fileName: string; sourceSystem: string; documentType: string }>
      extractedRecords: Array<{ extractedCount: number }>
      reviewSections: {
        reservationSettlementOverview: unknown[]
        ancillarySettlementOverview: unknown[]
        unmatchedReservationSettlements: unknown[]
      }
    }

    expect(initialState.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'reservations-export-2026-03.xlsx',
        sourceSystem: 'previo',
        status: 'supported',
        intakeStatus: 'parsed'
      })
    ])
    expect(initialState.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'reservations-export-2026-03.xlsx',
        sourceSystem: 'previo',
        documentType: 'reservation_export'
      })
    ])
    expect(initialState.extractedRecords).toEqual([
      expect.objectContaining({
        extractedCount: 1
      })
    ])
    expect(initialState.reviewSections.reservationSettlementOverview).toEqual([])
    expect(initialState.reviewSections.ancillarySettlementOverview).toEqual([])
    expect(initialState.reviewSections.unmatchedReservationSettlements).toEqual([])
    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 1 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>reservations-export-2026-03.xlsx</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('Previo rezervační export')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('Soubor se nepodařilo jednoznačně přiřadit k podporovanému měsíčnímu zdroji.')

    const reloaded = await rendered.reloadWithSameStorage()
    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      runId: string
      fileRoutes: Array<{ fileName: string; sourceSystem: string; status: string; intakeStatus: string }>
      preparedFiles: Array<{ fileName: string; sourceSystem: string; documentType: string }>
      reviewSections: {
        reservationSettlementOverview: unknown[]
        ancillarySettlementOverview: unknown[]
        unmatchedReservationSettlements: unknown[]
      }
    }

    expect(reloadedState.runId).toContain('2026-03')
    expect(reloadedState.fileRoutes).toEqual([
      expect.objectContaining({
        fileName: 'reservations-export-2026-03.xlsx',
        sourceSystem: 'previo',
        status: 'supported',
        intakeStatus: 'parsed'
      })
    ])
    expect(reloadedState.preparedFiles).toEqual([
      expect.objectContaining({
        fileName: 'reservations-export-2026-03.xlsx',
        sourceSystem: 'previo',
        documentType: 'reservation_export'
      })
    ])
    expect(reloadedState.reviewSections.reservationSettlementOverview).toEqual([])
    expect(reloadedState.reviewSections.ancillarySettlementOverview).toEqual([])
    expect(reloadedState.reviewSections.unmatchedReservationSettlements).toEqual([])
    expect(reloaded.preparedFilesContent.innerHTML).toContain('<strong>reservations-export-2026-03.xlsx</strong>')
    expect(reloaded.preparedFilesContent.innerHTML).toContain('Previo rezervační export')
  })

  it('keeps previously uploaded files visible and reruns the same month on the merged file set when RB is added later', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-30T19:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-same-month-additive-initial',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    const additive = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-30T19:11:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-same-month-additive-second',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: [
        createDelayedWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          5,
          'text/csv'
        )
      ]
    })

    additive.startWorkflow()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(additive.preparedFilesContent.innerHTML).toContain('<strong>booking35k.csv</strong>')
    expect(additive.preparedFilesContent.innerHTML).toContain('<strong>airbnb.csv</strong>')
    expect(additive.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(additive.preparedFilesContent.innerHTML).toContain('<strong>Pohyby_5599955956_202603191023.csv</strong>')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Current month key:</strong> 2026-03')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Persisted workspace file count before rerun:</strong> 3')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Newly selected batch file count:</strong> 1')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Merged file count used for rerun:</strong> 4')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Visible trace file count:</strong> 4')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Render source:</strong> mergedWorkspace')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Workspace storage backend:</strong> indexedDb')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Storage key used for month workspace load/save:</strong> indexeddb://hotel-finance-control/monthly-browser-workspaces/2026-03')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Save happened before rerun input assembly:</strong> yes')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Merged file sample:</strong> booking35k.csv, airbnb.csv, Bookinng35k.pdf, Pohyby_5599955956_202603191023.csv')

    await additive.waitForWorkflowCompletion()

    const additiveState = additive.getLastVisibleRuntimeState() as {
      runId: string
      fileRoutes: Array<{ fileName: string }>
      extractedRecords: Array<{ accountLabelCs?: string }>
      reviewSummary: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number }
    }

    expect(additiveState.runId).toContain('2026-03')
    expect(additiveState.fileRoutes.map((item) => item.fileName)).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Bookinng35k.pdf',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(additiveState.extractedRecords).toHaveLength(4)
    expect(additive.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(additive.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(additive.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
    expect(additiveState.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(additiveState.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Persisted workspace file count before rerun:</strong> 3')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Merged file count used for rerun:</strong> 4')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Visible trace file count:</strong> 4')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Render source:</strong> mergedWorkspace')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Workspace storage backend:</strong> indexedDb')
    expect(additive.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Last save status:</strong> saved')

    const additiveWorkspaceDebug = additive.getLastWorkspaceRenderDebug() as {
      requestToken: number
      restoreToken: number
      restoreSource: string
      currentMonthKey: string
      selectedFileNames: string[]
      persistedWorkspaceFileCountBeforeRerun: number
      persistedWorkspaceFileNamesBeforeRerun: string[]
      selectedBatchFileCount: number
      mergedFileCountUsedForRerun: number
      mergedFileNamesUsedForRerun: string[]
      visibleTraceFileCount: number
      visibleTraceFileNamesAfterRender: string[]
      renderSource: string
      workspacePersistenceBackend: string
      storageKeyUsed: string
      saveCompletedBeforeRerunInputAssembly: string
      lastSaveStatus: string
      mergedFileSample: string[]
      checkpointLog: unknown[]
    }

    expect(additiveWorkspaceDebug.requestToken).toBe(2)
    expect(additiveWorkspaceDebug.restoreToken).toBe(1)
    expect(additiveWorkspaceDebug.restoreSource).toBe('persisted-workspace')
    expect(additiveWorkspaceDebug.currentMonthKey).toBe('2026-03')
    expect(additiveWorkspaceDebug.selectedFileNames).toEqual(['Pohyby_5599955956_202603191023.csv'])
    expect(additiveWorkspaceDebug.persistedWorkspaceFileCountBeforeRerun).toBe(3)
    expect(additiveWorkspaceDebug.persistedWorkspaceFileNamesBeforeRerun).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Bookinng35k.pdf'
    ])
    expect(additiveWorkspaceDebug.selectedBatchFileCount).toBe(1)
    expect(additiveWorkspaceDebug.mergedFileCountUsedForRerun).toBe(4)
    expect(additiveWorkspaceDebug.mergedFileNamesUsedForRerun).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Bookinng35k.pdf',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(additiveWorkspaceDebug.visibleTraceFileCount).toBe(4)
    expect(additiveWorkspaceDebug.visibleTraceFileNamesAfterRender).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Bookinng35k.pdf',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(additiveWorkspaceDebug.renderSource).toBe('mergedWorkspace')
    expect(additiveWorkspaceDebug.workspacePersistenceBackend).toBe('indexedDb')
    expect(additiveWorkspaceDebug.storageKeyUsed).toBe('indexeddb://hotel-finance-control/monthly-browser-workspaces/2026-03')
    expect(additiveWorkspaceDebug.saveCompletedBeforeRerunInputAssembly).toBe('yes')
    expect(additiveWorkspaceDebug.lastSaveStatus).toBe('saved')
    expect(additiveWorkspaceDebug.mergedFileSample).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Bookinng35k.pdf',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(Array.isArray(additiveWorkspaceDebug.checkpointLog)).toBe(true)

    const duplicateReupload = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-30T19:12:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-same-month-additive-duplicate',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        )
      ]
    })

    const duplicateState = duplicateReupload.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
      reviewSummary: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number }
    }
    expect(duplicateState.fileRoutes).toHaveLength(4)
    expect(duplicateState.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(duplicateState.reviewSummary.unmatchedPayoutBatchCount).toBe(2)

    const reloaded = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-30T19:13:00.000Z',
      month: '',
      outputDirName: 'test-web-demo-same-month-additive-reload',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: []
    })
    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      runId: string
      fileRoutes: Array<{ fileName: string }>
      reviewSummary: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number }
    }
    expect(reloadedState.runId).toContain('2026-03')
    expect(reloadedState.fileRoutes).toHaveLength(4)
    expect(reloadedState.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(reloadedState.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(reloaded.preparedFilesContent.innerHTML).toContain('<strong>booking35k.csv</strong>')
    expect(reloaded.preparedFilesContent.innerHTML).toContain('<strong>airbnb.csv</strong>')
    expect(reloaded.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(reloaded.preparedFilesContent.innerHTML).toContain('<strong>Pohyby_5599955956_202603191023.csv</strong>')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Persisted workspace file count before rerun:</strong> 4')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Newly selected batch file count:</strong> 0')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Merged file count used for rerun:</strong> 4')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Visible trace file count:</strong> 4')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Render source:</strong> persistedWorkspace')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Workspace storage backend:</strong> indexedDb')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Storage key used for month workspace load/save:</strong> indexeddb://hotel-finance-control/monthly-browser-workspaces/2026-03')
  }, 15000)

  it('keeps same-month merged reruns and reload restore working even when localStorage cannot hold full workspace payloads', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T08:00:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-same-month-indexeddb-fallback-initial',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      localStorageSetItemLimitBytes: 220,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    expect(workspacePersistenceState.has('2026-03')).toBe(true)
    expect(storageState.get('hotel-finance-control:monthly-browser-workspaces:v1')).toContain('"workspaceMonths":["2026-03"]')
    expect(storageState.get('hotel-finance-control:monthly-browser-workspaces:v1')).not.toContain('Bookinng35k.pdf')

    rendered.setSelectedFiles([
      createDelayedWebDemoRuntimeArrayBufferTextFile(
        'Pohyby_5599955956_202603191023.csv',
        buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
        5,
        'text/csv'
      )
    ])
    rendered.startWorkflow()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Persisted workspace file count before rerun:</strong> 3')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Newly selected batch file count:</strong> 1')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Merged file count used for rerun:</strong> 4')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Render source:</strong> mergedWorkspace')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Workspace storage backend:</strong> indexedDb')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Save happened before rerun input assembly:</strong> yes')

    await rendered.waitForWorkflowCompletion()

    const rerunState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
      reviewSummary: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number }
    }

    expect(rerunState.fileRoutes.map((item) => item.fileName)).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Bookinng35k.pdf',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(rerunState.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(rerunState.reviewSummary.unmatchedPayoutBatchCount).toBe(2)

    rendered.setSelectedFiles([
      createWebDemoRuntimeArrayBufferTextFile(
        'Pohyby_5599955956_202603191023.csv',
        buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
        'text/csv'
      )
    ])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    const dedupedState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
      reviewSummary: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number }
    }

    expect(dedupedState.fileRoutes).toHaveLength(4)
    expect(dedupedState.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(dedupedState.reviewSummary.unmatchedPayoutBatchCount).toBe(2)

    const reloaded = await rendered.reloadWithSameStorage()
    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
      reviewSummary: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number }
    }

    expect(reloadedState.fileRoutes).toHaveLength(4)
    expect(reloadedState.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(reloadedState.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Render source:</strong> persistedWorkspace')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Workspace storage backend:</strong> indexedDb')
  }, 15000)

  it('shows that the exact A-then-B same-month boundary keeps A in persisted read, merge input, and final visible state', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const fileA = createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv')
    const fileB = createWebDemoRuntimeArrayBufferTextFile(
      'Pohyby_5599955956_202603191023.csv',
      buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
      'text/csv'
    )

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T10:00:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-exact-boundary-a-then-b',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [fileA]
    })

    await rendered.awaitLastWorkspacePersistence()

    const persistedWorkspaceAfterRun1 = JSON.parse(String(workspacePersistenceState.get('2026-03') || '{}')) as {
      files?: Array<{ fileName?: string }>
    }

    expect((persistedWorkspaceAfterRun1.files || []).map((item) => item.fileName)).toEqual(['booking35k.csv'])

    rendered.setSelectedFiles([fileB])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    const debugState = rendered.getLastWorkspaceRenderDebug() as {
      checkpointLog: Array<{
        phase: string
        requestToken: number
        selectedFileNames: string[]
        persistedWorkspaceFileNamesBeforeRerun: string[]
        mergedFileNamesUsedForRerun: string[]
        visibleTraceFileNamesAfterRender: string[]
      }>
    }
    const rerunRequestToken = Math.max(...debugState.checkpointLog.map((entry) => entry.requestToken || 0))
    const rerunCheckpoints = debugState.checkpointLog.filter((entry) => entry.requestToken === rerunRequestToken)

    const checkpointBeforeMerge = rerunCheckpoints.find((entry) => entry.phase === 'before-merge')
    const checkpointAfterMerge = rerunCheckpoints.find((entry) => entry.phase === 'after-merge')
    const checkpointAfterRender = rerunCheckpoints.find((entry) => entry.phase === 'after-render')

    expect(checkpointBeforeMerge).toBeTruthy()
    expect(checkpointAfterMerge).toBeTruthy()
    expect(checkpointAfterRender).toBeTruthy()
    expect(checkpointBeforeMerge?.selectedFileNames).toEqual(['Pohyby_5599955956_202603191023.csv'])
    expect(checkpointBeforeMerge?.persistedWorkspaceFileNamesBeforeRerun).toEqual(['booking35k.csv'])
    expect(checkpointBeforeMerge?.mergedFileNamesUsedForRerun).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(checkpointAfterMerge?.mergedFileNamesUsedForRerun).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])

    const firstCheckpointLosingA = rerunCheckpoints.find((entry) => {
      const relevantNames = entry.phase === 'after-render' || entry.phase === 'after-render-overwrite'
        ? entry.visibleTraceFileNamesAfterRender
        : entry.phase === 'before-merge'
          ? entry.persistedWorkspaceFileNamesBeforeRerun.concat(entry.mergedFileNamesUsedForRerun)
          : entry.mergedFileNamesUsedForRerun

      return relevantNames.length > 0 && !relevantNames.includes('booking35k.csv')
    })

    if (firstCheckpointLosingA) {
      throw new Error('File A lost at checkpoint: ' + firstCheckpointLosingA.phase)
    }

    const finalVisibleState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
    }

    expect(finalVisibleState.fileRoutes.map((item) => item.fileName)).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(checkpointAfterRender?.visibleTraceFileNamesAfterRender).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Request/run token:</strong>')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Selected file names:</strong> Pohyby_5599955956_202603191023.csv')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Persisted workspace file names before rerun:</strong> booking35k.csv')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Merged file names used for rerun:</strong> booking35k.csv, Pohyby_5599955956_202603191023.csv')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Visible trace file names after render:</strong> booking35k.csv, Pohyby_5599955956_202603191023.csv')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Render source marker:</strong> persisted + selected merge')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Checkpoint:</strong> before-merge')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Checkpoint:</strong> after-merge')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Checkpoint:</strong> after-render')
  })

  function createSelectedFilesRegressionFileA() {
    return createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv')
  }

  function createSelectedFilesRegressionFileB() {
    return createWebDemoRuntimeArrayBufferTextFile(
      'Pohyby_5599955956_202603191023.csv',
      buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
      'text/csv'
    )
  }

  it('keeps the pending browser list as A + B when B is selected before the run starts', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T11:00:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-selection-only-a-then-b',
      locationSearch: '?debug=1',
      skipStart: true,
      files: []
    })

    rendered.selectFiles([
      createSelectedFilesRegressionFileA()
    ])
    rendered.selectFiles([
      createSelectedFilesRegressionFileB()
    ])

    const debugState = rendered.getLastWorkspaceRenderDebug() as {
      checkpointLog: Array<{
        phase: string
        currentMonthKey: string
        explicitClearResetMarker: string
        invariantGuardApplied: string
        fileSelectionEventToken: number
        incomingBrowserFileListNames: string[]
        previousPendingSelectedFileNames: string[]
        nextPendingSelectedFileNames: string[]
        visiblePendingFileNamesBeforeRun: string[]
      }>
    }

    const selectionCheckpoints = debugState.checkpointLog.filter((entry) => (entry.fileSelectionEventToken || 0) > 0)
    const latestSelectionToken = Math.max(...selectionCheckpoints.map((entry) => entry.fileSelectionEventToken || 0))
    const latestSelectionEntries = selectionCheckpoints.filter((entry) => entry.fileSelectionEventToken === latestSelectionToken)
    const onFileInputChange = latestSelectionEntries.find((entry) => entry.phase === 'on-file-input-change')
    const beforeVisiblePendingRender = latestSelectionEntries.find((entry) => entry.phase === 'before-visible-pending-render')

    expect(onFileInputChange).toBeTruthy()
    expect(beforeVisiblePendingRender).toBeTruthy()
    expect(onFileInputChange?.currentMonthKey).toBe('2026-03')
    expect(onFileInputChange?.explicitClearResetMarker).toBe('none')
    expect(onFileInputChange?.invariantGuardApplied).toBe('union-preserved')
    expect(onFileInputChange?.incomingBrowserFileListNames).toEqual(['Pohyby_5599955956_202603191023.csv'])
    expect(onFileInputChange?.previousPendingSelectedFileNames).toEqual(['booking35k.csv'])
    expect(onFileInputChange?.nextPendingSelectedFileNames).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])

    expect(beforeVisiblePendingRender?.visiblePendingFileNamesBeforeRun).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Previous pending selected file names:</strong> booking35k.csv')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Incoming browser FileList names:</strong> Pohyby_5599955956_202603191023.csv')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Next pending selected file names after reducer/handler:</strong> booking35k.csv, Pohyby_5599955956_202603191023.csv')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Explicit clear/reset marker:</strong> none')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Current month key:</strong> 2026-03')
  })

  it('keeps same-month visible state and run handoff as A + B when B is selected after running A', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T11:05:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-selection-run-a-then-b',
      locationSearch: '?debug=1',
      skipStart: true,
      files: []
    })

    rendered.selectFiles([
      createSelectedFilesRegressionFileA()
    ])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    rendered.selectFiles([
      createSelectedFilesRegressionFileB()
    ])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    const debugState = rendered.getLastWorkspaceRenderDebug() as {
      checkpointLog: Array<{
        phase: string
        fileSelectionEventToken: number
        requestToken: number
        invariantGuardApplied: string
        nextPendingSelectedFileNames: string[]
        visiblePendingFileNamesBeforeRun: string[]
        selectedFileNamesHandedIntoRunAction: string[]
      }>
    }
    const latestSelectionToken = Math.max(...debugState.checkpointLog.map((entry) => entry.fileSelectionEventToken || 0))
    const latestSelectionEntries = debugState.checkpointLog.filter((entry) => entry.fileSelectionEventToken === latestSelectionToken)
    const runActionHandoff = debugState.checkpointLog.filter((entry) => entry.phase === 'run-action-handoff').pop()

    expect(latestSelectionEntries.find((entry) => entry.phase === 'on-file-input-change')?.invariantGuardApplied).toBe('union-preserved')
    expect(latestSelectionEntries.find((entry) => entry.phase === 'before-visible-pending-render')?.visiblePendingFileNamesBeforeRun).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])

    expect(runActionHandoff?.selectedFileNamesHandedIntoRunAction).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])

    const finalVisibleState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
    }

    expect(finalVisibleState.fileRoutes.map((item) => item.fileName)).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Selected file names handed into run action:</strong> booking35k.csv, Pohyby_5599955956_202603191023.csv')
  })

  it('keeps A after same-month run and reload', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T11:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-selection-reload-a-only',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [createSelectedFilesRegressionFileA()]
    })

    const reloaded = await rendered.reloadWithSameStorage()
    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
      runId: string
    }

    expect(reloadedState.runId).toContain('2026-03')
    expect(reloadedState.fileRoutes.map((item) => item.fileName)).toEqual(['booking35k.csv'])
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Render source:</strong> persistedWorkspace')
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Persisted workspace file names before rerun:</strong> booking35k.csv')
  })

  it('keeps A + B after same-month rerun and reload', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T11:15:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-selection-reload-a-then-b',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: []
    })

    rendered.selectFiles([createSelectedFilesRegressionFileA()])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    rendered.selectFiles([createSelectedFilesRegressionFileB()])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    const reloaded = await rendered.reloadWithSameStorage()
    const reloadedState = reloaded.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
    }

    expect(reloadedState.fileRoutes.map((item) => item.fileName)).toEqual([
      'booking35k.csv',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(reloaded.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Persisted workspace file names before rerun:</strong> booking35k.csv, Pohyby_5599955956_202603191023.csv')
  })

  it('clears the same-month selection and workspace only after explicit clear/reset', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T11:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-selection-explicit-clear',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: []
    })

    rendered.selectFiles([createSelectedFilesRegressionFileA()])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()
    await rendered.clearCurrentMonthWorkspace()

    const clearedDebugState = rendered.getLastWorkspaceRenderDebug() as {
      explicitClearResetMarker: string
      checkpointLog: Array<{
        phase: string
        explicitClearResetMarker: string
        nextPendingSelectedFileNames: string[]
      }>
    }

    expect(clearedDebugState.explicitClearResetMarker).toBe('explicit-clear')
    expect(clearedDebugState.checkpointLog.filter((entry) => entry.phase === 'explicit-clear-reset').pop()).toEqual(
      expect.objectContaining({
        explicitClearResetMarker: 'explicit-clear',
        nextPendingSelectedFileNames: []
      })
    )

    rendered.selectFiles([createSelectedFilesRegressionFileB()])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    const finalState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
    }
    const postClearDebugState = rendered.getLastWorkspaceRenderDebug() as {
      checkpointLog: Array<{
        phase: string
        explicitClearResetMarker: string
        nextPendingSelectedFileNames: string[]
        invariantGuardApplied: string
      }>
    }
    const latestSelectionToken = Math.max(...postClearDebugState.checkpointLog.map((entry) => (entry as { fileSelectionEventToken?: number }).fileSelectionEventToken || 0))
    const onFileInputChange = postClearDebugState.checkpointLog.find((entry) => entry.phase === 'on-file-input-change' && (entry as { fileSelectionEventToken?: number }).fileSelectionEventToken === latestSelectionToken) as {
      explicitClearResetMarker: string
      nextPendingSelectedFileNames: string[]
      invariantGuardApplied: string
    } | undefined

    expect(onFileInputChange?.explicitClearResetMarker).toBe('explicit-clear')
    expect(onFileInputChange?.invariantGuardApplied).toBe('no')
    expect(onFileInputChange?.nextPendingSelectedFileNames).toEqual(['Pohyby_5599955956_202603191023.csv'])
    expect(finalState.fileRoutes.map((item) => item.fileName)).toEqual(['Pohyby_5599955956_202603191023.csv'])
  })

  it('does not clear the selected month workspace when the operator cancels the delete confirmation', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T11:22:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-delete-cancel',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      confirmResponses: [false],
      files: [createSelectedFilesRegressionFileA()]
    })

    await rendered.clearCurrentMonthWorkspace()

    expect(rendered.getConfirmMessages()).toEqual([
      'Opravdu chcete smazat uložený workspace pro měsíc 2026-03?'
    ])
    expect(workspacePersistenceState.has('2026-03')).toBe(true)

    const visibleState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
    }
    expect(visibleState.fileRoutes.map((item) => item.fileName)).toEqual(['booking35k.csv'])
  })

  it('clears the selected month workspace only after the operator confirms the delete action', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T11:23:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-delete-confirm',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      confirmResponses: [true],
      files: [createSelectedFilesRegressionFileA()]
    })

    await rendered.clearCurrentMonthWorkspace()

    expect(rendered.getConfirmMessages()).toEqual([
      'Opravdu chcete smazat uložený workspace pro měsíc 2026-03?'
    ])
    expect(workspacePersistenceState.has('2026-03')).toBe(false)
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('Rozpoznáno souborů: 1')
  })

  it('loads only the open unmatched previous-month Comgate payout batch into April while keeping March same-month results unchanged', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const matchedMarchBatchKeys = [
      'comgate-batch:2026-03-29:CZK',
      'comgate-batch:2026-03-30:CZK'
    ]
    const expectedCarryoverBatchKey = 'comgate-batch:2026-03-31:CZK'

    const marchRendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T23:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-comgate-carryover-source-mixed-march',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeFile('Klientsky_portal_comgate_2026_03_mixed.csv', buildCurrentPortalComgatePreviousMonthMixedCarryoverContent()),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603301100.csv', buildRbComgatePreviousMonthMixedSettlementContent())
      ]
    })

    const marchState = marchRendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        payoutBatchMatched: Array<{ title: string }>
        payoutBatchUnmatched: Array<{ title: string }>
      }
    }

    expect(marchState.reviewSections.payoutBatchMatched).toHaveLength(2)
    expect(marchState.reviewSections.payoutBatchUnmatched).toHaveLength(1)
    expect(marchState.reviewSections.payoutBatchUnmatched[0]?.title || '').toContain('CG-CARRY-20260331-A')

    const persistedMarchWorkspace = JSON.parse(String(workspacePersistenceState.get('2026-03') || '{}')) as {
      runtimeState?: {
        carryoverSourceSnapshot?: {
          sourceMonthKey?: string
          payoutBatches?: Array<{ payoutBatchKey: string }>
        }
        reconciliationSnapshot?: {
          unmatchedPayoutBatchKeys?: string[]
        }
      }
    }

    expect(persistedMarchWorkspace.runtimeState?.carryoverSourceSnapshot).toEqual(expect.objectContaining({
      sourceMonthKey: '2026-03'
    }))
    expect(persistedMarchWorkspace.runtimeState?.carryoverSourceSnapshot?.payoutBatches?.map((item) => item.payoutBatchKey)).toEqual([expectedCarryoverBatchKey])
    if (!persistedMarchWorkspace.runtimeState?.carryoverSourceSnapshot?.payoutBatches?.some((item) => item.payoutBatchKey === expectedCarryoverBatchKey)) {
      throw new Error('lost after previous-month persistence')
    }

    const aprilRendered = await executeWebDemoMainWorkflow({
      files: [
        createWebDemoRuntimeFile('Pohyby_5599955956_202604030900.csv', buildRbComgatePreviousMonthUnmatchedSettlementContent())
      ],
      month: '2026-04',
      generatedAt: '2026-04-03T09:00:00.000Z',
      outputDirName: 'test-web-demo-comgate-carryover-browser-filtered-april',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState
    })

    const aprilState = aprilRendered.getLastVisibleRuntimeState() as {
      carryoverDebug: {
        sourceMonthKey: string
        currentMonthKey: string
        loadedPayoutBatchCount: number
        loadedPayoutBatchKeysSample: string[]
        matchingInputPayoutBatchCount: number
        matchingInputPayoutBatchKeysSample: string[]
        matcherCarryoverCandidateExists: boolean
        matcherCarryoverRejectedReason?: string
        matchedCount: number
        unmatchedCount: number
      }
      reviewSections: {
        payoutBatchMatched: Array<{ title: string }>
        payoutBatchUnmatched: Array<{ title: string }>
      }
    }
    const aprilRenderDebug = aprilRendered.getLastWorkspaceRenderDebug() as {
      carryoverPreviousMonthKeyResolved: string
      carryoverPreviousMonthWorkspaceFound: string
      carryoverPreviousMonthMatchedPayoutBatchCount: number
      carryoverPreviousMonthUnmatchedPayoutBatchCount: number
      carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: string[]
      carryoverPreviousMonthUnmatchedOnly: string
      carryoverLoadedPayoutBatchCount: number
      carryoverLoadedPayoutBatchIdsSample: string[]
      carryoverMatchingInputPayoutBatchCount: number
      carryoverMatchingInputPayoutBatchIdsSample: string[]
    }

    if (
      aprilRenderDebug.carryoverPreviousMonthKeyResolved !== '2026-03'
      || aprilRenderDebug.carryoverPreviousMonthWorkspaceFound !== 'ano'
      || aprilRenderDebug.carryoverPreviousMonthMatchedPayoutBatchCount !== 2
      || aprilRenderDebug.carryoverPreviousMonthUnmatchedPayoutBatchCount !== 1
      || aprilRenderDebug.carryoverPreviousMonthUnmatchedOnly !== 'yes'
      || !aprilRenderDebug.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.includes(expectedCarryoverBatchKey)
    ) {
      throw new Error(`lost during previous-month load: ${JSON.stringify({
        previousMonthKey: aprilRenderDebug.carryoverPreviousMonthKeyResolved,
        currentMonthKey: aprilState.carryoverDebug.currentMonthKey,
        previousMonthWorkspaceFound: aprilRenderDebug.carryoverPreviousMonthWorkspaceFound,
        previousMonthMatchedComgatePayoutCount: aprilRenderDebug.carryoverPreviousMonthMatchedPayoutBatchCount,
        previousMonthUnmatchedComgatePayoutCount: aprilRenderDebug.carryoverPreviousMonthUnmatchedPayoutBatchCount,
        previousMonthUnmatchedOnly: aprilRenderDebug.carryoverPreviousMonthUnmatchedOnly,
        carryoverCountBeforeSourceBuilder: aprilRenderDebug.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.length,
        carryoverCountAfterSourceBuilder: aprilRenderDebug.carryoverLoadedPayoutBatchCount
      })}`)
    }

    if (
      aprilRenderDebug.carryoverLoadedPayoutBatchCount !== 1
      || !aprilRenderDebug.carryoverLoadedPayoutBatchIdsSample.includes(expectedCarryoverBatchKey)
      || aprilRenderDebug.carryoverMatchingInputPayoutBatchCount !== 1
      || !aprilRenderDebug.carryoverMatchingInputPayoutBatchIdsSample.includes(expectedCarryoverBatchKey)
      ||
      aprilState.carryoverDebug.matchingInputPayoutBatchCount !== 1
      || !aprilState.carryoverDebug.matchingInputPayoutBatchKeysSample.includes(expectedCarryoverBatchKey)
    ) {
      throw new Error('lost before matching handoff')
    }

    for (const matchedMarchBatchKey of matchedMarchBatchKeys) {
      expect(aprilRenderDebug.carryoverLoadedPayoutBatchIdsSample).not.toContain(matchedMarchBatchKey)
      expect(aprilRenderDebug.carryoverMatchingInputPayoutBatchIdsSample).not.toContain(matchedMarchBatchKey)
      expect(aprilState.carryoverDebug.loadedPayoutBatchKeysSample).not.toContain(matchedMarchBatchKey)
      expect(aprilState.carryoverDebug.matchingInputPayoutBatchKeysSample).not.toContain(matchedMarchBatchKey)
    }

    if (
      !aprilState.carryoverDebug.matcherCarryoverCandidateExists
      || aprilState.carryoverDebug.matchedCount !== 1
      || aprilState.carryoverDebug.unmatchedCount !== 0
    ) {
      throw new Error('lost inside matcher eligibility')
    }

    expect(workspacePersistenceState.has('2026-03')).toBe(true)
    expect(aprilState.carryoverDebug).toEqual(expect.objectContaining({
      sourceMonthKey: '2026-03',
      currentMonthKey: '2026-04',
      loadedPayoutBatchCount: 1,
      matchingInputPayoutBatchCount: 1,
      matcherCarryoverCandidateExists: true,
      matchedCount: 1,
      unmatchedCount: 0
    }))
    expect(aprilState.carryoverDebug.loadedPayoutBatchKeysSample).toContain(expectedCarryoverBatchKey)
    expect(aprilState.carryoverDebug.matchingInputPayoutBatchKeysSample).toContain(expectedCarryoverBatchKey)
    expect(aprilState.carryoverDebug.matcherCarryoverRejectedReason || '').toBe('')
    expect(aprilState.reviewSections.payoutBatchMatched.some((item) => item.title.includes('Comgate payout dávka'))).toBe(true)
    expect(aprilState.reviewSections.payoutBatchUnmatched).toHaveLength(0)

    const marchRestored = await aprilRendered.reloadWithSameStorage()
    await marchRestored.changeMonth('2026-03')

    const restoredMarchState = marchRestored.getLastVisibleRuntimeState() as {
      reviewSummary: {
        payoutBatchMatchCount: number
        unmatchedPayoutBatchCount: number
      }
      reviewSections: {
        payoutBatchMatched: Array<{ id: string; detail: string }>
        payoutBatchUnmatched: Array<{ id: string }>
      }
    }
    const restoredMatchedIds = restoredMarchState.reviewSections.payoutBatchMatched.map((item) => item.id)
    const restoredUnmatchedIds = restoredMarchState.reviewSections.payoutBatchUnmatched.map((item) => item.id)
    const restoredLaterResolvedItem = restoredMarchState.reviewSections.payoutBatchMatched.find(
      (item) => item.id === `payout-batch-resolved-later:${expectedCarryoverBatchKey}`
    )
    const restoredDuplicateRepresentations = restoredMatchedIds
      .concat(restoredUnmatchedIds)
      .filter((itemId) => itemId.includes(expectedCarryoverBatchKey))

    expect(restoredMarchState.reviewSummary.payoutBatchMatchCount).toBe(3)
    expect(restoredMarchState.reviewSummary.unmatchedPayoutBatchCount).toBe(0)
    expect(restoredMatchedIds).toContain(`payout-batch-resolved-later:${expectedCarryoverBatchKey}`)
    expect(restoredUnmatchedIds).not.toContain(`payout-batch-unmatched:${expectedCarryoverBatchKey}`)
    expect(restoredDuplicateRepresentations).toHaveLength(1)
    expect(restoredLaterResolvedItem?.detail || '').toContain('2026-04')
  })

  it('filters matched and non-Comgate previous-month batches out of carryover even when the persisted snapshot is polluted', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    const matchedMarchBatchKeys = [
      'comgate-batch:2026-03-29:CZK',
      'comgate-batch:2026-03-30:CZK'
    ]
    const expectedCarryoverBatchKey = 'comgate-batch:2026-03-31:CZK'

    await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T23:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-comgate-carryover-source-polluted-march',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeFile('Klientsky_portal_comgate_2026_03_mixed.csv', buildCurrentPortalComgatePreviousMonthMixedCarryoverContent()),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603301100.csv', buildRbComgatePreviousMonthMixedSettlementContent())
      ]
    })

    const persistedMarchWorkspace = JSON.parse(String(workspacePersistenceState.get('2026-03') || '{}')) as {
      runtimeState?: {
        carryoverSourceSnapshot?: {
          sourceMonthKey?: string
          payoutBatches?: Array<{
            payoutBatchKey: string
            platform: string
            bankRoutingTarget?: string
            payoutReference?: string
            payoutDate?: string
            postedDate?: string
            grossAmount?: string
            feeAmount?: string
            netAmount?: string
            currency?: string
          }>
        }
        reconciliationSnapshot?: {
          matchedPayoutBatchKeys?: string[]
          unmatchedPayoutBatchKeys?: string[]
        }
      }
    }

    persistedMarchWorkspace.runtimeState = persistedMarchWorkspace.runtimeState || {}
    persistedMarchWorkspace.runtimeState.carryoverSourceSnapshot = {
      sourceMonthKey: '2026-03',
      payoutBatches: [
        {
          payoutBatchKey: matchedMarchBatchKeys[0],
          platform: 'comgate',
          bankRoutingTarget: 'rb_bank_inflow',
          payoutReference: 'CG-CARRY-20260329-A',
          payoutDate: '2026-03-29',
          postedDate: '2026-03-29',
          grossAmount: '1000',
          feeAmount: '10',
          netAmount: '990',
          currency: 'CZK'
        },
        {
          payoutBatchKey: matchedMarchBatchKeys[1],
          platform: 'comgate',
          bankRoutingTarget: 'rb_bank_inflow',
          payoutReference: 'CG-CARRY-20260330-A',
          payoutDate: '2026-03-30',
          postedDate: '2026-03-30',
          grossAmount: '2000',
          feeAmount: '20',
          netAmount: '1980',
          currency: 'CZK'
        },
        {
          payoutBatchKey: expectedCarryoverBatchKey,
          platform: 'comgate',
          bankRoutingTarget: 'rb_bank_inflow',
          payoutReference: 'CG-CARRY-20260331-A',
          payoutDate: '2026-03-31',
          postedDate: '2026-03-31',
          grossAmount: '3000',
          feeAmount: '30',
          netAmount: '2970',
          currency: 'CZK'
        },
        {
          payoutBatchKey: 'booking-batch:2026-03-31:CZK',
          platform: 'booking',
          bankRoutingTarget: 'rb_bank_inflow',
          payoutReference: 'BOOKING-20260331-A',
          payoutDate: '2026-03-31',
          postedDate: '2026-03-31',
          grossAmount: '111',
          feeAmount: '0',
          netAmount: '111',
          currency: 'CZK'
        }
      ]
    }
    workspacePersistenceState.set('2026-03', JSON.stringify(persistedMarchWorkspace))

    const aprilRendered = await executeWebDemoMainWorkflow({
      files: [
        createWebDemoRuntimeFile('Pohyby_5599955956_202604030900.csv', buildRbComgatePreviousMonthUnmatchedSettlementContent())
      ],
      month: '2026-04',
      generatedAt: '2026-04-03T09:00:00.000Z',
      outputDirName: 'test-web-demo-comgate-carryover-browser-polluted-april',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState
    })

    const aprilState = aprilRendered.getLastVisibleRuntimeState() as {
      carryoverDebug: {
        loadedPayoutBatchCount: number
        loadedPayoutBatchKeysSample: string[]
        matchingInputPayoutBatchCount: number
        matchingInputPayoutBatchKeysSample: string[]
        matcherCarryoverCandidateExists: boolean
        matchedCount: number
        unmatchedCount: number
      }
    }
    const aprilRenderDebug = aprilRendered.getLastWorkspaceRenderDebug() as {
      carryoverPreviousMonthUnmatchedPayoutBatchCount: number
      carryoverPreviousMonthUnmatchedOnly: string
      carryoverLoadedPayoutBatchIdsSample: string[]
      carryoverMatchingInputPayoutBatchIdsSample: string[]
    }

    expect(aprilRenderDebug.carryoverPreviousMonthUnmatchedPayoutBatchCount).toBe(1)
    expect(aprilRenderDebug.carryoverPreviousMonthUnmatchedOnly).toBe('yes')
    expect(aprilState.carryoverDebug.loadedPayoutBatchCount).toBe(1)
    expect(aprilState.carryoverDebug.matchingInputPayoutBatchCount).toBe(1)
    expect(aprilState.carryoverDebug.loadedPayoutBatchKeysSample).toEqual([expectedCarryoverBatchKey])
    expect(aprilState.carryoverDebug.matchingInputPayoutBatchKeysSample).toEqual([expectedCarryoverBatchKey])
    expect(aprilRenderDebug.carryoverLoadedPayoutBatchIdsSample).toEqual([expectedCarryoverBatchKey])
    expect(aprilRenderDebug.carryoverMatchingInputPayoutBatchIdsSample).toEqual([expectedCarryoverBatchKey])
    expect(aprilState.carryoverDebug.loadedPayoutBatchKeysSample).not.toContain('booking-batch:2026-03-31:CZK')
    expect(aprilState.carryoverDebug.matchingInputPayoutBatchKeysSample).not.toContain('booking-batch:2026-03-31:CZK')

    for (const matchedMarchBatchKey of matchedMarchBatchKeys) {
      expect(aprilState.carryoverDebug.loadedPayoutBatchKeysSample).not.toContain(matchedMarchBatchKey)
      expect(aprilState.carryoverDebug.matchingInputPayoutBatchKeysSample).not.toContain(matchedMarchBatchKey)
    }
  })

  it('keeps previous month persistence intact when clearing the current month and drops carryover only after deleting the source month', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T23:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-comgate-carryover-delete-source-march',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeFile('Klientsky_portal_comgate_2026_03_31.csv', buildCurrentPortalComgatePreviousMonthCarryoverContent())
      ]
    })

    const aprilRendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-03T09:00:00.000Z',
      month: '2026-04',
      outputDirName: 'test-web-demo-comgate-carryover-delete-source-april',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      confirmResponses: [true],
      files: [
        createWebDemoRuntimeFile('Pohyby_5599955956_202604030900.csv', buildRbComgatePreviousMonthCarryoverSettlementContent())
      ]
    })

    await aprilRendered.clearCurrentMonthWorkspace()
    expect(workspacePersistenceState.has('2026-03')).toBe(true)
    expect(workspacePersistenceState.has('2026-04')).toBe(false)

    const marchRendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-03T09:05:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-comgate-carryover-delete-source-clear-march',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      confirmResponses: [true],
      skipStart: true,
      files: []
    })

    await marchRendered.clearCurrentMonthWorkspace()
    expect(workspacePersistenceState.has('2026-03')).toBe(false)

    const aprilRerun = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-03T09:10:00.000Z',
      month: '2026-04',
      outputDirName: 'test-web-demo-comgate-carryover-delete-source-rerun-april',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeFile('Pohyby_5599955956_202604030900.csv', buildRbComgatePreviousMonthCarryoverSettlementContent())
      ]
    })

    const rerunState = aprilRerun.getLastVisibleRuntimeState() as {
      carryoverDebug: {
        loadedPayoutBatchCount: number
        matchedCount: number
        unmatchedCount: number
      }
      reviewSections: {
        payoutBatchMatched: Array<{ title: string }>
      }
    }

    expect(rerunState.carryoverDebug).toEqual(expect.objectContaining({
      loadedPayoutBatchCount: 0,
      matchingInputPayoutBatchCount: 0,
      matcherCarryoverCandidateExists: false,
      matchedCount: 0,
      unmatchedCount: 0
    }))
    expect(rerunState.reviewSections.payoutBatchMatched).toHaveLength(0)
    expect(aprilRerun.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Loaded carryover payout batch count:</strong> 0')
    expect(aprilRerun.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Previous month key resolved for carryover:</strong> 2026-03')
    expect(aprilRerun.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Previous month workspace found:</strong> ne')
  })

  it('keeps different months isolated from the same-month invariant guard', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T11:25:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-selection-different-month-isolation',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: []
    })

    rendered.selectFiles([createSelectedFilesRegressionFileA()])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    await rendered.changeMonth('2026-04')
    rendered.selectFiles([createSelectedFilesRegressionFileB()])

    const debugState = rendered.getLastWorkspaceRenderDebug() as {
      checkpointLog: Array<{
        phase: string
        fileSelectionEventToken: number
        previousPendingSelectedFileNames: string[]
        nextPendingSelectedFileNames: string[]
        invariantGuardApplied: string
      }>
    }
    const latestSelectionToken = Math.max(...debugState.checkpointLog.map((entry) => entry.fileSelectionEventToken || 0))
    const onFileInputChange = debugState.checkpointLog.find((entry) => entry.phase === 'on-file-input-change' && entry.fileSelectionEventToken === latestSelectionToken)

    expect(onFileInputChange).toEqual(expect.objectContaining({
      previousPendingSelectedFileNames: [],
      nextPendingSelectedFileNames: ['Pohyby_5599955956_202603191023.csv'],
      invariantGuardApplied: 'no'
    }))

    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    const aprilState = rendered.getLastVisibleRuntimeState() as {
      runId: string
      fileRoutes: Array<{ fileName: string }>
    }

    expect(aprilState.runId).toContain('2026-04')
    expect(aprilState.fileRoutes.map((item) => item.fileName)).toEqual(['Pohyby_5599955956_202603191023.csv'])

    await rendered.changeMonth('2026-03')

    const marchState = rendered.getLastVisibleRuntimeState() as {
      runId: string
      fileRoutes: Array<{ fileName: string }>
    }

    expect(marchState.runId).toContain('2026-03')
    expect(marchState.fileRoutes.map((item) => item.fileName)).toEqual(['booking35k.csv'])
  })

  it('does not let a stale initial month restore overwrite a newer same-month merged rerun on the same page', async () => {
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()

    await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T09:00:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-same-page-stale-restore-seed',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
      ]
    })

    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T09:01:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-same-page-stale-restore-rerun',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      workspacePersistenceLoadDelaysMs: [200, 0],
      awaitInitialRestore: false,
      skipStart: true,
      files: []
    })

    rendered.setSelectedFiles([
      createWebDemoRuntimeArrayBufferTextFile(
        'Pohyby_5599955956_202603191023.csv',
        buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
        'text/csv'
      )
    ])
    rendered.startWorkflow()
    await rendered.waitForWorkflowCompletion()

    let rerunState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
      reviewSummary: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number }
    }

    expect(rerunState.fileRoutes.map((item) => item.fileName)).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Bookinng35k.pdf',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(rerunState.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(rerunState.reviewSummary.unmatchedPayoutBatchCount).toBe(2)

    await rendered.waitForInitialRestore()

    rerunState = rendered.getLastVisibleRuntimeState() as {
      fileRoutes: Array<{ fileName: string }>
      reviewSummary: { payoutBatchMatchCount: number; unmatchedPayoutBatchCount: number }
    }

    expect(rerunState.fileRoutes.map((item) => item.fileName)).toEqual([
      'booking35k.csv',
      'airbnb.csv',
      'Bookinng35k.pdf',
      'Pohyby_5599955956_202603191023.csv'
    ])
    expect(rerunState.reviewSummary.payoutBatchMatchCount).toBe(16)
    expect(rerunState.reviewSummary.unmatchedPayoutBatchCount).toBe(2)
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>booking35k.csv</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>airbnb.csv</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Bookinng35k.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Pohyby_5599955956_202603191023.csv</strong>')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Current month key:</strong> 2026-03')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Persisted workspace file count before rerun:</strong> 3')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Newly selected batch file count:</strong> 1')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Merged file count used for rerun:</strong> 4')
    expect(rendered.runtimeWorkspaceMergeDebugContent.innerHTML).toContain('Render source:</strong> mergedWorkspace')
  })

  it('builds complete monthly Excel export from the restored current month workspace state', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const storageState = new Map<string, string>()
    const workspacePersistenceState = new Map<string, string>()
    await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:30:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-workspace-export-source',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    const restored = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:31:00.000Z',
      month: '',
      outputDirName: 'test-web-demo-month-workspace-export-restored',
      locationSearch: '?debug=1',
      storageState,
      workspacePersistenceState,
      skipStart: true,
      files: []
    })

    restored.setWorkspaceExportPreset('complete')
    restored.downloadWorkspaceExcelExport()

    const exportArtifact = restored.getLastExcelExport() as {
      fileName: string
      preset: string
      payoutRowCount: number
      expenseRowCount: number
      base64Content: string
    }
    const workbook = readWorkbookFromBrowserExportBase64(exportArtifact.base64Content)
    const summaryRows = XLSX.utils.sheet_to_json<{ Položka: string; Hodnota: string }>(workbook.Sheets.Souhrn)
    const payoutRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['Payout a rezervace'])
    const expenseRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['Výdaje a doklady'])

    expect(exportArtifact.fileName).toBe('hotel-finance-control-2026-03-kompletni-export.xlsx')
    expect(exportArtifact.preset).toBe('complete')
    expect(summaryRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ Položka: 'Měsíc', Hodnota: '2026-03' }),
      expect.objectContaining({ Položka: 'Exportní preset', Hodnota: 'Kompletní export' })
    ]))
    expect(payoutRows.some((row) => row.Sekce === 'Spárované payout dávky')).toBe(true)
    expect(payoutRows.some((row) => row.Sekce === 'Nespárované payout dávky')).toBe(true)
    expect(payoutRows.some((row) => String(row['Číslo faktury / reference'] || row.Reference || '').includes('141260183'))).toBe(false)
    expect(payoutRows.some((row) => String(row['Titulek'] || '').includes('Lenner'))).toBe(false)
    expect(payoutRows.some((row) => String(row['Sekce'] || '').includes('Výdaje'))).toBe(false)
    expect(payoutRows.some((row) => String(row['Sekce'] || '').includes('Nespárované odchozí platby'))).toBe(false)
    expect(expenseRows.some((row) => row.Sekce === 'Výdaje ke kontrole' && row['Číslo faktury / reference'] === '141260183')).toBe(true)
    expect(expenseRows.some((row) => row.Sekce === 'Nespárované odchozí platby')).toBe(true)
    expect(expenseRows.some((row) => row.Sekce === 'Spárované payout dávky')).toBe(false)
    expect(expenseRows.some((row) => row.Sekce === 'Nespárované payout dávky')).toBe(false)
    expect(exportArtifact.payoutRowCount).toBe(payoutRows.length)
    expect(exportArtifact.expenseRowCount).toBe(expenseRows.length)
    expect(
      payoutRows.filter((row) => String(row.Reference || '').includes('141260183') || String(row.Titulek || '').includes('Lenner')).length
      + expenseRows.filter((row) => String(row['Číslo faktury / reference'] || '').includes('141260183') || String(row.Titulek || '').includes('Lenner')).length
    ).toBe(
      expenseRows.filter((row) => String(row['Číslo faktury / reference'] || '').includes('141260183') || String(row.Titulek || '').includes('Lenner')).length
    )
    expect(restored.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(restored.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('filters monthly Excel export to review-needed items and keeps row counts aligned with visible expense buckets', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:40:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-workspace-export-review-only',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.openExpenseReviewPage()
    rendered.setWorkspaceExportPreset('review-needed')
    rendered.downloadWorkspaceExcelExport()

    const exportArtifact = rendered.getLastExcelExport() as {
      fileName: string
      preset: string
      expenseRowCount: number
      base64Content: string
    }
    const workbook = readWorkbookFromBrowserExportBase64(exportArtifact.base64Content)
    const payoutRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['Payout a rezervace'])
    const expenseRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['Výdaje a doklady'])
    const expectedExpenseCount =
      extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseNeedsReview')
      + extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedDocuments')
      + extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedOutflows')

    expect(exportArtifact.fileName).toBe('hotel-finance-control-2026-03-jen-ke-kontrole.xlsx')
    expect(exportArtifact.preset).toBe('review-needed')
    expect(payoutRows.some((row) => row.Sekce === 'Spárované payout dávky')).toBe(false)
    expect(payoutRows.some((row) => String(row.Reference || '').includes('141260183') || String(row.Titulek || '').includes('Lenner'))).toBe(false)
    expect(expenseRows.some((row) => row.Sekce === 'Spárované výdaje')).toBe(false)
    expect(expenseRows.some((row) => row.Sekce === 'Výdaje ke kontrole' && row['Číslo faktury / reference'] === '141260183')).toBe(true)
    expect(expenseRows.some((row) => row.Sekce === 'Nespárované payout dávky')).toBe(false)
    expect(exportArtifact.expenseRowCount).toBe(expectedExpenseCount)
    expect(expenseRows.length).toBe(expectedExpenseCount)
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('reflects manual expense confirm and reject decisions in matched-only and review-needed Excel exports', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T16:50:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-workspace-export-manual-overrides',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.openExpenseReviewPage()
    const initialState = rendered.getLastVisibleRuntimeState() as {
      reviewSections: {
        expenseNeedsReview: Array<{ id: string }>
      }
    }
    const reviewItemId = initialState.reviewSections.expenseNeedsReview[0]?.id
    expect(reviewItemId).toBeTruthy()

    rendered.confirmExpenseReviewItem(String(reviewItemId))
    rendered.setWorkspaceExportPreset('matched-only')
    rendered.downloadWorkspaceExcelExport()

    const matchedWorkbook = readWorkbookFromBrowserExportBase64(
      (rendered.getLastExcelExport() as { base64Content: string }).base64Content
    )
    const matchedExpenseRows = XLSX.utils.sheet_to_json<Record<string, string>>(matchedWorkbook.Sheets['Výdaje a doklady'])

    expect(matchedExpenseRows.some((row) =>
      row.Sekce === 'Spárované výdaje'
      && row['Ruční rozhodnutí'] === 'Ručně potvrzená shoda'
      && row['Číslo faktury / reference'] === '141260183'
    )).toBe(true)
    expect(matchedExpenseRows.some((row) => row.Sekce === 'Výdaje ke kontrole')).toBe(false)

    const matchedPayoutRows = XLSX.utils.sheet_to_json<Record<string, string>>(matchedWorkbook.Sheets['Payout a rezervace'])
    expect(matchedPayoutRows.some((row) => String(row.Reference || '').includes('141260183') || String(row.Titulek || '').includes('Lenner'))).toBe(false)

    rendered.undoConfirmedExpenseReviewItem(`expense-manual-confirmed:${String(reviewItemId)}`)
    rendered.rejectExpenseReviewItem(String(reviewItemId))
    rendered.setWorkspaceExportPreset('review-needed')
    rendered.downloadWorkspaceExcelExport()

    const reviewWorkbook = readWorkbookFromBrowserExportBase64(
      (rendered.getLastExcelExport() as { base64Content: string }).base64Content
    )
    const reviewExpenseRows = XLSX.utils.sheet_to_json<Record<string, string>>(reviewWorkbook.Sheets['Výdaje a doklady'])

    expect(reviewExpenseRows.some((row) =>
      row['Ruční rozhodnutí'] === 'Ručně zamítnuto'
      && row.Sekce === 'Nespárované doklady'
    )).toBe(true)
    expect(reviewExpenseRows.some((row) =>
      row['Ruční rozhodnutí'] === 'Ručně zamítnuto'
      && row.Sekce === 'Nespárované odchozí platby'
    )).toBe(true)
    expect(reviewExpenseRows.some((row) => row.Sekce === 'Spárované výdaje')).toBe(false)
    const reviewPayoutRows = XLSX.utils.sheet_to_json<Record<string, string>>(reviewWorkbook.Sheets['Payout a rezervace'])
    expect(reviewPayoutRows.some((row) => String(row.Reference || '').includes('141260183') || String(row.Titulek || '').includes('Lenner'))).toBe(false)
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('renders and exports bare integer CZK outgoing bank values in correct major units on the browser workflow', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T17:20:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-czk-major-unit-outflow',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndIntegerExpenseOutflow(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.openExpenseReviewPage()

    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).toContain('3 120,00 Kč')
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).not.toContain('31,20 Kč')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('12 629,52 Kč')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)

    rendered.setWorkspaceExportPreset('complete')
    rendered.downloadWorkspaceExcelExport()

    const workbook = readWorkbookFromBrowserExportBase64(
      (rendered.getLastExcelExport() as { base64Content: string }).base64Content
    )
    const expenseRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['Výdaje a doklady'])

    expect(expenseRows.some((row) =>
      row.Sekce === 'Nespárované odchozí platby'
      && row.Částka === '3 120,00 Kč'
      && row['Číslo faktury / reference'] === 'Platba bez dokladu'
    )).toBe(true)
    expect(expenseRows.some((row) => row.Částka === '31,20 Kč')).toBe(false)
  })

  it('renders and exports an own-account RB to Fio transfer as an internal matched transfer instead of an unmatched expense outflow', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T19:25:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-internal-transfer-pair',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildRealUploadedAirbnbContentWithoutReferenceColumn(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndInternalTransferOutflow(),
          'text/csv'
        ),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithInternalTransferInflow(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.openExpenseReviewPage()

    expect(rendered.expenseMatchedContent.innerHTML).toContain('Vnitřní převod 5 000,00 Kč')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('Odchozí účet')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('Příchozí účet')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('5599955956/5500')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('8888997777/2010')
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).not.toContain('5 000,00 Kč')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)

    rendered.setWorkspaceExportPreset('complete')
    rendered.downloadWorkspaceExcelExport()

    const workbook = readWorkbookFromBrowserExportBase64(
      (rendered.getLastExcelExport() as { base64Content: string }).base64Content
    )
    const expenseRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['Výdaje a doklady'])

    expect(expenseRows.some((row) =>
      row.Sekce === 'Spárované výdaje'
      && row.Titulek === 'Vnitřní převod 5 000,00 Kč'
      && row['Účet / IBAN hint'] === '5599955956/5500 ↔ 8888997777/2010'
    )).toBe(true)
    expect(expenseRows.some((row) =>
      row.Sekce === 'Nespárované odchozí platby'
      && row.Titulek.includes('5 000,00 Kč')
    )).toBe(false)
  })

  it('renders and exports an own-account Fio to RB transfer as an internal matched transfer instead of an unmatched expense outflow', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T19:32:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-internal-transfer-pair-fio-rb',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbContentWithInternalTransferInflowOnly(),
          'text/csv'
        ),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_na_uctu-8888997777_20260301-20260331.csv',
          buildRealUploadedFioContentWithInternalTransferOutflowOnly(),
          'text/csv'
        )
      ]
    })

    rendered.openExpenseReviewPage()

    expect(rendered.expenseMatchedContent.innerHTML).toContain('Vnitřní převod 5 000,00 Kč')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('Odchozí účet')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('Příchozí účet')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('8888997777/2010')
    expect(rendered.expenseMatchedContent.innerHTML).toContain('5599955956/5500')
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).not.toContain('5 000,00 Kč')
    expect(rendered.expenseUnmatchedInflowsContent.innerHTML).not.toContain('5 000,00 Kč')

    rendered.setWorkspaceExportPreset('complete')
    rendered.downloadWorkspaceExcelExport()

    const workbook = readWorkbookFromBrowserExportBase64(
      (rendered.getLastExcelExport() as { base64Content: string }).base64Content
    )
    const expenseRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['Výdaje a doklady'])

    expect(expenseRows.some((row) =>
      row.Sekce === 'Spárované výdaje'
      && row.Titulek === 'Vnitřní převod 5 000,00 Kč'
      && row['Účet / IBAN hint'] === '8888997777/2010 ↔ 5599955956/5500'
    )).toBe(true)
    expect(expenseRows.some((row) =>
      row.Sekce === 'Nespárované odchozí platby'
      && row.Titulek.includes('5 000,00 Kč')
    )).toBe(false)
  })

  it('renders a generic unmatched incoming bank movement in the dedicated incoming bucket and keeps internal transfers out of unmatched buckets', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T19:40:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-unmatched-incoming-bucket',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbContentWithGenericIncomingOnly(),
          'text/csv'
        )
      ]
    })

    rendered.openExpenseReviewPage()

    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('Nespárované příchozí platby')
    expect(rendered.expenseDetailSummaryContent.innerHTML).toContain('Nespárované odchozí platby')
    rendered.setExpenseDetailFilter('expenseUnmatchedInflows')
    expect(rendered.expenseUnmatchedInflowsContent.innerHTML).toContain('Nespárovaná příchozí platba 2 200,00 Kč')
    expect(rendered.expenseUnmatchedInflowsContent.innerHTML).toContain('Příchozí platba bez vazby')
    expect(rendered.expenseUnmatchedInflowsContent.innerHTML).toContain('2 200,00 Kč')
    expect(extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedInflows'))
      .toBe(rendered.expenseUnmatchedInflowsContent.innerHTML.split('<article class=\"expense-item\">').length - 1)
    expect(extractExpenseBucketCount(rendered.expenseDetailSummaryContent.innerHTML, 'expenseUnmatchedOutflows')).toBe(0)
    expect(rendered.expenseUnmatchedOutflowsContent.innerHTML).toContain('Žádné nespárované odchozí platby.')
  })

  it('shows OCR fallback recovery for scan-like invoices on the built browser path', async () => {
    const invoice = getRealInputFixture('invoice-document-scan-pdf-with-ocr-stub')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T09:40:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-invoice-ocr-fallback',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimePdfFile(invoice.sourceDocument.fileName, invoice.rawInput.binaryContentBase64!)
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 1 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>invoice-scan-ocr.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>invoice-scan-ocr.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('OCR detected: yes')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('OCR recovered fields: referenceNumber, issuerOrCounterparty, customer, issueDate, dueDate, taxableDate, paymentMethod, totalAmount, vatBaseAmount, vatAmount, ibanHint')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final status: parsed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final referenceNumber: OCR-INV-2026-77')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final issueDate: 2026-03-20')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final totalAmount: 6 500,00 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
  })

  it('shows handwritten-like receipt scans as needs_review instead of ingest failure on the built browser path', async () => {
    const receipt = getRealInputFixture('receipt-document-handwritten-pdf-with-ocr-stub')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-29T09:55:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-receipt-ocr-fallback',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimePdfFile(receipt.sourceDocument.fileName, receipt.rawInput.binaryContentBase64!)
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 1 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>receipt-handwritten.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4><ul><li><strong>receipt-handwritten.pdf</strong>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('OCR detected: yes')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Final status: needs_review')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: failed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: referenceNumber')
  })

  it('shows no-extract diagnostics for a recognized sparse refund invoice PDF that stops before extracted-record emission', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T16:30:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-sparse-refund-no-extract',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('sparse-refund-missing-date.pdf', [
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
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 1 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('sparse-refund-missing-date.pdf')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Text preview: Faktura - daňový doklad')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Text tail:')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: failed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: issueDate, dueDate')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Present fields: referenceNumber, issuerOrCounterparty, totalAmount, settlementDirection, targetBankAccountHint')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('No extract reason: missing-usable-date')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parsed supplier: Dobrá Energie s.r.o.')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parsed referenceNumber: 5125144501')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parsed settlementDirection: refund_incoming')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parsed amount: ')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Parsed targetBankAccountHint: 8888997777/2010')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Finální bucket: recognized supported · Rozpoznaný a zpracovaný zdroj')
  })

  it('shows the compact Airbnb browser export variant as a supported structured upload and keeps the 5-file result free of ingest failures', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-28T09:25:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-compact-airbnb-and-lenner',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile('airbnb_03_2026-03_2026.csv', buildCompactUploadedAirbnbContent(), 'text/csv'),
        createWebDemoRuntimeArrayBufferTextFile(
          'Pohyby_5599955956_202603191023.csv',
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
          'text/csv'
        ),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Booking35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 5 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>airbnb_03_2026-03_2026.csv</strong>')
    expect(rendered.preparedFilesContent.innerHTML).toContain('<strong>Lenner.pdf</strong>')
    expect(rendered.preparedFilesContent.innerHTML).not.toContain('<h4>Soubory se selháním ingestu</h4>')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('airbnb_03_2026-03_2026.csv')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Airbnb parser variant: structured-export')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Airbnb detected header row: Datum převodu;Částka převodu;Měna;Reference code;Confirmation code;Nabídka')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Airbnb normalized header map: Datum převodu -&gt; payoutDate | Částka převodu -&gt; amountMinor | Měna -&gt; currency | Reference code -&gt; payoutReference | Confirmation code -&gt; reservationId | Nabídka -&gt; listingId')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Airbnb mapped payoutDate: Datum převodu')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Airbnb mapped payoutReference: Reference code')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Airbnb mapped reservationId: Confirmation code')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Airbnb mapped listingId: Nabídka')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Airbnb missing canonical headers: žádné')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Lenner.pdf')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
  })

  it('shows current Comgate portal net settlement diagnostics only in debug mode before matcher handoff', async () => {
    const comgate = getRealInputFixture('comgate-export-current-portal')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-31T18:10:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-comgate-portal-matching-diagnostics',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('Klientský portál export transakcí JOKELAND s.r.o..csv', comgate.rawInput.content),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603191023.csv', buildRbAggregatedComgatePortalSettlementContent())
      ]
    })

    expect(rendered.runtimeFileIntakeDiagnosticsSection.hidden).toBe(false)
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate parser variant: current-portal')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate detected delimiter: ;')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate raw headers: Comgate ID | ID od klienta | Datum založení | Datum zaplacení | Datum převodu')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate normalized header map: Comgate ID -&gt; transactionId | ID od klienta -&gt; paymentReference')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate missing canonical headers: žádné')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate parser variants: current-portal')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate extracted records: 2')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate extracted kinds: parking (1), website-reservation (1)')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate normalized transactions: 2')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate current-portal raw rows: 2')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate current-portal payout batches: 1')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate current-portal batch totals: comgate-batch:2026-03-19:CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('gross=1 591,00 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('fee=11,00 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('net=1 580,00 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate matching input rows: 2')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate payout batches: 1 · decisions 1')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate loss boundary: no-loss / matched')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('CG-WEB-2001')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('before=1')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('amount=1')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('matched')
  })

  it('proves the same-month Comgate lag browser case was only blocked by the strict date gate and now matches with the narrow 3-day rule', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-30T11:15:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-comgate-same-month-lag',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile('Klientský portál export transakcí JOKELAND lag.csv', buildCurrentPortalComgateSameMonthLagContent()),
        createWebDemoRuntimeFile('Pohyby_5599955956_202603301100.csv', buildRbComgateSameMonthLagSettlementContent())
      ]
    })

    const state = rendered.getLastVisibleRuntimeState() as {
      reconciliationSnapshot: {
        matchedCount: number
        unmatchedCount: number
        payoutBatchDecisions: Array<{
          payoutBatchKey: string
          expectedBankAmountMinor: number
          payoutDate: string
          exactAmountMatchExistsBeforeDateEvidence: boolean
          sameMonthExactAmountCandidateExists: boolean
          rejectedOnlyByDateGate: boolean
          appliedComgateSameMonthLagRule: boolean
          wouldRejectOnStrictDateGate: boolean
          bankCandidateCountAfterAmountCurrency: number
          bankCandidateCountAfterDateWindow: number
          matched: boolean
        }>
      }
    }
    const decision = state.reconciliationSnapshot.payoutBatchDecisions.find((item) => item.payoutBatchKey === 'comgate-batch:2026-03-27:CZK')

    expect(state.reconciliationSnapshot.matchedCount).toBe(1)
    expect(state.reconciliationSnapshot.unmatchedCount).toBe(0)
    expect(decision).toEqual(expect.objectContaining({
      payoutBatchKey: 'comgate-batch:2026-03-27:CZK',
      expectedBankAmountMinor: 605879,
      payoutDate: '2026-03-27',
      exactAmountMatchExistsBeforeDateEvidence: true,
      sameMonthExactAmountCandidateExists: true,
      rejectedOnlyByDateGate: true,
      appliedComgateSameMonthLagRule: true,
      wouldRejectOnStrictDateGate: true,
      bankCandidateCountAfterAmountCurrency: 1,
      bankCandidateCountAfterDateWindow: 1,
      matched: true
    }))
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('candidate existed ano')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('rejected only by date gate ano')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('applied Comgate same-month lag rule ano')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('would reject on strict date gate ano')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).not.toContain('Žádný vhodný kandidát v očekávaném datu payoutu')
  })

  it('shows the attached daily Comgate settlement CSV as a supported debug-only daily-settlement shape', async () => {
    const comgate = getRealInputFixture('comgate-daily-payout-export')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T08:15:00.000Z',
      month: '2026-03',
      locationSearch: '?debug=1',
      files: [
        createWebDemoRuntimeFile(comgate.sourceDocument.fileName, comgate.rawInput.content)
      ]
    })

    expect(rendered.runtimeFileIntakeDiagnosticsSection.hidden).toBe(false)
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate detected file kind: daily-settlement')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate parser variant: daily-settlement')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate raw headers: Merchant | ID ComGate | Metoda |')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('| Produkt |')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('| ID od klienta')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate canonical headers: merchant | transactionId | paymentMethod | confirmedAmountMinor | transferredAmountMinor | product | transferReference | clientId')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate explicit settlement total: ano')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate extracted records: 3')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Comgate parser variants: daily-settlement')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Rozhodnutí klasifikátoru: comgate / payment_gateway_report / content')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Finální bucket: recognized supported')
  })

  it('shows live browser workflow progress before the larger selected-file run completes', async () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-03-30T11:15:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-progressive-large-upload',
      skipStart: true,
      files: [
        createDelayedWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 5, 'text/csv'),
        createDelayedWebDemoRuntimeArrayBufferTextFile('airbnb.csv', getRealInputFixture('airbnb-payout-export').rawInput.content, 5, 'text/csv'),
        createDelayedWebDemoRuntimeArrayBufferTextFile('Pohyby_5599955956_202603191023.csv', getRealInputFixture('raiffeisenbank-statement').rawInput.content, 5, 'text/csv'),
        createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
      ]
    })

    rendered.startWorkflow()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(rendered.preparedFilesContent.innerHTML).toContain('Ukládám vybrané soubory do browser workspace:')
    expect(rendered.preparedFilesContent.innerHTML).toContain('booking35k.csv')

    await rendered.waitForWorkflowCompletion()

    expect(rendered.preparedFilesContent.innerHTML).toContain('Rozpoznáno souborů: 4 · Nepodporováno: 0 · Selhání ingestu: 0')
    expect(rendered.runtimeSummaryUploadedFiles.textContent).toContain('4')
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
    expect(result.html).toContain('function buildUnmatchedReservationDetailsMarkup(state, pageKey, bucketKey)')
    expect(result.html).toContain("unmatchedReservationsContent.innerHTML = buildUnmatchedReservationDetailsMarkup(visibleState, 'control', 'unmatchedReservationSettlements');")
    expect(result.html).toContain('Detail nespárovaných rezervací se právě načítá ze sdíleného runtime běhu…')
    expect(result.html).not.toContain('noCandidate')
  })

  it('renders a dedicated month picker trigger next to the month input in the operator form', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-04-01T12:10:00.000Z'
    })

    expect(result.html).toContain('id="month-picker-trigger-button"')
    expect(result.html).toContain('class="secondary-button month-picker-trigger"')
    expect(result.html).toContain('aria-label="Otevřít výběr měsíce"')
  })

  it('opens the month picker from the dedicated trigger via showPicker when available and falls back to focus plus click otherwise', async () => {
    const rendered = await executeWebDemoMainWorkflow({
      generatedAt: '2026-04-01T12:11:00.000Z',
      month: '2026-03',
      outputDirName: 'test-web-demo-month-picker-trigger',
      skipStart: true,
      files: []
    })

    rendered.clickMonthPickerTrigger()
    expect(rendered.getMonthPickerInteractionCounts()).toEqual({
      showPickerCalls: 1,
      focusCalls: 0,
      clickCalls: 0
    })

    rendered.setMonthPickerShowPickerAvailable(false)
    rendered.clickMonthPickerTrigger()
    expect(rendered.getMonthPickerInteractionCounts()).toEqual({
      showPickerCalls: 1,
      focusCalls: 1,
      clickCalls: 1
    })
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
    expect(result.html).toContain('buildSettlementOverviewMarkup((visibleState.reviewSections && visibleState.reviewSections.reservationSettlementOverview) || [])')
    expect(result.html).toContain('buildSettlementOverviewMarkup((visibleState.reviewSections && visibleState.reviewSections.ancillarySettlementOverview) || [])')
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
  checked?: boolean
  files: unknown[]
  href?: string
  download?: string
  rel?: string
  listeners: Record<string, () => void>
  setAttribute(name: string, value: string): void
  addEventListener(name: string, listener: () => void): void
  focus?: () => void
  showPicker?: () => void
  click?: () => void
}

async function executeWebDemoMainWorkflow(input: {
  generatedAt: string
  month: string
  buildDebugMode?: boolean
  outputDirName?: string
  locationSearch?: string
  locationHash?: string
  confirmResponses?: boolean[]
  skipStart?: boolean
  awaitInitialRestore?: boolean
  storageState?: Map<string, string>
  workspacePersistenceState?: Map<string, string>
  workspacePersistenceLoadDelaysMs?: number[]
  localStorageSetItemLimitBytes?: number
  files: Array<{
    name: string
    type?: string
    text?: () => Promise<string>
    arrayBuffer?: () => Promise<ArrayBuffer>
  }>
}): Promise<{
  html: string
  appShell: StubDomElement
  buildFingerprint: StubDomElement
  preparedFilesContent: StubDomElement
  runtimeSummaryUploadedFiles: StubDomElement
  mainDashboardView: StubDomElement
  controlDetailView: StubDomElement
  expenseDetailView: StubDomElement
  controlDetailLauncherSummaryContent: StubDomElement
  controlDetailPageSummaryContent: StubDomElement
  controlManualMatchSummary: StubDomElement
  controlManualMatchedContent: StubDomElement
  expenseReviewSummaryContent: StubDomElement
  expenseDetailSummaryContent: StubDomElement
  expenseManualMatchSummary: StubDomElement
  expenseManualMatchedContent: StubDomElement
  expenseDetailSearchInput: StubDomElement
  expenseDetailSortSelect: StubDomElement
  expenseDetailVisibleCount: StubDomElement
  matchedPayoutBatchesSection: StubDomElement
  matchedPayoutBatchesContent: StubDomElement
  unmatchedPayoutBatchesSection: StubDomElement
  unmatchedPayoutBatchesContent: StubDomElement
  reservationSettlementOverviewContent: StubDomElement
  ancillarySettlementOverviewContent: StubDomElement
  unmatchedReservationsContent: StubDomElement
  expenseMatchedContent: StubDomElement
  expenseReviewContent: StubDomElement
  expenseUnmatchedDocumentsContent: StubDomElement
  expenseUnmatchedOutflowsContent: StubDomElement
  expenseUnmatchedInflowsContent: StubDomElement
  exportHandoffContent: StubDomElement
  runtimeFileIntakeDiagnosticsSection: StubDomElement
  runtimeFileIntakeDiagnosticsContent: StubDomElement
  runtimePayoutProjectionDebugSection: StubDomElement
  runtimePayoutProjectionDebugContent: StubDomElement
  runtimeWorkspaceMergeDebugSection: StubDomElement
  runtimeWorkspaceMergeDebugContent: StubDomElement
  getConfirmMessages: () => string[]
  clickMonthPickerTrigger: () => void
  setMonthPickerShowPickerAvailable: (enabled: boolean) => void
  getMonthPickerInteractionCounts: () => { showPickerCalls: number; focusCalls: number; clickCalls: number }
  openExpenseReviewPage: () => StubDomElement
  openControlDetailPage: () => StubDomElement
  backToMainOverviewFromExpense: () => void
  backToMainOverviewFromControl: () => void
  changeMonth: (month: string) => Promise<void>
  clearCurrentMonthWorkspace: () => Promise<void>
  selectManualMatchItem: (pageKey: 'control' | 'expense', bucketKey: string, reviewItemId: string) => void
  openManualMatchConfirm: (pageKey: 'control' | 'expense') => void
  confirmManualMatchGroup: (pageKey: 'control' | 'expense', note?: string) => void
  addSelectedToManualMatchGroup: (pageKey: 'control' | 'expense', groupId: string) => void
  clearManualMatchSelection: (pageKey: 'control' | 'expense') => void
  removeManualMatchGroup: (pageKey: 'control' | 'expense', groupId: string) => void
  forceManualMatchSelection: (reviewItemIds: string[]) => void
  debugExtendManualMatchGroup: (groupId: string) => void
  confirmExpenseReviewItem: (reviewItemId: string) => void
  rejectExpenseReviewItem: (reviewItemId: string) => void
  setExpenseDetailFilter: (
    filter:
      | 'all'
      | 'expenseMatched'
      | 'expenseNeedsReview'
      | 'expenseUnmatchedDocuments'
      | 'expenseUnmatchedOutflows'
      | 'expenseUnmatchedInflows'
      | 'manualConfirmed'
      | 'manualRejected'
  ) => void
  setExpenseDetailSearch: (value: string) => void
  setExpenseDetailSort: (value: 'newest' | 'oldest' | 'amount-desc' | 'amount-asc') => void
  undoConfirmedExpenseReviewItem: (itemId: string) => void
  undoRejectedExpenseReviewItem: (itemId: string) => void
  setWorkspaceExportPreset: (preset: 'complete' | 'review-needed' | 'matched-only') => void
  downloadWorkspaceExcelExport: () => void
  getLastExcelExport: () => unknown
  setSelectedFiles: (files: Array<{
    name: string
    type?: string
    text?: () => Promise<string>
    arrayBuffer?: () => Promise<ArrayBuffer>
  }>) => void
  selectFiles: (files: Array<{
    name: string
    type?: string
    text?: () => Promise<string>
    arrayBuffer?: () => Promise<ArrayBuffer>
  }>) => void
  awaitLastWorkspacePersistence: () => Promise<void>
  startWorkflow: () => void
  waitForWorkflowCompletion: () => Promise<void>
  reloadWithSameStorage: () => Promise<any>
  waitForInitialRestore: () => Promise<void>
  getLastVisibleRuntimeState: () => unknown
  getLastWorkspaceRenderDebug: () => unknown
  lastVisibleRuntimeState?: unknown
  lastVisiblePayoutProjection?: unknown
}> {
  const outputDirName = input.outputDirName ?? 'test-web-demo-main-workflow'
  const outputPath = resolve(`dist/${outputDirName}/index.html`)
  rmSync(resolve(`dist/${outputDirName}`), {
    recursive: true,
    force: true
  })

  const result = await buildWebDemo({
    generatedAt: input.generatedAt,
    debugMode: Boolean(input.buildDebugMode),
    outputPath
  })
  const html = readFileSync(outputPath, 'utf8')
  const script = extractMainInlineWebDemoScript(html)
  const elements = createWebDemoDomStub()
  const monthPickerInteractionCounts = {
    showPickerCalls: 0,
    focusCalls: 0,
    clickCalls: 0
  }
  const storageState = input.storageState ?? new Map<string, string>()
  const workspacePersistenceState = input.workspacePersistenceState ?? new Map<string, string>()
  const workspacePersistenceLoadDelaysMs = Array.isArray(input.workspacePersistenceLoadDelaysMs)
    ? input.workspacePersistenceLoadDelaysMs.slice()
    : []
  const confirmResponses = Array.isArray(input.confirmResponses) ? input.confirmResponses.slice() : []
  const confirmMessages: string[] = []
  function setMonthPickerShowPickerAvailable(enabled: boolean) {
    elements['month-label'].showPicker = enabled
      ? () => {
        monthPickerInteractionCounts.showPickerCalls += 1
      }
      : undefined
  }

  elements['month-label'].focus = () => {
    monthPickerInteractionCounts.focusCalls += 1
  }
  elements['month-label'].click = () => {
    monthPickerInteractionCounts.clickCalls += 1
  }
  setMonthPickerShowPickerAvailable(true)
  const localStorageSetItemLimitBytes = input.localStorageSetItemLimitBytes ?? Number.POSITIVE_INFINITY
  const windowObject: {
    location: { search: string; hash: string }
    confirm: (message?: string) => boolean
    localStorage: {
      getItem: (key: string) => string | null
      setItem: (key: string, value: string) => void
      removeItem: (key: string) => void
      clear: () => void
      key: (index: number) => string | null
      readonly length: number
    }
    btoa: (value: string) => string
    atob: (value: string) => string
    TextEncoder?: typeof TextEncoder
    TextDecoder?: typeof TextDecoder
    setTimeout?: typeof setTimeout
    clearTimeout?: typeof clearTimeout
    __hotelFinanceCreateBrowserRuntime?: unknown
    __hotelFinanceBuildWorkspaceExcelExport?: unknown
    __hotelFinanceLastVisibleRuntimeState?: unknown
    __hotelFinanceLastVisiblePayoutProjection?: unknown
    __hotelFinanceLastWorkspaceRenderDebug?: unknown
    __hotelFinanceExpenseReviewOverrides?: unknown
    __hotelFinanceExpenseReviewOverrideStorageKey?: unknown
    __hotelFinanceLastExcelExport?: unknown
    __hotelFinanceMonthlyWorkspacePersistence?: {
      backendName: string
      loadWorkspace: (month: string) => Promise<unknown>
      saveWorkspace: (workspace: unknown) => Promise<void>
      deleteWorkspace: (month: string) => Promise<boolean>
      listMonths: () => Promise<string[]>
    }
    __hotelFinanceInitialWorkspaceRestorePromise?: Promise<unknown>
    __hotelFinanceLastWorkspaceRestorePromise?: Promise<unknown>
    __hotelFinanceLastWorkspaceClearPromise?: Promise<unknown>
    __hotelFinanceLastWorkspacePersistencePromise?: Promise<unknown>
    __hotelFinanceManualMatchDebug?: {
      setSelectedReviewItemIds: (ids: string[]) => void
      extendGroup: (groupId: string) => void
    }
  } = {
    location: {
      search: input.locationSearch ?? '',
      hash: input.locationHash ?? ''
    },
    confirm(message?: string) {
      confirmMessages.push(String(message ?? ''))
      return confirmResponses.length > 0 ? Boolean(confirmResponses.shift()) : true
    },
    localStorage: {
      getItem(key: string) {
        return storageState.has(key) ? storageState.get(key)! : null
      },
      setItem(key: string, value: string) {
        if (Buffer.byteLength(String(value), 'utf8') > localStorageSetItemLimitBytes) {
          throw new Error('QuotaExceededError: localStorage limit exceeded in test harness.')
        }

        storageState.set(key, String(value))
      },
      removeItem(key: string) {
        storageState.delete(key)
      },
      clear() {
        storageState.clear()
      },
      key(index: number) {
        return Array.from(storageState.keys())[index] ?? null
      },
      get length() {
        return storageState.size
      }
    },
    btoa(value: string) {
      return Buffer.from(value, 'binary').toString('base64')
    },
    atob(value: string) {
      return Buffer.from(value, 'base64').toString('binary')
    },
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    __hotelFinanceMonthlyWorkspacePersistence: {
      backendName: 'indexedDb',
      async loadWorkspace(month: string) {
        const delayMs = Number(workspacePersistenceLoadDelaysMs.shift() ?? 0)

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }

        const rawValue = workspacePersistenceState.get(String(month))
        return rawValue ? JSON.parse(rawValue) : undefined
      },
      async saveWorkspace(workspace: unknown) {
        const month = String((workspace as { month?: string } | undefined)?.month ?? '')

        if (!month) {
          return
        }

        workspacePersistenceState.set(month, JSON.stringify(workspace))
      },
      async deleteWorkspace(month: string) {
        return workspacePersistenceState.delete(String(month))
      },
      async listMonths() {
        return Array.from(workspacePersistenceState.keys()).sort()
      }
    }
  }

  await loadBuiltWebDemoRuntimeModule(outputPath, result.runtimeAssetPath!, windowObject)
  expect(typeof windowObject.__hotelFinanceCreateBrowserRuntime).toBe('function')

  runInNewContext(stripRuntimeBootstrap(script), {
    window: windowObject,
    document: {
      getElementById(id: string) {
        return elements[id] ?? createStubDomElement(id, elements)
      },
      createElement(tagName: string) {
        return createStubDomElement(`created:${tagName}:${Object.keys(elements).length}`, elements)
      }
    },
    TextEncoder,
    TextDecoder,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout
  })

  if (input.awaitInitialRestore !== false && windowObject.__hotelFinanceInitialWorkspaceRestorePromise) {
    await windowObject.__hotelFinanceInitialWorkspaceRestorePromise
  }

  elements['monthly-files'].files = input.files
  elements['month-label'].value = input.month
  let lastWorkflowStartPreparedFilesMarkup = ''
  let lastWorkflowStartRuntimeOutputMarkup = ''

  async function waitForWorkflowCompletion() {
    let observedIntermediateState = false

    for (let index = 0; index < 200; index += 1) {
      const preparedFilesMarkup = elements['prepared-files-content'].innerHTML
      const runtimeOutputMarkup = elements['runtime-output'].innerHTML
      const completedMarkupDetected = preparedFilesMarkup.includes('Rozpoznáno souborů:')
        || preparedFilesMarkup.includes('Runtime běh selhal.')
      const markupChangedSinceStart = preparedFilesMarkup !== lastWorkflowStartPreparedFilesMarkup
        || runtimeOutputMarkup !== lastWorkflowStartRuntimeOutputMarkup

      if (markupChangedSinceStart) {
        observedIntermediateState = true
      }

      if (
        completedMarkupDetected
        && (markupChangedSinceStart || observedIntermediateState)
      ) {
        await awaitLastWorkspacePersistence()
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    throw new Error('Web demo workflow did not finish in time.')
  }

  async function waitForLastRestore() {
    if (windowObject.__hotelFinanceLastWorkspaceRestorePromise) {
      await windowObject.__hotelFinanceLastWorkspaceRestorePromise
    }
  }

  async function waitForInitialRestore() {
    if (windowObject.__hotelFinanceInitialWorkspaceRestorePromise) {
      await windowObject.__hotelFinanceInitialWorkspaceRestorePromise
    }
  }

  async function waitForLastClear() {
    if (windowObject.__hotelFinanceLastWorkspaceClearPromise) {
      await windowObject.__hotelFinanceLastWorkspaceClearPromise
    }
  }

  async function awaitLastWorkspacePersistence() {
    if (windowObject.__hotelFinanceLastWorkspacePersistencePromise) {
      await windowObject.__hotelFinanceLastWorkspacePersistencePromise
    }
  }

  function startWorkflow() {
    lastWorkflowStartPreparedFilesMarkup = elements['prepared-files-content'].innerHTML
    lastWorkflowStartRuntimeOutputMarkup = elements['runtime-output'].innerHTML
    elements['prepare-upload'].listeners.click()
  }

  if (!input.skipStart) {
    startWorkflow()
    await waitForWorkflowCompletion()
  }

  return {
    html,
    appShell: elements['app-shell'],
    buildFingerprint: elements['build-fingerprint'],
    preparedFilesContent: elements['prepared-files-content'],
    runtimeSummaryUploadedFiles: elements['runtime-summary-uploaded-files'],
    mainDashboardView: elements['main-dashboard-view'],
    controlDetailView: elements['control-detail-view'],
    expenseDetailView: elements['expense-detail-view'],
    controlDetailLauncherSummaryContent: elements['control-detail-launcher-summary-content'],
    controlDetailPageSummaryContent: elements['control-detail-page-summary-content'],
    controlManualMatchSummary: elements['control-manual-match-summary'],
    controlManualMatchedContent: elements['control-manual-matched-content'],
    expenseReviewSummaryContent: elements['expense-review-summary-content'],
    expenseDetailSummaryContent: elements['expense-detail-summary-content'],
    expenseManualMatchSummary: elements['expense-manual-match-summary'],
    expenseManualMatchedContent: elements['expense-manual-matched-content'],
    expenseDetailSearchInput: elements['expense-detail-search'],
    expenseDetailSortSelect: elements['expense-detail-sort'],
    expenseDetailVisibleCount: elements['expense-detail-visible-count'],
    matchedPayoutBatchesSection: elements['matched-payout-batches-section'],
    matchedPayoutBatchesContent: elements['matched-payout-batches-content'],
    unmatchedPayoutBatchesSection: elements['unmatched-payout-batches-section'],
    unmatchedPayoutBatchesContent: elements['unmatched-payout-batches-content'],
    reservationSettlementOverviewContent: elements['reservation-settlement-overview-content'],
    ancillarySettlementOverviewContent: elements['ancillary-settlement-overview-content'],
    unmatchedReservationsContent: elements['unmatched-reservations-content'],
    expenseMatchedContent: elements['expense-matched-content'],
    expenseReviewContent: elements['expense-review-content'],
    expenseUnmatchedDocumentsContent: elements['expense-unmatched-documents-content'],
    expenseUnmatchedOutflowsContent: elements['expense-unmatched-outflows-content'],
    expenseUnmatchedInflowsContent: elements['expense-unmatched-inflows-content'],
    exportHandoffContent: elements['export-handoff-content'],
    runtimeFileIntakeDiagnosticsSection: elements['runtime-file-intake-diagnostics-section'],
    runtimeFileIntakeDiagnosticsContent: elements['runtime-file-intake-diagnostics-content'],
    runtimePayoutProjectionDebugSection: elements['runtime-payout-projection-debug-section'],
    runtimePayoutProjectionDebugContent: elements['runtime-payout-projection-debug-content'],
    runtimeWorkspaceMergeDebugSection: elements['runtime-workspace-merge-debug-section'],
    runtimeWorkspaceMergeDebugContent: elements['runtime-workspace-merge-debug-content'],
    getConfirmMessages() {
      return confirmMessages.slice()
    },
    clickMonthPickerTrigger() {
      elements['month-picker-trigger-button'].listeners.click()
    },
    setMonthPickerShowPickerAvailable,
    getMonthPickerInteractionCounts() {
      return { ...monthPickerInteractionCounts }
    },
    openExpenseReviewPage() {
      elements['open-expense-review-button'].listeners.click()
      return elements['expense-detail-view']
    },
    openControlDetailPage() {
      elements['open-control-detail-button'].listeners.click()
      return elements['control-detail-view']
    },
    backToMainOverviewFromExpense() {
      elements['back-from-expense-detail-button'].listeners.click()
    },
    backToMainOverviewFromControl() {
      elements['back-from-control-detail-button'].listeners.click()
    },
    async changeMonth(month: string) {
      elements['month-label'].value = month
      elements['month-label'].listeners.change()
      await waitForLastRestore()
    },
    async clearCurrentMonthWorkspace() {
      elements['clear-month-workspace-button'].listeners.click()
      await waitForLastClear()
    },
    selectManualMatchItem(pageKey: 'control' | 'expense', bucketKey: string, reviewItemId: string) {
      elements[buildManualMatchSelectionElementId(pageKey, bucketKey, reviewItemId)].checked = true
      elements[buildManualMatchSelectionElementId(pageKey, bucketKey, reviewItemId)].listeners.change()
    },
    openManualMatchConfirm(pageKey: 'control' | 'expense') {
      elements[buildManualMatchActionElementId(pageKey, 'review', 'selection')].listeners.click()
    },
    confirmManualMatchGroup(pageKey: 'control' | 'expense', note = '') {
      if (note) {
        elements[buildManualMatchActionElementId(pageKey, 'note', 'selection')].value = note
        elements[buildManualMatchActionElementId(pageKey, 'note', 'selection')].listeners.input()
      }
      elements[buildManualMatchActionElementId(pageKey, 'confirm-create', 'selection')].listeners.click()
    },
    addSelectedToManualMatchGroup(pageKey: 'control' | 'expense', groupId: string) {
      elements[buildManualMatchActionElementId(pageKey, 'append-to-group', groupId)].listeners.click()
    },
    clearManualMatchSelection(pageKey: 'control' | 'expense') {
      elements[buildManualMatchActionElementId(pageKey, 'clear-selection', 'selection')].listeners.click()
    },
    removeManualMatchGroup(pageKey: 'control' | 'expense', groupId: string) {
      elements[buildManualMatchActionElementId(pageKey, 'remove-group', groupId)].listeners.click()
    },
    forceManualMatchSelection(reviewItemIds: string[]) {
      windowObject.__hotelFinanceManualMatchDebug?.setSelectedReviewItemIds(reviewItemIds)
    },
    debugExtendManualMatchGroup(groupId: string) {
      windowObject.__hotelFinanceManualMatchDebug?.extendGroup(groupId)
    },
    confirmExpenseReviewItem(reviewItemId: string) {
      elements[buildExpenseReviewActionElementId('confirm', reviewItemId)].listeners.click()
    },
    rejectExpenseReviewItem(reviewItemId: string) {
      elements[buildExpenseReviewActionElementId('reject', reviewItemId)].listeners.click()
    },
    setExpenseDetailFilter(
      filter:
        | 'all'
        | 'expenseMatched'
        | 'expenseNeedsReview'
        | 'expenseUnmatchedDocuments'
        | 'expenseUnmatchedOutflows'
        | 'expenseUnmatchedInflows'
        | 'manualConfirmed'
        | 'manualRejected'
    ) {
      const elementIdByFilter = {
        all: 'expense-filter-all',
        expenseMatched: 'expense-filter-expenseMatched',
        expenseNeedsReview: 'expense-filter-expenseNeedsReview',
        expenseUnmatchedDocuments: 'expense-filter-expenseUnmatchedDocuments',
        expenseUnmatchedOutflows: 'expense-filter-expenseUnmatchedOutflows',
        expenseUnmatchedInflows: 'expense-filter-expenseUnmatchedInflows',
        manualConfirmed: 'expense-filter-manualConfirmed',
        manualRejected: 'expense-filter-manualRejected'
      } as const

      elements[elementIdByFilter[filter]].listeners.click()
    },
    setExpenseDetailSearch(value: string) {
      elements['expense-detail-search'].value = value
      elements['expense-detail-search'].listeners.input()
    },
    setExpenseDetailSort(value: 'newest' | 'oldest' | 'amount-desc' | 'amount-asc') {
      elements['expense-detail-sort'].value = value
      elements['expense-detail-sort'].listeners.change()
    },
    undoConfirmedExpenseReviewItem(itemId: string) {
      elements[buildExpenseReviewActionElementId('undo-confirm', itemId)].listeners.click()
    },
    undoRejectedExpenseReviewItem(itemId: string) {
      elements[buildExpenseReviewActionElementId('undo-reject', itemId)].listeners.click()
    },
    setWorkspaceExportPreset(preset: 'complete' | 'review-needed' | 'matched-only') {
      elements['workspace-export-preset'].value = preset
      elements['workspace-export-preset'].listeners.change()
    },
    downloadWorkspaceExcelExport() {
      elements['download-workspace-excel-button'].listeners.click()
    },
    getLastExcelExport() {
      return windowObject.__hotelFinanceLastExcelExport
    },
    setSelectedFiles(files) {
      elements['monthly-files'].files = files
    },
    selectFiles(files) {
      elements['monthly-files'].files = files
      elements['monthly-files'].listeners.change()
    },
    awaitLastWorkspacePersistence,
    startWorkflow,
    waitForWorkflowCompletion,
    waitForInitialRestore,
    async reloadWithSameStorage() {
      await awaitLastWorkspacePersistence()

      return executeWebDemoMainWorkflow({
        ...input,
        month: String(elements['month-label'].value || ''),
        skipStart: true,
        files: [],
        storageState,
        workspacePersistenceState,
        localStorageSetItemLimitBytes,
        locationHash: windowObject.location.hash,
        locationSearch: windowObject.location.search
      })
    },
    getLastVisibleRuntimeState() {
      return windowObject.__hotelFinanceLastVisibleRuntimeState
    },
    getLastWorkspaceRenderDebug() {
      return windowObject.__hotelFinanceLastWorkspaceRenderDebug
    },
    lastVisibleRuntimeState: windowObject.__hotelFinanceLastVisibleRuntimeState,
    lastVisiblePayoutProjection: windowObject.__hotelFinanceLastVisiblePayoutProjection
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

async function loadBuiltWebDemoRuntimeModule(
  outputPath: string,
  runtimeAssetPath: string,
  windowObject: {
    location: { search: string; hash: string }
    __hotelFinanceCreateBrowserRuntime?: unknown
  }
) {
  const assetPath = resolve(dirname(outputPath), runtimeAssetPath.slice(2))
  const previousWindow = (globalThis as { window?: unknown }).window

    ; (globalThis as { window?: unknown }).window = windowObject

  try {
    await import(`${pathToFileURL(assetPath).href}?web-demo-test=${Date.now()}-${Math.random().toString(16).slice(2)}`)
  } finally {
    if (typeof previousWindow === 'undefined') {
      delete (globalThis as { window?: unknown }).window
    } else {
      ; (globalThis as { window?: unknown }).window = previousWindow
    }
  }
}

function createWebDemoDomStub(): Record<string, StubDomElement> {
  const elements: Record<string, StubDomElement> = {}
  const ids = [
    'app-shell',
    'monthly-files',
    'month-label',
    'month-picker-trigger-button',
    'prepare-upload',
    'clear-month-workspace-button',
    'runtime-output',
    'runtime-stage-copy',
    'build-fingerprint',
    'runtime-summary-uploaded-files',
    'runtime-summary-normalized-transactions',
    'runtime-summary-review-items',
    'runtime-summary-export-files',
    'main-dashboard-view',
    'control-detail-view',
    'expense-detail-view',
    'prepared-files-section',
    'prepared-files-content',
    'review-summary-section',
    'review-summary-content',
    'control-detail-summary-section',
    'control-detail-launcher-summary-content',
    'control-detail-page-summary-content',
    'control-manual-match-summary',
    'control-manual-matched-section',
    'control-manual-matched-content',
    'open-control-detail-button',
    'back-from-control-detail-button',
    'report-preview-body',
    'reservation-settlement-overview-section',
    'reservation-settlement-overview-content',
    'ancillary-settlement-overview-section',
    'ancillary-settlement-overview-content',
    'matched-payout-batches-section',
    'matched-payout-batches-content',
    'unmatched-payout-batches-section',
    'unmatched-payout-batches-content',
    'expense-detail-summary-content',
    'expense-manual-match-summary',
    'expense-manual-matched-section',
    'expense-manual-matched-content',
    'expense-matched-section',
    'expense-matched-content',
    'expense-review-section',
    'expense-review-content',
    'expense-unmatched-documents-section',
    'expense-unmatched-documents-content',
    'expense-unmatched-outflows-section',
    'expense-unmatched-outflows-content',
    'expense-unmatched-inflows-section',
    'expense-unmatched-inflows-content',
    'expense-review-summary-section',
    'expense-review-summary-content',
    'expense-detail-filter-buttons',
    'expense-filter-all',
    'expense-filter-expenseMatched',
    'expense-filter-expenseNeedsReview',
    'expense-filter-expenseUnmatchedDocuments',
    'expense-filter-expenseUnmatchedOutflows',
    'expense-filter-expenseUnmatchedInflows',
    'expense-filter-manualConfirmed',
    'expense-filter-manualRejected',
    'expense-detail-search',
    'expense-detail-sort',
    'expense-detail-visible-count',
    'open-expense-review-button',
    'back-from-expense-detail-button',
    'unmatched-reservations-section',
    'unmatched-reservations-content',
    'export-handoff-section',
    'export-handoff-content',
    'workspace-export-preset',
    'download-workspace-excel-button',
    'runtime-payout-diagnostics-section',
    'runtime-payout-diagnostics-content',
    'runtime-file-intake-diagnostics-section',
    'runtime-file-intake-diagnostics-content',
    'runtime-payout-projection-debug-section',
    'runtime-payout-projection-debug-content',
    'runtime-workspace-merge-debug-section',
    'runtime-workspace-merge-debug-content'
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
    checked: false,
    files: [],
    listeners: {},
    setAttribute() { },
    addEventListener(name: string, listener: () => void) {
      element.listeners[name] = listener
    },
    click() { }
  }

  elements[id] = element
  return element
}

function extractSummaryCount(markup: string, label: string): number {
  const pattern = new RegExp(`<strong>${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:</strong>\\s*(\\d+)`)
  const match = markup.match(pattern)

  if (!match?.[1]) {
    throw new Error(`Summary count for ${label} not found in markup.`)
  }

  return Number(match[1])
}

function extractExpenseBucketCount(markup: string, key: string): number {
  const pattern = new RegExp(`data-expense-bucket-key="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*data-expense-count="(\\d+)"`)
  const match = markup.match(pattern)

  if (!match?.[1]) {
    throw new Error(`Expense bucket count for ${key} not found in markup.`)
  }

  return Number(match[1])
}

function extractExpenseItemTitles(markup: string): string[] {
  return Array.from(markup.matchAll(/<div class="expense-item-title">([^<]+)<\/div>/g)).map((match) => match[1] || '')
}

function readWorkbookFromBrowserExportBase64(base64Content: string) {
  return XLSX.read(base64Content, { type: 'base64' })
}

function buildExpenseReviewActionElementId(action: 'confirm' | 'reject' | 'undo-confirm' | 'undo-reject', reviewItemId: string): string {
  return `expense-review-${action}-${encodeURIComponent(reviewItemId).replace(/%/g, '_')}`
}

function buildManualMatchSelectionElementId(pageKey: 'control' | 'expense', bucketKey: string, reviewItemId: string): string {
  return `manual-match-select-${pageKey}-${bucketKey}-${encodeURIComponent(reviewItemId).replace(/%/g, '_')}`
}

function buildManualMatchActionElementId(pageKey: 'control' | 'expense', action: string, groupOrItemId: string): string {
  return `manual-match-${pageKey}-${action}-${encodeURIComponent(groupOrItemId).replace(/%/g, '_')}`
}

function createManualMatchPayoutWorkflowFiles() {
  return [
    createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
    createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
    createWebDemoRuntimeArrayBufferTextFile(
      'Pohyby_5599955956_202603191023.csv',
      buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
      'text/csv'
    ),
    createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines())
  ]
}

function createManualMatchExpenseWorkflowFiles() {
  const invoice = getRealInputFixture('invoice-document-czech-pdf')

  return [
    createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
    createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
    createWebDemoRuntimeArrayBufferTextFile(
      'Pohyby_5599955956_202603191023.csv',
      buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(),
      'text/csv'
    ),
    createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
    createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
  ]
}

function createManualMatchExpenseWorkflowFilesWithFortyThousandOutflow() {
  const invoice = getRealInputFixture('invoice-document-czech-pdf')

  return [
    createWebDemoRuntimeArrayBufferTextFile('booking35k.csv', buildBooking35kBrowserUploadContent(), 'text/csv'),
    createWebDemoRuntimeArrayBufferTextFile('airbnb.csv', buildActualUploadedAirbnbContent(), 'text/csv'),
    createWebDemoRuntimeArrayBufferTextFile(
      'Pohyby_5599955956_202603191023.csv',
      buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndFortyThousandExpenseOutflow(),
      'text/csv'
    ),
    createWebDemoRuntimePdfFileFromToUnicodeTextLines('Bookinng35k.pdf', buildCzechSingleGlyphBookingPayoutStatementPdfLines()),
    createWebDemoRuntimePdfFileFromToUnicodeTextLines('Lenner.pdf', invoice.rawInput.content.split('\n'))
  ]
}

function resolveCurrentGitCommitHash(): string {
  try {
    const gitMetadataPath = resolve('.git')
    const gitDirectory = resolveGitDirectory(gitMetadataPath)
    const headPath = resolve(gitDirectory, 'HEAD')

    if (!existsSync(headPath)) {
      return 'unknown'
    }

    const headContent = readFileSync(headPath, 'utf8').trim()

    if (!headContent) {
      return 'unknown'
    }

    if (!headContent.startsWith('ref:')) {
      return headContent
    }

    const refName = headContent.replace(/^ref:\s*/, '')
    const refPath = resolve(gitDirectory, refName)

    if (existsSync(refPath)) {
      return readFileSync(refPath, 'utf8').trim()
    }

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function resolveCurrentGitBranchLabel(): string {
  try {
    const gitMetadataPath = resolve('.git')
    const gitDirectory = resolveGitDirectory(gitMetadataPath)
    const headPath = resolve(gitDirectory, 'HEAD')

    if (!existsSync(headPath)) {
      return 'unknown'
    }

    const headContent = readFileSync(headPath, 'utf8').trim()

    if (!headContent.startsWith('ref:')) {
      return 'detached'
    }

    const branchName = headContent.replace(/^ref:\s*refs\/heads\//, '')
    return branchName.split('/').filter(Boolean).pop() || branchName
  } catch {
    return 'unknown'
  }
}

function resolveGitDirectory(gitMetadataPath: string): string {
  try {
    const metadataContent = readFileSync(gitMetadataPath, 'utf8').trim()

    if (metadataContent.startsWith('gitdir:')) {
      return resolve(dirname(gitMetadataPath), metadataContent.replace(/^gitdir:\s*/, ''))
    }
  } catch {
    return gitMetadataPath
  }

  return gitMetadataPath
}

function createWebDemoRuntimeFile(name: string, content: string) {
  return {
    name,
    async text() {
      return content
    }
  }
}

function createWebDemoRuntimeWorkbookFile(name: string, binaryContentBase64: string) {
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
    [
      '13.03.2026 09:15',
      '14.03.2026',
      '16.03.2026',
      '2',
      'PREVIO-20260314',
      '2',
      'Jan Novak',
      'Ano',
      '',
      'Acme Travel s.r.o.',
      'direct-web',
      'confirmed',
      '420,00',
      '30,00',
      'A101'
    ]
  ])
  XLSX.utils.book_append_sheet(workbook, reservationSheet, 'Seznam rezervací')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Přehled rezervací'],
    ['Počet rezervací', '1']
  ]), 'Přehled rezervací')
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
}

function createWebDemoRuntimeArrayBufferTextFile(name: string, content: string, type = 'text/plain') {
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

function createDelayedWebDemoRuntimeArrayBufferTextFile(name: string, content: string, delayMs: number, type = 'text/plain') {
  return {
    name,
    type,
    async text() {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return content
    },
    async arrayBuffer() {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const bytes = new TextEncoder().encode(content)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
  }
}

function createWebDemoRuntimePdfFileFromTextLines(name: string, lines: string[]) {
  return createWebDemoRuntimePdfFile(name, buildWebDemoRuntimePdfFromTextLines(lines))
}

function createWebDemoRuntimePdfFileFromToUnicodeTextLines(name: string, lines: string[]) {
  return createWebDemoRuntimePdfFile(name, buildWebDemoRuntimePdfFromToUnicodeTextLines(lines))
}

function createWebDemoRuntimePdfFile(name: string, base64: string) {
  const binary = Buffer.from(base64, 'base64')

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

function buildBrokenRuntimePdfBase64(): string {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'latin1').toString('base64')
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

function buildWebDemoRuntimePdfFromToUnicodeTextLines(lines: string[]): string {
  const definition = buildWebDemoToUnicodePdfDefinition(lines)
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

function buildWebDemoToUnicodePdfDefinition(lines: string[]): {
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

function buildBookingPayoutStatementVariantPdfLines(): string[] {
  return [
    'Booking.com',
    'Payment overview',
    'Payment ID: PAYOUT-BOOK-20260310',
    'Payment date: 2026-03-12',
    'Transfer total: 1 250,00 CZK',
    'IBAN: CZ65 5500 0000 0000 5599 555956',
    'Included reservations: RES-BOOK-8841 1 250,00 CZK'
  ]
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

function buildActualUploadedRbCitiContentWithBookingPaymentIdMatch(): string {
  return [
    getRealInputFixture('raiffeisenbank-statement').rawInput.content,
    '2026-03-12,3553012,CZK,raiffeisen-main,Incoming bank transfer,010638445054,booking-payout'
  ].join('\n')
}

function buildActualUploadedRbCitiContentWithBookingReferenceHintMatch(): string {
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
    '15.03.2026 06:35;15.03.2026 06:38;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;555,55;CZK;NON-MATCHING-CITIBANK-ROW',
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

function buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndReviewExpenseOutflows(): string {
  return [
    buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
    '08.04.2026 10:15;08.04.2026 10:17;5599955956/5500;CZ4903000000000274621920;Lenner Motors s.r.o.;-12629,52;CZK;VS 141260183 Servis vozidla',
    '26.03.2026 11:20;26.03.2026 11:23;5599955956/5500;000000-1111111111/0100;Dodavatel bez dokladu;-4500,00;CZK;Platba bez dokladu'
  ].join('\n')
}

function buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintAndFortyThousandExpenseOutflow(): string {
  return [
    buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
    '08.04.2026 10:15;08.04.2026 10:17;5599955956/5500;CZ4903000000000274621920;Lenner Motors s.r.o.;-12629,52;CZK;VS 141260183 Servis vozidla',
    '26.03.2026 11:20;26.03.2026 11:23;5599955956/5500;000000-1111111111/0100;Dodavatel bez dokladu;-40000,00;CZK;Platba bez dokladu 40k'
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

function buildCurrentPortalComgateSameMonthLagContent(): string {
  return [
    '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
    '"CG-LAG-TRX-1";"CG-LAG-20260327-A";"26.03.2026 08:15";"26.03.2026 08:16";"27.03.2026";"guest-a@example.com";"CG-LAG-20260327-A";"JOKELAND s.r.o.";"2447,50";"CZK";"website-reservation";"0,00";"0,00";"23,99";"23,99"',
    '"CG-LAG-TRX-2";"CG-LAG-20260327-B";"26.03.2026 09:20";"26.03.2026 09:21";"27.03.2026";"guest-b@example.com";"CG-LAG-20260327-B";"JOKELAND s.r.o.";"3059,38";"CZK";"website-reservation";"0,00";"0,00";"29,98";"29,98"',
    '"CG-LAG-TRX-3";"CG-LAG-20260327-C";"26.03.2026 10:10";"26.03.2026 10:11";"27.03.2026";"guest-c@example.com";"CG-LAG-20260327-C";"JOKELAND s.r.o.";"611,88";"CZK";"parking";"0,00";"0,00";"6,00";"6,00"'
  ].join('\n')
}

function buildRbComgateSameMonthLagSettlementContent(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '30.03.2026 11:00;30.03.2026 11:02;5599955956/5500;000000-1234567890/0100;Comgate a.s.;6058,79;CZK;Souhrnná výplata Comgate 2026-03-27'
  ].join('\n')
}

function buildCurrentPortalComgatePreviousMonthCarryoverContent(): string {
  return [
    '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
    '"CG-CARRY-TRX-1";"CG-CARRY-20260331-A";"31.03.2026 08:15";"31.03.2026 08:16";"31.03.2026";"guest-a@example.com";"CG-CARRY-20260331-A";"JOKELAND s.r.o.";"2447,50";"CZK";"website-reservation";"0,00";"0,00";"23,99";"23,99"',
    '"CG-CARRY-TRX-2";"CG-CARRY-20260331-B";"31.03.2026 09:20";"31.03.2026 09:21";"31.03.2026";"guest-b@example.com";"CG-CARRY-20260331-B";"JOKELAND s.r.o.";"3059,38";"CZK";"website-reservation";"0,00";"0,00";"29,98";"29,98"',
    '"CG-CARRY-TRX-3";"CG-CARRY-20260331-C";"31.03.2026 10:10";"31.03.2026 10:11";"31.03.2026";"guest-c@example.com";"CG-CARRY-20260331-C";"JOKELAND s.r.o.";"611,88";"CZK";"parking";"0,00";"0,00";"6,00";"6,00"'
  ].join('\n')
}

function buildCurrentPortalComgatePreviousMonthMixedCarryoverContent(): string {
  return [
    '"Comgate ID";"ID od klienta";"Datum založení";"Datum zaplacení";"Datum převodu";"E-mail plátce";"VS platby";"Obchod";"Cena";"Měna";"Typ platby";"Mezibankovní poplatek";"Poplatek asociace";"Poplatek zpracovatel";"Poplatek celkem"',
    '"CG-CARRY-MIX-TRX-1";"CG-CARRY-20260329-A";"29.03.2026 08:15";"29.03.2026 08:16";"29.03.2026";"guest-a@example.com";"CG-CARRY-20260329-A";"JOKELAND s.r.o.";"1000,00";"CZK";"website-reservation";"0,00";"0,00";"10,00";"10,00"',
    '"CG-CARRY-MIX-TRX-2";"CG-CARRY-20260330-A";"30.03.2026 09:20";"30.03.2026 09:21";"30.03.2026";"guest-b@example.com";"CG-CARRY-20260330-A";"JOKELAND s.r.o.";"2000,00";"CZK";"website-reservation";"0,00";"0,00";"20,00";"20,00"',
    '"CG-CARRY-MIX-TRX-3";"CG-CARRY-20260331-A";"31.03.2026 10:10";"31.03.2026 10:11";"31.03.2026";"guest-c@example.com";"CG-CARRY-20260331-A";"JOKELAND s.r.o.";"3000,00";"CZK";"parking";"0,00";"0,00";"30,00";"30,00"'
  ].join('\n')
}

function buildRbComgatePreviousMonthCarryoverSettlementContent(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '03.04.2026 09:00;03.04.2026 09:02;5599955956/5500;000000-1234567890/0100;Comgate a.s.;6058,79;CZK;Souhrnná výplata Comgate 2026-03-31'
  ].join('\n')
}

function buildRbComgatePreviousMonthMixedSettlementContent(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '29.03.2026 11:00;29.03.2026 11:02;5599955956/5500;000000-1234567890/0100;Comgate a.s.;990,00;CZK;Souhrnná výplata Comgate 2026-03-29',
    '30.03.2026 11:00;30.03.2026 11:02;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1980,00;CZK;Souhrnná výplata Comgate 2026-03-30'
  ].join('\n')
}

function buildRbComgatePreviousMonthUnmatchedSettlementContent(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '03.04.2026 09:00;03.04.2026 09:02;5599955956/5500;000000-1234567890/0100;Comgate a.s.;2970,00;CZK;Souhrnná výplata Comgate 2026-03-31'
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
