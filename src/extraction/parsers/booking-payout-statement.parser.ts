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
  const scan = buildBookingPayoutStatementSignalScan(content)

  return {
    hasBookingBranding:
      /\bbooking(?:\s*\.\s*com|\s+com|\s+bv)?\b/i.test(scan.normalized)
      || scan.compact.includes('BOOKINGCOM')
      || scan.compact.includes('BOOKINGBV'),
    hasStatementWording:
      /\b(?:payout|payment|transfer)\s+(?:statement|overview|summary)\b/i.test(scan.asciiNormalized)
      || /\b(?:vykaz|prehled|souhrn)\s+plateb\b/i.test(scan.asciiNormalized)
      || scan.compact.includes('PAYOUTSTATEMENT')
      || scan.compact.includes('PAYOUTOVERVIEW')
      || scan.compact.includes('PAYOUTSUMMARY')
      || scan.compact.includes('PAYMENTOVERVIEW')
      || scan.compact.includes('PAYMENTSUMMARY')
      || scan.compact.includes('PAYMENTSTATEMENT')
      || scan.compact.includes('TRANSFEROVERVIEW')
      || scan.compact.includes('TRANSFERSUMMARY')
      || scan.compact.includes('VYKAZPLATEB')
      || scan.compact.includes('PREHLEDPLATEB'),
    paymentId: captureBookingStatementValue(scan.normalized, [
      /\b(?:payment|payout)\s*id\b[:\s-]*([A-Z0-9-]{6,})/i,
      /\bbooking\s+payment\s+id\b[:\s-]*([A-Z0-9-]{6,})/i
    ]) ?? captureBookingStatementValue(scan.asciiNormalized, [
      /\bid\s+platby\b[:\s-]*([A-Z0-9-]{6,})/i,
      /\bid\s+vyplaty\b[:\s-]*([A-Z0-9-]{6,})/i
    ]) ?? captureStandaloneBookingPaymentId(scan.normalized, scan.compact),
    payoutDateRaw: normalizeBookingStatementDateValue(captureBookingStatementValue(scan.normalized, [
      /\b(?:payment|payout|transfer)\s*date\b[:\s-]*([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[A-Za-zÀ-ž]+\s+\d{4})/i,
      /\bdate\b[:\s-]*([0-9]{4}-[0-9]{2}-[0-9]{2})/i
    ]) ?? captureBookingStatementValue(scan.asciiNormalized, [
      /\bdatum\s+vyplaceni\s+castky\b[:\s-]*([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[a-z]+\s+\d{4})/i,
      /\bdatum\s+platby\b[:\s-]*([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[a-z]+\s+\d{4})/i
    ]) ?? captureStandaloneBookingPayoutDate(scan.normalized, scan.asciiNormalized) ?? captureCompactBookingPayoutDate(scan.compact)),
    payoutTotalRaw: normalizeBookingStatementMoneyValue(
      captureBookingLocalCurrencyTotal(scan.asciiNormalized)
      ?? captureBookingStatementValue(scan.normalized, [
        /\b(?:payout|payment|transfer)\s*total\b[:\s-]*([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:Kč|CZK|EUR|USD))?)/i,
        /\btotal\s+(?:payout|payment|transfer)\b[:\s-]*([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:Kč|CZK|EUR|USD))?)/i,
        /\bcelkov[áa]\s+částka\s+k\s+vyplacení\b[:\s-]*([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:Kč|CZK|EUR|USD))?)/i
      ])
      ?? captureStandaloneBookingPayoutTotal(scan.normalized, scan.asciiNormalized)
      ?? captureCompactBookingPayoutTotal(scan.compact)
    ),
    ibanValue: captureStandaloneIban(scan.normalized),
    reservationIds: extractReservationIds(scan.normalized)
  }
}

