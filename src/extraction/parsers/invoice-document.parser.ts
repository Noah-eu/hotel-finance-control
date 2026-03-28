import type { ExtractedRecord } from '../../domain'
import type {
  DeterministicDocumentFieldExtractionDebug,
  DeterministicDocumentGroupedBlockDebug,
  DeterministicDocumentRawBlockDebug,
  DeterministicDocumentExtractionSummary,
  DeterministicDocumentParserInput
} from '../contracts'
import {
  normalizeLabel,
  normalizeDocumentDate,
  parseDocumentMoney,
  parseLabeledDocumentText,
  pickRequiredField
} from './document-utils'

const REQUIRED_FIELDS = [
  'Invoice No',
  'Supplier',
  'Issue date',
  'Due date',
  'Total'
] as const

export interface ParseInvoiceDocumentInput extends DeterministicDocumentParserInput {}

type InvoiceSummaryFieldKey =
  | 'referenceNumber'
  | 'issuerOrCounterparty'
  | 'customer'
  | 'issueDate'
  | 'dueDate'
  | 'taxableDate'
  | 'paymentMethod'
  | 'totalAmount'
  | 'vatBaseAmount'
  | 'vatAmount'
  | 'ibanHint'
  | 'description'

type CandidateStage = 'grouped' | 'lineWindow' | 'fallback'

interface InvoiceFieldCandidate {
  value: string
  rule: string
  trace: string
}

interface StructuredGroupedInvoiceHeaderBlock {
  labels: string[]
  values: string[]
}

interface StructuredGroupedInvoiceTotalsBlock {
  labels: string[]
  values: string[]
}

interface InvoiceGroupedBlockCandidate {
  blockTypeCandidate: string
  orderedKeys: InvoiceSummaryFieldKey[]
  labels: string[]
  values: string[]
  score: number
  accepted: boolean
  rejectionReason?: string
  winnerRule: string
  trace: string
}

interface InvoiceFieldDebugState extends DeterministicDocumentFieldExtractionDebug {
  groupedCandidates: InvoiceFieldCandidate[]
  lineWindowCandidates: InvoiceFieldCandidate[]
  fallbackCandidates: InvoiceFieldCandidate[]
  rejectedCandidates: string[]
}

interface InvoiceDocumentExtractionDetails {
  fields: {
    invoiceNumber?: string
    supplier?: string
    customer?: string
    issueDateRaw?: string
    dueDateRaw?: string
    taxableDateRaw?: string
    totalRaw?: string
    paymentMethod?: string
    description?: string
    vatBaseRaw?: string
    vatRaw?: string
    ibanValue?: string
  }
  groupedHeaderLabels: string[]
  groupedHeaderValues: string[]
  groupedTotalsLabels: string[]
  groupedTotalsValues: string[]
  groupedHeaderBlockDebug: DeterministicDocumentGroupedBlockDebug[]
  groupedTotalsBlockDebug: DeterministicDocumentGroupedBlockDebug[]
  rawBlockDiscoveryDebug: DeterministicDocumentRawBlockDebug[]
  fieldDebug: Record<InvoiceSummaryFieldKey, DeterministicDocumentFieldExtractionDebug>
}

type InvoiceExtractedFields = InvoiceDocumentExtractionDetails['fields']

const FIELD_ALIASES = {
  invoiceNumber: ['Invoice No', 'Invoice number', 'Číslo faktury', 'Faktura číslo', 'Faktura č.', 'Doklad číslo', 'Číslo dokladu'],
  supplier: ['Supplier', 'Vendor', 'Dodavatel'],
  customer: ['Customer', 'Buyer', 'Odběratel'],
  issueDate: ['Issue date', 'Issued on', 'Datum vystavení'],
  dueDate: ['Due date', 'Payment due', 'Datum splatnosti'],
  taxableDate: ['Taxable date', 'Tax point date', 'Datum zdanitelného plnění'],
  total: ['Total due', 'Amount due', 'Celkem Kč k úhradě', 'K úhradě', 'Celkem po zaokrouhlení', 'Celkem', 'Total'],
  paymentMethod: ['Payment method', 'Forma úhrady'],
  description: ['Service', 'Description', 'Položka', 'Předmět plnění'],
  vatBase: ['VAT base', 'Tax base', 'Základ DPH'],
  vat: ['VAT', 'DPH'],
  iban: ['IBAN', 'Iban']
} satisfies Record<string, string[]>

const SUMMARY_FIELD_ALIASES: Record<InvoiceSummaryFieldKey, string[]> = {
  referenceNumber: FIELD_ALIASES.invoiceNumber,
  issuerOrCounterparty: FIELD_ALIASES.supplier,
  customer: FIELD_ALIASES.customer,
  issueDate: FIELD_ALIASES.issueDate,
  dueDate: FIELD_ALIASES.dueDate,
  taxableDate: FIELD_ALIASES.taxableDate,
  paymentMethod: FIELD_ALIASES.paymentMethod,
  totalAmount: FIELD_ALIASES.total,
  vatBaseAmount: FIELD_ALIASES.vatBase,
  vatAmount: FIELD_ALIASES.vat,
  ibanHint: FIELD_ALIASES.iban,
  description: FIELD_ALIASES.description
}

const DATE_TOKEN_PATTERN = /\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g
const INVOICE_KEYWORD_PATTERNS: Array<{ label: string, pattern: RegExp }> = [
  { label: 'Faktura', pattern: /\bfaktura\b/i },
  { label: 'Faktura - daňový doklad', pattern: /\bfaktura\s*-\s*daňový\s+doklad\b/i },
  { label: 'daňový doklad', pattern: /\bdaňový\s+doklad\b/i },
  { label: 'Invoice', pattern: /\binvoice\b/i },
  { label: 'Invoice No', pattern: /\binvoice\s*(?:no|number)\b/i },
  { label: 'Číslo faktury', pattern: /\bčíslo\s+faktury\b/i },
  { label: 'Dodavatel', pattern: /\bdodavatel\b/i },
  { label: 'Odběratel', pattern: /\bodběratel\b/i },
  { label: 'Datum vystavení', pattern: /datum\s+vystavení/iu },
  { label: 'Datum splatnosti', pattern: /\bdatum\s+splatnosti\b/i },
  { label: 'Datum zdanitelného plnění', pattern: /datum\s+zdanitelného\s+plnění/iu },
  { label: 'Forma úhrady', pattern: /\bforma\s+úhrady\b/i },
  { label: 'Rozpis DPH', pattern: /\brozpis\s+dph\b/i },
  { label: 'K úhradě', pattern: /k\s+úhradě/iu },
  { label: 'Celkem Kč k úhradě', pattern: /\bcelkem(?:\s+kč)?\s+k\s+úhrad[ěe]\b/i },
  { label: 'Celkem po zaokrouhlení', pattern: /celkem\s+po\s+zaokrouhlen[íi]/iu },
  { label: 'IBAN', pattern: /\biban\b/i },
  { label: 'IČ / DIČ', pattern: /\b(?:ič|ičo|dič)\b/i }
]

export class InvoiceDocumentParser {
  parse(input: ParseInvoiceDocumentInput): ExtractedRecord[] {
    const extracted = extractInvoiceDocumentDetails(input.content).fields
    const missing = collectMissingInvoiceFields(extracted)

    if (missing.length > 0) {
      throw new Error(`Invoice document is missing required fields: ${missing.join(', ')}`)
    }

    const issueDate = safeNormalizeDocumentDate(extracted.issueDateRaw, 'Invoice issue date')
      ?? normalizeDocumentDate(extracted.taxableDateRaw!, 'Invoice taxable date')
    const dueDate = normalizeDocumentDate(extracted.dueDateRaw!, 'Invoice due date')
    const taxableDate = safeNormalizeDocumentDate(extracted.taxableDateRaw, 'Invoice taxable date')
    const total = parseDocumentMoney(extracted.totalRaw!, 'Invoice total')
    const vatBase = safeParseDocumentMoney(extracted.vatBaseRaw, 'Invoice VAT base')
    const vat = safeParseDocumentMoney(extracted.vatRaw, 'Invoice VAT')
    const ibanHint = normalizeIbanValue(extracted.ibanValue)

    const record: ExtractedRecord = {
      id: 'invoice-record-1',
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'invoice-document',
      extractedAt: input.extractedAt,
      rawReference: extracted.invoiceNumber,
      amountMinor: total.amountMinor,
      currency: total.currency,
      occurredAt: issueDate,
      data: {
        sourceSystem: 'invoice',
        invoiceNumber: extracted.invoiceNumber,
        supplier: extracted.supplier,
        ...(extracted.customer ? { customer: extracted.customer } : {}),
        issueDate,
        dueDate,
        ...(taxableDate ? { taxableDate } : {}),
        amountMinor: total.amountMinor,
        currency: total.currency,
        ...(extracted.paymentMethod ? { paymentMethod: extracted.paymentMethod } : {}),
        ...(extracted.description ? { description: extracted.description } : {}),
        ...(vatBase ? { vatBaseAmountMinor: vatBase.amountMinor, vatBaseCurrency: vatBase.currency } : {}),
        ...(vat ? { vatAmountMinor: vat.amountMinor, vatCurrency: vat.currency } : {}),
        ...(ibanHint ? { ibanHint } : {})
      }
    }

    return [record]
  }
}

const defaultInvoiceDocumentParser = new InvoiceDocumentParser()

export function parseInvoiceDocument(input: ParseInvoiceDocumentInput): ExtractedRecord[] {
  return defaultInvoiceDocumentParser.parse(input)
}

