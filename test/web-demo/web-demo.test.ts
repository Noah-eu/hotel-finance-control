import { existsSync, readFileSync, rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildWebDemo } from '../../src/web-demo'

describe('buildWebDemo', () => {
  it('renders deterministic fixture data into browser-visible HTML', () => {
    const result = buildWebDemo({
      fixtureKey: 'matched-payout',
      generatedAt: '2026-03-18T19:00:00.000Z'
    })

    expect(result.html).toContain('<!doctype html>')
    expect(result.html).toContain('Hotel Finance Reconciliation Demo')
    expect(result.html).toContain('Booking payout matches one incoming bank transaction deterministically.')
    expect(result.html).toContain('Normalized transactions')
    expect(result.html).toContain('txn:payout:payout-demo-1')
  })

  it('writes the generated demo HTML to disk when outputPath is provided', () => {
    const outputPath = '/home/davide/Projekty/hotel-finance-control/dist/test-web-demo/index.html'
    rmSync('/home/davide/Projekty/hotel-finance-control/dist/test-web-demo', {
      recursive: true,
      force: true
    })

    const result = buildWebDemo({
      fixtureKey: 'unmatched-payout',
      generatedAt: '2026-03-18T19:00:00.000Z',
      outputPath
    })

    expect(result.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('Incoming bank transaction could not be matched to an expected payout.')
  })
})
