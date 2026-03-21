import type { ExceptionCase } from '../domain'
import type { MonthlyBatchResult } from '../monthly-batch'

export interface ReviewSectionItem {
  id: string
  kind: 'matched' | 'unmatched' | 'unmatched-reservation-settlement' | 'suspicious' | 'missing-document'
  title: string
  detail: string
  transactionIds: string[]
  sourceDocumentIds: string[]
  severity?: ExceptionCase['severity']
}

export interface ReviewScreenData {
  generatedAt: string
  summary: MonthlyBatchResult['report']['summary']
  matched: ReviewSectionItem[]
  unmatchedReservationSettlements: ReviewSectionItem[]
  payoutBatchMatched: ReviewSectionItem[]
  payoutBatchUnmatched: ReviewSectionItem[]
  unmatched: ReviewSectionItem[]
  suspicious: ReviewSectionItem[]
  missingDocuments: ReviewSectionItem[]
}

export interface BuildReviewScreenInput {
  batch: MonthlyBatchResult
  generatedAt: string
}

export function buildReviewScreen(input: BuildReviewScreenInput): ReviewScreenData {
  const categorizedExceptionCases = input.batch.reconciliation.exceptionCases.reduce(
    (accumulator, exceptionCase) => {
      const bucket = classifyReviewBucket(exceptionCase)

      if (bucket === 'missing-document') {
        accumulator.missingDocuments.push(exceptionCase)
      } else if (bucket === 'suspicious') {
        accumulator.suspicious.push(exceptionCase)
      } else {
        accumulator.unmatched.push(exceptionCase)
      }

      return accumulator
    },
    {
      unmatched: [] as MonthlyBatchResult['reconciliation']['exceptionCases'],
      suspicious: [] as MonthlyBatchResult['reconciliation']['exceptionCases'],
      missingDocuments: [] as MonthlyBatchResult['reconciliation']['exceptionCases']
    }
  )

  const matched = input.batch.report.matches.map((match) => ({
    id: match.matchGroupId,
    kind: 'matched' as const,
    title: `Spárovaná skupina ${match.matchGroupId}`,
    detail: `${match.reason} Jistota ${(match.confidence * 100).toFixed(0)} %.`,
    transactionIds: match.transactionIds,
    sourceDocumentIds: collectSourceDocumentIds(input.batch, match.transactionIds)
  }))

  const payoutBatchMatched = input.batch.report.payoutBatchMatches.map((match) => ({
    id: `payout-batch:${match.payoutBatchKey}`,
    kind: 'matched' as const,
    title: `${match.platform} payout dávka ${match.payoutReference}`,
    detail: `${match.reason} Bankovní účet: ${match.bankAccountId}. Částka: ${match.amountMinor} ${match.currency}.`,
    transactionIds: [],
    sourceDocumentIds: collectSourceDocumentIdsForPayoutBatch(input.batch, match.payoutBatchKey)
  }))

  const payoutBatchUnmatched = input.batch.report.unmatchedPayoutBatches.map((batch) => ({
    id: `payout-batch-unmatched:${batch.payoutBatchKey}`,
    kind: 'unmatched' as const,
    title: `${batch.platform} payout dávka ${batch.payoutReference}`,
    detail: `${batch.reason} Datum payoutu: ${batch.payoutDate}. Očekávaná částka: ${batch.amountMinor} ${batch.currency}. Směřování: ${batch.bankRoutingLabel}.`,
    transactionIds: [],
    sourceDocumentIds: collectSourceDocumentIdsForPayoutBatch(input.batch, batch.payoutBatchKey)
  }))

  const unmatchedReservationSettlements = (input.batch.reconciliation.workflowPlan?.reservationSettlementNoMatches ?? [])
    .map((noMatch) => toReservationSettlementNoMatchReviewItem(input.batch, noMatch))

  const unmatched = categorizedExceptionCases.unmatched
    .map((exceptionCase) => toReviewItem(exceptionCase, 'unmatched'))

  const suspicious = categorizedExceptionCases.suspicious
    .map((exceptionCase) => toReviewItem(exceptionCase, 'suspicious'))

  const missingDocuments = categorizedExceptionCases.missingDocuments
    .map((exceptionCase) => toMissingDocumentReviewItem(input.batch, exceptionCase))

  return {
    generatedAt: input.generatedAt,
    summary: input.batch.report.summary,
    matched,
    unmatchedReservationSettlements,
    payoutBatchMatched,
    payoutBatchUnmatched,
    unmatched,
    suspicious,
    missingDocuments
  }
}

