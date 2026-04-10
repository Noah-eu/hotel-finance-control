import type {
  AncillaryRevenueSourceRecord,
  ExtractedRecord,
  InvoiceListEnrichmentRecord,
  NormalizedTransaction,
  ReservationSettlementMatch,
  ReservationSettlementNoMatch,
  ReservationSourceRecord
} from '../domain'
import type { MonthlyBatchResult } from '../monthly-batch'
import { formatAmountMinorCs } from '../shared/money'

export type ReservationPaymentOverviewBlockKey = 'airbnb' | 'booking' | 'expedia' | 'reservation_plus' | 'parking'
export type ReservationPaymentStatusKey = 'paid' | 'partial' | 'unverified' | 'missing'
export type ReservationPaymentEvidenceKey = 'payout' | 'comgate' | 'terminal' | 'bank' | 'invoice_list' | 'no_evidence'

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

export interface ReservationPaymentOverviewDebugCandidate {
  candidateId: string
  sourceKind: 'reservation_source' | 'ancillary_source' | 'comgate_payout_row'
  sourcePlatform: 'previo' | 'comgate'
  sourceDocumentId?: string
  reservationReference?: string
  payoutReference?: string
  parkingSignalType: 'channel' | 'roomName' | 'reference' | 'itemLabel' | 'paymentPurpose' | 'transactionId' | 'payoutReference' | 'multiple'
  parkingSignalTypes: Array<'channel' | 'roomName' | 'reference' | 'itemLabel' | 'paymentPurpose' | 'transactionId' | 'payoutReference'>
  computedBlockKey?: ReservationPaymentOverviewBlockKey
  reason: string
}

export interface ReservationPaymentOverviewDebug {
  parkingCandidatesBeforeGrouping: number
  reservationPlusCandidatesBeforeGrouping: number
  finalParkingBlockCount: number
  finalReservationPlusBlockCount: number
  parkingLikeCandidateIds: string[]
  parkingLikeCandidates: ReservationPaymentOverviewDebugCandidate[]
  ancillaryLinkTraces: ReservationPaymentOverviewAncillaryLinkTrace[]
  reservationPlusNativeLinkTraces: ReservationPaymentOverviewNativeLinkTrace[]
  reservationPlusComgateMergeTraces: ReservationPaymentOverviewComgateMergeTrace[]
  invoiceListLinkTraces: InvoiceListLinkTrace[]
}

export interface ReservationPaymentOverviewComgateMergeTrace {
  finalOverviewItemId: string
  linkedReservationId: string
  linkedPaymentReference: string
  chosenLinkReason: 'exact_refId_merge' | 'exact_clientId_merge' | 'no_merge'
  reservationEntityMatchedByInvoiceList: boolean
  nativeRowMergedIntoReservationEntity: boolean
  mergeSource: 'reservation_entity' | 'none'
  mergeAnchorType?: NativeReservationMergeAnchorType
  noMergeReason?: 'not_reservation_plus' | 'no_reservation_anchor' | 'no_candidate' | 'ambiguous_candidates'
  nativeComgateFallbackSuppressed: boolean
  candidateCount: number
  comparableReservationValues: string[]
  comparableNativeAnchorsSample: string[]
  mergedComgateRowId?: string
  mergedComgateSourceDocumentId?: string
  clientId?: string
  variableSymbol?: string
  comgateTransactionId?: string
  reservationGuestName?: string
  reservationRoomName?: string
  reservationStayStartAt?: string
  reservationStayEndAt?: string
}

type ReservationPaymentOverviewLinkReason =
  | 'exact_identity'
  | 'unique_exact_stay_interval'
  | 'nearest_preceding_parent_block'
  | 'ambiguous_exact_identity'
  | 'ambiguous_exact_stay_interval'
  | 'no_candidate'

type NativeReservationMergeAnchorType =
  | 'reservation_id'
  | 'reservation_reference'
  | 'invoice_list_voucher'
  | 'invoice_list_customer_id'
  | 'invoice_list_variable_symbol'
  | 'invoice_list_invoice_number'
  | 'invoice_list_stay_interval'

export interface ReservationPaymentOverviewAncillaryLinkCandidate {
  sourceDocumentId: string
  reservationId: string
  reference?: string
  guestName?: string
  stayStartAt?: string
  stayEndAt?: string
  roomName?: string
}

export interface ReservationPaymentOverviewAncillaryRawParsedRow {
  sourceRecordId: string
  sourceDocumentId: string
  recordType: string
  rawReference?: string
  occurredAt?: string
  amountMinor?: number
  currency?: string
  data: {
    rowKind?: string
    reference?: string
    reservationId?: string
    createdAt?: string
    bookedAt?: string
    stayStartAt?: string
    stayEndAt?: string
    itemLabel?: string
    roomName?: string
    guestName?: string
    channel?: string
    outstandingBalanceMinor?: number
  }
}

export interface ReservationPaymentOverviewAncillaryNormalizedRow {
  sourceRecordId: string
  sourceDocumentId: string
  reference: string
  reservationId?: string
  createdAt?: string
  bookedAt?: string
  stayStartAt?: string
  stayEndAt?: string
  itemLabel?: string
  channel?: string
  grossRevenueMinor: number
  outstandingBalanceMinor?: number
  currency: string
}

export interface ReservationPaymentOverviewAncillaryLinkingInput {
  sourceDocumentId: string
  reference: string
  reservationId?: string
  stayStartAt?: string
  stayEndAt?: string
}

export interface ReservationPaymentOverviewAncillaryLinkTrace {
  itemId: string
  sourceRecordId: string
  sourceDocumentId: string
  reference: string
  reservationId?: string
  itemLabel?: string
  channel?: string
  stayStartAt?: string
  stayEndAt?: string
  rawParsedAncillaryRow?: ReservationPaymentOverviewAncillaryRawParsedRow
  normalizedAncillaryRow: ReservationPaymentOverviewAncillaryNormalizedRow
  overviewLinkingInput: ReservationPaymentOverviewAncillaryLinkingInput
  computedBlockKey: ReservationPaymentOverviewBlockKey
  linkedMainReservationId?: string
  linkedGuestName?: string
  linkedStayStartAt?: string
  linkedStayEndAt?: string
  linkedRoomName?: string
  candidateCount: number
  candidateSetBeforeFiltering: ReservationPaymentOverviewAncillaryLinkCandidate[]
  exactIdentityHits: ReservationPaymentOverviewAncillaryLinkCandidate[]
  exactStayIntervalHits: ReservationPaymentOverviewAncillaryLinkCandidate[]
  chosenCandidateReason: ReservationPaymentOverviewLinkReason
}

export interface ReservationPaymentOverviewNativeRawParsedRow {
  sourceRecordId: string
  sourceDocumentId: string
  recordType: string
  rawReference?: string
  occurredAt?: string
  amountMinor?: number
  currency?: string
  data: {
    platform?: string
    reference?: string
    reservationId?: string
    clientId?: string
    merchantOrderReference?: string
    payerVariableSymbol?: string
    rawPopis?: string
    rawTransferVariableSymbol?: string
    rawPayerVariableSymbol?: string
    rawClientId?: string
    normalizedPayoutReference?: string
    normalizedMerchantOrderReference?: string
    normalizedClientId?: string
    runtimeComgateParserVariant?: string
    createdAt?: string
    paidAt?: string
    transferredAt?: string
    confirmedGrossMinor?: number
    transferredNetMinor?: number
    feeTotalMinor?: number
    feeInterbankMinor?: number
    feeAssociationMinor?: number
    feeProcessorMinor?: number
    paymentMethod?: string
    cardType?: string
    bookedAt?: string
    paymentPurpose?: string
    transactionId?: string
    comgateParserVariant?: string
    totalFeeMinor?: number
  }
}

export interface ReservationPaymentOverviewNativeNormalizedRow {
  rowId: string
  sourceDocumentId: string
  reference: string
  reservationId?: string
  bookedAt?: string
  paymentPurpose?: string
  grossRevenueMinor: number
  matchingAmountMinor?: number
  currency: string
}

export interface ReservationPaymentOverviewNativeLinkingInput {
  sourceDocumentId: string
  reference: string
  reservationId?: string
}

export interface ReservationPaymentOverviewNativeLinkTrace {
  itemId: string
  rowId: string
  sourceDocumentId: string
  reference: string
  reservationId?: string
  paymentPurpose?: string
  rawParsedSourceRow?: ReservationPaymentOverviewNativeRawParsedRow
  normalizedNativeRow: ReservationPaymentOverviewNativeNormalizedRow
  overviewLinkingInput: ReservationPaymentOverviewNativeLinkingInput
  computedBlockKey: 'reservation_plus'
  linkedMainReservationId?: string
  linkedGuestName?: string
  linkedStayStartAt?: string
  linkedStayEndAt?: string
  linkedRoomName?: string
  candidateCount: number
  candidateSetBeforeFiltering: ReservationPaymentOverviewAncillaryLinkCandidate[]
  exactIdentityHits: ReservationPaymentOverviewAncillaryLinkCandidate[]
  exactStayIntervalHits: ReservationPaymentOverviewAncillaryLinkCandidate[]
  invoiceListCandidateCount: number
  invoiceListExactIdentityHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  invoiceListExactDocumentHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  invoiceListExactStayIntervalHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  merchantOrderReferenceAnchorFamily: 'empty' | 'numeric' | 'alpha_numeric' | 'mixed'
  invoiceListVoucherHits: number
  invoiceListVariableSymbolHits: number
  invoiceListInvoiceNumberHits: number
  reservationEntityBridgeHits: number
  candidateSetAfterFiltering: ReservationPaymentOverviewAncillaryLinkCandidate[]
  candidateCountBlockedReason?: 'none' | 'no_exact_anchor' | 'ambiguous_exact_identity' | 'ambiguous_multiple_exact_counterparts' | 'no_exact_counterpart_in_selected_files'
  noExactCounterpartInSelectedFiles?: boolean
  chosenCandidateSource: 'reservation_export' | 'invoice_list' | 'none'
  chosenCandidateReason: ReservationPaymentOverviewLinkReason
}

export interface ReservationPaymentOverviewInvoiceListLinkCandidate {
  sourceDocumentId: string
  reservationId?: string
  reference?: string
  voucher?: string
  variableSymbol?: string
  invoiceNumber?: string
  customerId?: string
  guestName?: string
  stayStartAt?: string
  stayEndAt?: string
  roomName?: string
}

interface AncillaryLinkInspection {
  linkedReservation?: ReservationSourceRecord
  candidateCount: number
  candidateSetBeforeFiltering: ReservationPaymentOverviewAncillaryLinkCandidate[]
  exactIdentityHits: ReservationPaymentOverviewAncillaryLinkCandidate[]
  exactStayIntervalHits: ReservationPaymentOverviewAncillaryLinkCandidate[]
  chosenCandidateReason: ReservationPaymentOverviewLinkReason
}

interface NativeLinkInspection {
  linkedReservation?: ReservationSourceRecord
  linkedInvoiceRecord?: InvoiceListEnrichmentRecord
  linkedInvoiceReason?: InvoiceListLinkReason
  candidateCount: number
  candidateSetBeforeFiltering: ReservationPaymentOverviewAncillaryLinkCandidate[]
  exactIdentityHits: ReservationPaymentOverviewAncillaryLinkCandidate[]
  exactStayIntervalHits: ReservationPaymentOverviewAncillaryLinkCandidate[]
  invoiceListCandidateCount: number
  invoiceListExactIdentityHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  invoiceListExactDocumentHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  invoiceListExactStayIntervalHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  merchantOrderReferenceAnchorFamily: 'empty' | 'numeric' | 'alpha_numeric' | 'mixed'
  invoiceListVoucherHits: number
  invoiceListVariableSymbolHits: number
  invoiceListInvoiceNumberHits: number
  reservationEntityBridgeHits: number
  candidateSetAfterFiltering: ReservationPaymentOverviewAncillaryLinkCandidate[]
  candidateCountBlockedReason?: 'none' | 'no_exact_anchor' | 'ambiguous_exact_identity' | 'ambiguous_multiple_exact_counterparts' | 'no_exact_counterpart_in_selected_files'
  noExactCounterpartInSelectedFiles?: boolean
  chosenCandidateSource: 'reservation_export' | 'invoice_list' | 'none'
  chosenCandidateReason: ReservationPaymentOverviewLinkReason
}

