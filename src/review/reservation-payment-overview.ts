import type {
  AncillaryRevenueSourceRecord,
  ExtractedRecord,
  NormalizedTransaction,
  ReservationSettlementMatch,
  ReservationSettlementNoMatch,
  ReservationSourceRecord
} from '../domain'
import type { MonthlyBatchResult } from '../monthly-batch'
import { formatAmountMinorCs } from '../shared/money'

export type ReservationPaymentOverviewBlockKey = 'airbnb' | 'booking' | 'expedia' | 'reservation_plus' | 'parking'
export type ReservationPaymentStatusKey = 'paid' | 'partial' | 'unverified' | 'missing'
export type ReservationPaymentEvidenceKey = 'payout' | 'comgate' | 'terminal' | 'bank' | 'no_evidence'

export interface ReservationPaymentAmountSummary {
  currency: string
  totalMinor: number
}

export interface ReservationPaymentDetailEntry {
  labelCs: string
  value: string
}

export interface ReservationPaymentOverviewItem {
  id: string
  blockKey: ReservationPaymentOverviewBlockKey
  title: string
  subtitle?: string
  primaryReference?: string
  secondaryReference?: string
  dateLabelCs: string
  dateValue?: string
  expectedAmountMinor?: number
  paidAmountMinor?: number
  currency: string
  statusKey: ReservationPaymentStatusKey
  statusLabelCs: string
  statusDetailCs: string
  evidenceKey: ReservationPaymentEvidenceKey
  evidenceLabelCs: string
  sourceDocumentIds: string[]
  transactionIds: string[]
  detailEntries: ReservationPaymentDetailEntry[]
  sortDate: string
}

export interface ReservationPaymentOverviewBlock {
  key: ReservationPaymentOverviewBlockKey
  labelCs: string
  itemCount: number
  expectedTotals: ReservationPaymentAmountSummary[]
  paidTotals: ReservationPaymentAmountSummary[]
  items: ReservationPaymentOverviewItem[]
}

export interface ReservationPaymentOverview {
  blocks: ReservationPaymentOverviewBlock[]
  summary: {
    itemCount: number
    statusCounts: Record<ReservationPaymentStatusKey, number>
  }
}

interface BookingConfirmedPayoutBatchBridge {
  match: ReservationSettlementMatch
  payoutBatchKey: string
  payoutReference: string
  payoutDate: string
  hasCsvRowEvidence: boolean
  hasPayoutStatementSupplement: boolean
  sourceDocumentIds: string[]
  confirmationSource: 'matched_batch_csv_row' | 'matched_batch_pdf_membership' | 'matched_batch_reference_hint'
  matchedBatchCandidateCount: number
  membershipHit: boolean
  amountHit: boolean
}

interface BookingPayoutBatchMembershipResolution {
  value: string
  source: 'component_reservation_id' | 'payout_supplement_reservation_id' | 'payout_supplement_reference_hint'
}

interface BookingConfirmedPayoutBatchCandidate {
  payoutBatch: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutBatches'][number]
  matchedPayoutBatch: NonNullable<MonthlyBatchResult['reconciliation']['payoutBatchMatches']>[number]
  matchedRow?: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number]
  matchedReservationMembership: BookingPayoutBatchMembershipResolution
  sourceDocumentIds: string[]
  amountHit: boolean
}

interface BookingReservationConfirmationTrace {
  matchedBatchReference?: string
  matchedBatchCandidateCount: number
  membershipHit: boolean
  amountHit: boolean
  finalConfirmationSource: 'matched_batch_csv_row' | 'matched_batch_pdf_membership' | 'matched_batch_reference_hint' | 'none'
}

const BLOCK_DEFINITIONS: Array<{ key: ReservationPaymentOverviewBlockKey, labelCs: string }> = [
  { key: 'airbnb', labelCs: 'Airbnb' },
  { key: 'booking', labelCs: 'Booking' },
  { key: 'expedia', labelCs: 'Expedia' },
  { key: 'reservation_plus', labelCs: 'Reservation+ / vlastní web' },
  { key: 'parking', labelCs: 'Parkování' }
]

const STATUS_LABELS: Record<ReservationPaymentStatusKey, string> = {
  paid: 'zaplaceno',
  partial: 'částečně zaplaceno',
  unverified: 'neověřeno',
  missing: 'chybí platba'
}

const EVIDENCE_LABELS: Record<ReservationPaymentEvidenceKey, string> = {
  payout: 'payout',
  comgate: 'Comgate',
  terminal: 'terminál',
  bank: 'banka',
  no_evidence: 'bez důkazu'
}

