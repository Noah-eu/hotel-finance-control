import type { ExtractedRecord, NormalizedTransaction } from '../../domain'
import type { NormalizationContext, NormalizationInput, NormalizationResult, Normalizer } from '../contracts'
import type { TransactionId } from '../../domain/value-types'

export class DocumentRecordNormalizer implements Normalizer {
  normalize(input: NormalizationInput, _context: NormalizationContext): NormalizationResult {
    const transactions: NormalizedTransaction[] = []
    const warnings: NormalizationResult['warnings'] = []
    const trace: NormalizationResult['trace'] = []

    for (const record of input.extractedRecords) {
      if (record.recordType !== 'invoice-document' && record.recordType !== 'receipt-document') {
        continue
      }

      try {
        const transaction =
          record.recordType === 'invoice-document'
            ? normalizeInvoiceRecord(record)
            : normalizeReceiptRecord(record)

        transactions.push(transaction)
        trace.push({ extractedRecordId: record.id, transactionIds: [transaction.id] })
      } catch (error) {
        warnings.push({
          code: 'MISSING_REQUIRED_FIELD',
          message:
            error instanceof Error
              ? error.message
              : `Document record ${record.id} could not be normalized`,
          extractedRecordId: record.id,
          sourceDocumentId: record.sourceDocumentId
        })
        trace.push({ extractedRecordId: record.id, transactionIds: [] })
      }
    }

    return { transactions, warnings, trace }
  }
}

function normalizeInvoiceRecord(record: ExtractedRecord): NormalizedTransaction {
  const amountMinor = requireAmountMinor(record)
  const currency = requireCurrency(record)
  const bookedAt = requireOccurredAt(record)
  const data = record.data as {
    supplier?: string
    invoiceNumber?: string
  }

  return {
    id: makeTransactionId(record.id),
    direction: 'out',
    source: 'invoice',
    amountMinor,
    currency,
    bookedAt,
    accountId: 'document-expenses',
    counterparty: data.supplier,
    reference: record.rawReference,
    invoiceNumber: data.invoiceNumber,
    extractedRecordIds: [record.id],
    sourceDocumentIds: [record.sourceDocumentId]
  }
}

function normalizeReceiptRecord(record: ExtractedRecord): NormalizedTransaction {
  const amountMinor = requireAmountMinor(record)
  const currency = requireCurrency(record)
  const bookedAt = requireOccurredAt(record)
  const data = record.data as {
    merchant?: string
  }

  return {
    id: makeTransactionId(record.id),
    direction: 'out',
    source: 'receipt',
    amountMinor,
    currency,
    bookedAt,
    accountId: 'document-expenses',
    counterparty: data.merchant,
    reference: record.rawReference,
    extractedRecordIds: [record.id],
    sourceDocumentIds: [record.sourceDocumentId]
  }
}

function makeTransactionId(recordId: string): TransactionId {
  return `txn:document:${recordId}` as TransactionId
}

function requireAmountMinor(record: ExtractedRecord): number {
  if (typeof record.amountMinor !== 'number') {
    throw new Error(`Document record ${record.id} is missing amountMinor for normalization`)
  }

  return record.amountMinor
}

function requireCurrency(record: ExtractedRecord): string {
  if (!record.currency) {
    throw new Error(`Document record ${record.id} is missing currency for normalization`)
  }

  return record.currency
}

function requireOccurredAt(record: ExtractedRecord): string {
  if (!record.occurredAt) {
    throw new Error(`Document record ${record.id} is missing occurredAt for normalization`)
  }

  return record.occurredAt
}