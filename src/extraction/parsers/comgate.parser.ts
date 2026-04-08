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

const DAILY_SETTLEMENT_REQUIRED_HEADERS = [
  'transactionId',
  'confirmedAmountMinor',
  'transferredAmountMinor',
  'transferReference',
  'clientId'
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
  transactionId: ['transactionId', 'transaction_id', 'id transakce', 'transaction id', 'identifier', 'comgate id', 'id comgate'],
  payoutDate: ['payoutDate', 'payout_date', 'datum vyplacení', 'datum výplaty', 'datum převodu', 'datum prevodu'],
  paymentReference: ['paymentReference', 'payment_reference', 'reference payment', 'reference platby', 'id od klienta', 'vs platby'],
  paymentType: ['paymentType', 'payment_type', 'typ transakce', 'typ platby']
} satisfies Record<string, string[]>

export type ComgateParserVariant = 'legacy' | 'current-portal' | 'daily-settlement'

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
  explicitSettlementTotalMinor?: number
  explicitSettlementGrossTotalMinor?: number
  componentRowCount?: number
}

interface DailySettlementFieldMap {
  transactionId?: string
  confirmedAmountMinor?: string
  transferredAmountMinor?: string
  transferReference?: string
  clientId?: string
  merchant?: string
  paymentMethod?: string
  product?: string
}

interface DailySettlementSummary {
  componentRowCount: number
  containsExplicitSettlementTotal: boolean
  explicitSettlementTotalMinor?: number
  explicitSettlementGrossTotalMinor?: number
}

