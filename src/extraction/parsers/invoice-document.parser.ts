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
  invoiceNumber: ['Invoice No', 'Invoice number', 'Číslo faktury', 'Faktura č.', 'Číslo dokladu'],
  supplier: ['Supplier', 'Vendor', 'Dodavatel'],
  customer: ['Customer', 'Buyer', 'Odběratel'],
  issueDate: ['Issue date', 'Issued on', 'Datum vystavení'],
  dueDate: ['Due date', 'Payment due', 'Datum splatnosti'],
  taxableDate: ['Taxable date', 'Tax point date', 'Datum zdanitelného plnění'],
  total: ['Total due', 'Amount due', 'Celkem Kč k úhradě', 'K úhradě', 'Celkem', 'Total'],
  paymentMethod: ['Payment method', 'Forma úhrady'],
  description: ['Service', 'Description', 'Položka', 'Předmět plnění'],
  vatBase: ['VAT base', 'Tax base', 'Základ DPH'],
  vat: ['VAT', 'DPH'],
  iban: ['IBAN']
} satisfies Record<string, string[]>

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

  return {
    invoiceNumber: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.invoiceNumber,
      [
        /(?:^|\n)\s*(?:číslo\s+faktury|faktura\s*č\.?|invoice\s*(?:no|number)|číslo\s+dokladu)\s*[:\-]?\s*([A-Z0-9/-]+)/iu
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
      ]
    ),
    dueDateRaw: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.dueDate,
      [
        /(?:^|\n)\s*(?:datum\s+splatnosti|due\s+date|payment\s+due)\s*[:\-]?\s*([0-9./-]+)/iu
      ]
    ),
    taxableDateRaw: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.taxableDate,
      [
        /(?:^|\n)\s*(?:datum\s+zdaniteln[eé]ho\s+pln[ěe]n[íi]|taxable\s+date|tax\s+point\s+date)\s*[:\-]?\s*([0-9./-]+)/iu
      ]
    ),
    totalRaw: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.total,
      [
        /(?:^|\n)\s*(?:celkem(?:\s+kč)?\s+k\s+úhrad[ěe]|k\s+úhrad[ěe]|total\s+due|amount\s+due)\s*[:\-]?\s*([^\n]+)/iu,
        /(?:^|\n)\s*total\s*[:\-]?\s*([^\n]+)/iu
      ]
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
    vatBaseRaw: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.vatBase,
      [
        /(?:^|\n)\s*(?:základ\s+dph|vat\s+base|tax\s+base)\s*[:\-]?\s*([^\n]+)/iu
      ]
    ),
    vatRaw: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.vat,
      [
        /(?:^|\n)\s*(?:dph|vat)\s*[:\-]?\s*([^\n]+)/iu
      ]
    ),
    ibanValue: pickDocumentField(
      fields,
      content,
      FIELD_ALIASES.iban,
      [
        /(?:^|\n)\s*iban\s*[:\-]?\s*([A-Z]{2}[0-9A-Z\s]{10,})/iu
      ]
    )
  }
}

function pickDocumentField(
  fields: Record<string, string>,
  content: string,
  aliases: string[],
  patterns: RegExp[]
): string | undefined {
  const direct = pickRequiredField(fields, aliases)

  if (direct?.trim()) {
    return direct.trim()
  }

  for (const pattern of patterns) {
    const match = pattern.exec(content)
    const value = match?.[1]?.trim()

    if (value) {
      return stripTrailingNoise(value)
    }
  }

  return undefined
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

function extractIbanHint(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const digits = value.replace(/\s+/g, '')

  return digits.length >= 4 ? digits.slice(-4) : undefined
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
