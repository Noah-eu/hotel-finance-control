import type { NormalizationContext, NormalizationInput, NormalizationResult, Normalizer } from '../contracts'

const RECORD_TYPE = 'payout-supplement'

export class PayoutSupplementNormalizer implements Normalizer {
  normalize(input: NormalizationInput, _context: NormalizationContext): NormalizationResult {
    const trace: NormalizationResult['trace'] = input.extractedRecords
      .filter((record) => record.recordType === RECORD_TYPE)
      .map((record) => ({
        extractedRecordId: record.id,
        transactionIds: []
      }))

    return {
      transactions: [],
      warnings: [],
      trace
    }
  }
}
