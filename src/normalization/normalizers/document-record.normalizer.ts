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
    variableSymbol?: string
    referenceHints?: string[]
    settlementDirection?: 'payable_outgoing' | 'refund_incoming'
    targetBankAccountHint?: string
  }
  const settlementDirection = data.settlementDirection === 'refund_incoming'
    ? 'refund_incoming'
    : 'payable_outgoing'
  const direction = settlementDirection === 'refund_incoming' ? 'in' : 'out'

  return {
    id: makeTransactionId(record),
    direction,
    source: 'invoice',
    subtype: settlementDirection === 'refund_incoming' ? 'supplier_refund' : 'supplier_invoice',
    settlementDirection,
    amountMinor,
    currency,
    bookedAt,
    accountId: settlementDirection === 'refund_incoming' ? 'document-refunds' : 'document-expenses',
    counterparty: data.supplier,
    reference: record.rawReference,
    referenceHints: Array.isArray(data.referenceHints)
      ? data.referenceHints.filter((value): value is string => typeof value === 'string')
      : undefined,
    invoiceNumber: data.invoiceNumber,
    variableSymbol: data.variableSymbol,
    targetBankAccountHint: data.targetBankAccountHint,
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
    id: makeTransactionId(record),
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

function makeTransactionId(record: Pick<ExtractedRecord, 'id' | 'sourceDocumentId'>): TransactionId {
  const normalizedRecordId = record.id.includes(record.sourceDocumentId)
    ? record.id
    : `${record.id}:${record.sourceDocumentId}`

  return `txn:document:${normalizedRecordId}` as TransactionId
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