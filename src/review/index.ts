import type { ExceptionCase } from '../domain'
import type { MonthlyBatchResult, UploadedMonthlyFileRoute } from '../monthly-batch'
import { formatAmountMinorCs } from '../shared/money'

export type ReviewMatchStrength =
  | 'potvrzená shoda'
  | 'slabší shoda'
  | 'vyžaduje kontrolu'
  | 'nespárováno'

export interface ReviewEvidenceEntry {
  label: 'částka' | 'datum' | 'reference' | 'protistrana / účet' | 'IBAN' | 'dokument' | 'provenience'
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
  document: ReviewExpenseComparisonSide
  bank?: ReviewExpenseComparisonSide
}

export interface ReviewSectionItem {
  id: string
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
  unmatched: ReviewSectionItem[]
  suspicious: ReviewSectionItem[]
  missingDocuments: ReviewSectionItem[]
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
    unmatched,
    suspicious,
    missingDocuments
  }
}

const EXPENSE_REVIEW_MAX_DAY_DISTANCE = 7
const DOCUMENT_RECORD_TYPE_SET = new Set(['invoice-document', 'receipt-document'])

interface ExpenseDocumentReviewEntry {
  extractedRecord: MonthlyBatchResult['extractedRecords'][number]
  normalizedTransaction?: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number]
  fileRoute?: UploadedMonthlyFileRoute
}

function buildExpenseReviewSections(
  batch: MonthlyBatchResult,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): Pick<ReviewScreenData, 'expenseMatched' | 'expenseNeedsReview' | 'expenseUnmatchedDocuments' | 'expenseUnmatchedOutflows'> {
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
  const candidateBankTransactions = batch.reconciliation.normalizedTransactions.filter((transaction) =>
    transaction.source === 'bank'
    && transaction.direction === 'out'
    && missingSupportingOutflowIds.has(transaction.id)
    && !linkedExpenseTransactionIds.has(transaction.id)
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

  const expenseNeedsReview: ReviewSectionItem[] = []
  const expenseUnmatchedDocuments: ReviewSectionItem[] = []

  for (const documentEntry of documentEntries) {
    if (documentEntry.normalizedTransaction && linkedSupportTransactionIds.has(documentEntry.normalizedTransaction.id)) {
      continue
    }

    const candidateBankTransaction = findUniqueExpenseBankCandidate(documentEntry, candidateBankTransactions, usedCandidateBankIds)

    if (candidateBankTransaction) {
      usedCandidateBankIds.add(candidateBankTransaction.id)
      expenseNeedsReview.push(toExpenseNeedsReviewItem(batch, documentEntry, candidateBankTransaction, fileRoutes))
      continue
    }

    expenseUnmatchedDocuments.push(toExpenseUnmatchedDocumentReviewItem(batch, documentEntry, fileRoutes))
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

      return [toExpenseUnmatchedOutflowReviewItem(batch, transaction, exceptionCase, fileRoutes)]
    })

  return {
    expenseMatched,
    expenseNeedsReview,
    expenseUnmatchedDocuments,
    expenseUnmatchedOutflows
  }
}

