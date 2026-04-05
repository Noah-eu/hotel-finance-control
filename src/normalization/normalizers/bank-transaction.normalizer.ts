import type { NormalizationContext, NormalizationInput, NormalizationResult, Normalizer } from '../contracts'
import type { NormalizedTransaction } from '../../domain/types'
import type { TransactionDirection, TransactionId } from '../../domain/value-types'

const RECORD_TYPE = 'bank-transaction'

function makeTransactionId(recordId: string): TransactionId {
  return `txn:bank:${recordId}` as TransactionId
}

function makeCollisionSafeTransactionId(
  recordId: string,
  sourceDocumentId: string,
  usedIds: Set<string>
): TransactionId {
  const baseId = makeTransactionId(recordId)

  if (!usedIds.has(baseId)) {
    return baseId
  }

  const sanitizedSourceDocumentId = sourceDocumentId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const collisionSafeId = makeTransactionId(`${recordId}:${sanitizedSourceDocumentId || 'source-document'}`)

  if (!usedIds.has(collisionSafeId)) {
    return collisionSafeId
  }

  let duplicateIndex = 2

  while (usedIds.has(makeTransactionId(`${recordId}:${sanitizedSourceDocumentId || 'source-document'}:${duplicateIndex}`))) {
    duplicateIndex += 1
  }

  return makeTransactionId(`${recordId}:${sanitizedSourceDocumentId || 'source-document'}:${duplicateIndex}`)
}

function parseDirection(amountMinor: number): TransactionDirection {
  if (amountMinor === 0) return 'internal'
  return amountMinor > 0 ? 'in' : 'out'
}

/**
 * Normalizes extracted records of type 'bank-transaction' into NormalizedTransactions.
 *
 * Expected fields in ExtractedRecord.data:
 *   - amountMinor: number  (positive = credit/in, negative = debit/out)
 *   - currency:    string
 *   - bookedAt:    string (ISO date)
 *   - accountId:   string
 * Optional:
 *   - valueAt:        string
 *   - counterparty:   string
 *   - reference:      string
 *   - reservationId:  string
 *   - invoiceNumber:  string
 */
export class BankTransactionNormalizer implements Normalizer {
  normalize(input: NormalizationInput, context: NormalizationContext): NormalizationResult {
    const transactions: NormalizedTransaction[] = []
    const warnings: NormalizationResult['warnings'] = []
    const trace: NormalizationResult['trace'] = []
    const usedTransactionIds = new Set<string>()

    for (const record of input.extractedRecords) {
      if (record.recordType !== RECORD_TYPE) continue

      const { data } = record
      const amountMinor = typeof data.amountMinor === 'number' ? data.amountMinor : null
      const currency = typeof data.currency === 'string' ? data.currency : null
      const bookedAt = typeof data.bookedAt === 'string' ? data.bookedAt : null
      const accountId = typeof data.accountId === 'string' ? data.accountId : null

      const missing: string[] = []
      if (amountMinor === null) missing.push('amountMinor')
      if (currency === null) missing.push('currency')
      if (bookedAt === null) missing.push('bookedAt')
      if (accountId === null) missing.push('accountId')

      if (missing.length > 0) {
        warnings.push({
          code: 'MISSING_REQUIRED_FIELD',
          message: `bank-transaction record ${record.id} is missing required fields: ${missing.join(', ')}`,
          extractedRecordId: record.id,
          sourceDocumentId: record.sourceDocumentId
        })
        trace.push({ extractedRecordId: record.id, transactionIds: [] })
        continue
      }

      const id = makeCollisionSafeTransactionId(record.id, record.sourceDocumentId, usedTransactionIds)
      const direction = parseDirection(amountMinor!)

      const transaction: NormalizedTransaction = {
        id,
        direction,
        source: context.sourceSystem,
        amountMinor: Math.abs(amountMinor!),
        currency: currency!,
        bookedAt: bookedAt!,
        valueAt: typeof data.valueAt === 'string' ? data.valueAt : undefined,
        accountId: accountId!,
        counterparty: typeof data.counterparty === 'string' ? data.counterparty : undefined,
        counterpartyAccount: typeof data.counterpartyAccount === 'string' ? data.counterpartyAccount : undefined,
        reference: typeof data.reference === 'string' ? data.reference : undefined,
        reservationId: typeof data.reservationId === 'string' ? data.reservationId : undefined,
        invoiceNumber: typeof data.invoiceNumber === 'string' ? data.invoiceNumber : undefined,
        extractedRecordIds: [record.id],
        sourceDocumentIds: [record.sourceDocumentId]
      }

      transactions.push(transaction)
      usedTransactionIds.add(id)
      trace.push({ extractedRecordId: record.id, transactionIds: [id] })
    }

    return { transactions, warnings, trace }
  }
}