function collectSourceDocumentIdsForPayoutBatch(batch: MonthlyBatchResult, payoutBatchKey: string): string[] {
  const ids = new Set<string>()
  const payoutRows = batch.reconciliation.workflowPlan?.payoutRows.filter((row) => row.payoutBatchKey === payoutBatchKey) ?? []

  for (const row of payoutRows) {
    ids.add(row.sourceDocumentId)
  }

  return [...ids]
}

export function placeholder() {
  return {
    name: 'review',
    surface: 'baseline',
    buildReviewScreen
  }
}

function toReviewItem(
  exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number],
  kind: ReviewSectionItem['kind']
): ReviewSectionItem {
  return {
    id: exceptionCase.id,
    kind,
    title: `${toTitle(kind)}: ${exceptionCase.ruleCode ?? exceptionCase.type}`,
    detail: exceptionCase.explanation,
    transactionIds: exceptionCase.relatedTransactionIds,
    sourceDocumentIds: exceptionCase.relatedSourceDocumentIds,
    severity: exceptionCase.severity
  }
}

function toTitle(kind: ReviewSectionItem['kind']): string {
  switch (kind) {
    case 'matched':
      return 'Spárováno'
    case 'unmatched-reservation-settlement':
      return 'Nespárovaná rezervace k úhradě'
    case 'unmatched':
      return 'Nespárováno'
    case 'suspicious':
      return 'Podezřelé'
    case 'missing-document':
      return 'Chybějící doklad'
  }
}

function toReservationSettlementNoMatchReviewItem(
  batch: MonthlyBatchResult,
  noMatch: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['reservationSettlementNoMatches'][number]
): ReviewSectionItem {
  const reservation = batch.reconciliation.workflowPlan?.reservationSources.find(
    (item) => item.reservationId === noMatch.reservationId && item.sourceDocumentId === noMatch.sourceDocumentId
  )

  const detailParts = [
    buildReservationSettlementReasonCs(noMatch.noMatchReason, reservation?.expectedSettlementChannels),
    reservation?.reference && reservation.reference !== reservation.reservationId ? `Reference: ${reservation.reference}.` : undefined,
    reservation?.channel ? `Kanál: ${toReservationChannelLabel(reservation.channel)}.` : undefined,
    reservation?.stayStartAt && reservation?.stayEndAt
      ? `Pobyt: ${reservation.stayStartAt} – ${reservation.stayEndAt}.`
      : reservation?.stayStartAt
        ? `Datum pobytu: ${reservation.stayStartAt}.`
        : undefined,
    typeof reservation?.grossRevenueMinor === 'number'
      ? `Částka: ${formatAmountMinorForReview(reservation.grossRevenueMinor, reservation.currency)}.`
      : undefined
  ].filter((part): part is string => Boolean(part))

  return {
    id: `reservation-settlement-unmatched:${noMatch.sourceDocumentId}:${noMatch.reservationId}`,
    kind: 'unmatched-reservation-settlement',
    title: `Rezervace ${reservation?.reservationId ?? noMatch.reservationId}`,
    detail: detailParts.join(' '),
    transactionIds: [],
    sourceDocumentIds: [noMatch.sourceDocumentId]
  }
}

function buildReservationSettlementReasonCs(
  reason: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['reservationSettlementNoMatches'][number]['noMatchReason'],
  expectedChannels: string[] | undefined
): string {
  switch (reason) {
    case 'amountMismatch':
      return 'Částka nesouhlasí s očekávanou úhradou.'
    case 'ambiguousCandidates':
      return 'Není jednoznačný kandidát pro úhradu rezervace.'
    case 'channelMismatch':
      return buildReservationChannelMismatchReason(expectedChannels)
    case 'noCandidate':
      return buildReservationMissingCandidateReason(expectedChannels)
  }
}

