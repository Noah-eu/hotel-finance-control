import type { ExceptionCase, NormalizedTransaction } from '../domain'
import type { MonthlyBatchResult, UploadedMonthlyFileRoute } from '../monthly-batch'
import { formatAmountMinorCs } from '../shared/money'

export type ReviewMatchStrength =
  | 'potvrzená shoda'
  | 'slabší shoda'
  | 'vyžaduje kontrolu'
  | 'nespárováno'

export interface ReviewEvidenceEntry {
  label:
  | 'částka'
  | 'rozdíl částky'
  | 'datum'
  | 'rozdíl dnů'
  | 'reference'
  | 'protistrana / účet'
  | 'protistrana / dodavatel'
  | 'IBAN'
  | 'zpráva banky'
  | 'dokument'
  | 'provenience'
  value: string
}

export interface ReviewExpenseComparisonSide {
  supplierOrCounterparty?: string
  reference?: string
  issueDate?: string
  dueDate?: string
  amount?: string
  currency?: string
  ibanHint?: string
  bookedAt?: string
  bankAccount?: string
}

export interface ReviewExpenseComparison {
  variant?: 'document-bank' | 'bank-bank'
  leftLabel?: string
  rightLabel?: string
  document: ReviewExpenseComparisonSide
  bank?: ReviewExpenseComparisonSide
}

export interface ReviewSectionItem {
  id: string
  domain: 'payout' | 'expense'
  kind:
  | 'matched'
  | 'unmatched'
  | 'unmatched-reservation-settlement'
  | 'reservation-settlement-overview'
  | 'ancillary-settlement-overview'
  | 'suspicious'
  | 'missing-document'
  | 'expense-matched'
  | 'expense-review'
  | 'expense-unmatched-document'
  | 'expense-unmatched-outflow'
  | 'expense-unmatched-inflow'
  title: string
  detail: string
  transactionIds: string[]
  sourceDocumentIds: string[]
  severity?: ExceptionCase['severity']
  matchStrength: ReviewMatchStrength
  evidenceSummary: ReviewEvidenceEntry[]
  operatorExplanation: string
  operatorCheckHint?: string
  documentBankRelation?: string
  expenseComparison?: ReviewExpenseComparison
  manualDecision?: 'confirmed' | 'rejected'
  manualDecisionLabel?: string
  manualDecisionAt?: string
  manualSourceReviewItemId?: string
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
  expenseMatched: ReviewSectionItem[]
  expenseNeedsReview: ReviewSectionItem[]
  expenseUnmatchedDocuments: ReviewSectionItem[]
  expenseUnmatchedOutflows: ReviewSectionItem[]
  expenseUnmatchedInflows: ReviewSectionItem[]
  unmatched: ReviewSectionItem[]
  suspicious: ReviewSectionItem[]
  missingDocuments: ReviewSectionItem[]
}

export type ExpenseReviewSections = Pick<
  ReviewScreenData,
  'expenseMatched' | 'expenseNeedsReview' | 'expenseUnmatchedDocuments' | 'expenseUnmatchedOutflows' | 'expenseUnmatchedInflows'
>

export interface ExpenseReviewOperatorOverride {
  reviewItemId: string
  decision: 'confirmed' | 'rejected'
  decidedAt?: string
}

export interface BuildReviewScreenInput {
  batch: MonthlyBatchResult
  generatedAt: string
  fileRoutes?: UploadedMonthlyFileRoute[]
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

  const matched = input.batch.report.matches.map((match) => toMatchedGroupReviewItem(input.batch, match))

  const payoutBatchMatched = input.batch.report.payoutBatchMatches.map((match) =>
    toPayoutBatchMatchedReviewItem(input.batch, match)
  )

  const payoutBatchUnmatched = input.batch.report.unmatchedPayoutBatches.map((batch) =>
    toPayoutBatchUnmatchedReviewItem(input.batch, batch)
  )
  const expenseReview = buildExpenseReviewSections(input.batch, input.fileRoutes)

  const unmatchedReservationSettlements = (input.batch.reconciliation.workflowPlan?.reservationSettlementNoMatches ?? [])
    .map((noMatch) => toReservationSettlementNoMatchReviewItem(input.batch, noMatch))

  const reservationSettlementOverview = (input.batch.reconciliation.workflowPlan?.reservationSources ?? [])
    .map((reservation) => toReservationSettlementOverviewItem(input.batch, reservation))

  const ancillarySettlementOverview = (input.batch.reconciliation.workflowPlan?.ancillaryRevenueSources ?? [])
    .map((item) => toAncillarySettlementOverviewItem(input.batch, item))

  const unmatched = categorizedExceptionCases.unmatched
    .map((exceptionCase) => toReviewItem(input.batch, input.fileRoutes, exceptionCase, 'unmatched'))

  const suspicious = categorizedExceptionCases.suspicious
    .map((exceptionCase) => toReviewItem(input.batch, input.fileRoutes, exceptionCase, 'suspicious'))

  const missingDocuments = categorizedExceptionCases.missingDocuments
    .map((exceptionCase) => toMissingDocumentReviewItem(input.batch, input.fileRoutes, exceptionCase))

  return {
    generatedAt: input.generatedAt,
    summary: input.batch.report.summary,
    matched,
    reservationSettlementOverview,
    ancillarySettlementOverview,
    unmatchedReservationSettlements,
    payoutBatchMatched,
    payoutBatchUnmatched,
    expenseMatched: expenseReview.expenseMatched,
    expenseNeedsReview: expenseReview.expenseNeedsReview,
    expenseUnmatchedDocuments: expenseReview.expenseUnmatchedDocuments,
    expenseUnmatchedOutflows: expenseReview.expenseUnmatchedOutflows,
    expenseUnmatchedInflows: expenseReview.expenseUnmatchedInflows,
    unmatched,
    suspicious,
    missingDocuments
  }
}

export function applyExpenseReviewOperatorOverrides(
  sections: ExpenseReviewSections,
  overrides: ExpenseReviewOperatorOverride[]
): ExpenseReviewSections {
  const overrideByReviewItemId = new Map<string, ExpenseReviewOperatorOverride>()

  for (const override of overrides) {
    if (!override.reviewItemId) {
      continue
    }

    overrideByReviewItemId.set(override.reviewItemId, override)
  }

  const baseMatched = cloneReviewSectionItems(sections.expenseMatched ?? [])
  const baseReview = cloneReviewSectionItems(sections.expenseNeedsReview ?? [])
  const baseUnmatchedDocuments = cloneReviewSectionItems(sections.expenseUnmatchedDocuments ?? [])
  const baseUnmatchedOutflows = cloneReviewSectionItems(sections.expenseUnmatchedOutflows ?? [])
  const baseUnmatchedInflows = cloneReviewSectionItems(sections.expenseUnmatchedInflows ?? [])
  const reviewItemsById = new Map(baseReview.map((item) => [item.id, item]))
  const confirmedOverrides: ReviewSectionItem[] = []
  const rejectedDocumentOverrides: ReviewSectionItem[] = []
  const rejectedOutflowOverrides: ReviewSectionItem[] = []
  const rejectedInflowOverrides: ReviewSectionItem[] = []

  for (const override of overrideByReviewItemId.values()) {
    const reviewItem = reviewItemsById.get(override.reviewItemId)

    if (!reviewItem) {
      continue
    }

    if (override.decision === 'confirmed') {
      confirmedOverrides.push(toManuallyConfirmedExpenseItem(reviewItem, override))
      continue
    }

    rejectedDocumentOverrides.push(toManuallyRejectedExpenseDocumentItem(reviewItem, override))

    if (isIncomingExpenseReviewItem(reviewItem)) {
      rejectedInflowOverrides.push(toManuallyRejectedExpenseOutflowItem(reviewItem, override))
      continue
    }

    rejectedOutflowOverrides.push(toManuallyRejectedExpenseOutflowItem(reviewItem, override))
  }

  return {
    expenseMatched: [
      ...baseMatched,
      ...confirmedOverrides
    ],
    expenseNeedsReview: baseReview.filter((item) => !overrideByReviewItemId.has(item.id)),
    expenseUnmatchedDocuments: [
      ...baseUnmatchedDocuments,
      ...rejectedDocumentOverrides
    ],
    expenseUnmatchedOutflows: [
      ...baseUnmatchedOutflows,
      ...rejectedOutflowOverrides
    ],
    expenseUnmatchedInflows: [
      ...baseUnmatchedInflows,
      ...rejectedInflowOverrides
    ]
  }
}

function isIncomingExpenseReviewItem(reviewItem: ReviewSectionItem): boolean {
  return reviewItem.documentBankRelation?.includes('příchozí bankovní platbou') === true
    || reviewItem.operatorExplanation?.includes('příchozí bankovní') === true
    || reviewItem.detail?.includes('příchozí bankovní') === true
}

const EXPENSE_REVIEW_CONFIRMED_MAX_DAY_DISTANCE = 7
const EXPENSE_REVIEW_STRONG_MAX_DAY_DISTANCE = 14
const EXPENSE_REVIEW_CANDIDATE_MAX_DAY_DISTANCE = 21
const EXPENSE_REVIEW_WEAK_AMOUNT_DELTA_MINOR = 1000
const INTERNAL_TRANSFER_MAX_DAY_DISTANCE = 2
const DOCUMENT_RECORD_TYPE_SET = new Set(['invoice-document', 'receipt-document'])

interface ExpenseDocumentReviewEntry {
  extractedRecord: MonthlyBatchResult['extractedRecords'][number]
  normalizedTransaction?: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
  fileRoute?: UploadedMonthlyFileRoute
}

interface ExpenseBankCandidateEvaluation {
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
  amountDeltaMinor: number
  dateDistance: number
  exactAmount: boolean
  nearAmount: boolean
  referenceAligned: boolean
  counterpartyAligned: boolean
  ibanAligned: boolean
  score: number
  reasons: string[]
  matchType: 'confirmed' | 'review'
}

interface ExpenseBankCandidateSelection {
  winner: ExpenseBankCandidateEvaluation
  ambiguousCount: number
}

interface ExpenseCandidatePlan {
  documentEntry: ExpenseDocumentReviewEntry
  evaluations: ExpenseBankCandidateEvaluation[]
}

function getExpenseDocumentExpectedBankDirection(documentEntry: ExpenseDocumentReviewEntry): 'in' | 'out' {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>
  const settlementDirection = readString(data.settlementDirection) ?? documentEntry.normalizedTransaction?.settlementDirection

  return settlementDirection === 'refund_incoming' || documentEntry.normalizedTransaction?.direction === 'in'
    ? 'in'
    : 'out'
}

function isIncomingExpenseDocument(documentEntry: ExpenseDocumentReviewEntry): boolean {
  return getExpenseDocumentExpectedBankDirection(documentEntry) === 'in'
}

function getExpenseDocumentBankMovementLabel(documentEntry: ExpenseDocumentReviewEntry): string {
  return isIncomingExpenseDocument(documentEntry) ? 'příchozí bankovní platba' : 'odchozí bankovní platba'
}

function getExpenseDocumentBankCandidateLabel(documentEntry: ExpenseDocumentReviewEntry): string {
  return isIncomingExpenseDocument(documentEntry) ? 'příchozí bankovní kandidát' : 'odchozí bankovní kandidát'
}

