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
  'Total',
  'Service'
]

export interface ParseInvoiceDocumentInput extends DeterministicDocumentParserInput {}

const FIELD_ALIASES = {
  invoiceNumber: ['Invoice No', 'Invoice number', 'Číslo faktury', 'Faktura č.'],
  supplier: ['Supplier', 'Vendor', 'Dodavatel'],
  issueDate: ['Issue date', 'Issued on', 'Datum vystavení'],
  dueDate: ['Due date', 'Payment due', 'Datum splatnosti'],
  total: ['Total', 'Amount due', 'Celkem', 'K úhradě'],
  service: ['Service', 'Description', 'Položka', 'Předmět plnění']
} satisfies Record<string, string[]>

export class InvoiceDocumentParser {
  parse(input: ParseInvoiceDocumentInput): ExtractedRecord[] {
    const extracted = extractInvoiceDocumentFields(input.content)
    const missing = collectMissingInvoiceFields(extracted)

    if (missing.length > 0) {
      throw new Error(`Invoice document is missing required fields: ${missing.join(', ')}`)
    }

    const issueDate = normalizeDocumentDate(extracted.issueDateRaw!, 'Invoice issue date')
    const dueDate = normalizeDocumentDate(extracted.dueDateRaw!, 'Invoice due date')
    const { amountMinor, currency } = parseDocumentMoney(extracted.totalRaw!, 'Invoice total')

    const record: ExtractedRecord = {
      id: 'invoice-record-1',
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'invoice-document',
      extractedAt: input.extractedAt,
      rawReference: extracted.invoiceNumber,
      amountMinor,
      currency,
      occurredAt: issueDate,
      data: {
        sourceSystem: 'invoice',
        invoiceNumber: extracted.invoiceNumber,
        supplier: extracted.supplier,
        issueDate,
        dueDate,
        amountMinor,
        currency,
        description: extracted.description
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
  const normalizedIssueDate = safeNormalizeDocumentDate(extracted.issueDateRaw, 'Invoice issue date')
  const normalizedDueDate = safeNormalizeDocumentDate(extracted.dueDateRaw, 'Invoice due date')
  const total = safeParseDocumentMoney(extracted.totalRaw, 'Invoice total')
  const hasMeaningfulFields = Boolean(
    extracted.invoiceNumber
    || extracted.supplier
    || extracted.issueDateRaw
    || extracted.dueDateRaw
    || extracted.totalRaw
    || extracted.description
  )

  return {
    documentKind: 'invoice',
    sourceSystem: 'invoice',
    documentType: 'invoice',
    issuerOrCounterparty: extracted.supplier,
    issueDate: normalizedIssueDate,
    dueDate: normalizedDueDate,
    totalAmountMinor: total?.amountMinor,
    totalCurrency: total?.currency,
    referenceNumber: extracted.invoiceNumber,
    confidence: missingRequiredFields.length === 0
      ? 'strong'
      : hasMeaningfulFields
        ? 'hint'
        : 'none',
    missingRequiredFields
  }
}

function extractInvoiceDocumentFields(content: string): {
  invoiceNumber?: string
  supplier?: string
  issueDateRaw?: string
  dueDateRaw?: string
  totalRaw?: string
  description?: string
} {
  const fields = parseLabeledDocumentText(content)

  return {
    invoiceNumber: pickRequiredField(fields, FIELD_ALIASES.invoiceNumber),
    supplier: pickRequiredField(fields, FIELD_ALIASES.supplier),
    issueDateRaw: pickRequiredField(fields, FIELD_ALIASES.issueDate),
    dueDateRaw: pickRequiredField(fields, FIELD_ALIASES.dueDate),
    totalRaw: pickRequiredField(fields, FIELD_ALIASES.total),
    description: pickRequiredField(fields, FIELD_ALIASES.service)
  }
}

function collectMissingInvoiceFields(extracted: ReturnType<typeof extractInvoiceDocumentFields>): string[] {
  return REQUIRED_FIELDS.filter((field) => {
    switch (field) {
      case 'Invoice No':
        return !extracted.invoiceNumber
      case 'Supplier':
        return !extracted.supplier
      case 'Issue date':
        return !extracted.issueDateRaw
      case 'Due date':
        return !extracted.dueDateRaw
      case 'Total':
        return !extracted.totalRaw
      case 'Service':
        return !extracted.description
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

  if (!safeNormalizeDocumentDate(extracted.issueDateRaw, 'Invoice issue date')) {
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