export function buildReservationPaymentOverview(batch: MonthlyBatchResult): ReservationPaymentOverview {
  const workflowPlan = batch.reconciliation.workflowPlan

  if (!workflowPlan) {
    return buildEmptyOverview()
  }

  const extractedRecordsById = new Map(batch.extractedRecords.map((record) => [record.id, record]))
  const transactionsById = new Map<string, NormalizedTransaction>(
    batch.reconciliation.normalizedTransactions.map((transaction) => [transaction.id, transaction])
  )
  const matchesBySourceKey = new Map<string, ReservationSettlementMatch>()
  const noMatchesBySourceKey = new Map<string, ReservationSettlementNoMatch>()
  const consumedRowIds = new Set<string>()
  const consumedSettlementIds = new Set<string>()

  for (const match of workflowPlan.reservationSettlementMatches) {
    matchesBySourceKey.set(buildReservationSourceKey(match.sourceDocumentId, match.reservationId), match)

    if (match.matchedRowId) {
      consumedRowIds.add(match.matchedRowId)
    }

    if (match.matchedSettlementId) {
      consumedSettlementIds.add(match.matchedSettlementId)
    }
  }

  for (const noMatch of workflowPlan.reservationSettlementNoMatches) {
    noMatchesBySourceKey.set(buildReservationSourceKey(noMatch.sourceDocumentId, noMatch.reservationId), noMatch)
  }

  const items: ReservationPaymentOverviewItem[] = []
  const reservationSources = mergeReservationSources(
    workflowPlan.reservationSources,
    workflowPlan.previoReservationTruth ?? []
  )

  for (const reservation of reservationSources) {
    const blockKey = resolveReservationBlockKey(reservation)
    const sourceKey = buildReservationSourceKey(reservation.sourceDocumentId, reservation.reservationId)
    const directMatch = matchesBySourceKey.get(sourceKey)
      ?? resolveBookingConfirmedPayoutMatch(workflowPlan.reservationSettlementMatches, reservation, blockKey)
      ?? resolveBookingExactPayoutRowMatch(workflowPlan.payoutRows, reservation, blockKey)
    const bookingPayoutBatchBridge = !directMatch
      ? resolveBookingConfirmedPayoutBatchBridge(batch, reservation, blockKey)
      : undefined
    const match = directMatch ?? bookingPayoutBatchBridge?.match
    if (match?.matchedRowId) {
      consumedRowIds.add(match.matchedRowId)
    }

    if (match?.matchedSettlementId) {
      consumedSettlementIds.add(match.matchedSettlementId)
    }

    const noMatch = !match
      ? noMatchesBySourceKey.get(sourceKey)
      : undefined
    const paidAmountMinor = resolveMatchedPaidAmountMinor(match, transactionsById) ?? resolvePaidAmountFromOutstanding(reservation)
    const statusKey = resolveReservationStatus({
      expectedAmountMinor: reservation.grossRevenueMinor,
      outstandingBalanceMinor: reservation.outstandingBalanceMinor,
      hasStrongEvidence: Boolean(match),
      blockKey
    })
    const evidenceKey = match ? mapEvidenceKeyFromMatch(match) : 'no_evidence'
    const bookingConfirmationTrace = buildBookingReservationConfirmationTrace(
      batch,
      reservation,
      blockKey,
      bookingPayoutBatchBridge
    )

    items.push({
      id: `reservation-payment:${sourceKey}`,
      blockKey,
      title: reservation.guestName ?? reservation.reference ?? reservation.reservationId,
      subtitle: reservation.roomName ?? reservation.companyName,
      primaryReference: reservation.reservationId,
      secondaryReference: reservation.reference && reservation.reference !== reservation.reservationId
        ? reservation.reference
        : undefined,
      dateLabelCs: reservation.stayStartAt ? 'Pobyt' : 'Datum rezervace',
      dateValue: buildStayOrDateValue(reservation.stayStartAt, reservation.stayEndAt, reservation.bookedAt),
      expectedAmountMinor: reservation.grossRevenueMinor,
      paidAmountMinor,
      currency: reservation.currency,
      statusKey,
      statusLabelCs: STATUS_LABELS[statusKey],
      statusDetailCs: buildReservationStatusDetailCs(reservation, match, noMatch, statusKey, blockKey, bookingPayoutBatchBridge),
      evidenceKey,
      evidenceLabelCs: EVIDENCE_LABELS[evidenceKey],
      sourceDocumentIds: collectReservationSourceDocumentIds(reservation, match, bookingPayoutBatchBridge),
      transactionIds: collectTransactionIds(match),
      detailEntries: compactDetailEntries([
        buildDetailEntry('Kanál', toChannelLabel(reservation.channel, blockKey)),
        buildDetailEntry('Očekávaná cesta úhrady', buildExpectedPathLabel(reservation.expectedSettlementChannels, reservation.channel)),
        buildDetailEntry('Jednotka', reservation.roomName),
        buildDetailEntry('Vytvořeno', reservation.createdAt),
        buildDetailEntry('Rezervace', reservation.reservationId),
        buildDetailEntry('Reference', reservation.reference && reservation.reference !== reservation.reservationId ? reservation.reference : undefined),
        buildDetailEntry(
          'Booking payout batch',
          bookingPayoutBatchBridge
            ? `${bookingPayoutBatchBridge.payoutReference} (${bookingPayoutBatchBridge.payoutDate})`
            : undefined
        ),
        buildDetailEntry(
          'Potvrzení',
          bookingPayoutBatchBridge
            ? bookingPayoutBatchBridge.hasCsvRowEvidence
              ? bookingPayoutBatchBridge.hasPayoutStatementSupplement
                ? 'spárovaný Booking CSV row + Booking payout dávka + Booking payout statement PDF'
                : 'spárovaný Booking CSV row + Booking payout dávka'
              : bookingPayoutBatchBridge.hasPayoutStatementSupplement
                ? 'spárovaná Booking payout dávka + Booking payout statement PDF'
                : 'spárovaná Booking payout dávka'
            : undefined
        ),
        ...buildBookingConfirmationTraceEntries(bookingConfirmationTrace),
        buildDetailEntry(
          'Zbývá uhradit',
          typeof reservation.outstandingBalanceMinor === 'number'
            ? formatAmountMinorCs(reservation.outstandingBalanceMinor, reservation.currency)
            : undefined
        )
      ]),
      sortDate: reservation.stayStartAt ?? reservation.bookedAt
    })
  }

  for (const ancillary of workflowPlan.ancillaryRevenueSources) {
    const candidate = findAncillaryCandidate(workflowPlan.payoutRows, ancillary)
    if (candidate) {
      consumedRowIds.add(candidate.rowId)
    }

    const paidAmountMinor = candidate?.matchingAmountMinor ?? candidate?.amountMinor ?? resolvePaidAmountFromOutstanding(ancillary)
    const blockKey = resolveAncillaryBlockKey(ancillary)
    const linkedReservation = resolveLinkedReservationForAncillary(ancillary, reservationSources)
    const linkedStayValue = linkedReservation
      ? buildStayOrDateValue(linkedReservation.stayStartAt, linkedReservation.stayEndAt, undefined)
      : undefined
    const statusKey = resolveReservationStatus({
      expectedAmountMinor: ancillary.grossRevenueMinor,
      outstandingBalanceMinor: ancillary.outstandingBalanceMinor,
      hasStrongEvidence: Boolean(candidate),
      blockKey
    })
    const evidenceKey: ReservationPaymentEvidenceKey = candidate ? mapEvidenceKeyFromPlatform(candidate.platform) : 'no_evidence'

    items.push({
      id: `reservation-payment:ancillary:${ancillary.sourceDocumentId}:${ancillary.reference}`,
      blockKey,
      title: ancillary.itemLabel ?? ancillary.reference,
      subtitle: linkedReservation?.roomName ?? (ancillary.reservationId ? `Rezervace ${ancillary.reservationId}` : undefined),
      primaryReference: ancillary.reference,
      secondaryReference: ancillary.reservationId && ancillary.reservationId !== ancillary.reference
        ? ancillary.reservationId
        : undefined,
      dateLabelCs: ancillary.bookedAt ? 'Datum platby' : 'Datum položky',
      dateValue: ancillary.bookedAt,
      expectedAmountMinor: ancillary.grossRevenueMinor,
      paidAmountMinor,
      currency: ancillary.currency,
      statusKey,
      statusLabelCs: STATUS_LABELS[statusKey],
      statusDetailCs: buildAncillaryStatusDetailCs(candidate, statusKey),
      evidenceKey,
      evidenceLabelCs: EVIDENCE_LABELS[evidenceKey],
      sourceDocumentIds: [ancillary.sourceDocumentId],
      transactionIds: candidate ? [candidate.rowId] : [],
      detailEntries: compactDetailEntries([
        buildDetailEntry('Host', linkedReservation?.guestName),
        buildDetailEntry('Pobyt', linkedStayValue),
        buildDetailEntry('Jednotka', linkedReservation?.roomName),
        buildDetailEntry('Kanál', toChannelLabel(ancillary.channel, blockKey)),
        buildDetailEntry('Rezervace', ancillary.reservationId),
        buildDetailEntry(
          'Zbývá uhradit',
          typeof ancillary.outstandingBalanceMinor === 'number'
            ? formatAmountMinorCs(ancillary.outstandingBalanceMinor, ancillary.currency)
            : undefined
        )
      ]),
      sortDate: ancillary.bookedAt ?? ancillary.createdAt ?? ancillary.reference
    })
  }

  for (const transaction of batch.reconciliation.normalizedTransactions) {
    if (transaction.source !== 'airbnb' || transaction.subtype !== 'reservation' || consumedRowIds.has(transaction.id)) {
      continue
    }

    const extractedRecord = findFirstExtractedRecord(transaction, extractedRecordsById)
    const expectedAmountMinor = readNumber(extractedRecord?.data.grossEarningsMinor) ?? transaction.amountMinor

    items.push({
      id: `reservation-payment:native:${transaction.id}`,
      blockKey: 'airbnb',
      title: readString(extractedRecord?.data.guestName) ?? readString(extractedRecord?.data.confirmationCode) ?? transaction.reference ?? transaction.id,
      subtitle: readString(extractedRecord?.data.listingName),
      primaryReference: readString(extractedRecord?.data.confirmationCode) ?? transaction.reservationId,
      secondaryReference: readString(extractedRecord?.data.referenceCode) ?? readString(extractedRecord?.data.payoutReference),
      dateLabelCs: readString(extractedRecord?.data.stayStartAt) ? 'Pobyt' : 'Datum payoutu',
      dateValue: buildStayOrDateValue(
        readString(extractedRecord?.data.stayStartAt),
        readString(extractedRecord?.data.stayEndAt),
        transaction.bookedAt
      ),
      expectedAmountMinor,
      paidAmountMinor: transaction.amountMinor,
      currency: transaction.currency,
      statusKey: 'paid',
      statusLabelCs: STATUS_LABELS.paid,
      statusDetailCs: expectedAmountMinor !== transaction.amountMinor
        ? 'Zdrojový Airbnb payout potvrzuje úhradu; očekávaná a vyplacená částka se mohou lišit o platformní poplatky.'
        : 'Zdrojový Airbnb payout potvrzuje úhradu této položky.',
      evidenceKey: 'payout',
      evidenceLabelCs: EVIDENCE_LABELS.payout,
      sourceDocumentIds: transaction.sourceDocumentIds.slice(),
      transactionIds: [transaction.id],
      detailEntries: compactDetailEntries([
        buildDetailEntry('Listing', readString(extractedRecord?.data.listingName)),
        buildDetailEntry('Rezervace', transaction.reservationId),
        buildDetailEntry('Referenční kód', readString(extractedRecord?.data.referenceCode)),
        buildDetailEntry('Payout reference', readString(extractedRecord?.data.payoutReference))
      ]),
      sortDate: readString(extractedRecord?.data.stayStartAt) ?? transaction.bookedAt
    })
  }

  for (const row of workflowPlan.payoutRows) {
    if (consumedRowIds.has(row.rowId)) {
      continue
    }

    const transaction = transactionsById.get(row.rowId)
    if (!transaction) {
      continue
    }

    const extractedRecord = findFirstExtractedRecord(transaction, extractedRecordsById)

    if (row.platform === 'booking') {
      continue
    }

    if (row.platform === 'comgate') {
      const paymentPurpose = normalizeComparable(readString(extractedRecord?.data.paymentPurpose))
      const parkingLike = isParkingLike(
        paymentPurpose,
        readString(extractedRecord?.data.reference),
        readString(extractedRecord?.data.transactionId),
        row.payoutReference
      )
      const blockKey = parkingLike ? 'parking' : 'reservation_plus'
      const title = parkingLike
        ? readString(extractedRecord?.data.reference) ?? row.payoutReference
        : row.reservationId ?? row.payoutReference

      items.push({
        id: `reservation-payment:native:${row.rowId}`,
        blockKey,
        title,
        subtitle: paymentPurpose === 'parking' ? 'Parkovací platba' : 'Vlastní web / Reservation+',
        primaryReference: row.reservationId ?? row.payoutReference,
        secondaryReference: row.reservationId && row.payoutReference !== row.reservationId ? row.payoutReference : undefined,
        dateLabelCs: 'Datum platby',
        dateValue: row.payoutDate,
        expectedAmountMinor: row.matchingAmountMinor ?? row.amountMinor,
        paidAmountMinor: transaction.amountMinor,
        currency: row.currency,
        statusKey: 'paid',
        statusLabelCs: STATUS_LABELS.paid,
        statusDetailCs: parkingLike
          ? 'Zdrojová platba Comgate potvrzuje parkovací úhradu.'
          : 'Zdrojová platba Comgate potvrzuje online úhradu rezervace.',
        evidenceKey: 'comgate',
        evidenceLabelCs: EVIDENCE_LABELS.comgate,
        sourceDocumentIds: transaction.sourceDocumentIds.slice(),
        transactionIds: [row.rowId],
        detailEntries: compactDetailEntries([
          buildDetailEntry('Účel platby', parkingLike ? 'parking' : paymentPurpose === 'websitereservation' ? 'website-reservation' : readString(extractedRecord?.data.paymentPurpose)),
          buildDetailEntry('Comgate reference', row.payoutReference)
        ]),
        sortDate: row.payoutDate
      })
    }
  }

  for (const settlement of workflowPlan.directBankSettlements) {
    if (consumedSettlementIds.has(settlement.settlementId)) {
      continue
    }

    items.push({
      id: `reservation-payment:native:${settlement.settlementId}`,
      blockKey: 'expedia',
      title: settlement.reservationId,
      subtitle: 'Expedia / Fio settlement',
      primaryReference: settlement.reservationId,
      secondaryReference: settlement.accountIdHint,
      dateLabelCs: 'Datum připsání',
      dateValue: settlement.bookedAt,
      expectedAmountMinor: settlement.amountMinor,
      paidAmountMinor: settlement.amountMinor,
      currency: settlement.currency,
      statusKey: 'paid',
      statusLabelCs: STATUS_LABELS.paid,
      statusDetailCs: 'Přímý bankovní settlement na Fio potvrzuje úhradu Expedia rezervace.',
      evidenceKey: 'terminal',
      evidenceLabelCs: EVIDENCE_LABELS.terminal,
      sourceDocumentIds: [],
      transactionIds: [settlement.settlementId],
      detailEntries: compactDetailEntries([
        buildDetailEntry('Účet', settlement.accountIdHint),
        buildDetailEntry('Směr', 'přímé bankovní připsání')
      ]),
      sortDate: settlement.bookedAt
    })
  }

  return finalizeOverview(items)
}