function buildReservationMissingCandidateReason(expectedChannels: string[] | undefined): string {
  const channels = expectedChannels ?? []

  if (channels.includes('booking')) {
    return 'Nenalezen odpovídající payout z Bookingu.'
  }

  if (channels.includes('airbnb')) {
    return 'Nenalezen odpovídající payout z Airbnb.'
  }

  if (channels.includes('comgate')) {
    return 'Nenalezen odpovídající payout z platební brány.'
  }

  if (channels.includes('expedia_direct_bank')) {
    return 'Nenalezena odpovídající bankovní úhrada.'
  }

  return 'Chybí deterministická vazba na odpovídající úhradu.'
}

function buildReservationChannelMismatchReason(expectedChannels: string[] | undefined): string {
  const channels = expectedChannels ?? []

  if (channels.includes('booking')) {
    return 'Nenalezen odpovídající payout z Bookingu ve správném kanálu.'
  }

  if (channels.includes('airbnb')) {
    return 'Nenalezen odpovídající payout z Airbnb ve správném kanálu.'
  }

  if (channels.includes('comgate')) {
    return 'Nenalezen odpovídající payout z platební brány ve správném kanálu.'
  }

  if (channels.includes('expedia_direct_bank')) {
    return 'Nenalezena odpovídající bankovní úhrada ve správném kanálu.'
  }

  return 'Chybí odpovídající úhrada ve správném kanálu.'
}

function toReservationChannelLabel(channel: string): string {
  switch (channel) {
    case 'direct-web':
      return 'Přímá rezervace'
    case 'booking':
      return 'Booking'
    case 'airbnb':
      return 'Airbnb'
    case 'comgate':
      return 'Platební brána'
    case 'expedia_direct_bank':
      return 'Bankovní úhrada Expedia'
    default:
      return channel
  }
}

function formatAmountMinorForReview(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2).replace('.', ',')} ${currency}`
}

function classifyReviewBucket(
  exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number]
): Exclude<ReviewSectionItem['kind'], 'matched'> {
  if (exceptionCase.ruleCode === 'missing_supporting_document') {
    return 'missing-document'
  }

  if (exceptionCase.ruleCode === 'suspicious_private_expense') {
    return 'suspicious'
  }

  if (exceptionCase.type === 'unmatched_document') {
    return 'missing-document'
  }

  return 'unmatched'
}

function collectSourceDocumentIds(batch: MonthlyBatchResult, transactionIds: string[]): string[] {
  const ids = new Set<string>()

  for (const transactionId of transactionIds) {
    const transaction = batch.reconciliation.normalizedTransactions.find((item) => item.id === transactionId)
    for (const sourceDocumentId of transaction?.sourceDocumentIds ?? []) {
      ids.add(sourceDocumentId)
    }
  }

  return [...ids]
}

function toMissingDocumentReviewItem(
  batch: MonthlyBatchResult,
  exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number]
): ReviewSectionItem {
  const base = toReviewItem(exceptionCase, 'missing-document')
  const transactionId = exceptionCase.relatedTransactionIds[0]
  const transaction = transactionId
    ? batch.reconciliation.normalizedTransactions.find((item) => item.id === transactionId)
    : undefined

  const hints = [
    transaction?.counterparty ? `Protiúčastník: ${transaction.counterparty}` : undefined,
    transaction?.reference ? `Reference: ${transaction.reference}` : undefined,
    transaction ? `Částka: ${transaction.amountMinor} ${transaction.currency}` : undefined,
    transaction ? `Datum: ${transaction.bookedAt}` : undefined
  ].filter(Boolean)

  return {
    ...base,
    title: `Chybějící doklad pro ${transactionId ?? exceptionCase.id}`,
    detail: hints.length > 0 ? `${base.detail} ${hints.join(' • ')}` : base.detail
  }
}