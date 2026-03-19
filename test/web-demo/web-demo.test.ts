import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFixtureWebDemo, buildWebDemo } from '../../src/web-demo'
import { emitBrowserRuntimeBundle } from '../../src/upload-web/browser-bundle'

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
    expect(result.html).toContain('1 250,00 Kč')
    expect(result.html).toContain('monthly-review-export.xlsx')
    expect(result.html).not.toContain('<iframe')
    expect(result.html).not.toContain('buildBrowserRuntimeUploadState(runtimeInput)')
    expect(result.browserRun.run.review.summary.exceptionCount).toBeGreaterThan(0)
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
    expect(runtimeAsset).toContain('runMonthlyReconciliationBatch')
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
    expect(result.html).toContain('applyVisibleRuntimeState({')
    expect(result.html).toContain('Stav stránky: <strong>runtime běh dokončen</strong>')
    expect(result.html).not.toContain('původní snapshot zůstává finální odpovědí')
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
})

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