export function detectBookingPayoutStatementKeywordHits(content: string): string[] {
  const scan = buildBookingPayoutStatementSignalScan(content)
  const hits: string[] = []

  if (scan.compact.includes('BOOKINGCOMBV')) {
    hits.push('Booking.com B.V.')
  } else if (scan.compact.includes('BOOKINGCOM')) {
    hits.push('Booking.com')
  }

  if (/\b(?:vykaz|prehled|souhrn)\s+plateb\b/i.test(scan.asciiNormalized)) {
    hits.push('Výkaz plateb')
  } else if (/\b(?:payment|payout|transfer)\s+(?:statement|overview|summary)\b/i.test(scan.asciiNormalized)) {
    hits.push('Payment overview')
  }

  if (/\bid\s+platby\b/i.test(scan.asciiNormalized)) {
    hits.push('ID platby')
  } else if (/\b(?:payment|payout)\s*id\b/i.test(scan.asciiNormalized)) {
    hits.push('Payment ID')
  }

  if (/\bdatum\s+vyplaceni\s+castky\b/i.test(scan.asciiNormalized)) {
    hits.push('Datum vyplacení částky')
  } else if (/\b(?:payment|payout|transfer)\s*date\b/i.test(scan.asciiNormalized)) {
    hits.push('Payment date')
  }

  if (/\bcelkem\s*\(\s*czk\s*\)/i.test(scan.asciiNormalized)) {
    hits.push('Celkem (CZK)')
  }

  if (/\bcelkova\s+castka\s+k\s+vyplaceni\b/i.test(scan.asciiNormalized)) {
    hits.push('Celková částka k vyplacení')
  } else if (/\b(?:payout|payment|transfer)\s*total\b|\btotal\s+(?:payout|payment|transfer)\b/i.test(scan.asciiNormalized)) {
    hits.push('Payout total')
  }

  if (/\biban\b/i.test(scan.asciiNormalized)) {
    hits.push('IBAN')
  }

  if (extractReservationIds(scan.normalized).length > 0) {
    hits.push('Reservation reference')
  }

  return Array.from(new Set(hits))
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

function buildBookingPayoutStatementSignalScan(content: string): {
  normalized: string
  asciiNormalized: string
  compact: string
} {
  const normalized = normalizeBookingPayoutStatementSignalContent(content)
  const asciiNormalized = foldToAscii(normalized)

  return {
    normalized,
    asciiNormalized,
    compact: asciiNormalized.toUpperCase().replace(/[^A-Z0-9]/g, '')
  }
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
      .replace(/\b(?:[\p{L}\p{N}]\s+){2,}[\p{L}\p{N}]\b/gu, (match) => match.replace(/\s+/g, ''))
      .replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ''))
      .replace(/([\p{L}\p{N}])\s*([.:\-/])\s*([\p{L}\p{N}])/gu, '$1$2$3')
      .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')
      .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return normalized
}

function foldToAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ß/g, 'ss')
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