function buildEmptyOverview(): ReservationPaymentOverview {
  return {
    blocks: BLOCK_DEFINITIONS.map((block) => ({
      key: block.key,
      labelCs: block.labelCs,
      itemCount: 0,
      expectedTotals: [],
      paidTotals: [],
      items: []
    })),
    summary: {
      itemCount: 0,
      statusCounts: {
        paid: 0,
        partial: 0,
        unverified: 0,
        missing: 0
      }
    }
  }
}

function finalizeOverview(items: ReservationPaymentOverviewItem[]): ReservationPaymentOverview {
  const blocks = BLOCK_DEFINITIONS.map((block) => {
    const blockItems = items
      .filter((item) => item.blockKey === block.key)
      .sort((left, right) => {
        if (left.sortDate === right.sortDate) {
          return left.title.localeCompare(right.title, 'cs')
        }

        return right.sortDate.localeCompare(left.sortDate)
      })

    return {
      key: block.key,
      labelCs: block.labelCs,
      itemCount: blockItems.length,
      expectedTotals: summarizeTotals(blockItems.map((item) => ({ currency: item.currency, amountMinor: item.expectedAmountMinor }))),
      paidTotals: summarizeTotals(blockItems.map((item) => ({ currency: item.currency, amountMinor: item.paidAmountMinor }))),
      items: blockItems
    }
  })

  return {
    blocks,
    summary: {
      itemCount: items.length,
      statusCounts: items.reduce<Record<ReservationPaymentStatusKey, number>>((accumulator, item) => {
        accumulator[item.statusKey] += 1
        return accumulator
      }, {
        paid: 0,
        partial: 0,
        unverified: 0,
        missing: 0
      })
    }
  }
}

