import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParseExpediaPayoutExportInput {
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

const HEADER_ALIASES = {
  payoutDate: ['payoutDate', 'payout_date', 'depositDate', 'datumVyplaty', 'date'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'netAmount', 'castka', 'částka'],
  currency: ['currency', 'mena', 'měna'],
  payoutReference: ['payoutReference', 'payout_reference', 'reference', 'itineraryReference'],
  reservationId: ['reservationId', 'reservation_id', 'reservation', 'itineraryId'],
  propertyId: ['propertyId', 'property_id', 'hotelId', 'propertyCode']
} satisfies Record<string, string[]>

export class ExpediaPayoutParser {
  parse(input: ParseExpediaPayoutExportInput): ExtractedRecord[] {
    const rows = parseDelimitedRows(input.content, { canonicalHeaders: HEADER_ALIASES })

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS)
    if (missing.length > 0) {
      throw new Error(`Expedia payout export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const payoutDate = parseIsoDate(row.payoutDate, 'Expedia payoutDate')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Expedia amountMinor')
      const currency = row.currency.trim().toUpperCase()
      const payoutReference = row.payoutReference.trim()
      const reservationId = row.reservationId.trim()
      const propertyId = row.propertyId.trim()

      return {
        id: `expedia-payout-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'payout-line',
        extractedAt: input.extractedAt,
        rawReference: payoutReference,
        amountMinor,
        currency,
        occurredAt: payoutDate,
        data: {
          platform: 'expedia',
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

const defaultExpediaPayoutParser = new ExpediaPayoutParser()

export function parseExpediaPayoutExport(input: ParseExpediaPayoutExportInput): ExtractedRecord[] {
  return defaultExpediaPayoutParser.parse(input)
}