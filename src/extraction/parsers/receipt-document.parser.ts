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
  'Receipt No',
  'Merchant',
  'Purchase date',
  'Total',
  'Category'
]

const FIELD_ALIASES = {
  receiptNumber: ['Receipt No', 'Receipt number', 'Číslo účtenky', 'Uctenka cislo'],
  merchant: ['Merchant', 'Store', 'Dodavatel', 'Obchod'],
  purchaseDate: ['Purchase date', 'Paid at', 'Datum nákupu', 'Datum'],
  total: ['Total', 'Amount paid', 'Celkem', 'Zaplaceno'],
  category: ['Category', 'Expense type', 'Kategorie', 'Typ nákupu'],
  note: ['Note', 'Description', 'Poznámka', 'Účel']
} satisfies Record<string, string[]>

export interface ParseReceiptDocumentInput extends DeterministicDocumentParserInput {}

export class ReceiptDocumentParser {
  parse(input: ParseReceiptDocumentInput): ExtractedRecord[] {
    const extracted = extractReceiptDocumentFields(input.content)
    const missing = collectMissingReceiptFields(extracted)

    if (missing.length > 0) {
      throw new Error(`Receipt document is missing required fields: ${missing.join(', ')}`)
    }

    const purchaseDate = normalizeDocumentDate(extracted.purchaseDateRaw!, 'Receipt purchase date')
    const { amountMinor, currency } = parseDocumentMoney(extracted.totalRaw!, 'Receipt total')

    return [
      {
        id: 'receipt-record-1',
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'receipt-document',
        extractedAt: input.extractedAt,
        rawReference: extracted.receiptNumber,
        amountMinor,
        currency,
        occurredAt: purchaseDate,
        data: {
          sourceSystem: 'receipt',
          receiptNumber: extracted.receiptNumber,
          merchant: extracted.merchant,
          purchaseDate,
          amountMinor,
          currency,
          category: extracted.category,
          description: extracted.note
        }
      }
    ]
  }
}

const defaultReceiptDocumentParser = new ReceiptDocumentParser()

export function parseReceiptDocument(input: ParseReceiptDocumentInput): ExtractedRecord[] {
  return defaultReceiptDocumentParser.parse(input)
}

export function inspectReceiptDocumentExtractionSummary(content: string): DeterministicDocumentExtractionSummary {
  const extracted = extractReceiptDocumentFields(content)
  const missingRequiredFields = collectMissingReceiptSummaryFields(extracted)
  const purchaseDate = safeNormalizeDocumentDate(extracted.purchaseDateRaw, 'Receipt purchase date')
  const total = safeParseDocumentMoney(extracted.totalRaw, 'Receipt total')
  const hasMeaningfulFields = Boolean(
    extracted.receiptNumber
    || extracted.merchant
    || extracted.purchaseDateRaw
    || extracted.totalRaw
    || extracted.category
    || extracted.note
  )

  return {
    documentKind: 'receipt',
    sourceSystem: 'receipt',
    documentType: 'receipt',
    issuerOrCounterparty: extracted.merchant,
    paymentDate: purchaseDate,
    totalAmountMinor: total?.amountMinor,
    totalCurrency: total?.currency,
    referenceNumber: extracted.receiptNumber,
    confidence: missingRequiredFields.length === 0
      ? 'strong'
      : hasMeaningfulFields
        ? 'hint'
        : 'none',
    missingRequiredFields
  }
}

function extractReceiptDocumentFields(content: string): {
  receiptNumber?: string
  merchant?: string
  purchaseDateRaw?: string
  totalRaw?: string
  category?: string
  note?: string
} {
  const fields = parseLabeledDocumentText(content)
  const category = pickRequiredField(fields, FIELD_ALIASES.category)

  return {
    receiptNumber: pickRequiredField(fields, FIELD_ALIASES.receiptNumber),
    merchant: pickRequiredField(fields, FIELD_ALIASES.merchant),
    purchaseDateRaw: pickRequiredField(fields, FIELD_ALIASES.purchaseDate),
    totalRaw: pickRequiredField(fields, FIELD_ALIASES.total),
    category,
    note: pickRequiredField(fields, FIELD_ALIASES.note) ?? category
  }
}

function collectMissingReceiptFields(extracted: ReturnType<typeof extractReceiptDocumentFields>): string[] {
  return REQUIRED_FIELDS.filter((field) => {
    switch (field) {
      case 'Receipt No':
        return !extracted.receiptNumber
      case 'Merchant':
        return !extracted.merchant
      case 'Purchase date':
        return !extracted.purchaseDateRaw
      case 'Total':
        return !extracted.totalRaw
      case 'Category':
        return !extracted.category
      default:
        return false
    }
  })
}

function collectMissingReceiptSummaryFields(extracted: ReturnType<typeof extractReceiptDocumentFields>): string[] {
  const missing: string[] = []

  if (!extracted.receiptNumber?.trim()) {
    missing.push('referenceNumber')
  }

  if (!extracted.merchant?.trim()) {
    missing.push('issuerOrCounterparty')
  }

  if (!safeNormalizeDocumentDate(extracted.purchaseDateRaw, 'Receipt purchase date')) {
    missing.push('paymentDate')
  }

  if (!safeParseDocumentMoney(extracted.totalRaw, 'Receipt total')) {
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
