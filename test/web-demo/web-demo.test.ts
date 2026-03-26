import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { prepareUploadedMonthlyFiles, runMonthlyReconciliationBatch } from '../../src/monthly-batch'
import { buildFixtureWebDemo, buildWebDemo } from '../../src/web-demo'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { emitBrowserRuntimeBundle } from '../../src/upload-web/browser-bundle'
import { buildBrowserRuntimeStateFromSelectedFiles } from '../../src/upload-web/browser-runtime'

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
    expect(result.html).toContain("matchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup(payoutProjection.matchedItems || []);")
    expect(result.html).toContain("unmatchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup(payoutProjection.unmatchedItems || []);")
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
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
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
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
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
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain(`Build timestamp:</strong> <code>${generatedAt}</code>`)
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
          buildRealUploadedRbGenericContentForSharedAirbnbPayoutsWithBookingReferenceHintMatch(),
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
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Grouped header labels: Faktura číslo | Forma úhrady | Datum vystavení | Datum zdanitelného plnění | Datum splatnosti')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Grouped header values: 141260183 | Přev.příkaz | 11.03.2026 | 11.03.2026 | 25.03.2026')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Grouped totals labels: Základ DPH | DPH | Celkem po zaokrouhlení')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Grouped totals values: 10 437,62 Kč | 2 191,90 Kč | 12 629,52 Kč')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document dueDate: 2026-03-25')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document taxableDate: 2026-03-11')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document paymentMethod: Přev. příkaz')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document ibanHint: CZ4903000000000274621920')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document VAT base: 10 437,62 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Document VAT: 2 191,90 CZK')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field referenceNumber: winner structured-grouped-header-block / 141260183')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field paymentMethod: winner structured-grouped-header-block / Přev. příkaz')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field paymentMethod candidates: Přev.příkaz')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field totalAmount: winner line-window / 12 629,52 Kč')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Field totalAmount line-window: Celkem Kč k úhradě -&gt; 12 629,52 Kč || K úhradě -&gt; 12 629,52')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Required fields check: passed')
    expect(rendered.runtimeFileIntakeDiagnosticsContent.innerHTML).toContain('Missing fields: žádné')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation matched:</strong> 16')
    expect(rendered.runtimePayoutProjectionDebugContent.innerHTML).toContain('Raw reconciliation unmatched:</strong> 2')
    expect(rendered.matchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(16)
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML.split('<li><strong>').length - 1).toBe(2)
    expect(rendered.matchedPayoutBatchesContent.innerHTML).toContain('Booking payout 010638445054 / 35 530,12 Kč')
    expect(rendered.unmatchedPayoutBatchesContent.innerHTML).not.toContain('Booking payout 010638445054 / 35 530,12 Kč')
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
    expect(result.html).toContain('unmatchedReservationsContent.innerHTML = buildUnmatchedReservationDetailsMarkup(visibleState);')
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
  files: unknown[]
  listeners: Record<string, () => void>
  setAttribute(name: string, value: string): void
  addEventListener(name: string, listener: () => void): void
}

async function executeWebDemoMainWorkflow(input: {
  generatedAt: string
  month: string
  buildDebugMode?: boolean
  outputDirName?: string
  locationSearch?: string
  locationHash?: string
  files: Array<{
    name: string
    type?: string
    text?: () => Promise<string>
    arrayBuffer?: () => Promise<ArrayBuffer>
  }>
}): Promise<{
  html: string
  buildFingerprint: StubDomElement
  preparedFilesContent: StubDomElement
  runtimeSummaryUploadedFiles: StubDomElement
  matchedPayoutBatchesContent: StubDomElement
  unmatchedPayoutBatchesContent: StubDomElement
  runtimeFileIntakeDiagnosticsSection: StubDomElement
  runtimeFileIntakeDiagnosticsContent: StubDomElement
  runtimePayoutProjectionDebugSection: StubDomElement
  runtimePayoutProjectionDebugContent: StubDomElement
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
  const windowObject: {
    location: { search: string; hash: string }
    __hotelFinanceCreateBrowserRuntime?: unknown
    __hotelFinanceLastVisibleRuntimeState?: unknown
    __hotelFinanceLastVisiblePayoutProjection?: unknown
  } = {
    location: {
      search: input.locationSearch ?? '',
      hash: input.locationHash ?? ''
    }
  }

  await loadBuiltWebDemoRuntimeModule(outputPath, result.runtimeAssetPath!, windowObject)
  expect(typeof windowObject.__hotelFinanceCreateBrowserRuntime).toBe('function')

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

  for (let index = 0; index < 50; index += 1) {
    if (
      elements['prepared-files-content'].innerHTML.includes('Rozpoznáno souborů:')
      || elements['prepared-files-content'].innerHTML.includes('Runtime běh selhal.')
    ) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    html,
    buildFingerprint: elements['build-fingerprint'],
    preparedFilesContent: elements['prepared-files-content'],
    runtimeSummaryUploadedFiles: elements['runtime-summary-uploaded-files'],
    matchedPayoutBatchesContent: elements['matched-payout-batches-content'],
    unmatchedPayoutBatchesContent: elements['unmatched-payout-batches-content'],
    runtimeFileIntakeDiagnosticsSection: elements['runtime-file-intake-diagnostics-section'],
    runtimeFileIntakeDiagnosticsContent: elements['runtime-file-intake-diagnostics-content'],
    runtimePayoutProjectionDebugSection: elements['runtime-payout-projection-debug-section'],
    runtimePayoutProjectionDebugContent: elements['runtime-payout-projection-debug-content'],
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

  ;(globalThis as { window?: unknown }).window = windowObject

  try {
    await import(`${pathToFileURL(assetPath).href}?web-demo-test=${Date.now()}-${Math.random().toString(16).slice(2)}`)
  } finally {
    if (typeof previousWindow === 'undefined') {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = previousWindow
    }
  }
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
    'export-handoff-content',
    'runtime-payout-diagnostics-section',
    'runtime-payout-diagnostics-content',
    'runtime-file-intake-diagnostics-section',
    'runtime-file-intake-diagnostics-content',
    'runtime-payout-projection-debug-section',
    'runtime-payout-projection-debug-content'
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