export type InvoiceListLinkReason =
  | 'exact_voucher'
  | 'exact_variable_symbol'
  | 'exact_customer_id'
  | 'exact_stay_room'
  | 'no_match'

export interface InvoiceListLinkTrace {
  overviewItemId: string
  blockKey: ReservationPaymentOverviewBlockKey
  anchorUsed: InvoiceListLinkReason
  candidateCount: number
  linkedGuestName?: string
  linkedStayStartAt?: string
  linkedStayEndAt?: string
  linkedRoomName?: string
  linkedVoucher?: string
  linkedVariableSymbol?: string
  invoiceListEvidenceEligible: boolean
  invoiceListEvidenceApplied: boolean
  invoiceListEvidenceBlockedReason?: 'blocked_airbnb' | 'blocked_parking' | 'blocked_no_anchor'
  invoiceListEvidenceAnchorType?: InvoiceListLinkReason
}

interface InvoiceListLinkResult {
  record: InvoiceListEnrichmentRecord
  reason: InvoiceListLinkReason
}

interface InvoiceListEvidenceResult {
  eligible: boolean
  applied: boolean
  blockedReason?: 'blocked_airbnb' | 'blocked_parking' | 'blocked_no_anchor'
  anchorType?: InvoiceListLinkReason
}

function resolveInvoiceListEvidence(
  blockKey: ReservationPaymentOverviewBlockKey,
  link: InvoiceListLinkResult | undefined
): InvoiceListEvidenceResult {
  if (!link) {
    return { eligible: false, applied: false, blockedReason: 'blocked_no_anchor' }
  }

  if (blockKey === 'airbnb') {
    return { eligible: false, applied: false, blockedReason: 'blocked_airbnb', anchorType: link.reason }
  }

  if (blockKey === 'parking') {
    return { eligible: false, applied: false, blockedReason: 'blocked_parking', anchorType: link.reason }
  }

  if (!INVOICE_LIST_EVIDENCE_ELIGIBLE_BLOCKS.has(blockKey)) {
    return { eligible: false, applied: false, blockedReason: 'blocked_no_anchor', anchorType: link.reason }
  }

  return { eligible: true, applied: true, anchorType: link.reason }
}

interface ExtractedRecordLookup {
  byScopedId: Map<string, ExtractedRecord>
  byId: Map<string, ExtractedRecord[]>
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
  invoice_list: 'faktura',
  no_evidence: 'bez důkazu'
}

const INVOICE_LIST_EVIDENCE_ELIGIBLE_BLOCKS: ReadonlySet<ReservationPaymentOverviewBlockKey> =
  new Set<ReservationPaymentOverviewBlockKey>(['booking', 'expedia', 'reservation_plus'])

