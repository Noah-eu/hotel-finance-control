import type { ReconciliationResult } from '../reconciliation'

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
  bankAccountId: string
  amountMinor: number
  currency: string
  status: 'matched'
  confidence: number
  reason: string
  evidence: string[]
}

export interface ReconciliationReport {
  generatedAt: string
  summary: ReconciliationResult['summary'] & {
    payoutBatchMatchCount: number
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

  return {
    generatedAt: input.generatedAt,
    summary: {
      ...input.reconciliation.summary,
      payoutBatchMatchCount: payoutBatchMatches.length
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

function buildPayoutBatchMatchEntries(
  reconciliation: ReconciliationResult
): ReconciliationPayoutBatchMatchEntry[] {
  const workflowPlan = reconciliation.workflowPlan

  return (reconciliation.payoutBatchMatches ?? []).flatMap((match) => {
    const batch = workflowPlan?.payoutBatches.find((item) => item.payoutBatchKey === match.payoutBatchKey)

    if (!batch || !match.matched) {
      return []
    }

    return [{
      payoutBatchKey: match.payoutBatchKey,
      platform: toPlatformLabel(batch.platform),
      payoutReference: batch.payoutReference,
      bankAccountId: match.bankAccountId,
      amountMinor: match.amountMinor,
      currency: match.currency,
      status: 'matched',
      confidence: match.confidence,
      reason: buildConcisePayoutBatchReason(match.reasons),
      evidence: match.evidence.map((item) => `${item.key}: ${String(item.value)}`)
    }]
  })
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
  if (reasons.includes('payoutReferenceAligned')) {
    return 'Shoda dávky a bankovního přípisu podle částky, měny a reference payoutu.'
  }

  return 'Shoda dávky a bankovního přípisu podle částky, měny a povoleného směrování.'
}

export function placeholder() {
  return {
    name: 'reporting',
    renderer: 'reconciliation-report',
    buildReconciliationReport
  }
}
