import type { ExtractedRecord } from '../../domain'
import type { DeterministicDocumentParserInput } from '../contracts'
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
    const fields = parseLabeledDocumentText(input.content)

    const receiptNumber = pickRequiredField(fields, FIELD_ALIASES.receiptNumber)
    const merchant = pickRequiredField(fields, FIELD_ALIASES.merchant)
    const purchaseDateRaw = pickRequiredField(fields, FIELD_ALIASES.purchaseDate)
    const totalRaw = pickRequiredField(fields, FIELD_ALIASES.total)
    const category = pickRequiredField(fields, FIELD_ALIASES.category)
    const note = pickRequiredField(fields, FIELD_ALIASES.note) ?? category

    const missing = REQUIRED_FIELDS.filter((field) => {
      switch (field) {
        case 'Receipt No':
          return !receiptNumber
        case 'Merchant':
          return !merchant
        case 'Purchase date':
          return !purchaseDateRaw
        case 'Total':
          return !totalRaw
        case 'Category':
          return !category
        default:
          return false
      }
    })

    if (missing.length > 0) {
      throw new Error(`Receipt document is missing required fields: ${missing.join(', ')}`)
    }

    const purchaseDate = normalizeDocumentDate(purchaseDateRaw!, 'Receipt purchase date')
    const { amountMinor, currency } = parseDocumentMoney(totalRaw!, 'Receipt total')

    return [
      {
        id: 'receipt-record-1',
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'receipt-document',
        extractedAt: input.extractedAt,
        rawReference: receiptNumber,
        amountMinor,
        currency,
        occurredAt: purchaseDate,
        data: {
          sourceSystem: 'receipt',
          receiptNumber,
          merchant,
          purchaseDate,
          amountMinor,
          currency,
          category,
          description: note
        }
      }
    ]
  }
}

const defaultReceiptDocumentParser = new ReceiptDocumentParser()

export function parseReceiptDocument(input: ParseReceiptDocumentInput): ExtractedRecord[] {
  return defaultReceiptDocumentParser.parse(input)
}