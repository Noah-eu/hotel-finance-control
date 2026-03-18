import type { ExtractedRecord } from '../../domain'
import type { DeterministicDocumentParserInput } from '../contracts'
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
    const fields = parseLabeledDocumentText(input.content)
    const invoiceNumber = pickRequiredField(fields, FIELD_ALIASES.invoiceNumber)
    const supplier = pickRequiredField(fields, FIELD_ALIASES.supplier)
    const issueDateRaw = pickRequiredField(fields, FIELD_ALIASES.issueDate)
    const dueDateRaw = pickRequiredField(fields, FIELD_ALIASES.dueDate)
    const totalRaw = pickRequiredField(fields, FIELD_ALIASES.total)
    const description = pickRequiredField(fields, FIELD_ALIASES.service)

    const missing = REQUIRED_FIELDS.filter((field) => {
      switch (field) {
        case 'Invoice No':
          return !invoiceNumber
        case 'Supplier':
          return !supplier
        case 'Issue date':
          return !issueDateRaw
        case 'Due date':
          return !dueDateRaw
        case 'Total':
          return !totalRaw
        case 'Service':
          return !description
        default:
          return false
      }
    })

    if (missing.length > 0) {
      throw new Error(`Invoice document is missing required fields: ${missing.join(', ')}`)
    }

    const issueDate = normalizeDocumentDate(issueDateRaw!, 'Invoice issue date')
    const dueDate = normalizeDocumentDate(dueDateRaw!, 'Invoice due date')
    const { amountMinor, currency } = parseDocumentMoney(totalRaw!, 'Invoice total')

    const record: ExtractedRecord = {
      id: 'invoice-record-1',
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'invoice-document',
      extractedAt: input.extractedAt,
      rawReference: invoiceNumber,
      amountMinor,
      currency,
      occurredAt: issueDate,
      data: {
        sourceSystem: 'invoice',
        invoiceNumber,
        supplier,
        issueDate,
        dueDate,
        amountMinor,
        currency,
        description
      }
    }

    return [record]
  }
}

const defaultInvoiceDocumentParser = new InvoiceDocumentParser()

export function parseInvoiceDocument(input: ParseInvoiceDocumentInput): ExtractedRecord[] {
  return defaultInvoiceDocumentParser.parse(input)
}