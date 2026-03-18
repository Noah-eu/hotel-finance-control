import type { ExtractedRecord } from '../../domain'
import type { DeterministicDocumentParserInput } from '../contracts'

const REQUIRED_FIELDS = [
  'Invoice No',
  'Supplier',
  'Issue date',
  'Due date',
  'Total',
  'Service'
]

export interface ParseInvoiceDocumentInput extends DeterministicDocumentParserInput {}

export class InvoiceDocumentParser {
  parse(input: ParseInvoiceDocumentInput): ExtractedRecord[] {
    const fields = parseLabeledText(input.content)
    const missing = REQUIRED_FIELDS.filter((field) => !fields[field])

    if (missing.length > 0) {
      throw new Error(`Invoice document is missing required fields: ${missing.join(', ')}`)
    }

    const invoiceNumber = fields['Invoice No']
    const supplier = fields.Supplier
    const issueDate = normalizeDate(fields['Issue date'])
    const dueDate = normalizeDate(fields['Due date'])
    const { amountMinor, currency } = parseMoney(fields.Total)
    const description = fields.Service

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

function parseLabeledText(content: string): Record<string, string> {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .reduce<Record<string, string>>((accumulator, line) => {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex === -1) {
        return accumulator
      }

      const label = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()
      accumulator[label] = value
      return accumulator
    }, {})
}

function normalizeDate(value: string): string {
  return value.trim()
}

function parseMoney(value: string): { amountMinor: number; currency: string } {
  const match = value.trim().match(/^(?<amount>[\d\s]+)\s+(?<currency>[A-Z]{3})$/)

  if (!match?.groups) {
    throw new Error(`Invoice total has unsupported format: ${value}`)
  }

  const amountMinor = Number.parseInt(match.groups.amount.replace(/\s+/g, ''), 10)
  const currency = match.groups.currency

  return {
    amountMinor,
    currency
  }
}