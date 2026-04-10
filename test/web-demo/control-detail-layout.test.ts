import { describe, expect, it } from 'vitest'
import { buildWebDemo } from '../../src/web-demo'

describe('control detail layout', () => {
  it('renders a shared seven-column reservation payment grid shell with equal-width columns', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-04-07T08:20:00.000Z'
    })

    expect(result.html).toContain('<div id="control-detail-layout" class="detail-grid control-detail-grid">')
    expect(result.html).toMatch(/\.reservation-overview-grid \{[\s\S]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/)
    expect(result.html).toMatch(/\.reservation-overview-grid > \* \{[\s\S]*min-width: 0;/)
    expect(result.html).toContain('id="matched-payout-batches-section"')
    expect(result.html).toContain('id="unmatched-payout-batches-section"')
    expect(result.html).toContain('id="reservation-settlement-overview-section"')
  })
})
