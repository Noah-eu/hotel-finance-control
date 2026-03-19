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
    expect(result.html).toContain('Hotel Finance Control – nahrání měsíčních souborů')
    expect(result.html).toContain('Runtime ukázka sdíleného měsíčního běhu')
    expect(result.html).toContain('buildRuntimeStateFromSelectedFiles')
    expect(result.html).toContain('Po kliknutí na tlačítko se ke sdílenému běhu použijí právě tyto skutečně vybrané soubory.')
    expect(result.html).not.toContain('booking-payout-2026-03.csv')
    expect(result.html).not.toContain('monthly-review-export.xlsx')
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
    expect(readFileSync(outputPath, 'utf8')).toContain('Runtime ukázka sdíleného měsíčního běhu')
    expect(readFileSync(outputPath, 'utf8')).not.toContain('booking-payout-2026-03.csv')
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
