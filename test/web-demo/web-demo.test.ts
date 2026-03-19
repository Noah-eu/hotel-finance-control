import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFixtureWebDemo, buildWebDemo } from '../../src/web-demo'

describe('buildWebDemo', () => {
  it('renders the uploaded monthly browser flow into browser-visible HTML', () => {
    const result = buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('<!doctype html>')
    expect(result.html).toContain('Hotel Finance Control – měsíční workflow pro operátora')
    expect(result.html).toContain('Soubory k nahrání')
    expect(result.html).toContain('id="monthly-files"')
    expect(result.html).toContain('Označení měsíce')
    expect(result.html).toContain('id="month-label"')
    expect(result.html).toContain('Spustit přípravu a měsíční workflow')
    expect(result.html).toContain('const browserRuntime = window.__hotelFinanceCreateBrowserRuntime();')
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

  it('writes the generated demo HTML to disk when outputPath is provided', () => {
    const outputPath = resolve('dist/test-web-demo/index.html')
    rmSync(resolve('dist/test-web-demo'), {
      recursive: true,
      force: true
    })

    const result = buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z',
      outputPath
    })

    expect(result.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('Praktické spuštění měsíčního workflow')
    expect(readFileSync(outputPath, 'utf8')).toContain('Soubory k nahrání')
    expect(readFileSync(outputPath, 'utf8')).toContain('Spustit přípravu a měsíční workflow')
    expect(readFileSync(outputPath, 'utf8')).toContain('__hotelFinanceCreateBrowserRuntime')
  })

  it('uses the explicit browser runtime creator instead of fixture dataset matching', () => {
    const result = buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('__hotelFinanceCreateBrowserRuntime')
    expect(result.html).toContain('__hotelFinanceSharedUploadWebRuntime.buildBrowserRuntimeStateFromUploadedFiles')
    expect(result.html).not.toContain('const runtimeState =')
    expect(result.html).not.toContain('JSON.stringify(mainRuntimeState)')
    expect(result.html).not.toContain('findDataset(files)')
    expect(result.html).not.toContain('contentFingerprint')
  })

  it('reuses the shared upload-web runtime builder path instead of baking demo runtime summaries into the page', () => {
    const result = buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('return window.__hotelFinanceSharedUploadWebRuntime.buildBrowserRuntimeStateFromUploadedFiles(input);')
    expect(result.html).not.toContain('preparedFiles: runtimeState.preparedFiles.map')
    expect(result.html).not.toContain('extractedRecords: runtimeState.extractedRecords.map')
  })

  it('does not inject a serialized precomputed main runtime result object into the visible page', () => {
    const result = buildWebDemo({
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).not.toContain('mainRuntimeState')
    expect(result.html).not.toContain('supportedExpenseLinks":[{"expenseTransactionId"')
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
