import type { ReconciliationResult } from '../reconciliation'
import { formatAmountMinorCs } from '../shared/money'

export interface ReconciliationReportEntry {
  transactionId: string
  source: string
  direction: string
  amountMinor: number
  currency: string
  bookedAt: string
  reference?: string
  status: 'matched' | 'exception' | 'unmatched'
}

export interface ReconciliationPayoutBatchMatchEntry {
  payoutBatchKey: string
  platform: string
  payoutReference: string
  payoutDate: string
  bankAccountId: string
  matchedBankSummary?: string
  amountMinor: number
  currency: string
  status: 'matched'
  confidence: number
  reason: string
  evidence: string[]
  display: PayoutBatchDisplayMetadata
}

export interface ReconciliationUnmatchedPayoutBatchEntry {
  payoutBatchKey: string
  platform: string
  payoutReference: string
  payoutDate: string
  bankRoutingLabel: string
  amountMinor: number
  currency: string
  status: 'unmatched'
  reason: string
  display: PayoutBatchDisplayMetadata
}

export interface PayoutBatchDisplayMetadata {
  title: string
  context?: string
}

type UnmatchedPayoutBatchReason =
  | 'noExactAmount'
  | 'wrongBankRouting'
  | 'counterpartyClueMismatch'
  | 'ambiguousCandidates'
  | 'dateToleranceMiss'
  | 'noCandidateAtAll'

export interface ReconciliationReport {
  generatedAt: string
  summary: ReconciliationResult['summary'] & {
    payoutBatchMatchCount: number
    unmatchedPayoutBatchCount: number
  }
  matches: Array<{
    matchGroupId: string
    transactionIds: string[]
    confidence: number
    reason: string
    ruleKey: string
  }>
  exceptions: Array<{
    exceptionCaseId: string
    type: string
    ruleCode?: string
    severity: string
    explanation: string
    relatedTransactionIds: string[]
    relatedExtractedRecordIds: string[]
    relatedSourceDocumentIds: string[]
    recommendedNextStep?: string
  }>
  supportedExpenseLinks: Array<{
    expenseTransactionId: string
    supportTransactionId: string
    matchScore: number
    reasons: string[]
    supportSourceDocumentIds: string[]
    supportExtractedRecordIds: string[]
  }>
  payoutBatchMatches: ReconciliationPayoutBatchMatchEntry[]
  unmatchedPayoutBatches: ReconciliationUnmatchedPayoutBatchEntry[]
  transactions: ReconciliationReportEntry[]
}

export interface BuildReconciliationReportInput {
  reconciliation: ReconciliationResult
  generatedAt: string
}

export function buildReconciliationReport(
  input: BuildReconciliationReportInput
): ReconciliationReport {
  const matchedTransactionIds = new Set(
    input.reconciliation.matchGroups.flatMap((group) => group.transactionIds)
  )
  const exceptionTransactionIds = new Set(
    input.reconciliation.exceptionCases.flatMap((exceptionCase) => exceptionCase.relatedTransactionIds)
  )
  const payoutBatchMatches = buildPayoutBatchMatchEntries(input.reconciliation)
  const unmatchedPayoutBatches = buildUnmatchedPayoutBatchEntries(input.reconciliation)

  return {
    generatedAt: input.generatedAt,
    summary: {
      ...input.reconciliation.summary,
      payoutBatchMatchCount: payoutBatchMatches.length,
      unmatchedPayoutBatchCount: unmatchedPayoutBatches.length
    },
    matches: input.reconciliation.matchGroups.map((group) => ({
      matchGroupId: group.id,
      transactionIds: group.transactionIds,
      confidence: group.confidence,
      reason: group.reason,
      ruleKey: group.ruleKey
    })),
    exceptions: input.reconciliation.exceptionCases.map((exceptionCase) => ({
      exceptionCaseId: exceptionCase.id,
      type: exceptionCase.type,
      ruleCode: exceptionCase.ruleCode,
      severity: exceptionCase.severity,
      explanation: exceptionCase.explanation,
      relatedTransactionIds: exceptionCase.relatedTransactionIds,
      relatedExtractedRecordIds: exceptionCase.relatedExtractedRecordIds,
      relatedSourceDocumentIds: exceptionCase.relatedSourceDocumentIds,
      recommendedNextStep: exceptionCase.recommendedNextStep
    })),
    supportedExpenseLinks: (input.reconciliation.supportedExpenseLinks ?? []).map((link) => ({
      expenseTransactionId: link.expenseTransactionId,
      supportTransactionId: link.supportTransactionId,
      matchScore: link.matchScore,
      reasons: link.reasons,
      supportSourceDocumentIds: link.supportSourceDocumentIds,
      supportExtractedRecordIds: link.supportExtractedRecordIds
    })),
    payoutBatchMatches,
    unmatchedPayoutBatches,
    transactions: input.reconciliation.normalizedTransactions.map((transaction) => ({
      transactionId: transaction.id,
      source: transaction.source,
      direction: transaction.direction,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      bookedAt: transaction.bookedAt,
      reference: transaction.reference,
      status: matchedTransactionIds.has(transaction.id)
        ? 'matched'
        : exceptionTransactionIds.has(transaction.id)
          ? 'exception'
          : 'unmatched'
    }))
  }
}

