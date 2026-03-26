import type { ExtractedRecord } from '../../domain'
import type {
  DeterministicDocumentExtractionSummary,
  DeterministicDocumentParserInput
} from '../contracts'
import {
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
    const extracted = extractInvoiceDocumentFields(input.content)
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
    const ibanHint = extractIbanHint(extracted.ibanValue)

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
  const extracted = extractInvoiceDocumentFields(content)
  const missingRequiredFields = collectMissingInvoiceSummaryFields(extracted)
  const issueDate = safeNormalizeDocumentDate(extracted.issueDateRaw, 'Invoice issue date')
  const taxableDate = safeNormalizeDocumentDate(extracted.taxableDateRaw, 'Invoice taxable date')
  const dueDate = safeNormalizeDocumentDate(extracted.dueDateRaw, 'Invoice due date')
  const total = safeParseDocumentMoney(extracted.totalRaw, 'Invoice total')
  const vatBase = safeParseDocumentMoney(extracted.vatBaseRaw, 'Invoice VAT base')
  const vat = safeParseDocumentMoney(extracted.vatRaw, 'Invoice VAT')
  const ibanHint = extractIbanHint(extracted.ibanValue)
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
    missingRequiredFields
  }
}

export function detectInvoiceDocumentKeywordHits(content: string): string[] {
  return INVOICE_KEYWORD_PATTERNS
    .filter(({ pattern }) => pattern.test(content))
    .map(({ label }) => label)
}

function extractInvoiceDocumentFields(content: string): {
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
} {
  const fields = parseLabeledDocumentText(content)
  const groupedDates = extractGroupedInvoiceDates(content)
  const groupedAmounts = extractGroupedInvoiceAmounts(content)

  return {
    invoiceNumber: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.invoiceNumber,
      [
        /(?:^|\n)\s*(?:faktura\s+číslo|číslo\s+faktury|faktura\s*č\.?|invoice\s*(?:no|number)|doklad\s+číslo|číslo\s+dokladu)\s*[:\-]?\s*([A-Z0-9/-]+)/iu
      ]
    ),
    supplier: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.supplier,
      [
        /(?:^|\n)\s*(?:dodavatel|supplier|vendor)\s*[:\-]?\s*([^\n]+)/iu,
        /(?:^|\n)\s*(?:dodavatel|supplier|vendor)\s*\n\s*([^\n]+)/iu
      ]
    ),
    customer: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.customer,
      [
        /(?:^|\n)\s*(?:odběratel|customer|buyer)\s*[:\-]?\s*([^\n]+)/iu,
        /(?:^|\n)\s*(?:odběratel|customer|buyer)\s*\n\s*([^\n]+)/iu
      ]
    ),
    issueDateRaw: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.issueDate,
      [
        /(?:^|\n)\s*(?:datum\s+vystaven[íi]|issue\s+date|issued\s+on)\s*[:\-]?\s*([0-9./-]+)/iu
      ],
      groupedDates.issueDateRaw
    ),
    dueDateRaw: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.dueDate,
      [
        /(?:^|\n)\s*(?:datum\s+splatnosti|due\s+date|payment\s+due)\s*[:\-]?\s*([0-9./-]+)/iu
      ],
      groupedDates.dueDateRaw
    ),
    taxableDateRaw: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.taxableDate,
      [
        /(?:^|\n)\s*(?:datum\s+zdaniteln[eé]ho\s+pln[ěe]n[íi]|taxable\s+date|tax\s+point\s+date)\s*[:\-]?\s*([0-9./-]+)/iu
      ],
      groupedDates.taxableDateRaw
    ),
    totalRaw: pickMoneyDocumentField(
      fields,
      content,
      FIELD_ALIASES.total,
      [
        /(?:^|\n)\s*(?:celkem(?:\s+kč)?\s+k\s+úhrad[ěe]|k\s+úhrad[ěe]|total\s+due|amount\s+due)\s*[:\-]?\s*([^\n]+)/iu,
        /(?:^|\n)\s*(?:celkem\s+po\s+zaokrouhlen[íi])\s*[:\-]?\s*([^\n]+)/iu,
        /(?:^|\n)\s*total\s*[:\-]?\s*([^\n]+)/iu
      ],
      groupedAmounts.totalRaw
    ),
    paymentMethod: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.paymentMethod,
      [
        /(?:^|\n)\s*(?:forma\s+úhrady|payment\s+method)\s*[:\-]?\s*([^\n]+)/iu
      ]
    ),
    description: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.description,
      [
        /(?:^|\n)\s*(?:předmět\s+plněn[íi]|service|description|položka)\s*[:\-]?\s*([^\n]+)/iu
      ]
    ),
    vatBaseRaw: pickMoneyDocumentField(
      fields,
      content,
      FIELD_ALIASES.vatBase,
      [
        /(?:^|\n)\s*(?:základ\s+dph|vat\s+base|tax\s+base)\s*[:\-]?\s*([^\n]+)/iu
      ],
      groupedAmounts.vatBaseRaw
    ),
    vatRaw: pickMoneyDocumentField(
      fields,
      content,
      FIELD_ALIASES.vat,
      [
        /(?:^|\n)\s*(?:dph|vat)\s*[:\-]?\s*([^\n]+)/iu
      ],
      groupedAmounts.vatRaw
    ),
    ibanValue: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.iban,
      [
        /(?:^|\n)\s*iban\s*[:\-]?\s*([A-Z]{2}[0-9A-Z ]{10,})/iu
      ]
    )
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