export class ComgateParser {
  parse(input: ParseComgateExportInput): ExtractedRecord[] {
    const parsed = parseDelimitedContent(input.content, { canonicalHeaders: HEADER_ALIASES })
    const rows = parsed.rows

    if (rows.length === 0) {
      return []
    }

    const parserVariant = detectComgateParserVariant(parsed)

    if (parserVariant === 'daily-settlement') {
      const dailyFieldMap = resolveDailySettlementFieldMap(parsed)
      const missing = DAILY_SETTLEMENT_REQUIRED_HEADERS.filter((header) => !dailyFieldMap[header as keyof DailySettlementFieldMap])

      if (missing.length > 0) {
        throw new Error(`Comgate export is missing required columns: ${missing.join(', ')}`)
      }

      return buildDailySettlementRecords(parsed, input, dailyFieldMap)
    }

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

function detectComgateParserVariant(parsed: ParsedDelimitedContent): ComgateParserVariant {
  const headerSet = new Set(parsed.headers)

  if (isDailySettlementComgateShape(parsed)) {
    return 'daily-settlement'
  }

  if (headerSet.has('payoutDate') && (headerSet.has('transactionId') || headerSet.has('paymentReference') || headerSet.has('paymentType'))) {
    return 'current-portal'
  }

  return 'legacy'
}

function buildComgateHeaderDiagnostics(parsed: ParsedDelimitedContent): ComgateHeaderDiagnostics {
  const parserVariant = detectComgateParserVariant(parsed)
  const detectedFileKind = detectComgateDetectedFileKind(parsed)
  const dailySettlementFieldMap = resolveDailySettlementFieldMap(parsed)
  const dailySettlementSummary = extractDailySettlementSummary(parsed.rows, dailySettlementFieldMap)
  const requiredCanonicalHeaders = parserVariant === 'current-portal'
    ? CURRENT_PORTAL_REQUIRED_HEADERS
    : parserVariant === 'daily-settlement'
      ? DAILY_SETTLEMENT_REQUIRED_HEADERS
      : LEGACY_REQUIRED_HEADERS
  const canonicalHeaders = parserVariant === 'daily-settlement'
    ? parsed.headerColumns.map((column) => resolveDailySettlementCanonicalHeader(column, dailySettlementFieldMap))
    : [...parsed.headers]

  return {
    rawHeaderRow: parsed.rawHeaderRow,
    detectedDelimiter: parsed.detectedDelimiter,
    rawHeaders: parsed.headerColumns.map((column) => column.rawHeader),
    normalizedHeaderMap: parsed.headerColumns.map((column) => `${column.rawHeader} -> ${column.normalizedHeader}`),
    canonicalHeaders,
    detectedFileKind,
    parserVariant,
    requiredCanonicalHeaders,
    missingCanonicalHeaders: requiredCanonicalHeaders.filter((header) => !canonicalHeaders.includes(header)),
    containsExplicitSettlementTotal: dailySettlementSummary.containsExplicitSettlementTotal,
    ...(typeof dailySettlementSummary.explicitSettlementTotalMinor === 'number'
      ? { explicitSettlementTotalMinor: dailySettlementSummary.explicitSettlementTotalMinor }
      : {}),
    ...(typeof dailySettlementSummary.explicitSettlementGrossTotalMinor === 'number'
      ? { explicitSettlementGrossTotalMinor: dailySettlementSummary.explicitSettlementGrossTotalMinor }
      : {}),
    ...(parserVariant === 'daily-settlement' ? { componentRowCount: dailySettlementSummary.componentRowCount } : {})
  }
}

function detectComgateDetectedFileKind(parsed: ParsedDelimitedContent): ComgateDetectedFileKind {
  if (isDailySettlementComgateShape(parsed)) {
    return 'daily-settlement'
  }

  if (isCurrentPortalComgateHeaders(parsed.headers)) {
    return 'current-portal-guest-payments'
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

function resolveDailySettlementFieldMap(parsed: ParsedDelimitedContent): DailySettlementFieldMap {
  return parsed.headerColumns.reduce<DailySettlementFieldMap>((fieldMap, column) => {
    const canonicalHeader = resolveDailySettlementCanonicalHeader(column, fieldMap)

    switch (canonicalHeader) {
      case 'transactionId':
        fieldMap.transactionId = column.normalizedHeader
        break
      case 'confirmedAmountMinor':
        fieldMap.confirmedAmountMinor = column.normalizedHeader
        break
      case 'transferredAmountMinor':
        fieldMap.transferredAmountMinor = column.normalizedHeader
        break
      case 'transferReference':
        fieldMap.transferReference = column.normalizedHeader
        break
      case 'clientId':
        fieldMap.clientId = column.normalizedHeader
        break
      case 'merchant':
        fieldMap.merchant = column.normalizedHeader
        break
      case 'paymentMethod':
        fieldMap.paymentMethod = column.normalizedHeader
        break
      case 'product':
        fieldMap.product = column.normalizedHeader
        break
    }

    return fieldMap
  }, {})
}

function resolveDailySettlementCanonicalHeader(
  column: ParsedDelimitedContent['headerColumns'][number],
  fieldMap?: DailySettlementFieldMap
): string {
  const normalizedRawHeader = normalizeLooseHeader(column.rawHeader)

  if (column.normalizedHeader === 'transactionId' || normalizedRawHeader.includes('comgate')) {
    return 'transactionId'
  }

  if (column.normalizedHeader === 'paymentReference' || normalizedRawHeader.includes('klienta')) {
    return 'clientId'
  }

  if (normalizedRawHeader.includes('merchant')) {
    return 'merchant'
  }

  if (normalizedRawHeader.includes('metoda')) {
    return 'paymentMethod'
  }

  if (normalizedRawHeader.includes('produkt')) {
    return 'product'
  }

  if (normalizedRawHeader.includes('symbol')) {
    return 'transferReference'
  }

  if (normalizedRawHeader.includes('potvrzen')) {
    return 'confirmedAmountMinor'
  }

  if (normalizedRawHeader.includes('eved')) {
    return 'transferredAmountMinor'
  }

  if (fieldMap) {
    for (const [key, value] of Object.entries(fieldMap)) {
      if (value === column.normalizedHeader) {
        return key
      }
    }
  }

  return column.normalizedHeader
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
  return extractDailySettlementSummary(parsed.rows, resolveDailySettlementFieldMap(parsed)).containsExplicitSettlementTotal
}

function extractDailySettlementSummary(
  rows: Array<Record<string, string>>,
  fieldMap: DailySettlementFieldMap
): DailySettlementSummary {
  let componentRowCount = 0
  let explicitSettlementTotalMinor: number | undefined
  let explicitSettlementGrossTotalMinor: number | undefined

  for (const row of rows) {
    if (isDailySettlementSummaryRow(row)) {
      explicitSettlementTotalMinor = parseOptionalAmountMinor(
        fieldMap.transferredAmountMinor ? row[fieldMap.transferredAmountMinor] : undefined,
        'Comgate daily settlement explicitSettlementTotalMinor'
      )
      explicitSettlementGrossTotalMinor = parseOptionalAmountMinor(
        fieldMap.confirmedAmountMinor ? row[fieldMap.confirmedAmountMinor] : undefined,
        'Comgate daily settlement explicitSettlementGrossTotalMinor'
      )
      continue
    }

    componentRowCount += 1
  }

  return {
    componentRowCount,
    containsExplicitSettlementTotal: typeof explicitSettlementTotalMinor === 'number',
    ...(typeof explicitSettlementTotalMinor === 'number' ? { explicitSettlementTotalMinor } : {}),
    ...(typeof explicitSettlementGrossTotalMinor === 'number' ? { explicitSettlementGrossTotalMinor } : {})
  }
}

function isDailySettlementSummaryRow(row: Record<string, string>): boolean {
  return Object.values(row).some((value) => normalizeLooseHeader(value) === 'suma')
}

function buildDailySettlementRecords(
  parsed: ParsedDelimitedContent,
  input: ParseComgateExportInput,
  fieldMap: DailySettlementFieldMap
): ExtractedRecord[] {
  const summary = extractDailySettlementSummary(parsed.rows, fieldMap)
  const records: ExtractedRecord[] = []

  for (const row of parsed.rows) {
    if (isDailySettlementSummaryRow(row)) {
      continue
    }

    const transactionId = trimOptionalValue(fieldMap.transactionId ? row[fieldMap.transactionId] : undefined)
    const clientId = trimOptionalValue(fieldMap.clientId ? row[fieldMap.clientId] : undefined)
    const transferReference = trimOptionalValue(fieldMap.transferReference ? row[fieldMap.transferReference] : undefined)
    const merchant = trimOptionalValue(fieldMap.merchant ? row[fieldMap.merchant] : undefined)
    const paymentMethod = trimOptionalValue(fieldMap.paymentMethod ? row[fieldMap.paymentMethod] : undefined)
    const product = trimOptionalValue(fieldMap.product ? row[fieldMap.product] : undefined)
    const confirmedAmountMinor = parseAmountMinor(
      fieldMap.confirmedAmountMinor ? row[fieldMap.confirmedAmountMinor] : '',
      'Comgate daily settlement confirmedAmountMinor'
    )
    const transferredAmountMinor = parseAmountMinor(
      fieldMap.transferredAmountMinor ? row[fieldMap.transferredAmountMinor] : '',
      'Comgate daily settlement transferredAmountMinor'
    )
    const recordIndex = records.length + 1

    records.push({
      id: `comgate-row-${recordIndex}`,
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'payout-line',
      extractedAt: input.extractedAt,
      ...(transactionId ? { rawReference: transactionId } : transferReference ? { rawReference: transferReference } : {}),
      amountMinor: transferredAmountMinor,
      data: {
        platform: 'comgate',
        accountId: 'expected-payouts',
        amountMinor: transferredAmountMinor,
        confirmedAmountMinor,
        transferredAmountMinor,
        ...(transferReference ? { reference: transferReference } : {}),
        ...(transactionId ? { transactionId } : {}),
        ...(clientId ? { clientId, reservationId: clientId } : {}),
        ...(merchant ? { merchant } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(product ? { product } : {}),
        ...(typeof summary.explicitSettlementTotalMinor === 'number'
          ? { explicitSettlementTotalMinor: summary.explicitSettlementTotalMinor }
          : {}),
        ...(typeof summary.explicitSettlementGrossTotalMinor === 'number'
          ? { explicitSettlementGrossTotalMinor: summary.explicitSettlementGrossTotalMinor }
          : {}),
        comgateParserVariant: 'daily-settlement'
      }
    })
  }

  return records
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