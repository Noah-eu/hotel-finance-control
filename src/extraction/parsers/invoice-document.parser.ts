import type { ExtractedRecord } from '../../domain'
import type {
  DeterministicDocumentFieldExtractionDebug,
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

interface InvoiceFieldDebugState extends DeterministicDocumentFieldExtractionDebug {
  groupedCandidates: InvoiceFieldCandidate[]
  lineWindowCandidates: InvoiceFieldCandidate[]
  fallbackCandidates: InvoiceFieldCandidate[]
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
const MONEY_TOKEN_WITH_CURRENCY_PATTERN = /\d[\d\s]*(?:[.,]\d{2})\s*(?:CZK|EUR|USD|Kč|KČ|Kc|KC|€|\$)/gu

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

  collectHorizontalGroupedInvoiceHeaderCandidates(content, debugStates)
  collectSequentialInvoiceBlockCandidates(lines, debugStates)
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
    fieldDebug: Object.fromEntries(
      Object.entries(debugStates).map(([key, state]) => [key, {
        winnerRule: state.winnerRule,
        winnerValue: state.winnerValue,
        candidateValues: state.candidateValues,
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
    groupedRowMatches: [],
    lineWindowMatches: [],
    fullDocumentFallbackMatches: [],
    groupedCandidates: [],
    lineWindowCandidates: [],
    fallbackCandidates: []
  }
}

function collectHorizontalGroupedInvoiceHeaderCandidates(
  content: string,
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
  const lines = splitDocumentLines(content)

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = normalizeLabelSearch(lines[index]!)
    const values = lines[index + 1] ?? ''
    const valuesAfter = lines[index + 2] ?? ''
    const dateTokens = extractDateTokens(values)
    const dateTokensAfter = extractDateTokens(valuesAfter)
    const hasIssue = header.includes('datum vystaveni')
    const hasTaxable = header.includes('datum zdanitelneho plneni')
    const hasDue = header.includes('datum splatnosti')
    const hasPaymentMethod = header.includes('forma uhrady')

    if (hasPaymentMethod && hasIssue && hasTaxable && hasDue && dateTokens.length >= 3) {
      const firstDateIndex = values.search(/\d{1,2}[./]\d{1,2}[./]\d{4}/)
      const paymentMethod = firstDateIndex > 0 ? values.slice(0, firstDateIndex).trim() : undefined
      const trace = `${stripTrailingNoise(lines[index]!)} => ${stripTrailingNoise(values)}`

      if (paymentMethod) {
        recordInvoiceFieldAttempt(debugStates.paymentMethod, 'grouped', paymentMethod, 'horizontal-grouped-header', trace, isValidInvoiceFieldValue('paymentMethod', paymentMethod))
      }
      recordInvoiceFieldAttempt(debugStates.issueDate, 'grouped', dateTokens[0], 'horizontal-grouped-header', trace, isValidInvoiceFieldValue('issueDate', dateTokens[0]))
      recordInvoiceFieldAttempt(debugStates.taxableDate, 'grouped', dateTokens[1], 'horizontal-grouped-header', trace, isValidInvoiceFieldValue('taxableDate', dateTokens[1]))
      recordInvoiceFieldAttempt(debugStates.dueDate, 'grouped', dateTokens[2], 'horizontal-grouped-header', trace, isValidInvoiceFieldValue('dueDate', dateTokens[2]))
      continue
    }

    if (hasPaymentMethod && hasIssue && hasTaxable && hasDue && dateTokensAfter.length >= 3) {
      const trace = `${stripTrailingNoise(lines[index]!)} => ${stripTrailingNoise(values)} | ${stripTrailingNoise(valuesAfter)}`

      recordInvoiceFieldAttempt(debugStates.paymentMethod, 'grouped', values, 'horizontal-grouped-header-two-line', trace, isValidInvoiceFieldValue('paymentMethod', values))
      recordInvoiceFieldAttempt(debugStates.issueDate, 'grouped', dateTokensAfter[0], 'horizontal-grouped-header-two-line', trace, isValidInvoiceFieldValue('issueDate', dateTokensAfter[0]))
      recordInvoiceFieldAttempt(debugStates.taxableDate, 'grouped', dateTokensAfter[1], 'horizontal-grouped-header-two-line', trace, isValidInvoiceFieldValue('taxableDate', dateTokensAfter[1]))
      recordInvoiceFieldAttempt(debugStates.dueDate, 'grouped', dateTokensAfter[2], 'horizontal-grouped-header-two-line', trace, isValidInvoiceFieldValue('dueDate', dateTokensAfter[2]))
      continue
    }

    if (hasIssue && hasTaxable && hasDue && dateTokens.length >= 3) {
      const trace = `${stripTrailingNoise(lines[index]!)} => ${stripTrailingNoise(values)}`
      recordInvoiceFieldAttempt(debugStates.issueDate, 'grouped', dateTokens[0], 'horizontal-date-header', trace, isValidInvoiceFieldValue('issueDate', dateTokens[0]))
      recordInvoiceFieldAttempt(debugStates.taxableDate, 'grouped', dateTokens[1], 'horizontal-date-header', trace, isValidInvoiceFieldValue('taxableDate', dateTokens[1]))
      recordInvoiceFieldAttempt(debugStates.dueDate, 'grouped', dateTokens[2], 'horizontal-date-header', trace, isValidInvoiceFieldValue('dueDate', dateTokens[2]))
    }
  }
}

function collectSequentialInvoiceBlockCandidates(
  lines: string[],
  debugStates: Record<InvoiceSummaryFieldKey, InvoiceFieldDebugState>
): void {
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

    const values = lines
      .slice(cursor, cursor + blockFields.length)
      .map((line) => stripTrailingNoise(line))

    if (values.length < blockFields.length) {
      continue
    }

    const trace = `${blockLabels.join(' | ')} => ${values.join(' | ')}`

    blockFields.forEach((fieldKey, fieldIndex) => {
      const attemptedValue = values[fieldIndex] ?? ''
      recordInvoiceFieldAttempt(
        debugStates[fieldKey],
        'grouped',
        attemptedValue,
        'vertical-grouped-block',
        trace,
        isValidInvoiceFieldValue(fieldKey, attemptedValue)
      )
    })
  }
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
    || normalizedLabel === 'total due'
    || normalizedLabel === 'amount due'
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
    /(?:^|\n)\s*(?:faktura\s+číslo|číslo\s+faktury|faktura\s*č\.?|invoice\s*(?:no|number)|doklad\s+číslo|číslo\s+dokladu)\s*[:\-]?\s*([A-Z0-9/-]+)/iu
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
    /(?:^|\n)\s*(?:datum\s+vystaven[íi]|issue\s+date|issued\s+on)\s*[:\-]?\s*([0-9./-]+)/iu
  ], 'issueDate')
  recordRegexCandidate(debugStates.dueDate, content, 'regex-due-date', [
    /(?:^|\n)\s*(?:datum\s+splatnosti|due\s+date|payment\s+due)\s*[:\-]?\s*([0-9./-]+)/iu
  ], 'dueDate')
  recordRegexCandidate(debugStates.taxableDate, content, 'regex-taxable-date', [
    /(?:^|\n)\s*(?:datum\s+zdaniteln[eé]ho\s+pln[ěe]n[íi]|taxable\s+date|tax\s+point\s+date)\s*[:\-]?\s*([0-9./-]+)/iu
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
  for (const stage of stageOrder) {
    for (const candidate of state[stage]) {
      const normalizedValue = normalizeInvoiceFieldWinnerValue(fieldKey, candidate.value)

      state.winnerRule = candidate.rule
      state.winnerValue = normalizedValue
      return normalizedValue
    }
  }

  return undefined
}

function normalizeInvoiceFieldWinnerValue(fieldKey: InvoiceSummaryFieldKey, value: string): string {
  const stripped = stripTrailingNoise(value)

  switch (fieldKey) {
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
      return /[A-Z0-9/-]{4,}/i.test(normalizedValue)
        && /\d/.test(normalizedValue)
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
          && extractDateTokens(normalizedValue).length === 0
          && !safeParseDocumentMoney(normalizeDetectedMoneyValue(normalizedValue), 'Invoice payment method')
      case 'totalAmount':
      case 'vatBaseAmount':
      case 'vatAmount':
        return Boolean(safeParseDocumentMoney(normalizeDetectedMoneyValue(normalizedValue), 'Invoice amount'))
      case 'ibanHint':
        return Boolean(normalizeIbanValue(normalizedValue))
    default:
      return false
  }
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
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function extractDateTokens(value: string): string[] {
  return value.match(DATE_TOKEN_PATTERN) ?? []
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
