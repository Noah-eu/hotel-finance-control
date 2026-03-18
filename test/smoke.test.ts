import { describe, it, expect } from 'vitest'
import { bootstrap } from '../src/index'

describe('smoke', () => {
  it('bootstrap returns module placeholders', () => {
    const result = bootstrap()
    expect(result).toBeTypeOf('object')
    expect(result.domain).toHaveProperty('name', 'domain')
    expect(result.import).toHaveProperty('name', 'import')
  expect(result.extraction).toHaveProperty('parser', 'deterministic')
    expect(result.normalization).toHaveProperty('name', 'normalization')
    expect(result.exceptions).toHaveProperty('detector', 'baseline')
    expect(result.reporting).toHaveProperty('renderer', 'reconciliation-report')
    expect(result).toHaveProperty('reconciliation.pipeline', 'default')
    expect(result).toHaveProperty('cliDemo.runCliDemo')
    expect(result).toHaveProperty('webDemo.buildWebDemo')
    expect(result).toHaveProperty('realInputFixtures.getRealInputFixture')
  })
})
