import { describe, expect, it } from 'vitest'
import { resolvePreviousMonthKey } from '../../src/web-demo/month-key'

describe('resolvePreviousMonthKey', () => {
  it('resolves 2026-04 to 2026-03', () => {
    expect(resolvePreviousMonthKey('2026-04')).toBe('2026-03')
  })

  it('resolves 2026-01 to 2025-12', () => {
    expect(resolvePreviousMonthKey('2026-01')).toBe('2025-12')
  })
})