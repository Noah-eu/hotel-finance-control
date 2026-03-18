import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

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

const HEADER_ALIASES = {
  payoutDate: ['payoutDate', 'payout_date', 'date', 'datumVyplaty', 'datum'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'netAmount', 'castka', 'částka'],
  currency: ['currency', 'mena', 'měna'],
  payoutReference: ['payoutReference', 'payout_reference', 'reference', 'paymentReference'],
  reservationId: ['reservationId', 'reservation_id', 'reservation', 'bookingId'],
  propertyId: ['propertyId', 'property_id', 'property', 'hotelId']
} satisfies Record<string, string[]>

export class BookingPayoutParser {
  parse(input: ParseBookingPayoutExportInput): ExtractedRecord[] {
    const rows = parseDelimitedRows(input.content, { canonicalHeaders: HEADER_ALIASES })

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS)
    if (missing.length > 0) {
      throw new Error(`Booking payout export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const recordId = `booking-payout-${index + 1}`
      const payoutDate = parseIsoDate(row.payoutDate, 'Booking payoutDate')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Booking amountMinor')
      const currency = row.currency.trim().toUpperCase()
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