function mergeReservationSources(primary: ReservationSourceRecord[], secondary: ReservationSourceRecord[]): ReservationSourceRecord[] {
  const merged = new Map<string, ReservationSourceRecord>()

  for (const source of primary.concat(secondary)) {
    const key = buildReservationSourceKey(source.sourceDocumentId, source.reservationId)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, { ...source, expectedSettlementChannels: source.expectedSettlementChannels.slice() })
      continue
    }

    merged.set(key, {
      ...existing,
      guestName: existing.guestName ?? source.guestName,
      channel: existing.channel ?? source.channel,
      stayStartAt: existing.stayStartAt ?? source.stayStartAt,
      stayEndAt: existing.stayEndAt ?? source.stayEndAt,
      propertyId: existing.propertyId ?? source.propertyId,
      netRevenueMinor: existing.netRevenueMinor ?? source.netRevenueMinor,
      outstandingBalanceMinor: existing.outstandingBalanceMinor ?? source.outstandingBalanceMinor,
      roomName: existing.roomName ?? source.roomName,
      companyName: existing.companyName ?? source.companyName,
      expectedSettlementChannels: Array.from(new Set(existing.expectedSettlementChannels.concat(source.expectedSettlementChannels)))
    })
  }

  return Array.from(merged.values())
}

function buildReservationSourceKey(sourceDocumentId: string, reservationId: string): string {
  return `${sourceDocumentId}:${reservationId}`
}

function resolveBookingConfirmedPayoutMatch(
  matches: ReservationSettlementMatch[],
  reservation: ReservationSourceRecord,
  blockKey: ReservationPaymentOverviewBlockKey
): ReservationSettlementMatch | undefined {
  if (blockKey !== 'booking') {
    return undefined
  }

  const reservationId = normalizeComparable(reservation.reservationId)
  const reference = normalizeComparable(reservation.reference)
  const candidates = matches.filter((match) => {
    if (match.platform !== 'booking' || match.settlementKind !== 'payout_row') {
      return false
    }

    if (match.amountMinor !== reservation.grossRevenueMinor || match.currency !== reservation.currency) {
      return false
    }

    const matchReference = normalizeComparable(match.reference)
    const hasIdentityMatch = match.reservationId === reservation.reservationId
      || (Boolean(reference) && matchReference === reference)

    if (!hasIdentityMatch) {
      return false
    }

    return hasExplicitBookingRowEvidence(match)
  })

  return candidates.length === 1 ? candidates[0] : undefined
}

function resolveBookingExactPayoutRowMatch(
  payoutRows: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'],
  reservation: ReservationSourceRecord,
  blockKey: ReservationPaymentOverviewBlockKey
): ReservationSettlementMatch | undefined {
  if (blockKey !== 'booking') {
    return undefined
  }

  const comparableReservationValues = collectUniqueTruthyStrings([
    normalizeComparable(reservation.reservationId),
    normalizeComparable(reservation.reference)
  ])

  if (comparableReservationValues.length === 0) {
    return undefined
  }

  const candidates = payoutRows.filter((row) => {
    if (row.platform !== 'booking') {
      return false
    }

    if (row.amountMinor !== reservation.grossRevenueMinor || row.currency !== reservation.currency) {
      return false
    }

    const comparableRowReservationId = normalizeComparable(row.reservationId)
    return Boolean(comparableRowReservationId) && comparableReservationValues.includes(comparableRowReservationId)
  })

  if (candidates.length !== 1) {
    return undefined
  }

  const candidate = candidates[0]!
  const comparableRowReservationId = normalizeComparable(candidate.reservationId)
  const comparableReference = normalizeComparable(reservation.reference)

  return {
    sourceDocumentId: reservation.sourceDocumentId,
    reservationId: reservation.reservationId,
    reference: reservation.reference,
    settlementKind: 'payout_row',
    matchedRowId: candidate.rowId,
    platform: 'booking',
    amountMinor: candidate.amountMinor,
    currency: candidate.currency,
    confidence: 1,
    reasons: [
      comparableRowReservationId === normalizeComparable(reservation.reservationId)
        ? 'reservationIdExact'
        : 'referenceExact',
      'amountExact',
      'channelAligned'
    ],
    evidence: compactEvidence([
      { key: 'reservationId', value: reservation.reservationId },
      comparableReference && comparableRowReservationId === comparableReference && reservation.reference
        ? { key: 'reference', value: reservation.reference }
        : undefined,
      { key: 'payoutRowSourceDocumentId', value: candidate.sourceDocumentId },
      { key: 'payoutRowId', value: candidate.rowId }
    ])
  }
}

