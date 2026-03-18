import type { ExtractedRecord, SourceDocument } from '../../domain'

export interface ParseFioStatementInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

const REQUIRED_HEADERS = [
  'bookedAt',
  'amountMinor',
  'currency',
  'accountId',
  'counterparty',
  'reference',
  'transactionType'
]

export class FioParser {
  parse(input: ParseFioStatementInput): ExtractedRecord[] {
    const rows = parseCsv(input.content)

    if (rows.length === 0) {
      return []
    }

    const headers = Object.keys(rows[0])
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
    if (missing.length > 0) {
      throw new Error(`Fio statement is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const recordId = `fio-row-${index + 1}`
      const bookedAt = row.bookedAt.trim()
      const amountMinor = Number.parseInt(row.amountMinor, 10)
      const currency = row.currency.trim()
      const accountId = row.accountId.trim()
      const counterparty = row.counterparty.trim()
      const reference = row.reference.trim()
      const transactionType = row.transactionType.trim()

      return {
        id: recordId,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'bank-transaction',
        extractedAt: input.extractedAt,
        rawReference: reference,
        amountMinor,
        currency,
        occurredAt: bookedAt,
        data: {
          sourceSystem: 'bank',
          bookedAt,
          amountMinor,
          currency,
          accountId,
          counterparty,
          reference,
          transactionType
        }
      }
    })
  }
}

const defaultFioParser = new FioParser()

export function parseFioStatement(input: ParseFioStatementInput): ExtractedRecord[] {
  return defaultFioParser.parse(input)
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
