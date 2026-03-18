import { describe, it, expect } from 'vitest'
import { NormalizerRegistry, createDefaultRegistry } from '../../src/normalization/registry'
import { BankTransactionNormalizer } from '../../src/normalization/normalizers/bank-transaction.normalizer'

describe('NormalizerRegistry', () => {
  it('registers and retrieves a normalizer by record type', () => {
    const registry = new NormalizerRegistry()
    const normalizer = new BankTransactionNormalizer()
    registry.register('bank-transaction', normalizer)

    expect(registry.has('bank-transaction')).toBe(true)
    expect(registry.get('bank-transaction')).toBe(normalizer)
  })

  it('returns undefined for unregistered record types', () => {
    const registry = new NormalizerRegistry()
    expect(registry.has('unknown-type')).toBe(false)
    expect(registry.get('unknown-type')).toBeUndefined()
  })

  it('lists all registered record types', () => {
    const registry = new NormalizerRegistry()
    registry.register('bank-transaction', new BankTransactionNormalizer())
    const types = registry.registeredTypes()
    expect(types).toContain('bank-transaction')
    expect(types).toHaveLength(1)
  })

  it('supports fluent chaining of register calls', () => {
    const registry = new NormalizerRegistry()
    const result = registry.register('bank-transaction', new BankTransactionNormalizer())
    expect(result).toBe(registry)
  })
})

describe('createDefaultRegistry', () => {
  it('includes bank-transaction and payout-line normalizers', () => {
    const registry = createDefaultRegistry()
    expect(registry.has('bank-transaction')).toBe(true)
    expect(registry.has('payout-line')).toBe(true)
  })

  it('registered types match the expected set', () => {
    const registry = createDefaultRegistry()
    const types = registry.registeredTypes()
    expect(types).toContain('bank-transaction')
    expect(types).toContain('payout-line')
  })
})
