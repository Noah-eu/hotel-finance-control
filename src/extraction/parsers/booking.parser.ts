import type { ExtractedRecord, SourceDocument } from '../../domain'

export interface ParseBookingPayoutExportInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

const REQUIRED_HEADERS = [
  'payoutDate',
  'amountMinor',
  'currency',
  'payoutReference',
  'reservationId',
  'propertyId'
]

export class BookingPayoutParser {
  parse(input: ParseBookingPayoutExportInput): ExtractedRecord[] {
    const rows = parseCsv(input.content)

    if (rows.length === 0) {
      return []
    }

    const headers = Object.keys(rows[0])
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
    if (missing.length > 0) {
      throw new Error(`Booking payout export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const recordId = `booking-payout-${index + 1}`
      const payoutDate = row.payoutDate.trim()
      const amountMinor = Number.parseInt(row.amountMinor, 10)
      const currency = row.currency.trim()
      const payoutReference = row.payoutReference.trim()
      const reservationId = row.reservationId.trim()
      const propertyId = row.propertyId.trim()

      return {
        id: recordId,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'payout-line',
        extractedAt: input.extractedAt,
        rawReference: payoutReference,
        amountMinor,
        currency,
        occurredAt: payoutDate,
        data: {
          platform: 'booking',
          bookedAt: payoutDate,
          amountMinor,
          currency,
          accountId: 'expected-payouts',
          reference: payoutReference,
          reservationId,
          propertyId
        }
      }
    })
  }
}

const defaultBookingPayoutParser = new BookingPayoutParser()

export function parseBookingPayoutExport(input: ParseBookingPayoutExportInput): ExtractedRecord[] {
  return defaultBookingPayoutParser.parse(input)
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