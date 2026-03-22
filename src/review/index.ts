import type { ExceptionCase } from '../domain'
import type { MonthlyBatchResult } from '../monthly-batch'
import { formatAmountMinorCs } from '../shared/money'

export interface ReviewSectionItem {
  id: string
  kind: 'matched' | 'unmatched' | 'unmatched-reservation-settlement' | 'reservation-settlement-overview' | 'ancillary-settlement-overview' | 'suspicious' | 'missing-document'
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
  reservationSettlementOverview: ReviewSectionItem[]
  ancillarySettlementOverview: ReviewSectionItem[]
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
    detail: buildPayoutBatchMatchDetail(input.batch, match),
    transactionIds: [],
    sourceDocumentIds: collectSourceDocumentIdsForPayoutBatch(input.batch, match.payoutBatchKey)
  }))

  const payoutBatchUnmatched = input.batch.report.unmatchedPayoutBatches.map((batch) => ({
    id: `payout-batch-unmatched:${batch.payoutBatchKey}`,
    kind: 'unmatched' as const,
    title: `${batch.platform} payout dávka ${batch.payoutReference}`,
    detail: buildPayoutBatchUnmatchedDetail(input.batch, batch),
    transactionIds: [],
    sourceDocumentIds: collectSourceDocumentIdsForPayoutBatch(input.batch, batch.payoutBatchKey)
  }))

  const unmatchedReservationSettlements = (input.batch.reconciliation.workflowPlan?.reservationSettlementNoMatches ?? [])
    .map((noMatch) => toReservationSettlementNoMatchReviewItem(input.batch, noMatch))

  const reservationSettlementOverview = (input.batch.reconciliation.workflowPlan?.reservationSources ?? [])
    .map((reservation) => toReservationSettlementOverviewItem(input.batch, reservation))

  const ancillarySettlementOverview = (input.batch.reconciliation.workflowPlan?.ancillaryRevenueSources ?? [])
    .map((item) => toAncillarySettlementOverviewItem(input.batch, item))

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
    reservationSettlementOverview,
    ancillarySettlementOverview,
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

function buildPayoutBatchMatchDetail(
  batch: MonthlyBatchResult,
  match: MonthlyBatchResult['report']['payoutBatchMatches'][number]
): string {
  const detailParts = [
    match.reason,
    `Bankovní účet: ${match.bankAccountId}.`,
    `Částka: ${formatAmountMinorCs(match.amountMinor, match.currency)}.`
  ]

  const descriptor = findTransferBatchDescriptor(batch, match.payoutBatchKey)
  if (descriptor) {
    detailParts.push(`Zdrojový transfer: ${descriptor}.`)
  }

  return detailParts.join(' ')
}

function buildPayoutBatchUnmatchedDetail(
  batch: MonthlyBatchResult,
  unmatched: MonthlyBatchResult['report']['unmatchedPayoutBatches'][number]
): string {
  const detailParts = [
    unmatched.reason,
    `Datum payoutu: ${unmatched.payoutDate}.`,
    `Očekávaná částka: ${formatAmountMinorCs(unmatched.amountMinor, unmatched.currency)}.`,
    `Směřování: ${unmatched.bankRoutingLabel}.`
  ]

  const descriptor = findTransferBatchDescriptor(batch, unmatched.payoutBatchKey)
  if (descriptor) {
    detailParts.push(`Zdrojový transfer: ${descriptor}.`)
  }

  return detailParts.join(' ')
}

function findTransferBatchDescriptor(batch: MonthlyBatchResult, payoutBatchKey: string): string | undefined {
  const payoutRow = batch.reconciliation.workflowPlan?.payoutRows.find((row) => row.payoutBatchKey === payoutBatchKey)

  if (!payoutRow) {
    return undefined
  }

  const extractedRecord = batch.extractedRecords.find((record) =>
    record.sourceDocumentId === payoutRow.sourceDocumentId
    && record.data.payoutBatchKey === payoutBatchKey
  )

  const descriptor = extractedRecord?.data.transferBatchDescriptor

  return typeof descriptor === 'string' && descriptor.trim()
    ? descriptor.trim()
    : undefined
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
    case 'reservation-settlement-overview':
      return 'Přehled rezervace k úhradě'
    case 'ancillary-settlement-overview':
      return 'Přehled doplňkové položky'
    case 'unmatched':
      return 'Nespárováno'
    case 'suspicious':
      return 'Podezřelé'
    case 'missing-document':
      return 'Chybějící doklad'
  }
}

