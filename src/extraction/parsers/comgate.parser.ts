import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  type ParsedDelimitedContent,
  findMissingHeaders,
  parseDelimitedContent,
  parseAmountMinor,
  parseIsoDate
} from './csv-utils'

export interface ParseComgateExportInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

const LEGACY_REQUIRED_HEADERS = [
  'paidAt',
  'amountMinor',
  'currency',
  'reference',
  'paymentPurpose',
  'reservationId'
]

const CURRENT_PORTAL_REQUIRED_HEADERS = [
  'payoutDate',
  'amountMinor',
  'currency'
]

const HEADER_ALIASES = {
  paidAt: ['paidAt', 'paid_at', 'paymentDate', 'datumPlatby', 'datum', 'datum zaplacení', 'datum úhrady'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'castka', 'částka', 'uhrazená částka', 'zaplacená částka', 'cena'],
  currency: ['currency', 'mena', 'měna'],
  interbankFeeMinor: ['interbankFeeMinor', 'mezibankovní poplatek', 'mezibankovni poplatek'],
  associationFeeMinor: ['associationFeeMinor', 'poplatek asociace'],
  processorFeeMinor: ['processorFeeMinor', 'poplatek zpracovatel'],
  totalFeeMinor: ['totalFeeMinor', 'poplatek celkem'],
  reference: ['reference', 'transactionReference', 'variabilniSymbol', 'variabilní symbol'],
  paymentPurpose: ['paymentPurpose', 'payment_purpose', 'purpose', 'ucelPlatby', 'účelPlatby', 'štítek', 'payment label'],
  reservationId: ['reservationId', 'reservation_id', 'reservation', 'orderId', 'číslo objednávky', 'order id', 'merchant id'],
  transactionId: ['transactionId', 'transaction_id', 'id transakce', 'transaction id', 'identifier', 'comgate id'],
  payoutDate: ['payoutDate', 'payout_date', 'datum vyplacení', 'datum výplaty', 'datum převodu', 'datum prevodu'],
  paymentReference: ['paymentReference', 'payment_reference', 'reference payment', 'reference platby', 'id od klienta', 'vs platby'],
  paymentType: ['paymentType', 'payment_type', 'typ transakce', 'typ platby']
} satisfies Record<string, string[]>

export type ComgateParserVariant = 'legacy' | 'current-portal'

export type ComgateDetectedFileKind =
  | 'legacy-guest-payments'
  | 'current-portal-guest-payments'
  | 'daily-settlement'
  | 'unknown'

export interface ComgateHeaderDiagnostics {
  rawHeaderRow: string
  detectedDelimiter: string
  rawHeaders: string[]
  normalizedHeaderMap: string[]
  canonicalHeaders: string[]
  detectedFileKind: ComgateDetectedFileKind
  parserVariant: ComgateParserVariant
  requiredCanonicalHeaders: string[]
  missingCanonicalHeaders: string[]
  containsExplicitSettlementTotal: boolean
}

