import * as XLSX from 'xlsx'
import type { ReviewEvidenceEntry, ReviewSectionItem } from '../review'

export type MonthlyWorkspaceExportPreset = 'complete' | 'review-needed' | 'matched-only'

interface BrowserWorkspaceExportReviewSections {
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

interface BrowserWorkspaceExportState {
  generatedAt: string
  runId: string
  monthLabel: string
  reviewSections: BrowserWorkspaceExportReviewSections
  finalPayoutProjection?: {
    matchedCount?: number
    unmatchedCount?: number
  }
}

export interface BrowserWorkspaceExcelExportArtifact {
  labelCs: string
  fileName: string
  preset: MonthlyWorkspaceExportPreset
  presetLabelCs: string
  base64Content: string
  payoutRowCount: number
  expenseRowCount: number
  counts: {
    payoutMatched: number
    payoutUnmatched: number
    expenseMatched: number
    expenseNeedsReview: number
    expenseUnmatchedDocuments: number
    expenseUnmatchedOutflows: number
    expenseUnmatchedInflows: number
  }
}

export function buildBrowserWorkspaceExcelExport(input: {
  state: BrowserWorkspaceExportState
  preset: MonthlyWorkspaceExportPreset
}): BrowserWorkspaceExcelExportArtifact {
  const preset = normalizePreset(input.preset)
  const state = input.state
  const sections = state.reviewSections || emptySections()
  const payoutRows = buildPayoutRows(sections, preset)
  const expenseRows = buildExpenseRows(sections, preset)
  const workbook = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(state, preset, payoutRows.length, expenseRows.length), 'Souhrn')
  XLSX.utils.book_append_sheet(workbook, buildTableSheet(payoutRows, PAYOUT_HEADERS), 'Payout a rezervace')
  XLSX.utils.book_append_sheet(workbook, buildTableSheet(expenseRows, EXPENSE_HEADERS), 'Výdaje a doklady')

  const base64Content = XLSX.write(workbook, {
    type: 'base64',
    bookType: 'xlsx'
  })

  return {
    labelCs: 'Excel export měsíčního workspace',
    fileName: buildMonthlyWorkspaceExportFileName(state.monthLabel, preset),
    preset,
    presetLabelCs: describePresetCs(preset),
    base64Content,
    payoutRowCount: payoutRows.length,
    expenseRowCount: expenseRows.length,
    counts: {
      payoutMatched: Number(state.finalPayoutProjection?.matchedCount ?? sections.payoutBatchMatched.length),
      payoutUnmatched: Number(state.finalPayoutProjection?.unmatchedCount ?? sections.payoutBatchUnmatched.length),
      expenseMatched: sections.expenseMatched.length,
      expenseNeedsReview: sections.expenseNeedsReview.length,
      expenseUnmatchedDocuments: sections.expenseUnmatchedDocuments.length,
      expenseUnmatchedOutflows: sections.expenseUnmatchedOutflows.length,
      expenseUnmatchedInflows: sections.expenseUnmatchedInflows.length
    }
  }
}

const PAYOUT_HEADERS = [
  'Sekce',
  'Stav',
  'Vyhodnocení / síla shody',
  'Ruční rozhodnutí',
  'Částka',
  'Měna',
  'Datum',
  'Reference',
  'Protistrana / dodavatel',
  'Účet / IBAN hint',
  'Zdroj / typ položky',
  'Stručné důkazy',
  'Poznámka ke kontrole',
  'Titulek',
  'Detail',
  'Transakce',
  'Zdrojové dokumenty'
] as const

const EXPENSE_HEADERS = [
  'Sekce',
  'Stav',
  'Vyhodnocení / síla shody',
  'Ruční rozhodnutí',
  'Dodavatel / protistrana',
  'Číslo faktury / reference',
  'Datum vystavení',
  'Datum splatnosti',
  'Datum banky',
  'Částka',
  'Měna',
  'Účet / IBAN hint',
  'Zpráva banky',
  'Zdroj / typ položky',
  'Stručné důkazy',
  'Poznámka ke kontrole',
  'Titulek',
  'Detail',
  'Transakce',
  'Zdrojové dokumenty'
] as const

function normalizePreset(value: MonthlyWorkspaceExportPreset): MonthlyWorkspaceExportPreset {
  if (value === 'review-needed' || value === 'matched-only') {
    return value
  }

  return 'complete'
}