function toReservationSettlementOverviewItem(
  batch: MonthlyBatchResult,
  reservation: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['reservationSources'][number]
): ReviewSectionItem {
  const match = batch.reconciliation.workflowPlan?.reservationSettlementMatches.find(
    (item) => item.reservationId === reservation.reservationId && item.sourceDocumentId === reservation.sourceDocumentId
  )
  const noMatch = batch.reconciliation.workflowPlan?.reservationSettlementNoMatches.find(
    (item) => item.reservationId === reservation.reservationId && item.sourceDocumentId === reservation.sourceDocumentId
  )

  const detailParts = [
    'Typ položky: Hlavní ubytovací rezervace.',
    reservation.roomName ? `Jednotka: ${reservation.roomName}.` : undefined,
    reservation.channel ? `Kanál: ${toReservationChannelLabel(reservation.channel)}.` : undefined,
    `Očekávaná cesta úhrady: ${buildExpectedSettlementPathCs(reservation.expectedSettlementChannels, reservation.channel)}.`,
    reservation.reference && reservation.reference !== reservation.reservationId ? `Reference: ${reservation.reference}.` : undefined,
    reservation.stayStartAt && reservation.stayEndAt
      ? `Pobyt: ${reservation.stayStartAt} – ${reservation.stayEndAt}.`
      : reservation.stayStartAt
        ? `Datum pobytu: ${reservation.stayStartAt}.`
        : undefined,
    `Částka: ${formatAmountMinorForReview(reservation.grossRevenueMinor, reservation.currency)}.`,
    buildSettlementStatusDetailCs(match, noMatch)
  ].filter((part): part is string => Boolean(part))

  return {
    id: `reservation-settlement-overview:${reservation.sourceDocumentId}:${reservation.reservationId}`,
    kind: 'reservation-settlement-overview',
    title: `Rezervace ${reservation.reservationId}`,
    detail: detailParts.join(' '),
    transactionIds: match ? collectReservationMatchTransactionIds(match) : [],
    sourceDocumentIds: [reservation.sourceDocumentId]
  }
}

function toAncillarySettlementOverviewItem(
  batch: MonthlyBatchResult,
  item: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['ancillaryRevenueSources'][number]
): ReviewSectionItem {
  const candidate = findAncillaryCandidate(batch, item)

  const detailParts = [
    'Typ položky: Doplňková položka.',
    item.itemLabel ? `Položka: ${item.itemLabel}.` : undefined,
    item.channel ? `Kanál: ${toReservationChannelLabel(item.channel)}.` : undefined,
    `Očekávaná cesta úhrady: ${buildExpectedSettlementPathCs([], item.channel)}.`,
    item.reservationId ? `Rezervace: ${item.reservationId}.` : undefined,
    `Částka: ${formatAmountMinorForReview(item.grossRevenueMinor, item.currency)}.`,
    candidate
      ? `Pasuje s kandidátem: ${buildAncillaryCandidateSummary(candidate)}.`
      : buildAncillaryNoMatchReasonCs(item.channel)
  ].filter((part): part is string => Boolean(part))

  return {
    id: `ancillary-settlement-overview:${item.sourceDocumentId}:${item.reference}`,
    kind: 'ancillary-settlement-overview',
    title: item.reference === item.reservationId || !item.reservationId
      ? `Doplňková položka ${item.itemLabel ?? item.reference}`
      : `Doplňková položka ${item.reference}`,
    detail: detailParts.join(' '),
    transactionIds: candidate ? [candidate.rowId] : [],
    sourceDocumentIds: [item.sourceDocumentId]
  }
}

function buildExpectedSettlementPathCs(expectedChannels: string[] | undefined, fallbackChannel: string | undefined): string {
  const channels = expectedChannels && expectedChannels.length > 0 ? expectedChannels : inferExpectedChannelsFromFallback(fallbackChannel)

  if (channels.includes('booking')) {
    return 'očekávaná úhrada přes Booking na RB účet, typicky se stopou Booking v protiúčtu'
  }

  if (channels.includes('airbnb')) {
    return 'očekávaná úhrada přes Airbnb na RB účet, typicky se stopou CITIBANK v protiúčtu'
  }

  if (channels.includes('comgate')) {
    return 'očekávaná úhrada přes platební bránu na RB účet, typicky se stopou Comgate v protiúčtu'
  }

  if (channels.includes('expedia_direct_bank')) {
    return 'očekávaná přímá bankovní úhrada na Fio účet, typicky se stopou Zúčtování POS terminálu'
  }

  return 'očekávaná cesta úhrady zatím není určena'
}