function getExpenseDocumentBankRelationLabel(documentEntry: ExpenseDocumentReviewEntry): string {
  return isIncomingExpenseDocument(documentEntry) ? 'příchozí bankovní platbou' : 'odchozí bankovní platbou'
}

interface InternalTransferCandidateEvaluation {
  incomingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
  dateDistance: number
  outgoingMentionsIncomingAccount: boolean
  incomingMentionsOutgoingAccount: boolean
  score: number
}

interface InternalTransferPairSelection {
  outgoingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
  incomingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
}

function cloneReviewSectionItems(items: ReviewSectionItem[]): ReviewSectionItem[] {
  return items.map((item) => cloneReviewSectionItem(item))
}

function cloneReviewSectionItem(item: ReviewSectionItem): ReviewSectionItem {
  return {
    ...item,
    transactionIds: [...item.transactionIds],
    sourceDocumentIds: [...item.sourceDocumentIds],
    evidenceSummary: item.evidenceSummary.map((entry) => ({ ...entry })),
    expenseComparison: item.expenseComparison
      ? {
        document: { ...item.expenseComparison.document },
        ...(item.expenseComparison.bank ? { bank: { ...item.expenseComparison.bank } } : {})
      }
      : undefined
  }
}

function toManuallyConfirmedExpenseItem(
  reviewItem: ReviewSectionItem,
  override: ExpenseReviewOperatorOverride
): ReviewSectionItem {
  const item = cloneReviewSectionItem(reviewItem)
  const bankMovementLabel = isIncomingExpenseReviewItem(reviewItem) ? 'příchozí bankovní platbu' : 'odchozí bankovní platbu'

  return {
    ...item,
    id: `expense-manual-confirmed:${reviewItem.id}`,
    domain: 'expense',
    kind: 'expense-matched',
    matchStrength: 'potvrzená shoda',
    detail: `Operátor ručně potvrdil vazbu dokladu na ${bankMovementLabel}.`,
    operatorExplanation: 'Operátor ručně potvrdil navrženou vazbu doklad ↔ banka.',
    operatorCheckHint: 'Ruční rozhodnutí je uložené pro tento běh; další kontrola je nutná jen při sporu.',
    documentBankRelation: `Ručně potvrzená vazba mezi dokladem a ${bankMovementLabel}.`,
    manualDecision: 'confirmed',
    manualDecisionLabel: 'Ručně potvrzená shoda',
    manualDecisionAt: override.decidedAt,
    manualSourceReviewItemId: reviewItem.id
  }
}

function toManuallyRejectedExpenseDocumentItem(
  reviewItem: ReviewSectionItem,
  override: ExpenseReviewOperatorOverride
): ReviewSectionItem {
  const comparison = reviewItem.expenseComparison
    ? {
      document: { ...reviewItem.expenseComparison.document }
    }
    : { document: {} }
  const documentReference = reviewItem.expenseComparison?.document?.reference
  const documentTransactionIds = extractExpenseDocumentTransactionIds(reviewItem)
  const documentAmount = reviewItem.expenseComparison?.document?.amount
  const documentCurrency = reviewItem.expenseComparison?.document?.currency
  const documentIssueDate = reviewItem.expenseComparison?.document?.issueDate
  const documentDueDate = reviewItem.expenseComparison?.document?.dueDate
  const documentIbanHint = reviewItem.expenseComparison?.document?.ibanHint
  const documentSupplier = reviewItem.expenseComparison?.document?.supplierOrCounterparty
  const provenance = reviewItem.evidenceSummary.find((entry) => entry.label === 'provenience')?.value
  const bankMovementLabel = isIncomingExpenseReviewItem(reviewItem) ? 'příchozí bankovní platby' : 'odchozí bankovní platby'

  return {
    id: `expense-manual-rejected-document:${reviewItem.id}`,
    domain: 'expense',
    kind: 'expense-unmatched-document',
    title: documentReference
      ? `Nespárovaný doklad ${documentReference}`
      : reviewItem.title,
    detail: `Operátor ručně odmítl navrženou vazbu dokladu na ${bankMovementLabel}.`,
    transactionIds: documentTransactionIds,
    sourceDocumentIds: [...reviewItem.sourceDocumentIds],
    matchStrength: 'nespárováno',
    evidenceSummary: [
      maybeEvidenceEntry('částka', documentAmount),
      maybeEvidenceEntry('datum', documentDueDate ?? documentIssueDate),
      maybeEvidenceEntry('reference', documentReference ?? 'chybí'),
      maybeEvidenceEntry('IBAN', documentIbanHint ?? 'chybí'),
      maybeEvidenceEntry('protistrana / dodavatel', documentSupplier ?? 'bez bankovního kandidáta'),
      maybeEvidenceEntry('provenience', provenance)
    ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry)),
    operatorExplanation: 'Operátor označil navržený bankovní kandidát jako neshodu; doklad zůstává bez potvrzené bankovní vazby.',
    operatorCheckHint: 'Tato dvojice se v tomto běhu znovu nenavrhuje. Zkontrolujte jiný bankovní pohyb nebo chybějící doklad.',
    documentBankRelation: 'Doklad zůstává bez potvrzené bankovní vazby; navržená shoda byla ručně odmítnuta.',
    expenseComparison: comparison,
    manualDecision: 'rejected',
    manualDecisionLabel: 'Ručně zamítnuto',
    manualDecisionAt: override.decidedAt,
    manualSourceReviewItemId: reviewItem.id
  }
}

function toManuallyRejectedExpenseOutflowItem(
  reviewItem: ReviewSectionItem,
  override: ExpenseReviewOperatorOverride
): ReviewSectionItem {
  const bankSide = reviewItem.expenseComparison?.bank
    ? { ...reviewItem.expenseComparison.bank }
    : undefined
  const bankTransactionId = extractExpenseBankTransactionId(reviewItem)
  const incoming = isIncomingExpenseReviewItem(reviewItem)

  return {
    id: `expense-manual-rejected-bank:${reviewItem.id}`,
    domain: 'expense',
    kind: incoming ? 'expense-unmatched-inflow' : 'expense-unmatched-outflow',
    title: bankSide?.amount
      ? `${incoming ? 'Nespárovaná příchozí platba' : 'Nespárovaná odchozí platba'} ${bankSide.amount}`
      : reviewItem.title,
    detail: `Operátor ručně odmítl navrženou vazbu ${incoming ? 'příchozí' : 'odchozí'} bankovní platby na doklad.`,
    transactionIds: bankTransactionId ? [bankTransactionId] : [],
    sourceDocumentIds: [],
    matchStrength: 'nespárováno',
    evidenceSummary: [
      maybeEvidenceEntry('částka', bankSide?.amount),
      maybeEvidenceEntry('datum', bankSide?.bookedAt),
      maybeEvidenceEntry('zpráva banky', bankSide?.reference ?? 'chybí'),
      maybeEvidenceEntry('reference', bankSide?.reference ?? 'chybí'),
      maybeEvidenceEntry('protistrana / účet', uniqueTextValues([bankSide?.supplierOrCounterparty, bankSide?.bankAccount]).join(' · ')),
      maybeEvidenceEntry('dokument', 'chybí')
    ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry)),
    operatorExplanation: `${incoming ? 'Příchozí' : 'Odchozí'} bankovní platba zůstává bez potvrzeného dokladu; navržená shoda byla ručně odmítnuta.`,
    operatorCheckHint: 'Tato dvojice se v tomto běhu znovu nenavrhuje. Dohledejte jiný doklad nebo ponechte platbu bez vazby.',
    documentBankRelation: `${incoming ? 'Příchozí' : 'Odchozí'} bankovní platba zůstává bez potvrzeného dokladu; navržená shoda byla ručně odmítnuta.`,
    expenseComparison: bankSide ? { document: {}, bank: bankSide } : { document: {} },
    manualDecision: 'rejected',
    manualDecisionLabel: 'Ručně zamítnuto',
    manualDecisionAt: override.decidedAt,
    manualSourceReviewItemId: reviewItem.id
  }
}

function extractExpenseBankTransactionId(reviewItem: ReviewSectionItem): string | undefined {
  return reviewItem.transactionIds[reviewItem.transactionIds.length - 1]
}

function extractExpenseDocumentTransactionIds(reviewItem: ReviewSectionItem): string[] {
  return reviewItem.transactionIds.length > 1
    ? reviewItem.transactionIds.slice(0, -1)
    : []
}

