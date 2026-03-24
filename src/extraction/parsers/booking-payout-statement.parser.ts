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
  localTotalRaw?: string
  ibanValue?: string
  exchangeRate?: string
  reservationIds: string[]
}

export interface BookingPayoutStatementFields {
  hasBookingBranding: boolean
  hasStatementWording: boolean
  paymentId?: string
  payoutDate?: string
  payoutTotalRaw?: string
  payoutTotalAmountMinor?: number
  payoutTotalCurrency?: string
  localTotalRaw?: string
  localAmountMinor?: number
  localCurrency?: string
  ibanValue?: string
  ibanSuffix?: string
  exchangeRate?: string
  reservationIds: string[]
}

export interface BookingPayoutStatementFieldCheck {
  fields: BookingPayoutStatementFields
  missingFields: Array<'paymentId' | 'payoutDate' | 'payoutTotal'>
  requiredFieldsCheck: 'passed' | 'failed'
}

export class BookingPayoutStatementPdfParser {
  parse(input: ParseBookingPayoutStatementPdfInput): ExtractedRecord[] {
    const fieldCheck = inspectBookingPayoutStatementFieldCheck(input.content)
    const { fields } = fieldCheck
    const paymentId = fields.paymentId
    const payoutDateRaw = fields.payoutDate
    const payoutTotalRaw = fields.payoutTotalRaw

    if (fieldCheck.requiredFieldsCheck === 'failed' || !paymentId || !payoutDateRaw || !payoutTotalRaw) {
      throw new Error(
        'Booking payout statement PDF is missing required labeled fields: paymentId, payoutDate, payoutTotal.'
      )
    }

    const payoutDate = normalizeDocumentDate(payoutDateRaw, 'Booking payout statement payoutDate')
    const mergeAmountMinor = fields.localAmountMinor ?? fields.payoutTotalAmountMinor
    const mergeCurrency = fields.localCurrency ?? fields.payoutTotalCurrency
    const payoutTotalAmountMinor = fields.payoutTotalAmountMinor
    const payoutTotalCurrency = fields.payoutTotalCurrency
    const localAmountMinor = fields.localAmountMinor
    const localCurrency = fields.localCurrency
    const ibanSuffix = fields.ibanSuffix
    const reservationIds = fields.reservationIds

    if (mergeAmountMinor === undefined || !mergeCurrency || payoutTotalAmountMinor === undefined || !payoutTotalCurrency) {
      throw new Error(
        'Booking payout statement PDF is missing required labeled fields: paymentId, payoutDate, payoutTotal.'
      )
    }

    return [{
      id: 'booking-payout-statement-1',
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'payout-supplement',
      extractedAt: input.extractedAt,
      rawReference: paymentId.trim(),
      amountMinor: mergeAmountMinor,
      currency: mergeCurrency,
      occurredAt: payoutDate,
      data: {
        platform: 'booking',
        supplementRole: 'payout_statement',
        paymentId: paymentId.trim(),
        payoutDate,
        amountMinor: mergeAmountMinor,
        currency: mergeCurrency,
        payoutTotalRaw,
        payoutTotalAmountMinor,
        payoutTotalCurrency,
        ...(fields.localTotalRaw ? { localTotalRaw: fields.localTotalRaw } : {}),
        ...(localAmountMinor !== undefined ? { localAmountMinor } : {}),
        ...(localCurrency ? { localCurrency } : {}),
        ...(ibanSuffix ? { ibanSuffix } : {}),
        ...(fields.exchangeRate ? { exchangeRate: fields.exchangeRate } : {}),
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
  const candidates = collectBookingPayoutStatementFieldCandidates(content)
  const { scan } = candidates

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
    paymentId: candidates.paymentId,
    payoutDateRaw: candidates.payoutDateRaw,
    payoutTotalRaw: candidates.payoutTotalRaw,
    localTotalRaw: candidates.localTotalRaw,
    ibanValue: candidates.ibanValue,
    exchangeRate: candidates.exchangeRate,
    reservationIds: candidates.reservationIds
  }
}

export function extractBookingPayoutStatementFields(content: string): BookingPayoutStatementFields {
  const candidates = collectBookingPayoutStatementFieldCandidates(content)
  const signals = detectBookingPayoutStatementSignals(content)
  const payoutTotal = safeParseBookingStatementMoney(candidates.payoutTotalRaw, 'Booking payout statement payoutTotal')
  const localTotal = safeParseBookingStatementMoney(candidates.localTotalRaw, 'Booking payout statement localTotal')

  return {
    hasBookingBranding: signals.hasBookingBranding,
    hasStatementWording: signals.hasStatementWording,
    paymentId: candidates.paymentId,
    payoutDate: candidates.payoutDateRaw,
    payoutTotalRaw: candidates.payoutTotalRaw,
    payoutTotalAmountMinor: payoutTotal?.amountMinor,
    payoutTotalCurrency: payoutTotal?.currency,
    localTotalRaw: candidates.localTotalRaw,
    localAmountMinor: localTotal?.amountMinor,
    localCurrency: localTotal?.currency,
    ibanValue: candidates.ibanValue,
    ibanSuffix: extractIbanSuffix(candidates.ibanValue),
    exchangeRate: candidates.exchangeRate,
    reservationIds: candidates.reservationIds
  }
}

export function inspectBookingPayoutStatementFieldCheck(content: string): BookingPayoutStatementFieldCheck {
  const fields = extractBookingPayoutStatementFields(content)
  const missingFields: Array<'paymentId' | 'payoutDate' | 'payoutTotal'> = []

  if (!fields.paymentId) {
    missingFields.push('paymentId')
  }

  if (!fields.payoutDate) {
    missingFields.push('payoutDate')
  }

  if (!fields.payoutTotalRaw || fields.payoutTotalAmountMinor === undefined || !fields.payoutTotalCurrency) {
    missingFields.push('payoutTotal')
  }

  return {
    fields,
    missingFields,
    requiredFieldsCheck: missingFields.length === 0 ? 'passed' : 'failed'
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

function collectBookingPayoutStatementFieldCandidates(content: string): {
  scan: ReturnType<typeof buildBookingPayoutStatementSignalScan>
  paymentId?: string
  payoutDateRaw?: string
  payoutTotalRaw?: string
  localTotalRaw?: string
  ibanValue?: string
  exchangeRate?: string
  reservationIds: string[]
} {
  const fields = parseLabeledDocumentText(content)
  const scan = buildBookingPayoutStatementSignalScan(content)

  return {
    scan,
    paymentId: normalizeBookingStatementReferenceValue(
      pickRequiredField(fields, [
        'payment id',
        'paymentid',
        'booking payment id',
        'id platby',
        'id vyplaty',
        'id výplaty'
      ]) ?? captureBookingReferenceAfterLabels(scan.asciiNormalized, [
        /\b(?:payment|payout)\s*id\b/i,
        /\bbooking\s+payment\s+id\b/i,
        /\bid\s+platby\b/i,
        /\bid\s+vyplaty\b/i
      ]) ?? captureBookingStatementValue(scan.normalized, [
        /\b(?:payment|payout)\s*id\b.{0,120}?([A-Z0-9-]{6,})/i,
        /\bbooking\s+payment\s+id\b.{0,120}?([A-Z0-9-]{6,})/i
      ]) ?? captureBookingStatementValue(scan.asciiNormalized, [
        /\bid\s+platby\b.{0,120}?([A-Z0-9-]{6,})/i,
        /\bid\s+vyplaty\b.{0,120}?([A-Z0-9-]{6,})/i
      ]) ?? captureStandaloneBookingPaymentId(scan.normalized, scan.compact)
    ),
    payoutDateRaw: normalizeBookingStatementDateValue(
      pickRequiredField(fields, [
        'payment date',
        'payout date',
        'transfer date',
        'date',
        'datum vyplacení částky',
        'datum vyplaceni castky',
        'datum platby',
        'datum výplaty',
        'datum vyplaty'
      ]) ?? captureBookingDateAfterLabels(scan.asciiNormalized, [
        /\b(?:payment|payout|transfer)\s*date\b/i,
        /\bdate\b/i,
        /\bdatum\s+vyplaceni\s+castky\b/i,
        /\bdatum\s+platby\b/i
      ]) ?? captureBookingStatementValue(scan.normalized, [
        /\b(?:payment|payout|transfer)\s*date\b.{0,120}?([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[A-Za-zÀ-ž]+\s+\d{4})/i,
        /\bdate\b.{0,120}?([0-9]{4}-[0-9]{2}-[0-9]{2})/i
      ]) ?? captureBookingStatementValue(scan.asciiNormalized, [
        /\bdatum\s+vyplaceni\s+castky\b.{0,120}?([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[a-z]+\s+\d{4})/i,
        /\bdatum\s+platby\b.{0,120}?([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[a-z]+\s+\d{4})/i
      ]) ?? captureStandaloneBookingPayoutDate(scan.normalized, scan.asciiNormalized) ?? captureCompactBookingPayoutDate(scan.compact)
    ),
    payoutTotalRaw: normalizeBookingStatementMoneyValue(
      pickRequiredField(fields, [
        'payout total',
        'payment total',
        'total payout',
        'transfer total',
        'total transfer',
        'celková částka k vyplacení',
        'celkova castka k vyplaceni'
      ]) ?? captureBookingPrimaryPayoutTotalAfterLabels(scan.normalized, [
        /\b(?:payout|payment|transfer)\s*total\b(?!\s*\()/i,
        /\btotal\s+(?:payout|payment|transfer)\b(?!\s*\()/i,
        /\bcelkov[áa]\s+částka\s+k\s+vyplacení\b(?!\s*\()/i,
        /\bcelkova\s+castka\s+k\s+vyplaceni\b(?!\s*\()/i
      ]) ?? captureStandaloneBookingPrimaryPayoutTotal(scan.normalized, scan.asciiNormalized)
      ?? captureCompactBookingPayoutTotal(scan.compact)
    ),
    localTotalRaw: normalizeBookingStatementMoneyValue(
      pickRequiredField(fields, [
        'celkem (czk)',
        'celkem (eur)',
        'celkem (usd)',
        'celková částka k vyplacení (czk)',
        'celková částka k vyplacení (eur)',
        'celková částka k vyplacení (usd)',
        'celkova castka k vyplaceni (czk)',
        'celkova castka k vyplaceni (eur)',
        'celkova castka k vyplaceni (usd)',
        'total payout (czk)',
        'total payout (eur)',
        'total payout (usd)',
        'payment total (czk)',
        'payment total (eur)',
        'payment total (usd)',
        'transfer total (czk)',
        'transfer total (eur)',
        'transfer total (usd)'
      ]) ?? captureBookingLocalPayoutTotalAfterLabels(scan.normalized, [
        /\bcelkem\s*\(\s*(?:czk|eur|usd)\s*\)/i,
        /\bcelkov[áa]\s+částka\s+k\s+vyplacení\s*\(\s*(?:czk|eur|usd)\s*\)/i,
        /\bcelkova\s+castka\s+k\s+vyplaceni\s*\(\s*(?:czk|eur|usd)\s*\)/i,
        /\b(?:total\s+(?:payout|payment|transfer)|(?:payout|payment|transfer)\s*total)\s*\(\s*(?:czk|eur|usd)\s*\)/i
      ], 'CZK') ?? captureBookingLocalCurrencyTotal(scan.normalized, scan.asciiNormalized)
    ),
    ibanValue: pickRequiredField(fields, ['iban', 'bank account', 'bank account hint', 'account'])
      ?? captureStandaloneIban(scan.normalized),
    exchangeRate: normalizeBookingStatementExchangeRateValue(
      pickRequiredField(fields, ['směnný kurz', 'smenny kurz', 'exchange rate'])
      ?? captureBookingExchangeRate(scan.normalized, scan.asciiNormalized)
    ),
    reservationIds: extractReservationIds(scan.normalized)
  }
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

function captureBookingLocalCurrencyTotal(normalized: string, asciiNormalized: string): string | undefined {
  const localCurrencyMatch = [
    asciiNormalized.match(
      /\bcelkem\s*\(\s*(CZK|EUR|USD)\s*\)\b.{0,120}?([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:KC|CZK|EUR|USD))?)/i
    ),
    asciiNormalized.match(
      /\bcelkova\s+castka\s+k\s+vyplaceni\s*\(\s*(CZK|EUR|USD)\s*\)\b.{0,120}?([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:KC|CZK|EUR|USD))?)/i
    ),
    normalized.match(
      /\b(?:total\s+(?:payout|payment|transfer)|(?:payout|payment|transfer)\s*total)\s*\(\s*(CZK|EUR|USD)\s*\)\b.{0,120}?([€$]?\s*[0-9][0-9\s.,-]*(?:\s*(?:Kč|CZK|EUR|USD))?)/i
    )
  ].find((match) => Boolean(match?.[1] && match[2]))

  if (!localCurrencyMatch?.[1] || !localCurrencyMatch[2]) {
    return undefined
  }

  return `${localCurrencyMatch[2].trim()} ${localCurrencyMatch[1].toUpperCase()}`
}

function captureStandaloneBookingPrimaryPayoutTotal(normalized: string, asciiNormalized: string): string | undefined {
  const keywordMoney = normalizeBookingStatementMoneyValue(captureBookingStatementValue(normalized, [
    /\b(?:payout|payment|transfer)\s*total\b(?!\s*\().{0,120}?(([€$]\s*[0-9][0-9\s.,-]*)|([0-9][0-9\s.,-]*\s*(?:Kč|CZK|EUR|USD)))/i,
    /\btotal\s+(?:payout|payment|transfer)\b(?!\s*\().{0,120}?(([€$]\s*[0-9][0-9\s.,-]*)|([0-9][0-9\s.,-]*\s*(?:Kč|CZK|EUR|USD)))/i,
    /\bcelkov[áa]\s+částka\s+k\s+vyplacení\b(?!\s*\().{0,120}?(([€$]\s*[0-9][0-9\s.,-]*)|([0-9][0-9\s.,-]*\s*(?:Kč|CZK|EUR|USD)))/i
  ]) ?? captureBookingStatementValue(asciiNormalized, [
    /\bcelkova\s+castka\s+k\s+vyplaceni\b(?!\s*\().{0,120}?(([€$]\s*[0-9][0-9\s.,-]*)|([0-9][0-9\s.,-]*\s*(?:kc|czk|eur|usd)))/i
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

function captureBookingExchangeRate(normalized: string, asciiNormalized: string): string | undefined {
  return captureBookingStatementValue(asciiNormalized, [
    /\bsmenny\s+kurz\b[:\s-]*([0-9][0-9\s.,]*)/i,
    /\bexchange\s+rate\b[:\s-]*([0-9][0-9\s.,]*)/i
  ]) ?? captureBookingStatementValue(normalized, [
    /\bexchange\s+rate\b[:\s-]*([0-9][0-9\s.,]*)/i
  ])
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

function captureBookingReferenceAfterLabels(
  content: string,
  labelPatterns: RegExp[]
): string | undefined {
  return captureBookingValueAfterLabels(content, labelPatterns, (section) => {
    const match = section.match(/\b(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,}\b/i)
    return match?.[0]?.trim()
  })
}

function captureBookingDateAfterLabels(
  content: string,
  labelPatterns: RegExp[]
): string | undefined {
  return captureBookingValueAfterLabels(content, labelPatterns, (section) => {
    const match = section.match(
      /\b([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[a-z]+\s+\d{4})\b/i
    )
    return match?.[1]?.trim()
  })
}

function captureBookingPrimaryPayoutTotalAfterLabels(
  content: string,
  labelPatterns: RegExp[]
): string | undefined {
  return captureBookingValueAfterLabels(content, labelPatterns, (section) => {
    const candidates = collectBookingMoneyCandidates(section)
    const nonLocalCurrencyCandidate = candidates.find((value) => {
      const currency = detectBookingStatementCurrency(value)
      return currency === 'EUR' || currency === 'USD'
    })

    if (nonLocalCurrencyCandidate) {
      return nonLocalCurrencyCandidate
    }

    return candidates[0]
  })
}

function captureBookingLocalPayoutTotalAfterLabels(
  content: string,
  labelPatterns: RegExp[],
  preferredCurrency: 'CZK' | 'EUR' | 'USD'
): string | undefined {
  return captureBookingValueAfterLabels(content, labelPatterns, (section) => {
    const candidates = collectBookingMoneyCandidates(section)
    return candidates.find((value) => detectBookingStatementCurrency(value) === preferredCurrency)
  })
}

function collectBookingMoneyCandidates(section: string): string[] {
  const rawCandidates = Array.from(new Set([
    ...Array.from(section.matchAll(/[€$]\s*\d{1,3}(?:,\d{3})+(?:\.\d{2})?/g)).map((match) => match[0]),
    ...Array.from(section.matchAll(/[€$]\s*\d{1,3}(?:[ .\u00A0]\d{3})+(?:,\d{2})?/g)).map((match) => match[0]),
    ...Array.from(section.matchAll(/[€$]\s*\d+(?:[.,]\d{2})?/g)).map((match) => match[0]),
    ...Array.from(section.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d{2})?\s*(?:Kč|KC|CZK|EUR|USD)/gi)).map((match) => match[0]),
    ...Array.from(section.matchAll(/\d{1,3}(?:[ .\u00A0]\d{3})+(?:,\d{2})?\s*(?:Kč|KC|CZK|EUR|USD)/gi)).map((match) => match[0]),
    ...Array.from(section.matchAll(/\d+(?:[.,]\d{2})?\s*(?:Kč|KC|CZK|EUR|USD)/gi)).map((match) => match[0])
  ]))

  return rawCandidates
    .map((value) => normalizeBookingStatementMoneyValue(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => Boolean(detectBookingStatementCurrency(value)))
}

function captureBookingValueAfterLabels(
  content: string,
  labelPatterns: RegExp[],
  resolver: (section: string) => string | undefined,
  windowLength = 240
): string | undefined {
  for (const pattern of labelPatterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
    const globalPattern = new RegExp(pattern.source, flags)

    for (const match of content.matchAll(globalPattern)) {
      const endIndex = (match.index ?? 0) + match[0].length
      const section = content.slice(endIndex, Math.min(content.length, endIndex + windowLength))
      const value = resolver(section)

      if (value) {
        return value
      }
    }
  }

  return undefined
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

function normalizeBookingStatementExchangeRateValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.')

  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : undefined
}

function safeParseBookingStatementMoney(
  value: string | undefined,
  fieldName: string
): ReturnType<typeof parseDocumentMoney> | undefined {
  if (!value) {
    return undefined
  }

  try {
    return parseDocumentMoney(value, fieldName)
  } catch {
    return undefined
  }
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
  const amountMatch = value.match(
    /-?(?:\d{1,3}(?:[ \u00A0.,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/
  )

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