function buildUnmatchedPayoutBatchEntries(
  reconciliation: ReconciliationResult
): ReconciliationUnmatchedPayoutBatchEntry[] {
  return (reconciliation.payoutBatchNoMatchDiagnostics ?? []).map((diagnostic) => {
    const platformLabel = toPlatformLabel(diagnostic.platform)
    const batch = reconciliation.workflowPlan?.payoutBatches.find(
      (item) => item.payoutBatchKey === diagnostic.payoutBatchKey
    )

    return {
      payoutBatchKey: diagnostic.payoutBatchKey,
      platform: platformLabel,
      payoutReference: diagnostic.payoutReference,
      payoutDate: diagnostic.payoutDate,
      bankRoutingLabel: toBankRoutingLabel(diagnostic.bankRoutingTarget),
      amountMinor: diagnostic.expectedTotalMinor,
      currency: diagnostic.currency,
      status: 'unmatched',
      reason: toNoMatchReasonCs(diagnostic.noMatchReason),
      display: buildPayoutBatchDisplayMetadata({
        platform: diagnostic.platform,
        platformLabel,
        payoutReference: diagnostic.payoutReference,
        payoutDate: diagnostic.payoutDate,
        amountMinor: diagnostic.expectedTotalMinor,
        currency: diagnostic.currency,
        payoutSupplementPaymentId: batch?.payoutSupplementPaymentId,
        payoutSupplementPayoutDate: batch?.payoutSupplementPayoutDate,
        payoutSupplementPayoutTotalAmountMinor: batch?.payoutSupplementPayoutTotalAmountMinor,
        payoutSupplementPayoutTotalCurrency: batch?.payoutSupplementPayoutTotalCurrency,
        payoutSupplementLocalAmountMinor: batch?.payoutSupplementLocalAmountMinor,
        payoutSupplementLocalCurrency: batch?.payoutSupplementLocalCurrency,
        payoutSupplementIbanSuffix: batch?.payoutSupplementIbanSuffix,
        payoutSupplementReservationIds: batch?.payoutSupplementReservationIds,
        payoutSupplementExchangeRate: batch?.payoutSupplementExchangeRate
      })
    }
  })
}