function collectMissingInvoiceFields(extracted: ReturnType<typeof extractInvoiceDocumentFields>): string[] {
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

function collectMissingInvoiceSummaryFields(extracted: ReturnType<typeof extractInvoiceDocumentFields>): string[] {
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

function extractIbanHint(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const digits = value.replace(/\s+/g, '')

  return digits.length >= 4 ? digits.slice(-4) : undefined
}

function extractGroupedInvoiceDates(content: string): {
  issueDateRaw?: string
  taxableDateRaw?: string
  dueDateRaw?: string
} {
  const lines = splitDocumentLines(content)

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = normalizeSearchText(lines[index]!)
    const values = lines[index + 1] ?? ''
    const dateTokens = values.match(DATE_TOKEN_PATTERN) ?? []

    if (
      header.includes('datum vystaveni')
      && header.includes('datum zdanitelneho plneni')
      && header.includes('datum splatnosti')
      && dateTokens.length >= 3
    ) {
      return {
        issueDateRaw: dateTokens[0],
        taxableDateRaw: dateTokens[1],
        dueDateRaw: dateTokens[2]
      }
    }

    if (header.includes('datum vystaveni') && header.includes('datum splatnosti') && dateTokens.length >= 2) {
      return {
        issueDateRaw: dateTokens[0],
        dueDateRaw: dateTokens[dateTokens.length - 1]
      }
    }
  }

  return {}
}

function extractGroupedInvoiceAmounts(content: string): {
  vatBaseRaw?: string
  vatRaw?: string
  totalRaw?: string
} {
  const lines = splitDocumentLines(content)

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = normalizeSearchText(lines[index]!)
    const values = lines[index + 1] ?? ''
    const moneyTokens = extractMoneyTokens(values)

    if (
      header.includes('zaklad dph')
      && header.includes('dph')
      && (header.includes('celkem po zaokrouhleni') || header.includes('celkem'))
      && moneyTokens.length >= 3
    ) {
      return {
        vatBaseRaw: moneyTokens[0],
        vatRaw: moneyTokens[1],
        totalRaw: moneyTokens[moneyTokens.length - 1]
      }
    }
  }

  return {}
}

function splitDocumentLines(content: string): string[] {
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function extractMoneyTokens(value: string): string[] {
  return Array.from(value.matchAll(MONEY_TOKEN_WITH_CURRENCY_PATTERN))
    .map((match) => stripTrailingNoise(match[0] ?? ''))
    .filter((token) => token.length > 0)
    .map((token) => normalizeDetectedMoneyValue(token))
    .filter((token): token is string => Boolean(token))
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
