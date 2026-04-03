import type { ExtractedRecord } from '../domain/types'
import type { ExtractionMethod, SourceSystem, TransactionId } from '../domain/value-types'
import type { NormalizationResult } from './contracts'
import { createDefaultRegistry, type NormalizerRegistry } from './registry'

function sanitizeIdFragment(value: string | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function makeCollisionSafeTransactionId(
  transactionId: string,
  sourceDocumentId: string | undefined,
  usedTransactionIds: Set<string>
): TransactionId {
  if (!usedTransactionIds.has(transactionId)) {
    return transactionId as TransactionId
  }

  const sourceSuffix = sanitizeIdFragment(sourceDocumentId) || 'source-document'
  const baseCollisionSafeId = `${transactionId}:${sourceSuffix}`

  if (!usedTransactionIds.has(baseCollisionSafeId)) {
    return baseCollisionSafeId as TransactionId
  }

  let duplicateIndex = 2
  let candidateId = `${baseCollisionSafeId}:${duplicateIndex}`

  while (usedTransactionIds.has(candidateId)) {
    duplicateIndex += 1
    candidateId = `${baseCollisionSafeId}:${duplicateIndex}`
  }

  return candidateId as TransactionId
}

function ensureUniqueTransactionIds(
  result: NormalizationResult,
  usedTransactionIds: Set<string>
): NormalizationResult {
  const rewrittenTransactions = result.transactions.map((transaction) => {
    const uniqueId = makeCollisionSafeTransactionId(transaction.id, transaction.sourceDocumentIds[0], usedTransactionIds)

    usedTransactionIds.add(uniqueId)

    if (uniqueId === transaction.id) {
      return transaction
    }

    return {
      ...transaction,
      id: uniqueId
    }
  })

  const rewrittenTransactionIds = new Map(
    result.transactions.map((transaction, index) => [transaction.id, rewrittenTransactions[index]!.id])
  )

  const rewrittenTrace = result.trace.map((entry) => ({
    ...entry,
    transactionIds: entry.transactionIds.map((transactionId) =>
      (rewrittenTransactionIds.get(transactionId) ?? transactionId) as TransactionId
    )
  }))

  return {
    ...result,
    transactions: rewrittenTransactions,
    trace: rewrittenTrace
  }
}

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
  const usedTransactionIds = new Set<string>()

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

    const result = ensureUniqueTransactionIds(normalizer.normalize(
      { extractedRecords: [record] },
      {
        sourceSystem: input.sourceSystem ?? inferSourceSystem(record),
        extractionMethod: input.extractionMethod ?? 'deterministic',
        runId: input.runId,
        requestedAt: input.requestedAt
      }
    ), usedTransactionIds)

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