function toExpenseMatchedReviewItem(
  _batch: MonthlyBatchResult,
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  reasons: string[],
  matchScore: number,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewSectionItem {
  const documentReference = getExpenseDocumentReference(documentEntry)
  const matchStrength = classifyExpenseMatchedStrength(reasons, matchScore)

  return {
    id: `expense-matched:${documentEntry.extractedRecord.id}:${bankTransaction.id}`,
    kind: 'expense-matched',
    title: documentReference
      ? `Faktura ${documentReference}`
      : `Doklad ${documentEntry.extractedRecord.sourceDocumentId}`,
    detail: 'Doklad a odchozí bankovní platba tvoří potvrzenou výdajovou vazbu.',
    transactionIds: [
      ...(documentEntry.normalizedTransaction ? [documentEntry.normalizedTransaction.id] : []),
      bankTransaction.id
    ],
    sourceDocumentIds: [documentEntry.extractedRecord.sourceDocumentId],
    matchStrength,
    evidenceSummary: buildExpenseEvidenceSummary(documentEntry, bankTransaction, fileRoutes, reasons),
    operatorExplanation: matchStrength === 'potvrzená shoda'
      ? 'Částka, datum a alespoň jedna další stopa potvrzují vazbu dokladu na bankovní výdaj.'
      : 'Doklad je spárovaný s bankovním výdajem, ale ručně ověřte reference nebo protistranu.',
    operatorCheckHint: matchStrength === 'potvrzená shoda'
      ? 'Ruční kontrolu dělejte jen při sporné protistraně nebo neobvyklém textu v bankovní platbě.'
      : 'Zkontrolujte ručně reference dokladu, protistranu a datum platby.',
    documentBankRelation: 'Potvrzená pravděpodobná vazba mezi dokladem a odchozí bankovní platbou.',
    expenseComparison: buildExpenseComparison(documentEntry, bankTransaction)
  }
}

function toExpenseNeedsReviewItem(
  _batch: MonthlyBatchResult,
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number],
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewSectionItem {
  const documentReference = getExpenseDocumentReference(documentEntry)

  return {
    id: `expense-review:${documentEntry.extractedRecord.id}:${bankTransaction.id}`,
    kind: 'expense-review',
    title: documentReference
      ? `Doklad ke kontrole ${documentReference}`
      : `Doklad ke kontrole ${documentEntry.extractedRecord.sourceDocumentId}`,
    detail: 'Doklad je načtený a existuje jediný blízký odchozí bankovní kandidát, ale vazba zatím není potvrzená.',
    transactionIds: [
      ...(documentEntry.normalizedTransaction ? [documentEntry.normalizedTransaction.id] : []),
      bankTransaction.id
    ],
    sourceDocumentIds: [documentEntry.extractedRecord.sourceDocumentId],
    matchStrength: 'vyžaduje kontrolu',
    evidenceSummary: buildExpenseEvidenceSummary(documentEntry, bankTransaction, fileRoutes),
    operatorExplanation: 'Systém našel jediný kandidátní bankovní pohyb se stejnou částkou, ale chybí silnější potvrzení.',
    operatorCheckHint: 'Zkontrolujte ručně variabilní symbol, text platby, protistranu a datum odchozí platby.',
    documentBankRelation: 'Doklad je načtený a existuje kandidátní bankovní pohyb, ale vazba zatím není potvrzená.',
    expenseComparison: buildExpenseComparison(documentEntry, bankTransaction)
  }
}

function toExpenseUnmatchedDocumentReviewItem(
  _batch: MonthlyBatchResult,
  documentEntry: ExpenseDocumentReviewEntry,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined
): ReviewSectionItem {
  const documentReference = getExpenseDocumentReference(documentEntry)

  return {
    id: `expense-unmatched-document:${documentEntry.extractedRecord.id}`,
    kind: 'expense-unmatched-document',
    title: documentReference
      ? `Nespárovaný doklad ${documentReference}`
      : `Nespárovaný doklad ${documentEntry.extractedRecord.sourceDocumentId}`,
    detail: 'Doklad je načtený, ale nebyla nalezena jednoznačná odchozí bankovní platba.',
    transactionIds: documentEntry.normalizedTransaction ? [documentEntry.normalizedTransaction.id] : [],
    sourceDocumentIds: [documentEntry.extractedRecord.sourceDocumentId],
    matchStrength: 'nespárováno',
    evidenceSummary: buildExpenseEvidenceSummary(documentEntry, undefined, fileRoutes),
    operatorExplanation: 'Doklad je použitelný pro kontrolu, ale bez potvrzené vazby na bankovní výdaj.',
    operatorCheckHint: 'Zkontrolujte ručně, zda v bance nechybí odchozí platba se stejnou částkou nebo odpovídající referencí.',
    documentBankRelation: 'Doklad je načtený, ale zatím bez potvrzené bankovní vazby.',
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

function classifyExpenseMatchedStrength(reasons: string[], matchScore: number): ReviewMatchStrength {
  const hasReference = reasons.includes('referenceAligned')
  const hasCounterparty = reasons.includes('counterpartyAligned')

  if (matchScore >= 6 && (hasReference || hasCounterparty)) {
    return 'potvrzená shoda'
  }

  return 'slabší shoda'
}

function findUniqueExpenseBankCandidate(
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransactions: MonthlyBatchResult['reconciliation']['normalizedTransactions'],
  usedCandidateBankIds: Set<string>
): MonthlyBatchResult['reconciliation']['normalizedTransactions'][number] | undefined {
  const documentAmountMinor = documentEntry.extractedRecord.amountMinor
  const documentCurrency = documentEntry.extractedRecord.currency

  if (typeof documentAmountMinor !== 'number' || !documentCurrency) {
    return undefined
  }

  const candidates = bankTransactions
    .filter((transaction) => !usedCandidateBankIds.has(transaction.id))
    .filter((transaction) => transaction.amountMinor === documentAmountMinor && transaction.currency === documentCurrency)
    .filter((transaction) => calculateExpenseDateDistance(documentEntry, transaction.bookedAt) <= EXPENSE_REVIEW_MAX_DAY_DISTANCE)

  return candidates.length === 1 ? candidates[0] : undefined
}

function buildExpenseComparison(
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number] | undefined
): ReviewExpenseComparison {
  const documentData = documentEntry.extractedRecord.data as Record<string, unknown>

  return {
    document: {
      supplierOrCounterparty: readString(documentData.supplier) ?? readString(documentData.merchant) ?? documentEntry.normalizedTransaction?.counterparty,
      reference: getExpenseDocumentReference(documentEntry),
      issueDate: readString(documentData.issueDate) ?? documentEntry.extractedRecord.occurredAt,
      dueDate: readString(documentData.dueDate),
      amount: typeof documentEntry.extractedRecord.amountMinor === 'number' && documentEntry.extractedRecord.currency
        ? formatAmountMinorCs(documentEntry.extractedRecord.amountMinor, documentEntry.extractedRecord.currency)
        : undefined,
      currency: documentEntry.extractedRecord.currency,
      ibanHint: readString(documentData.ibanHint)
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

function buildExpenseEvidenceSummary(
  documentEntry: ExpenseDocumentReviewEntry,
  bankTransaction: MonthlyBatchResult['reconciliation']['normalizedTransactions'][number] | undefined,
  fileRoutes: UploadedMonthlyFileRoute[] | undefined,
  confirmedReasons: string[] = []
): ReviewEvidenceEntry[] {
  const documentReference = getExpenseDocumentReference(documentEntry)
  const documentCounterparty = getExpenseDocumentCounterparty(documentEntry)
  const documentIbanHint = getExpenseDocumentIbanHint(documentEntry)
  const documentProvenance = buildDocumentProvenanceLabel(fileRoutes, [documentEntry.extractedRecord.sourceDocumentId])
  const dateDistance = bankTransaction ? calculateExpenseDateDistance(documentEntry, bankTransaction.bookedAt) : undefined
  const referenceAligned = bankTransaction
    ? confirmedReasons.includes('referenceAligned') || expenseReferenceMatches(documentReference, bankTransaction.reference)
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
      value: bankTransaction ? 'sedí' : formatAmountMinorCs(documentEntry.extractedRecord.amountMinor ?? 0, documentEntry.extractedRecord.currency ?? 'CZK')
    },
    maybeEvidenceEntry(
      'datum',
      bankTransaction
        ? (typeof dateDistance === 'number'
          ? dateDistance === 0
            ? 'sedí'
            : `v toleranci (${dateDistance} dní)`
          : 'nelze ověřit')
        : getExpensePrimaryDate(documentEntry)
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
      'protistrana / účet',
      bankTransaction
        ? (counterpartyAligned ? 'podobná' : 'nepodobná')
        : (documentCounterparty ?? 'bez bankovního kandidáta')
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
    maybeEvidenceEntry('reference', bankTransaction.reference ?? 'chybí'),
    maybeEvidenceEntry('protistrana / účet', uniqueTextValues([bankTransaction.counterparty, bankTransaction.accountId]).join(' · ')),
    { label: 'dokument', value: 'chybí' }
  ].filter((entry): entry is ReviewEvidenceEntry => Boolean(entry))
}

function getExpenseDocumentReference(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>
  return readString(data.invoiceNumber)
    ?? documentEntry.extractedRecord.rawReference
    ?? documentEntry.normalizedTransaction?.invoiceNumber
    ?? documentEntry.normalizedTransaction?.reference
}

function getExpenseDocumentCounterparty(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>
  return readString(data.supplier)
    ?? readString(data.merchant)
    ?? documentEntry.normalizedTransaction?.counterparty
}

function getExpenseDocumentIbanHint(documentEntry: ExpenseDocumentReviewEntry): string | undefined {
  const data = documentEntry.extractedRecord.data as Record<string, unknown>
  return readString(data.ibanHint)
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
  const leftDate = new Date(`${left}T00:00:00Z`)
  const rightDate = new Date(`${right}T00:00:00Z`)
  return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000))
}

function expenseReferenceMatches(documentReference: string | undefined, bankReference: string | undefined): boolean {
  return normalizedComparableIncludes(documentReference, bankReference)
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
