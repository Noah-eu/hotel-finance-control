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
  'reservationId'
]

const HEADER_ALIASES = {
  stayDate: ['stayDate', 'stay_date', 'serviceDate', 'datumPobytu', 'datum', 'checkIn', 'checkin', 'arrivalDate', 'arrival'],
  stayEndDate: ['stayEndDate', 'stay_end_date', 'checkout', 'checkOut', 'departureDate', 'departure', 'checkOutDate'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'grossAmount', 'castka', 'částka'],
  netAmountMinor: ['netAmountMinor', 'net_amount_minor', 'netAmount', 'amountNet', 'cistaCastka', 'čistá částka'],
  currency: ['currency', 'mena', 'měna'],
  reservationReference: ['reservationReference', 'reservation_reference', 'reference', 'bookingReference'],
  reservationId: ['reservationId', 'reservation_id', 'reservationNumber', 'bookingNumber'],
  propertyId: ['propertyId', 'property_id', 'hotelId', 'propertyCode'],
  guestName: ['guestName', 'guest_name', 'guest', 'name', 'guestFullName', 'jmenoHosta', 'jméno hosta'],
  channel: ['channel', 'platform', 'sourceChannel', 'reservationSource', 'zdroj', 'kanal', 'kanál']
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
      const stayEndDate = typeof row.stayEndDate === 'string' && row.stayEndDate.trim().length > 0
        ? parseIsoDate(row.stayEndDate, 'Previo stayEndDate')
        : undefined
      const amountMinor = parseAmountMinor(row.amountMinor, 'Previo amountMinor')
      const netAmountMinor = typeof row.netAmountMinor === 'string' && row.netAmountMinor.trim().length > 0
        ? parseAmountMinor(row.netAmountMinor, 'Previo netAmountMinor')
        : undefined
      const currency = row.currency.trim().toUpperCase()
      const reservationReference = row.reservationReference.trim()
      const reservationId = row.reservationId.trim()
      const propertyId = typeof row.propertyId === 'string' ? row.propertyId.trim() : undefined
      const guestName = typeof row.guestName === 'string' ? row.guestName.trim() : undefined
      const channel = typeof row.channel === 'string' ? row.channel.trim() : undefined

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
          stayStartAt: stayDate,
          stayEndAt: stayEndDate,
          amountMinor,
          netAmountMinor,
          currency,
          accountId: 'expected-payouts',
          reference: reservationReference,
          reservationId,
          propertyId,
          guestName,
          channel
        }
      }
    })
  }
}

const defaultPrevioReservationParser = new PrevioReservationParser()

export function parsePrevioReservationExport(input: ParsePrevioReservationExportInput): ExtractedRecord[] {
  return defaultPrevioReservationParser.parse(input)
}