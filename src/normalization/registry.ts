import type { Normalizer } from './contracts'
import { BankTransactionNormalizer } from './normalizers/bank-transaction.normalizer'
import { DocumentRecordNormalizer } from './normalizers/document-record.normalizer'
import { PayoutLineNormalizer } from './normalizers/payout-line.normalizer'
import { PayoutSupplementNormalizer } from './normalizers/payout-supplement.normalizer'

/**
 * Registry that maps record types to their corresponding Normalizer implementation.
 * Register source-specific normalizers here; the registry keeps them isolated and composable.
 */
export class NormalizerRegistry {
  private readonly normalizers = new Map<string, Normalizer>()

  register(recordType: string, normalizer: Normalizer): this {
    this.normalizers.set(recordType, normalizer)
    return this
  }

  get(recordType: string): Normalizer | undefined {
    return this.normalizers.get(recordType)
  }

  has(recordType: string): boolean {
    return this.normalizers.has(recordType)
  }

  registeredTypes(): string[] {
    return Array.from(this.normalizers.keys())
  }
}

/**
 * Creates a NormalizerRegistry pre-populated with the default set of normalizers.
 */
export function createDefaultRegistry(): NormalizerRegistry {
  return new NormalizerRegistry()
    .register('bank-transaction', new BankTransactionNormalizer())
    .register('invoice-document', new DocumentRecordNormalizer())
    .register('receipt-document', new DocumentRecordNormalizer())
    .register('payout-line', new PayoutLineNormalizer())
    .register('payout-supplement', new PayoutSupplementNormalizer())
}