function buildExpenseReviewSections(
  batch: MonthlyBatchResult,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): Pick<ReviewScreenData, 'expenseMatched' | 'expenseNeedsReview' | 'expenseUnmatchedDocuments' | 'expenseUnmatchedOutflows' | 'expenseUnmatchedInflows'> {
  const fileRoutesBySourceDocumentId = new Map(
    (fileRoutes ?? [])
      .filter((route): route is UploadedMonthlyFileRoute & { sourceDocumentId: string } => Boolean(route.sourceDocumentId))
      .map((route) => [route.sourceDocumentId, route])
  )
  const transactionsById = new Map(
    batch.reconciliation.normalizedTransactions.map((transaction) => [transaction.id, transaction])
  )
  const documentEntries = batch.extractedRecords
    .filter((record) => DOCUMENT_RECORD_TYPE_SET.has(record.recordType))
    .map((record) => ({
      extractedRecord: record,
      normalizedTransaction: batch.reconciliation.normalizedTransactions.find((transaction) =>
        transaction.extractedRecordIds.includes(record.id)
      ),
      fileRoute: fileRoutesBySourceDocumentId.get(record.sourceDocumentId)
    }))
  const linkedSupportTransactionIds = new Set(batch.reconciliation.supportedExpenseLinks.map((link) => link.supportTransactionId))
  const linkedExpenseTransactionIds = new Set(batch.reconciliation.supportedExpenseLinks.map((link) => link.expenseTransactionId))
  const missingSupportingOutflowIds = new Set(
    batch.reconciliation.exceptionCases
      .filter((exceptionCase) => exceptionCase.ruleCode === 'missing_supporting_document')
      .flatMap((exceptionCase) => exceptionCase.relatedTransactionIds)
  )
  const internalTransferPairs = buildInternalTransferPairSelections(
    batch.reconciliation.normalizedTransactions,
    linkedExpenseTransactionIds
  )
  const internalTransferOutflowKeys = new Set(
    internalTransferPairs.map((pair) => buildReviewBankTransactionKey(pair.outgoingTransaction))
  )
  const internalTransferIncomingKeys = new Set(
    internalTransferPairs.map((pair) => buildReviewBankTransactionKey(pair.incomingTransaction))
  )
  const matchedRevenueTransactionIds = new Set(
    batch.report.matches.flatMap((match) => match.transactionIds)
  )
  const payoutMatchedBankTransactionIds = new Set(
    (batch.reconciliation.payoutBatchMatches ?? [])
      .filter((match) => match.matched)
      .map((match) => match.bankTransactionId)
  )
  const outgoingCandidateBankTransactions = batch.reconciliation.normalizedTransactions.filter((transaction) =>
    transaction.source === 'bank'
    && transaction.direction === 'out'
    && missingSupportingOutflowIds.has(transaction.id)
    && !linkedExpenseTransactionIds.has(transaction.id)
    && !internalTransferOutflowKeys.has(buildReviewBankTransactionKey(transaction))
  )
  const incomingCandidateBankTransactions = batch.reconciliation.normalizedTransactions.filter((transaction) =>
    transaction.source === 'bank'
    && transaction.direction === 'in'
    && !matchedRevenueTransactionIds.has(transaction.id)
    && !payoutMatchedBankTransactionIds.has(transaction.id)
    && !linkedExpenseTransactionIds.has(transaction.id)
    && !internalTransferIncomingKeys.has(buildReviewBankTransactionKey(transaction))
  )
  const usedCandidateBankIds = new Set<string>()

  const expenseMatched = batch.reconciliation.supportedExpenseLinks.flatMap((link) => {
    const bankTransaction = transactionsById.get(link.expenseTransactionId)
    const supportTransaction = transactionsById.get(link.supportTransactionId)
    const documentEntry = documentEntries.find((entry) =>
      entry.normalizedTransaction?.id === link.supportTransactionId
      || entry.extractedRecord.id === link.supportExtractedRecordIds[0]
      || link.supportSourceDocumentIds.includes(entry.extractedRecord.sourceDocumentId)
    )

    if (!bankTransaction || !supportTransaction || !documentEntry) {
      return []
    }

    return [toExpenseMatchedReviewItem(batch, documentEntry, bankTransaction, link.reasons, link.matchScore, fileRoutes)]
  })
  expenseMatched.push(
    ...internalTransferPairs.map((pair) =>
      toInternalTransferMatchedReviewItem(pair.outgoingTransaction, pair.incomingTransaction)
    )
  )

  const expenseNeedsReview: ReviewSectionItem[] = []
  const expenseUnmatchedDocuments: ReviewSectionItem[] = []
  const candidatePlans = documentEntries
    .filter((documentEntry) => !documentEntry.normalizedTransaction || !linkedSupportTransactionIds.has(documentEntry.normalizedTransaction.id))
    .map((documentEntry) => ({
      documentEntry,
      evaluations: evaluateExpenseBankCandidates(
        documentEntry,
        getExpenseDocumentExpectedBankDirection(documentEntry) === 'in'
          ? incomingCandidateBankTransactions
          : outgoingCandidateBankTransactions
      )
    }))
    .sort(compareExpenseCandidatePlans)

  for (const plan of candidatePlans) {
    const selection = selectExpenseBankCandidate(
      plan.evaluations.filter((evaluation) => !usedCandidateBankIds.has(evaluation.bankTransaction.id))
    )

    if (!selection) {
      expenseUnmatchedDocuments.push(toExpenseUnmatchedDocumentReviewItem(batch, plan.documentEntry, fileRoutes))
      continue
    }

    usedCandidateBankIds.add(selection.winner.bankTransaction.id)

    if (selection.winner.matchType === 'confirmed' && selection.ambiguousCount === 1) {
      expenseMatched.push(
        toExpenseMatchedReviewItem(
          batch,
          plan.documentEntry,
          selection.winner.bankTransaction,
          selection.winner.reasons,
          selection.winner.score,
          fileRoutes,
          selection.winner
        )
      )
      continue
    }

    expenseNeedsReview.push(
      toExpenseNeedsReviewItem(
        batch,
        plan.documentEntry,
        selection.winner.bankTransaction,
        selection.winner,
        selection.ambiguousCount,
        fileRoutes
      )
    )
  }

  const expenseUnmatchedOutflows = batch.reconciliation.exceptionCases
    .filter((exceptionCase) => exceptionCase.ruleCode === 'missing_supporting_document')
    .flatMap((exceptionCase) => {
      const transaction = exceptionCase.relatedTransactionIds[0]
        ? transactionsById.get(exceptionCase.relatedTransactionIds[0])
        : undefined

      if (!transaction || linkedExpenseTransactionIds.has(transaction.id) || usedCandidateBankIds.has(transaction.id)) {
        return []
      }

      if (internalTransferOutflowKeys.has(buildReviewBankTransactionKey(transaction))) {
        return []
      }

      return [toExpenseUnmatchedOutflowReviewItem(batch, transaction, exceptionCase, fileRoutes)]
    })

  const expenseUnmatchedInflows = incomingCandidateBankTransactions
    .filter((transaction) => !usedCandidateBankIds.has(transaction.id))
    .map((transaction) => toExpenseUnmatchedInflowReviewItem(batch, transaction, fileRoutes))

  return {
    expenseMatched,
    expenseNeedsReview,
    expenseUnmatchedDocuments,
    expenseUnmatchedOutflows,
    expenseUnmatchedInflows
  }
}

function toExpenseMatchedReviewItem(
  _batch: MonthlyBatchResult,
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  reasons: string[],
  matchScore: number,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined,
  candidateEvaluation?: ExpenseBankCandidateEvaluation
): ReviewSectionItem {
  const documentReference = getExpenseDocumentReference(documentEntry)
  const matchStrength = classifyExpenseMatchedStrength(reasons, matchScore)
  const bankMovementLabel = getExpenseDocumentBankMovementLabel(documentEntry)
  const bankRelationLabel = getExpenseDocumentBankRelationLabel(documentEntry)

  return {
    id: `expense-matched:${documentEntry.extractedRecord.id}:${bankTransaction.id}`,
    domain: 'expense',
    kind: 'expense-matched',
    title: documentReference
      ? `Faktura ${documentReference}`
      : `Doklad ${documentEntry.extractedRecord.sourceDocumentId}`,
    detail: `Doklad a ${bankMovementLabel} tvoří potvrzenou dokumentovou vazbu.`,
    transactionIds: [
      ...(documentEntry.normalizedTransaction ? [documentEntry.normalizedTransaction.id] : []),
      bankTransaction.id
    ],
    sourceDocumentIds: [documentEntry.extractedRecord.sourceDocumentId],
    matchStrength,
    evidenceSummary: buildExpenseEvidenceSummary(documentEntry, bankTransaction, fileRoutes, reasons, candidateEvaluation),
    operatorExplanation: matchStrength === 'potvrzená shoda'
      ? `Částka, datum a alespoň jedna další stopa potvrzují vazbu dokladu na ${bankMovementLabel}.`
      : `Doklad je spárovaný s ${bankMovementLabel}, ale ručně ověřte reference nebo protistranu.`,
    operatorCheckHint: matchStrength === 'potvrzená shoda'
      ? 'Ruční kontrolu dělejte jen při sporné protistraně nebo neobvyklém textu v bankovní platbě.'
      : 'Zkontrolujte ručně reference dokladu, protistranu a datum bankovního pohybu.',
    documentBankRelation: `Potvrzená pravděpodobná vazba mezi dokladem a ${bankRelationLabel}.`,
    expenseComparison: buildExpenseComparison(documentEntry, bankTransaction)
  }
}

function toInternalTransferMatchedReviewItem(
  outgoingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  incomingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): ReviewSectionItem {
  const dateDistance = calculateDayDistance(outgoingTransaction.bookedAt, incomingTransaction.bookedAt)

  return {
    id: `expense-matched:internal-transfer:${buildReviewBankTransactionKey(outgoingTransaction)}:${buildReviewBankTransactionKey(incomingTransaction)}`,
    domain: 'expense',
    kind: 'expense-matched',
    title: `Vnitřní převod ${formatAmountMinorCs(outgoingTransaction.amountMinor, outgoingTransaction.currency)}`,
    detail: 'Odchozí a příchozí bankovní pohyb tvoří interní převod mezi vlastními účty hotelu.',
    transactionIds: [outgoingTransaction.id, incomingTransaction.id],
    sourceDocumentIds: uniqueTextValues([...outgoingTransaction.sourceDocumentIds, ...incomingTransaction.sourceDocumentIds]),
    matchStrength: 'potvrzená shoda',
    evidenceSummary: buildInternalTransferEvidenceSummary(outgoingTransaction, incomingTransaction, dateDistance),
    operatorExplanation: 'Systém rozpoznal odpovídající příchozí a odchozí pohyb mezi vlastními účty hotelu. Nejde o výdaj vyžadující doklad.',
    operatorCheckHint: 'Ruční kontrolu dělejte jen pokud částka nebo čísla účtů neodpovídají internímu převodu mezi vlastními účty.',
    documentBankRelation: 'Pohyby tvoří interní převod mezi vlastními účty hotelu; nejde o nespárovaný výdaj.',
    expenseComparison: buildInternalTransferComparison(outgoingTransaction, incomingTransaction)
  }
}