function describePresetCs(preset: MonthlyWorkspaceExportPreset): string {
  switch (preset) {
    case 'review-needed':
      return 'Jen ke kontrole / chybějící'
    case 'matched-only':
      return 'Jen spárované'
    default:
      return 'Kompletní export'
  }
}

function buildMonthlyWorkspaceExportFileName(monthLabel: string, preset: MonthlyWorkspaceExportPreset): string {
  const normalizedMonth = monthLabel && monthLabel.trim() ? monthLabel.trim() : 'nezadany-mesic'
  const presetSlug = preset === 'review-needed'
    ? 'jen-ke-kontrole'
    : preset === 'matched-only'
      ? 'jen-sparovane'
      : 'kompletni-export'

  return `hotel-finance-control-${normalizedMonth}-${presetSlug}.xlsx`
}

function buildSummarySheet(
  state: BrowserWorkspaceExportState,
  preset: MonthlyWorkspaceExportPreset,
  payoutRowCount: number,
  expenseRowCount: number
) {
  const sections = state.reviewSections || emptySections()
  const rows = [
    { Položka: 'Měsíc', Hodnota: state.monthLabel || 'neuvedeno' },
    { Položka: 'Run ID', Hodnota: state.runId || 'bez runtime běhu' },
    { Položka: 'Vygenerováno', Hodnota: state.generatedAt || '' },
    { Položka: 'Exportní preset', Hodnota: describePresetCs(preset) },
    { Položka: 'Řádky - payout a rezervace', Hodnota: String(payoutRowCount) },
    { Položka: 'Řádky - výdaje a doklady', Hodnota: String(expenseRowCount) },
    { Položka: 'Spárované payout dávky', Hodnota: String(Number(state.finalPayoutProjection?.matchedCount ?? sections.payoutBatchMatched.length)) },
    { Položka: 'Nespárované payout dávky', Hodnota: String(Number(state.finalPayoutProjection?.unmatchedCount ?? sections.payoutBatchUnmatched.length)) },
    { Položka: 'Spárované výdaje', Hodnota: String(sections.expenseMatched.length) },
    { Položka: 'Výdaje ke kontrole', Hodnota: String(sections.expenseNeedsReview.length) },
    { Položka: 'Nespárované doklady', Hodnota: String(sections.expenseUnmatchedDocuments.length) },
    { Položka: 'Nespárované odchozí platby', Hodnota: String(sections.expenseUnmatchedOutflows.length) },
    { Položka: 'Nespárované příchozí platby', Hodnota: String(sections.expenseUnmatchedInflows.length) }
  ]

  return XLSX.utils.json_to_sheet(rows)
}

function buildTableSheet(rows: Array<Record<string, string>>, headers: readonly string[]) {
  return XLSX.utils.json_to_sheet(rows, {
    header: [...headers]
  })
}

function buildPayoutRows(
  sections: BrowserWorkspaceExportReviewSections,
  preset: MonthlyWorkspaceExportPreset
): Array<Record<string, string>> {
  const matchedBuckets = [
    { section: 'Spárované položky', items: sections.matched },
    { section: 'Spárované payout dávky', items: sections.payoutBatchMatched },
    { section: 'Hlavní ubytovací rezervace', items: sections.reservationSettlementOverview },
    { section: 'Doplňkové položky', items: sections.ancillarySettlementOverview }
  ]
  const reviewBuckets = [
    { section: 'Nespárované payout dávky', items: sections.payoutBatchUnmatched },
    { section: 'Nespárované rezervace k úhradě', items: sections.unmatchedReservationSettlements },
    { section: 'Nespárované položky', items: sections.unmatched },
    { section: 'Podezřelé položky', items: sections.suspicious },
    { section: 'Chybějící doklady', items: sections.missingDocuments }
  ]

  const buckets = preset === 'matched-only'
    ? matchedBuckets
    : preset === 'review-needed'
      ? reviewBuckets
      : matchedBuckets.concat(reviewBuckets)

  return buckets.flatMap((bucket) =>
    bucket.items
      .filter((item) => isPayoutReservationReviewItem(item))
      .map((item) => buildGenericReviewRow(bucket.section, item))
  )
}