function resolveBookingConfirmedPayoutBatchBridge(
  batch: MonthlyBatchResult,
  reservation: ReservationSourceRecord,
  blockKey: ReservationPaymentOverviewBlockKey
): BookingConfirmedPayoutBatchBridge | undefined {
  if (blockKey !== 'booking') {
    return undefined
  }

  const matchedPayoutBatchByKey = new Map(
    (batch.reconciliation.payoutBatchMatches ?? [])
      .filter((item) => item.matched)
      .map((item) => [item.payoutBatchKey, item] as const)
  )

  if (matchedPayoutBatchByKey.size === 0) {
    return undefined
  }

  const payoutRowsById = new Map(
    (batch.reconciliation.workflowPlan?.payoutRows ?? []).map((row) => [row.rowId, row] as const)
  )

  const candidates = collectBookingConfirmedPayoutBatchCandidates(
    batch,
    reservation,
    blockKey,
    matchedPayoutBatchByKey,
    payoutRowsById
  )

  if (candidates.length !== 1) {
    return undefined
  }

  const candidate = candidates[0]!
  const confirmationSource = candidate.matchedRow
    ? 'matched_batch_csv_row'
    : candidate.matchedReservationMembership.source === 'payout_supplement_reference_hint'
      ? 'matched_batch_reference_hint'
      : 'matched_batch_pdf_membership'

  return {
    payoutBatchKey: candidate.payoutBatch.payoutBatchKey,
    payoutReference: candidate.payoutBatch.payoutReference,
    payoutDate: candidate.payoutBatch.payoutDate,
    hasCsvRowEvidence: Boolean(candidate.matchedRow),
    hasPayoutStatementSupplement: candidate.sourceDocumentIds.some(
      (sourceDocumentId) => sourceDocumentId !== candidate.matchedRow?.sourceDocumentId
    ),
    sourceDocumentIds: candidate.sourceDocumentIds,
    confirmationSource,
    matchedBatchCandidateCount: candidates.length,
    membershipHit: true,
    amountHit: candidate.amountHit,
    match: {
      sourceDocumentId: reservation.sourceDocumentId,
      reservationId: reservation.reservationId,
      reference: reservation.reference,
      settlementKind: 'payout_row',
      matchedRowId: candidate.matchedRow?.rowId,
      platform: 'booking',
      amountMinor: candidate.matchedRow?.amountMinor ?? reservation.grossRevenueMinor,
      currency: reservation.currency,
      confidence: 1,
      reasons: [
        ...(candidate.matchedRow ? ['bookingPayoutBatchRowReservationIdExact'] : []),
        'bookingPayoutBatchReservationMembershipExact',
        'bookingPayoutBatchBankMatched',
        ...(candidate.matchedReservationMembership.source === 'payout_supplement_reference_hint'
          ? ['bookingPayoutBatchReferenceHintExact']
          : []),
        ...(candidate.sourceDocumentIds.some((sourceDocumentId) => sourceDocumentId !== candidate.matchedRow?.sourceDocumentId)
          ? ['bookingPayoutStatementSupplementPresent']
          : [])
      ],
      evidence: [
        { key: 'bookingPayoutBatchKey', value: candidate.payoutBatch.payoutBatchKey },
        { key: 'bookingPayoutReference', value: candidate.payoutBatch.payoutReference },
        { key: 'bookingPayoutBatchMatchedBankTransactionId', value: candidate.matchedPayoutBatch.bankTransactionId },
        ...(candidate.matchedRow
          ? [
            { key: 'bookingPayoutRowId', value: candidate.matchedRow.rowId },
            { key: 'bookingPayoutRowSourceDocumentId', value: candidate.matchedRow.sourceDocumentId }
          ]
          : []),
        { key: 'bookingPayoutBatchReservationId', value: candidate.matchedReservationMembership.value },
        ...candidate.sourceDocumentIds.map((sourceDocumentId) => ({
          key: sourceDocumentId === candidate.matchedRow?.sourceDocumentId
            ? 'payoutRowSourceDocumentId'
            : 'payoutSupplementSourceDocumentId',
          value: sourceDocumentId
        }))
      ]
    }
  }
}

function collectBookingConfirmedPayoutBatchCandidates(
  batch: MonthlyBatchResult,
  reservation: ReservationSourceRecord,
  blockKey: ReservationPaymentOverviewBlockKey,
  matchedPayoutBatchByKey?: Map<string, NonNullable<MonthlyBatchResult['reconciliation']['payoutBatchMatches']>[number]>,
  payoutRowsById?: Map<string, NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number]>
): BookingConfirmedPayoutBatchCandidate[] {
  if (blockKey !== 'booking') {
    return []
  }

  const localMatchedPayoutBatchByKey = matchedPayoutBatchByKey ?? new Map(
    (batch.reconciliation.payoutBatchMatches ?? [])
      .filter((item) => item.matched)
      .map((item) => [item.payoutBatchKey, item] as const)
  )

  if (localMatchedPayoutBatchByKey.size === 0) {
    return []
  }

  const localPayoutRowsById = payoutRowsById ?? new Map(
    (batch.reconciliation.workflowPlan?.payoutRows ?? []).map((row) => [row.rowId, row] as const)
  )

  return (batch.reconciliation.workflowPlan?.payoutBatches ?? []).flatMap((payoutBatch) => {
    if (payoutBatch.platform !== 'booking' || payoutBatch.fromPreviousMonth) {
      return []
    }

    const matchedPayoutBatch = localMatchedPayoutBatchByKey.get(payoutBatch.payoutBatchKey)
    if (!matchedPayoutBatch) {
      return []
    }

    const matchedRow = resolveBookingConfirmedPayoutBatchRow(payoutBatch, localPayoutRowsById, reservation)
    const matchedReservationMembership = matchedRow?.reservationId
      ? { value: matchedRow.reservationId, source: 'component_reservation_id' as const }
      : resolveBookingPayoutBatchReservationMembership(payoutBatch, reservation)

    if (!matchedReservationMembership) {
      return []
    }

    const sourceDocumentIds = collectUniqueTruthyStrings([
      matchedRow?.sourceDocumentId,
      ...(payoutBatch.payoutSupplementSourceDocumentIds ?? [])
    ])

    if (!matchedRow && sourceDocumentIds.length === 0) {
      return []
    }

    return [{
      payoutBatch,
      matchedPayoutBatch,
      matchedRow,
      matchedReservationMembership,
      sourceDocumentIds,
      amountHit: matchedRow ? matchedRow.amountMinor === reservation.grossRevenueMinor && matchedRow.currency === reservation.currency : true
    }]
  })
}

