import type { ExceptionCase } from '../domain'
import type { MonthlyBatchResult } from '../monthly-batch'

export interface ReviewSectionItem {
  id: string
  kind: 'matched' | 'unmatched' | 'suspicious' | 'missing-document'
  title: string
  detail: string
  transactionIds: string[]
  sourceDocumentIds: string[]
  severity?: ExceptionCase['severity']
}

export interface ReviewScreenData {
  generatedAt: string
  summary: MonthlyBatchResult['reconciliation']['summary']
  matched: ReviewSectionItem[]
  unmatched: ReviewSectionItem[]
  suspicious: ReviewSectionItem[]
  missingDocuments: ReviewSectionItem[]
}

export interface BuildReviewScreenInput {
  batch: MonthlyBatchResult
  generatedAt: string
}

export function buildReviewScreen(input: BuildReviewScreenInput): ReviewScreenData {
  const matched = input.batch.report.matches.map((match) => ({
    id: match.matchGroupId,
    kind: 'matched' as const,
    title: `Spárovaná skupina ${match.matchGroupId}`,
    detail: `${match.reason} Jistota ${(match.confidence * 100).toFixed(0)} %.`,
    transactionIds: match.transactionIds,
    sourceDocumentIds: collectSourceDocumentIds(input.batch, match.transactionIds)
  }))

  const unmatched = input.batch.reconciliation.exceptionCases
    .filter((exceptionCase) => exceptionCase.type === 'unmatched_transaction')
    .filter((exceptionCase) => !isMissingDocument(exceptionCase, input.batch))
    .filter((exceptionCase) => !isSuspicious(exceptionCase))
    .map((exceptionCase) => toReviewItem(exceptionCase, 'unmatched'))

  const suspicious = input.batch.reconciliation.exceptionCases
    .filter((exceptionCase) => isSuspicious(exceptionCase))
    .map((exceptionCase) => toReviewItem(exceptionCase, 'suspicious'))

  const missingDocuments = input.batch.reconciliation.exceptionCases
    .filter((exceptionCase) => isMissingDocument(exceptionCase, input.batch))
    .map((exceptionCase) => ({
      ...toReviewItem(exceptionCase, 'missing-document'),
      title: `Chybějící doklad pro ${exceptionCase.relatedTransactionIds[0] ?? exceptionCase.id}`
    }))

  return {
    generatedAt: input.generatedAt,
    summary: input.batch.reconciliation.summary,
    matched,
    unmatched,
    suspicious,
    missingDocuments
  }
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
    case 'unmatched':
      return 'Nespárováno'
    case 'suspicious':
      return 'Podezřelé'
    case 'missing-document':
      return 'Chybějící doklad'
  }
}

function isSuspicious(exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number]): boolean {
  return exceptionCase.ruleCode === 'suspicious_private_expense'
    || exceptionCase.explanation.toLowerCase().includes('requires review')
    || exceptionCase.explanation.toLowerCase().includes('suspicious')
    || exceptionCase.severity === 'high'
}

function isMissingDocument(
  exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number],
  batch: MonthlyBatchResult
): boolean {
  if (exceptionCase.ruleCode === 'missing_supporting_document') {
    return true
  }

  if (exceptionCase.explanation.includes('supporting invoice or receipt')) {
    return true
  }

  return exceptionCase.relatedTransactionIds.some((transactionId) => {
    const transaction = batch.reconciliation.normalizedTransactions.find((item) => item.id === transactionId)
    return transaction?.direction === 'out'
  })
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