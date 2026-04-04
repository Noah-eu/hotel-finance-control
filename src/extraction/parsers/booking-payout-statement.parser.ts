import type { ExtractedRecord, SourceDocument } from '../../domain'
import type { DeterministicDocumentExtractionSummary } from '../contracts'
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
  propertyId?: string
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
  propertyId?: string
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
  referenceHints: string[]
  reservationIds: string[]
}

export interface BookingPayoutStatementFieldCheck {
  fields: BookingPayoutStatementFields
  parserExtracted: {
    paymentId?: string
    payoutDate?: string
    payoutTotal?: string
    localTotal?: string
    ibanHint?: string
    exchangeRate?: string
  }
  validatorInput: {
    paymentId?: string
    payoutDate?: string
    payoutTotal?: string
  }
  missingFields: Array<'paymentId' | 'payoutDate' | 'payoutTotal'>
  requiredFieldsCheck: 'passed' | 'failed'
}

export class BookingPayoutStatementPdfParser {
  parse(input: ParseBookingPayoutStatementPdfInput): ExtractedRecord[] {
    const fieldCheck = inspectBookingPayoutStatementFieldCheck(input.content)
    const { fields } = fieldCheck
    const paymentId = fieldCheck.validatorInput.paymentId
    const payoutDateRaw = fieldCheck.validatorInput.payoutDate
    const payoutTotalRaw = fieldCheck.validatorInput.payoutTotal

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
        ...(fields.propertyId ? { propertyId: fields.propertyId } : {}),
        ...(fields.referenceHints.length > 0 ? { referenceHints: fields.referenceHints } : {}),
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
  const resolvedLocalTotal = localTotal ?? (payoutTotal?.currency === 'CZK' ? payoutTotal : undefined)
  const resolvedLocalTotalRaw = candidates.localTotalRaw ?? (payoutTotal?.currency === 'CZK' ? candidates.payoutTotalRaw : undefined)

  return {
    hasBookingBranding: signals.hasBookingBranding,
    hasStatementWording: signals.hasStatementWording,
    paymentId: candidates.paymentId,
    propertyId: candidates.propertyId,
    payoutDate: candidates.payoutDateRaw,
    payoutTotalRaw: candidates.payoutTotalRaw,
    payoutTotalAmountMinor: payoutTotal?.amountMinor,
    payoutTotalCurrency: payoutTotal?.currency,
    localTotalRaw: resolvedLocalTotalRaw,
    localAmountMinor: resolvedLocalTotal?.amountMinor,
    localCurrency: resolvedLocalTotal?.currency,
    ibanValue: candidates.ibanValue,
    ibanSuffix: extractIbanSuffix(candidates.ibanValue),
    exchangeRate: candidates.exchangeRate,
    referenceHints: uniqueBookingReferenceHints(candidates.propertyId, candidates.reservationIds, candidates.paymentId),
    reservationIds: candidates.reservationIds
  }
}

export function inspectBookingPayoutStatementFieldCheck(content: string): BookingPayoutStatementFieldCheck {
  const fields = extractBookingPayoutStatementFields(content)
  const parserExtracted = {
    paymentId: fields.paymentId,
    payoutDate: fields.payoutDate,
    payoutTotal: fields.payoutTotalRaw,
    localTotal: fields.localTotalRaw,
    ibanHint: fields.ibanSuffix,
    exchangeRate: fields.exchangeRate
  }
  const validatorInput = {
    paymentId: fields.paymentId?.trim() || undefined,
    payoutDate: fields.payoutDate,
    payoutTotal: fields.payoutTotalRaw
  }
  const missingFields: Array<'paymentId' | 'payoutDate' | 'payoutTotal'> = []

  if (!validatorInput.paymentId) {
    missingFields.push('paymentId')
  }

  if (!validatorInput.payoutDate) {
    missingFields.push('payoutDate')
  }

  if (!validatorInput.payoutTotal || fields.payoutTotalAmountMinor === undefined || !fields.payoutTotalCurrency) {
    missingFields.push('payoutTotal')
  }

  return {
    fields,
    parserExtracted,
    validatorInput,
    missingFields,
    requiredFieldsCheck: missingFields.length === 0 ? 'passed' : 'failed'
  }
}

export function inspectBookingPayoutStatementExtractionSummary(
  content: string
): DeterministicDocumentExtractionSummary {
  const fieldCheck = inspectBookingPayoutStatementFieldCheck(content)
  const { fields } = fieldCheck
  const hasMeaningfulFields = Boolean(
    fields.paymentId
    || fields.payoutDate
    || fields.payoutTotalAmountMinor !== undefined
    || fields.localAmountMinor !== undefined
    || fields.ibanSuffix
    || fields.referenceHints.length > 0
  )

  return {
    documentKind: 'payout_statement',
    sourceSystem: 'booking',
    documentType: 'payout_statement',
    issuerOrCounterparty: fields.hasBookingBranding ? 'Booking.com B.V.' : undefined,
    paymentDate: fields.payoutDate,
    totalAmountMinor: fields.payoutTotalAmountMinor,
    totalCurrency: fields.payoutTotalCurrency,
    localAmountMinor: fields.localAmountMinor,
    localCurrency: fields.localCurrency,
    referenceNumber: fields.paymentId,
    confidence: fieldCheck.requiredFieldsCheck === 'passed'
      ? 'strong'
      : hasMeaningfulFields
        ? 'hint'
        : 'none',
    finalStatus: fieldCheck.requiredFieldsCheck === 'passed'
      ? 'parsed'
      : hasMeaningfulFields
        ? 'needs_review'
        : 'failed',
    requiredFieldsCheck: fieldCheck.requiredFieldsCheck,
    missingRequiredFields: fieldCheck.missingFields
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

  if (/\bid\s+platby\b/i.test(scan.asciiNormalized) || scan.denseAsciiNormalized.toUpperCase().includes('IDPLATBY')) {
    hits.push('ID platby')
  } else if (/\b(?:payment|payout)\s*id\b/i.test(scan.asciiNormalized)) {
    hits.push('Payment ID')
  }

  if (
    /\bdatum\s+vyplaceni\s+castky\b/i.test(scan.asciiNormalized)
    || scan.denseAsciiNormalized.toUpperCase().includes('DATUMVYPLACENICASTKY')
  ) {
    hits.push('Datum vyplacení částky')
  } else if (/\b(?:payment|payout|transfer)\s*date\b/i.test(scan.asciiNormalized)) {
    hits.push('Payment date')
  }

  if (
    /\bcelkem\s*\(\s*czk\s*\)/i.test(scan.asciiNormalized)
    || scan.denseAsciiNormalized.toUpperCase().includes('CELKEM(CZK)')
  ) {
    hits.push('Celkem (CZK)')
  }

  if (
    /\bcelkova\s+castka\s+k\s+vyplaceni\b/i.test(scan.asciiNormalized)
    || scan.denseAsciiNormalized.toUpperCase().includes('CELKOVACASTKAKVYPLACENI')
  ) {
    hits.push('Celková částka k vyplacení')
  } else if (/\b(?:payout|payment|transfer)\s*total\b|\btotal\s+(?:payout|payment|transfer)\b/i.test(scan.asciiNormalized)) {
    hits.push('Payout total')
  }

  if (/\biban\b/i.test(scan.asciiNormalized) || scan.denseAsciiNormalized.toUpperCase().includes('IBAN')) {
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
  propertyId?: string
  payoutDateRaw?: string
  payoutTotalRaw?: string
  localTotalRaw?: string
  ibanValue?: string
  exchangeRate?: string
  reservationIds: string[]
} {
  const fields = parseLabeledDocumentText(content)
  const scan = buildBookingPayoutStatementSignalScan(content)
  const paymentId = normalizeBookingStatementReferenceValue(
    pickRequiredField(fields, [
      'payment id',
      'paymentid',
      'booking payment id',
      'id platby',
      'id vyplaty',
      'id výplaty'
    ]) ?? captureBookingReferenceAfterLabels(scan.structuredAsciiNormalized, [
      /\b(?:payment|payout)\s*id\b/i,
      /\bbooking\s+payment\s+id\b/i,
      /\bid\s+platby\b/i,
      /\bid\s+vyplaty\b/i
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
      ?? captureDenseBookingPaymentId(scan.denseAsciiNormalized)
  )
  const payoutDateRaw = normalizeBookingStatementDateValue(
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
    ]) ?? captureBookingDateAfterLabels(scan.structuredAsciiNormalized, [
      /\b(?:payment|payout|transfer)\s*date\b/i,
      /\bdate\b/i,
      /\bdatum\s+vyplaceni\s+castky\b/i,
      /\bdatum\s+platby\b/i
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
    ]) ?? captureStandaloneBookingPayoutDate(scan.normalized, scan.asciiNormalized)
      ?? captureDenseBookingPayoutDate(scan.denseAsciiNormalized)
      ?? captureCompactBookingPayoutDate(scan.compact)
  )
  const propertyId = normalizeBookingStatementReferenceValue(
    pickRequiredField(fields, [
      'property id',
      'propertyid',
      'property reference',
      'id ubytování',
      'id ubytovani',
      'id objektu',
      'id hotelu'
    ]) ?? captureBookingPropertyReferenceAfterLabels(scan.structuredAsciiNormalized, [
      /\bproperty\s+(?:id|reference)\b/i,
      /\bid\s+ubytovani\b/i,
      /\bid\s+objektu\b/i,
      /\bid\s+hotelu\b/i
    ]) ?? captureBookingPropertyReferenceAfterLabels(scan.asciiNormalized, [
      /\bproperty\s+(?:id|reference)\b/i,
      /\bid\s+ubytovani\b/i,
      /\bid\s+objektu\b/i,
      /\bid\s+hotelu\b/i
    ]) ?? captureDenseBookingPropertyReference(scan.denseAsciiNormalized)
  )
  const localTotalRaw = normalizeBookingStatementMoneyValue(
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
    ]) ?? captureBookingLocalPayoutTotalAfterLabels(scan.structuredNormalized, [
      /\bcelkem\s*\(\s*(?:czk|eur|usd)\s*\)/i,
      /\bcelkov[áa]\s+částka\s+k\s+vyplacení\s*\(\s*(?:czk|eur|usd)\s*\)/i,
      /\bcelkova\s+castka\s+k\s+vyplaceni\s*\(\s*(?:czk|eur|usd)\s*\)/i,
      /\b(?:total\s+(?:payout|payment|transfer)|(?:payout|payment|transfer)\s*total)\s*\(\s*(?:czk|eur|usd)\s*\)/i
    ], 'CZK') ?? captureBookingLocalPayoutTotalAfterLabels(scan.normalized, [
      /\bcelkem\s*\(\s*(?:czk|eur|usd)\s*\)/i,
      /\bcelkov[áa]\s+částka\s+k\s+vyplacení\s*\(\s*(?:czk|eur|usd)\s*\)/i,
      /\bcelkova\s+castka\s+k\s+vyplaceni\s*\(\s*(?:czk|eur|usd)\s*\)/i,
      /\b(?:total\s+(?:payout|payment|transfer)|(?:payout|payment|transfer)\s*total)\s*\(\s*(?:czk|eur|usd)\s*\)/i
    ], 'CZK') ?? captureBookingLocalCurrencyTotal(scan.normalized, scan.asciiNormalized)
      ?? captureDenseBookingLocalCurrencyTotal(scan.denseNormalized, scan.denseAsciiNormalized)
  )
  const payoutTotalRaw = resolveBookingPrimaryPayoutTotalCandidate(
    normalizeBookingStatementMoneyValue(
      pickRequiredField(fields, [
        'payout total',
        'payment total',
        'total payout',
        'transfer total',
        'total transfer',
        'celková částka k vyplacení',
        'celkova castka k vyplaceni'
      ]) ?? captureBookingPrimaryPayoutTotalAfterLabels(scan.structuredNormalized, [
        /\b(?:payout|payment|transfer)\s*total\b(?!\s*\()/i,
        /\btotal\s+(?:payout|payment|transfer)\b(?!\s*\()/i,
        /\bcelkov[áa]\s+částka\s+k\s+vyplacení\b(?!\s*\()/i,
        /\bcelkova\s+castka\s+k\s+vyplaceni\b(?!\s*\()/i
      ]) ?? captureBookingPrimaryPayoutTotalAfterLabels(scan.normalized, [
        /\b(?:payout|payment|transfer)\s*total\b(?!\s*\()/i,
        /\btotal\s+(?:payout|payment|transfer)\b(?!\s*\()/i,
        /\bcelkov[áa]\s+částka\s+k\s+vyplacení\b(?!\s*\()/i,
        /\bcelkova\s+castka\s+k\s+vyplaceni\b(?!\s*\()/i
      ]) ?? captureStandaloneBookingPrimaryPayoutTotal(scan.normalized, scan.asciiNormalized)
      ?? captureDenseBookingPrimaryPayoutTotal(scan.denseNormalized, scan.denseAsciiNormalized)
      ?? captureCompactBookingPayoutTotal(scan.compact)
    ),
    localTotalRaw,
    scan
  )
  const ibanValue = pickRequiredField(fields, ['iban', 'bank account', 'bank account hint', 'account'])
    ?? captureStandaloneIban(scan.normalized)
  const exchangeRate = normalizeBookingStatementExchangeRateValue(
    pickRequiredField(fields, ['směnný kurz', 'smenny kurz', 'exchange rate'])
    ?? captureBookingExchangeRate(scan.normalized, scan.asciiNormalized)
    ?? captureDenseBookingExchangeRate(scan.denseAsciiNormalized)
  )
  const reservationIds = extractReservationIds(scan.normalized)

  return {
    scan,
    paymentId,
    propertyId,
    payoutDateRaw,
    payoutTotalRaw,
    localTotalRaw,
    ibanValue,
    exchangeRate,
    reservationIds
  }
}

function uniqueBookingReferenceHints(
  propertyId: string | undefined,
  reservationIds: string[],
  paymentId?: string
): string[] {
  const normalizedPaymentId = paymentId?.trim().toUpperCase()

  return Array.from(new Set(
    [propertyId, ...reservationIds]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length >= 4)
      .filter((value) => value.toUpperCase() !== normalizedPaymentId)
  ))
}

function buildBookingPayoutStatementSignalScan(content: string): {
  normalized: string
  asciiNormalized: string
  structuredNormalized: string
  structuredAsciiNormalized: string
  denseNormalized: string
  denseAsciiNormalized: string
  compact: string
} {
  const structuredNormalized = normalizeBookingPayoutStatementStructuredContent(content)
  const normalized = structuredNormalized.replace(/\s+/g, ' ').trim()
  const denseNormalized = structuredNormalized.replace(/\s+/g, '').trim()
  const structuredAsciiNormalized = foldToAscii(structuredNormalized)
  const asciiNormalized = foldToAscii(normalized)
  const denseAsciiNormalized = foldToAscii(denseNormalized)

  return {
    normalized,
    asciiNormalized,
    structuredNormalized,
    structuredAsciiNormalized,
    denseNormalized,
    denseAsciiNormalized,
    compact: denseAsciiNormalized.toUpperCase().replace(/[^A-Z0-9]/g, '')
  }
}

function normalizeBookingPayoutStatementSignalContent(content: string): string {
  return normalizeBookingPayoutStatementStructuredContent(content)
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeBookingPayoutStatementStructuredContent(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeBookingPayoutStatementSignalLine(line))
    .filter((line) => line.length > 0)
    .join('\n')
}

function normalizeBookingPayoutStatementSignalLine(line: string): string {
  let normalized = line
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

function captureDenseBookingPaymentId(denseAsciiNormalized: string): string | undefined {
  const normalized = denseAsciiNormalized.toUpperCase()
  const payoutIdMatch = normalized.match(
    /(?:BOOKINGPAYMENTID|PAYMENTID|PAYOUTID|IDPLATBY|IDVYPLATY)(PAYOUT-BOOK-\d{6,}(?:-[A-Z0-9]+)?)(?=TYPFAKTURY|REFERENCNICISLO|TYPPLATBY|PRIJEZD|ODJEZD|JMENOHOSTA|MENA|CASTKA|REZERVACE|CELKEM|CELKOVA|IBAN|$)/
  )

  if (payoutIdMatch?.[1]) {
    return payoutIdMatch[1]
  }

  const numericMatch = normalized.match(
    /(?:BOOKINGPAYMENTID|PAYMENTID|PAYOUTID|IDPLATBY|IDVYPLATY)(\d{10,16})(?=TYPFAKTURY|REFERENCNICISLO|TYPPLATBY|PRIJEZD|ODJEZD|JMENOHOSTA|MENA|CASTKA|REZERVACE|CELKEM|CELKOVA|IBAN|$)/
  )

  return numericMatch?.[1]
}

function captureDenseBookingPayoutDate(denseAsciiNormalized: string): string | undefined {
  const normalized = denseAsciiNormalized.toUpperCase()
  const stopPattern = '(?:IDPLATBY|IDVYPLATY|PAYMENTID|PAYOUTID|TYPFAKTURY|REFERENCNICISLO|TYPPLATBY|PRIJEZD|ODJEZD|JMENOHOSTA|MENA|CASTKA|REZERVACE|CELKEM|CELKOVA|IBAN|SMENNYKURZ|$)'
  const numericMatch = normalized.match(
    new RegExp(
      `(?:DATUMVYPLACENICASTKY|DATUMPLATBY|PAYMENTDATE|PAYOUTDATE|TRANSFERDATE)(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\.\\d{1,2}\\.\\d{4}|\\d{1,2}\\/\\d{1,2}\\/\\d{4})(?=${stopPattern})`
    )
  )

  if (numericMatch?.[1]) {
    return numericMatch[1]
  }

  const monthMatch = normalized.match(
    new RegExp(
      `(?:DATUMVYPLACENICASTKY|DATUMPLATBY|PAYMENTDATE|PAYOUTDATE|TRANSFERDATE)(\\d{1,2})\\.?(${buildDenseBookingMonthPattern()})(\\d{4})(?=${stopPattern})`
    )
  )

  if (!monthMatch?.[1] || !monthMatch[2] || !monthMatch[3]) {
    return undefined
  }

  return `${monthMatch[1]}. ${monthMatch[2].toLowerCase()} ${monthMatch[3]}`
}

function buildDenseBookingMonthPattern(): string {
  return [
    'JANUARY',
    'JAN',
    'LEDEN',
    'LEDNA',
    'FEBRUARY',
    'FEB',
    'UNOR',
    'UNORA',
    'MARCH',
    'MAR',
    'BREZEN',
    'BREZNA',
    'APRIL',
    'APR',
    'DUBEN',
    'DUBNA',
    'MAY',
    'KVETEN',
    'KVETNA',
    'JUNE',
    'JUN',
    'CERVEN',
    'CERVNA',
    'JULY',
    'JUL',
    'CERVENEC',
    'CERVENCE',
    'AUGUST',
    'AUG',
    'SRPEN',
    'SRPNA',
    'SEPTEMBER',
    'SEP',
    'SEPT',
    'ZARI',
    'RIJEN',
    'RIJNA',
    'OCTOBER',
    'OCT',
    'NOVEMBER',
    'NOV',
    'LISTOPAD',
    'LISTOPADU',
    'DECEMBER',
    'DEC',
    'PROSINEC',
    'PROSINCE'
  ].join('|')
}

function captureDenseBookingLocalCurrencyTotal(
  denseNormalized: string,
  denseAsciiNormalized: string
): string | undefined {
  const upperAscii = denseAsciiNormalized.toUpperCase()
  const localMatch = upperAscii.match(
    /(?:CELKEM\(CZK\)|CELKOVACASTKAKVYPLACENI\(CZK\))(\d{1,3}(?:,\d{3})+(?:\.\d{2})?(?:KC|CZK)?|\d+\.\d{2}(?:KC|CZK)?)(?=CELKOVACASTKAKVYPLACENI|SMENNYKURZ|BANKOVNIUDAJE|IBAN|$)/
  )

  if (!localMatch?.[1]) {
    return undefined
  }

  const candidate = normalizeBookingStatementMoneyValue(localMatch[1])
  const currency = candidate ? detectBookingStatementCurrency(candidate) : undefined

  if (!candidate || currency !== 'CZK') {
    return undefined
  }

  return candidate
}

function captureDenseBookingExchangeRate(denseAsciiNormalized: string): string | undefined {
  const upperAscii = denseAsciiNormalized.toUpperCase()
  const match = upperAscii.match(
    /(?:SMENNYKURZ|EXCHANGERATE)(\d{1,3}(?:[.,]\d{4})?)(?=\d{1,3}(?:,\d{3})+\.\d{2}(?:KC|CZK)|BANKOVNIUDAJE|IBAN|$)/
  )

  return match?.[1]
}

function captureDenseBookingPrimaryPayoutTotal(
  denseNormalized: string,
  denseAsciiNormalized: string
): string | undefined {
  const upperAscii = denseAsciiNormalized.toUpperCase()
  const directMatch = upperAscii.match(
    /CELKOVACASTKAKVYPLACENI(?!\((?:CZK|EUR|USD)\))([€$]\d{1,3}(?:,\d{3})+(?:\.\d{2})|[€$]\d+\.\d{2}|\d{1,3}(?:,\d{3})+(?:\.\d{2})?(?:EUR|USD)|\d+\.\d{2}(?:EUR|USD))(?=CELKOVACASTKAKVYPLACENI(?:\(|$)|SMENNYKURZ|BANKOVNIUDAJE|IBAN|$)/
  )

  if (!directMatch?.[1]) {
    return undefined
  }

  const candidate = normalizeBookingStatementMoneyValue(directMatch[1])

  if (!candidate || !isPlausibleBookingPayoutTotalCandidate(candidate)) {
    return undefined
  }

  const currency = detectBookingStatementCurrency(candidate)
  return currency === 'EUR' || currency === 'USD' ? candidate : undefined
}

function captureDenseBookingPropertyReference(denseAsciiNormalized: string): string | undefined {
  const normalized = denseAsciiNormalized.toUpperCase()
  const stopPattern = '(?:BOOKINGCOMBV|BOOKINGCOM|VYKAZPLATEB|PREHLEDPLATEB|DATUMVYPLACENICASTKY|IDPLATBY|IDVYPLATY|PAYMENTID|PAYOUTID|TYPFAKTURY|REFERENCNICISLO|TYPPLATBY|PRIJEZD|ODJEZD|JMENOHOSTA|MENA|CASTKA|REZERVACE|RESERVATION|CELKEM|CELKOVA|IBAN|SMENNYKURZ|BANKOVNIUDAJE|$)'
  const match = normalized.match(
    new RegExp(`(?:PROPERTYID|PROPERTYREFERENCE|IDUBYTOVANI|IDOBJEKTU|IDHOTELU)([A-Z0-9-]{4,}?)(?=${stopPattern})`)
  )

  return match?.[1]
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
  return captureBookingValueAfterLabelLines(content, labelPatterns, (section, sectionLines) => {
    const multilineCandidate = captureBookingReferenceFromFragmentedLines(sectionLines)

    if (multilineCandidate) {
      return multilineCandidate
    }

    return captureBookingReferenceToken(section)
  }) ?? captureBookingValueAfterLabels(content, labelPatterns, (section) => {
    return captureBookingReferenceToken(section)
  })
}

function captureBookingPropertyReferenceAfterLabels(
  content: string,
  labelPatterns: RegExp[]
): string | undefined {
  return captureBookingValueAfterLabelLines(content, labelPatterns, (section, sectionLines) => {
    const multilineCandidate = captureBookingPropertyReferenceFromFragmentedLines(sectionLines)

    if (multilineCandidate) {
      return multilineCandidate
    }

    return captureBookingPropertyReferenceToken(section)
  }) ?? captureBookingValueAfterLabels(content, labelPatterns, (section) => {
    return captureBookingPropertyReferenceToken(section)
  })
}

function captureBookingDateAfterLabels(
  content: string,
  labelPatterns: RegExp[]
): string | undefined {
  return captureBookingValueAfterLabelLines(content, labelPatterns, (section, sectionLines) => {
    const multilineCandidate = captureBookingDateFromFragmentedLines(sectionLines)

    if (multilineCandidate) {
      return multilineCandidate
    }

    const match = section.match(
      /\b([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.\s*[a-z]+\s+\d{4})\b/i
    )
    return match?.[1]?.trim()
  }) ?? captureBookingValueAfterLabels(content, labelPatterns, (section) => {
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
  return captureBookingValueAfterLabelLines(content, labelPatterns, (section, sectionLines) => {
    const candidates = [
      ...collectBookingMoneyCandidatesFromFragmentedLines(sectionLines),
      ...collectBookingMoneyCandidates(section)
    ]
    const nonLocalCurrencyCandidate = candidates.find((value) => {
      const currency = detectBookingStatementCurrency(value)
      return (currency === 'EUR' || currency === 'USD') && isPlausibleBookingPayoutTotalCandidate(value)
    })

    if (nonLocalCurrencyCandidate) {
      return nonLocalCurrencyCandidate
    }

    return candidates.find((value) => isPlausibleBookingPayoutTotalCandidate(value))
  }) ?? captureBookingValueAfterLabels(content, labelPatterns, (section) => {
    const candidates = collectBookingMoneyCandidates(section)
    const nonLocalCurrencyCandidate = candidates.find((value) => {
      const currency = detectBookingStatementCurrency(value)
      return (currency === 'EUR' || currency === 'USD') && isPlausibleBookingPayoutTotalCandidate(value)
    })

    if (nonLocalCurrencyCandidate) {
      return nonLocalCurrencyCandidate
    }

    return candidates.find((value) => isPlausibleBookingPayoutTotalCandidate(value))
  })
}

function captureBookingLocalPayoutTotalAfterLabels(
  content: string,
  labelPatterns: RegExp[],
  preferredCurrency: 'CZK' | 'EUR' | 'USD'
): string | undefined {
  return captureBookingValueAfterLabelLines(content, labelPatterns, (section, sectionLines) => {
    const candidates = [
      ...collectBookingMoneyCandidatesFromFragmentedLines(sectionLines),
      ...collectBookingMoneyCandidates(section)
    ]
    return candidates.find((value) => detectBookingStatementCurrency(value) === preferredCurrency)
  }) ?? captureBookingValueAfterLabels(content, labelPatterns, (section) => {
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

function collectBookingMoneyCandidatesFromFragmentedLines(sectionLines: string[]): string[] {
  const candidates = new Set<string>()

  for (const variant of buildBookingFragmentVariants(sectionLines, 4)) {
    for (const candidate of collectBookingMoneyCandidates(variant)) {
      candidates.add(candidate)
    }
  }

  return Array.from(candidates)
}

function resolveBookingPrimaryPayoutTotalCandidate(
  payoutTotalRaw: string | undefined,
  localTotalRaw: string | undefined,
  scan: ReturnType<typeof buildBookingPayoutStatementSignalScan>
): string | undefined {
  const payoutCurrency = payoutTotalRaw ? detectBookingStatementCurrency(payoutTotalRaw) : undefined
  const localCurrency = localTotalRaw ? detectBookingStatementCurrency(localTotalRaw) : undefined
  const nonLocalDocumentCandidate = collectBookingMoneyCandidates(scan.structuredNormalized)
    .find((value) => {
      const currency = detectBookingStatementCurrency(value)
      return Boolean(
        currency
        && currency !== 'CZK'
        && currency !== localCurrency
        && isPlausibleBookingPayoutTotalCandidate(value)
      )
    })
    ?? collectBookingMoneyCandidates(scan.normalized).find((value) => {
      const currency = detectBookingStatementCurrency(value)
      return Boolean(
        currency
        && currency !== 'CZK'
        && currency !== localCurrency
        && isPlausibleBookingPayoutTotalCandidate(value)
      )
    })
    ?? collectBookingMoneyCandidates(scan.denseNormalized).find((value) => {
      const currency = detectBookingStatementCurrency(value)
      return Boolean(
        currency
        && currency !== 'CZK'
        && currency !== localCurrency
        && isPlausibleBookingPayoutTotalCandidate(value)
      )
    })

  if (!payoutTotalRaw) {
    return nonLocalDocumentCandidate ?? payoutTotalRaw
  }

  if (
    nonLocalDocumentCandidate
    && (!payoutCurrency || payoutCurrency === localCurrency || payoutCurrency === 'CZK' || !isPlausibleBookingPayoutTotalCandidate(payoutTotalRaw))
  ) {
    return nonLocalDocumentCandidate
  }

  return payoutTotalRaw
}

function captureBookingValueAfterLabels(
  content: string,
  labelPatterns: RegExp[],
  resolver: (section: string) => string | undefined,
  windowLength = 1600
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

function captureBookingValueAfterLabelLines(
  content: string,
  labelPatterns: RegExp[],
  resolver: (section: string, sectionLines: string[]) => string | undefined,
  lineWindow = 80
): string | undefined {
  const lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const pattern of labelPatterns) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]

      if (!line) {
        continue
      }

      const match = line.match(pattern)

      if (!match) {
        continue
      }

      const matchIndex = match.index ?? 0
      const sectionLines = [
        line.slice(matchIndex + match[0].length).trim(),
        ...lines.slice(index + 1, index + 1 + lineWindow)
      ].filter(Boolean)

      const value = resolver(sectionLines.join('\n'), sectionLines)

      if (value) {
        return value
      }
    }
  }

  return undefined
}

function captureBookingReferenceFromFragmentedLines(sectionLines: string[]): string | undefined {
  const candidateLines = sectionLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 24)

  for (const line of candidateLines) {
    const direct = captureBookingReferenceFromStandaloneLine(line)

    if (direct) {
      return direct
    }
  }

  for (let index = 0; index < candidateLines.length; index += 1) {
    if (!looksLikeReferenceFragment(candidateLines[index] ?? '')) {
      continue
    }

    let combined = sanitizeReferenceFragment(candidateLines[index] ?? '')

    if (!combined) {
      continue
    }

    const direct = captureBookingReferenceToken(combined)

    if (direct) {
      return direct
    }

    for (let nextIndex = index + 1; nextIndex < Math.min(candidateLines.length, index + 4); nextIndex += 1) {
      const nextLine = candidateLines[nextIndex] ?? ''

      if (!looksLikeReferenceFragment(nextLine)) {
        break
      }

      combined += sanitizeReferenceFragment(nextLine)
      const combinedCandidate = captureBookingReferenceToken(combined)

      if (combinedCandidate) {
        return combinedCandidate
      }
    }
  }

  return undefined
}

function captureBookingReferenceToken(section: string): string | undefined {
  const payoutIdMatch = section.match(/\bPAYOUT-BOOK-\d{6,}(?:-[A-Z0-9]+)?(?![A-Z0-9-])/i)

  if (payoutIdMatch?.[0]) {
    return payoutIdMatch[0].trim().replace(/\s+/g, '')
  }

  if (/\bIBAN\b/i.test(section)) {
    return undefined
  }

  const digitMatches = Array.from(section.matchAll(/(?:^|[^0-9])((?:\d[\s]*){10,16})(?!\d)/g))
    .map((match) => match[1]?.replace(/\s+/g, ''))
    .filter((value): value is string => Boolean(value && /^\d{10,16}$/.test(value)))

  return digitMatches[0]
}

function captureBookingReferenceFromStandaloneLine(line: string): string | undefined {
  const payoutIdMatch = line.match(/\bPAYOUT-BOOK-\d{6,}(?:-[A-Z0-9]+)?(?![A-Z0-9-])/i)

  if (payoutIdMatch?.[0]) {
    return payoutIdMatch[0].trim().replace(/\s+/g, '')
  }

  if (isLikelyIbanFragment(line)) {
    return undefined
  }

  const digits = line.replace(/\s+/g, '')
  return /^\d{10,16}$/.test(digits) ? digits : undefined
}

function captureBookingPropertyReferenceFromFragmentedLines(sectionLines: string[]): string | undefined {
  const candidateLines = sectionLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 12)

  for (const line of candidateLines) {
    const direct = captureBookingPropertyReferenceFromStandaloneLine(line)

    if (direct) {
      return direct
    }
  }

  return undefined
}

function captureBookingPropertyReferenceFromStandaloneLine(line: string): string | undefined {
  return captureBookingPropertyReferenceToken(line)
}

function looksLikeReferenceFragment(value: string): boolean {
  const trimmed = value.trim()

  if (!trimmed) {
    return false
  }

  if (!/^[A-Z0-9 -]+$/i.test(trimmed)) {
    return false
  }

  if (isLikelyIbanFragment(trimmed)) {
    return false
  }

  return /\d/.test(trimmed)
}

function sanitizeReferenceFragment(value: string): string {
  return value.trim().replace(/\s+/g, '').replace(/[^A-Z0-9-]/gi, '')
}

function isLikelyIbanFragment(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase()
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(compact)
}

function captureBookingPropertyReferenceToken(section: string): string | undefined {
  if (/\bIBAN\b/i.test(section)) {
    return undefined
  }

  const tokens = section
    .split(/[\s,;:()]+/)
    .map((value) => value.trim())
    .filter(Boolean)

  for (const token of tokens) {
    const cleaned = token.replace(/[^A-Z0-9-]/gi, '').toUpperCase()

    if (!cleaned || cleaned.length < 4) {
      continue
    }

    if (isLikelyIbanFragment(cleaned) || /^PAYOUT-BOOK-\d/.test(cleaned)) {
      continue
    }

    if (BOOKING_PROPERTY_REFERENCE_STOPWORDS.has(cleaned)) {
      continue
    }

    if (/^[A-Z0-9-]{4,}$/.test(cleaned)) {
      return cleaned
    }
  }

  return undefined
}

function captureBookingDateFromFragmentedLines(sectionLines: string[]): string | undefined {
  for (const variant of buildBookingFragmentVariants(sectionLines, 4)) {
    const match = variant.match(
      /\b([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\.?\s*[a-z]+\s+\d{4})\b/i
    )

    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return undefined
}

function buildBookingFragmentVariants(sectionLines: string[], maxLineSpan: number): string[] {
  const variants = new Set<string>()
  const limitedLines = sectionLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 24)

  for (let start = 0; start < limitedLines.length; start += 1) {
    for (let span = 1; span <= maxLineSpan && start + span <= limitedLines.length; span += 1) {
      const slice = limitedLines.slice(start, start + span)
      const spaced = slice.join(' ').replace(/\s+/g, ' ').trim()
      const compact = slice.join('').replace(/\s+/g, '')

      if (spaced) {
        variants.add(spaced)
      }

      if (compact) {
        variants.add(compact)
      }
    }
  }

  return Array.from(variants)
}

function isPlausibleBookingPayoutTotalCandidate(value: string): boolean {
  const parsed = safeParseBookingStatementMoney(value, 'Booking payout statement payoutTotal candidate')

  if (!parsed) {
    return false
  }

  const majorUnits = Math.abs(parsed.amountMinor) / 100

  if (/[.,]\d{2}\b/.test(value)) {
    return true
  }

  return majorUnits >= 10
}

const BOOKING_PROPERTY_REFERENCE_STOPWORDS = new Set([
  'BOOKING',
  'BOOKINGCOM',
  'BV',
  'PROPERTY',
  'REFERENCE',
  'ID',
  'PLATBY',
  'PAYMENT',
  'PAYOUT',
  'DATE',
  'DATUM',
  'VYPLACENI',
  'CASTKY',
  'CASTKA',
  'CELKEM',
  'CELKOVA',
  'TOTAL',
  'REZERVACE',
  'RESERVATION',
  'CZK',
  'EUR',
  'USD',
  'IBAN',
  'SMENNY',
  'KURZ',
  'BANKOVNI',
  'UDAJE',
  'TYP',
  'FAKTURY',
  'REFERENCNICISLO',
  'PRIJEZD',
  'ODJEZD',
  'JMENOHOSTA',
  'MENA'
])

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