export class ComgateParser {
  parse(input: ParseComgateExportInput): ExtractedRecord[] {
    const parsed = parseDelimitedContent(input.content, { canonicalHeaders: HEADER_ALIASES })
    const rows = parsed.rows

    if (rows.length === 0) {
      return []
    }

    const parserVariant = detectComgateParserVariant(parsed.headers)
    const missing = findMissingHeaders(
      rows,
      parserVariant === 'current-portal' ? CURRENT_PORTAL_REQUIRED_HEADERS : LEGACY_REQUIRED_HEADERS
    )

    if (missing.length > 0) {
      throw new Error(`Comgate export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => buildComgateRecord(row, index, input, parserVariant))
  }
}

function detectComgateParserVariant(headers: string[]): ComgateParserVariant {
  const headerSet = new Set(headers)

  if (headerSet.has('payoutDate') && (headerSet.has('transactionId') || headerSet.has('paymentReference') || headerSet.has('paymentType'))) {
    return 'current-portal'
  }

  return 'legacy'
}

function buildComgateHeaderDiagnostics(parsed: ParsedDelimitedContent): ComgateHeaderDiagnostics {
  const parserVariant = detectComgateParserVariant(parsed.headers)
  const detectedFileKind = detectComgateDetectedFileKind(parsed)
  const requiredCanonicalHeaders = parserVariant === 'current-portal'
    ? CURRENT_PORTAL_REQUIRED_HEADERS
    : LEGACY_REQUIRED_HEADERS

  return {
    rawHeaderRow: parsed.rawHeaderRow,
    detectedDelimiter: parsed.detectedDelimiter,
    rawHeaders: parsed.headerColumns.map((column) => column.rawHeader),
    normalizedHeaderMap: parsed.headerColumns.map((column) => `${column.rawHeader} -> ${column.normalizedHeader}`),
    canonicalHeaders: [...parsed.headers],
    detectedFileKind,
    parserVariant,
    requiredCanonicalHeaders,
    missingCanonicalHeaders: requiredCanonicalHeaders.filter((header) => !parsed.headers.includes(header)),
    containsExplicitSettlementTotal: detectExplicitSettlementTotal(parsed)
  }
}

function detectComgateDetectedFileKind(parsed: ParsedDelimitedContent): ComgateDetectedFileKind {
  if (isCurrentPortalComgateHeaders(parsed.headers)) {
    return 'current-portal-guest-payments'
  }

  if (isDailySettlementComgateShape(parsed)) {
    return 'daily-settlement'
  }

  if (isLegacyComgateHeaders(parsed.headers)) {
    return 'legacy-guest-payments'
  }

  return 'unknown'
}

function isCurrentPortalComgateHeaders(headers: string[]): boolean {
  const headerSet = new Set(headers)

  return headerSet.has('payoutDate')
    && (headerSet.has('transactionId') || headerSet.has('paymentReference') || headerSet.has('paymentType'))
}

function isLegacyComgateHeaders(headers: string[]): boolean {
  const headerSet = new Set(headers)

  return LEGACY_REQUIRED_HEADERS.every((header) => headerSet.has(header))
}

function isDailySettlementComgateShape(parsed: ParsedDelimitedContent): boolean {
  const rawHeaders = parsed.headerColumns.map((column) => normalizeLooseHeader(column.rawHeader))

  return rawHeaders.some((header) => header === 'merchant')
    && rawHeaders.some((header) => header.includes('comgate'))
    && rawHeaders.some((header) => header.includes('metoda'))
    && rawHeaders.some((header) => header.includes('produkt'))
    && rawHeaders.some((header) => header.includes('klienta'))
    && rawHeaders.some((header) => header.includes('symbol'))
    && rawHeaders.some((header) => header.includes('potvrzen'))
    && rawHeaders.some((header) => header.includes('eved'))
}

function normalizeLooseHeader(value: string): string {
  return value
    .trim()
    .replace(/^"|"$/g, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function detectExplicitSettlementTotal(parsed: ParsedDelimitedContent): boolean {
  if (!isDailySettlementComgateShape(parsed)) {
    return false
  }

  const settlementHeader = parsed.headerColumns.find((column) => {
    const normalized = normalizeLooseHeader(column.rawHeader)
    return normalized.includes('eved')
  })

  if (!settlementHeader) {
    return false
  }

  return parsed.rows.some((row) => {
    const hasSummaryMarker = Object.values(row).some((value) => normalizeLooseHeader(value) === 'suma')
    const settlementValue = row[settlementHeader.normalizedHeader]
    return hasSummaryMarker && trimOptionalValue(settlementValue) !== undefined
  })
}

function buildComgateRecord(
  row: Record<string, string>,
  index: number,
  input: ParseComgateExportInput,
  parserVariant: ComgateParserVariant
): ExtractedRecord {
  const recordId = `comgate-row-${index + 1}`
  const paidAt = parseIsoDate(
    parserVariant === 'current-portal' ? row.payoutDate : row.paidAt,
    parserVariant === 'current-portal' ? 'Comgate payoutDate' : 'Comgate paidAt'
  )
  const amountMinor = parseAmountMinor(row.amountMinor, 'Comgate amountMinor')
  const currency = row.currency.trim().toUpperCase()
  const interbankFeeMinor = parseOptionalAmountMinor(row.interbankFeeMinor, 'Comgate interbankFeeMinor')
  const associationFeeMinor = parseOptionalAmountMinor(row.associationFeeMinor, 'Comgate associationFeeMinor')
  const processorFeeMinor = parseOptionalAmountMinor(row.processorFeeMinor, 'Comgate processorFeeMinor')
  const totalFeeMinor = parseOptionalAmountMinor(row.totalFeeMinor, 'Comgate totalFeeMinor')
    ?? sumDefinedNumbers([interbankFeeMinor, associationFeeMinor, processorFeeMinor])
  const legacyReference = trimOptionalValue(row.reference)
  const currentPaymentReference = trimOptionalValue(row.paymentReference)
  const currentTransactionId = trimOptionalValue(row.transactionId)
  const reference = parserVariant === 'current-portal'
    ? currentPaymentReference
    : legacyReference
  const rawReference = reference ?? currentTransactionId
  const paymentPurpose = trimOptionalValue(parserVariant === 'current-portal' ? row.paymentType : row.paymentPurpose)
  const reservationId = parserVariant === 'legacy' ? trimOptionalValue(row.reservationId) : undefined

  return {
    id: recordId,
    sourceDocumentId: input.sourceDocument.id,
    recordType: 'payout-line',
    extractedAt: input.extractedAt,
    ...(rawReference ? { rawReference } : {}),
    amountMinor,
    currency,
    occurredAt: paidAt,
    data: {
      platform: 'comgate',
      bookedAt: paidAt,
      amountMinor,
      currency,
      accountId: 'expected-payouts',
      ...(typeof totalFeeMinor === 'number' && totalFeeMinor > 0 ? { totalFeeMinor } : {}),
      ...(typeof interbankFeeMinor === 'number' && interbankFeeMinor > 0 ? { interbankFeeMinor } : {}),
      ...(typeof associationFeeMinor === 'number' && associationFeeMinor > 0 ? { associationFeeMinor } : {}),
      ...(typeof processorFeeMinor === 'number' && processorFeeMinor > 0 ? { processorFeeMinor } : {}),
      ...(reference ? { reference } : {}),
      ...(reservationId ? { reservationId } : {}),
      ...(paymentPurpose ? { paymentPurpose } : {}),
      ...(currentTransactionId ? { transactionId: currentTransactionId } : {}),
      comgateParserVariant: parserVariant
    }
  }
}

function trimOptionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function parseOptionalAmountMinor(value: string | undefined, fieldName: string): number | undefined {
  const normalized = trimOptionalValue(value)
  if (!normalized) {
    return undefined
  }

  return parseAmountMinor(normalized, fieldName)
}

function sumDefinedNumbers(values: Array<number | undefined>): number | undefined {
  const definedValues = values.filter((value): value is number => typeof value === 'number')
  if (definedValues.length === 0) {
    return undefined
  }

  return definedValues.reduce((sum, value) => sum + value, 0)
}

const defaultComgateParser = new ComgateParser()

export function parseComgateExport(input: ParseComgateExportInput): ExtractedRecord[] {
  return defaultComgateParser.parse(input)
}

export function inspectComgateHeaderDiagnostics(content: string): ComgateHeaderDiagnostics {
  return buildComgateHeaderDiagnostics(parseDelimitedContent(content, { canonicalHeaders: HEADER_ALIASES }))
}