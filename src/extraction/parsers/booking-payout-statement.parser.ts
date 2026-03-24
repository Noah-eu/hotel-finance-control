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
    const paymentId = normalizeBookingStatementReferenceValue(
      pickRequiredField(fields, ['payment id', 'paymentid', 'booking payment id']) ?? signals.paymentId
    )
    const payoutDateRaw = normalizeBookingStatementDateValue(
      pickRequiredField(fields, ['payment date', 'payout date', 'transfer date', 'date']) ?? signals.payoutDateRaw
    )
    const payoutTotalRaw = normalizeBookingStatementMoneyValue(
      pickRequiredField(fields, ['payout total', 'payment total', 'total payout', 'transfer total', 'total transfer']) ?? signals.payoutTotalRaw
    )

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
  const normalized = normalizeBookingPayoutStatementSignalContent(content)
  const compact = normalized.toUpperCase().replace(/[^A-Z0-9]/g, '')

  return {
    hasBookingBranding:
      /\bbooking(?:\s*\.\s*com|\s+com|\s+bv)?\b/i.test(normalized)
      || compact.includes('BOOKINGCOM')
      || compact.includes('BOOKINGBV'),
    hasStatementWording:
      /\b(?:payout|payment|transfer)\s+(?:statement|overview|summary)\b/i.test(normalized)
      || compact.includes('PAYOUTSTATEMENT')
      || compact.includes('PAYOUTOVERVIEW')
      || compact.includes('PAYOUTSUMMARY')
      || compact.includes('PAYMENTOVERVIEW')
      || compact.includes('PAYMENTSUMMARY')
      || compact.includes('PAYMENTSTATEMENT')
      || compact.includes('TRANSFEROVERVIEW')
      || compact.includes('TRANSFERSUMMARY'),
    paymentId: captureBookingStatementValue(normalized, [
      /\b(?:payment|payout)\s*id\b[:\s-]*([A-Z0-9-]{6,})/i,
      /\bbooking\s+payment\s+id\b[:\s-]*([A-Z0-9-]{6,})/i
    ]) ?? captureStandaloneBookingPaymentId(normalized, compact),
    payoutDateRaw: normalizeBookingStatementDateValue(captureBookingStatementValue(normalized, [
      /\b(?:payment|payout|transfer)\s*date\b[:\s-]*([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4})/i,
      /\bdate\b[:\s-]*([0-9]{4}-[0-9]{2}-[0-9]{2})/i
    ]) ?? captureStandaloneBookingPayoutDate(normalized) ?? captureCompactBookingPayoutDate(compact)),
    payoutTotalRaw: captureBookingStatementValue(normalized, [
      /\b(?:payout|payment|transfer)\s*total\b[:\s-]*([0-9][0-9\s.,-]*\s*[A-Z]{3})/i,
      /\btotal\s+(?:payout|payment|transfer)\b[:\s-]*([0-9][0-9\s.,-]*\s*[A-Z]{3})/i
    ]) ?? captureStandaloneBookingPayoutTotal(normalized) ?? captureCompactBookingPayoutTotal(compact),
    ibanValue: captureBookingStatementValue(normalized, [
      /\biban\b[:\s-]*([A-Z]{2}[0-9A-Z ]{8,})/i,
      /\bbank\s+account\b[:\s-]*([A-Z]{2}[0-9A-Z ]{8,})/i
    ]) ?? captureStandaloneIban(normalized),
    reservationIds: extractReservationIds(normalized)
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

function normalizeBookingPayoutStatementSignalContent(content: string): string {
  let normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  let previous = ''

  while (normalized !== previous) {
    previous = normalized
    normalized = normalized
      .replace(/\b(?:[A-Za-z0-9]\s+){2,}[A-Za-z0-9]\b/g, (match) => match.replace(/\s+/g, ''))
      .replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ''))
      .replace(/([A-Za-z0-9])\s*([.:\-/])\s*([A-Za-z0-9])/g, '$1$2$3')
      .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')
      .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return normalized
}

function captureStandaloneBookingPaymentId(
  normalized: string,
  compact: string
): string | undefined {
  const directMatch = normalized.match(/\bPAYOUT-BOOK-[A-Z0-9-]{6,}\b/i)?.[0]?.trim()

  if (directMatch) {
    return directMatch
  }

  const compactMatch = compact.match(/PAYOUTBOOK([A-Z0-9]{6,})/)

  if (!compactMatch?.[1]) {
    return undefined
  }

  return `PAYOUT-BOOK-${compactMatch[1]}`
}

function captureStandaloneBookingPayoutDate(normalized: string): string | undefined {
  const keywordDate = captureBookingStatementValue(normalized, [
    /\b(?:payment|payout|transfer)\b.{0,24}?([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4})/i
  ])

  if (keywordDate) {
    return keywordDate
  }

  const uniqueDates = Array.from(new Set(
    Array.from(normalized.matchAll(/\b([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4})\b/g))
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value))
  ))

  return uniqueDates.length === 1 ? uniqueDates[0] : undefined
}

function captureCompactBookingPayoutDate(compact: string): string | undefined {
  const match = compact.match(/(?:PAYMENTDATE|PAYOUTDATE|TRANSFERDATE)(\d{4})(\d{2})(\d{2})/)

  if (!match) {
    return undefined
  }

  return `${match[1]}-${match[2]}-${match[3]}`
}

function captureStandaloneBookingPayoutTotal(normalized: string): string | undefined {
  const keywordMoney = normalizeBookingStatementMoneyValue(captureBookingStatementValue(normalized, [
    /\b(?:payout|payment|transfer)\b.{0,32}?([0-9][0-9\s.,-]*\s*[A-Z]{3})\b/i
  ]))

  if (keywordMoney) {
    return keywordMoney
  }

  const uniqueMoneyValues = Array.from(new Set(
    Array.from(normalized.matchAll(/\b([0-9][0-9\s.,-]*\s*[A-Z]{3})\b/g))
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeBookingStatementMoneyValue(value))
      .filter((value): value is string => Boolean(value))
  ))

  return uniqueMoneyValues.length === 1 ? uniqueMoneyValues[0] : undefined
}

function captureCompactBookingPayoutTotal(compact: string): string | undefined {
  const match = compact.match(/(?:PAYOUTTOTAL|PAYMENTTOTAL|TRANSFERTOTAL|TOTALPAYOUT|TOTALPAYMENT|TOTALTRANSFER)(\d{3,})(CZK|EUR|USD)/)

  if (!match?.[1] || !match[2]) {
    return undefined
  }

  const digits = match[1]

  if (digits.length < 3) {
    return undefined
  }

  const major = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'
  const minor = digits.slice(-2)

  return `${major},${minor} ${match[2]}`
}

function captureStandaloneIban(normalized: string): string | undefined {
  return normalized.match(/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]){8,})\b/i)?.[1]?.trim()
}

function normalizeBookingStatementMoneyValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b(?:\d\s+){2,}\d\b/g, (match) => match.replace(/\s+/g, ''))
    .replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ''))
    .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')
    .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
    .replace(/([0-9.,-])([A-Z]{3})$/i, '$1 $2')
}

function normalizeBookingStatementDateValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return value.trim().replace(/\s+/g, '')
}

function normalizeBookingStatementReferenceValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return value.trim().replace(/\s+/g, '').toUpperCase()
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