export function inspectInvoiceDocumentExtractionSummary(content: string): DeterministicDocumentExtractionSummary {
  const extraction = extractInvoiceDocumentDetails(content)
  const extracted = extraction.fields
  const missingRequiredFields = collectMissingInvoiceSummaryFields(extracted)
  const issueDate = safeNormalizeDocumentDate(extracted.issueDateRaw, 'Invoice issue date')
  const taxableDate = safeNormalizeDocumentDate(extracted.taxableDateRaw, 'Invoice taxable date')
  const dueDate = safeNormalizeDocumentDate(extracted.dueDateRaw, 'Invoice due date')
  const total = safeParseDocumentMoney(extracted.totalRaw, 'Invoice total')
  const vatBase = safeParseDocumentMoney(extracted.vatBaseRaw, 'Invoice VAT base')
  const vat = safeParseDocumentMoney(extracted.vatRaw, 'Invoice VAT')
  const ibanHint = normalizeIbanValue(extracted.ibanValue)
  const hasMeaningfulFields = Boolean(
    extracted.invoiceNumber
    || extracted.supplier
    || extracted.customer
    || extracted.issueDateRaw
    || extracted.taxableDateRaw
    || extracted.dueDateRaw
    || extracted.totalRaw
    || extracted.paymentMethod
    || extracted.vatBaseRaw
    || extracted.vatRaw
    || extracted.ibanValue
    || extracted.description
  )

  return {
    documentKind: 'invoice',
    sourceSystem: 'invoice',
    documentType: 'invoice',
    ...(extracted.supplier ? { issuerOrCounterparty: extracted.supplier } : {}),
    ...(extracted.customer ? { customer: extracted.customer } : {}),
    ...(issueDate ? { issueDate } : {}),
    ...(taxableDate ? { taxableDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(extracted.paymentMethod ? { paymentMethod: extracted.paymentMethod } : {}),
    ...(total ? { totalAmountMinor: total.amountMinor, totalCurrency: total.currency } : {}),
    ...(vatBase ? { vatBaseAmountMinor: vatBase.amountMinor, vatBaseCurrency: vatBase.currency } : {}),
    ...(vat ? { vatAmountMinor: vat.amountMinor, vatCurrency: vat.currency } : {}),
    ...(extracted.invoiceNumber ? { referenceNumber: extracted.invoiceNumber } : {}),
    ...(ibanHint ? { ibanHint } : {}),
    confidence: missingRequiredFields.length === 0
      ? 'strong'
      : hasMeaningfulFields
        ? 'hint'
        : 'none',
    missingRequiredFields,
    ...(extraction.groupedHeaderLabels.length > 0 ? { groupedHeaderLabels: extraction.groupedHeaderLabels } : {}),
    ...(extraction.groupedHeaderValues.length > 0 ? { groupedHeaderValues: extraction.groupedHeaderValues } : {}),
    ...(extraction.groupedTotalsLabels.length > 0 ? { groupedTotalsLabels: extraction.groupedTotalsLabels } : {}),
    ...(extraction.groupedTotalsValues.length > 0 ? { groupedTotalsValues: extraction.groupedTotalsValues } : {}),
    ...(extraction.groupedHeaderBlockDebug.length > 0 ? { groupedHeaderBlockDebug: extraction.groupedHeaderBlockDebug } : {}),
    ...(extraction.groupedTotalsBlockDebug.length > 0 ? { groupedTotalsBlockDebug: extraction.groupedTotalsBlockDebug } : {}),
    ...(extraction.rawBlockDiscoveryDebug.length > 0 ? { rawBlockDiscoveryDebug: extraction.rawBlockDiscoveryDebug } : {}),
    fieldExtractionDebug: extraction.fieldDebug
  }
}

export function detectInvoiceDocumentKeywordHits(content: string): string[] {
  return INVOICE_KEYWORD_PATTERNS
    .filter(({ pattern }) => pattern.test(content))
    .map(({ label }) => label)
}

function extractInvoiceDocumentDetails(content: string): InvoiceDocumentExtractionDetails {
  const fields = parseLabeledDocumentText(content)
  const lines = splitDocumentLines(content)
  const debugStates = buildInvoiceFieldDebugStates()
  const groupedHeaderSelection = selectBestInvoiceHeaderBlock(lines, debugStates)
  const groupedTotalsSelection = selectBestInvoiceTotalsBlock(lines, debugStates)
  const groupedHeaderBlock = groupedHeaderSelection.block
  const groupedTotalsBlock = groupedTotalsSelection.block
  const rawBlockDiscoveryDebug = collectInvoiceRawBlockDiscovery(lines, groupedHeaderSelection.debug, groupedTotalsSelection.debug)

  collectFieldSpecificInvoiceHeaderCandidates(lines, debugStates)
  collectFieldSpecificInvoiceReferenceCandidates(lines, debugStates)
  collectFieldSpecificPayableTotalCandidates(lines, debugStates)
  collectFieldSpecificVatCandidates(lines, debugStates)
  collectLineWindowInvoiceCandidates(lines, debugStates)
  collectFallbackInvoiceCandidates(fields, content, debugStates)

  const extracted = {
    invoiceNumber: resolveInvoiceField('referenceNumber', debugStates.referenceNumber),
    supplier: resolveInvoiceField('issuerOrCounterparty', debugStates.issuerOrCounterparty),
    customer: resolveInvoiceField('customer', debugStates.customer),
    issueDateRaw: resolveInvoiceField('issueDate', debugStates.issueDate),
    dueDateRaw: resolveInvoiceField('dueDate', debugStates.dueDate),
    taxableDateRaw: resolveInvoiceField('taxableDate', debugStates.taxableDate),
    totalRaw: resolveInvoiceField('totalAmount', debugStates.totalAmount, ['lineWindowCandidates', 'groupedCandidates', 'fallbackCandidates']),
    paymentMethod: normalizePaymentMethodValue(resolveInvoiceField('paymentMethod', debugStates.paymentMethod)),
    description: resolveInvoiceField('description', debugStates.description),
    vatBaseRaw: resolveInvoiceField('vatBaseAmount', debugStates.vatBaseAmount),
    vatRaw: resolveInvoiceField('vatAmount', debugStates.vatAmount),
    ibanValue: normalizeIbanValue(resolveInvoiceField('ibanHint', debugStates.ibanHint))
  }

  return {
    fields: extracted,
    groupedHeaderLabels: groupedHeaderBlock?.labels ?? [],
    groupedHeaderValues: groupedHeaderBlock?.values ?? [],
    groupedTotalsLabels: groupedTotalsBlock?.labels ?? [],
    groupedTotalsValues: groupedTotalsBlock?.values ?? [],
    groupedHeaderBlockDebug: groupedHeaderSelection.debug,
    groupedTotalsBlockDebug: groupedTotalsSelection.debug,
    rawBlockDiscoveryDebug,
    fieldDebug: Object.fromEntries(
      Object.entries(debugStates).map(([key, state]) => [key, {
        winnerRule: state.winnerRule,
        winnerValue: state.winnerValue,
        candidateValues: state.candidateValues,
        rejectedCandidates: state.rejectedCandidates,
        groupedRowMatches: state.groupedRowMatches,
        lineWindowMatches: state.lineWindowMatches,
        fullDocumentFallbackMatches: state.fullDocumentFallbackMatches
      } satisfies DeterministicDocumentFieldExtractionDebug])
    ) as Record<InvoiceSummaryFieldKey, DeterministicDocumentFieldExtractionDebug>
  }
}

function pickDocumentField(
  fields: Record<string, string>,
  content: string,
  aliases: string[],
  patterns: RegExp[],
  fallbackValue?: string
): string | undefined {
  const direct = pickRequiredField(fields, aliases)

  if (direct?.trim()) {
    return stripTrailingNoise(direct.trim())
  }

  for (const pattern of patterns) {
    const match = pattern.exec(content)
    const value = match?.[1]?.trim()

    if (value) {
      return stripTrailingNoise(value)
    }
  }

  return fallbackValue ? stripTrailingNoise(fallbackValue) : undefined
}

function pickMoneyDocumentField(
  fields: Record<string, string>,
  content: string,
  aliases: string[],
  patterns: RegExp[],
  fallbackValue?: string
): string | undefined {
  const direct = pickRequiredField(fields, aliases)
  const directValue = normalizeDetectedMoneyValue(stripTrailingNoise(direct?.trim() ?? ''))

  if (safeParseDocumentMoney(directValue, 'Invoice money field')) {
    return directValue
  }

  for (const pattern of patterns) {
    const match = pattern.exec(content)
    const candidate = normalizeDetectedMoneyValue(stripTrailingNoise(match?.[1]?.trim() ?? ''))

    if (safeParseDocumentMoney(candidate, 'Invoice money field')) {
      return candidate
    }
  }

  const normalizedFallback = normalizeDetectedMoneyValue(stripTrailingNoise(fallbackValue ?? ''))
  return safeParseDocumentMoney(normalizedFallback, 'Invoice money field') ? normalizedFallback : undefined
}

function collectMissingInvoiceFields(extracted: InvoiceExtractedFields): string[] {
  return REQUIRED_FIELDS.filter((field) => {
    switch (field) {
      case 'Invoice No':
        return !extracted.invoiceNumber
      case 'Supplier':
        return !extracted.supplier
      case 'Issue date':
        return !extracted.issueDateRaw && !extracted.taxableDateRaw
      case 'Due date':
        return !extracted.dueDateRaw
      case 'Total':
        return !safeParseDocumentMoney(extracted.totalRaw, 'Invoice total')
      default:
        return false
    }
  })
}

function collectMissingInvoiceSummaryFields(extracted: InvoiceExtractedFields): string[] {
  const missing: string[] = []

  if (!extracted.invoiceNumber?.trim()) {
    missing.push('referenceNumber')
  }

  if (!extracted.supplier?.trim()) {
    missing.push('issuerOrCounterparty')
  }

  if (
    !safeNormalizeDocumentDate(extracted.issueDateRaw, 'Invoice issue date')
    && !safeNormalizeDocumentDate(extracted.taxableDateRaw, 'Invoice taxable date')
  ) {
    missing.push('issueDate')
  }

  if (!safeNormalizeDocumentDate(extracted.dueDateRaw, 'Invoice due date')) {
    missing.push('dueDate')
  }

  if (!safeParseDocumentMoney(extracted.totalRaw, 'Invoice total')) {
    missing.push('totalAmount')
  }

  return missing
}

function stripTrailingNoise(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[;,:-]\s*$/, '')
    .trim()
}

function normalizeDetectedMoneyValue(value: string | undefined): string | undefined {
  if (!value) {
    return value
  }

  if (
    /[€$]|(?:\bCZK\b|\bEUR\b|\bUSD\b|\bKč\b|\bKČ\b|\bKc\b|\bKC\b)/iu.test(value)
    || !/^-?[\d\s]+(?:[.,]\d{2})?$/.test(value)
  ) {
    return value
  }

  return `${value} CZK`
}

function normalizeIbanValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value
    .replace(/[^0-9A-Z]/gi, '')
    .toUpperCase()

  return normalized.length >= 10 ? normalized : undefined
}

function normalizePaymentMethodValue(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined
  }

  const normalized = value.trim().replace(/\s+/g, ' ')

  return normalized
    .replace(/^Přev\.\s*příkaz$/iu, 'Přev. příkaz')
    .replace(/^Prev\.\s*prikaz$/iu, 'Přev. příkaz')
}

function buildInvoiceFieldDebugStates(): Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState> {
  return {
    referenceNumber: createInvoiceFieldDebugState(),
    issuerOrCounterparty: createInvoiceFieldDebugState(),
    customer: createInvoiceFieldDebugState(),
    issueDate: createInvoiceFieldDebugState(),
    dueDate: createInvoiceFieldDebugState(),
    taxableDate: createInvoiceFieldDebugState(),
    paymentMethod: createInvoiceFieldDebugState(),
    totalAmount: createInvoiceFieldDebugState(),
    vatBaseAmount: createInvoiceFieldDebugState(),
    vatAmount: createInvoiceFieldDebugState(),
    ibanHint: createInvoiceFieldDebugState(),
    description: createInvoiceFieldDebugState()
  }
}

function createInvoiceFieldDebugState(): InvoiceFieldDebugState {
  return {
    winnerRule: undefined,
    winnerValue: undefined,
    candidateValues: [],
    rejectedCandidates: [],
    groupedRowMatches: [],
    lineWindowMatches: [],
    fullDocumentFallbackMatches: [],
    groupedCandidates: [],
    lineWindowCandidates: [],
    fallbackCandidates: []
  }
}

function collectInvoiceRawBlockDiscovery(
  lines: string[],
  headerCandidates: DeterministicDocumentGroupedBlockDebug[],
  totalsCandidates: DeterministicDocumentGroupedBlockDebug[]
): DeterministicDocumentRawBlockDebug[] {
  const blocks: DeterministicDocumentRawBlockDebug[] = []
  const labelTargets = [
    'faktura cislo',
    'cislo faktury',
    'doklad cislo',
    'forma uhrady',
    'datum vystaveni',
    'datum zdanitelneho plneni',
    'datum splatnosti',
    'celkem kc k uhrade',
    'celkem k uhrade',
    'k uhrade',
    'celkem po zaokrouhleni',
    'zaklad dph',
    'dph'
  ]

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeLabelSearch(lines[index]!)

    if (!labelTargets.some((target) => normalized.includes(target))) {
      continue
    }

    const rawLines = lines.slice(index, Math.min(lines.length, index + 4)).map((line) => stripTrailingNoise(line))
    const normalizedLines = rawLines.map((line) => normalizeLabelSearch(line))
    const blockTypeGuess = guessInvoiceRawBlockType(normalizedLines)
    const promotedCandidate = [...headerCandidates, ...totalsCandidates].find((candidate) => {
      const candidateLabels = candidate.labels.map((label) => normalizeLabelSearch(label))
      return candidateLabels.some((label) => normalizedLines.includes(label))
    })

    blocks.push({
      blockIndex: index,
      rawLines,
      normalizedLines,
      blockTypeGuess,
      ...(promotedCandidate ? { promotedTo: promotedCandidate.accepted ? promotedCandidate.blockTypeCandidate : undefined } : {}),
      promotionDecision: promotedCandidate
        ? promotedCandidate.accepted
          ? `promoted:${promotedCandidate.blockTypeCandidate}`
          : `rejected:${promotedCandidate.rejectionReason ?? 'no-match'}`
        : 'not-promoted'
    })
  }

  return dedupeInvoiceRawBlocks(blocks)
}