function toExpenseNeedsReviewItem(
  _batch: MonthlyBatchResult,
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  candidateEvaluation: ExpenseBankCandidateEvaluation,
  ambiguousCount: number,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewSectionItem {
  const documentReference = getExpenseDocumentReference(documentEntry)
  const uniqueCandidate = ambiguousCount === 1
  const matchStrength: ReviewMatchStrength = uniqueCandidate ? 'slabší shoda' : 'vyžaduje kontrolu'
  const bankMovementLabel = getExpenseDocumentBankMovementLabel(documentEntry)
  const bankCandidateLabel = getExpenseDocumentBankCandidateLabel(documentEntry)

  return {
    id: `expense-review:${documentEntry.extractedRecord.id}:${bankTransaction.id}`,
    domain: 'expense',
    kind: 'expense-review',
    title: documentReference
      ? `Doklad ke kontrole ${documentReference}`
      : `Doklad ke kontrole ${documentEntry.extractedRecord.sourceDocumentId}`,
    detail: `Doklad je načtený a existuje jediný blízký ${bankCandidateLabel}, ale vazba zatím není potvrzená.`,
    transactionIds: [
      ...(documentEntry.normalizedTransaction ? [documentEntry.normalizedTransaction.id] : []),
      bankTransaction.id
    ],
    sourceDocumentIds: [documentEntry.extractedRecord.sourceDocumentId],
    matchStrength,
    evidenceSummary: buildExpenseEvidenceSummary(
      documentEntry,
      bankTransaction,
      fileRoutes,
      candidateEvaluation.reasons,
      candidateEvaluation
    ),
    operatorExplanation: uniqueCandidate
      ? `Systém našel pravděpodobný ${bankCandidateLabel}, ale vazba zatím není dost silná na automatické potvrzení.`
      : `Systém našel více možných ${bankCandidateLabel}ů (${ambiguousCount}); zobrazen je nejlepší z nich a vazba vyžaduje ruční kontrolu.`,
    operatorCheckHint: uniqueCandidate
      ? 'Zkontrolujte ručně variabilní symbol, text platby, protistranu a datum bankovního pohybu.'
      : 'Zkontrolujte ručně více podobných bankovních kandidátů a potvrďte správnou vazbu dokladu.',
    documentBankRelation: uniqueCandidate
      ? `Doklad je načtený a existuje pravděpodobný ${bankCandidateLabel}, ale vazba zatím není potvrzená.`
      : 'Doklad je načtený a existuje více podobných bankovních kandidátů; vazba není jednoznačná.',
    expenseComparison: buildExpenseComparison(documentEntry, bankTransaction)
  }
}

function toExpenseUnmatchedDocumentReviewItem(
  _batch: MonthlyBatchResult,
  documentEntry: ExpenseDocumentReviewEntry,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewSectionItem {
  const documentReference = getExpenseDocumentReference(documentEntry)
  const bankMovementLabel = getExpenseDocumentBankMovementLabel(documentEntry)

  return {
    id: `expense-unmatched-document:${documentEntry.extractedRecord.id}`,
    domain: 'expense',
    kind: 'expense-unmatched-document',
    title: documentReference
      ? `Nespárovaný doklad ${documentReference}`
      : `Nespárovaný doklad ${documentEntry.extractedRecord.sourceDocumentId}`,
    detail: `Doklad je načtený, ale nebyla nalezena jednoznačná ${bankMovementLabel}.`,
    transactionIds: documentEntry.normalizedTransaction ? [documentEntry.normalizedTransaction.id] : [],
    sourceDocumentIds: [documentEntry.extractedRecord.sourceDocumentId],
    matchStrength: 'nespárováno',
    evidenceSummary: buildExpenseEvidenceSummary(documentEntry, undefined, fileRoutes),
    operatorExplanation: `Doklad je použitelný pro kontrolu, ale bez potvrzené vazby na ${bankMovementLabel}.`,
    operatorCheckHint: 'Zkontrolujte ručně, zda v bance nechybí pohyb se stejnou částkou nebo odpovídající referencí.',
    documentBankRelation: `Doklad je načtený, ale zatím bez potvrzené vazby na ${bankMovementLabel}.`,
    expenseComparison: buildExpenseComparison(documentEntry, undefined)
  }
}

function toExpenseUnmatchedOutflowReviewItem(
  _batch: MonthlyBatchResult,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number],
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewSectionItem {
  return {
    id: `expense-unmatched-outflow:${bankTransaction.id}`,
    domain: 'expense',
    kind: 'expense-unmatched-outflow',
    title: `Nespárovaná odchozí platba ${formatAmountMinorCs(bankTransaction.amountMinor, bankTransaction.currency)}`,
    detail: exceptionCase.explanation,
    transactionIds: [bankTransaction.id],
    sourceDocumentIds: [],
    severity: exceptionCase.severity,
    matchStrength: 'nespárováno',
    evidenceSummary: buildExpenseOutflowEvidenceSummary(bankTransaction, fileRoutes),
    operatorExplanation: 'Odchozí bankovní platba zatím nemá odpovídající fakturu nebo účtenku.',
    operatorCheckHint: 'Zkontrolujte ručně bankovní zprávu, protistranu a dohledání odpovídajícího dokladu.',
    documentBankRelation: 'Existuje odchozí bankovní platba, ale zatím bez načteného odpovídajícího dokladu.',
    expenseComparison: buildExpenseOutflowComparison(bankTransaction)
  }
}

function toExpenseUnmatchedInflowReviewItem(
  _batch: MonthlyBatchResult,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  _fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewSectionItem {
  return {
    id: `expense-unmatched-inflow:${bankTransaction.id}`,
    domain: 'expense',
    kind: 'expense-unmatched-inflow',
    title: `Nespárovaná příchozí platba ${formatAmountMinorCs(bankTransaction.amountMinor, bankTransaction.currency)}`,
    detail: 'Příchozí bankovní pohyb zatím nemá potvrzenou vazbu na payout, refund dokument ani interní převod mezi vlastními účty.',
    transactionIds: [bankTransaction.id],
    sourceDocumentIds: [],
    matchStrength: 'nespárováno',
    evidenceSummary: buildExpenseInflowEvidenceSummary(bankTransaction),
    operatorExplanation: 'Příchozí bankovní platba zůstává bez potvrzeného vysvětlení v aktuálním měsíčním workflow.',
    operatorCheckHint: 'Zkontrolujte ručně protistranu, zprávu banky a případnou vazbu na payout, refund dokument nebo interní převod.',
    documentBankRelation: 'Existuje příchozí bankovní platba, ale zatím bez potvrzené vazby na payout, refund dokument nebo interní převod.',
    expenseComparison: buildExpenseInflowComparison(bankTransaction)
  }
}

function classifyExpenseMatchedStrength(reasons: string[], matchScore: number): ReviewMatchStrength {
  if (reasons.includes('ibanAligned') && reasons.includes('referenceAligned') && matchScore >= 9) {
    return 'potvrzená shoda'
  }

  const hasReference = reasons.includes('referenceAligned')
  const hasCounterparty = reasons.includes('counterpartyAligned')

  if (matchScore >= 6 && (hasReference || hasCounterparty)) {
    return 'potvrzená shoda'
  }

  return 'slabší shoda'
}

function evaluateExpenseBankCandidates(
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransactions: MonthlyBatchResult['reconciliation']['normalizedTransactions']
): ExpenseBankCandidateEvaluation[] {
  return bankTransactions
    .map((bankTransaction) => evaluateExpenseBankCandidate(documentEntry, bankTransaction))
    .filter((evaluation): evaluation is ExpenseBankCandidateEvaluation => Boolean(evaluation))
    .sort(compareExpenseBankCandidateQuality)
}

function evaluateExpenseBankCandidate(
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): ExpenseBankCandidateEvaluation | null {
  const documentAmountMinor = documentEntry.extractedRecord.amountMinor
  const documentCurrency = documentEntry.extractedRecord.currency

  if (typeof documentAmountMinor !== 'number' || !documentCurrency) {
    return null
  }

  if (bankTransaction.currency !== documentCurrency) {
    return null
  }

  if (bankTransaction.direction !== getExpenseDocumentExpectedBankDirection(documentEntry)) {
    return null
  }

  const amountDeltaMinor = Math.abs(bankTransaction.amountMinor - documentAmountMinor)
  const exactAmount = amountDeltaMinor === 0
  const nearAmount = amountDeltaMinor <= EXPENSE_REVIEW_WEAK_AMOUNT_DELTA_MINOR

  if (!exactAmount && !nearAmount) {
    return null
  }

  const dateDistance = calculateExpenseDateDistance(documentEntry, bankTransaction.bookedAt)
  if (!Number.isFinite(dateDistance) || dateDistance > EXPENSE_REVIEW_CANDIDATE_MAX_DAY_DISTANCE) {
    return null
  }

  const documentReferenceHints = getExpenseDocumentReferenceHints(documentEntry)
  const documentCounterparty = getExpenseDocumentCounterparty(documentEntry)
  const documentIbanHint = getExpenseDocumentIbanHint(documentEntry)
  const referenceAligned = expenseReferenceMatches(documentReferenceHints, bankTransaction.reference)
  const counterpartyAligned = expenseCounterpartyMatches(documentCounterparty, bankTransaction)
  const ibanAligned = expenseIbanMatches(documentIbanHint, bankTransaction)

  let score = 0
  const reasons: string[] = []

  if (exactAmount) {
    score += 5
    reasons.push('amountExact')
  } else if (nearAmount) {
    score += 1
    reasons.push(`amountDelta:${amountDeltaMinor}`)
  }

  if (dateDistance === 0) {
    score += 3
  } else if (dateDistance <= 3) {
    score += 2
  } else if (dateDistance <= EXPENSE_REVIEW_STRONG_MAX_DAY_DISTANCE) {
    score += 1
  }
  reasons.push(`dateDistance:${dateDistance}`)

  if (referenceAligned) {
    score += 4
    reasons.push('referenceAligned')
  }

  if (ibanAligned) {
    score += 4
    reasons.push('ibanAligned')
  }

  if (counterpartyAligned) {
    score += 3
    reasons.push('counterpartyAligned')
  }

  const hasIdentityEvidence = referenceAligned || ibanAligned || counterpartyAligned
  const hasStrongIdentityEvidence = referenceAligned || ibanAligned
  const confirmed = exactAmount
    && dateDistance <= EXPENSE_REVIEW_CONFIRMED_MAX_DAY_DISTANCE
    && (
      hasStrongIdentityEvidence
      || (counterpartyAligned && dateDistance <= 3)
    )

  if (!confirmed && !hasIdentityEvidence && (!exactAmount || dateDistance > 7)) {
    return null
  }

  if (!confirmed && !exactAmount && !hasStrongIdentityEvidence) {
    return null
  }

  return {
    bankTransaction,
    amountDeltaMinor,
    dateDistance,
    exactAmount,
    nearAmount,
    referenceAligned,
    counterpartyAligned,
    ibanAligned,
    score,
    reasons,
    matchType: confirmed ? 'confirmed' : 'review'
  }
}

function compareExpenseBankCandidateQuality(
  left: ExpenseBankCandidateEvaluation,
  right: ExpenseBankCandidateEvaluation
): number {
  if (left.matchType !== right.matchType) {
    return left.matchType === 'confirmed' ? -1 : 1
  }

  return (
    right.score - left.score
    || left.amountDeltaMinor - right.amountDeltaMinor
    || left.dateDistance - right.dateDistance
    || left.bankTransaction.bookedAt.localeCompare(right.bankTransaction.bookedAt)
    || left.bankTransaction.id.localeCompare(right.bankTransaction.id)
  )
}

function selectExpenseBankCandidate(
  evaluations: ExpenseBankCandidateEvaluation[]
): ExpenseBankCandidateSelection | undefined {
  if (evaluations.length === 0) {
    return undefined
  }

  const winner = [...evaluations].sort(compareExpenseBankCandidateQuality)[0]
  if (!winner) {
    return undefined
  }

  const ambiguousCount = evaluations.filter((candidate) =>
    candidate.matchType === winner.matchType
    && candidate.score === winner.score
    && candidate.amountDeltaMinor === winner.amountDeltaMinor
    && candidate.dateDistance === winner.dateDistance
  ).length

  return {
    winner,
    ambiguousCount
  }
}

function compareExpenseCandidatePlans(
  left: ExpenseCandidatePlan,
  right: ExpenseCandidatePlan
): number {
  const leftWinner = selectExpenseBankCandidate(left.evaluations)?.winner
  const rightWinner = selectExpenseBankCandidate(right.evaluations)?.winner

  if (!leftWinner && !rightWinner) {
    return left.documentEntry.extractedRecord.id.localeCompare(right.documentEntry.extractedRecord.id)
  }

  if (!leftWinner) {
    return 1
  }

  if (!rightWinner) {
    return -1
  }

  return compareExpenseBankCandidateQuality(leftWinner, rightWinner)
    || left.evaluations.length - right.evaluations.length
    || left.documentEntry.extractedRecord.id.localeCompare(right.documentEntry.extractedRecord.id)
}

function buildExpenseComparison(
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number] | undefined
): ReviewExpenseComparison {
  return {
    variant: 'document-bank',
    leftLabel: 'Doklad',
    rightLabel: 'Banka',
    document: {
      supplierOrCounterparty: getExpenseDocumentCounterparty(documentEntry),
      reference: getExpenseDocumentReference(documentEntry),
      issueDate: getExpenseDocumentIssueDate(documentEntry),
      dueDate: getExpenseDocumentDueDate(documentEntry),
      amount: typeof documentEntry.extractedRecord.amountMinor === 'number' && documentEntry.extractedRecord.currency
        ? formatAmountMinorCs(documentEntry.extractedRecord.amountMinor, documentEntry.extractedRecord.currency)
        : undefined,
      currency: documentEntry.extractedRecord.currency,
      ibanHint: getExpenseDocumentIbanHint(documentEntry)
    },
    ...(bankTransaction
      ? {
        bank: {
          supplierOrCounterparty: bankTransaction.counterparty,
          reference: bankTransaction.reference,
          bookedAt: bankTransaction.bookedAt,
          amount: formatAmountMinorCs(bankTransaction.amountMinor, bankTransaction.currency),
          currency: bankTransaction.currency,
          bankAccount: bankTransaction.accountId
        }
      }
      : {})
  }
}

function buildExpenseOutflowComparison(
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): ReviewExpenseComparison {
  return {
    variant: 'document-bank',
    leftLabel: 'Doklad',
    rightLabel: 'Banka',
    document: {},
    bank: {
      supplierOrCounterparty: bankTransaction.counterparty,
      reference: bankTransaction.reference,
      bookedAt: bankTransaction.bookedAt,
      amount: formatAmountMinorCs(bankTransaction.amountMinor, bankTransaction.currency),
      currency: bankTransaction.currency,
      bankAccount: bankTransaction.accountId
    }
  }
}

function buildInternalTransferComparison(
  outgoingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  incomingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): ReviewExpenseComparison {
  return {
    variant: 'bank-bank',
    leftLabel: 'Odchozí účet',
    rightLabel: 'Příchozí účet',
    document: buildBankReviewComparisonSide(outgoingTransaction),
    bank: buildBankReviewComparisonSide(incomingTransaction)
  }
}

function buildBankReviewComparisonSide(
  transaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): ReviewExpenseComparisonSide {
  return {
    supplierOrCounterparty: transaction.counterparty,
    reference: transaction.reference,
    bookedAt: transaction.bookedAt,
    amount: formatAmountMinorCs(transaction.amountMinor, transaction.currency),
    currency: transaction.currency,
    bankAccount: transaction.accountId
  }
}

function buildExpenseEvidenceSummary(
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number] | undefined,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined,
  confirmedReasons: string[] = [],
  candidateEvaluation?: ExpenseBankCandidateEvaluation
): ReviewEvidenceEntry[] {
  const documentReferenceHints = getExpenseDocumentReferenceHints(documentEntry)
  const documentReference = documentReferenceHints[0]
  const documentCounterparty = getExpenseDocumentCounterparty(documentEntry)
  const documentIbanHint = getExpenseDocumentIbanHint(documentEntry)
  const documentProvenance = buildDocumentProvenanceLabel(fileRoutes, [documentEntry.extractedRecord.sourceDocumentId])
  const dateDistance = candidateEvaluation?.dateDistance ?? (bankTransaction ? calculateExpenseDateDistance(documentEntry, bankTransaction.bookedAt) : undefined)
  const amountDeltaMinor = candidateEvaluation?.amountDeltaMinor
    ?? (
      bankTransaction && typeof documentEntry.extractedRecord.amountMinor === 'number'
        ? Math.abs(bankTransaction.amountMinor - documentEntry.extractedRecord.amountMinor)
        : undefined
    )
  const referenceAligned = bankTransaction
    ? confirmedReasons.includes('referenceAligned') || expenseReferenceMatches(documentReferenceHints, bankTransaction.reference)
    : false
  const counterpartyAligned = bankTransaction
    ? confirmedReasons.includes('counterpartyAligned') || expenseCounterpartyMatches(documentCounterparty, bankTransaction)
    : false
  const ibanAligned = bankTransaction
    ? expenseIbanMatches(documentIbanHint, bankTransaction)
    : undefined

  return [
    {
      label: 'částka',
      value: bankTransaction
        ? (amountDeltaMinor === 0 ? 'sedí' : 'nesedí')
        : formatAmountMinorCs(documentEntry.extractedRecord.amountMinor ?? 0, documentEntry.extractedRecord.currency ?? 'CZK')
    },
    maybeEvidenceEntry(
      'rozdíl částky',
      bankTransaction && typeof amountDeltaMinor === 'number'
        ? formatAmountMinorCs(amountDeltaMinor, documentEntry.extractedRecord.currency ?? bankTransaction.currency)
        : undefined
    ),
    maybeEvidenceEntry(
      'datum',
      bankTransaction
        ? (typeof dateDistance === 'number'
          ? dateDistance <= EXPENSE_REVIEW_CANDIDATE_MAX_DAY_DISTANCE
            ? (dateDistance === 0 ? 'sedí' : 'v toleranci')
            : 'mimo toleranci'
          : 'nelze ověřit')
        : getExpensePrimaryDate(documentEntry)
    ),
    maybeEvidenceEntry(
      'rozdíl dnů',
      bankTransaction && typeof dateDistance === 'number'
        ? `${dateDistance} dní`
        : undefined
    ),
    maybeEvidenceEntry(
      'IBAN',
      documentIbanHint
        ? (
          typeof ibanAligned === 'boolean'
            ? (ibanAligned ? 'sedí' : 'nelze ověřit')
            : 'z dokladu načten'
        )
        : 'chybí'
    ),
    maybeEvidenceEntry(
      'reference',
      documentReference
        ? (bankTransaction ? (referenceAligned ? 'sedí' : 'chybí') : documentReference)
        : 'chybí'
    ),
    maybeEvidenceEntry(
      'protistrana / dodavatel',
      bankTransaction
        ? (counterpartyAligned ? 'podobná' : 'nepodobná')
        : (documentCounterparty ?? 'bez bankovního kandidáta')
    ),
    maybeEvidenceEntry(
      'zpráva banky',
      bankTransaction?.reference ?? (bankTransaction ? 'chybí' : undefined)
    ),
    maybeEvidenceEntry('provenience', documentProvenance)
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function buildExpenseOutflowEvidenceSummary(
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  _fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewEvidenceEntry[] {
  return [
    { label: 'částka', value: formatAmountMinorCs(bankTransaction.amountMinor, bankTransaction.currency) },
    maybeEvidenceEntry('datum', bankTransaction.bookedAt),
    maybeEvidenceEntry('zpráva banky', bankTransaction.reference ?? 'chybí'),
    maybeEvidenceEntry('reference', bankTransaction.reference ?? 'chybí'),
    maybeEvidenceEntry('protistrana / účet', uniqueTextValues([bankTransaction.counterparty, bankTransaction.accountId]).join(' · ')),
    { label: 'dokument', value: 'chybí' }
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function buildExpenseInflowEvidenceSummary(
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): ReviewEvidenceEntry[] {
  return [
    { label: 'částka', value: formatAmountMinorCs(bankTransaction.amountMinor, bankTransaction.currency) },
    maybeEvidenceEntry('datum', bankTransaction.bookedAt),
    maybeEvidenceEntry('zpráva banky', bankTransaction.reference ?? 'chybí'),
    maybeEvidenceEntry('reference', bankTransaction.reference ?? 'chybí'),
    maybeEvidenceEntry('protistrana / účet', uniqueTextValues([bankTransaction.counterparty, bankTransaction.accountId]).join(' · ')),
    { label: 'dokument', value: 'není relevantní' }
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function buildInternalTransferEvidenceSummary(
  outgoingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  incomingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  dateDistance: number
): ReviewEvidenceEntry[] {
  return [
    { label: 'částka', value: 'sedí' },
    { label: 'rozdíl částky', value: formatAmountMinorCs(0, outgoingTransaction.currency) },
    { label: 'datum', value: dateDistance === 0 ? 'sedí' : 'v toleranci' },
    { label: 'rozdíl dnů', value: `${dateDistance} dní` },
    maybeEvidenceEntry(
      'reference',
      uniqueTextValues([outgoingTransaction.reference, incomingTransaction.reference]).join(' ↔ ') || 'nelze ověřit'
    ),
    maybeEvidenceEntry(
      'protistrana / účet',
      uniqueTextValues([
        `${outgoingTransaction.accountId} → ${incomingTransaction.accountId}`,
        outgoingTransaction.counterparty,
        incomingTransaction.counterparty
      ]).join(' · ')
    ),
    maybeEvidenceEntry(
      'zpráva banky',
      uniqueTextValues([outgoingTransaction.reference, incomingTransaction.reference]).join(' ↔ ')
    ),
    { label: 'dokument', value: 'nejde o výdajový doklad' }
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function buildExpenseInflowComparison(
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): ReviewExpenseComparison {
  return {
    variant: 'document-bank',
    leftLabel: 'Doklad',
    rightLabel: 'Banka',
    document: {},
    bank: {
      supplierOrCounterparty: bankTransaction.counterparty,
      reference: bankTransaction.reference,
      bookedAt: bankTransaction.bookedAt,
      amount: formatAmountMinorCs(bankTransaction.amountMinor, bankTransaction.currency),
      currency: bankTransaction.currency,
      bankAccount: bankTransaction.accountId
    }
  }
}

function buildInternalTransferPairSelections(
  transactions: MonthlyBatchResult['reconciliation']['normalizedTransactions'],
  linkedExpenseTransactionIds: Set<NormalizedTransaction['id']>
): InternalTransferPairSelection[] {
  const bankTransactions = transactions.filter((transaction) =>
    transaction.source === 'bank'
    && transaction.currency
    && transaction.accountId
  )
  const knownOwnAccountIds = uniqueTextValues(bankTransactions.map((transaction) => transaction.accountId))
  const incomingTransactions = bankTransactions.filter((transaction) => transaction.direction === 'in')
  const outgoingTransactions = bankTransactions.filter((transaction) =>
    transaction.direction === 'out'
    && !linkedExpenseTransactionIds.has(transaction.id)
  )
  const usedOutgoingKeys = new Set<string>()
  const usedIncomingKeys = new Set<string>()
  const pairs: InternalTransferPairSelection[] = []

  for (const outgoingTransaction of outgoingTransactions) {
    const outgoingKey = buildReviewBankTransactionKey(outgoingTransaction)
    if (usedOutgoingKeys.has(outgoingKey)) {
      continue
    }

    const evaluations = incomingTransactions
      .filter((incomingTransaction) => !usedIncomingKeys.has(buildReviewBankTransactionKey(incomingTransaction)))
      .map((incomingTransaction) =>
        evaluateInternalTransferCandidate(outgoingTransaction, incomingTransaction, knownOwnAccountIds)
      )
      .filter((evaluation): evaluation is InternalTransferCandidateEvaluation => Boolean(evaluation))
      .sort((left, right) =>
        right.score - left.score
        || left.dateDistance - right.dateDistance
        || left.incomingTransaction.bookedAt.localeCompare(right.incomingTransaction.bookedAt)
        || buildReviewBankTransactionKey(left.incomingTransaction).localeCompare(buildReviewBankTransactionKey(right.incomingTransaction))
      )

    const winner = evaluations[0]
    if (!winner) {
      continue
    }

    const ambiguousCount = evaluations.filter((evaluation) =>
      evaluation.score === winner.score
      && evaluation.dateDistance === winner.dateDistance
    ).length

    if (ambiguousCount > 1) {
      continue
    }

    const incomingKey = buildReviewBankTransactionKey(winner.incomingTransaction)
    usedOutgoingKeys.add(outgoingKey)
    usedIncomingKeys.add(incomingKey)
    pairs.push({
      outgoingTransaction,
      incomingTransaction: winner.incomingTransaction
    })
  }

  return pairs
}

function evaluateInternalTransferCandidate(
  outgoingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  incomingTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  knownOwnAccountIds: string[]
): InternalTransferCandidateEvaluation | null {
  if (incomingTransaction.direction !== 'in') {
    return null
  }

  if (outgoingTransaction.currency !== incomingTransaction.currency) {
    return null
  }

  if (outgoingTransaction.amountMinor !== incomingTransaction.amountMinor) {
    return null
  }

  if (!outgoingTransaction.accountId || !incomingTransaction.accountId) {
    return null
  }

  if (outgoingTransaction.accountId === incomingTransaction.accountId) {
    return null
  }

  if (
    !knownOwnAccountIds.includes(outgoingTransaction.accountId)
    || !knownOwnAccountIds.includes(incomingTransaction.accountId)
  ) {
    return null
  }

  const dateDistance = calculateDayDistance(outgoingTransaction.bookedAt, incomingTransaction.bookedAt)
  if (!Number.isFinite(dateDistance) || dateDistance > INTERNAL_TRANSFER_MAX_DAY_DISTANCE) {
    return null
  }

  const outgoingMentionsIncomingAccount = bankTransactionMentionsAccount(outgoingTransaction, incomingTransaction.accountId)
  const incomingMentionsOutgoingAccount = bankTransactionMentionsAccount(incomingTransaction, outgoingTransaction.accountId)

  if (!outgoingMentionsIncomingAccount && !incomingMentionsOutgoingAccount) {
    return null
  }

  let score = 0

  if (dateDistance === 0) {
    score += 2
  } else {
    score += 1
  }

  if (outgoingMentionsIncomingAccount) {
    score += 2
  }

  if (incomingMentionsOutgoingAccount) {
    score += 2
  }

  return {
    incomingTransaction,
    dateDistance,
    outgoingMentionsIncomingAccount,
    incomingMentionsOutgoingAccount,
    score
  }
}

function bankTransactionMentionsAccount(
  transaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  accountId: string
): boolean {
  const comparableTexts = [transaction.counterparty, transaction.reference, transaction.accountId]

  return comparableTexts.some((value) => textContainsAccountHint(value, accountId))
}

function textContainsAccountHint(value: string | undefined, accountId: string): boolean {
  const normalizedValue = normalizeComparableValue(value)
  const normalizedValueDigits = String(value ?? '').replace(/\D+/g, '')

  return buildComparableAccountHints(accountId).some((hint) =>
    hint.length >= 6
    && (
      normalizedValue.includes(hint)
      || normalizedValueDigits.includes(hint.replace(/\D+/g, ''))
    )
  )
}

function buildComparableAccountHints(accountId: string): string[] {
  const normalized = accountId.trim().toLowerCase()
  const digits = normalized.replace(/\D+/g, '')
  const [accountNumberPart, bankCodePart] = normalized.split('/')
  const accountNumberDigits = (accountNumberPart ?? '').replace(/\D+/g, '')
  const bankCodeDigits = (bankCodePart ?? '').replace(/\D+/g, '')

  return uniqueTextValues([
    normalizeComparableValue(normalized),
    digits,
    accountNumberDigits,
    bankCodeDigits ? `${accountNumberDigits}${bankCodeDigits}` : undefined
  ])
}

function buildReviewBankTransactionKey(
  transaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): string {
  return [
    transaction.id,
    transaction.accountId,
    transaction.direction,
    transaction.bookedAt,
    transaction.amountMinor,
    transaction.currency,
    transaction.reference,
    transaction.counterparty
  ].map((value) => String(value ?? '')).join('|')
}

function getExpenseDocumentReference(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  return getExpenseDocumentReferenceHints(documentEntry)[0]
}

function getExpenseDocumentReferenceHints(documentEntry: ExpenseDocumentReviewEntry): string[] {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>

  return uniqueTextValues([
    ...(Array.isArray(data.referenceHints)
      ? data.referenceHints.filter((value): value is string => typeof value === 'string')
      : []),
    ...(documentEntry.normalizedTransaction?.referenceHints ?? []),
    readString(data.invoiceNumber),
    readString(data.variableSymbol),
    documentEntry.extractedRecord.rawReference,
    documentEntry.normalizedTransaction?.invoiceNumber,
    documentEntry.normalizedTransaction?.reference
  ])
}

function getExpenseDocumentCounterparty(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>
  return readString(data.supplier)
    ?? readString(data.merchant)
    ?? documentEntry.normalizedTransaction?.counterparty
}

function getExpenseDocumentIbanHint(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>
  return readString(data.targetBankAccountHint)
    ?? documentEntry.normalizedTransaction?.targetBankAccountHint
    ?? readString(data.ibanHint)
}

function getExpenseDocumentIssueDate(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>
  return readString(data.issueDate) ?? documentEntry.extractedRecord.occurredAt
}

function getExpenseDocumentDueDate(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>
  return readString(data.dueDate)
}

function getExpenseRelevantDates(documentEntry: ExpenseDocumentReviewEntry): string[] {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>

  return uniqueTextValues([
    readString(data.dueDate),
    readString(data.issueDate),
    readString(data.taxableDate),
    documentEntry.extractedRecord.occurredAt
  ])
}

function getExpensePrimaryDate(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  return getExpenseRelevantDates(documentEntry)[0]
}

function calculateExpenseDateDistance(documentEntry: ExpenseDocumentReviewEntry, bankBookedAt: string): number {
  return getExpenseRelevantDates(documentEntry)
    .map((dateValue) => calculateDayDistance(dateValue, bankBookedAt))
    .sort((left, right) => left - right)[0] ?? Number.POSITIVE_INFINITY
}

function calculateDayDistance(left: string, right: string): number {
  const leftDate = new Date(`${normalizeExpenseComparableDate(left)}T00:00:00Z`)
  const rightDate = new Date(`${normalizeExpenseComparableDate(right)}T00:00:00Z`)
  return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000))
}

function normalizeExpenseComparableDate(value: string): string {
  return value.includes('T')
    ? value.split('T')[0] ?? value
    : value
}

function expenseReferenceMatches(documentReferences: string[] | string | undefined, bankReference: string | undefined): boolean {
  const references = Array.isArray(documentReferences)
    ? documentReferences
    : documentReferences
      ? [documentReferences]
      : []

  return references.some((reference) => normalizedComparableIncludes(reference, bankReference))
}

function expenseCounterpartyMatches(
  documentCounterparty: string | undefined,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): boolean {
  return normalizedComparableIncludes(documentCounterparty, bankTransaction.counterparty)
    || normalizedComparableIncludes(documentCounterparty, bankTransaction.reference)
}

function expenseIbanMatches(
  documentIbanHint: string | undefined,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
): boolean {
  if (!documentIbanHint) {
    return false
  }

  const ibanSuffix = documentIbanHint.replace(/\s+/g, '').slice(-4)
  const candidates = [bankTransaction.reference, bankTransaction.counterparty, bankTransaction.accountId]

  return candidates.some((candidate) =>
    normalizedComparableIncludes(documentIbanHint, candidate)
    || (ibanSuffix.length > 0 && normalizedComparableIncludes(ibanSuffix, candidate))
  )
}

function normalizedComparableIncludes(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeComparableValue(left)
  const normalizedRight = normalizeComparableValue(right)

  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
}

function normalizeComparableValue(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}

function collectSourceDocumentIdsForPayoutBatch(batch: MonthlyBatchResult, payoutBatchKey: string): string[] {
  const ids = new Set<string>()
  const payoutRows = batch.reconciliation.workflowPlan?.payoutRows.filter((row) => row.payoutBatchKey === payoutBatchKey) ?? []
  const payoutBatch = batch.reconciliation.workflowPlan?.payoutBatches.find((item) => item.payoutBatchKey === payoutBatchKey)

  for (const row of payoutRows) {
    ids.add(row.sourceDocumentId)
  }

  for (const sourceDocumentId of payoutBatch?.payoutSupplementSourceDocumentIds ?? []) {
    ids.add(sourceDocumentId)
  }

  return [...ids]
}

function toMatchedGroupReviewItem(
  batch: MonthlyBatchResult,
  match: MonthlyBatchResult['report']['matches'][number]
): ReviewSectionItem {
  const sourceDocumentIds = collectSourceDocumentIds(batch, match.transactionIds)

  return {
    id: match.matchGroupId,
    domain: 'payout',
    kind: 'matched',
    title: `Spárovaná skupina ${match.matchGroupId}`,
    detail: `${match.reason} Jistota ${(match.confidence * 100).toFixed(0)} %.`,
    transactionIds: match.transactionIds,
    sourceDocumentIds,
    matchStrength: classifyGenericMatchStrength(match.confidence),
    evidenceSummary: buildMatchedGroupEvidenceSummary(batch, match.transactionIds, sourceDocumentIds),
    operatorExplanation: match.reason,
    operatorCheckHint: buildMatchedCheckHint(classifyGenericMatchStrength(match.confidence))
  }
}

function toPayoutBatchMatchedReviewItem(
  batch: MonthlyBatchResult,
  match: MonthlyBatchResult['report']['payoutBatchMatches'][number]
): ReviewSectionItem {
  const sourceDocumentIds = collectSourceDocumentIdsForPayoutBatch(batch, match.payoutBatchKey)
  const rawMatch = (batch.reconciliation.payoutBatchMatches ?? []).find((item) =>
    item.payoutBatchKey === match.payoutBatchKey && item.matched
  )
  const matchStrength = classifyPayoutMatchStrength(
    match.confidence,
    rawMatch?.reasons ?? [],
    Boolean(match.matchedBankSummary),
    sourceDocumentIds.length
  )

  return {
    id: `payout-batch:${match.payoutBatchKey}`,
    domain: 'payout',
    kind: 'matched',
    title: match.display?.title ?? buildLegacyPayoutBatchTitle(match.platform, match.payoutReference),
    detail: buildPayoutBatchMatchDetail(batch, match),
    transactionIds: [],
    sourceDocumentIds,
    matchStrength,
    evidenceSummary: buildPayoutBatchMatchEvidenceSummary(batch, match, sourceDocumentIds, rawMatch?.reasons ?? []),
    operatorExplanation: match.reason,
    operatorCheckHint: buildPayoutMatchedCheckHint(matchStrength, rawMatch?.reasons ?? [])
  }
}

function toPayoutBatchUnmatchedReviewItem(
  batch: MonthlyBatchResult,
  unmatched: MonthlyBatchResult['report']['unmatchedPayoutBatches'][number]
): ReviewSectionItem {
  const sourceDocumentIds = collectSourceDocumentIdsForPayoutBatch(batch, unmatched.payoutBatchKey)
  const diagnostic = (batch.reconciliation.payoutBatchNoMatchDiagnostics ?? []).find(
    (item) => item.payoutBatchKey === unmatched.payoutBatchKey
  )

  return {
    id: `payout-batch-unmatched:${unmatched.payoutBatchKey}`,
    domain: 'payout',
    kind: 'unmatched',
    title: unmatched.display?.title ?? buildLegacyPayoutBatchTitle(unmatched.platform, unmatched.payoutReference),
    detail: buildPayoutBatchUnmatchedDetail(batch, unmatched),
    transactionIds: [],
    sourceDocumentIds,
    matchStrength: 'nespárováno',
    evidenceSummary: buildPayoutBatchUnmatchedEvidenceSummary(batch, unmatched, sourceDocumentIds),
    operatorExplanation: unmatched.reason,
    operatorCheckHint: buildPayoutUnmatchedCheckHint(diagnostic?.noMatchReason)
  }
}

function classifyGenericMatchStrength(confidence: number): ReviewMatchStrength {
  if (confidence >= 0.95) {
    return 'potvrzená shoda'
  }

  if (confidence >= 0.75) {
    return 'slabší shoda'
  }

  return 'vyžaduje kontrolu'
}

function classifyPayoutMatchStrength(
  confidence: number,
  reasons: string[],
  hasMatchedBankSummary: boolean,
  sourceDocumentCount: number
): ReviewMatchStrength {
  const hasReferenceEvidence = reasons.includes('payoutReferenceAligned')
    || reasons.includes('supplementPaymentIdAligned')
    || reasons.includes('supplementReferenceHintAligned')
  const hasCounterpartyEvidence = reasons.includes('counterpartyClueAligned')

  if (
    (confidence >= 0.99 && (hasReferenceEvidence || hasCounterpartyEvidence || hasMatchedBankSummary))
    || (
      confidence >= 0.97
      && hasMatchedBankSummary
      && (hasReferenceEvidence || hasCounterpartyEvidence || sourceDocumentCount > 1)
    )
  ) {
    return 'potvrzená shoda'
  }

  if (confidence >= 0.95) {
    return 'slabší shoda'
  }

  return 'vyžaduje kontrolu'
}

function buildMatchedGroupEvidenceSummary(
  batch: MonthlyBatchResult,
  transactionIds: string[],
  sourceDocumentIds: string[]
): ReviewEvidenceEntry[] {
  const transactions = transactionIds
    .map((transactionId) => batch.reconciliation.normalizedTransactions.find((item) => item.id === transactionId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return [
    maybeEvidenceEntry('částka', uniqueTextValues(transactions.map((transaction) => formatAmountMinorCs(transaction.amountMinor, transaction.currency))).join(' ↔ ')),
    maybeEvidenceEntry('datum', uniqueTextValues(transactions.map((transaction) => transaction.bookedAt)).join(' / ')),
    maybeEvidenceEntry('reference', uniqueTextValues(transactions.map((transaction) => transaction.reference)).join(', ')),
    maybeEvidenceEntry(
      'protistrana / účet',
      uniqueTextValues(transactions.flatMap((transaction) => [transaction.counterparty, transaction.accountId])).join(' · ')
    ),
    maybeEvidenceEntry('dokument', describeSourceDocuments(sourceDocumentIds))
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function buildPayoutBatchMatchEvidenceSummary(
  batch: MonthlyBatchResult,
  match: MonthlyBatchResult['report']['payoutBatchMatches'][number],
  sourceDocumentIds: string[],
  reasons: string[]
): ReviewEvidenceEntry[] {
  const bankSummary = parseMatchedBankSummary(match.matchedBankSummary)
  const referenceParts = [
    hasVisiblePayoutReference(match.platform, match.payoutReference) ? match.payoutReference : undefined,
    reasons.includes('supplementPaymentIdAligned') ? 'ID payoutu z dokladu sedí' : undefined,
    reasons.includes('supplementReferenceHintAligned') ? 'doklad potvrzuje booking hint' : undefined
  ]

  return [
    {
      label: 'částka',
      value: `${formatAmountMinorCs(match.amountMinor, match.currency)} · měna sedí`
    },
    maybeEvidenceEntry(
      'datum',
      [match.payoutDate ? `payout ${match.payoutDate}` : undefined, bankSummary.bookedAt ? `banka ${bankSummary.bookedAt}` : undefined]
        .filter((value): value is string => Boolean(value))
        .join(' · ')
    ),
    maybeEvidenceEntry('reference', uniqueTextValues(referenceParts).join(' · ')),
    maybeEvidenceEntry(
      'protistrana / účet',
      uniqueTextValues([
        match.bankAccountId,
        bankSummary.counterparty,
        reasons.includes('counterpartyClueAligned') ? 'stopa protiúčtu sedí' : undefined
      ]).join(' · ')
    ),
    maybeEvidenceEntry(
      'dokument',
      uniqueTextValues([
        describeSourceDocuments(sourceDocumentIds),
        sourceDocumentIds.length > 1 ? 'doplňkový payout doklad přiložen' : undefined,
        reasons.includes('supplementPaymentIdAligned') || reasons.includes('supplementReferenceHintAligned')
          ? 'payout doklad potvrdil vazbu'
          : undefined
      ]).join(' · ')
    )
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function buildPayoutBatchUnmatchedEvidenceSummary(
  batch: MonthlyBatchResult,
  unmatched: MonthlyBatchResult['report']['unmatchedPayoutBatches'][number],
  sourceDocumentIds: string[]
): ReviewEvidenceEntry[] {
  return [
    {
      label: 'částka',
      value: formatAmountMinorCs(unmatched.amountMinor, unmatched.currency)
    },
    maybeEvidenceEntry('datum', unmatched.payoutDate),
    maybeEvidenceEntry('reference', hasVisiblePayoutReference(unmatched.platform, unmatched.payoutReference) ? unmatched.payoutReference : undefined),
    maybeEvidenceEntry('protistrana / účet', unmatched.bankRoutingLabel),
    maybeEvidenceEntry('dokument', describeSourceDocuments(sourceDocumentIds)),
    maybeEvidenceEntry('provenience', findTransferBatchDescriptor(batch, unmatched.payoutBatchKey) ? 'textový payout export' : undefined)
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function buildMatchedCheckHint(matchStrength: ReviewMatchStrength): string {
  if (matchStrength === 'potvrzená shoda') {
    return 'Ruční kontrolu dělejte jen při sporném protiúčtu, neobvyklém datu nebo mimořádné částce.'
  }

  if (matchStrength === 'slabší shoda') {
    return 'Zkontrolujte ručně datum, reference a případné navazující doklady.'
  }

  return 'Ověřte ručně, že vazba opravdu patří k této transakci a není jen podobná.'
}

function buildPayoutMatchedCheckHint(matchStrength: ReviewMatchStrength, reasons: string[]): string {
  if (matchStrength === 'potvrzená shoda') {
    return reasons.includes('supplementPaymentIdAligned') || reasons.includes('supplementReferenceHintAligned')
      ? 'Ruční kontrolu dělejte jen při sporu; vazbu potvrzuje i payout doklad.'
      : 'Ruční kontrolu dělejte jen při sporném protiúčtu nebo mimořádném payoutu.'
  }

  return 'Zkontrolujte ručně datum přípisu, reference payoutu a očekávaný bankovní účet.'
}

function buildPayoutUnmatchedCheckHint(noMatchReason: string | undefined): string {
  switch (noMatchReason) {
    case 'wrongBankRouting':
      return 'Zkontrolujte, zda payout skutečně směřuje na správný bankovní účet.'
    case 'dateToleranceMiss':
      return 'Zkontrolujte ručně datum payoutu a blízké bankovní přípisy kolem očekávaného dne.'
    case 'ambiguousCandidates':
      return 'Zkontrolujte ručně reference payoutu a protiúčet, protože kandidátů je více.'
    case 'counterpartyClueMismatch':
      return 'Zkontrolujte ručně protiúčet a zdrojový payout doklad.'
    default:
      return 'Zkontrolujte ručně částku, datum, reference payoutu a správný bankovní účet.'
  }
}

function parseMatchedBankSummary(summary?: string): {
  bookedAt?: string
  counterparty?: string
  reference?: string
} {
  const parts = (summary ?? '')
    .split('·')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  return {
    bookedAt: parts[0],
    counterparty: parts[1],
    reference: parts[2]
  }
}

function maybeEvidenceEntry(
  label: ReviewEvidenceEntry['label'],
  value: string | undefined
): ReviewEvidenceEntry | undefined {
  const normalized = value?.trim()

  if (!normalized) {
    return undefined
  }

  return { label, value: normalized }
}

function uniqueTextValues(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
}

function describeSourceDocuments(sourceDocumentIds: string[]): string | undefined {
  if (sourceDocumentIds.length === 0) {
    return undefined
  }

  if (sourceDocumentIds.length === 1) {
    return '1 zdrojový doklad'
  }

  if (sourceDocumentIds.length < 5) {
    return `${sourceDocumentIds.length} zdrojové doklady`
  }

  return `${sourceDocumentIds.length} zdrojových dokladů`
}

function buildLegacyPayoutBatchTitle(platform: string, payoutReference: string): string {
  return payoutReference.trim()
    ? `${platform} payout dávka ${payoutReference}`
    : `${platform} payout dávka`
}

function buildPayoutBatchMatchDetail(
  batch: MonthlyBatchResult,
  match: MonthlyBatchResult['report']['payoutBatchMatches'][number]
): string {
  const detailParts = [
    match.reason,
    match.matchedBankSummary ? `Bankovní přípis: ${match.matchedBankSummary}.` : undefined,
    `Bankovní účet: ${match.bankAccountId}.`,
    `Částka: ${formatAmountMinorCs(match.amountMinor, match.currency)}.`
  ].filter((value): value is string => typeof value === 'string')

  const descriptor = findTransferBatchDescriptor(batch, match.payoutBatchKey)
  if (descriptor) {
    detailParts.push(`Zdrojový transfer: ${descriptor}.`)
  }

  if (match.display.context) {
    detailParts.push(`Kontext payoutu: ${match.display.context}.`)
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

  if (unmatched.display.context) {
    detailParts.push(`Kontext payoutu: ${unmatched.display.context}.`)
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
  batch: MonthlyBatchResult,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined,
  exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number],
  kind: ReviewSectionItem['kind']
): ReviewSectionItem {
  const sourceDocumentIds = exceptionCase.relatedSourceDocumentIds
  const evidenceSummary = buildExceptionEvidenceSummary(batch, exceptionCase, sourceDocumentIds, fileRoutes)
  const documentBankRelation = buildDocumentBankRelationStatus(batch, sourceDocumentIds, exceptionCase.relatedTransactionIds)
  const matchStrength = kind === 'suspicious' || kind === 'missing-document'
    ? 'vyžaduje kontrolu'
    : 'nespárováno'

  return {
    id: exceptionCase.id,
    domain: classifyReviewItemDomain(
      batch,
      sourceDocumentIds,
      exceptionCase.relatedTransactionIds,
      exceptionCase.ruleCode,
      exceptionCase.type
    ),
    kind,
    title: `${toTitle(kind)}: ${exceptionCase.ruleCode ?? exceptionCase.type}`,
    detail: exceptionCase.explanation,
    transactionIds: exceptionCase.relatedTransactionIds,
    sourceDocumentIds,
    severity: exceptionCase.severity,
    matchStrength,
    evidenceSummary,
    operatorExplanation: exceptionCase.explanation,
    operatorCheckHint: exceptionCase.recommendedNextStep ?? buildExceptionCheckHint(kind),
    ...(documentBankRelation ? { documentBankRelation } : {})
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
    case 'expense-matched':
      return 'Spárovaný výdaj'
    case 'expense-review':
      return 'Výdaj ke kontrole'
    case 'expense-unmatched-document':
      return 'Nespárovaný doklad'
    case 'expense-unmatched-outflow':
      return 'Nespárovaná odchozí platba'
    case 'expense-unmatched-inflow':
      return 'Nespárovaná příchozí platba'
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
    domain: 'payout',
    kind: 'reservation-settlement-overview',
    title: `Rezervace ${reservation.reservationId}`,
    detail: detailParts.join(' '),
    transactionIds: match ? collectReservationMatchTransactionIds(match) : [],
    sourceDocumentIds: [reservation.sourceDocumentId],
    matchStrength: match
      ? classifyGenericMatchStrength(match.confidence)
      : 'vyžaduje kontrolu',
    evidenceSummary: [
      { label: 'částka', value: formatAmountMinorForReview(reservation.grossRevenueMinor, reservation.currency) },
      maybeEvidenceEntry('datum', reservation.stayStartAt && reservation.stayEndAt ? `${reservation.stayStartAt} – ${reservation.stayEndAt}` : reservation.stayStartAt),
      maybeEvidenceEntry('reference', reservation.reference ?? reservation.reservationId),
      maybeEvidenceEntry('protistrana / účet', buildExpectedSettlementPathCs(reservation.expectedSettlementChannels, reservation.channel)),
      maybeEvidenceEntry('dokument', '1 zdrojový doklad')
    ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry)),
    operatorExplanation: match
      ? 'Rezervace má nalezenou odpovídající úhradu ve správném kanálu.'
      : 'Rezervace je načtená, ale odpovídající úhrada zatím není potvrzená.',
    operatorCheckHint: match
      ? buildMatchedCheckHint(classifyGenericMatchStrength(match.confidence))
      : 'Zkontrolujte ručně kanál úhrady, rezervační referenci a odpovídající bankovní nebo payout pohyb.'
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
    domain: 'payout',
    kind: 'ancillary-settlement-overview',
    title: item.reference === item.reservationId || !item.reservationId
      ? `Doplňková položka ${item.itemLabel ?? item.reference}`
      : `Doplňková položka ${item.reference}`,
    detail: detailParts.join(' '),
    transactionIds: candidate ? [candidate.rowId] : [],
    sourceDocumentIds: [item.sourceDocumentId],
    matchStrength: candidate ? 'slabší shoda' : 'vyžaduje kontrolu',
    evidenceSummary: [
      { label: 'částka', value: formatAmountMinorForReview(item.grossRevenueMinor, item.currency) },
      maybeEvidenceEntry('datum', item.bookedAt),
      maybeEvidenceEntry('reference', item.reference),
      maybeEvidenceEntry('protistrana / účet', buildExpectedSettlementPathCs([], item.channel)),
      maybeEvidenceEntry('dokument', '1 zdrojový doklad')
    ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry)),
    operatorExplanation: candidate
      ? 'Doplňková položka má nalezený odpovídající kandidát úhrady.'
      : 'Doplňková položka je načtená, ale bez potvrzené úhrady.',
    operatorCheckHint: candidate
      ? 'Zkontrolujte ručně, že kandidát opravdu patří k této doplňkové položce.'
      : 'Zkontrolujte ručně kanál úhrady, částku a návaznost na rezervaci.'
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
    domain: 'payout',
    kind: 'unmatched-reservation-settlement',
    title: `Rezervace ${reservation?.reservationId ?? noMatch.reservationId}`,
    detail: detailParts.join(' '),
    transactionIds: [],
    sourceDocumentIds: [noMatch.sourceDocumentId],
    matchStrength: 'nespárováno',
    evidenceSummary: [
      typeof reservation?.grossRevenueMinor === 'number'
        ? { label: 'částka', value: formatAmountMinorForReview(reservation.grossRevenueMinor, reservation.currency) }
        : undefined,
      maybeEvidenceEntry('datum', reservation?.stayStartAt && reservation?.stayEndAt ? `${reservation.stayStartAt} – ${reservation.stayEndAt}` : reservation?.stayStartAt),
      maybeEvidenceEntry('reference', reservation?.reference ?? reservation?.reservationId ?? noMatch.reference ?? noMatch.reservationId),
      maybeEvidenceEntry('protistrana / účet', reservation ? buildExpectedSettlementPathCs(reservation.expectedSettlementChannels, reservation.channel) : undefined),
      maybeEvidenceEntry('dokument', '1 zdrojový doklad')
    ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry)),
    operatorExplanation: buildReservationSettlementReasonCs(noMatch.noMatchReason, reservation?.expectedSettlementChannels),
    operatorCheckHint: 'Zkontrolujte ručně očekávaný kanál úhrady, datum pobytu a odpovídající payout nebo bankovní pohyb.'
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

function buildExceptionEvidenceSummary(
  batch: MonthlyBatchResult,
  exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number],
  sourceDocumentIds: string[],
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewEvidenceEntry[] {
  const transactions = exceptionCase.relatedTransactionIds
    .map((transactionId) => batch.reconciliation.normalizedTransactions.find((item) => item.id === transactionId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const documentProvenance = buildDocumentProvenanceLabel(fileRoutes, sourceDocumentIds)

  return [
    maybeEvidenceEntry(
      'částka',
      uniqueTextValues(transactions.map((transaction) => formatAmountMinorCs(transaction.amountMinor, transaction.currency))).join(' / ')
    ),
    maybeEvidenceEntry(
      'datum',
      uniqueTextValues(transactions.map((transaction) => transaction.bookedAt)).join(' / ')
    ),
    maybeEvidenceEntry(
      'reference',
      uniqueTextValues(transactions.flatMap((transaction) => [transaction.reference, transaction.invoiceNumber])).join(', ')
    ),
    maybeEvidenceEntry(
      'protistrana / účet',
      uniqueTextValues(transactions.flatMap((transaction) => [transaction.counterparty, transaction.accountId])).join(' · ')
    ),
    maybeEvidenceEntry('dokument', describeSourceDocuments(sourceDocumentIds)),
    maybeEvidenceEntry('provenience', documentProvenance)
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function buildDocumentBankRelationStatus(
  batch: MonthlyBatchResult,
  sourceDocumentIds: string[],
  relatedTransactionIds: string[]
): string | undefined {
  const hasDocument = batch.extractedRecords.some((record) =>
    sourceDocumentIds.includes(record.sourceDocumentId)
    && (record.recordType === 'invoice-document' || record.recordType === 'receipt-document')
  )

  if (!hasDocument) {
    return undefined
  }

  const hasConfirmedLink = batch.reconciliation.supportedExpenseLinks.some((link) =>
    link.supportSourceDocumentIds.some((sourceDocumentId) => sourceDocumentIds.includes(sourceDocumentId))
  )

  if (hasConfirmedLink) {
    return 'Potvrzená pravděpodobná vazba mezi dokladem a bankovním výdajem.'
  }

  const hasBankCandidate = relatedTransactionIds.some((transactionId) =>
    batch.reconciliation.normalizedTransactions.some((transaction) => transaction.id === transactionId && transaction.source === 'bank')
  )

  if (hasBankCandidate) {
    return 'Doklad je načtený a existuje související bankovní pohyb, ale vazba zatím není potvrzená.'
  }

  return 'Doklad je načtený, ale zatím bez potvrzené bankovní vazby.'
}

function classifyReviewItemDomain(
  batch: MonthlyBatchResult,
  sourceDocumentIds: string[],
  relatedTransactionIds: string[],
  ruleCode?: string,
  type?: string
): ReviewSectionItem['domain'] {
  const hasExpenseDocument = batch.extractedRecords.some((record) =>
    sourceDocumentIds.includes(record.sourceDocumentId)
    && DOCUMENT_RECORD_TYPE_SET.has(record.recordType)
  )

  if (hasExpenseDocument) {
    return 'expense'
  }

  const relatedTransactions = relatedTransactionIds
    .map((transactionId) => batch.reconciliation.normalizedTransactions.find((transaction) => transaction.id === transactionId))
    .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction))

  const hasRelatedBankTransaction = relatedTransactions.some((transaction) => transaction.source === 'bank')
  const hasExpenseLikeBankOutflow = relatedTransactions.some((transaction) =>
    transaction.source === 'bank'
    && transaction.direction === 'out'
  )

  if (
    hasRelatedBankTransaction
    && (ruleCode === 'missing_supporting_document' || type === 'unmatched_document')
  ) {
    return 'expense'
  }

  return hasExpenseLikeBankOutflow ? 'expense' : 'payout'
}

function buildDocumentProvenanceLabel(
  fileRoutes: UploadedMonthlyFileRoute[] | undefined,
  sourceDocumentIds: string[]
): string | undefined {
  if (!fileRoutes || sourceDocumentIds.length === 0) {
    return undefined
  }

  const provenances = sourceDocumentIds.flatMap((sourceDocumentId) => {
    const summary = fileRoutes.find((route) => route.sourceDocumentId === sourceDocumentId)?.parseDiagnostics?.documentExtractionSummary
    const fieldProvenance = summary?.fieldProvenance
      ? Object.values(summary.fieldProvenance)
      : []

    if (fieldProvenance.includes('text+qr-confirmed')) {
      return ['text + QR']
    }

    if (fieldProvenance.includes('qr')) {
      return ['QR']
    }

    if (fieldProvenance.includes('ocr')) {
      return ['OCR']
    }

    if (fieldProvenance.includes('vision')) {
      return ['vision']
    }

    if (fieldProvenance.includes('text')) {
      return ['text']
    }

    return []
  })

  const unique = [...new Set(provenances)]
  return unique.length > 0 ? unique.join(', ') : undefined
}

function buildExceptionCheckHint(kind: ReviewSectionItem['kind']): string {
  switch (kind) {
    case 'suspicious':
      return 'Zkontrolujte ručně protiúčet, částku, účel platby a návazný doklad.'
    case 'missing-document':
      return 'Zkontrolujte ručně, zda je doklad opravdu nahraný a zda má potvrzenou vazbu na bankovní výdaj.'
    default:
      return 'Zkontrolujte ručně částku, datum, reference a odpovídající navazující doklady.'
  }
}

function hasVisiblePayoutReference(platform: string, payoutReference: string): boolean {
  const normalized = payoutReference.trim()

  if (!normalized) {
    return false
  }

  if (platform.trim().toLowerCase() === 'airbnb') {
    return !normalized.toUpperCase().startsWith('AIRBNB-TRANSFER:')
  }

  return true
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
  fileRoutes: UploadedMonthlyFileRoute[] | undefined,
  exceptionCase: MonthlyBatchResult['reconciliation']['exceptionCases'][number]
): ReviewSectionItem {
  const base = toReviewItem(batch, fileRoutes, exceptionCase, 'missing-document')
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
    detail: hints.length > 0 ? `${base.detail} ${hints.join(' • ')}` : base.detail,
    operatorCheckHint: exceptionCase.type === 'unmatched_document'
      ? 'Doklad je načtený, ale zatím bez potvrzené vazby na bankovní pohyb. Zkontrolujte ručně reference, částku a protiúčet.'
      : base.operatorCheckHint
  }
}
