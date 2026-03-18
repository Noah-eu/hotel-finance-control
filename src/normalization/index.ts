export function placeholder() {
  return { name: 'normalization' }
}

export type {
  NormalizationInput,
  NormalizationContext,
  NormalizationWarning,
  NormalizationResult,
  Normalizer
} from './contracts'

export { BankTransactionNormalizer, PayoutLineNormalizer } from './normalizers'
export { NormalizerRegistry, createDefaultRegistry } from './registry'
export type { NormalizeExtractedRecordsInput } from './service'
export { normalizeExtractedRecords } from './service'
