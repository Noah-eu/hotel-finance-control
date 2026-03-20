import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  parseAmountMinor,
  parseDelimitedContent,
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
  'reservationId'
]

const HEADER_ALIASES = {
  payoutDate: ['payoutDate', 'payout_date', 'date', 'datumVyplaty', 'datum', 'payoutDate', 'payout date'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'netAmount', 'castka', 'částka'],
  currency: ['currency', 'mena', 'měna'],
  payoutReference: [
    'payoutReference',
    'payout_reference',
    'reference',
    'paymentReference',
    'bookingReference',
    'rezervace',
    'payoutId',
    'payout id'
  ],
  reservationId: [
    'reservationId',
    'reservation_id',
    'reservation',
    'bookingId',
    'bookingNumber',
    'cisloRezervace',
    'čísloRezervace',
    'referenceNumber',
    'reference number'
  ],
  propertyId: ['propertyId', 'property_id', 'property', 'hotelId', 'propertyCode', 'ubytovani', 'listingName']
} satisfies Record<string, string[]>

export class BookingPayoutParser {
  parse(input: ParseBookingPayoutExportInput): ExtractedRecord[] {
    const parsed = parseDelimitedContent(input.content, { canonicalHeaders: HEADER_ALIASES })
    const rows = parsed.rows

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS)
    if (missing.length > 0) {
      throw new Error(
        `Booking payout export is missing required columns: ${missing.join(', ')}. Raw detected header row: ${parsed.rawHeaderRow}. Detected normalized headers: ${parsed.headers.join(', ')}`
      )
    }

    return rows.map((row, index) => {
      const recordId = `booking-payout-${index + 1}`
      const payoutDate = parseIsoDate(row.payoutDate, 'Booking payoutDate')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Booking amountMinor')
      const currency = row.currency.trim().toUpperCase()
      const payoutReference = row.payoutReference.trim()
      const reservationId = row.reservationId.trim()
      const propertyId = typeof row.propertyId === 'string' ? row.propertyId.trim() : undefined
      const bookingPayoutBatchKey = buildBookingPayoutBatchKey(payoutReference, payoutDate)

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
          bookingPayoutBatchKey,
          reservationId,
          ...(propertyId ? { propertyId } : {})
        }
      }
    })
  }
}

export function inspectBookingPayoutHeaders(content: string): string[] {
  return parseDelimitedContent(content, { canonicalHeaders: HEADER_ALIASES }).headers
}

export function inspectBookingPayoutHeaderDiagnostics(content: string): { rawHeaderRow: string, headers: string[] } {
  const parsed = parseDelimitedContent(content, { canonicalHeaders: HEADER_ALIASES })
  return {
    rawHeaderRow: parsed.rawHeaderRow,
    headers: parsed.headers
  }
}

function buildBookingPayoutBatchKey(payoutReference: string, payoutDate: string): string {
  return `booking-batch:${payoutDate}:${payoutReference.trim().toUpperCase()}`
}

const defaultBookingPayoutParser = new BookingPayoutParser()

export function parseBookingPayoutExport(input: ParseBookingPayoutExportInput): ExtractedRecord[] {
  return defaultBookingPayoutParser.parse(input)
}