function buildPayoutBatchMatchEntries(
  reconciliation: ReconciliationResult
): ReconciliationPayoutBatchMatchEntry[] {
  const workflowPlan = reconciliation.workflowPlan

  return (reconciliation.payoutBatchMatches ?? []).flatMap((match) => {
    const batch = workflowPlan?.payoutBatches.find((item) => item.payoutBatchKey === match.payoutBatchKey)

    if (!batch || !match.matched) {
      return []
    }

    const platformLabel = toPlatformLabel(batch.platform)

    return [{
      payoutBatchKey: match.payoutBatchKey,
      platform: platformLabel,
      payoutReference: batch.payoutReference,
      payoutDate: batch.payoutDate,
      bankAccountId: match.bankAccountId,
      matchedBankSummary: buildMatchedBankSummary(match.evidence),
      amountMinor: match.amountMinor,
      currency: match.currency,
      status: 'matched',
      confidence: match.confidence,
      reason: buildConcisePayoutBatchReason(match.reasons),
      evidence: match.evidence.map((item) => `${item.key}: ${String(item.value)}`),
      display: buildPayoutBatchDisplayMetadata({
        platform: batch.platform,
        platformLabel,
        payoutReference: batch.payoutReference,
        payoutDate: batch.payoutDate,
        amountMinor: match.amountMinor,
        currency: match.currency,
        payoutSupplementPaymentId: batch.payoutSupplementPaymentId,
        payoutSupplementPayoutDate: batch.payoutSupplementPayoutDate,
        payoutSupplementPayoutTotalAmountMinor: batch.payoutSupplementPayoutTotalAmountMinor,
        payoutSupplementPayoutTotalCurrency: batch.payoutSupplementPayoutTotalCurrency,
        payoutSupplementLocalAmountMinor: batch.payoutSupplementLocalAmountMinor,
        payoutSupplementLocalCurrency: batch.payoutSupplementLocalCurrency,
        payoutSupplementIbanSuffix: batch.payoutSupplementIbanSuffix,
        payoutSupplementReservationIds: batch.payoutSupplementReservationIds,
        payoutSupplementExchangeRate: batch.payoutSupplementExchangeRate
      })
    }]
  })
}

function buildPayoutBatchDisplayMetadata(input: {
  platform: string
  platformLabel: string
  payoutReference: string
  payoutDate?: string
  amountMinor: number
  currency: string
  payoutSupplementPaymentId?: string
  payoutSupplementPayoutDate?: string
  payoutSupplementPayoutTotalAmountMinor?: number
  payoutSupplementPayoutTotalCurrency?: string
  payoutSupplementLocalAmountMinor?: number
  payoutSupplementLocalCurrency?: string
  payoutSupplementIbanSuffix?: string
  payoutSupplementReservationIds?: string[]
  payoutSupplementExchangeRate?: string
}): PayoutBatchDisplayMetadata {
  const normalizedReference = input.payoutReference.trim()
  const supplementPaymentId = input.payoutSupplementPaymentId?.trim()
  const supplementPayoutDate = input.payoutSupplementPayoutDate?.trim()
  const supplementPayoutTotalAmountMinor = input.payoutSupplementPayoutTotalAmountMinor
  const supplementPayoutTotalCurrency = input.payoutSupplementPayoutTotalCurrency?.trim()
  const supplementLocalAmountMinor = input.payoutSupplementLocalAmountMinor
  const supplementLocalCurrency = input.payoutSupplementLocalCurrency?.trim()
  const supplementIbanSuffix = input.payoutSupplementIbanSuffix?.trim()
  const supplementReservationCount = input.payoutSupplementReservationIds?.length ?? 0
  const supplementExchangeRate = input.payoutSupplementExchangeRate?.trim()
  const titleAmountMinor = supplementLocalAmountMinor ?? input.amountMinor
  const titleCurrency = supplementLocalCurrency ?? input.currency
  const shouldShowSupplementPayoutTotal = Boolean(
    supplementPayoutTotalAmountMinor !== undefined
    && supplementPayoutTotalCurrency
    && (
      supplementPayoutTotalAmountMinor !== titleAmountMinor
      || supplementPayoutTotalCurrency !== titleCurrency
    )
  )
  const formattedSupplementPayoutTotal = shouldShowSupplementPayoutTotal
    ? formatAmountMinorCs(supplementPayoutTotalAmountMinor!, supplementPayoutTotalCurrency!)
    : undefined

  if (input.platform === 'booking' && (supplementPaymentId || supplementIbanSuffix)) {
    const primaryId = supplementPaymentId || normalizedReference
    const contextParts = [
      supplementPayoutDate || input.payoutDate ? `Datum payoutu: ${supplementPayoutDate ?? input.payoutDate}` : undefined,
      formattedSupplementPayoutTotal ? `Celkem payoutu: ${formattedSupplementPayoutTotal}` : undefined,
      supplementExchangeRate && shouldShowSupplementPayoutTotal ? `Kurz: ${supplementExchangeRate}` : undefined,
      supplementIbanSuffix ? `IBAN ${supplementIbanSuffix}` : undefined,
      supplementReservationCount > 0 ? `rezervace: ${supplementReservationCount}` : undefined
    ].filter((value): value is string => typeof value === 'string')

    return {
      title: `${input.platformLabel} payout ${primaryId} / ${formatAmountMinorCs(titleAmountMinor, titleCurrency)}`,
      ...(contextParts.length > 0 ? { context: contextParts.join(' · ') } : {})
    }
  }

  if (hasNonSyntheticProviderReference(input.platform, normalizedReference)) {
    return {
      title: `${input.platformLabel} payout dávka ${normalizedReference}`
    }
  }

  if (input.payoutDate) {
    return {
      title: `${input.platformLabel} payout dávka ${input.payoutDate} / ${formatAmountMinorCs(input.amountMinor, input.currency)}`,
      ...(normalizedReference ? { context: `Reference payoutu: ${normalizedReference}` } : {})
    }
  }

  if (normalizedReference) {
    return {
      title: `${input.platformLabel} payout dávka ${normalizedReference}`
    }
  }

  return {
    title: `${input.platformLabel} payout dávka`
  }
}

