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

export interface ReconciliationReport {
  generatedAt: string
  summary: ReconciliationResult['summary']
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
    severity: string
    explanation: string
    relatedTransactionIds: string[]
    recommendedNextStep?: string
  }>
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

  return {
    generatedAt: input.generatedAt,
    summary: input.reconciliation.summary,
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
      severity: exceptionCase.severity,
      explanation: exceptionCase.explanation,
      relatedTransactionIds: exceptionCase.relatedTransactionIds,
      recommendedNextStep: exceptionCase.recommendedNextStep
    })),
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

export function placeholder() {
  return {
    name: 'reporting',
    renderer: 'reconciliation-report',
    buildReconciliationReport
  }
}
