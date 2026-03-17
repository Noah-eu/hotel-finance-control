import type {
  DocumentId,
  ExtractionMethod,
  SourceSystem,
  TransactionId
} from '../domain/value-types'
import type { ExtractedRecord, NormalizedTransaction } from '../domain/types'

export interface NormalizationInput {
  extractedRecords: ExtractedRecord[]
}

export interface NormalizationContext {
  sourceSystem: SourceSystem
  extractionMethod: ExtractionMethod
  runId: string
  requestedAt: string
}

export interface NormalizationWarning {
  code: string
  message: string
  extractedRecordId?: string
  sourceDocumentId?: DocumentId
}

export interface NormalizationResult {
  transactions: NormalizedTransaction[]
  warnings: NormalizationWarning[]
  trace: Array<{
    extractedRecordId: string
    transactionIds: TransactionId[]
  }>
}

export interface Normalizer {
  normalize(input: NormalizationInput, context: NormalizationContext): NormalizationResult
}
