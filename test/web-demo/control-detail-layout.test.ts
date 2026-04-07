import { describe, expect, it } from 'vitest'
import { buildWebDemo } from '../../src/web-demo'

describe('control detail layout', () => {
  it('places matched and unmatched payout panels side by side before the reservation overview on wide screens', async () => {
    const result = await buildWebDemo({
      generatedAt: '2026-04-07T08:20:00.000Z'
    })

    expect(result.html).toContain('<div class="detail-grid">')
    expect(result.html).toMatch(/\.reservation-overview-grid \{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(220px, 1fr\)\);/)
    expect(result.html).toMatch(/@media \(min-width: 1180px\) \{[\s\S]*\.detail-grid \{[\s\S]*grid-template-columns: minmax\(220px, 0\.46fr\) minmax\(220px, 0\.46fr\) minmax\(720px, 2\.08fr\);/)
    expect(result.html).toMatch(/@media \(min-width: 1180px\) \{[\s\S]*\.reservation-overview-grid \{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(170px, 1fr\)\);/)
    expect(result.html).toMatch(/#matched-payout-batches-section \{[\s\S]*grid-column: 1;/)
    expect(result.html).toMatch(/#unmatched-payout-batches-section \{[\s\S]*grid-column: 2;/)
    expect(result.html).toMatch(/#reservation-settlement-overview-section \{[\s\S]*grid-column: 3;/)
    expect(result.html).toMatch(/#control-manual-matched-section,[\s\S]*#ancillary-settlement-overview-section,[\s\S]*#unmatched-reservations-section \{[\s\S]*grid-column: 1 \/ -1;/)
  })
})