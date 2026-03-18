import type { ExtractedRecord, SourceDocument } from '../../domain'

export interface ParseComgateExportInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

const REQUIRED_HEADERS = [
  'paidAt',
  'amountMinor',
  'currency',
  'reference',
  'paymentPurpose',
  'reservationId'
]

export class ComgateParser {
  parse(input: ParseComgateExportInput): ExtractedRecord[] {
    const rows = parseCsv(input.content)

    if (rows.length === 0) {
      return []
    }

    const headers = Object.keys(rows[0])
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
    if (missing.length > 0) {
      throw new Error(`Comgate export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const recordId = `comgate-row-${index + 1}`
      const paidAt = row.paidAt.trim()
      const amountMinor = Number.parseInt(row.amountMinor, 10)
      const currency = row.currency.trim()
      const reference = row.reference.trim()
      const paymentPurpose = row.paymentPurpose.trim()
      const reservationId = row.reservationId.trim()

      return {
        id: recordId,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'payout-line',
        extractedAt: input.extractedAt,
        rawReference: reference,
        amountMinor,
        currency,
        occurredAt: paidAt,
        data: {
          platform: 'comgate',
          bookedAt: paidAt,
          amountMinor,
          currency,
          accountId: 'expected-payouts',
          reference,
          reservationId,
          paymentPurpose
        }
      }
    })
  }
}

const defaultComgateParser = new ComgateParser()

export function parseComgateExport(input: ParseComgateExportInput): ExtractedRecord[] {
  return defaultComgateParser.parse(input)
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return []
  }

  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    return headers.reduce<Record<string, string>>((accumulator, header, index) => {
      accumulator[header] = values[index] ?? ''
      return accumulator
    }, {})
  })
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((value) => value.trim())
}