function buildExpenseRows(
  sections: BrowserWorkspaceExportReviewSections,
  preset: MonthlyWorkspaceExportPreset
): Array<Record<string, string>> {
  const matchedBuckets = [
    { section: 'Spárované výdaje', items: sections.expenseMatched }
  ]
  const reviewBuckets = [
    { section: 'Výdaje ke kontrole', items: sections.expenseNeedsReview },
    { section: 'Nespárované doklady', items: sections.expenseUnmatchedDocuments },
    { section: 'Nespárované odchozí platby', items: sections.expenseUnmatchedOutflows },
    { section: 'Nespárované příchozí platby', items: sections.expenseUnmatchedInflows }
  ]

  const buckets = preset === 'matched-only'
    ? matchedBuckets
    : preset === 'review-needed'
      ? reviewBuckets
      : matchedBuckets.concat(reviewBuckets)

  return buckets.flatMap((bucket) =>
    bucket.items
      .filter((item) => isExpenseReviewItem(item))
      .map((item) => buildExpenseReviewRow(bucket.section, item))
  )
}

function isPayoutReservationReviewItem(item: ReviewSectionItem): boolean {
  return item.domain === 'payout'
    && (
      item.kind === 'matched'
    || item.kind === 'reservation-settlement-overview'
    || item.kind === 'ancillary-settlement-overview'
    || item.kind === 'unmatched-reservation-settlement'
    || item.kind === 'unmatched'
    || item.kind === 'suspicious'
    || item.kind === 'missing-document'
    )
}

function isExpenseReviewItem(item: ReviewSectionItem): boolean {
  return item.domain === 'expense'
    && (
      item.kind === 'expense-matched'
    || item.kind === 'expense-review'
    || item.kind === 'expense-unmatched-document'
    || item.kind === 'expense-unmatched-outflow'
    || item.kind === 'expense-unmatched-inflow'
    )
}

function buildGenericReviewRow(sectionLabel: string, item: ReviewSectionItem): Record<string, string> {
  return {
    Sekce: sectionLabel,
    Stav: buildStatusLabel(item),
    'Vyhodnocení / síla shody': item.matchStrength,
    'Ruční rozhodnutí': item.manualDecisionLabel ?? '',
    'Částka': findEvidenceValue(item.evidenceSummary, 'částka'),
    'Měna': inferCurrency(item),
    'Datum': findEvidenceValue(item.evidenceSummary, 'datum'),
    'Reference': findEvidenceValue(item.evidenceSummary, 'reference'),
    'Protistrana / dodavatel': firstNonEmpty([
      findEvidenceValue(item.evidenceSummary, 'protistrana / účet'),
      findEvidenceValue(item.evidenceSummary, 'protistrana / dodavatel')
    ]),
    'Účet / IBAN hint': findEvidenceValue(item.evidenceSummary, 'IBAN'),
    'Zdroj / typ položky': item.kind,
    'Stručné důkazy': joinEvidenceSummary(item.evidenceSummary),
    'Poznámka ke kontrole': item.operatorCheckHint ?? item.operatorExplanation,
    'Titulek': item.title,
    'Detail': item.detail,
    'Transakce': item.transactionIds.join(' | '),
    'Zdrojové dokumenty': item.sourceDocumentIds.join(' | ')
  }
}