function inferExpectedChannelsFromFallback(channel: string | undefined): string[] {
  switch (channel) {
    case 'booking':
      return ['booking']
    case 'airbnb':
      return ['airbnb']
    case 'comgate':
    case 'direct':
    case 'direct-web':
      return ['comgate']
    case 'expedia_direct_bank':
      return ['expedia_direct_bank']
    default:
      return []
  }
}

function buildSettlementStatusDetailCs(
  match: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['reservationSettlementMatches'][number] | undefined,
  noMatch: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['reservationSettlementNoMatches'][number] | undefined
): string {
  if (match) {
    return `Pasuje s kandidátem: ${buildReservationMatchSummary(match)}.`
  }

  if (noMatch) {
    return buildReservationSettlementReasonCs(noMatch.noMatchReason, undefined)
  }

  return 'Stav kandidáta zatím není k dispozici.'
}

function buildReservationMatchSummary(
  match: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['reservationSettlementMatches'][number]
): string {
  return `${toSettlementPlatformLabel(match.platform)} ${match.matchedRowId ?? match.matchedSettlementId ?? match.reference ?? match.reservationId} za ${formatAmountMinorForReview(match.amountMinor, match.currency)}`
}

function collectReservationMatchTransactionIds(
  match: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['reservationSettlementMatches'][number]
): string[] {
  const ids = [match.matchedRowId, match.matchedSettlementId].filter((value): value is string => Boolean(value))
  return ids
}

function findAncillaryCandidate(
  batch: MonthlyBatchResult,
  item: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['ancillaryRevenueSources'][number]
): NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number] | undefined {
  const expectedPlatforms = inferExpectedChannelsFromFallback(item.channel)

  return batch.reconciliation.workflowPlan?.payoutRows.find((row) => {
    if (row.amountMinor !== item.grossRevenueMinor || row.currency !== item.currency) {
      return false
    }

    if (expectedPlatforms.length > 0 && !expectedPlatforms.includes(row.platform)) {
      return false
    }

    const referenceCandidates = [row.reservationId, row.payoutReference]
    return referenceCandidates.some((candidate) => candidate === item.reference || candidate === item.reservationId)
  })
}

function buildAncillaryCandidateSummary(
  candidate: NonNullable<MonthlyBatchResult['reconciliation']['workflowPlan']>['payoutRows'][number]
): string {
  return `${toSettlementPlatformLabel(candidate.platform)} ${candidate.rowId} za ${formatAmountMinorForReview(candidate.amountMinor, candidate.currency)}`
}

function buildAncillaryNoMatchReasonCs(channel: string | undefined): string {
  return `Bez kandidáta: ${buildReservationMissingCandidateReason(inferExpectedChannelsFromFallback(channel))}`
}

function toSettlementPlatformLabel(platform: string): string {
  switch (platform) {
    case 'booking':
      return 'Booking'
    case 'airbnb':
      return 'Airbnb'
    case 'comgate':
      return 'Platební brána'
    case 'expedia_direct_bank':
      return 'Přímá bankovní úhrada'
    default:
      return platform
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
    return 'Nenalezen odpovídající payout z Bookingu na RB účtu se stopou Booking.'
  }

  if (channels.includes('airbnb')) {
    return 'Nenalezen odpovídající payout z Airbnb na RB účtu se stopou CITIBANK.'
  }

  if (channels.includes('comgate')) {
    return 'Nenalezen odpovídající payout z platební brány na RB účtu se stopou Comgate.'
  }

  if (channels.includes('expedia_direct_bank')) {
    return 'Nenalezena odpovídající bankovní úhrada na Fio účtu se stopou Zúčtování POS terminálu.'
  }

  return 'Chybí deterministická vazba na odpovídající úhradu.'
}

function buildReservationChannelMismatchReason(expectedChannels: string[] | undefined): string {
  const channels = expectedChannels ?? []

  if (channels.includes('booking')) {
    return 'Nenalezen odpovídající payout z Bookingu ve správném kanálu a na RB účtu.'
  }

  if (channels.includes('airbnb')) {
    return 'Nenalezen odpovídající payout z Airbnb ve správném kanálu a na RB účtu.'
  }

  if (channels.includes('comgate')) {
    return 'Nenalezen odpovídající payout z platební brány ve správném kanálu a na RB účtu.'
  }

  if (channels.includes('expedia_direct_bank')) {
    return 'Nenalezena odpovídající bankovní úhrada ve správném kanálu a na Fio účtu.'
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