function resolveBookingConfirmedPayoutBatchRow(
  payoutBatch: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutBatches'][number],
  payoutRowsById: Map<string, NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number]>,
  reservation: ReservationSourceRecord
): NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number] | undefined {
  const comparableReservationValues = collectUniqueTruthyStrings([
    normalizeComparable(reservation.reservationId),
    normalizeComparable(reservation.reference)
  ])

  if (comparableReservationValues.length === 0) {
    return undefined
  }

  const candidates = payoutBatch.rowIds
    .map((rowId) => payoutRowsById.get(rowId))
    .filter((row): row is NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number] => Boolean(row))
    .filter((row) => row.platform === 'booking')
    .filter((row) => row.currency === reservation.currency)
    .filter((row) => row.amountMinor === reservation.grossRevenueMinor)
    .filter((row) => {
      const comparableRowReservationId = normalizeComparable(row.reservationId)
      return Boolean(comparableRowReservationId) && comparableReservationValues.includes(comparableRowReservationId)
    })

  return candidates.length === 1 ? candidates[0] : undefined
}

function resolveBookingPayoutBatchReservationMembership(
  payoutBatch: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutBatches'][number],
  reservation: ReservationSourceRecord
): BookingPayoutBatchMembershipResolution | undefined {
  const comparableReservationValues = collectUniqueTruthyStrings([
    normalizeComparable(reservation.reservationId),
    normalizeComparable(reservation.reference)
  ])

  if (comparableReservationValues.length === 0) {
    return undefined
  }

  const componentReservationId = collectUniqueTruthyStrings(
    (payoutBatch.componentReservationIds ?? []).map((value) => normalizeComparable(value))
  ).find((value) => comparableReservationValues.includes(value))

  if (componentReservationId) {
    return { value: componentReservationId, source: 'component_reservation_id' }
  }

  const supplementReservationId = collectUniqueTruthyStrings(
    (payoutBatch.payoutSupplementReservationIds ?? []).map((value) => normalizeComparable(value))
  ).find((value) => comparableReservationValues.includes(value))

  if (supplementReservationId) {
    return { value: supplementReservationId, source: 'payout_supplement_reservation_id' }
  }

  const supplementReferenceHint = collectUniqueTruthyStrings(
    (payoutBatch.payoutSupplementReferenceHints ?? []).map((value) => normalizeComparable(value))
  ).find((value) => comparableReservationValues.includes(value))

  if (supplementReferenceHint) {
    return { value: supplementReferenceHint, source: 'payout_supplement_reference_hint' }
  }

  return undefined
}

function buildBookingReservationConfirmationTrace(
  batch: MonthlyBatchResult,
  reservation: ReservationSourceRecord,
  blockKey: ReservationPaymentOverviewBlockKey,
  bookingPayoutBatchBridge: BookingConfirmedPayoutBatchBridge | undefined
): BookingReservationConfirmationTrace | undefined {
  if (!shouldIncludeBookingConfirmationTrace(reservation, blockKey)) {
    return undefined
  }

  const candidates = collectBookingConfirmedPayoutBatchCandidates(batch, reservation, blockKey)

  if (bookingPayoutBatchBridge) {
    return {
      matchedBatchReference: bookingPayoutBatchBridge.payoutReference,
      matchedBatchCandidateCount: candidates.length,
      membershipHit: bookingPayoutBatchBridge.membershipHit,
      amountHit: bookingPayoutBatchBridge.amountHit,
      finalConfirmationSource: bookingPayoutBatchBridge.confirmationSource
    }
  }

  return {
    matchedBatchReference: candidates[0]?.payoutBatch.payoutReference,
    matchedBatchCandidateCount: candidates.length,
    membershipHit: candidates.length > 0,
    amountHit: candidates.some((candidate) => candidate.amountHit),
    finalConfirmationSource: 'none'
  }
}

function buildBookingConfirmationTraceEntries(
  trace: BookingReservationConfirmationTrace | undefined
): ReservationPaymentDetailEntry[] {
  if (!trace) {
    return []
  }

  return compactDetailEntries([
    buildDetailEntry('DEBUG Booking matched batch', trace.matchedBatchReference),
    buildDetailEntry('DEBUG Booking candidate count', String(trace.matchedBatchCandidateCount)),
    buildDetailEntry('DEBUG Booking membership hit', trace.membershipHit ? 'yes' : 'no'),
    buildDetailEntry('DEBUG Booking amount hit', trace.amountHit ? 'yes' : 'no'),
    buildDetailEntry('DEBUG Booking confirmation source', trace.finalConfirmationSource)
  ])
}

function shouldIncludeBookingConfirmationTrace(
  reservation: ReservationSourceRecord,
  blockKey: ReservationPaymentOverviewBlockKey
): boolean {
  if (blockKey !== 'booking') {
    return false
  }

  const gateValue = readBookingConfirmationTraceReference()
  if (!gateValue) {
    return false
  }

  const comparableGateValue = normalizeComparable(gateValue)
  return comparableGateValue === normalizeComparable(reservation.reservationId)
    || comparableGateValue === normalizeComparable(reservation.reference)
}

function readBookingConfirmationTraceReference(): string | undefined {
  const globalValue = (globalThis as { __HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__?: unknown })
    .__HOTEL_FINANCE_BOOKING_CONFIRMATION_TRACE_REFERENCE__

  return typeof globalValue === 'string' && globalValue.trim().length > 0
    ? globalValue.trim()
    : undefined
}

function hasExplicitBookingRowEvidence(match: ReservationSettlementMatch): boolean {
  return match.reasons.some((reason) => (
    reason === 'reservationIdExact'
    || reason === 'referenceExact'
    || reason === 'payoutSupplementReservationIdExact'
  ))
}

function resolveMatchedPaidAmountMinor(
  match: ReservationSettlementMatch | undefined,
  transactionsById: Map<string, NormalizedTransaction>
): number | undefined {
  if (!match) {
    return undefined
  }

  if (match.matchedRowId) {
    return transactionsById.get(match.matchedRowId)?.amountMinor ?? match.amountMinor
  }

  if (match.matchedSettlementId) {
    return transactionsById.get(match.matchedSettlementId)?.amountMinor ?? match.amountMinor
  }

  return match.amountMinor
}

function resolvePaidAmountFromOutstanding(
  source: Pick<ReservationSourceRecord, 'grossRevenueMinor' | 'outstandingBalanceMinor'>
    | Pick<AncillaryRevenueSourceRecord, 'grossRevenueMinor' | 'outstandingBalanceMinor'>
): number | undefined {
  if (typeof source.outstandingBalanceMinor !== 'number') {
    return undefined
  }

  const paidAmountMinor = source.grossRevenueMinor - source.outstandingBalanceMinor
  return paidAmountMinor > 0 ? paidAmountMinor : undefined
}