function buildExpenseReviewRow(sectionLabel: string, item: ReviewSectionItem): Record<string, string> {
  const documentSide = item.expenseComparison?.document || {}
  const bankSide = item.expenseComparison?.bank || {}
  const comparisonVariant = item.expenseComparison?.variant === 'bank-bank' ? 'bank-bank' : 'document-bank'
  const mergedBankDate = comparisonVariant === 'bank-bank'
    ? firstNonEmpty([
        joinNonEmpty([documentSide.bookedAt, bankSide.bookedAt], ' ↔ '),
        bankSide.bookedAt,
        documentSide.bookedAt
      ])
    : bankSide.bookedAt ?? ''

  return {
    Sekce: sectionLabel,
    Stav: buildStatusLabel(item),
    'Vyhodnocení / síla shody': item.matchStrength,
    'Ruční rozhodnutí': item.manualDecisionLabel ?? '',
    'Dodavatel / protistrana': firstNonEmpty([
      documentSide.supplierOrCounterparty,
      bankSide.supplierOrCounterparty,
      findEvidenceValue(item.evidenceSummary, 'protistrana / dodavatel'),
      findEvidenceValue(item.evidenceSummary, 'protistrana / účet')
    ]),
    'Číslo faktury / reference': firstNonEmpty([
      documentSide.reference,
      bankSide.reference,
      findEvidenceValue(item.evidenceSummary, 'reference')
    ]),
    'Datum vystavení': comparisonVariant === 'bank-bank' ? '' : (documentSide.issueDate ?? ''),
    'Datum splatnosti': comparisonVariant === 'bank-bank' ? '' : (documentSide.dueDate ?? ''),
    'Datum banky': mergedBankDate,
    'Částka': firstNonEmpty([
      documentSide.amount,
      bankSide.amount,
      findEvidenceValue(item.evidenceSummary, 'částka')
    ]),
    'Měna': firstNonEmpty([
      documentSide.currency,
      bankSide.currency,
      inferCurrency(item)
    ]),
    'Účet / IBAN hint': firstNonEmpty([
      comparisonVariant === 'bank-bank'
        ? joinNonEmpty([documentSide.bankAccount, bankSide.bankAccount], ' ↔ ')
        : undefined,
      documentSide.ibanHint,
      bankSide.bankAccount,
      findEvidenceValue(item.evidenceSummary, 'IBAN')
    ]),
    'Zpráva banky': firstNonEmpty([
      comparisonVariant === 'bank-bank'
        ? joinNonEmpty([documentSide.reference, bankSide.reference], ' ↔ ')
        : undefined,
      bankSide.reference,
      findEvidenceValue(item.evidenceSummary, 'zpráva banky')
    ]),
    'Zdroj / typ položky': item.kind,
    'Stručné důkazy': joinEvidenceSummary(item.evidenceSummary),
    'Poznámka ke kontrole': item.operatorCheckHint ?? item.operatorExplanation,
    'Titulek': item.title,
    'Detail': item.detail,
    'Transakce': item.transactionIds.join(' | '),
    'Zdrojové dokumenty': item.sourceDocumentIds.join(' | ')
  }
}

function buildStatusLabel(item: ReviewSectionItem): string {
  if (item.manualDecisionLabel) {
    return item.manualDecisionLabel
  }

  if (item.matchStrength === 'potvrzená shoda') {
    return 'Automatická potvrzená shoda'
  }

  if (item.matchStrength === 'slabší shoda') {
    return 'Slabší automatická shoda'
  }

  if (item.matchStrength === 'vyžaduje kontrolu') {
    return 'Vyžaduje kontrolu'
  }

  return 'Nespárováno'
}

function joinEvidenceSummary(entries: ReviewEvidenceEntry[]): string {
  return entries.map((entry) => `${entry.label}: ${entry.value}`).join(' | ')
}

function findEvidenceValue(entries: ReviewEvidenceEntry[], label: ReviewEvidenceEntry['label']): string {
  return entries.find((entry) => entry.label === label)?.value ?? ''
}

function inferCurrency(item: ReviewSectionItem): string {
  const amount = firstNonEmpty([
    item.expenseComparison?.document?.amount,
    item.expenseComparison?.bank?.amount,
    findEvidenceValue(item.evidenceSummary, 'částka')
  ])

  if (!amount) {
    return ''
  }

  if (amount.includes('CZK') || amount.includes('Kč')) {
    return 'CZK'
  }

  if (amount.includes('EUR') || amount.includes('€')) {
    return 'EUR'
  }

  return ''
}

function firstNonEmpty(values: Array<string | undefined>): string {
  return values.find((value) => Boolean(value && String(value).trim())) ?? ''
}

function joinNonEmpty(values: Array<string | undefined>, separator: string): string | undefined {
  const present = values.filter((value): value is string => Boolean(value && String(value).trim()))
  return present.length > 0 ? present.join(separator) : undefined
}

function emptySections(): BrowserWorkspaceExportReviewSections {
  return {
    matched: [],
    reservationSettlementOverview: [],
    ancillarySettlementOverview: [],
    unmatchedReservationSettlements: [],
    payoutBatchMatched: [],
    payoutBatchUnmatched: [],
    expenseMatched: [],
    expenseNeedsReview: [],
    expenseUnmatchedDocuments: [],
    expenseUnmatchedOutflows: [],
    expenseUnmatchedInflows: [],
    unmatched: [],
    suspicious: [],
    missingDocuments: []
  }
}
