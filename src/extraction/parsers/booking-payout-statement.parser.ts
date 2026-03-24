import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  normalizeDocumentDate,
  parseDocumentMoney,
  parseLabeledDocumentText,
  pickRequiredField
} from './document-utils'

export interface ParseBookingPayoutStatementPdfInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

export interface BookingPayoutStatementSignals {
  hasBookingBranding: boolean
  hasStatementWording: boolean
  paymentId?: string
  payoutDateRaw?: string
  payoutTotalRaw?: string
  ibanValue?: string
  reservationIds: string[]
}

export class BookingPayoutStatementPdfParser {
  parse(input: ParseBookingPayoutStatementPdfInput): ExtractedRecord[] {
    const fields = parseLabeledDocumentText(input.content)
    const signals = detectBookingPayoutStatementSignals(input.content)
    const paymentId = pickRequiredField(fields, ['payment id', 'paymentid', 'booking payment id']) ?? signals.paymentId
    const payoutDateRaw = pickRequiredField(fields, ['payment date', 'payout date', 'transfer date', 'date']) ?? signals.payoutDateRaw
    const payoutTotalRaw = pickRequiredField(fields, ['payout total', 'payment total', 'total payout', 'transfer total', 'total transfer']) ?? signals.payoutTotalRaw

    if (!paymentId || !payoutDateRaw || !payoutTotalRaw) {
      throw new Error(
        'Booking payout statement PDF is missing required labeled fields: paymentId, payoutDate, payoutTotal.'
      )
    }

    const payoutDate = normalizeDocumentDate(payoutDateRaw, 'Booking payout statement payoutDate')
    const { amountMinor, currency } = parseDocumentMoney(
      payoutTotalRaw,
      'Booking payout statement payoutTotal'
    )
    const ibanSuffix = extractIbanSuffix(
      pickRequiredField(fields, ['iban', 'bank account', 'bank account hint', 'account'])
      ?? signals.ibanValue
    )
    const reservationIds = signals.reservationIds

    return [{
      id: 'booking-payout-statement-1',
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'payout-supplement',
      extractedAt: input.extractedAt,
      rawReference: paymentId.trim(),
      amountMinor,
      currency,
      occurredAt: payoutDate,
      data: {
        platform: 'booking',
        supplementRole: 'payout_statement',
        paymentId: paymentId.trim(),
        payoutDate,
        amountMinor,
        currency,
        ...(ibanSuffix ? { ibanSuffix } : {}),
        ...(reservationIds.length > 0 ? { reservationIds } : {})
      }
    }]
  }
}

const defaultBookingPayoutStatementPdfParser = new BookingPayoutStatementPdfParser()

export function parseBookingPayoutStatementPdf(
  input: ParseBookingPayoutStatementPdfInput
): ExtractedRecord[] {
  return defaultBookingPayoutStatementPdfParser.parse(input)
}

export function detectBookingPayoutStatementSignals(content: string): BookingPayoutStatementSignals {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    hasBookingBranding: /\bbooking(?:\.com| com| bv)?\b/i.test(normalized),
    hasStatementWording: /\b(?:payout|payment|transfer)\s+(?:statement|overview|summary)\b/i.test(normalized),
    paymentId: captureBookingStatementValue(normalized, [
      /\b(?:payment|payout)\s*id\b[:\s-]*([A-Z0-9-]{6,})/i,
      /\bbooking\s+payment\s+id\b[:\s-]*([A-Z0-9-]{6,})/i
    ]),
    payoutDateRaw: captureBookingStatementValue(normalized, [
      /\b(?:payment|payout|transfer)\s*date\b[:\s-]*([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4})/i,
      /\bdate\b[:\s-]*([0-9]{4}-[0-9]{2}-[0-9]{2})/i
    ]),
    payoutTotalRaw: captureBookingStatementValue(normalized, [
      /\b(?:payout|payment|transfer)\s*total\b[:\s-]*([0-9][0-9\s.,-]*\s+[A-Z]{3})/i,
      /\btotal\s+(?:payout|payment|transfer)\b[:\s-]*([0-9][0-9\s.,-]*\s+[A-Z]{3})/i
    ]),
    ibanValue: captureBookingStatementValue(normalized, [
      /\biban\b[:\s-]*([A-Z]{2}[0-9A-Z ]{8,})/i,
      /\bbank\s+account\b[:\s-]*([A-Z]{2}[0-9A-Z ]{8,})/i
    ]),
    reservationIds: extractReservationIds(content)
  }
}

function extractIbanSuffix(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const digits = value.match(/\d/g)

  if (!digits || digits.length < 4) {
    return undefined
  }

  return digits.slice(-4).join('')
}

function extractReservationIds(content: string): string[] {
  const matches = content.match(/\bRES-[A-Z0-9-]+\b/gi) ?? []
  return Array.from(new Set(matches.map((value) => value.trim())))
}

function captureBookingStatementValue(
  content: string,
  patterns: RegExp[]
): string | undefined {
  for (const pattern of patterns) {
    const match = content.match(pattern)
    const value = match?.[1]?.trim()

    if (value) {
      return value
    }
  }

  return undefined
}
