import { describe, expect, it } from 'vitest'
import { runCliDemo } from '../../src/cli-demo'

describe('runCliDemo', () => {
  it('builds readable output for the matched fixture by default', () => {
    const result = runCliDemo({ generatedAt: '2026-03-18T18:30:00.000Z' })

    expect(result.fixture.key).toBe('matched-payout')
    expect(result.output).toContain('Hotel Finance Reconciliation Demo')
    expect(result.output).toContain('Fixture: matched-payout')
    expect(result.output).toContain('matched groups: 1')
    expect(result.output).toContain('exception cases: 0')
    expect(result.output).toContain('txn:payout:payout-demo-1')
  })

  it('renders exceptions for the unmatched fixture', () => {
    const result = runCliDemo({
      fixtureKey: 'unmatched-payout',
      generatedAt: '2026-03-18T18:30:00.000Z'
    })

    expect(result.fixture.key).toBe('unmatched-payout')
    expect(result.output).toContain('exception cases: 2')
    expect(result.output).toContain('Exceptions')
    expect(result.output).toContain('exc:txn:txn:payout:payout-demo-2')
    expect(result.output).toContain('Incoming bank transaction could not be matched to an expected payout.')
  })
})