export function buildReservationPaymentOverview(batch: MonthlyBatchResult): ReservationPaymentOverview {
  const workflowPlan = batch.reconciliation.workflowPlan

  if (!workflowPlan) {
    return buildEmptyOverview()
  }

  const extractedRecordLookup = buildExtractedRecordLookup(batch.extractedRecords)
  const previoReservationStructureIndex = buildPrevioReservationStructureIndex(batch.extractedRecords)
  const invoiceListRecords = workflowPlan.invoiceListEnrichment ?? []
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
      ?? resolveComgateExactPayoutRowMatch(
        workflowPlan.payoutRows,
        reservation,
        blockKey,
        extractedRecordLookup,
        transactionsById,
        consumedRowIds,
        invoiceListRecords
      )
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
    const invoiceListReservationLink = !match
      ? findInvoiceListEnrichmentForItem(
        { voucher: reservation.reference ?? reservation.reservationId },
        invoiceListRecords
      ).match
      : undefined
    const invoiceListEvidence = !match
      ? resolveInvoiceListEvidence(blockKey, invoiceListReservationLink)
      : undefined
    const paidAmountMinor = resolveMatchedPaidAmountMinor(match, transactionsById) ?? resolvePaidAmountFromOutstanding(reservation)
    const hasStrongEvidence = Boolean(match) || (invoiceListEvidence?.applied === true)
    const statusKey = resolveReservationStatus({
      expectedAmountMinor: reservation.grossRevenueMinor,
      outstandingBalanceMinor: reservation.outstandingBalanceMinor,
      hasStrongEvidence,
      blockKey
    })
    const evidenceKey = match
      ? mapEvidenceKeyFromMatch(match)
      : invoiceListEvidence?.applied
        ? 'invoice_list'
        : 'no_evidence'
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
      statusDetailCs: invoiceListEvidence?.applied
        ? 'Fakturační evidence (Invoice list) potvrzuje úhradu rezervace.'
        : buildReservationStatusDetailCs(reservation, match, noMatch, statusKey, blockKey, bookingPayoutBatchBridge),
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
    const ancillaryLinkInspection = inspectLinkedReservationForAncillary(
      ancillary,
      reservationSources,
      previoReservationStructureIndex
    )
    const linkedReservation = ancillaryLinkInspection.linkedReservation
    const invoiceListAncillaryLink = !linkedReservation
      ? blockKey === 'parking'
        ? findInvoiceListEnrichmentForParkingItem(
          { voucher: ancillary.reference, variableSymbol: undefined, itemLabel: ancillary.itemLabel },
          invoiceListRecords
        )
        : findInvoiceListEnrichmentForItem(
          { voucher: ancillary.reference },
          invoiceListRecords
        ).match
      : undefined
    const effectiveAncillaryGuestName = linkedReservation?.guestName ?? invoiceListAncillaryLink?.record.guestName
    const effectiveAncillaryStayStartAt = linkedReservation?.stayStartAt ?? invoiceListAncillaryLink?.record.stayStartAt
    const effectiveAncillaryStayEndAt = linkedReservation?.stayEndAt ?? invoiceListAncillaryLink?.record.stayEndAt
    const effectiveAncillaryRoomName = linkedReservation?.roomName ?? invoiceListAncillaryLink?.record.roomName
    const linkedStayValue = effectiveAncillaryStayStartAt
      ? buildStayOrDateValue(effectiveAncillaryStayStartAt, effectiveAncillaryStayEndAt, undefined)
      : undefined
    const invoiceListAncillaryEvidence = !candidate
      ? resolveInvoiceListEvidence(blockKey, invoiceListAncillaryLink)
      : undefined
    const ancillaryHasStrongEvidence = Boolean(candidate) || (invoiceListAncillaryEvidence?.applied === true)
    const statusKey = resolveReservationStatus({
      expectedAmountMinor: ancillary.grossRevenueMinor,
      outstandingBalanceMinor: ancillary.outstandingBalanceMinor,
      hasStrongEvidence: ancillaryHasStrongEvidence,
      blockKey
    })
    const evidenceKey: ReservationPaymentEvidenceKey = candidate
      ? mapEvidenceKeyFromPlatform(candidate.platform)
      : invoiceListAncillaryEvidence?.applied
        ? 'invoice_list'
        : 'no_evidence'

    items.push({
      id: buildAncillaryOverviewItemId(ancillary),
      blockKey,
      title: ancillary.itemLabel ?? ancillary.reference,
      subtitle: effectiveAncillaryRoomName ?? (ancillary.reservationId ? `Rezervace ${ancillary.reservationId}` : undefined),
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
      statusDetailCs: invoiceListAncillaryEvidence?.applied
        ? 'Doplňková položka je potvrzená přes fakturační evidenci (Invoice list).'
        : buildAncillaryStatusDetailCs(candidate, statusKey),
      evidenceKey,
      evidenceLabelCs: EVIDENCE_LABELS[evidenceKey],
      sourceDocumentIds: [ancillary.sourceDocumentId],
      transactionIds: candidate ? [candidate.rowId] : [],
      detailEntries: compactDetailEntries([
        buildDetailEntry('Host', effectiveAncillaryGuestName),
        buildDetailEntry('Pobyt', linkedStayValue),
        buildDetailEntry('Jednotka', effectiveAncillaryRoomName),
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

    const extractedRecord = findFirstExtractedRecord(transaction, extractedRecordLookup)
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

    const extractedRecord = findFirstExtractedRecord(transaction, extractedRecordLookup)

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
      const nativeLinkInspection = !parkingLike
        ? inspectLinkedReservationForReservationPlusNativeRow(
          row,
          extractedRecord,
          reservationSources,
          invoiceListRecords
        )
        : undefined
      const linkedReservation = nativeLinkInspection?.linkedReservation
      const invoiceListLink = !linkedReservation
        ? (nativeLinkInspection?.linkedInvoiceRecord
          ? {
              record: nativeLinkInspection.linkedInvoiceRecord,
              reason: nativeLinkInspection.linkedInvoiceReason ?? 'exact_voucher'
            }
          : parkingLike
          ? findInvoiceListEnrichmentForParkingItem(
            {
              voucher: readString(extractedRecord?.data.merchantOrderReference)
                ?? readString(extractedRecord?.data.reservationId)
                ?? readString(extractedRecord?.data.clientId),
              variableSymbol: readString(extractedRecord?.data.reference),
              itemLabel: readString(extractedRecord?.data.paymentPurpose)
            },
            invoiceListRecords
          )
        : findInvoiceListEnrichmentForItem(
            {
              voucher: readString(extractedRecord?.data.merchantOrderReference)
                ?? readString(extractedRecord?.data.reservationId)
                ?? readString(extractedRecord?.data.clientId),
              variableSymbol: readString(extractedRecord?.data.reference)
            },
            invoiceListRecords
          ).match)
        : undefined
      const effectiveGuestName = linkedReservation?.guestName ?? invoiceListLink?.record.guestName
      const effectiveStayStartAt = linkedReservation?.stayStartAt ?? invoiceListLink?.record.stayStartAt
      const effectiveStayEndAt = linkedReservation?.stayEndAt ?? invoiceListLink?.record.stayEndAt
      const effectiveRoomName = linkedReservation?.roomName ?? invoiceListLink?.record.roomName
      const linkedStayValue = effectiveStayStartAt
        ? buildStayOrDateValue(effectiveStayStartAt, effectiveStayEndAt, undefined)
        : undefined
      const title = parkingLike
        ? readString(extractedRecord?.data.reference) ?? row.payoutReference
        : effectiveGuestName ?? row.reservationId ?? row.payoutReference

      items.push({
        id: `reservation-payment:native:${row.rowId}`,
        blockKey,
        title,
        subtitle: parkingLike
          ? 'Parkovací platba'
          : effectiveRoomName ?? 'Vlastní web / Reservation+',
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
          buildDetailEntry('Host', effectiveGuestName),
          buildDetailEntry('Pobyt', linkedStayValue),
          buildDetailEntry('Jednotka', effectiveRoomName),
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

export function inspectReservationPaymentOverviewClassification(
  batch: MonthlyBatchResult
): ReservationPaymentOverviewDebug {
  const workflowPlan = batch.reconciliation.workflowPlan

  if (!workflowPlan) {
    return buildEmptyOverviewDebug()
  }

  const extractedRecordLookup = buildExtractedRecordLookup(batch.extractedRecords)
  const previoReservationStructureIndex = buildPrevioReservationStructureIndex(batch.extractedRecords)
  const transactionsById = new Map<string, NormalizedTransaction>(
    batch.reconciliation.normalizedTransactions.map((transaction) => [transaction.id, transaction])
  )
  const consumedRowIds = new Set<string>()
  const parkingLikeCandidates: ReservationPaymentOverviewDebugCandidate[] = []
  const ancillaryLinkTraces: ReservationPaymentOverviewAncillaryLinkTrace[] = []
  const reservationPlusNativeLinkTraces: ReservationPaymentOverviewNativeLinkTrace[] = []
  const reservationPlusComgateMergeTraces: ReservationPaymentOverviewComgateMergeTrace[] = []
  const invoiceListLinkTraces: InvoiceListLinkTrace[] = []
  let parkingCandidatesBeforeGrouping = 0
  let reservationPlusCandidatesBeforeGrouping = 0

  for (const match of workflowPlan.reservationSettlementMatches) {
    if (match.matchedRowId) {
      consumedRowIds.add(match.matchedRowId)
    }
  }

  const reservationSources = mergeReservationSources(
    workflowPlan.reservationSources,
    workflowPlan.previoReservationTruth ?? []
  )

  for (const reservation of reservationSources) {
    const blockKey = resolveReservationBlockKey(reservation)
    countReservationLikeCandidate(blockKey, {
      onParking() {
        parkingCandidatesBeforeGrouping += 1
      },
      onReservationPlus() {
        reservationPlusCandidatesBeforeGrouping += 1
      }
    })

    const signalTypes = collectParkingSignalTypes([
      ['channel', reservation.channel],
      ['roomName', reservation.roomName],
      ['reference', reservation.reference]
    ])

    if (signalTypes.length > 0) {
      parkingLikeCandidates.push({
        candidateId: `reservation:${reservation.sourceDocumentId}:${reservation.reservationId}`,
        sourceKind: 'reservation_source',
        sourcePlatform: 'previo',
        sourceDocumentId: reservation.sourceDocumentId,
        reservationReference: reservation.reservationId,
        payoutReference: reservation.reference,
        parkingSignalType: collapseParkingSignalType(signalTypes),
        parkingSignalTypes: signalTypes,
        computedBlockKey: blockKey,
        reason: blockKey === 'parking'
          ? 'Parking-like reservation source stayed in the parking block.'
          : blockKey === 'reservation_plus'
            ? 'Parking-like reservation source resolved into reservation_plus before grouping.'
            : 'Parking-like reservation source resolved into a non-parking OTA block before grouping.'
      })
    }

    if (blockKey === 'reservation_plus') {
      const debugConsumedRowIds = new Set(consumedRowIds)
      const comgateMergeDiag = diagnoseComgateExactPayoutRowMerge(
        workflowPlan.payoutRows,
        reservation,
        blockKey,
        extractedRecordLookup,
        transactionsById,
        debugConsumedRowIds,
        workflowPlan.invoiceListEnrichment ?? []
      )
      const comgateMergeMatch = comgateMergeDiag.match
      const sourceKey = buildReservationSourceKey(reservation.sourceDocumentId, reservation.reservationId)

      let mergeTraceClientId: string | undefined
      let mergeTraceVariableSymbol: string | undefined
      let mergeTraceComgateTransactionId: string | undefined
      let mergeTraceChosenLinkReason: ReservationPaymentOverviewComgateMergeTrace['chosenLinkReason'] = 'no_merge'

      if (comgateMergeMatch?.matchedRowId) {
        const mergedTransaction = transactionsById.get(comgateMergeMatch.matchedRowId)
        const mergedExtractedRecord = mergedTransaction
          ? findFirstExtractedRecord(mergedTransaction, extractedRecordLookup)
          : undefined
        mergeTraceClientId = readString(mergedExtractedRecord?.data.clientId) || undefined
        mergeTraceVariableSymbol = readString(mergedExtractedRecord?.data.reference) || undefined
        mergeTraceComgateTransactionId = readString(mergedExtractedRecord?.data.transactionId) || undefined
        mergeTraceChosenLinkReason = mergeTraceClientId ? 'exact_clientId_merge' : 'exact_refId_merge'
      }

      reservationPlusComgateMergeTraces.push({
        finalOverviewItemId: `reservation-payment:${sourceKey}`,
        linkedReservationId: reservation.reservationId,
        linkedPaymentReference: comgateMergeMatch?.matchedRowId ?? '',
        chosenLinkReason: mergeTraceChosenLinkReason,
        reservationEntityMatchedByInvoiceList: comgateMergeDiag.reservationEntityMatchedByInvoiceList,
        nativeRowMergedIntoReservationEntity: Boolean(comgateMergeMatch),
        mergeSource: comgateMergeMatch ? 'reservation_entity' : 'none',
        mergeAnchorType: comgateMergeDiag.mergeAnchorType,
        noMergeReason: mergeTraceChosenLinkReason === 'no_merge' ? comgateMergeDiag.noMergeReason : undefined,
        nativeComgateFallbackSuppressed: Boolean(comgateMergeMatch),
        candidateCount: comgateMergeDiag.candidateCount,
        comparableReservationValues: comgateMergeDiag.comparableReservationValues,
        comparableNativeAnchorsSample: comgateMergeDiag.comparableNativeAnchorsSample,
        mergedComgateRowId: comgateMergeMatch?.matchedRowId,
        mergedComgateSourceDocumentId: comgateMergeMatch?.evidence.find((e) => e.key === 'payoutRowSourceDocumentId')?.value as string | undefined,
        clientId: mergeTraceClientId,
        variableSymbol: mergeTraceVariableSymbol,
        comgateTransactionId: mergeTraceComgateTransactionId,
        reservationGuestName: reservation.guestName,
        reservationRoomName: reservation.roomName,
        reservationStayStartAt: reservation.stayStartAt,
        reservationStayEndAt: reservation.stayEndAt
      })

      if (comgateMergeMatch?.matchedRowId) {
        consumedRowIds.add(comgateMergeMatch.matchedRowId)
      }
    }

    const invoiceListDebugRecords = workflowPlan.invoiceListEnrichment ?? []
    const sourceKey = buildReservationSourceKey(reservation.sourceDocumentId, reservation.reservationId)
    const hasExistingMatch = workflowPlan.reservationSettlementMatches.some(
      (m) => buildReservationSourceKey(m.sourceDocumentId, m.reservationId) === sourceKey
    )

    if (!hasExistingMatch) {
      const debugInvoiceLink = findInvoiceListEnrichmentForItem(
        { voucher: reservation.reference ?? reservation.reservationId },
        invoiceListDebugRecords
      ).match
      const debugEvidence = resolveInvoiceListEvidence(blockKey, debugInvoiceLink)

      if (debugInvoiceLink) {
        invoiceListLinkTraces.push({
          overviewItemId: `reservation-payment:${sourceKey}`,
          blockKey,
          anchorUsed: debugInvoiceLink.reason,
          candidateCount: 1,
          linkedGuestName: debugInvoiceLink.record.guestName,
          linkedStayStartAt: debugInvoiceLink.record.stayStartAt,
          linkedStayEndAt: debugInvoiceLink.record.stayEndAt,
          linkedRoomName: debugInvoiceLink.record.roomName,
          linkedVoucher: debugInvoiceLink.record.voucher,
          linkedVariableSymbol: debugInvoiceLink.record.variableSymbol,
          invoiceListEvidenceEligible: debugEvidence.eligible,
          invoiceListEvidenceApplied: debugEvidence.applied,
          invoiceListEvidenceBlockedReason: debugEvidence.blockedReason,
          invoiceListEvidenceAnchorType: debugEvidence.anchorType
        })
      }
    }
  }

  for (const ancillary of workflowPlan.ancillaryRevenueSources) {
    const blockKey = resolveAncillaryBlockKey(ancillary)
    countReservationLikeCandidate(blockKey, {
      onParking() {
        parkingCandidatesBeforeGrouping += 1
      },
      onReservationPlus() {
        reservationPlusCandidatesBeforeGrouping += 1
      }
    })

    const signalTypes = collectParkingSignalTypes([
      ['channel', ancillary.channel],
      ['reference', ancillary.reference],
      ['itemLabel', ancillary.itemLabel]
    ])

    if (signalTypes.length > 0) {
      parkingLikeCandidates.push({
        candidateId: `ancillary:${ancillary.sourceDocumentId}:${ancillary.reference}`,
        sourceKind: 'ancillary_source',
        sourcePlatform: 'previo',
        sourceDocumentId: ancillary.sourceDocumentId,
        reservationReference: ancillary.reservationId,
        payoutReference: ancillary.reference,
        parkingSignalType: collapseParkingSignalType(signalTypes),
        parkingSignalTypes: signalTypes,
        computedBlockKey: blockKey,
        reason: blockKey === 'parking'
          ? 'Parking-like ancillary item stayed in the parking block.'
          : 'Parking-like ancillary item resolved into reservation_plus before grouping.'
      })
    }
  }

  for (const row of workflowPlan.payoutRows) {
    const transaction = transactionsById.get(row.rowId)
    const extractedRecord = transaction
      ? findFirstExtractedRecord(transaction, extractedRecordLookup)
      : undefined
    const signalTypes = collectParkingSignalTypes([
      ['paymentPurpose', readString(extractedRecord?.data.paymentPurpose)],
      ['reference', readString(extractedRecord?.data.reference)],
      ['transactionId', readString(extractedRecord?.data.transactionId)],
      ['payoutReference', row.payoutReference]
    ])

    if (row.platform === 'comgate' && !consumedRowIds.has(row.rowId) && transaction) {
      const blockKey = isParkingLike(
        readString(extractedRecord?.data.paymentPurpose),
        readString(extractedRecord?.data.reference),
        readString(extractedRecord?.data.transactionId),
        row.payoutReference
      )
        ? 'parking'
        : 'reservation_plus'

      countReservationLikeCandidate(blockKey, {
        onParking() {
          parkingCandidatesBeforeGrouping += 1
        },
        onReservationPlus() {
          reservationPlusCandidatesBeforeGrouping += 1
        }
      })

      if (signalTypes.length > 0) {
        parkingLikeCandidates.push({
          candidateId: `payout-row:${row.rowId}`,
          sourceKind: 'comgate_payout_row',
          sourcePlatform: 'comgate',
          sourceDocumentId: transaction.sourceDocumentIds[0],
          reservationReference: row.reservationId,
          payoutReference: row.payoutReference,
          parkingSignalType: collapseParkingSignalType(signalTypes),
          parkingSignalTypes: signalTypes,
          computedBlockKey: blockKey,
          reason: blockKey === 'parking'
            ? 'Explicit Comgate parking-like row stayed in the parking block.'
            : 'Parking-like Comgate row resolved into reservation_plus before grouping.'
        })
      }

      if (blockKey === 'reservation_plus') {
        const nativeLinkInspection = inspectLinkedReservationForReservationPlusNativeRow(
          row,
          extractedRecord,
          reservationSources,
          workflowPlan.invoiceListEnrichment ?? []
        )

        reservationPlusNativeLinkTraces.push({
          itemId: `reservation-payment:native:${row.rowId}`,
          rowId: row.rowId,
          sourceDocumentId: row.sourceDocumentId,
          reference: row.payoutReference,
          reservationId: row.reservationId,
          paymentPurpose: readString(extractedRecord?.data.paymentPurpose),
          rawParsedSourceRow: buildNativeRawParsedRowPayload(extractedRecord),
          normalizedNativeRow: buildNativeNormalizedRowPayload(row, extractedRecord),
          overviewLinkingInput: buildNativeLinkingInputPayload(row, extractedRecord),
          computedBlockKey: 'reservation_plus',
          linkedMainReservationId: nativeLinkInspection.linkedReservation?.reservationId ?? nativeLinkInspection.linkedInvoiceRecord?.voucher,
          linkedGuestName: nativeLinkInspection.linkedReservation?.guestName ?? nativeLinkInspection.linkedInvoiceRecord?.guestName,
          linkedStayStartAt: nativeLinkInspection.linkedReservation?.stayStartAt ?? nativeLinkInspection.linkedInvoiceRecord?.stayStartAt,
          linkedStayEndAt: nativeLinkInspection.linkedReservation?.stayEndAt ?? nativeLinkInspection.linkedInvoiceRecord?.stayEndAt,
          linkedRoomName: nativeLinkInspection.linkedReservation?.roomName ?? nativeLinkInspection.linkedInvoiceRecord?.roomName,
          candidateCount: nativeLinkInspection.candidateCount,
          candidateSetBeforeFiltering: nativeLinkInspection.candidateSetBeforeFiltering,
          exactIdentityHits: nativeLinkInspection.exactIdentityHits,
          exactStayIntervalHits: nativeLinkInspection.exactStayIntervalHits,
          invoiceListCandidateCount: nativeLinkInspection.invoiceListCandidateCount,
          invoiceListExactIdentityHits: nativeLinkInspection.invoiceListExactIdentityHits,
          invoiceListExactDocumentHits: nativeLinkInspection.invoiceListExactDocumentHits,
          invoiceListExactStayIntervalHits: nativeLinkInspection.invoiceListExactStayIntervalHits,
          merchantOrderReferenceAnchorFamily: nativeLinkInspection.merchantOrderReferenceAnchorFamily,
          invoiceListVoucherHits: nativeLinkInspection.invoiceListVoucherHits,
          invoiceListVariableSymbolHits: nativeLinkInspection.invoiceListVariableSymbolHits,
          invoiceListInvoiceNumberHits: nativeLinkInspection.invoiceListInvoiceNumberHits,
          reservationEntityBridgeHits: nativeLinkInspection.reservationEntityBridgeHits,
          candidateSetAfterFiltering: nativeLinkInspection.candidateSetAfterFiltering,
          candidateCountBlockedReason: nativeLinkInspection.candidateCountBlockedReason,
          noExactCounterpartInSelectedFiles: nativeLinkInspection.noExactCounterpartInSelectedFiles,
          chosenCandidateSource: nativeLinkInspection.chosenCandidateSource,
          chosenCandidateReason: nativeLinkInspection.chosenCandidateReason
        })
      }

      continue
    }

    if (signalTypes.length > 0) {
      parkingLikeCandidates.push({
        candidateId: `payout-row:${row.rowId}`,
        sourceKind: 'comgate_payout_row',
        sourcePlatform: 'comgate',
        sourceDocumentId: transaction?.sourceDocumentIds[0],
        reservationReference: row.reservationId,
        payoutReference: row.payoutReference,
        parkingSignalType: collapseParkingSignalType(signalTypes),
        parkingSignalTypes: signalTypes,
        computedBlockKey: undefined,
        reason: consumedRowIds.has(row.rowId)
          ? 'Parking-like Comgate row was consumed before native reservation overview fallback.'
          : !transaction
            ? 'Parking-like Comgate row has no normalized transaction in the current runtime state.'
            : 'Parking-like row is not eligible for the parking/reservation_plus native fallback.'
      })
    }
  }

  const overview = buildReservationPaymentOverview(batch)
  const parkingBlock = overview.blocks.find((block) => block.key === 'parking')
  const reservationPlusBlock = overview.blocks.find((block) => block.key === 'reservation_plus')

  for (const ancillary of workflowPlan.ancillaryRevenueSources) {
    const rawParsedAncillaryRow = buildAncillaryRawParsedRowPayload(
      findExactExtractedRecord(ancillary.sourceDocumentId, ancillary.sourceRecordId, extractedRecordLookup)
    )
    const linkInspection = inspectLinkedReservationForAncillary(
      ancillary,
      reservationSources,
      previoReservationStructureIndex
    )

    ancillaryLinkTraces.push({
      itemId: buildAncillaryOverviewItemId(ancillary),
      sourceRecordId: ancillary.sourceRecordId,
      sourceDocumentId: ancillary.sourceDocumentId,
      reference: ancillary.reference,
      reservationId: ancillary.reservationId,
      itemLabel: ancillary.itemLabel,
      channel: ancillary.channel,
      stayStartAt: ancillary.stayStartAt,
      stayEndAt: ancillary.stayEndAt,
      rawParsedAncillaryRow,
      normalizedAncillaryRow: buildAncillaryNormalizedRowPayload(ancillary),
      overviewLinkingInput: buildAncillaryLinkingInputPayload(ancillary),
      computedBlockKey: resolveAncillaryBlockKey(ancillary),
      linkedMainReservationId: linkInspection.linkedReservation?.reservationId,
      linkedGuestName: linkInspection.linkedReservation?.guestName,
      linkedStayStartAt: linkInspection.linkedReservation?.stayStartAt,
      linkedStayEndAt: linkInspection.linkedReservation?.stayEndAt,
      linkedRoomName: linkInspection.linkedReservation?.roomName,
      candidateCount: linkInspection.candidateCount,
      candidateSetBeforeFiltering: linkInspection.candidateSetBeforeFiltering,
      exactIdentityHits: linkInspection.exactIdentityHits,
      exactStayIntervalHits: linkInspection.exactStayIntervalHits,
      chosenCandidateReason: linkInspection.chosenCandidateReason
    })

    if (!linkInspection.linkedReservation) {
      const invoiceListDebugRecordsForAncillary = workflowPlan.invoiceListEnrichment ?? []
      const ancillaryBlockKey = resolveAncillaryBlockKey(ancillary)
      const ancillaryInvoiceLink = ancillaryBlockKey === 'parking'
        ? findInvoiceListEnrichmentForParkingItem(
          { voucher: ancillary.reference, variableSymbol: undefined, itemLabel: ancillary.itemLabel },
          invoiceListDebugRecordsForAncillary
        )
        : findInvoiceListEnrichmentForItem(
          { voucher: ancillary.reference },
          invoiceListDebugRecordsForAncillary
        ).match
      const ancillaryDebugEvidence = resolveInvoiceListEvidence(ancillaryBlockKey, ancillaryInvoiceLink)

      if (ancillaryInvoiceLink) {
        const candidate = findAncillaryCandidate(workflowPlan.payoutRows, ancillary)
        invoiceListLinkTraces.push({
          overviewItemId: buildAncillaryOverviewItemId(ancillary),
          blockKey: ancillaryBlockKey,
          anchorUsed: ancillaryInvoiceLink.reason,
          candidateCount: 1,
          linkedGuestName: ancillaryInvoiceLink.record.guestName,
          linkedStayStartAt: ancillaryInvoiceLink.record.stayStartAt,
          linkedStayEndAt: ancillaryInvoiceLink.record.stayEndAt,
          linkedRoomName: ancillaryInvoiceLink.record.roomName,
          linkedVoucher: ancillaryInvoiceLink.record.voucher,
          linkedVariableSymbol: ancillaryInvoiceLink.record.variableSymbol,
          invoiceListEvidenceEligible: ancillaryDebugEvidence.eligible,
          invoiceListEvidenceApplied: !candidate && ancillaryDebugEvidence.applied,
          invoiceListEvidenceBlockedReason: ancillaryDebugEvidence.blockedReason,
          invoiceListEvidenceAnchorType: ancillaryDebugEvidence.anchorType
        })
      }
    }
  }

  const invoiceListDebugRecords = workflowPlan.invoiceListEnrichment ?? []

  for (const row of workflowPlan.payoutRows) {
    const transaction = transactionsById.get(row.rowId)

    if (row.platform !== 'comgate' || consumedRowIds.has(row.rowId) || !transaction) {
      continue
    }

    const extractedRecord = findFirstExtractedRecord(transaction, extractedRecordLookup)
    const blockKey = isParkingLike(
      readString(extractedRecord?.data.paymentPurpose),
      readString(extractedRecord?.data.reference),
      readString(extractedRecord?.data.transactionId),
      row.payoutReference
    )
      ? 'parking'
      : 'reservation_plus'

    const invoiceLink = blockKey === 'parking'
      ? findInvoiceListEnrichmentForParkingItem(
        {
          voucher: readString(extractedRecord?.data.merchantOrderReference)
            ?? readString(extractedRecord?.data.reservationId)
            ?? readString(extractedRecord?.data.clientId),
          variableSymbol: readString(extractedRecord?.data.reference),
          itemLabel: readString(extractedRecord?.data.paymentPurpose)
        },
        invoiceListDebugRecords
      )
      : findInvoiceListEnrichmentForItem(
        {
          voucher: readString(extractedRecord?.data.merchantOrderReference)
            ?? readString(extractedRecord?.data.reservationId)
            ?? readString(extractedRecord?.data.clientId),
          variableSymbol: readString(extractedRecord?.data.reference)
        },
        invoiceListDebugRecords
      ).match

    if (invoiceLink) {
      const comgateInvoiceEvidence = resolveInvoiceListEvidence(blockKey, invoiceLink)
      invoiceListLinkTraces.push({
        overviewItemId: `reservation-payment:native:${row.rowId}`,
        blockKey,
        anchorUsed: invoiceLink.reason,
        candidateCount: 1,
        linkedGuestName: invoiceLink.record.guestName,
        linkedStayStartAt: invoiceLink.record.stayStartAt,
        linkedStayEndAt: invoiceLink.record.stayEndAt,
        linkedRoomName: invoiceLink.record.roomName,
        linkedVoucher: invoiceLink.record.voucher,
        linkedVariableSymbol: invoiceLink.record.variableSymbol,
        invoiceListEvidenceEligible: comgateInvoiceEvidence.eligible,
        invoiceListEvidenceApplied: false,
        invoiceListEvidenceBlockedReason: comgateInvoiceEvidence.blockedReason,
        invoiceListEvidenceAnchorType: comgateInvoiceEvidence.anchorType
      })
    }
  }

  return {
    parkingCandidatesBeforeGrouping,
    reservationPlusCandidatesBeforeGrouping,
    finalParkingBlockCount: parkingBlock?.itemCount ?? 0,
    finalReservationPlusBlockCount: reservationPlusBlock?.itemCount ?? 0,
    parkingLikeCandidateIds: parkingLikeCandidates.map((candidate) => candidate.candidateId),
    parkingLikeCandidates,
    ancillaryLinkTraces,
    reservationPlusNativeLinkTraces,
    reservationPlusComgateMergeTraces,
    invoiceListLinkTraces
  }
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

function buildEmptyOverviewDebug(): ReservationPaymentOverviewDebug {
  return {
    parkingCandidatesBeforeGrouping: 0,
    reservationPlusCandidatesBeforeGrouping: 0,
    finalParkingBlockCount: 0,
    finalReservationPlusBlockCount: 0,
    parkingLikeCandidateIds: [],
    parkingLikeCandidates: [],
    ancillaryLinkTraces: [],
    reservationPlusNativeLinkTraces: [],
    reservationPlusComgateMergeTraces: [],
    invoiceListLinkTraces: []
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

function resolveComgateExactPayoutRowMatch(
  payoutRows: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'],
  reservation: ReservationSourceRecord,
  blockKey: ReservationPaymentOverviewBlockKey,
  extractedRecordLookup: ExtractedRecordLookup,
  transactionsById: Map<string, NormalizedTransaction>,
  consumedRowIds: Set<string>,
  invoiceListRecords: InvoiceListEnrichmentRecord[]
): ReservationSettlementMatch | undefined {
  if (blockKey !== 'reservation_plus') {
    return undefined
  }

  const reservationInvoiceLink = findInvoiceListEnrichmentForItem(
    { voucher: reservation.reference ?? reservation.reservationId },
    invoiceListRecords
  ).match

  const candidates = payoutRows
    .map((row) => {
      if (row.platform !== 'comgate' || consumedRowIds.has(row.rowId)) {
        return undefined
      }

      const transaction = transactionsById.get(row.rowId)
      if (!transaction) {
        return undefined
      }

      const extractedRecord = findFirstExtractedRecord(transaction, extractedRecordLookup)

      if (isParkingLike(
        readString(extractedRecord?.data.paymentPurpose),
        readString(extractedRecord?.data.reference),
        readString(extractedRecord?.data.transactionId),
        row.payoutReference
      )) {
        return undefined
      }

      const mergeAnchorType = resolveReservationPlusNativeMergeAnchorType(
        row,
        extractedRecord,
        reservation,
        reservationInvoiceLink?.record
      )
      return mergeAnchorType ? { row, mergeAnchorType } : undefined
    })
    .filter((candidate): candidate is {
      row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number]
      mergeAnchorType: NativeReservationMergeAnchorType
    } => Boolean(candidate))

  if (candidates.length !== 1) {
    return undefined
  }

  const candidate = candidates[0]!
  return {
    sourceDocumentId: reservation.sourceDocumentId,
    reservationId: reservation.reservationId,
    reference: reservation.reference,
    settlementKind: 'payout_row',
    matchedRowId: candidate.row.rowId,
    platform: 'comgate',
    amountMinor: candidate.row.amountMinor,
    currency: candidate.row.currency,
    confidence: 1,
    reasons: buildComgateMergeReasons(candidate.mergeAnchorType),
    evidence: compactEvidence([
      { key: 'reservationId', value: reservation.reservationId },
      reservation.reference ? { key: 'reference', value: reservation.reference } : undefined,
      { key: 'comgateMergeAnchorType', value: candidate.mergeAnchorType },
      { key: 'payoutRowSourceDocumentId', value: candidate.row.sourceDocumentId },
      { key: 'payoutRowId', value: candidate.row.rowId }
    ])
  }
}

interface ComgateExactPayoutRowMergeDiagnostic {
  match: ReservationSettlementMatch | undefined
  mergeAnchorType?: NativeReservationMergeAnchorType
  reservationEntityMatchedByInvoiceList: boolean
  noMergeReason?: ReservationPaymentOverviewComgateMergeTrace['noMergeReason']
  candidateCount: number
  comparableReservationValues: string[]
  comparableNativeAnchorsSample: string[]
}

function diagnoseComgateExactPayoutRowMerge(
  payoutRows: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'],
  reservation: ReservationSourceRecord,
  blockKey: ReservationPaymentOverviewBlockKey,
  extractedRecordLookup: ExtractedRecordLookup,
  transactionsById: Map<string, NormalizedTransaction>,
  consumedRowIds: Set<string>,
  invoiceListRecords: InvoiceListEnrichmentRecord[]
): ComgateExactPayoutRowMergeDiagnostic {
  const reservationInvoiceLink = findInvoiceListEnrichmentForItem(
    { voucher: reservation.reference ?? reservation.reservationId },
    invoiceListRecords
  ).match
  const reservationEntityMatchedByInvoiceList = Boolean(reservationInvoiceLink)

  if (blockKey !== 'reservation_plus') {
    return {
      match: undefined,
      reservationEntityMatchedByInvoiceList,
      noMergeReason: 'not_reservation_plus',
      candidateCount: 0,
      comparableReservationValues: [],
      comparableNativeAnchorsSample: []
    }
  }

  const comparableReservationValues = collectUniqueTruthyStrings([
    normalizeComparable(reservation.reservationId),
    normalizeComparable(reservation.reference),
    normalizeComparable(reservationInvoiceLink?.record.voucher),
    normalizeComparable(reservationInvoiceLink?.record.customerId),
    normalizeComparable(reservationInvoiceLink?.record.variableSymbol),
    normalizeComparable(reservationInvoiceLink?.record.invoiceNumber)
  ])

  if (comparableReservationValues.length === 0) {
    return {
      match: undefined,
      reservationEntityMatchedByInvoiceList,
      noMergeReason: 'no_reservation_anchor',
      candidateCount: 0,
      comparableReservationValues: [],
      comparableNativeAnchorsSample: []
    }
  }

  const allNativeAnchorsSample: string[] = []

  const candidates = payoutRows
    .map((row) => {
      if (row.platform !== 'comgate' || consumedRowIds.has(row.rowId)) {
        return undefined
      }

      const transaction = transactionsById.get(row.rowId)
      if (!transaction) {
        return undefined
      }

      const extractedRecord = findFirstExtractedRecord(transaction, extractedRecordLookup)

      if (isParkingLike(
        readString(extractedRecord?.data.paymentPurpose),
        readString(extractedRecord?.data.reference),
        readString(extractedRecord?.data.transactionId),
        row.payoutReference
      )) {
        return undefined
      }

      const nativeAnchors = collectUniqueTruthyStrings([
        ...collectComparableNativeIdentityAnchors(row, extractedRecord),
        ...collectComparableNativeDocumentAnchors(row, extractedRecord)
      ])
      if (nativeAnchors.length > 0 && allNativeAnchorsSample.length < 10) {
        for (const anchor of nativeAnchors) {
          if (!allNativeAnchorsSample.includes(anchor)) {
            allNativeAnchorsSample.push(anchor)
          }
        }
      }

      const mergeAnchorType = resolveReservationPlusNativeMergeAnchorType(
        row,
        extractedRecord,
        reservation,
        reservationInvoiceLink?.record
      )
      return mergeAnchorType ? { row, mergeAnchorType } : undefined
    })
    .filter((candidate): candidate is {
      row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number]
      mergeAnchorType: NativeReservationMergeAnchorType
    } => Boolean(candidate))

  if (candidates.length !== 1) {
    return {
      match: undefined,
      reservationEntityMatchedByInvoiceList,
      noMergeReason: candidates.length === 0 ? 'no_candidate' : 'ambiguous_candidates',
      candidateCount: candidates.length,
      comparableReservationValues,
      comparableNativeAnchorsSample: allNativeAnchorsSample.slice(0, 10)
    }
  }

  const candidate = candidates[0]!
  return {
    match: {
      sourceDocumentId: reservation.sourceDocumentId,
      reservationId: reservation.reservationId,
      reference: reservation.reference,
      settlementKind: 'payout_row',
      matchedRowId: candidate.row.rowId,
      platform: 'comgate',
      amountMinor: candidate.row.amountMinor,
      currency: candidate.row.currency,
      confidence: 1,
      reasons: buildComgateMergeReasons(candidate.mergeAnchorType),
      evidence: compactEvidence([
        { key: 'reservationId', value: reservation.reservationId },
        reservation.reference ? { key: 'reference', value: reservation.reference } : undefined,
        { key: 'comgateMergeAnchorType', value: candidate.mergeAnchorType },
        { key: 'payoutRowSourceDocumentId', value: candidate.row.sourceDocumentId },
        { key: 'payoutRowId', value: candidate.row.rowId }
      ])
    },
    mergeAnchorType: candidate.mergeAnchorType,
    reservationEntityMatchedByInvoiceList,
    candidateCount: 1,
    comparableReservationValues,
    comparableNativeAnchorsSample: allNativeAnchorsSample.slice(0, 10)
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

function countReservationLikeCandidate(
  blockKey: ReservationPaymentOverviewBlockKey,
  handlers: {
    onParking: () => void
    onReservationPlus: () => void
  }
): void {
  if (blockKey === 'parking') {
    handlers.onParking()
  }

  if (blockKey === 'reservation_plus') {
    handlers.onReservationPlus()
  }
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

function inspectLinkedReservationForAncillary(
  ancillary: AncillaryRevenueSourceRecord,
  reservationSources: ReservationSourceRecord[],
  previoReservationStructureIndex: Map<string, number>
): AncillaryLinkInspection {
  const candidateSetBeforeFiltering = reservationSources
    .filter((reservation) => reservation.sourceDocumentId === ancillary.sourceDocumentId)
    .map(toAncillaryLinkCandidateSnapshot)
  const exactIdentityCandidates = reservationSources.filter((reservation) => matchesAncillaryExactIdentity(ancillary, reservation))
  const exactIdentityHits = exactIdentityCandidates.map(toAncillaryLinkCandidateSnapshot)

  if (exactIdentityCandidates.length === 1) {
    return {
      linkedReservation: exactIdentityCandidates[0],
      candidateCount: exactIdentityCandidates.length,
      candidateSetBeforeFiltering,
      exactIdentityHits,
      exactStayIntervalHits: [],
      chosenCandidateReason: 'exact_identity'
    }
  }

  if (exactIdentityCandidates.length > 1) {
    return {
      linkedReservation: undefined,
      candidateCount: exactIdentityCandidates.length,
      candidateSetBeforeFiltering,
      exactIdentityHits,
      exactStayIntervalHits: [],
      chosenCandidateReason: 'ambiguous_exact_identity'
    }
  }

  const exactStayCandidates = reservationSources.filter((reservation) => matchesAncillaryExactStayInterval(ancillary, reservation))
  const exactStayIntervalHits = exactStayCandidates.map(toAncillaryLinkCandidateSnapshot)

  if (exactStayCandidates.length === 1) {
    return {
      linkedReservation: exactStayCandidates[0],
      candidateCount: exactStayCandidates.length,
      candidateSetBeforeFiltering,
      exactIdentityHits: [],
      exactStayIntervalHits,
      chosenCandidateReason: 'unique_exact_stay_interval'
    }
  }

  if (exactStayCandidates.length > 1) {
    const nearestPrecedingParentReservation = resolveNearestPrecedingParentReservation(
      ancillary,
      exactStayCandidates,
      previoReservationStructureIndex
    )

    if (nearestPrecedingParentReservation) {
      return {
        linkedReservation: nearestPrecedingParentReservation,
        candidateCount: exactStayCandidates.length,
        candidateSetBeforeFiltering,
        exactIdentityHits: [],
        exactStayIntervalHits,
        chosenCandidateReason: 'nearest_preceding_parent_block'
      }
    }

    return {
      linkedReservation: undefined,
      candidateCount: exactStayCandidates.length,
      candidateSetBeforeFiltering,
      exactIdentityHits: [],
      exactStayIntervalHits,
      chosenCandidateReason: 'ambiguous_exact_stay_interval'
    }
  }

  return {
    linkedReservation: undefined,
    candidateCount: 0,
    candidateSetBeforeFiltering,
    exactIdentityHits: [],
    exactStayIntervalHits: [],
    chosenCandidateReason: 'no_candidate'
  }
}

function inspectLinkedReservationForReservationPlusNativeRow(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined,
  reservationSources: ReservationSourceRecord[],
  invoiceListRecords: InvoiceListEnrichmentRecord[]
): NativeLinkInspection {
  const merchantOrderReference = readString(extractedRecord?.data.merchantOrderReference)
  const merchantOrderReferenceAnchorFamily = classifyMerchantOrderReferenceAnchorFamily(merchantOrderReference)
  const candidatePool = reservationSources
    .filter((reservation) => resolveReservationBlockKey(reservation) === 'reservation_plus')
  const candidateSetBeforeFiltering = candidatePool.map(toAncillaryLinkCandidateSnapshot)
  const exactIdentityCandidates = candidatePool.filter((reservation) => matchesReservationPlusNativeExactIdentity(row, extractedRecord, reservation))
  const exactIdentityHits = exactIdentityCandidates.map(toAncillaryLinkCandidateSnapshot)
  const invoiceListHitSet = collectInvoiceListExactHits(row, extractedRecord, invoiceListRecords)
  const reservationEntityBridgeHits = exactIdentityCandidates.length

  if (exactIdentityCandidates.length === 1) {
    return {
      linkedReservation: exactIdentityCandidates[0],
      candidateCount: exactIdentityCandidates.length,
      candidateSetBeforeFiltering,
      candidateSetAfterFiltering: exactIdentityHits,
      exactIdentityHits,
      exactStayIntervalHits: [],
      invoiceListCandidateCount: invoiceListHitSet.candidateCount,
      invoiceListExactIdentityHits: invoiceListHitSet.identityHits,
      invoiceListExactDocumentHits: invoiceListHitSet.documentHits,
      invoiceListExactStayIntervalHits: invoiceListHitSet.stayIntervalHits,
      merchantOrderReferenceAnchorFamily,
      invoiceListVoucherHits: invoiceListHitSet.voucherHits.length,
      invoiceListVariableSymbolHits: invoiceListHitSet.variableSymbolHits.length,
      invoiceListInvoiceNumberHits: invoiceListHitSet.invoiceNumberHits.length,
      reservationEntityBridgeHits,
      candidateCountBlockedReason: 'none',
      noExactCounterpartInSelectedFiles: false,
      chosenCandidateSource: 'reservation_export',
      chosenCandidateReason: 'exact_identity'
    }
  }

  if (exactIdentityCandidates.length > 1) {
    return {
      linkedReservation: undefined,
      candidateCount: exactIdentityCandidates.length,
      candidateSetBeforeFiltering,
      candidateSetAfterFiltering: exactIdentityHits,
      exactIdentityHits,
      exactStayIntervalHits: [],
      invoiceListCandidateCount: invoiceListHitSet.candidateCount,
      invoiceListExactIdentityHits: invoiceListHitSet.identityHits,
      invoiceListExactDocumentHits: invoiceListHitSet.documentHits,
      invoiceListExactStayIntervalHits: invoiceListHitSet.stayIntervalHits,
      merchantOrderReferenceAnchorFamily,
      invoiceListVoucherHits: invoiceListHitSet.voucherHits.length,
      invoiceListVariableSymbolHits: invoiceListHitSet.variableSymbolHits.length,
      invoiceListInvoiceNumberHits: invoiceListHitSet.invoiceNumberHits.length,
      reservationEntityBridgeHits,
      candidateCountBlockedReason: 'ambiguous_exact_identity',
      noExactCounterpartInSelectedFiles: false,
      chosenCandidateSource: 'none',
      chosenCandidateReason: 'ambiguous_exact_identity'
    }
  }

  const fallbackInvoiceResolution = selectInvoiceListNativeFallback(row, extractedRecord, invoiceListRecords)
  const fallbackInvoiceLink = fallbackInvoiceResolution.link
  if (fallbackInvoiceLink) {
    return {
      linkedReservation: undefined,
      linkedInvoiceRecord: fallbackInvoiceLink.record,
      linkedInvoiceReason: fallbackInvoiceLink.reason,
      candidateCount: 1,
      candidateSetBeforeFiltering,
      candidateSetAfterFiltering: [],
      exactIdentityHits: [],
      exactStayIntervalHits: [],
      invoiceListCandidateCount: invoiceListHitSet.candidateCount,
      invoiceListExactIdentityHits: invoiceListHitSet.identityHits,
      invoiceListExactDocumentHits: invoiceListHitSet.documentHits,
      invoiceListExactStayIntervalHits: invoiceListHitSet.stayIntervalHits,
      merchantOrderReferenceAnchorFamily,
      invoiceListVoucherHits: invoiceListHitSet.voucherHits.length,
      invoiceListVariableSymbolHits: invoiceListHitSet.variableSymbolHits.length,
      invoiceListInvoiceNumberHits: invoiceListHitSet.invoiceNumberHits.length,
      reservationEntityBridgeHits,
      candidateCountBlockedReason: 'none',
      noExactCounterpartInSelectedFiles: false,
      chosenCandidateSource: 'invoice_list',
      chosenCandidateReason: 'exact_identity'
    }
  }

  const noExactCounterpartInSelectedFiles = hasAnyNativeReservationPlusAnchor(row, extractedRecord)
    && invoiceListHitSet.candidateCount === 0
    && reservationEntityBridgeHits === 0
  const ambiguousInvoiceListExactAnchors = fallbackInvoiceResolution.hasAmbiguousExactCounterparts
    || (invoiceListHitSet.candidateCount > 1 && reservationEntityBridgeHits === 0)

  return {
    linkedReservation: undefined,
    candidateCount: 0,
    candidateSetBeforeFiltering,
    candidateSetAfterFiltering: [],
    exactIdentityHits: [],
    exactStayIntervalHits: [],
    invoiceListCandidateCount: invoiceListHitSet.candidateCount,
    invoiceListExactIdentityHits: invoiceListHitSet.identityHits,
    invoiceListExactDocumentHits: invoiceListHitSet.documentHits,
    invoiceListExactStayIntervalHits: invoiceListHitSet.stayIntervalHits,
    merchantOrderReferenceAnchorFamily,
    invoiceListVoucherHits: invoiceListHitSet.voucherHits.length,
    invoiceListVariableSymbolHits: invoiceListHitSet.variableSymbolHits.length,
    invoiceListInvoiceNumberHits: invoiceListHitSet.invoiceNumberHits.length,
    reservationEntityBridgeHits,
    candidateCountBlockedReason: noExactCounterpartInSelectedFiles
      ? 'no_exact_counterpart_in_selected_files'
      : ambiguousInvoiceListExactAnchors
        ? 'ambiguous_multiple_exact_counterparts'
        : 'no_exact_anchor',
    noExactCounterpartInSelectedFiles,
    chosenCandidateSource: 'none',
    chosenCandidateReason: 'no_candidate'
  }
}

function buildComgateMergeReasons(mergeAnchorType: NativeReservationMergeAnchorType): string[] {
  if (mergeAnchorType === 'reservation_id' || mergeAnchorType === 'reservation_reference') {
    return ['reservationIdExact', 'comgatePayoutRowMerge']
  }

  return ['invoiceListAnchorExact', 'comgatePayoutRowMerge']
}

function resolveReservationPlusNativeMergeAnchorType(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined,
  reservation: ReservationSourceRecord,
  reservationInvoiceRecord: InvoiceListEnrichmentRecord | undefined
): NativeReservationMergeAnchorType | undefined {
  const nativeIdentityAnchors = collectComparableNativeIdentityAnchors(row, extractedRecord)
  const reservationId = normalizeComparable(reservation.reservationId)
  const reservationReference = normalizeComparable(reservation.reference)

  if (reservationId && nativeIdentityAnchors.includes(reservationId)) {
    return 'reservation_id'
  }

  if (reservationReference && nativeIdentityAnchors.includes(reservationReference)) {
    return 'reservation_reference'
  }

  if (!reservationInvoiceRecord) {
    return undefined
  }

  const nativeDocumentAnchors = collectComparableNativeDocumentAnchors(row, extractedRecord)
  const invoiceVoucher = normalizeComparable(reservationInvoiceRecord.voucher)
  const invoiceCustomerId = normalizeComparable(reservationInvoiceRecord.customerId)
  const invoiceVariableSymbol = normalizeComparable(reservationInvoiceRecord.variableSymbol)
  const invoiceNumber = normalizeComparable(reservationInvoiceRecord.invoiceNumber)

  if (invoiceVoucher && nativeIdentityAnchors.includes(invoiceVoucher)) {
    return 'invoice_list_voucher'
  }

  if (invoiceCustomerId && nativeIdentityAnchors.includes(invoiceCustomerId)) {
    return 'invoice_list_customer_id'
  }

  if (invoiceVariableSymbol && nativeDocumentAnchors.includes(invoiceVariableSymbol)) {
    return 'invoice_list_variable_symbol'
  }

  if (invoiceNumber && nativeDocumentAnchors.includes(invoiceNumber)) {
    return 'invoice_list_invoice_number'
  }

  const normalizedNativeStayStart = normalizeComparableStayDate(readString(extractedRecord?.data.stayStartAt))
  const normalizedNativeStayEnd = normalizeComparableStayDate(readString(extractedRecord?.data.stayEndAt))
  const normalizedNativeRoom = normalizeComparable(readString(extractedRecord?.data.roomName))
  if (
    normalizedNativeStayStart
    && normalizedNativeStayEnd
    && normalizedNativeRoom
    && normalizeComparableStayDate(reservationInvoiceRecord.stayStartAt) === normalizedNativeStayStart
    && normalizeComparableStayDate(reservationInvoiceRecord.stayEndAt) === normalizedNativeStayEnd
    && normalizeComparable(reservationInvoiceRecord.roomName) === normalizedNativeRoom
  ) {
    return 'invoice_list_stay_interval'
  }

  return undefined
}

function collectComparableNativeIdentityAnchors(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined
): string[] {
  const parserVariant = readString(extractedRecord?.data.comgateParserVariant)
  const currentPortalReferenceIdentityAnchors = parserVariant === 'current-portal'
    ? collectUniqueTruthyStrings([
      normalizeComparable(readString(extractedRecord?.data.reference)),
      normalizeComparable(row.payoutReference)
    ])
    : []

  return collectUniqueTruthyStrings([
    normalizeComparable(readString(extractedRecord?.data.merchantOrderReference)),
    normalizeComparable(row.reservationId),
    normalizeComparable(readString(extractedRecord?.data.reservationId)),
    normalizeComparable(readString(extractedRecord?.data.clientId)),
    ...currentPortalReferenceIdentityAnchors
  ])
}

function collectComparableNativeDocumentAnchors(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined
): string[] {
  return collectUniqueTruthyStrings([
    normalizeComparable(readString(extractedRecord?.data.reference)),
    normalizeComparable(row.payoutReference),
    normalizeComparable(readString(extractedRecord?.data.invoiceNumber))
  ])
}

function matchesReservationPlusNativeExactIdentity(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined,
  reservation: ReservationSourceRecord
): boolean {
  const comparableNativeAnchorValues = collectComparableNativeIdentityAnchors(row, extractedRecord)

  if (comparableNativeAnchorValues.length === 0) {
    return false
  }

  const comparableReservationValues = collectUniqueTruthyStrings([
    normalizeComparable(reservation.reservationId),
    normalizeComparable(reservation.reference)
  ])

  return comparableReservationValues.some((value) => comparableNativeAnchorValues.includes(value))
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

function buildAncillaryOverviewItemId(ancillary: AncillaryRevenueSourceRecord): string {
  return `reservation-payment:ancillary:${ancillary.sourceDocumentId}:${ancillary.reference}`
}

function buildExtractedRecordLookup(extractedRecords: ExtractedRecord[]): ExtractedRecordLookup {
  const byScopedId = new Map<string, ExtractedRecord>()
  const byId = new Map<string, ExtractedRecord[]>()

  for (const record of extractedRecords) {
    byScopedId.set(buildScopedExtractedRecordKey(record.sourceDocumentId, record.id), record)
    const existing = byId.get(record.id) ?? []
    existing.push(record)
    byId.set(record.id, existing)
  }

  return {
    byScopedId,
    byId
  }
}

function buildPrevioReservationStructureIndex(extractedRecords: ExtractedRecord[]): Map<string, number> {
  const index = new Map<string, number>()

  for (const record of extractedRecords) {
    if (record.data.platform !== 'previo' || record.data.rowKind === 'ancillary') {
      continue
    }

    const workbookOrder = parsePrevioWorkbookRecordOrder(record.id)
    if (workbookOrder === undefined) {
      continue
    }

    for (const value of [
      stringOrUndefined(record.data.reservationId),
      stringOrUndefined(record.data.reference),
      stringOrUndefined(record.rawReference)
    ]) {
      const structuralKey = buildPrevioReservationStructureKey(record.sourceDocumentId, value)

      if (!structuralKey || index.has(structuralKey)) {
        continue
      }

      index.set(structuralKey, workbookOrder)
    }
  }

  return index
}

function buildAncillaryRawParsedRowPayload(
  record: ExtractedRecord | undefined
): ReservationPaymentOverviewAncillaryRawParsedRow | undefined {
  if (!record) {
    return undefined
  }

  return {
    sourceRecordId: record.id,
    sourceDocumentId: record.sourceDocumentId,
    recordType: record.recordType,
    rawReference: stringOrUndefined(record.rawReference),
    occurredAt: stringOrUndefined(record.occurredAt),
    amountMinor: typeof record.amountMinor === 'number' ? record.amountMinor : undefined,
    currency: stringOrUndefined(record.currency),
    data: {
      rowKind: stringOrUndefined(record.data.rowKind),
      reference: stringOrUndefined(record.data.reference),
      reservationId: stringOrUndefined(record.data.reservationId),
      createdAt: stringOrUndefined(record.data.createdAt),
      bookedAt: stringOrUndefined(record.data.bookedAt),
      stayStartAt: stringOrUndefined(record.data.stayStartAt),
      stayEndAt: stringOrUndefined(record.data.stayEndAt),
      itemLabel: stringOrUndefined(record.data.itemLabel),
      roomName: stringOrUndefined(record.data.roomName),
      guestName: stringOrUndefined(record.data.guestName),
      channel: stringOrUndefined(record.data.channel),
      outstandingBalanceMinor: typeof record.data.outstandingBalanceMinor === 'number'
        ? record.data.outstandingBalanceMinor
        : undefined
    }
  }
}

function buildAncillaryNormalizedRowPayload(
  ancillary: AncillaryRevenueSourceRecord
): ReservationPaymentOverviewAncillaryNormalizedRow {
  return {
    sourceRecordId: ancillary.sourceRecordId,
    sourceDocumentId: ancillary.sourceDocumentId,
    reference: ancillary.reference,
    reservationId: ancillary.reservationId,
    createdAt: ancillary.createdAt,
    bookedAt: ancillary.bookedAt,
    stayStartAt: ancillary.stayStartAt,
    stayEndAt: ancillary.stayEndAt,
    itemLabel: ancillary.itemLabel,
    channel: ancillary.channel,
    grossRevenueMinor: ancillary.grossRevenueMinor,
    outstandingBalanceMinor: ancillary.outstandingBalanceMinor,
    currency: ancillary.currency
  }
}

function buildNativeRawParsedRowPayload(
  record: ExtractedRecord | undefined
): ReservationPaymentOverviewNativeRawParsedRow | undefined {
  if (!record) {
    return undefined
  }

  return {
    sourceRecordId: record.id,
    sourceDocumentId: record.sourceDocumentId,
    recordType: record.recordType,
    rawReference: stringOrUndefined(record.rawReference),
    occurredAt: stringOrUndefined(record.occurredAt),
    amountMinor: typeof record.amountMinor === 'number' ? record.amountMinor : undefined,
    currency: stringOrUndefined(record.currency),
    data: {
      platform: stringOrUndefined(record.data.platform),
      reference: stringOrUndefined(record.data.reference),
      reservationId: stringOrUndefined(record.data.reservationId),
      clientId: stringOrUndefined(record.data.clientId),
      merchantOrderReference: stringOrUndefined(record.data.merchantOrderReference),
      payerVariableSymbol: stringOrUndefined(record.data.payerVariableSymbol),
      rawPopis: stringOrUndefined(record.data.rawPopis),
      rawTransferVariableSymbol: stringOrUndefined(record.data.rawTransferVariableSymbol),
      rawPayerVariableSymbol: stringOrUndefined(record.data.rawPayerVariableSymbol),
      rawClientId: stringOrUndefined(record.data.rawClientId),
      normalizedPayoutReference: stringOrUndefined(record.data.normalizedPayoutReference),
      normalizedMerchantOrderReference: stringOrUndefined(record.data.normalizedMerchantOrderReference),
      normalizedClientId: stringOrUndefined(record.data.normalizedClientId),
      runtimeComgateParserVariant: stringOrUndefined(record.data.runtimeComgateParserVariant),
      createdAt: stringOrUndefined(record.data.createdAt),
      paidAt: stringOrUndefined(record.data.paidAt),
      transferredAt: stringOrUndefined(record.data.transferredAt),
      confirmedGrossMinor: typeof record.data.confirmedGrossMinor === 'number' ? record.data.confirmedGrossMinor : undefined,
      transferredNetMinor: typeof record.data.transferredNetMinor === 'number' ? record.data.transferredNetMinor : undefined,
      feeTotalMinor: typeof record.data.feeTotalMinor === 'number' ? record.data.feeTotalMinor : undefined,
      feeInterbankMinor: typeof record.data.feeInterbankMinor === 'number' ? record.data.feeInterbankMinor : undefined,
      feeAssociationMinor: typeof record.data.feeAssociationMinor === 'number' ? record.data.feeAssociationMinor : undefined,
      feeProcessorMinor: typeof record.data.feeProcessorMinor === 'number' ? record.data.feeProcessorMinor : undefined,
      paymentMethod: stringOrUndefined(record.data.paymentMethod),
      cardType: stringOrUndefined(record.data.cardType),
      bookedAt: stringOrUndefined(record.data.bookedAt),
      paymentPurpose: stringOrUndefined(record.data.paymentPurpose),
      transactionId: stringOrUndefined(record.data.transactionId),
      comgateParserVariant: stringOrUndefined(record.data.comgateParserVariant),
      totalFeeMinor: typeof record.data.totalFeeMinor === 'number'
        ? record.data.totalFeeMinor
        : undefined
    }
  }
}

function buildNativeNormalizedRowPayload(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined
): ReservationPaymentOverviewNativeNormalizedRow {
  return {
    rowId: row.rowId,
    sourceDocumentId: row.sourceDocumentId,
    reference: row.payoutReference,
    reservationId: row.reservationId ?? readString(extractedRecord?.data.reservationId),
    bookedAt: row.payoutDate,
    paymentPurpose: readString(extractedRecord?.data.paymentPurpose),
    grossRevenueMinor: row.amountMinor,
    matchingAmountMinor: row.matchingAmountMinor,
    currency: row.currency
  }
}

function buildNativeLinkingInputPayload(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined
): ReservationPaymentOverviewNativeLinkingInput {
  return {
    sourceDocumentId: row.sourceDocumentId,
    reference: row.payoutReference,
    reservationId: row.reservationId ?? readString(extractedRecord?.data.reservationId)
  }
}

function buildAncillaryLinkingInputPayload(
  ancillary: AncillaryRevenueSourceRecord
): ReservationPaymentOverviewAncillaryLinkingInput {
  return {
    sourceDocumentId: ancillary.sourceDocumentId,
    reference: ancillary.reference,
    reservationId: ancillary.reservationId,
    stayStartAt: ancillary.stayStartAt,
    stayEndAt: ancillary.stayEndAt
  }
}

function toAncillaryLinkCandidateSnapshot(
  reservation: ReservationSourceRecord
): ReservationPaymentOverviewAncillaryLinkCandidate {
  return {
    sourceDocumentId: reservation.sourceDocumentId,
    reservationId: reservation.reservationId,
    reference: reservation.reference,
    guestName: reservation.guestName,
    stayStartAt: reservation.stayStartAt,
    stayEndAt: reservation.stayEndAt,
    roomName: reservation.roomName
  }
}

function resolveNearestPrecedingParentReservation(
  ancillary: AncillaryRevenueSourceRecord,
  exactStayCandidates: ReservationSourceRecord[],
  previoReservationStructureIndex: Map<string, number>
): ReservationSourceRecord | undefined {
  const ancillaryWorkbookOrder = parsePrevioWorkbookRecordOrder(ancillary.sourceRecordId)

  if (ancillaryWorkbookOrder === undefined) {
    return undefined
  }

  const precedingCandidates = exactStayCandidates
    .map((reservation) => ({
      reservation,
      workbookOrder: resolveReservationSourceWorkbookOrder(reservation, previoReservationStructureIndex)
    }))
    .filter((entry): entry is { reservation: ReservationSourceRecord; workbookOrder: number } => entry.workbookOrder !== undefined)
    .filter((entry) => entry.workbookOrder < ancillaryWorkbookOrder)

  if (precedingCandidates.length === 0) {
    return undefined
  }

  const nearestWorkbookOrder = Math.max(...precedingCandidates.map((entry) => entry.workbookOrder))
  const nearestCandidates = precedingCandidates.filter((entry) => entry.workbookOrder === nearestWorkbookOrder)

  return nearestCandidates.length === 1 ? nearestCandidates[0].reservation : undefined
}

function resolveReservationSourceWorkbookOrder(
  reservation: ReservationSourceRecord,
  previoReservationStructureIndex: Map<string, number>
): number | undefined {
  for (const value of [reservation.reservationId, reservation.reference]) {
    const structuralKey = buildPrevioReservationStructureKey(reservation.sourceDocumentId, value)

    if (!structuralKey) {
      continue
    }

    const workbookOrder = previoReservationStructureIndex.get(structuralKey)

    if (workbookOrder !== undefined) {
      return workbookOrder
    }
  }

  return undefined
}

function buildPrevioReservationStructureKey(sourceDocumentId: string, value: string | undefined): string | undefined {
  const normalizedValue = normalizeComparable(value)

  if (!normalizedValue) {
    return undefined
  }

  return `${sourceDocumentId}:${normalizedValue}`
}

function parsePrevioWorkbookRecordOrder(sourceRecordId: string | undefined): number | undefined {
  if (!sourceRecordId) {
    return undefined
  }

  const match = /^previo-(?:reservation|ancillary)-(\d+)$/.exec(sourceRecordId)

  if (!match) {
    return undefined
  }

  const parsed = Number.parseInt(match[1]!, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function findExactExtractedRecord(
  sourceDocumentId: string,
  sourceRecordId: string,
  extractedRecordLookup: ExtractedRecordLookup
): ExtractedRecord | undefined {
  return extractedRecordLookup.byScopedId.get(buildScopedExtractedRecordKey(sourceDocumentId, sourceRecordId))
    ?? extractedRecordLookup.byId.get(sourceRecordId)?.find((record) => record.sourceDocumentId === sourceDocumentId)
    ?? extractedRecordLookup.byId.get(sourceRecordId)?.[0]
}

function findFirstExtractedRecord(
  transaction: NormalizedTransaction,
  extractedRecordLookup: ExtractedRecordLookup
): ExtractedRecord | undefined {
  for (const recordId of transaction.extractedRecordIds) {
    for (const sourceDocumentId of transaction.sourceDocumentIds) {
      const exactMatch = extractedRecordLookup.byScopedId.get(buildScopedExtractedRecordKey(sourceDocumentId, recordId))

      if (exactMatch) {
        return exactMatch
      }
    }

    const candidates = extractedRecordLookup.byId.get(recordId) ?? []
    const alignedCandidate = candidates.find((record) => transaction.sourceDocumentIds.includes(record.sourceDocumentId))

    if (alignedCandidate) {
      return alignedCandidate
    }

    if (candidates.length === 1) {
      return candidates[0]
    }
  }

  return undefined
}

function buildScopedExtractedRecordKey(sourceDocumentId: string, sourceRecordId: string): string {
  return `${sourceDocumentId}:${sourceRecordId}`
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
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

function collectParkingSignalTypes(
  entries: Array<[
    'channel' | 'roomName' | 'reference' | 'itemLabel' | 'paymentPurpose' | 'transactionId' | 'payoutReference',
    string | undefined
  ]>
): Array<'channel' | 'roomName' | 'reference' | 'itemLabel' | 'paymentPurpose' | 'transactionId' | 'payoutReference'> {
  return entries
    .filter((entry) => isParkingLike(entry[1]))
    .map(([signalType]) => signalType)
}

function collapseParkingSignalType(
  signalTypes: Array<'channel' | 'roomName' | 'reference' | 'itemLabel' | 'paymentPurpose' | 'transactionId' | 'payoutReference'>
): ReservationPaymentOverviewDebugCandidate['parkingSignalType'] {
  return signalTypes.length > 1 ? 'multiple' : signalTypes[0]!
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

function classifyMerchantOrderReferenceAnchorFamily(
  merchantOrderReference: string | undefined
): 'empty' | 'numeric' | 'alpha_numeric' | 'mixed' {
  const value = (merchantOrderReference ?? '').trim()
  if (!value) {
    return 'empty'
  }

  if (/^\d+$/.test(value)) {
    return 'numeric'
  }

  if (/^[a-z0-9-_/]+$/i.test(value)) {
    return 'alpha_numeric'
  }

  return 'mixed'
}

// ── Invoice list enrichment linking ─────────────────────

function toInvoiceListLinkCandidateSnapshot(
  record: InvoiceListEnrichmentRecord
): ReservationPaymentOverviewInvoiceListLinkCandidate {
  return {
    sourceDocumentId: record.sourceDocumentId,
    reservationId: record.voucher,
    reference: record.variableSymbol,
    voucher: record.voucher,
    variableSymbol: record.variableSymbol,
    invoiceNumber: record.invoiceNumber,
    customerId: record.customerId,
    guestName: record.guestName,
    stayStartAt: record.stayStartAt,
    stayEndAt: record.stayEndAt,
    roomName: record.roomName
  }
}

function collectInvoiceListExactHits(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined,
  invoiceListRecords: InvoiceListEnrichmentRecord[]
): {
  candidateCount: number
  identityHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  documentHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  stayIntervalHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  voucherHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  variableSymbolHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
  invoiceNumberHits: ReservationPaymentOverviewInvoiceListLinkCandidate[]
} {
  const headers = invoiceListRecords.filter((record) => record.recordKind === 'header')
  const merchantOrderReference = normalizeComparable(readString(extractedRecord?.data.merchantOrderReference))
  const comparableVoucherAnchors = collectUniqueTruthyStrings([
    normalizeComparable(row.reservationId),
    normalizeComparable(readString(extractedRecord?.data.reservationId)),
    normalizeComparable(readString(extractedRecord?.data.clientId)),
    merchantOrderReference
  ])
  const comparableDocumentAnchors = collectUniqueTruthyStrings([
    normalizeComparable(readString(extractedRecord?.data.reference)),
    normalizeComparable(row.payoutReference),
    normalizeComparable(readString(extractedRecord?.data.invoiceNumber)),
    merchantOrderReference
  ])
  const normalizedStayStart = normalizeComparableStayDate(readString(extractedRecord?.data.stayStartAt))
  const normalizedStayEnd = normalizeComparableStayDate(readString(extractedRecord?.data.stayEndAt))
  const normalizedRoom = normalizeComparable(readString(extractedRecord?.data.roomName))

  const identityHitRecords = headers.filter((record) => {
    if (comparableVoucherAnchors.length === 0) {
      return false
    }

    const voucher = normalizeComparable(record.voucher)
    const customerId = normalizeComparable(record.customerId)
    return comparableVoucherAnchors.includes(voucher) || comparableVoucherAnchors.includes(customerId)
  })

  const documentHitRecords = headers.filter((record) => {
    if (comparableDocumentAnchors.length === 0) {
      return false
    }

    const variableSymbol = normalizeComparable(record.variableSymbol)
    const invoiceNumber = normalizeComparable(record.invoiceNumber)
    return comparableDocumentAnchors.includes(variableSymbol) || comparableDocumentAnchors.includes(invoiceNumber)
  })

  const voucherHitRecords = headers.filter((record) => {
    if (!merchantOrderReference) {
      return false
    }
    return normalizeComparable(record.voucher) === merchantOrderReference
  })

  const variableSymbolHitRecords = headers.filter((record) => {
    if (!merchantOrderReference) {
      return false
    }
    return normalizeComparable(record.variableSymbol) === merchantOrderReference
  })

  const invoiceNumberHitRecords = headers.filter((record) => {
    if (!merchantOrderReference) {
      return false
    }
    return normalizeComparable(record.invoiceNumber) === merchantOrderReference
  })

  const stayIntervalHitRecords = headers.filter((record) => {
    if (!normalizedStayStart || !normalizedStayEnd || !normalizedRoom) {
      return false
    }

    return normalizeComparableStayDate(record.stayStartAt) === normalizedStayStart
      && normalizeComparableStayDate(record.stayEndAt) === normalizedStayEnd
      && normalizeComparable(record.roomName) === normalizedRoom
  })

  return {
    candidateCount: new Set([
      ...identityHitRecords,
      ...documentHitRecords,
      ...stayIntervalHitRecords
    ]).size,
    identityHits: identityHitRecords.map(toInvoiceListLinkCandidateSnapshot),
    documentHits: documentHitRecords.map(toInvoiceListLinkCandidateSnapshot),
    stayIntervalHits: stayIntervalHitRecords.map(toInvoiceListLinkCandidateSnapshot),
    voucherHits: voucherHitRecords.map(toInvoiceListLinkCandidateSnapshot),
    variableSymbolHits: variableSymbolHitRecords.map(toInvoiceListLinkCandidateSnapshot),
    invoiceNumberHits: invoiceNumberHitRecords.map(toInvoiceListLinkCandidateSnapshot)
  }
}

function hasAnyNativeReservationPlusAnchor(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined
): boolean {
  return collectUniqueTruthyStrings([
    normalizeComparable(readString(extractedRecord?.data.merchantOrderReference)),
    normalizeComparable(readString(extractedRecord?.data.clientId)),
    normalizeComparable(readString(extractedRecord?.data.reservationId)),
    normalizeComparable(readString(extractedRecord?.data.reference)),
    normalizeComparable(row.payoutReference),
    normalizeComparable(row.reservationId)
  ]).length > 0
}

function selectInvoiceListNativeFallback(
  row: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number],
  extractedRecord: ExtractedRecord | undefined,
  invoiceListRecords: InvoiceListEnrichmentRecord[]
): {
  link?: InvoiceListLinkResult
  hasAmbiguousExactCounterparts: boolean
} {
  const merchantOrderReference = readString(extractedRecord?.data.merchantOrderReference)
  const baseAnchors = {
    customerId: readString(extractedRecord?.data.clientId),
    bookedAt: readString(extractedRecord?.data.paidAt)
      ?? readString(extractedRecord?.data.bookedAt)
      ?? readString(extractedRecord?.data.transferredAt)
      ?? row.payoutDate,
    stayStartAt: readString(extractedRecord?.data.stayStartAt),
    stayEndAt: readString(extractedRecord?.data.stayEndAt),
    roomName: readString(extractedRecord?.data.roomName)
  }
  const attempts: Array<{
    voucher?: string
    variableSymbol?: string
    customerId?: string
    invoiceNumber?: string
    stayStartAt?: string
    stayEndAt?: string
    roomName?: string
  }> = [
    {
      ...baseAnchors,
      voucher: merchantOrderReference
        ?? readString(extractedRecord?.data.reservationId)
        ?? readString(extractedRecord?.data.clientId)
        ?? row.reservationId,
      variableSymbol: readString(extractedRecord?.data.reference) ?? row.payoutReference,
      invoiceNumber: readString(extractedRecord?.data.invoiceNumber)
    }
  ]

  if (merchantOrderReference) {
    attempts.push({
      ...baseAnchors,
      variableSymbol: merchantOrderReference
    })
    attempts.push({
      ...baseAnchors,
      invoiceNumber: merchantOrderReference
    })
  }

  let hasAmbiguousExactCounterparts = false

  for (const anchors of attempts) {
    const resolution = findInvoiceListEnrichmentForItem(anchors, invoiceListRecords)
    hasAmbiguousExactCounterparts = hasAmbiguousExactCounterparts || resolution.hasAmbiguousExactCounterparts

    if (resolution.match) {
      return {
        link: resolution.match,
        hasAmbiguousExactCounterparts
      }
    }
  }

  return {
    link: undefined,
    hasAmbiguousExactCounterparts
  }
}

function findInvoiceListEnrichmentForItem(
  anchors: {
    voucher?: string
    variableSymbol?: string
    customerId?: string
    invoiceNumber?: string
    bookedAt?: string
    stayStartAt?: string
    stayEndAt?: string
    roomName?: string
  },
  invoiceListRecords: InvoiceListEnrichmentRecord[]
): {
  match?: InvoiceListLinkResult
  hasAmbiguousExactCounterparts: boolean
} {
  if (invoiceListRecords.length === 0) {
    return { hasAmbiguousExactCounterparts: false }
  }

  const headers = invoiceListRecords.filter((r) => r.recordKind === 'header')
  let hasAmbiguousExactCounterparts = false

  if (anchors.voucher) {
    const byVoucher = headers.filter((r) => r.voucher && normalizeComparable(r.voucher) === normalizeComparable(anchors.voucher))
    if (byVoucher.length === 1) {
      return { match: { record: byVoucher[0], reason: 'exact_voucher' }, hasAmbiguousExactCounterparts }
    }

    if (byVoucher.length > 1) {
      const narrowedByCustomer = anchors.customerId
        ? byVoucher.filter((r) => r.customerId && normalizeComparable(r.customerId) === normalizeComparable(anchors.customerId))
        : []
      if (narrowedByCustomer.length === 1) {
        return { match: { record: narrowedByCustomer[0], reason: 'exact_voucher' }, hasAmbiguousExactCounterparts }
      }

      const narrowedByVariableSymbol = anchors.variableSymbol
        ? byVoucher.filter((r) => r.variableSymbol && normalizeComparable(r.variableSymbol) === normalizeComparable(anchors.variableSymbol))
        : []
      if (narrowedByVariableSymbol.length === 1) {
        return { match: { record: narrowedByVariableSymbol[0], reason: 'exact_voucher' }, hasAmbiguousExactCounterparts }
      }

      const narrowedByInvoiceNumber = anchors.invoiceNumber
        ? byVoucher.filter((r) => r.invoiceNumber && normalizeComparable(r.invoiceNumber) === normalizeComparable(anchors.invoiceNumber))
        : []
      if (narrowedByInvoiceNumber.length === 1) {
        return { match: { record: narrowedByInvoiceNumber[0], reason: 'exact_voucher' }, hasAmbiguousExactCounterparts }
      }

      const anchorMonthKey = resolveComparableMonthKey(anchors.bookedAt)
      const narrowedByMonthKey = anchorMonthKey
        ? byVoucher.filter((r) => resolveInvoiceListHeaderComparableMonthKey(r) === anchorMonthKey)
        : []
      if (narrowedByMonthKey.length === 1) {
        return { match: { record: narrowedByMonthKey[0], reason: 'exact_voucher' }, hasAmbiguousExactCounterparts }
      }

      if (byVoucher.length > 1) {
        hasAmbiguousExactCounterparts = true
      }
    }
  }

  if (anchors.variableSymbol) {
    const byVS = headers.filter((r) => r.variableSymbol && normalizeComparable(r.variableSymbol) === normalizeComparable(anchors.variableSymbol))
    if (byVS.length === 1) {
      return { match: { record: byVS[0], reason: 'exact_variable_symbol' }, hasAmbiguousExactCounterparts }
    }
    if (byVS.length > 1) {
      hasAmbiguousExactCounterparts = true
    }
  }

  if (anchors.customerId && anchors.invoiceNumber) {
    const byCustInv = headers.filter(
      (r) => r.customerId && r.invoiceNumber
        && normalizeComparable(r.customerId) === normalizeComparable(anchors.customerId)
        && normalizeComparable(r.invoiceNumber) === normalizeComparable(anchors.invoiceNumber)
    )
    if (byCustInv.length === 1) {
      return { match: { record: byCustInv[0], reason: 'exact_customer_id' }, hasAmbiguousExactCounterparts }
    }
    if (byCustInv.length > 1) {
      hasAmbiguousExactCounterparts = true
    }
  }

  if (anchors.stayStartAt && anchors.stayEndAt && anchors.roomName) {
    const normalizedStart = normalizeComparableStayDate(anchors.stayStartAt)
    const normalizedEnd = normalizeComparableStayDate(anchors.stayEndAt)
    const normalizedRoom = normalizeComparable(anchors.roomName)

    const byStayRoom = headers.filter((r) =>
      normalizeComparableStayDate(r.stayStartAt) === normalizedStart
      && normalizeComparableStayDate(r.stayEndAt) === normalizedEnd
      && normalizeComparable(r.roomName) === normalizedRoom
    )
    if (byStayRoom.length === 1) {
      return { match: { record: byStayRoom[0], reason: 'exact_stay_room' }, hasAmbiguousExactCounterparts }
    }
    if (byStayRoom.length > 1) {
      hasAmbiguousExactCounterparts = true
    }
  }

  return { hasAmbiguousExactCounterparts }
}

function resolveComparableMonthKey(value: string | undefined): string | undefined {
  const normalized = normalizeComparableStayDate(value)

  if (!normalized || normalized.length < 7) {
    return undefined
  }

  return `${normalized.slice(0, 4)}${normalized.slice(5, 7)}`
}

function resolveInvoiceListHeaderComparableMonthKey(record: InvoiceListEnrichmentRecord): string | undefined {
  const fromVariableSymbol = resolveMonthKeyFromComparableToken(record.variableSymbol)
  if (fromVariableSymbol) {
    return fromVariableSymbol
  }

  return resolveMonthKeyFromComparableToken(record.invoiceNumber)
}

function resolveMonthKeyFromComparableToken(value: string | undefined): string | undefined {
  const normalized = normalizeComparable(value)

  if (!normalized) {
    return undefined
  }

  const monthMatch = normalized.match(/(20\d{2})(0[1-9]|1[0-2])/)
  if (!monthMatch) {
    return undefined
  }

  return `${monthMatch[1]}${monthMatch[2]}`
}

function findInvoiceListEnrichmentForParkingItem(
  anchors: {
    voucher?: string
    variableSymbol?: string
    itemLabel?: string
  },
  invoiceListRecords: InvoiceListEnrichmentRecord[]
): InvoiceListLinkResult | undefined {
  if (invoiceListRecords.length === 0) {
    return undefined
  }

  const lineItems = invoiceListRecords.filter((r) => r.recordKind === 'line-item')

  if (anchors.voucher) {
    const byVoucher = lineItems.filter((r) =>
      r.voucher && normalizeComparable(r.voucher) === normalizeComparable(anchors.voucher)
      && r.itemLabel && isParkingLikeLabel(r.itemLabel)
    )
    if (byVoucher.length === 1) {
      return { record: byVoucher[0], reason: 'exact_voucher' }
    }
  }

  if (anchors.variableSymbol) {
    const byVS = lineItems.filter((r) =>
      r.variableSymbol && normalizeComparable(r.variableSymbol) === normalizeComparable(anchors.variableSymbol)
      && r.itemLabel && isParkingLikeLabel(r.itemLabel)
    )
    if (byVS.length === 1) {
      return { record: byVS[0], reason: 'exact_variable_symbol' }
    }
  }

  return undefined
}

function isParkingLikeLabel(label: string): boolean {
  return normalizeComparable(label).includes('parkov')
}