function resolveReservationStatus(input: {
  expectedAmountMinor: number
  outstandingBalanceMinor: number | undefined
  hasStrongEvidence: boolean
  blockKey?: ReservationPaymentOverviewBlockKey
}): ReservationPaymentStatusKey {
  if (input.hasStrongEvidence && input.blockKey === 'booking') {
    return 'paid'
  }

  if (typeof input.outstandingBalanceMinor === 'number' && input.outstandingBalanceMinor > 0 && input.outstandingBalanceMinor < input.expectedAmountMinor) {
    return 'partial'
  }

  if (input.hasStrongEvidence) {
    return 'paid'
  }

  if (input.blockKey === 'booking') {
    return 'unverified'
  }

  if (typeof input.outstandingBalanceMinor === 'number' && input.outstandingBalanceMinor >= input.expectedAmountMinor && input.expectedAmountMinor > 0) {
    return 'missing'
  }

  return 'unverified'
}

function buildReservationStatusDetailCs(
  reservation: ReservationSourceRecord,
  match: ReservationSettlementMatch | undefined,
  noMatch: ReservationSettlementNoMatch | undefined,
  statusKey: ReservationPaymentStatusKey,
  blockKey: ReservationPaymentOverviewBlockKey,
  bookingPayoutBatchBridge?: BookingConfirmedPayoutBatchBridge
): string {
  if (bookingPayoutBatchBridge) {
    if (bookingPayoutBatchBridge.hasCsvRowEvidence) {
      return bookingPayoutBatchBridge.hasPayoutStatementSupplement
        ? `Spárovaný Booking CSV row, Booking payout dávka ${bookingPayoutBatchBridge.payoutReference} a Booking payout statement PDF potvrzují, že tato rezervace patří do potvrzeného payoutu.`
        : `Spárovaný Booking CSV row a Booking payout dávka ${bookingPayoutBatchBridge.payoutReference} potvrzují, že tato rezervace patří do bankou potvrzeného payoutu.`
    }

    return `Spárovaná Booking payout dávka ${bookingPayoutBatchBridge.payoutReference} a Booking payout statement PDF potvrzují, že tato rezervace patří do potvrzeného payoutu.`
  }

  if (match) {
    if (statusKey === 'partial') {
      return 'Zdroj rezervace potvrzuje jen částečné uhrazení a zůstává otevřený doplatek.'
    }

    return `Silná vazba potvrzuje úhradu přes ${EVIDENCE_LABELS[mapEvidenceKeyFromMatch(match)]}.`
  }

  if (statusKey === 'missing') {
    return 'Zdroj uvádí neuhrazený zůstatek v plné výši a v aktuálním běhu není potvrzená odpovídající úhrada.'
  }

  if (statusKey === 'partial') {
    return 'Zdroj uvádí částečně uhrazenou položku, ale engine zatím nemá dost silnou vazbu na konkrétní úhradu.'
  }

  if (blockKey === 'booking') {
    if (noMatch) {
      return `Booking rezervace existuje, ale current run zatím nemá dost silný payout-row důkaz (${describeNoMatchReason(noMatch.noMatchReason)}).`
    }

    return 'Booking rezervace existuje, ale current run zatím nemá potvrzený odpovídající Booking payout row.'
  }

  if (noMatch) {
    return `Položka existuje, ale párovací truth zatím nestačí pro bezpečné potvrzení úhrady (${describeNoMatchReason(noMatch.noMatchReason)}).`
  }

  return 'Položka existuje, ale současný běh zatím neumí bezpečně potvrdit payment linkage.'
}

function buildAncillaryStatusDetailCs(
  candidate: { rowId: string, platform: string } | undefined,
  statusKey: ReservationPaymentStatusKey
): string {
  if (candidate) {
    return statusKey === 'partial'
      ? 'Doplňková položka má kandidátní úhradu, ale zdroj stále ukazuje otevřený doplatek.'
      : `Doplňková položka je potvrzená přes ${EVIDENCE_LABELS[mapEvidenceKeyFromPlatform(candidate.platform)]}.`
  }

  if (statusKey === 'missing') {
    return 'Doplňková položka zůstává neuhrazená a v aktuálním běhu pro ni chybí potvrzená platba.'
  }

  if (statusKey === 'partial') {
    return 'Doplňková položka je jen částečně uhrazená podle zdrojového zůstatku.'
  }

  return 'Doplňková položka je načtená, ale bez dost silného důkazu o úhradě.'
}

function resolveReservationBlockKey(reservation: ReservationSourceRecord): ReservationPaymentOverviewBlockKey {
  const channels = reservation.expectedSettlementChannels.length > 0
    ? reservation.expectedSettlementChannels
    : inferChannelsFromFallback(reservation.channel)

  if (channels.includes('airbnb')) return 'airbnb'
  if (channels.includes('booking')) return 'booking'
  if (channels.includes('expedia_direct_bank')) return 'expedia'
  return 'reservation_plus'
}

function resolveAncillaryBlockKey(item: AncillaryRevenueSourceRecord): ReservationPaymentOverviewBlockKey {
  return isParkingLike(item.channel, item.reference, item.itemLabel) ? 'parking' : 'reservation_plus'
}

function inferChannelsFromFallback(channel: string | undefined): Array<'booking' | 'airbnb' | 'comgate' | 'expedia_direct_bank'> {
  const normalized = normalizeComparable(channel)

  if (!normalized) return []

  if (normalized.includes('booking')) return ['booking']
  if (normalized.includes('airbnb')) return ['airbnb']
  if (normalized.includes('expedia')) return ['expedia_direct_bank']
  if (
    normalized.includes('comgate')
    || normalized.includes('directweb')
    || normalized === 'direct'
    || normalized === 'web'
    || normalized.includes('website')
    || normalized.includes('parking')
    || normalized.includes('parkovani')
  ) return ['comgate']

  return []
}

function buildExpectedPathLabel(expectedChannels: string[], fallbackChannel: string | undefined): string {
  const channels = expectedChannels.length > 0 ? expectedChannels : inferChannelsFromFallback(fallbackChannel)

  if (channels.includes('booking')) return 'Booking payout / RB účet'
  if (channels.includes('airbnb')) return 'Airbnb payout / RB účet'
  if (channels.includes('comgate')) return 'Comgate / RB účet'
  if (channels.includes('expedia_direct_bank')) return 'Expedia terminal / Fio účet'
  return 'Zatím bez spolehlivé očekávané cesty úhrady'
}

function toChannelLabel(channel: string | undefined, blockKey: ReservationPaymentOverviewBlockKey): string {
  const normalized = normalizeComparable(channel)

  if (normalized === 'directweb' || normalized === 'direct') return 'vlastní web'
  if (normalized === 'expediadirectbank') return 'Expedia / terminál'
  if (normalized === 'parking') return 'parkování'
  if (channel && channel.trim().length > 0) return channel
  return BLOCK_DEFINITIONS.find((item) => item.key === blockKey)?.labelCs ?? 'neuvedeno'
}