function hasNonSyntheticProviderReference(platform: string, payoutReference: string): boolean {
  if (!payoutReference) {
    return false
  }

  if (platform.trim().toLowerCase() === 'airbnb') {
    return !payoutReference.toUpperCase().startsWith('AIRBNB-TRANSFER:')
  }

  return true
}

function toPlatformLabel(platform: string): string {
  if (platform === 'booking') {
    return 'Booking'
  }

  if (platform === 'airbnb') {
    return 'Airbnb'
  }

  if (platform === 'comgate') {
    return 'Comgate'
  }

  return platform
}

function buildConcisePayoutBatchReason(reasons: string[]): string {
  if (reasons.includes('supplementPaymentIdAligned')) {
    return 'Shoda dávky a bankovního přípisu podle lokální payout částky, data payoutu a ID platby Booking.'
  }

  if (reasons.includes('supplementReferenceHintAligned')) {
    return 'Shoda dávky a bankovního přípisu podle lokální payout částky, data payoutu, Booking protiúčtu a booking reference hintu.'
  }

  if (reasons.includes('payoutReferenceAligned')) {
    return 'Shoda dávky a bankovního přípisu podle částky, měny a reference payoutu.'
  }

  if (reasons.includes('counterpartyClueAligned')) {
    return 'Shoda dávky a bankovního přípisu podle částky, měny, povoleného směrování a pozorovaného protiúčtu.'
  }

  return 'Shoda dávky a bankovního přípisu podle částky, měny a povoleného směrování.'
}

function toBankRoutingLabel(bankRoutingTarget: string): string {
  if (bankRoutingTarget === 'rb_bank_inflow') {
    return 'RB účet'
  }

  if (bankRoutingTarget === 'fio_bank_inflow') {
    return 'Fio účet'
  }

  return 'Určený bankovní účet'
}

function toNoMatchReasonCs(reason: UnmatchedPayoutBatchReason): string {
  switch (reason) {
    case 'noExactAmount':
      return 'Žádná bankovní položka se stejnou částkou.'
    case 'ambiguousCandidates':
      return 'Více možných bankovních kandidátů.'
    case 'wrongBankRouting':
      return 'Nesprávný bankovní účet.'
    case 'counterpartyClueMismatch':
      return 'Chybí očekávaná stopa protiúčtu pro tento typ payoutu.'
    case 'dateToleranceMiss':
      return 'Žádný vhodný kandidát v očekávaném datu payoutu.'
    case 'noCandidateAtAll':
      return 'Žádný vhodný kandidát.'
  }

  return 'Žádný vhodný kandidát.'
}

function buildMatchedBankSummary(
  evidence: Array<{ key: string, value: string | number | boolean }>
): string | undefined {
  const bookedAt = stringEvidence(evidence, 'bankBookedAt')
  const counterparty = stringEvidence(evidence, 'bankCounterparty')
  const reference = stringEvidence(evidence, 'bankReference')
  const parts = [bookedAt, counterparty, reference].filter((value): value is string => Boolean(value))

  return parts.length > 0 ? parts.join(' · ') : undefined
}

function stringEvidence(
  evidence: Array<{ key: string, value: string | number | boolean }>,
  key: string
): string | undefined {
  const value = evidence.find((item) => item.key === key)?.value
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function placeholder() {
  return {
    name: 'reporting',
    renderer: 'reconciliation-report',
    buildReconciliationReport
  }
}