function dedupeInvoiceRawBlocks(blocks: DeterministicDocumentRawBlockDebug[]): DeterministicDocumentRawBlockDebug[] {
  const seen = new Set<string>()
  const deduped: DeterministicDocumentRawBlockDebug[] = []

  for (const block of blocks) {
    const key = `${block.blockIndex}:${block.normalizedLines.join('|')}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(block)
  }

  return deduped
}

function guessInvoiceRawBlockType(normalizedLines: string[]): string {
  const joined = normalizedLines.join(' | ')

  if (joined.includes('faktura cislo') || joined.includes('cislo faktury') || joined.includes('doklad cislo')) {
    return 'header-reference'
  }

  if (joined.includes('forma uhrady') || joined.includes('datum vystaveni') || joined.includes('datum zdanitelneho plneni') || joined.includes('datum splatnosti')) {
    return 'dates-payment'
  }

  if (joined.includes('celkem kc k uhrade') || joined.includes('celkem k uhrade') || joined.includes('k uhrade') || joined.includes('celkem po zaokrouhleni')) {
    return 'totals-payable'
  }

  if (joined.includes('zaklad dph') || joined.includes('dph')) {
    return 'totals-vat'
  }

  return 'other'
}

function selectBestInvoiceHeaderBlock(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): {
  block?: StructuredGroupedInvoiceHeaderBlock
  debug: DeterministicDocumentGroupedBlockDebug[]
} {
  const candidates = [
    ...collectStructuredGroupedInvoiceHeaderBlockCandidates(lines),
    ...collectVerticalGroupedInvoiceHeaderBlockCandidates(lines),
    ...collectSequentialInvoiceBlockCandidates(lines).headerCandidates
  ]
  const winner = selectBestGroupedBlockCandidate(candidates)

  if (winner) {
    recordGroupedBlockWinner(debugStates, winner)
  }

  return {
    block: winner ? { labels: winner.labels, values: winner.values } : undefined,
    debug: candidates.map(toGroupedBlockDebug)
  }
}

function selectBestInvoiceTotalsBlock(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): {
  block?: StructuredGroupedInvoiceTotalsBlock
  debug: DeterministicDocumentGroupedBlockDebug[]
} {
  const candidates = [
    ...collectStructuredGroupedInvoiceTotalsBlockCandidates(lines),
    ...collectVerticalGroupedInvoiceTotalsBlockCandidates(lines),
    ...collectSequentialInvoiceBlockCandidates(lines).totalsCandidates
  ]
  const winner = selectBestGroupedBlockCandidate(candidates)

  if (winner) {
    recordGroupedBlockWinner(debugStates, winner)
  }

  return {
    block: winner ? { labels: winner.labels, values: winner.values } : undefined,
    debug: candidates.map(toGroupedBlockDebug)
  }
}

function collectFieldSpecificInvoiceHeaderCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  collectStructuredDatePaymentCandidates(lines, debugStates)
  collectCompositeGroupedDatePaymentCandidates(lines, debugStates)
  collectAnchoredInvoiceHeaderWindowCandidates(lines, debugStates)

  const fieldKeys: InvoiceSummaryFieldKey[] = ['paymentMethod', 'issueDate', 'taxableDate', 'dueDate']

  for (const fieldKey of fieldKeys) {
    const rankedCandidates = rankFieldSpecificLabelCandidates(lines, fieldKey)

    for (const candidate of rankedCandidates) {
      recordInvoiceFieldAttempt(
        debugStates[fieldKey],
        'grouped',
        candidate.value,
        'field-specific-labeled-window',
        candidate.trace,
        isValidInvoiceFieldValue(fieldKey, candidate.value)
      )
    }
  }
}

function collectStructuredDatePaymentCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const orderedKeys = extractOrderedGroupedInvoiceHeaderFieldKeys(lines[index]!)

    if (orderedKeys.length < 3 || !orderedKeys.includes('paymentMethod')) {
      continue
    }

    const valueLines = collectInvoiceValueLines(lines, index + 1, 4)
      .filter((line) => !containsInvoicePageArtifactValue(line))

    if (valueLines.length === 0) {
      continue
    }

    const trace = `${orderedKeys.map((fieldKey) => groupedInvoiceFieldLabel(fieldKey)).join(' | ')} => ${valueLines.join(' | ')}`
    const valueMap = buildStructuredDatePaymentValueMap(orderedKeys, valueLines)

    for (const fieldKey of orderedKeys) {
      const candidate = valueMap[fieldKey]
      recordInvoiceFieldAttempt(
        debugStates[fieldKey],
        'grouped',
        candidate,
        'structured-combined-date-payment-row',
        `${trace} | ${fieldKey} => ${candidate ?? 'n/a'}`,
        isValidInvoiceFieldValue(fieldKey, candidate)
      )
    }
  }
}

function collectCompositeGroupedDatePaymentCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const orderedKeys = collectConsecutiveGroupedFieldKeys(lines, index, ['dueDate', 'paymentMethod', 'issueDate', 'taxableDate'])

    if (orderedKeys.length < 3 || !orderedKeys.includes('paymentMethod')) {
      continue
    }

    const valueLines = collectInvoiceValueLines(lines, index + orderedKeys.length, 3)
      .filter((line) => !containsInvoicePageArtifactValue(line))

    if (valueLines.length === 0) {
      continue
    }

    const trace = `${orderedKeys.map((fieldKey) => groupedInvoiceFieldLabel(fieldKey)).join(' | ')} => ${valueLines.join(' | ')}`
    const valueMap = buildCompositeGroupedDatePaymentValueMap(orderedKeys, valueLines.join(' '))

    for (const fieldKey of orderedKeys) {
      const candidate = valueMap[fieldKey]
      recordInvoiceFieldAttempt(
        debugStates[fieldKey],
        'grouped',
        candidate,
        'grouped-combined-date-payment-row',
        `${trace} | ${fieldKey} => ${candidate ?? 'n/a'}`,
        isValidInvoiceFieldValue(fieldKey, candidate)
      )
    }
  }
}

function collectAnchoredInvoiceHeaderWindowCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const labelSpan = detectCompositeReferenceLabelSpan(lines, index)

    if (!labelSpan) {
      continue
    }

    const referenceMatch = findAnchoredReferenceMatch(lines, labelSpan.endIndex)

    if (!referenceMatch) {
      continue
    }

    const tracePrefix = `${labelSpan.rawLabel} => ${referenceMatch.value}`
    recordInvoiceFieldAttempt(
      debugStates.referenceNumber,
      'grouped',
      referenceMatch.value,
      'anchored-header-window',
      tracePrefix,
      isValidInvoiceFieldValue('referenceNumber', referenceMatch.value)
    )

    const headerWindowLines = collectAnchoredHeaderWindowLines(lines, referenceMatch.lineIndex)
    const paymentMethodCandidate = extractAnchoredPaymentMethodCandidate(headerWindowLines, referenceMatch.value)
    recordInvoiceFieldAttempt(
      debugStates.paymentMethod,
      'grouped',
      paymentMethodCandidate,
      'anchored-header-window',
      `${tracePrefix} | payment => ${paymentMethodCandidate ?? 'n/a'}`,
      isValidInvoiceFieldValue('paymentMethod', paymentMethodCandidate)
    )

    const dateCandidates = extractAnchoredHeaderDateCandidates(headerWindowLines)
    const dateFieldKeys: InvoiceSummaryFieldKey[] = ['issueDate', 'taxableDate', 'dueDate']

    dateFieldKeys.forEach((fieldKey, position) => {
      const candidate = dateCandidates[position]
      recordInvoiceFieldAttempt(
        debugStates[fieldKey],
        'grouped',
        candidate,
        'anchored-header-window',
        `${tracePrefix} | ${fieldKey} => ${candidate ?? 'n/a'}`,
        isValidInvoiceFieldValue(fieldKey, candidate)
      )
    })
  }
}

function collectFieldSpecificInvoiceReferenceCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeLabelSearch(lines[index]!)

    if (!isInvoiceReferenceLabel(normalized)) {
      continue
    }

    const sameLineCandidate = extractReferenceCandidateAfterLabel(lines[index]!)
    const sameLineTrace = `${stripTrailingNoise(lines[index]!)} => ${sameLineCandidate ?? 'n/a'}`
    recordInvoiceFieldAttempt(
      debugStates.referenceNumber,
      'lineWindow',
      sameLineCandidate,
      'field-specific-reference-label',
      sameLineTrace,
      isValidInvoiceFieldValue('referenceNumber', sameLineCandidate)
    )

    for (let lookahead = 1; lookahead <= 12 && index + lookahead < lines.length; lookahead += 1) {
      const candidateLine = stripTrailingNoise(lines[index + lookahead]!)

      if (containsInvoicePageArtifactValue(candidateLine)) {
        continue
      }

      if (lookahead > 1 && isInvoiceSectionBoundary(candidateLine)) {
        break
      }

      const candidate = extractFirstInvoiceReferenceCandidate(candidateLine)
      const trace = `${stripTrailingNoise(lines[index]!)} -> ${candidateLine}`

      recordInvoiceFieldAttempt(
        debugStates.referenceNumber,
        'lineWindow',
        candidate,
        'field-specific-reference-window',
        trace,
        isValidInvoiceFieldValue('referenceNumber', candidate)
      )

      if (candidate) {
        break
      }
    }
  }
}

function collectFieldSpecificPayableTotalCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  const payableLabelSpans = collectCompositePayableLabelSpans(lines)
  const explicitPayableLabelSpans = payableLabelSpans.filter((span) => span.priority > 1)
  const candidateSpans = explicitPayableLabelSpans.length > 0
    ? explicitPayableLabelSpans
    : payableLabelSpans

  for (const span of candidateSpans) {
    const normalized = span.normalizedLabel
    const previousNormalized = span.startIndex > 0
      ? normalizeLabelSearch(lines[span.startIndex - 1]!)
      : ''
    const sameLineMoney = extractPayableMoneyCandidateFromLine(span.rawLabel)
    const sameLineTrace = `${span.rawLabel} => ${sameLineMoney ?? 'n/a'}`
    recordInvoiceFieldAttempt(
      debugStates.totalAmount,
      'lineWindow',
      sameLineMoney,
      'field-specific-payable-total',
      sameLineTrace,
      isValidInvoiceFieldValue('totalAmount', sameLineMoney)
    )

    for (let lookahead = 1; lookahead <= 4 && span.endIndex + lookahead < lines.length; lookahead += 1) {
      const candidateLine = stripTrailingNoise(lines[span.endIndex + lookahead]!)
      const nextLine = span.endIndex + lookahead + 1 < lines.length
        ? stripTrailingNoise(lines[span.endIndex + lookahead + 1]!)
        : ''
      const trace = `${span.rawLabel} -> ${candidateLine}`

      if (containsInvoicePageArtifactValue(candidateLine) || /záloh?\s+celkem/iu.test(candidateLine)) {
        recordInvoiceFieldAttempt(
          debugStates.totalAmount,
          'lineWindow',
          candidateLine,
          'field-specific-payable-total',
          trace,
          false
        )
        continue
      }

      if (
        normalized === 'celkem po zaokrouhleni'
        && (
          previousNormalized === 'dph'
          || previousNormalized === 'zaklad dph'
          || /záloh?\s+celkem/iu.test(nextLine)
        )
      ) {
        recordInvoiceFieldAttempt(
          debugStates.totalAmount,
          'lineWindow',
          candidateLine,
          'field-specific-payable-total',
          trace,
          false
        )
        break
      }

      if (lookahead > 1 && isInvoiceSectionBoundary(candidateLine)) {
        break
      }

      const candidate = extractPayableMoneyCandidateFromLine(candidateLine)
      recordInvoiceFieldAttempt(
        debugStates.totalAmount,
        'lineWindow',
        candidate,
        'field-specific-payable-total',
        trace,
        isValidInvoiceFieldValue('totalAmount', candidate)
      )

      if (candidate) {
        break
      }
    }
  }

  collectSummaryTotalCandidates(lines, debugStates)
}

function collectSummaryTotalCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeLabelSearch(lines[index]!)

    if (normalized !== 's dph' && !normalized.startsWith('s dph ')) {
      continue
    }

    const valueLines = [
      stripTrailingNoise(lines[index]!),
      ...collectInvoiceValueLines(lines, index + 1, 4)
    ].filter((line) => !containsInvoicePageArtifactValue(line))

    if (valueLines.length === 0) {
      continue
    }

    const moneyTokens = valueLines.flatMap((line) => extractLooseMoneyTokens(line, true))

    if (moneyTokens.length === 0) {
      continue
    }

    const winnerIndex = moneyTokens.length - 1
    moneyTokens.forEach((token, tokenIndex) => {
      recordInvoiceFieldAttempt(
        debugStates.totalAmount,
        'lineWindow',
        token,
        'field-specific-summary-total',
        `${stripTrailingNoise(lines[index]!)} => ${valueLines.join(' | ')} | ${token}`,
        tokenIndex === winnerIndex && isValidInvoiceFieldValue('totalAmount', token)
      )
    })
  }
}

function collectFieldSpecificVatCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeLabelSearch(lines[index]!)

    if (normalized !== 'dph' && normalized !== 'vat') {
      continue
    }

    const sameLineMoney = extractGenericMoneyCandidateFromLine(lines[index]!)
    const sameLineTrace = `${stripTrailingNoise(lines[index]!)} => ${sameLineMoney ?? 'n/a'}`
    recordInvoiceFieldAttempt(
      debugStates.vatAmount,
      'lineWindow',
      sameLineMoney,
      'field-specific-vat-window',
      sameLineTrace,
      isValidInvoiceFieldValue('vatAmount', sameLineMoney)
    )

    for (let lookahead = 1; lookahead <= 2 && index + lookahead < lines.length; lookahead += 1) {
      const candidateLine = stripTrailingNoise(lines[index + lookahead]!)
      const detectedField = detectInvoiceSummaryFieldKey(candidateLine)
      const trace = `${stripTrailingNoise(lines[index]!)} -> ${candidateLine}`

      if (containsInvoicePageArtifactValue(candidateLine) || /záloh?\s+celkem/iu.test(candidateLine)) {
        recordInvoiceFieldAttempt(
          debugStates.vatAmount,
          'lineWindow',
          candidateLine,
          'field-specific-vat-window',
          trace,
          false
        )
        continue
      }

      if (detectedField && detectedField !== 'vatAmount') {
        recordInvoiceFieldAttempt(
          debugStates.vatAmount,
          'lineWindow',
          candidateLine,
          'field-specific-vat-window',
          trace,
          false
        )
        break
      }

      if (lookahead > 1 && isInvoiceSectionBoundary(candidateLine)) {
        break
      }

      const candidate = extractGenericMoneyCandidateFromLine(candidateLine)
      recordInvoiceFieldAttempt(
        debugStates.vatAmount,
        'lineWindow',
        candidate,
        'field-specific-vat-window',
        trace,
        isValidInvoiceFieldValue('vatAmount', candidate)
      )

      if (candidate) {
        break
      }
    }
  }
}

function collectStructuredGroupedInvoiceHeaderBlockCandidates(
  lines: string[]
): InvoiceGroupedBlockCandidate[] {
  const candidates: InvoiceGroupedBlockCandidate[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const orderedKeys = extractOrderedGroupedInvoiceHeaderFieldKeys(lines[index]!)

    if (orderedKeys.length < 3) {
      continue
    }

    const block = buildStructuredGroupedInvoiceHeaderBlock(lines, index, orderedKeys)

    if (!block) {
      continue
    }

    candidates.push(evaluateInvoiceHeaderBlockCandidate({
      blockTypeCandidate: 'structured-grouped-header-block',
      orderedKeys,
      labels: block.labels,
      values: block.values,
      score: 0,
      accepted: false,
      winnerRule: 'structured-grouped-header-block',
      trace: `${block.labels.join(' | ')} => ${block.values.join(' | ')}`
    }))
  }

  return candidates
}

function collectStructuredGroupedInvoiceTotalsBlockCandidates(
  lines: string[]
): InvoiceGroupedBlockCandidate[] {
  const candidates: InvoiceGroupedBlockCandidate[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const orderedKeys = extractOrderedGroupedInvoiceTotalsFieldKeys(lines[index]!)

    if (orderedKeys.length < 2) {
      continue
    }

    const block = buildStructuredGroupedInvoiceTotalsBlock(lines, index, orderedKeys)

    if (!block) {
      continue
    }

    candidates.push(evaluateInvoiceTotalsBlockCandidate({
      blockTypeCandidate: 'structured-grouped-totals-block',
      orderedKeys,
      labels: block.labels,
      values: block.values,
      score: 0,
      accepted: false,
      winnerRule: 'structured-grouped-totals-block',
      trace: `${block.labels.join(' | ')} => ${block.values.join(' | ')}`
    }))
  }

  return candidates
}

function collectVerticalGroupedInvoiceHeaderBlockCandidates(
  lines: string[]
): InvoiceGroupedBlockCandidate[] {
  const candidates: InvoiceGroupedBlockCandidate[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const orderedKeys = collectConsecutiveGroupedFieldKeys(lines, index, ['referenceNumber', 'paymentMethod', 'issueDate', 'taxableDate', 'dueDate'])

    if (orderedKeys.length < 2) {
      continue
    }

    const block = buildVerticalGroupedInvoiceHeaderBlock(lines, index + orderedKeys.length, orderedKeys)

    if (!block) {
      continue
    }

    candidates.push(evaluateInvoiceHeaderBlockCandidate({
      blockTypeCandidate: 'vertical-structured-header-block',
      orderedKeys,
      labels: block.labels,
      values: block.values,
      score: 0,
      accepted: false,
      winnerRule: 'vertical-structured-header-block',
      trace: `${block.labels.join(' | ')} => ${block.values.join(' | ')}`
    }))
  }

  return candidates
}

function collectVerticalGroupedInvoiceTotalsBlockCandidates(
  lines: string[]
): InvoiceGroupedBlockCandidate[] {
  const candidates: InvoiceGroupedBlockCandidate[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const orderedKeys = collectConsecutiveGroupedFieldKeys(lines, index, ['vatBaseAmount', 'vatAmount', 'totalAmount'])

    if (orderedKeys.length < 2) {
      continue
    }

    const block = buildVerticalGroupedInvoiceTotalsBlock(lines, index + orderedKeys.length, orderedKeys)

    if (!block) {
      continue
    }

    candidates.push(evaluateInvoiceTotalsBlockCandidate({
      blockTypeCandidate: 'vertical-structured-totals-block',
      orderedKeys,
      labels: block.labels,
      values: block.values,
      score: 0,
      accepted: false,
      winnerRule: 'vertical-structured-totals-block',
      trace: `${block.labels.join(' | ')} => ${block.values.join(' | ')}`
    }))
  }

  return candidates
}

function extractOrderedGroupedInvoiceHeaderFieldKeys(line: string): InvoiceSummaryFieldKey[] {
  return extractOrderedGroupedFieldKeys(line, ['referenceNumber', 'paymentMethod', 'issueDate', 'taxableDate', 'dueDate'])
}

function extractOrderedGroupedInvoiceTotalsFieldKeys(line: string): InvoiceSummaryFieldKey[] {
  return extractOrderedGroupedFieldKeys(line, ['vatBaseAmount', 'vatAmount', 'totalAmount'])
}

function extractOrderedGroupedFieldKeys(
  line: string,
  allowedKeys: InvoiceSummaryFieldKey[]
): InvoiceSummaryFieldKey[] {
  const normalizedLine = normalizeLabelSearch(line)
  const found = (Object.entries(SUMMARY_FIELD_ALIASES) as Array<[InvoiceSummaryFieldKey, string[]]>)
    .filter(([fieldKey]) => allowedKeys.includes(fieldKey))
    .flatMap(([fieldKey, aliases]) => aliases.map((alias) => {
      const normalizedAlias = normalizeLabelSearch(alias)
      const index = normalizedLine.indexOf(normalizedAlias)

      return index === -1 ? undefined : { fieldKey, index, alias }
    }))
    .filter((match): match is { fieldKey: InvoiceSummaryFieldKey; index: number; alias: string } => Boolean(match))
    .sort((left, right) => left.index - right.index)

  const orderedKeys: InvoiceSummaryFieldKey[] = []
  for (const match of found) {
    if (!orderedKeys.includes(match.fieldKey)) {
      orderedKeys.push(match.fieldKey)
    }
  }

  return orderedKeys
}

function buildStructuredGroupedInvoiceHeaderBlock(
  lines: string[],
  headerIndex: number,
  orderedKeys: InvoiceSummaryFieldKey[]
): StructuredGroupedInvoiceHeaderBlock | undefined {
  const labels = orderedKeys.map((fieldKey) => groupedInvoiceFieldLabel(fieldKey))
  const upcomingLines = collectInvoiceValueLines(lines, headerIndex + 1, 6)
  const valueMap = buildStructuredDatePaymentValueMap(orderedKeys, upcomingLines)
  const values = orderedKeys.map((fieldKey) => valueMap[fieldKey])

  return values.some((value) => Boolean(value))
    ? {
        labels,
        values: values.map((value) => value ?? 'n/a')
      }
    : undefined
}

function buildVerticalGroupedInvoiceHeaderBlock(
  lines: string[],
  valuesStartIndex: number,
  orderedKeys: InvoiceSummaryFieldKey[]
): StructuredGroupedInvoiceHeaderBlock | undefined {
  const labels = orderedKeys.map((fieldKey) => groupedInvoiceFieldLabel(fieldKey))
  const upcomingLines = collectInvoiceValueLines(lines, valuesStartIndex, 6)
  const joinedValues = upcomingLines.join(' ')
  const referenceCandidate = extractFirstInvoiceReferenceCandidate(joinedValues)
  const paymentMethodCandidate = extractGroupedPaymentMethodCandidate(joinedValues, referenceCandidate)
  const dateCandidates = extractDateTokens(joinedValues)

  const values = orderedKeys.map((fieldKey) => {
    switch (fieldKey) {
      case 'referenceNumber':
        return referenceCandidate
      case 'paymentMethod':
        return paymentMethodCandidate
      case 'issueDate':
        return dateCandidates[0]
      case 'taxableDate':
        return dateCandidates[1]
      case 'dueDate':
        return dateCandidates[2]
      default:
        return undefined
    }
  })

  return values.some((value) => Boolean(value))
    ? {
        labels,
        values: values.map((value) => value ?? 'n/a')
      }
    : undefined
}

function buildStructuredGroupedInvoiceTotalsBlock(
  lines: string[],
  headerIndex: number,
  orderedKeys: InvoiceSummaryFieldKey[]
): StructuredGroupedInvoiceTotalsBlock | undefined {
  const labels = orderedKeys.map((fieldKey) => groupedInvoiceFieldLabel(fieldKey))
  const upcomingLines = lines.slice(headerIndex + 1, headerIndex + 5)
  const moneyCandidates: string[] = []

  for (const line of upcomingLines) {
    if (isInvoiceSectionBoundary(line)) {
      break
    }

    for (const token of extractLooseMoneyTokens(line, true)) {
      if (!moneyCandidates.includes(token)) {
        moneyCandidates.push(token)
      }
    }
  }

  if (moneyCandidates.length < 3) {
    return undefined
  }

  const values = orderedKeys.map((fieldKey, index) => {
    if (fieldKey === 'totalAmount') {
      return moneyCandidates[moneyCandidates.length - 1]
    }

    return moneyCandidates[index]
  })

  return {
    labels,
    values: values.map((value) => value ?? 'n/a')
  }
}

function buildVerticalGroupedInvoiceTotalsBlock(
  lines: string[],
  valuesStartIndex: number,
  orderedKeys: InvoiceSummaryFieldKey[]
): StructuredGroupedInvoiceTotalsBlock | undefined {
  const labels = orderedKeys.map((fieldKey) => groupedInvoiceFieldLabel(fieldKey))
  const upcomingLines = collectInvoiceValueLines(lines, valuesStartIndex, 5)
  const moneyCandidates = upcomingLines.flatMap((line) => extractLooseMoneyTokens(line, true))

  if (moneyCandidates.length < 3) {
    return undefined
  }

  const values = orderedKeys.map((fieldKey, index) => {
    if (fieldKey === 'totalAmount') {
      return moneyCandidates[moneyCandidates.length - 1]
    }

    return moneyCandidates[index]
  })

  return {
    labels,
    values: values.map((value) => value ?? 'n/a')
  }
}

function groupedInvoiceFieldLabel(fieldKey: InvoiceSummaryFieldKey): string {
  switch (fieldKey) {
    case 'referenceNumber':
      return 'Faktura číslo'
    case 'paymentMethod':
      return 'Forma úhrady'
    case 'issueDate':
      return 'Datum vystavení'
    case 'taxableDate':
      return 'Datum zdanitelného plnění'
    case 'dueDate':
      return 'Datum splatnosti'
    case 'vatBaseAmount':
      return 'Základ DPH'
    case 'vatAmount':
      return 'DPH'
    case 'totalAmount':
      return 'Celkem po zaokrouhlení'
    default:
      return fieldKey
  }
}

function collectConsecutiveGroupedFieldKeys(
  lines: string[],
  startIndex: number,
  allowedKeys: InvoiceSummaryFieldKey[]
): InvoiceSummaryFieldKey[] {
  const orderedKeys: InvoiceSummaryFieldKey[] = []

  for (let index = startIndex; index < lines.length; index += 1) {
    const fieldKey = detectInvoiceSummaryFieldKey(lines[index]!)

    if (!fieldKey || !allowedKeys.includes(fieldKey) || orderedKeys.includes(fieldKey)) {
      break
    }

    orderedKeys.push(fieldKey)
  }

  return orderedKeys
}

function collectInvoiceValueLines(
  lines: string[],
  startIndex: number,
  lookaheadLimit: number
): string[] {
  const values: string[] = []

  for (let index = startIndex; index < lines.length && values.length < lookaheadLimit; index += 1) {
    const line = lines[index]!

    if (isInvoiceSectionBoundary(line)) {
      break
    }

    if (values.length > 0 && detectInvoiceSummaryFieldKey(line)) {
      break
    }

    values.push(stripTrailingNoise(line))
  }

  return values
}

function isInvoiceSectionBoundary(line: string): boolean {
  const normalized = normalizeLabelSearch(line)

  return normalized === 'iban'
    || normalized === 'iban '
    || normalized === 'rozpis dph'
    || normalized === 'celkem kc k uhrade'
    || normalized === 'k uhrade'
    || normalized === 'predmet plneni'
}

function extractFirstInvoiceReferenceCandidate(value: string): string | undefined {
  const compactValue = stripTrailingNoise(value)
    .replace(DATE_TOKEN_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const candidates = [
    ...Array.from(compactValue.matchAll(/\b(?:[A-Z]{0,6}[-/]?)?\d[A-Z0-9/-]{5,}\b/gi)),
    ...Array.from(compactValue.matchAll(/\b\d{3,}(?:\s+\d{3,})+\b/gu))
  ]
    .map((match) => normalizeInvoiceReferenceValue(match[0]))
    .filter((candidate): candidate is string => Boolean(candidate))

  return candidates[0]
}

function extractGroupedPaymentMethodCandidate(value: string, referenceNumber?: string): string | undefined {
  const normalizedValue = stripTrailingNoise(value)
  const firstDateIndex = normalizedValue.search(/\d{1,2}[./]\d{1,2}[./]\d{4}/)
  const prefix = firstDateIndex >= 0 ? normalizedValue.slice(0, firstDateIndex).trim() : normalizedValue
  const withoutReference = referenceNumber
    ? prefix.replace(referenceNumber, '').trim()
    : prefix

  return withoutReference.length > 0 ? withoutReference : undefined
}

function collectSequentialInvoiceBlockCandidates(
  lines: string[]
): {
  headerCandidates: InvoiceGroupedBlockCandidate[]
  totalsCandidates: InvoiceGroupedBlockCandidate[]
} {
  const headerCandidates: InvoiceGroupedBlockCandidate[] = []
  const totalsCandidates: InvoiceGroupedBlockCandidate[] = []

  for (let index = 0; index < lines.length - 1; index += 1) {
    const blockFields: InvoiceSummaryFieldKey[] = []
    const blockLabels: string[] = []
    let cursor = index

    while (cursor < lines.length) {
      const fieldKey = detectInvoiceSummaryFieldKey(lines[cursor]!)

      if (!fieldKey || blockFields.includes(fieldKey)) {
        break
      }

      blockFields.push(fieldKey)
      blockLabels.push(stripTrailingNoise(lines[cursor]!))
      cursor += 1
    }

    if (blockFields.length < 2) {
      continue
    }

    const values = collectSequentialInvoiceBlockValues(lines, cursor, blockFields.length)
    const trace = `${blockLabels.join(' | ')} => ${values.join(' | ')}`

    if (blockFields.every((fieldKey) => ['referenceNumber', 'paymentMethod', 'issueDate', 'taxableDate', 'dueDate'].includes(fieldKey))) {
      headerCandidates.push(evaluateInvoiceHeaderBlockCandidate({
        blockTypeCandidate: 'vertical-grouped-block',
        orderedKeys: blockFields,
        labels: blockFields.map((fieldKey) => groupedInvoiceFieldLabel(fieldKey)),
        values,
        score: 0,
        accepted: false,
        winnerRule: 'vertical-grouped-block',
        trace
      }))
    }

    if (blockFields.every((fieldKey) => ['vatBaseAmount', 'vatAmount', 'totalAmount'].includes(fieldKey))) {
      totalsCandidates.push(evaluateInvoiceTotalsBlockCandidate({
        blockTypeCandidate: 'vertical-grouped-block',
        orderedKeys: blockFields,
        labels: blockFields.map((fieldKey) => groupedInvoiceFieldLabel(fieldKey)),
        values,
        score: 0,
        accepted: false,
        winnerRule: 'vertical-grouped-block',
        trace
      }))
    }
  }

  return {
    headerCandidates,
    totalsCandidates
  }
}

function collectSequentialInvoiceBlockValues(
  lines: string[],
  startIndex: number,
  maxCount: number
): string[] {
  const values: string[] = []

  for (let index = startIndex; index < lines.length && values.length < maxCount; index += 1) {
    const line = lines[index]!

    if (detectInvoiceSummaryFieldKey(line) || isInvoiceSectionBoundary(line)) {
      break
    }

    values.push(stripTrailingNoise(line))
  }

  return values
}

function rankFieldSpecificLabelCandidates(
  lines: string[],
  fieldKey: InvoiceSummaryFieldKey
): Array<{ value: string; trace: string; score: number }> {
  const rankedCandidates: Array<{ value: string; trace: string; score: number }> = []

  for (let index = 0; index < lines.length; index += 1) {
    const currentFieldKey = detectInvoiceSummaryFieldKey(lines[index]!)

    if (currentFieldKey !== fieldKey) {
      continue
    }

    for (let lookahead = 1; lookahead <= 6 && index + lookahead < lines.length; lookahead += 1) {
      const candidateLine = stripTrailingNoise(lines[index + lookahead]!)

      if (
        containsInvoicePageArtifactValue(candidateLine)
        || isInvoiceLabelFragmentText(candidateLine)
      ) {
        continue
      }

      const candidateValue = extractFieldSpecificLabelValue(fieldKey, candidateLine)

      if (!candidateValue) {
        continue
      }

      rankedCandidates.push({
        value: candidateValue,
        trace: `${stripTrailingNoise(lines[index]!)} -> ${candidateLine}`,
        score: scoreFieldSpecificLabelCandidate(lines, index, lookahead, fieldKey, candidateValue)
      })
    }
  }

  return rankedCandidates
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index, all) => all.findIndex((other) => other.value === candidate.value && other.trace === candidate.trace) === index)
}

function extractFieldSpecificLabelValue(
  fieldKey: InvoiceSummaryFieldKey,
  line: string
): string | undefined {
  if (isInvoiceLabelText(line)) {
    return undefined
  }

  switch (fieldKey) {
    case 'paymentMethod':
      return isValidInvoiceFieldValue('paymentMethod', line) ? line : undefined
    case 'issueDate':
    case 'taxableDate':
    case 'dueDate': {
      const dateTokens = extractDateTokens(line)
      return dateTokens[0]
    }
    default:
      return undefined
  }
}

function scoreFieldSpecificLabelCandidate(
  lines: string[],
  labelIndex: number,
  lookahead: number,
  fieldKey: InvoiceSummaryFieldKey,
  candidateValue: string
): number {
  const contextWindow = lines.slice(Math.max(0, labelIndex - 4), Math.min(lines.length, labelIndex + 7))
  const hasReferenceNearby = contextWindow.some((line) => isInvoiceReferenceLabel(normalizeLabelSearch(line)))
  const hasPageArtifactNearby = contextWindow.some((line) => containsInvoicePageArtifactValue(line))
  const nearbyHeaderLabels = contextWindow.filter((line) => {
    const detected = detectInvoiceSummaryFieldKey(line)
    return detected === 'paymentMethod' || detected === 'issueDate' || detected === 'taxableDate' || detected === 'dueDate'
  }).length
  const interleavingHeaderLabels = lines
    .slice(labelIndex + 1, Math.min(lines.length, labelIndex + lookahead))
    .filter((line) => Boolean(detectInvoiceSummaryFieldKey(line))).length

  return (
    (isValidInvoiceFieldValue(fieldKey, candidateValue) ? 100 : 0)
    + (hasReferenceNearby ? 80 : 0)
    + (nearbyHeaderLabels * 10)
    + (lookahead === 1 ? 20 : Math.max(0, 20 - lookahead * 3))
    - (hasPageArtifactNearby ? 40 : 0)
    - (interleavingHeaderLabels * 50)
  )
}

function collectLineWindowInvoiceCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const fieldKey = detectInvoiceSummaryFieldKey(lines[index]!)
    const normalizedLabel = normalizeLabelSearch(lines[index]!)

    if (!fieldKey) {
      continue
    }

    if (fieldKey === 'totalAmount' && !isPreferredPayableTotalLabel(normalizedLabel)) {
      continue
    }

    const lookaheadLimit = fieldKey === 'referenceNumber' ? 8 : 6

    for (let lookahead = 1; lookahead <= lookaheadLimit && index + lookahead < lines.length; lookahead += 1) {
      const attemptedValue = stripTrailingNoise(lines[index + lookahead] ?? '')
      const trace = `${stripTrailingNoise(lines[index]!)} -> ${attemptedValue}`
      const isValid = isValidInvoiceFieldValue(fieldKey, attemptedValue)

      recordInvoiceFieldAttempt(debugStates[fieldKey], 'lineWindow', attemptedValue, 'line-window', trace, isValid)

      if (isValid) {
        break
      }
    }
  }
}

function isPreferredPayableTotalLabel(normalizedLabel: string): boolean {
  return normalizedLabel === 'celkem kc k uhrade'
    || normalizedLabel === 'k uhrade'
    || normalizedLabel === 'celkem k uhrade'
    || normalizedLabel === 'total due'
    || normalizedLabel === 'amount due'
}

function isInvoiceReferenceLabel(normalizedLabel: string): boolean {
  return normalizedLabel.includes('faktura cislo')
    || normalizedLabel.includes('cislo faktury')
    || normalizedLabel.includes('doklad cislo')
    || normalizedLabel.includes('cislo dokladu')
}

function extractReferenceCandidateAfterLabel(line: string): string | undefined {
  const patterns = [
    /(?:faktura\s+číslo|číslo\s+faktury|doklad\s+číslo|číslo\s+dokladu)\s*[:\-]?\s*([A-Z0-9/-]*\d[A-Z0-9/-]*)/iu
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(line)
    const candidate = normalizeInvoiceReferenceValue(match?.[1])
    if (candidate) {
      return candidate
    }
  }

  return undefined
}

function extractPayableMoneyCandidateFromLine(line: string): string | undefined {
  const normalized = stripTrailingNoise(line)

  if (
    /záloh?\s+celkem/iu.test(normalized)
    || /%/.test(normalized)
  ) {
    return undefined
  }

  const tokens = extractLooseMoneyTokens(normalized, true)
  return tokens.length > 0 ? tokens[tokens.length - 1] : undefined
}

function extractGenericMoneyCandidateFromLine(line: string): string | undefined {
  const normalized = stripTrailingNoise(line)
  const tokens = extractLooseMoneyTokens(normalized, true)
  return tokens.length > 0 ? tokens[tokens.length - 1] : undefined
}

function collectFallbackInvoiceCandidates(
  fields: Record<string, string>,
  content: string,
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  recordDirectFieldCandidates(debugStates.referenceNumber, fields, FIELD_ALIASES.invoiceNumber, 'referenceNumber', /[A-Z0-9/-]{4,}/i)
  recordDirectFieldCandidates(debugStates.issuerOrCounterparty, fields, FIELD_ALIASES.supplier, 'issuerOrCounterparty', /[^\d].+/u)
  recordDirectFieldCandidates(debugStates.customer, fields, FIELD_ALIASES.customer, 'customer', /[^\d].+/u)
  recordDirectFieldCandidates(debugStates.issueDate, fields, FIELD_ALIASES.issueDate, 'issueDate', /\d{1,2}[./]\d{1,2}[./]\d{4}/)
  recordDirectFieldCandidates(debugStates.dueDate, fields, FIELD_ALIASES.dueDate, 'dueDate', /\d{1,2}[./]\d{1,2}[./]\d{4}/)
  recordDirectFieldCandidates(debugStates.taxableDate, fields, FIELD_ALIASES.taxableDate, 'taxableDate', /\d{1,2}[./]\d{1,2}[./]\d{4}/)
  recordDirectFieldCandidates(debugStates.paymentMethod, fields, FIELD_ALIASES.paymentMethod, 'paymentMethod', /[^\d].+/u)
  recordDirectFieldCandidates(debugStates.description, fields, FIELD_ALIASES.description, 'description', /[^\d].+/u)
  recordDirectFieldCandidates(debugStates.ibanHint, fields, FIELD_ALIASES.iban, 'ibanHint', /[A-Z]{2}[0-9A-Z ]{10,}/i)
  recordDirectFieldCandidates(debugStates.totalAmount, fields, FIELD_ALIASES.total, 'totalAmount', /./)
  recordDirectFieldCandidates(debugStates.vatBaseAmount, fields, FIELD_ALIASES.vatBase, 'vatBaseAmount', /./)
  recordDirectFieldCandidates(debugStates.vatAmount, fields, FIELD_ALIASES.vat, 'vatAmount', /./)

  recordRegexCandidate(debugStates.referenceNumber, content, 'regex-invoice-number', [
    /(?:^|\n)\s*(?:faktura\s+číslo|číslo\s+faktury|faktura\s*č\.?|invoice\s*(?:no|number)|doklad\s+číslo|číslo\s+dokladu)\s*[:\-]?\s*([A-Z0-9/-]*\d[A-Z0-9/-]*)/iu
  ], 'referenceNumber')
  recordRegexCandidate(debugStates.issuerOrCounterparty, content, 'regex-supplier', [
    /(?:^|\n)\s*(?:dodavatel|supplier|vendor)\s*[:\-]?\s*([^\n]+)/iu,
    /(?:^|\n)\s*(?:dodavatel|supplier|vendor)\s*\n\s*([^\n]+)/iu
  ], 'issuerOrCounterparty')
  recordRegexCandidate(debugStates.customer, content, 'regex-customer', [
    /(?:^|\n)\s*(?:odběratel|customer|buyer)\s*[:\-]?\s*([^\n]+)/iu,
    /(?:^|\n)\s*(?:odběratel|customer|buyer)\s*\n\s*([^\n]+)/iu
  ], 'customer')
  recordRegexCandidate(debugStates.issueDate, content, 'regex-issue-date', [
    /(?:^|\n)\s*(?:datum\s+vystaven[íi]|issue\s+date|issued\s+on)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/iu
  ], 'issueDate')
  recordRegexCandidate(debugStates.dueDate, content, 'regex-due-date', [
    /(?:^|\n)\s*(?:datum\s+splatnosti|due\s+date|payment\s+due)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/iu
  ], 'dueDate')
  recordRegexCandidate(debugStates.taxableDate, content, 'regex-taxable-date', [
    /(?:^|\n)\s*(?:datum\s+zdaniteln[eé]ho\s+pln[ěe]n[íi]|taxable\s+date|tax\s+point\s+date)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/iu
  ], 'taxableDate')
  recordRegexCandidate(debugStates.paymentMethod, content, 'regex-payment-method', [
    /(?:^|\n)\s*(?:forma\s+úhrady|payment\s+method)\s*[:\-]?\s*([^\n]+)/iu
  ], 'paymentMethod')
  recordRegexCandidate(debugStates.description, content, 'regex-description', [
    /(?:^|\n)\s*(?:předmět\s+plněn[íi]|service|description|položka)\s*[:\-]?\s*([^\n]+)/iu
  ], 'description')
  recordRegexCandidate(debugStates.ibanHint, content, 'regex-iban', [
    /(?:^|\n)\s*iban\s*[:\-]?\s*([A-Z]{2}[0-9A-Z ]{10,})/iu
  ], 'ibanHint')
  recordRegexCandidate(debugStates.totalAmount, content, 'regex-total', [
    /(?:^|\n)\s*(?:celkem(?:\s+kč)?\s+k\s+úhrad[ěe]|k\s+úhrad[ěe]|total\s+due|amount\s+due)\s*[:\-]?\s*([^\n]+)/iu,
    /(?:^|\n)\s*(?:celkem\s+po\s+zaokrouhlen[íi])\s*[:\-]?\s*([^\n]+)/iu,
    /(?:^|\n)\s*total\s*[:\-]?\s*([^\n]+)/iu
  ], 'totalAmount')
  recordRegexCandidate(debugStates.vatBaseAmount, content, 'regex-vat-base', [
    /(?:^|\n)\s*(?:základ\s+dph|vat\s+base|tax\s+base)\s*[:\-]?\s*([^\n]+)/iu
  ], 'vatBaseAmount')
  recordRegexCandidate(debugStates.vatAmount, content, 'regex-vat', [
    /(?:^|\n)\s*(?:dph|vat)\s*[:\-]?\s*([^\n]+)/iu
  ], 'vatAmount')
}

function resolveInvoiceField(
  fieldKey: InvoiceSummaryFieldKey,
  state: InvoiceFieldDebugState,
  stageOrder: Array<keyof Pick<InvoiceFieldDebugState, 'groupedCandidates' | 'lineWindowCandidates' | 'fallbackCandidates'>> = ['groupedCandidates', 'lineWindowCandidates', 'fallbackCandidates']
): string | undefined {
  const orderedCandidates = stageOrder.flatMap((stage, stageIndex) => state[stage].map((candidate, candidateIndex) => ({
    ...candidate,
    stage,
    stageIndex,
    candidateIndex
  })))

  const selectedCandidate = selectPreferredInvoiceFieldCandidate(fieldKey, orderedCandidates)

  if (selectedCandidate) {
    const normalizedValue = normalizeInvoiceFieldWinnerValue(fieldKey, selectedCandidate.value)

    state.winnerRule = selectedCandidate.rule
    state.winnerValue = normalizedValue
    return normalizedValue
  }

  return undefined
}

function selectPreferredInvoiceFieldCandidate(
  fieldKey: InvoiceSummaryFieldKey,
  candidates: Array<InvoiceFieldCandidate & {
    stage: keyof Pick<InvoiceFieldDebugState, 'groupedCandidates' | 'lineWindowCandidates' | 'fallbackCandidates'>
    stageIndex: number
    candidateIndex: number
  }>
): (InvoiceFieldCandidate & {
  stage: keyof Pick<InvoiceFieldDebugState, 'groupedCandidates' | 'lineWindowCandidates' | 'fallbackCandidates'>
  stageIndex: number
  candidateIndex: number
}) | undefined {
  if (candidates.length === 0) {
    return undefined
  }

  if (fieldKey !== 'totalAmount') {
    return candidates[0]
  }

  return [...candidates].sort((left, right) => {
    const priorityDelta = invoiceFieldCandidatePriority(fieldKey, right) - invoiceFieldCandidatePriority(fieldKey, left)
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    if (left.stageIndex !== right.stageIndex) {
      return left.stageIndex - right.stageIndex
    }

    return left.candidateIndex - right.candidateIndex
  })[0]
}

function invoiceFieldCandidatePriority(
  fieldKey: InvoiceSummaryFieldKey,
  candidate: InvoiceFieldCandidate
): number {
  if (fieldKey !== 'totalAmount') {
    return 0
  }

  switch (candidate.rule) {
    case 'field-specific-summary-total':
      return 500
    case 'structured-grouped-totals-block':
      return 450
    case 'vertical-structured-totals-block':
      return 425
    case 'vertical-grouped-block':
      return 400
    case 'field-specific-payable-total':
      return 350
    case 'direct-labeled-field':
      return 250
    case 'regex-total':
      return 200
    case 'line-window':
      return 150
    default:
      return 100
  }
}

function normalizeInvoiceFieldWinnerValue(fieldKey: InvoiceSummaryFieldKey, value: string): string {
  const stripped = stripTrailingNoise(value)

  switch (fieldKey) {
    case 'referenceNumber':
      return normalizeInvoiceReferenceValue(stripped) ?? stripped
    case 'paymentMethod':
      return normalizePaymentMethodValue(stripped) ?? stripped
    case 'totalAmount':
    case 'vatBaseAmount':
    case 'vatAmount':
      return normalizeDetectedMoneyValue(stripped) ?? stripped
    case 'ibanHint':
      return normalizeIbanValue(stripped) ?? stripped
    default:
      return stripped
  }
}

function recordInvoiceFieldAttempt(
  state: InvoiceFieldDebugState,
  stage: CandidateStage,
  attemptedValue: string | undefined,
  rule: string,
  trace: string,
  isValid: boolean
): void {
  const normalizedAttempt = stripTrailingNoise(attemptedValue ?? '')

  if (normalizedAttempt.length > 0 && !state.candidateValues.includes(normalizedAttempt)) {
    state.candidateValues.push(normalizedAttempt)
  }

  if (stage === 'grouped' && !state.groupedRowMatches.includes(trace)) {
    state.groupedRowMatches.push(trace)
  }

  if (stage === 'lineWindow' && !state.lineWindowMatches.includes(trace)) {
    state.lineWindowMatches.push(trace)
  }

  if (stage === 'fallback' && !state.fullDocumentFallbackMatches.includes(trace)) {
    state.fullDocumentFallbackMatches.push(trace)
  }

  if (!isValid || normalizedAttempt.length === 0) {
    if (normalizedAttempt.length > 0) {
      const rejection = `${normalizedAttempt} [${describeInvalidInvoiceFieldValue(rule, normalizedAttempt)}]`
      if (!state.rejectedCandidates.includes(rejection)) {
        state.rejectedCandidates.push(rejection)
      }
    }
    return
  }

  const candidate = { value: normalizedAttempt, rule, trace }
  const bucket = stage === 'grouped'
    ? state.groupedCandidates
    : stage === 'lineWindow'
      ? state.lineWindowCandidates
      : state.fallbackCandidates

  if (!bucket.some((existing) => existing.value === candidate.value && existing.rule === candidate.rule && existing.trace === candidate.trace)) {
    bucket.push(candidate)
  }
}

function recordDirectFieldCandidates(
  state: InvoiceFieldDebugState,
  fields: Record<string, string>,
  aliases: string[],
  fieldKey: InvoiceSummaryFieldKey,
  _pattern: RegExp
): void {
  for (const alias of aliases) {
    const candidate = fields[normalizeLabel(alias)]

    if (!candidate) {
      continue
    }

    const trace = `${alias} => ${candidate}`
    recordInvoiceFieldAttempt(state, 'fallback', candidate, 'direct-labeled-field', trace, isValidInvoiceFieldValue(fieldKey, candidate))
  }
}

function recordRegexCandidate(
  state: InvoiceFieldDebugState,
  content: string,
  rule: string,
  patterns: RegExp[],
  fieldKey: InvoiceSummaryFieldKey
): void {
  for (const pattern of patterns) {
    const match = pattern.exec(content)
    const candidate = stripTrailingNoise(match?.[1] ?? '')

    if (!candidate) {
      continue
    }

    recordInvoiceFieldAttempt(state, 'fallback', candidate, rule, `${pattern.source} => ${candidate}`, isValidInvoiceFieldValue(fieldKey, candidate))
  }
}

function detectInvoiceSummaryFieldKey(line: string): InvoiceSummaryFieldKey | undefined {
  const normalized = normalizeLabelSearch(line)

  return (Object.entries(SUMMARY_FIELD_ALIASES) as Array<[InvoiceSummaryFieldKey, string[]]>)
    .find(([, aliases]) => aliases.some((alias) => normalizeLabelSearch(alias) === normalized))?.[0]
}

function isValidInvoiceFieldValue(fieldKey: InvoiceSummaryFieldKey, value: string | undefined): boolean {
  const normalizedValue = stripTrailingNoise(value ?? '')

  if (!normalizedValue) {
    return false
  }

    switch (fieldKey) {
      case 'referenceNumber':
      return Boolean(normalizeInvoiceReferenceValue(normalizedValue))
        && !looksLikeInvoiceIban(normalizedValue)
        && !isInvoiceLabelText(normalizedValue)
      case 'issuerOrCounterparty':
      case 'customer':
      case 'description':
        return /[^\d].+/u.test(normalizedValue)
          && !isInvoiceLabelText(normalizedValue)
      case 'issueDate':
      case 'dueDate':
      case 'taxableDate':
        return Boolean(safeNormalizeDocumentDate(normalizedValue, 'Invoice date'))
      case 'paymentMethod':
        return !isInvoiceLabelText(normalizedValue)
          && !isInvoiceLabelFragmentText(normalizedValue)
          && !containsInvoicePageArtifactValue(normalizedValue)
          && extractDateTokens(normalizedValue).length === 0
          && !safeParseDocumentMoney(normalizeDetectedMoneyValue(normalizedValue), 'Invoice payment method')
      case 'totalAmount':
      case 'vatBaseAmount':
      case 'vatAmount':
        return !/%/.test(normalizedValue)
          && Boolean(safeParseDocumentMoney(normalizeDetectedMoneyValue(normalizedValue), 'Invoice amount'))
      case 'ibanHint':
        return Boolean(normalizeIbanValue(normalizedValue))
    default:
      return false
  }
}

function describeInvalidInvoiceFieldValue(rule: string, value: string): string {
  const normalizedValue = stripTrailingNoise(value)

  if (!normalizedValue) {
    return 'empty'
  }

  if (containsInvoicePageArtifactValue(normalizedValue)) {
    return 'page-artifact'
  }

  if (/záloh?\s+celkem/iu.test(normalizedValue)) {
    return 'subtotal-label'
  }

  if (isInvoiceLabelText(normalizedValue)) {
    return 'label-text'
  }

  if (rule.includes('reference')) {
    return 'not-reference'
  }

  if (rule.includes('date')) {
    return 'not-date'
  }

  if (rule.includes('payment')) {
    return extractDateTokens(normalizedValue).length > 0 ? 'date-token' : 'not-payment-method'
  }

  if (rule.includes('total') || rule.includes('vat')) {
    return 'not-money'
  }

  if (rule.includes('iban')) {
    return 'not-iban'
  }

  return 'invalid'
}

function isInvoiceLabelText(value: string): boolean {
  const normalized = normalizeLabelSearch(value)

  return (
    Boolean(detectInvoiceSummaryFieldKey(normalized))
    || normalized === 'faktura'
    || normalized === 'faktura danovy doklad'
    || normalized === 'danovy doklad'
    || normalized === 'rozpis dph'
  )
}

function isInvoiceLabelFragmentText(value: string): boolean {
  const normalized = normalizeLabelSearch(value)

  return normalized === 'faktura'
    || normalized === 'cislo'
    || normalized === 'datum'
    || normalized === 'vystaveni'
    || normalized === 'zdanitelneho plneni'
    || normalized === 'datum zdanitelneho plneni'
    || normalized === 'splatnosti'
    || normalized === 'datum splatnosti'
    || normalized === 'forma'
    || normalized === 'uhrady'
    || normalized === 'forma uhrady'
    || normalized === 'dodavatel'
    || normalized === 'odberatel'
}

function splitDocumentLines(content: string): string[] {
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function normalizeLabelSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[|]/g, ' ')
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function toGroupedBlockDebug(candidate: InvoiceGroupedBlockCandidate): DeterministicDocumentGroupedBlockDebug {
  return {
    blockTypeCandidate: candidate.blockTypeCandidate,
    labels: candidate.labels,
    values: candidate.values,
    score: candidate.score,
    accepted: candidate.accepted,
    ...(candidate.rejectionReason ? { rejectionReason: candidate.rejectionReason } : {})
  }
}

function selectBestGroupedBlockCandidate(
  candidates: InvoiceGroupedBlockCandidate[]
): InvoiceGroupedBlockCandidate | undefined {
  return [...candidates]
    .filter((candidate) => candidate.accepted)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (right.labels.length !== left.labels.length) {
        return right.labels.length - left.labels.length
      }

      return groupedBlockRulePriority(right.winnerRule) - groupedBlockRulePriority(left.winnerRule)
    })[0]
}

function groupedBlockRulePriority(rule: string): number {
  switch (rule) {
    case 'structured-grouped-header-block':
    case 'structured-grouped-totals-block':
      return 3
    case 'vertical-structured-header-block':
    case 'vertical-structured-totals-block':
      return 2
    case 'vertical-grouped-block':
      return 1
    default:
      return 0
  }
}

function recordGroupedBlockWinner(
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>,
  candidate: InvoiceGroupedBlockCandidate
): void {
  candidate.orderedKeys.forEach((fieldKey, position) => {
    const candidateValue = candidate.values[position]

    if (!fieldKey || !candidateValue) {
      return
    }

    recordInvoiceFieldAttempt(
      debugStates[fieldKey],
      'grouped',
      candidateValue,
      candidate.winnerRule,
      candidate.trace,
      isValidInvoiceFieldValue(fieldKey, candidateValue)
    )
  })
}

function evaluateInvoiceHeaderBlockCandidate(candidate: InvoiceGroupedBlockCandidate): InvoiceGroupedBlockCandidate {
  const labels = candidate.orderedKeys
  const hasReferenceLabel = labels.includes('referenceNumber')
  const hasPaymentMethodLabel = labels.includes('paymentMethod')
  const hasIssueDateLabel = labels.includes('issueDate')
  const hasTaxableDateLabel = labels.includes('taxableDate')
  const hasDueDateLabel = labels.includes('dueDate')
  const referenceValue = valueForGroupedField(candidate, 'referenceNumber')
  const paymentMethodValue = valueForGroupedField(candidate, 'paymentMethod')
  const issueDateValue = valueForGroupedField(candidate, 'issueDate')
  const taxableDateValue = valueForGroupedField(candidate, 'taxableDate')
  const dueDateValue = valueForGroupedField(candidate, 'dueDate')
  const containsPageArtifact = candidate.values.some((value) => containsInvoicePageArtifactValue(value))
  const validReference = isValidInvoiceFieldValue('referenceNumber', referenceValue)
  const validPaymentMethod = isValidInvoiceFieldValue('paymentMethod', paymentMethodValue)
  const validIssueDate = isValidInvoiceFieldValue('issueDate', issueDateValue)
  const validTaxableDate = isValidInvoiceFieldValue('taxableDate', taxableDateValue)
  const validDueDate = isValidInvoiceFieldValue('dueDate', dueDateValue)

  let rejectionReason: string | undefined

  if (!hasReferenceLabel) {
    rejectionReason = 'missing reference label'
  } else if (!hasPaymentMethodLabel || !hasIssueDateLabel || !hasTaxableDateLabel || !hasDueDateLabel) {
    rejectionReason = 'missing core date/payment labels'
  } else if (containsPageArtifact) {
    rejectionReason = 'contains page artifact like "Strana 1/1"'
  } else if (!validReference) {
    rejectionReason = 'reference value missing or invalid'
  } else if (!validPaymentMethod) {
    rejectionReason = 'payment method missing or invalid'
  } else if (!validIssueDate || !validTaxableDate || !validDueDate) {
    rejectionReason = 'date values are incomplete'
  }

  return {
    ...candidate,
    score:
      (hasReferenceLabel ? 60 : 0)
      + (hasPaymentMethodLabel ? 20 : 0)
      + (hasIssueDateLabel ? 20 : 0)
      + (hasTaxableDateLabel ? 20 : 0)
      + (hasDueDateLabel ? 20 : 0)
      + (validReference ? 80 : 0)
      + (validPaymentMethod ? 40 : 0)
      + (validIssueDate ? 30 : 0)
      + (validTaxableDate ? 30 : 0)
      + (validDueDate ? 30 : 0),
    accepted: !rejectionReason,
    rejectionReason
  }
}

function evaluateInvoiceTotalsBlockCandidate(candidate: InvoiceGroupedBlockCandidate): InvoiceGroupedBlockCandidate {
  const labels = candidate.orderedKeys
  const hasPayableLabel = labels.includes('totalAmount')
  const hasVatBaseLabel = labels.includes('vatBaseAmount')
  const hasVatLabel = labels.includes('vatAmount')
  const containsPageArtifact = candidate.values.some((value) => containsInvoicePageArtifactValue(value))
  const containsSubtotalNoise = candidate.values.some((value) => /záloh?\s+celkem/iu.test(value))
  const totalValue = valueForGroupedField(candidate, 'totalAmount')
  const vatBaseValue = valueForGroupedField(candidate, 'vatBaseAmount')
  const vatValue = valueForGroupedField(candidate, 'vatAmount')
  const validTotal = isValidInvoiceFieldValue('totalAmount', totalValue)
  const validVatBase = isValidInvoiceFieldValue('vatBaseAmount', vatBaseValue)
  const validVat = isValidInvoiceFieldValue('vatAmount', vatValue)

  let rejectionReason: string | undefined

  if (!hasPayableLabel) {
    rejectionReason = 'no payable label present'
  } else if (containsPageArtifact) {
    rejectionReason = 'contains page artifact like "Strana 1/1"'
  } else if (containsSubtotalNoise) {
    rejectionReason = 'totals block is VAT/subtotal-only'
  } else if (!validTotal) {
    rejectionReason = 'payable total value invalid'
  }

  return {
    ...candidate,
    score:
      (hasPayableLabel ? 80 : 0)
      + (hasVatBaseLabel ? 30 : 0)
      + (hasVatLabel ? 30 : 0)
      + (validVatBase ? 30 : 0)
      + (validVat ? 30 : 0)
      + (validTotal ? 80 : 0),
    accepted: !rejectionReason,
    rejectionReason
  }
}

function valueForGroupedField(
  candidate: InvoiceGroupedBlockCandidate,
  fieldKey: InvoiceSummaryFieldKey
): string | undefined {
  const position = candidate.orderedKeys.indexOf(fieldKey)

  return position === -1 ? undefined : candidate.values[position]
}

function containsInvoicePageArtifactValue(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return /(?:^|\s)strana\s+\d+\/\d+(?:\s|$)/iu.test(stripTrailingNoise(value))
}

function extractLooseMoneyTokens(value: string, allowMissingCurrency = false): string[] {
  const pattern = allowMissingCurrency
    ? /\d[\d\s]*(?:[.,]\d{2})(?:\s*(?:CZK|EUR|USD|Kč|KČ|Kc|KC|€|\$))?/gu
    : /\d[\d\s]*(?:[.,]\d{2})\s*(?:CZK|EUR|USD|Kč|KČ|Kc|KC|€|\$)/gu

  return Array.from(value.matchAll(pattern))
    .filter((match) => {
      const nextCharacter = value[(match.index ?? 0) + (match[0]?.length ?? 0)] ?? ''
      return nextCharacter !== '%'
    })
    .map((match) => normalizeDetectedMoneyValue(stripTrailingNoise(match[0] ?? '')))
    .filter((token): token is string => Boolean(token))
}

function detectCompositeReferenceLabelSpan(
  lines: string[],
  startIndex: number
): { startIndex: number; endIndex: number; rawLabel: string } | undefined {
  for (let width = 1; width <= 3 && startIndex + width <= lines.length; width += 1) {
    const rawLabel = lines.slice(startIndex, startIndex + width).map((line) => stripTrailingNoise(line)).join(' ')
    if (containsInvoicePageArtifactValue(rawLabel)) {
      continue
    }
    if (isInvoiceReferenceLabel(normalizeLabelSearch(rawLabel))) {
      return {
        startIndex,
        endIndex: startIndex + width - 1,
        rawLabel
      }
    }
  }

  return undefined
}

function findAnchoredReferenceMatch(
  lines: string[],
  labelEndIndex: number
): { value: string; lineIndex: number } | undefined {
  for (let lineIndex = labelEndIndex; lineIndex < lines.length && lineIndex <= labelEndIndex + 8; lineIndex += 1) {
    const candidateLine = stripTrailingNoise(lines[lineIndex]!)

    if (containsInvoicePageArtifactValue(candidateLine)) {
      continue
    }

    if (lineIndex > labelEndIndex && isInvoiceSectionBoundary(candidateLine)) {
      break
    }

    const candidate = extractFirstInvoiceReferenceCandidate(candidateLine)
    if (isValidInvoiceFieldValue('referenceNumber', candidate)) {
      return { value: candidate!, lineIndex }
    }
  }

  return undefined
}

function collectAnchoredHeaderWindowLines(lines: string[], referenceLineIndex: number): string[] {
  const windowLines: string[] = []

  for (let index = referenceLineIndex; index < lines.length && windowLines.length < 6; index += 1) {
    const line = stripTrailingNoise(lines[index]!)
    if (containsInvoicePageArtifactValue(line)) {
      continue
    }
    if (windowLines.length > 0 && isInvoiceSectionBoundary(line)) {
      break
    }
    windowLines.push(line)
  }

  return windowLines
}

function extractAnchoredPaymentMethodCandidate(
  lines: string[],
  referenceNumber: string
): string | undefined {
  for (const line of lines) {
    const withoutReference = stripTrailingNoise(line).replace(referenceNumber, '').trim()
    if (!withoutReference) {
      continue
    }

    const firstDateIndex = withoutReference.search(/\d{1,2}[./]\d{1,2}[./]\d{4}/)
    const prefix = firstDateIndex >= 0 ? withoutReference.slice(0, firstDateIndex).trim() : withoutReference

    if (isValidInvoiceFieldValue('paymentMethod', prefix)) {
      return prefix
    }

    if (isValidInvoiceFieldValue('paymentMethod', withoutReference)) {
      return withoutReference
    }
  }

  return undefined
}

function extractAnchoredHeaderDateCandidates(lines: string[]): string[] {
  return lines.flatMap((line) => extractDateTokens(line)).slice(0, 3)
}

function buildCompositeGroupedDatePaymentValueMap(
  orderedKeys: InvoiceSummaryFieldKey[],
  combinedValueLine: string
): Partial<Record<InvoiceSummaryFieldKey, string>> {
  const cleanedCombinedValueLine = stripTrailingNoise(combinedValueLine)
  const referenceCandidate = extractFirstInvoiceReferenceCandidate(cleanedCombinedValueLine)
  const normalizedDateTokens = extractDateTokens(cleanedCombinedValueLine)
  const paymentMethodCandidate = extractCompositeGroupedPaymentMethodCandidate(
    cleanedCombinedValueLine,
    referenceCandidate,
    normalizedDateTokens
  )
  const valueMap: Partial<Record<InvoiceSummaryFieldKey, string>> = {}
  let dateIndex = 0

  for (const fieldKey of orderedKeys) {
    if (fieldKey === 'paymentMethod') {
      valueMap[fieldKey] = paymentMethodCandidate
      continue
    }

    if (fieldKey === 'issueDate' || fieldKey === 'taxableDate' || fieldKey === 'dueDate') {
      valueMap[fieldKey] = normalizedDateTokens[dateIndex]
      dateIndex += 1
    }
  }

  return valueMap
}

function buildStructuredDatePaymentValueMap(
  orderedKeys: InvoiceSummaryFieldKey[],
  valueLines: string[]
): Partial<Record<InvoiceSummaryFieldKey, string>> {
  const cleanedValueLines = valueLines
    .map((line) => stripTrailingNoise(line))
    .filter((line) => line.length > 0 && !containsInvoicePageArtifactValue(line))

  if (cleanedValueLines.length === 0) {
    return {}
  }

  const expectedStructuredCells = orderedKeys.filter((fieldKey) => fieldKey !== 'referenceNumber').length
  const structuredValueLine = cleanedValueLines.find((line) => splitStructuredInvoiceValueCells(line).length >= expectedStructuredCells)
  const joinedValues = cleanedValueLines.join(' ')

  if (!structuredValueLine) {
    return buildCompositeGroupedDatePaymentValueMap(orderedKeys, joinedValues)
  }

  const structuredCells = splitStructuredInvoiceValueCells(structuredValueLine)
  const valueMap: Partial<Record<InvoiceSummaryFieldKey, string>> = {}
  let cellIndex = 0

  for (const fieldKey of orderedKeys) {
    if (fieldKey === 'referenceNumber') {
      continue
    }

    valueMap[fieldKey] = structuredCells[cellIndex]
    cellIndex += 1
  }

  if (orderedKeys.includes('referenceNumber')) {
    valueMap.referenceNumber = extractFirstInvoiceReferenceCandidate(joinedValues)
  }

  return valueMap
}

function collectCompositePayableLabelSpans(
  lines: string[]
): Array<{ startIndex: number; endIndex: number; rawLabel: string; normalizedLabel: string; priority: number }> {
  const spans: Array<{ startIndex: number; endIndex: number; rawLabel: string; normalizedLabel: string; priority: number }> = []

  for (let index = 0; index < lines.length; index += 1) {
    for (let width = 1; width <= 3 && index + width <= lines.length; width += 1) {
      const rawLabel = lines.slice(index, index + width).map((line) => stripTrailingNoise(line)).join(' ')
      const normalizedLabel = normalizeLabelSearch(rawLabel)
      const priority = payableLabelPriority(normalizedLabel)

      if (priority === 0) {
        continue
      }

      spans.push({
        startIndex: index,
        endIndex: index + width - 1,
        rawLabel,
        normalizedLabel,
        priority
      })
    }
  }

  return spans.filter((span, index, all) => all.findIndex((other) => (
    other.startIndex === span.startIndex
    && other.endIndex === span.endIndex
    && other.normalizedLabel === span.normalizedLabel
  )) === index)
}

function payableLabelPriority(normalizedLabel: string): number {
  if (
    normalizedLabel === 'celkem kc k uhrade'
    || normalizedLabel === 'celkem k uhrade'
    || normalizedLabel === 'k uhrade'
  ) {
    return 2
  }

  if (normalizedLabel === 'celkem po zaokrouhleni') {
    return 1
  }

  return 0
}

function normalizeInvoiceReferenceValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = stripTrailingNoise(value)
    .replace(/\s+/g, '')
    .replace(/^[^A-Z0-9]+/i, '')
    .replace(/[^A-Z0-9/-]+$/i, '')

  if (!/\d/.test(normalized)) {
    return undefined
  }

  return normalized.length >= 6 ? normalized : undefined
}

function extractCompositeGroupedPaymentMethodCandidate(
  combinedValueLine: string,
  referenceCandidate: string | undefined,
  dateTokens: string[]
): string | undefined {
  let candidate = stripTrailingNoise(combinedValueLine)

  if (referenceCandidate) {
    candidate = candidate.replace(referenceCandidate, ' ').trim()
  }

  for (const dateToken of dateTokens) {
    candidate = candidate.replace(dateToken, ' ').trim()
  }

  candidate = candidate
    .replace(/\b(?:[A-Z]{2}\d{10,}|\d(?:[\d\s/-]{5,}\d))\b/gu, ' ')
    .trim()
  candidate = stripTrailingNoise(candidate.replace(/\s+/g, ' '))

  if (!candidate || containsInvoicePageArtifactValue(candidate) || isInvoiceLabelText(candidate) || isInvoiceLabelFragmentText(candidate)) {
    return undefined
  }

  return candidate
}

function splitStructuredInvoiceValueCells(value: string): string[] {
  if (!value.includes('|')) {
    return []
  }

  return value
    .split('|')
    .map((cell) => stripTrailingNoise(cell))
    .filter((cell) => cell.length > 0)
}

function extractDateTokens(value: string): string[] {
  return value.match(DATE_TOKEN_PATTERN) ?? []
}

function looksLikeInvoiceIban(value: string): boolean {
  const iban = normalizeIbanValue(value)
  return Boolean(iban && /^[A-Z]{2}\d{10,}$/.test(iban))
}

function safeNormalizeDocumentDate(value: string | undefined, fieldName: string): string | undefined {
  if (!value?.trim()) {
    return undefined
  }

  try {
    return normalizeDocumentDate(value, fieldName)
  } catch {
    return undefined
  }
}

function safeParseDocumentMoney(
  value: string | undefined,
  fieldName: string
): { amountMinor: number; currency: string } | undefined {
  if (!value?.trim()) {
    return undefined
  }

  try {
    return parseDocumentMoney(value, fieldName)
  } catch {
    return undefined
  }
}