function findAncillaryCandidate(
  payoutRows: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'],
  ancillary: AncillaryRevenueSourceRecord
): NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number] | undefined {
  return payoutRows.find((row) => {
    if (row.amountMinor !== ancillary.grossRevenueMinor || row.currency !== ancillary.currency) {
      return false
    }

    if (resolveAncillaryBlockKey(ancillary) === 'parking' && row.platform !== 'comgate') {
      return false
    }

    return row.payoutReference === ancillary.reference || row.reservationId === ancillary.reservationId
  })
}

function resolveLinkedReservationForAncillary(
  ancillary: AncillaryRevenueSourceRecord,
  reservationSources: ReservationSourceRecord[]
): ReservationSourceRecord | undefined {
  const exactIdentityCandidates = reservationSources.filter((reservation) => matchesAncillaryExactIdentity(ancillary, reservation))

  if (exactIdentityCandidates.length === 1) {
    return exactIdentityCandidates[0]
  }

  if (exactIdentityCandidates.length > 1) {
    return undefined
  }

  const exactStayCandidates = reservationSources.filter((reservation) => matchesAncillaryExactStayInterval(ancillary, reservation))
  return exactStayCandidates.length === 1 ? exactStayCandidates[0] : undefined
}

function matchesAncillaryExactIdentity(
  ancillary: AncillaryRevenueSourceRecord,
  reservation: ReservationSourceRecord
): boolean {
  if (reservation.sourceDocumentId !== ancillary.sourceDocumentId) {
    return false
  }

  const comparableAncillaryValues = collectUniqueTruthyStrings([
    normalizeComparable(ancillary.reservationId),
    normalizeComparable(ancillary.reference)
  ])

  if (comparableAncillaryValues.length === 0) {
    return false
  }

  const comparableReservationValues = collectUniqueTruthyStrings([
    normalizeComparable(reservation.reservationId),
    normalizeComparable(reservation.reference)
  ])

  return comparableReservationValues.some((value) => comparableAncillaryValues.includes(value))
}

function matchesAncillaryExactStayInterval(
  ancillary: AncillaryRevenueSourceRecord,
  reservation: ReservationSourceRecord
): boolean {
  if (reservation.sourceDocumentId !== ancillary.sourceDocumentId) {
    return false
  }

  const ancillaryStayStart = normalizeComparableStayDate(ancillary.stayStartAt)
  const ancillaryStayEnd = normalizeComparableStayDate(ancillary.stayEndAt)
  const reservationStayStart = normalizeComparableStayDate(reservation.stayStartAt)
  const reservationStayEnd = normalizeComparableStayDate(reservation.stayEndAt)

  return Boolean(
    ancillaryStayStart
    && ancillaryStayEnd
    && reservationStayStart
    && reservationStayEnd
    && ancillaryStayStart === reservationStayStart
    && ancillaryStayEnd === reservationStayEnd
  )
}

function findFirstExtractedRecord(transaction: NormalizedTransaction, extractedRecordsById: Map<string, ExtractedRecord>): ExtractedRecord | undefined {
  return transaction.extractedRecordIds
    .map((recordId) => extractedRecordsById.get(recordId))
    .find((record): record is ExtractedRecord => Boolean(record))
}

function mapEvidenceKeyFromMatch(match: ReservationSettlementMatch): ReservationPaymentEvidenceKey {
  return mapEvidenceKeyFromPlatform(match.platform)
}

function mapEvidenceKeyFromPlatform(platform: string): ReservationPaymentEvidenceKey {
  if (platform === 'booking' || platform === 'airbnb') return 'payout'
  if (platform === 'comgate') return 'comgate'
  if (platform === 'expedia_direct_bank') return 'terminal'
  return 'bank'
}

function collectReservationSourceDocumentIds(
  reservation: ReservationSourceRecord,
  match: ReservationSettlementMatch | undefined,
  bookingPayoutBatchBridge: BookingConfirmedPayoutBatchBridge | undefined
): string[] {
  return collectUniqueTruthyStrings([
    reservation.sourceDocumentId,
    ...((match?.evidence ?? [])
      .filter((entry) => (
        (entry.key === 'payoutSupplementSourceDocumentId' || entry.key === 'payoutRowSourceDocumentId')
        && typeof entry.value === 'string'
      ))
      .map((entry) => String(entry.value))),
    ...(bookingPayoutBatchBridge?.sourceDocumentIds ?? [])
  ])
}

function collectTransactionIds(match: ReservationSettlementMatch | undefined): string[] {
  return [match?.matchedRowId, match?.matchedSettlementId].filter((value): value is string => Boolean(value))
}

function collectUniqueTruthyStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
}

function buildStayOrDateValue(startAt: string | undefined, endAt: string | undefined, fallbackDate: string | undefined): string | undefined {
  if (startAt && endAt) {
    return `${startAt} – ${endAt}`
  }

  return startAt ?? fallbackDate
}

function summarizeTotals(entries: Array<{ currency: string, amountMinor: number | undefined }>): ReservationPaymentAmountSummary[] {
  const totals = new Map<string, number>()

  for (const entry of entries) {
    if (typeof entry.amountMinor !== 'number') {
      continue
    }

    totals.set(entry.currency, (totals.get(entry.currency) ?? 0) + entry.amountMinor)
  }

  return Array.from(totals.entries())
    .map(([currency, totalMinor]) => ({ currency, totalMinor }))
    .sort((left, right) => left.currency.localeCompare(right.currency, 'cs'))
}

function buildDetailEntry(labelCs: string, value: string | undefined): ReservationPaymentDetailEntry | undefined {
  if (!value || value.trim().length === 0) {
    return undefined
  }

  return { labelCs, value }
}

function compactDetailEntries(entries: Array<ReservationPaymentDetailEntry | undefined>): ReservationPaymentDetailEntry[] {
  return entries.filter((entry): entry is ReservationPaymentDetailEntry => Boolean(entry))
}

function compactEvidence(
  entries: Array<ReservationSettlementMatch['evidence'][number] | undefined>
): ReservationSettlementMatch['evidence'] {
  return entries.filter((entry): entry is ReservationSettlementMatch['evidence'][number] => Boolean(entry))
}

function describeNoMatchReason(reason: ReservationSettlementNoMatch['noMatchReason']): string {
  if (reason === 'noCandidate') return 'bez kandidáta'
  if (reason === 'channelMismatch') return 'nesedí kanál úhrady'
  if (reason === 'amountMismatch') return 'nesedí částka'
  return 'kandidáti jsou nejednoznační'
}

function isParkingLike(...values: Array<string | undefined>): boolean {
  return values.some((value) => {
    const normalized = normalizeComparable(value)
    return normalized.includes('parking') || normalized.includes('parkovani') || normalized.includes('park')
  })
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeComparableStayDate(value: string | undefined): string | undefined {
  const raw = (value ?? '').trim()

  if (!raw) {
    return undefined
  }

  return raw.slice(0, 10)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeComparable(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}