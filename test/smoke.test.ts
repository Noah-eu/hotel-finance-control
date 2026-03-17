import { describe, it, expect } from 'vitest'
import { bootstrap } from '../src/index'

describe('smoke', () => {
  it('bootstrap returns module placeholders', () => {
    const result = bootstrap()
    expect(result).toBeTypeOf('object')
    expect(result.domain).toHaveProperty('name', 'domain')
    expect(result.import).toHaveProperty('name', 'import')
    expect(result.normalization).toHaveProperty('name', 'normalization')
  })
})
