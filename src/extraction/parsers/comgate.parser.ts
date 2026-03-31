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
  reference: ['reference', 'transactionReference', 'variabilniSymbol', 'variabilní symbol'],
  paymentPurpose: ['paymentPurpose', 'payment_purpose', 'purpose', 'ucelPlatby', 'účelPlatby', 'štítek', 'payment label'],
  reservationId: ['reservationId', 'reservation_id', 'reservation', 'orderId', 'číslo objednávky', 'order id', 'merchant id'],
  transactionId: ['transactionId', 'transaction_id', 'id transakce', 'transaction id', 'identifier', 'comgate id'],
  payoutDate: ['payoutDate', 'payout_date', 'datum vyplacení', 'datum výplaty', 'datum převodu', 'datum prevodu'],
  paymentReference: ['paymentReference', 'payment_reference', 'reference payment', 'reference platby', 'id od klienta', 'vs platby'],
  paymentType: ['paymentType', 'payment_type', 'typ transakce', 'typ platby']
} satisfies Record<string, string[]>

export type ComgateParserVariant = 'legacy' | 'current-portal'

export interface ComgateHeaderDiagnostics {
  rawHeaderRow: string
  detectedDelimiter: string
  rawHeaders: string[]
  normalizedHeaderMap: string[]
  canonicalHeaders: string[]
  parserVariant: ComgateParserVariant
  requiredCanonicalHeaders: string[]
  missingCanonicalHeaders: string[]
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
  const requiredCanonicalHeaders = parserVariant === 'current-portal'
    ? CURRENT_PORTAL_REQUIRED_HEADERS
    : LEGACY_REQUIRED_HEADERS

  return {
    rawHeaderRow: parsed.rawHeaderRow,
    detectedDelimiter: parsed.detectedDelimiter,
    rawHeaders: parsed.headerColumns.map((column) => column.rawHeader),
    normalizedHeaderMap: parsed.headerColumns.map((column) => `${column.rawHeader} -> ${column.normalizedHeader}`),
    canonicalHeaders: [...parsed.headers],
    parserVariant,
    requiredCanonicalHeaders,
    missingCanonicalHeaders: requiredCanonicalHeaders.filter((header) => !parsed.headers.includes(header))
  }
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

const defaultComgateParser = new ComgateParser()

export function parseComgateExport(input: ParseComgateExportInput): ExtractedRecord[] {
  return defaultComgateParser.parse(input)
}

export function inspectComgateHeaderDiagnostics(content: string): ComgateHeaderDiagnostics {
  return buildComgateHeaderDiagnostics(parseDelimitedContent(content, { canonicalHeaders: HEADER_ALIASES }))
}