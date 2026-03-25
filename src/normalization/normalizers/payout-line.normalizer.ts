import type { NormalizationContext, NormalizationInput, NormalizationResult, Normalizer } from '../contracts'
import type { NormalizedTransaction } from '../../domain/types'
import type { SourceSystem, TransactionId } from '../../domain/value-types'

const RECORD_TYPE = 'payout-line'

const PLATFORM_TO_SOURCE: Record<string, SourceSystem> = {
  booking: 'booking',
  airbnb: 'airbnb',
  expedia: 'expedia',
  comgate: 'comgate',
  previo: 'previo'
}

function makeTransactionId(recordId: string): TransactionId {
  return `txn:payout:${recordId}` as TransactionId
}

function resolveSource(data: Record<string, unknown>, fallback: SourceSystem): SourceSystem {
  if (typeof data.platform === 'string') {
    const key = data.platform.toLowerCase().trim()
    return PLATFORM_TO_SOURCE[key] ?? fallback
  }
  return fallback
}

/**
 * Normalizes extracted records of type 'payout-line' into NormalizedTransactions.
 *
 * Expected fields in ExtractedRecord.data:
 *   - amountMinor: number  (gross payout amount, always positive)
 *   - currency:    string
 *   - bookedAt:    string (ISO date of the payout)
 *   - accountId:   string
 * Optional:
 *   - platform:       string  ('booking' | 'airbnb' | 'expedia' | 'comgate')
 *   - reference:      string
 *   - reservationId:  string
 */
export class PayoutLineNormalizer implements Normalizer {
  normalize(input: NormalizationInput, context: NormalizationContext): NormalizationResult {
    const transactions: NormalizedTransaction[] = []
    const warnings: NormalizationResult['warnings'] = []
    const trace: NormalizationResult['trace'] = []

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
          message: `payout-line record ${record.id} is missing required fields: ${missing.join(', ')}`,
          extractedRecordId: record.id,
          sourceDocumentId: record.sourceDocumentId
        })
        trace.push({ extractedRecordId: record.id, transactionIds: [] })
        continue
      }

      const id = makeTransactionId(record.id)
      const source = resolveSource(data, context.sourceSystem)

      const transaction: NormalizedTransaction = {
        id,
        direction: 'in',
        source,
        subtype: typeof data.rowKind === 'string' ? data.rowKind : undefined,
        amountMinor: amountMinor!,
        currency: currency!,
        bookedAt: bookedAt!,
        accountId: accountId!,
        reference: typeof data.reference === 'string' ? data.reference : undefined,
        reservationId: typeof data.reservationId === 'string' ? data.reservationId : undefined,
        bookingPayoutBatchKey: typeof data.bookingPayoutBatchKey === 'string' ? data.bookingPayoutBatchKey : undefined,
        payoutBatchIdentity: typeof data.payoutBatchIdentity === 'string' ? data.payoutBatchIdentity : undefined,
        payoutSupplementPaymentId: typeof data.payoutSupplementPaymentId === 'string'
          ? data.payoutSupplementPaymentId
          : undefined,
        payoutSupplementPayoutDate: typeof data.payoutSupplementPayoutDate === 'string'
          ? data.payoutSupplementPayoutDate
          : undefined,
        payoutSupplementPayoutTotalAmountMinor: typeof data.payoutSupplementPayoutTotalAmountMinor === 'number'
          ? data.payoutSupplementPayoutTotalAmountMinor
          : undefined,
        payoutSupplementPayoutTotalCurrency: typeof data.payoutSupplementPayoutTotalCurrency === 'string'
          ? data.payoutSupplementPayoutTotalCurrency
          : undefined,
        payoutSupplementLocalAmountMinor: typeof data.payoutSupplementLocalAmountMinor === 'number'
          ? data.payoutSupplementLocalAmountMinor
          : undefined,
        payoutSupplementLocalCurrency: typeof data.payoutSupplementLocalCurrency === 'string'
          ? data.payoutSupplementLocalCurrency
          : undefined,
        payoutSupplementIbanSuffix: typeof data.payoutSupplementIbanSuffix === 'string'
          ? data.payoutSupplementIbanSuffix
          : undefined,
        payoutSupplementExchangeRate: typeof data.payoutSupplementExchangeRate === 'string'
          ? data.payoutSupplementExchangeRate
          : undefined,
        payoutSupplementSourceDocumentIds: Array.isArray(data.payoutSupplementSourceDocumentIds)
          ? data.payoutSupplementSourceDocumentIds.filter(
            (value): value is NormalizedTransaction['sourceDocumentIds'][number] => typeof value === 'string'
          )
          : undefined,
        payoutSupplementReservationIds: Array.isArray(data.payoutSupplementReservationIds)
          ? data.payoutSupplementReservationIds.filter((value): value is string => typeof value === 'string')
          : undefined,
        extractedRecordIds: [record.id],
        sourceDocumentIds: [record.sourceDocumentId]
      }

      transactions.push(transaction)
      trace.push({ extractedRecordId: record.id, transactionIds: [id] })
    }

    return { transactions, warnings, trace }
  }
}
