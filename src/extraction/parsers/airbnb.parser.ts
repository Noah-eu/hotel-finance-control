import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParseAirbnbPayoutExportInput {
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
  'listingId'
]

const HEADER_ALIASES = {
  payoutDate: ['payoutDate', 'payout_date', 'arrivalDate', 'datumVyplaty', 'date'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'netPayout', 'castka', 'částka'],
  currency: ['currency', 'mena', 'měna'],
  payoutReference: ['payoutReference', 'payout_reference', 'reference', 'transactionId'],
  reservationId: ['reservationId', 'reservation_id', 'confirmationCode', 'reservationCode'],
  listingId: ['listingId', 'listing_id', 'propertyId', 'listing']
} satisfies Record<string, string[]>

export class AirbnbPayoutParser {
  parse(input: ParseAirbnbPayoutExportInput): ExtractedRecord[] {
    const rows = parseDelimitedRows(input.content, { canonicalHeaders: HEADER_ALIASES })

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS)
    if (missing.length > 0) {
      throw new Error(`Airbnb payout export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const payoutDate = parseIsoDate(row.payoutDate, 'Airbnb payoutDate')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Airbnb amountMinor')
      const currency = row.currency.trim().toUpperCase()
      const payoutReference = row.payoutReference.trim()
      const reservationId = row.reservationId.trim()
      const listingId = row.listingId.trim()

      return {
        id: `airbnb-payout-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'payout-line',
        extractedAt: input.extractedAt,
        rawReference: payoutReference,
        amountMinor,
        currency,
        occurredAt: payoutDate,
        data: {
          platform: 'airbnb',
          bookedAt: payoutDate,
          amountMinor,
          currency,
          accountId: 'expected-payouts',
          reference: payoutReference,
          reservationId,
          propertyId: listingId,
          listingId
        }
      }
    })
  }
}

const defaultAirbnbPayoutParser = new AirbnbPayoutParser()

export function parseAirbnbPayoutExport(input: ParseAirbnbPayoutExportInput): ExtractedRecord[] {
  return defaultAirbnbPayoutParser.parse(input)
}