function captureStandaloneBookingPayoutDate(
  normalized: string,
  asciiNormalized: string
): string | undefined {
  const asciiKeywordDate = captureBookingStatementValue(asciiNormalized, [
    /\b(?:payment|payout|transfer)\b.{0,32}?([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[a-z]+\s+\d{4})/i,
    /\bdatum\s+vyplaceni\s+castky\b.{0,16}?([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[a-z]+\s+\d{4})/i
  ])

  if (asciiKeywordDate) {
    return asciiKeywordDate
  }

  const uniqueDates = Array.from(new Set(
    [
      ...Array.from(normalized.matchAll(/\b([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4})\b/g)).map((match) => match[1]?.trim()),
      ...Array.from(asciiNormalized.matchAll(/\b(\d{1,2}\.\s*[a-z]+\s+\d{4})\b/g)).map((match) => match[1]?.trim())
    ].filter((value): value is string => Boolean(value))
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

function captureBookingLocalCurrencyTotal(asciiNormalized: string): string | undefined {
  const localCurrencyMatch = asciiNormalized.match(
    /\bcelkem\s*\(\s*(CZK|EUR|USD)\s*\)\s*[:\s-]*([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:KC|CZK|EUR|USD))?)/i
  )

  if (!localCurrencyMatch?.[1] || !localCurrencyMatch[2]) {
    return undefined
  }

  return `${localCurrencyMatch[2].trim()} ${localCurrencyMatch[1].toUpperCase()}`
}

function captureStandaloneBookingPayoutTotal(normalized: string, asciiNormalized: string): string | undefined {
  const localCurrencyMoney = normalizeBookingStatementMoneyValue(captureBookingLocalCurrencyTotal(asciiNormalized))

  if (localCurrencyMoney) {
    return localCurrencyMoney
  }

  const keywordMoney = normalizeBookingStatementMoneyValue(captureBookingStatementValue(normalized, [
    /\b(?:payout|payment|transfer)\b.{0,40}?([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:Kč|CZK|EUR|USD))?)/i,
    /\bcelkov[áa]\s+částka\s+k\s+vyplacení\b.{0,24}?([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:Kč|CZK|EUR|USD))?)/i
  ]) ?? captureBookingStatementValue(asciiNormalized, [
    /\bcelkova\s+castka\s+k\s+vyplaceni\b.{0,24}?([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:kcz|kc|czk|eur|usd))?)/i
  ]))

  if (keywordMoney) {
    return keywordMoney
  }

  const uniqueMoneyValues = Array.from(new Set(
    Array.from(normalized.matchAll(/([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:Kč|CZK|EUR|USD)))/gi))
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
  const upper = foldToAscii(normalized).toUpperCase()
  const labelIndex = upper.search(/\bIBAN\b/)
  const searchSpace = labelIndex === -1
    ? upper
    : upper.slice(labelIndex)
  const tokens = searchSpace
    .replace(/\bIBAN\b[:\s-]*/i, '')
    .trim()
    .split(/\s+/)

  let collected: string[] = []
  let compact = ''

  for (const token of tokens) {
    const cleaned = token.replace(/[^A-Z0-9]/g, '')

    if (!cleaned) {
      if (compact.length >= 15) {
        break
      }

      continue
    }

    if (collected.length === 0 && !/^[A-Z]{2}\d{2}[A-Z0-9]*$/.test(cleaned)) {
      continue
    }

    if (collected.length > 0 && !/^[A-Z0-9]+$/.test(cleaned)) {
      break
    }

    if ((compact + cleaned).length > 34) {
      break
    }

    collected.push(cleaned)
    compact += cleaned
  }

  if (compact.length < 15) {
    return undefined
  }

  return collected.join(' ')
}

function normalizeBookingStatementMoneyValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b(?:\d\s+){2,}\d\b/g, (match) => match.replace(/\s+/g, ''))
    .replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ''))
    .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')
    .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
    .replace(/([0-9.,-])([A-Z]{3})$/i, '$1 $2')
  const currency = detectBookingStatementCurrency(normalized)
  const amount = normalizeBookingStatementAmountValue(normalized)

  if (!currency || !amount) {
    return normalized
  }

  return `${amount} ${currency}`
}

function normalizeBookingStatementDateValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().replace(/\s+/g, ' ')

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  const dottedNumeric = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)

  if (dottedNumeric?.[1] && dottedNumeric[2] && dottedNumeric[3]) {
    return `${dottedNumeric[3]}-${dottedNumeric[2].padStart(2, '0')}-${dottedNumeric[1].padStart(2, '0')}`
  }

  const slashedNumeric = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (slashedNumeric?.[1] && slashedNumeric[2] && slashedNumeric[3]) {
    return `${slashedNumeric[3]}-${slashedNumeric[2].padStart(2, '0')}-${slashedNumeric[1].padStart(2, '0')}`
  }

  const asciiNormalized = foldToAscii(normalized).toLowerCase()
  const monthNameMatch = asciiNormalized.match(/^(\d{1,2})\.?\s*([a-z]+)\s+(\d{4})$/)

  if (monthNameMatch?.[1] && monthNameMatch[2] && monthNameMatch[3]) {
    const month = normalizeBookingStatementMonthName(monthNameMatch[2])

    if (month) {
      return `${monthNameMatch[3]}-${month}-${monthNameMatch[1].padStart(2, '0')}`
    }
  }

  return normalized.replace(/\s+/g, '')
}

function normalizeBookingStatementReferenceValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return value.trim().replace(/\s+/g, '').toUpperCase()
}

function captureBookingStatementValue(
  content: string,
  patterns: RegExp[],
  groupIndex = 1
): string | undefined {
  for (const pattern of patterns) {
    const match = content.match(pattern)
    const value = match?.[groupIndex]?.trim()

    if (value) {
      return value
    }
  }

  return undefined
}

function detectBookingStatementCurrency(value: string): 'CZK' | 'EUR' | 'USD' | undefined {
  const normalized = foldToAscii(value).toUpperCase()

  if (normalized.includes('CZK') || normalized.includes('KC')) {
    return 'CZK'
  }

  if (normalized.includes('EUR') || value.includes('€')) {
    return 'EUR'
  }

  if (normalized.includes('USD') || value.includes('$')) {
    return 'USD'
  }

  return undefined
}

function normalizeBookingStatementAmountValue(value: string): string | undefined {
  const amountMatch = value.match(/-?[0-9][0-9\s.,-]*/)

  if (!amountMatch?.[0]) {
    return undefined
  }

  let normalized = amountMatch[0]
    .replace(/\s+/g, '')
    .replace(/(?!^)-/g, '')

  const lastCommaIndex = normalized.lastIndexOf(',')
  const lastDotIndex = normalized.lastIndexOf('.')

  if (lastCommaIndex !== -1 && lastDotIndex !== -1) {
    if (lastDotIndex > lastCommaIndex) {
      normalized = normalized.replace(/,/g, '')
    } else {
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    }

    return normalized
  }

  if (lastCommaIndex !== -1) {
    const decimalLength = normalized.length - lastCommaIndex - 1
    normalized = decimalLength === 2
      ? normalized.replace(',', '.')
      : normalized.replace(/,/g, '')
    return normalized
  }

  if (lastDotIndex !== -1) {
    const decimalLength = normalized.length - lastDotIndex - 1
    normalized = decimalLength === 2
      ? normalized
      : normalized.replace(/\./g, '')
  }

  return normalized
}

function normalizeBookingStatementMonthName(value: string): string | undefined {
  const monthNameMap = new Map<string, string>([
    ['january', '01'],
    ['jan', '01'],
    ['leden', '01'],
    ['ledna', '01'],
    ['february', '02'],
    ['feb', '02'],
    ['unor', '02'],
    ['unora', '02'],
    ['march', '03'],
    ['mar', '03'],
    ['brezen', '03'],
    ['brezna', '03'],
    ['april', '04'],
    ['apr', '04'],
    ['duben', '04'],
    ['dubna', '04'],
    ['may', '05'],
    ['kveten', '05'],
    ['kvetna', '05'],
    ['june', '06'],
    ['jun', '06'],
    ['cerven', '06'],
    ['cervna', '06'],
    ['july', '07'],
    ['jul', '07'],
    ['cervenec', '07'],
    ['cervence', '07'],
    ['august', '08'],
    ['aug', '08'],
    ['srpen', '08'],
    ['srpna', '08'],
    ['september', '09'],
    ['sep', '09'],
    ['sept', '09'],
    ['zari', '09'],
    ['rijen', '10'],
    ['rijna', '10'],
    ['october', '10'],
    ['oct', '10'],
    ['november', '11'],
    ['nov', '11'],
    ['listopad', '11'],
    ['listopadu', '11'],
    ['december', '12'],
    ['dec', '12'],
    ['prosinec', '12'],
    ['prosince', '12']
  ])

  return monthNameMap.get(value.toLowerCase())
}
