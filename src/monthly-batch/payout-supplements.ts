import type { ExtractedRecord } from '../domain'

export function applyPayoutSupplements(extractedRecords: ExtractedRecord[]): ExtractedRecord[] {
  return mergeBookingPayoutStatementSupplements(extractedRecords)
}

function mergeBookingPayoutStatementSupplements(extractedRecords: ExtractedRecord[]): ExtractedRecord[] {
  const bookingRows = extractedRecords.filter(isBookingPayoutLine)
  const supplements = extractedRecords.filter(isBookingPayoutSupplement)

  if (bookingRows.length === 0 || supplements.length === 0) {
    return extractedRecords
  }

  let mergedRecords = extractedRecords.slice()

  for (const supplement of supplements) {
    const matchedBatchKey = findBookingSupplementBatchKey(bookingRows, supplement)

    if (!matchedBatchKey) {
      continue
    }

    mergedRecords = mergedRecords.map((record) => {
      if (!isBookingPayoutLine(record)) {
        return record
      }

      if (String(record.data.bookingPayoutBatchKey ?? '') !== matchedBatchKey) {
        return record
      }

      return {
        ...record,
        data: {
          ...record.data,
          ...(typeof supplement.data.paymentId === 'string'
            ? { payoutSupplementPaymentId: supplement.data.paymentId }
            : {}),
          ...(typeof supplement.data.payoutDate === 'string'
            ? { payoutSupplementPayoutDate: supplement.data.payoutDate }
            : {}),
          ...(typeof supplement.data.payoutTotalAmountMinor === 'number'
            ? { payoutSupplementPayoutTotalAmountMinor: supplement.data.payoutTotalAmountMinor }
            : {}),
          ...(typeof supplement.data.payoutTotalCurrency === 'string'
            ? { payoutSupplementPayoutTotalCurrency: supplement.data.payoutTotalCurrency }
            : {}),
          ...(typeof supplement.data.localAmountMinor === 'number'
            ? { payoutSupplementLocalAmountMinor: supplement.data.localAmountMinor }
            : {}),
          ...(typeof supplement.data.localCurrency === 'string'
            ? { payoutSupplementLocalCurrency: supplement.data.localCurrency }
            : {}),
          ...(typeof supplement.data.ibanSuffix === 'string'
            ? { payoutSupplementIbanSuffix: supplement.data.ibanSuffix }
            : {}),
          ...(typeof supplement.data.exchangeRate === 'string'
            ? { payoutSupplementExchangeRate: supplement.data.exchangeRate }
            : {}),
          payoutSupplementSourceDocumentIds: [supplement.sourceDocumentId],
          ...(Array.isArray(supplement.data.reservationIds)
            ? { payoutSupplementReservationIds: supplement.data.reservationIds }
            : {})
        }
      }
    })
  }

  return mergedRecords
}

function findBookingSupplementBatchKey(
  bookingRows: ExtractedRecord[],
  supplement: ExtractedRecord
): string | undefined {
  const supplementPaymentId = typeof supplement.data.paymentId === 'string'
    ? supplement.data.paymentId.trim()
    : ''
  const supplementPayoutDate = typeof supplement.data.payoutDate === 'string'
    ? supplement.data.payoutDate.trim()
    : ''
  const supplementAmountMinor = typeof supplement.data.amountMinor === 'number'
    ? supplement.data.amountMinor
    : undefined
  const supplementCurrency = typeof supplement.data.currency === 'string'
    ? supplement.data.currency.trim().toUpperCase()
    : ''
  const supplementReservationIds = Array.isArray(supplement.data.reservationIds)
    ? new Set(
      supplement.data.reservationIds
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
    : new Set<string>()

  const grouped = new Map<string, ExtractedRecord[]>()

  for (const row of bookingRows) {
    const batchKey = String(row.data.bookingPayoutBatchKey ?? '').trim()
    if (!batchKey) {
      continue
    }

    const items = grouped.get(batchKey) ?? []
    items.push(row)
    grouped.set(batchKey, items)
  }

  const candidates = Array.from(grouped.entries())
    .map(([batchKey, rows]) => {
      const payoutReference = String(rows[0]?.data.reference ?? rows[0]?.rawReference ?? '').trim()
      const payoutDate = String(rows[0]?.data.bookedAt ?? rows[0]?.occurredAt ?? '').trim()
      const amountMinor = rows.reduce((sum, row) => sum + (typeof row.data.amountMinor === 'number' ? row.data.amountMinor : 0), 0)
      const currency = String(rows[0]?.data.currency ?? rows[0]?.currency ?? '').trim().toUpperCase()
      const reservationIds = new Set(
        rows
          .map((row) => typeof row.data.reservationId === 'string' ? row.data.reservationId.trim() : '')
          .filter(Boolean)
      )

      const directReferenceMatch = Boolean(
        supplementPaymentId
        && payoutReference
        && payoutReference.toUpperCase() === supplementPaymentId.toUpperCase()
      )
      const amountExact = supplementAmountMinor !== undefined && amountMinor === supplementAmountMinor
      const currencyExact = Boolean(supplementCurrency && currency && supplementCurrency === currency)
      const payoutDateExact = Boolean(supplementPayoutDate && payoutDate && supplementPayoutDate === payoutDate)
      const reservationOverlapCount = Array.from(reservationIds).filter((value) => supplementReservationIds.has(value)).length
      const eligible = amountExact && currencyExact && payoutDateExact && (directReferenceMatch || reservationOverlapCount > 0)
      const score = (directReferenceMatch ? 100 : 0) + reservationOverlapCount

      return {
        batchKey,
        eligible,
        score
      }
    })
    .filter((candidate) => candidate.eligible)
    .sort((left, right) => right.score - left.score)

  if (candidates.length === 0) {
    return undefined
  }

  if (candidates.length > 1 && candidates[0]?.score === candidates[1]?.score) {
    return undefined
  }

  return candidates[0]?.batchKey
}

function isBookingPayoutLine(record: ExtractedRecord): boolean {
  return record.recordType === 'payout-line' && String(record.data.platform ?? '').toLowerCase() === 'booking'
}

function isBookingPayoutSupplement(record: ExtractedRecord): boolean {
  return record.recordType === 'payout-supplement'
    && String(record.data.platform ?? '').toLowerCase() === 'booking'
    && String(record.data.supplementRole ?? '').toLowerCase() === 'payout_statement'
}
