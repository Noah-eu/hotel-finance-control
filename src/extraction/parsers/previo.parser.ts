import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParsePrevioReservationExportInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

const REQUIRED_HEADERS = [
  'stayDate',
  'amountMinor',
  'currency',
  'reservationReference',
  'reservationId',
  'propertyId'
]

const HEADER_ALIASES = {
  stayDate: ['stayDate', 'stay_date', 'serviceDate', 'datumPobytu', 'datum'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'grossAmount', 'castka', 'částka'],
  currency: ['currency', 'mena', 'měna'],
  reservationReference: ['reservationReference', 'reservation_reference', 'reference', 'bookingReference'],
  reservationId: ['reservationId', 'reservation_id', 'reservationNumber', 'bookingNumber'],
  propertyId: ['propertyId', 'property_id', 'hotelId', 'propertyCode']
} satisfies Record<string, string[]>

export class PrevioReservationParser {
  parse(input: ParsePrevioReservationExportInput): ExtractedRecord[] {
    const rows = parseDelimitedRows(input.content, { canonicalHeaders: HEADER_ALIASES })

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS)
    if (missing.length > 0) {
      throw new Error(`Previo reservation export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const stayDate = parseIsoDate(row.stayDate, 'Previo stayDate')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Previo amountMinor')
      const currency = row.currency.trim().toUpperCase()
      const reservationReference = row.reservationReference.trim()
      const reservationId = row.reservationId.trim()
      const propertyId = row.propertyId.trim()

      return {
        id: `previo-reservation-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'payout-line',
        extractedAt: input.extractedAt,
        rawReference: reservationReference,
        amountMinor,
        currency,
        occurredAt: stayDate,
        data: {
          platform: 'previo',
          bookedAt: stayDate,
          amountMinor,
          currency,
          accountId: 'expected-payouts',
          reference: reservationReference,
          reservationId,
          propertyId
        }
      }
    })
  }
}

const defaultPrevioReservationParser = new PrevioReservationParser()

export function parsePrevioReservationExport(input: ParsePrevioReservationExportInput): ExtractedRecord[] {
  return defaultPrevioReservationParser.parse(input)
}