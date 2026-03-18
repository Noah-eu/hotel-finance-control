import type { ExtractedRecord } from '../domain/types'
import type { ExtractionMethod, SourceSystem } from '../domain/value-types'
import type { NormalizationResult } from './contracts'
import { createDefaultRegistry, type NormalizerRegistry } from './registry'

export interface NormalizeExtractedRecordsInput {
  extractedRecords: ExtractedRecord[]
  runId: string
  requestedAt: string
  sourceSystem?: SourceSystem
  extractionMethod?: ExtractionMethod
  registry?: NormalizerRegistry
}

export function normalizeExtractedRecords(
  input: NormalizeExtractedRecordsInput
): NormalizationResult {
  const registry = input.registry ?? createDefaultRegistry()
  const transactions: NormalizationResult['transactions'] = []
  const warnings: NormalizationResult['warnings'] = []
  const trace: NormalizationResult['trace'] = []

  for (const record of input.extractedRecords) {
    const normalizer = registry.get(record.recordType)

    if (!normalizer) {
      warnings.push({
        code: 'UNSUPPORTED_RECORD_TYPE',
        message: `No normalizer registered for record type \"${record.recordType}\".`,
        extractedRecordId: record.id,
        sourceDocumentId: record.sourceDocumentId
      })
      trace.push({ extractedRecordId: record.id, transactionIds: [] })
      continue
    }

    const result = normalizer.normalize(
      { extractedRecords: [record] },
      {
        sourceSystem: input.sourceSystem ?? inferSourceSystem(record),
        extractionMethod: input.extractionMethod ?? 'deterministic',
        runId: input.runId,
        requestedAt: input.requestedAt
      }
    )

    transactions.push(...result.transactions)
    warnings.push(...result.warnings)
    trace.push(...result.trace)
  }

  return { transactions, warnings, trace }
}

function inferSourceSystem(record: ExtractedRecord): SourceSystem {
  const sourceSystem = record.data.sourceSystem
  return typeof sourceSystem === 'string' ? (sourceSystem as SourceSystem) : 'unknown'
}
