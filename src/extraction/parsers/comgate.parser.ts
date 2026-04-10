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

const MONTHLY_SETTLEMENT_REQUIRED_HEADERS = [
  'transactionId',
  'createdAt',
  'paidAt',
  'transferredAt',
  'merchantOrderReference',
  'payerVariableSymbol',
  'transferReference',
  'clientId',
  'currency',
  'confirmedAmountMinor',
  'transferredAmountMinor'
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

export type ComgateParserVariant = 'legacy' | 'current-portal' | 'daily-settlement' | 'monthly-settlement'

export type ComgateDetectedFileKind =
  | 'legacy-guest-payments'
  | 'current-portal-guest-payments'
  | 'daily-settlement'
  | 'monthly-settlement'
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

interface MonthlySettlementFieldMap {
  merchant?: string
  createdAt?: string
  paidAt?: string
  transferredAt?: string
  transactionId?: string
  paymentMethod?: string
  product?: string
  merchantOrderReference?: string
  payerEmail?: string
  payerVariableSymbol?: string
  transferReference?: string
  clientId?: string
  currency?: string
  confirmedAmountMinor?: string
  transferredAmountMinor?: string
  totalFeeMinor?: string
  interbankFeeMinor?: string
  associationFeeMinor?: string
  processorFeeMinor?: string
  cardType?: string
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

    if (parserVariant === 'monthly-settlement') {
      const monthlyFieldMap = resolveMonthlySettlementFieldMap(parsed)
      const missing = MONTHLY_SETTLEMENT_REQUIRED_HEADERS.filter((header) => !monthlyFieldMap[header as keyof MonthlySettlementFieldMap])

      if (missing.length > 0) {
        throw new Error(`Comgate export is missing required columns: ${missing.join(', ')}`)
      }

      return buildMonthlySettlementRecords(parsed, input, monthlyFieldMap)
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

  if (isMonthlySettlementComgateShape(parsed)) {
    return 'monthly-settlement'
  }

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
  const monthlySettlementFieldMap = resolveMonthlySettlementFieldMap(parsed)
  const monthlySettlementSummary = extractMonthlySettlementSummary(parsed.rows, monthlySettlementFieldMap)
  const requiredCanonicalHeaders = parserVariant === 'current-portal'
    ? CURRENT_PORTAL_REQUIRED_HEADERS
    : parserVariant === 'daily-settlement'
      ? DAILY_SETTLEMENT_REQUIRED_HEADERS
      : parserVariant === 'monthly-settlement'
        ? MONTHLY_SETTLEMENT_REQUIRED_HEADERS
      : LEGACY_REQUIRED_HEADERS
  const canonicalHeaders = parserVariant === 'daily-settlement'
    ? parsed.headerColumns.map((column) => resolveDailySettlementCanonicalHeader(column, dailySettlementFieldMap))
    : parserVariant === 'monthly-settlement'
      ? parsed.headerColumns.map((column) => resolveMonthlySettlementCanonicalHeader(column, monthlySettlementFieldMap))
      : [...parsed.headers]
  const settlementSummary = parserVariant === 'monthly-settlement' ? monthlySettlementSummary : dailySettlementSummary

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
    containsExplicitSettlementTotal: settlementSummary.containsExplicitSettlementTotal,
    ...(typeof settlementSummary.explicitSettlementTotalMinor === 'number'
      ? { explicitSettlementTotalMinor: settlementSummary.explicitSettlementTotalMinor }
      : {}),
    ...(typeof settlementSummary.explicitSettlementGrossTotalMinor === 'number'
      ? { explicitSettlementGrossTotalMinor: settlementSummary.explicitSettlementGrossTotalMinor }
      : {}),
    ...(parserVariant === 'daily-settlement' || parserVariant === 'monthly-settlement'
      ? { componentRowCount: settlementSummary.componentRowCount }
      : {})
  }
}

function detectComgateDetectedFileKind(parsed: ParsedDelimitedContent): ComgateDetectedFileKind {
  if (isMonthlySettlementComgateShape(parsed)) {
    return 'monthly-settlement'
  }

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

function isMonthlySettlementComgateShape(parsed: ParsedDelimitedContent): boolean {
  const rawHeaders = parsed.headerColumns.map((column) => normalizeLooseHeader(column.rawHeader))

  return rawHeaders.some((header) => header === 'merchant')
    && rawHeaders.some((header) => header.includes('datum zalozen'))
    && rawHeaders.some((header) => header.includes('datum zaplacen'))
    && rawHeaders.some((header) => header.includes('datum prevodu'))
    && rawHeaders.some((header) => header.includes('comgate'))
    && rawHeaders.some((header) => header.includes('popis'))
    && rawHeaders.some((header) => header.includes('symbol platce'))
    && rawHeaders.some((header) => header.includes('symbol prevodu'))
    && rawHeaders.some((header) => header.includes('id od klienta'))
    && rawHeaders.some((header) => header.includes('typ karty'))
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

function resolveMonthlySettlementFieldMap(parsed: ParsedDelimitedContent): MonthlySettlementFieldMap {
  return parsed.headerColumns.reduce<MonthlySettlementFieldMap>((fieldMap, column) => {
    const canonicalHeader = resolveMonthlySettlementCanonicalHeader(column, fieldMap)

    switch (canonicalHeader) {
      case 'merchant':
      case 'createdAt':
      case 'paidAt':
      case 'transferredAt':
      case 'transactionId':
      case 'paymentMethod':
      case 'product':
      case 'merchantOrderReference':
      case 'payerEmail':
      case 'payerVariableSymbol':
      case 'transferReference':
      case 'clientId':
      case 'currency':
      case 'confirmedAmountMinor':
      case 'transferredAmountMinor':
      case 'totalFeeMinor':
      case 'interbankFeeMinor':
      case 'associationFeeMinor':
      case 'processorFeeMinor':
      case 'cardType':
        fieldMap[canonicalHeader] = column.normalizedHeader
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

function resolveMonthlySettlementCanonicalHeader(
  column: ParsedDelimitedContent['headerColumns'][number],
  fieldMap?: MonthlySettlementFieldMap
): string {
  const normalizedRawHeader = normalizeLooseHeader(column.rawHeader)

  if (normalizedRawHeader === 'merchant') return 'merchant'
  if (normalizedRawHeader.includes('datum zalozen')) return 'createdAt'
  if (normalizedRawHeader.includes('datum zaplacen')) return 'paidAt'
  if (normalizedRawHeader.includes('datum prevodu')) return 'transferredAt'
  if (normalizedRawHeader.includes('comgate')) return 'transactionId'
  if (normalizedRawHeader.includes('metoda')) return 'paymentMethod'
  if (normalizedRawHeader === 'produkt') return 'product'
  if (normalizedRawHeader === 'popis') return 'merchantOrderReference'
  if (normalizedRawHeader.includes('e-mail')) return 'payerEmail'
  if (normalizedRawHeader.includes('symbol platce')) return 'payerVariableSymbol'
  if (normalizedRawHeader.includes('symbol prevodu')) return 'transferReference'
  if (normalizedRawHeader.includes('id od klienta')) return 'clientId'
  if (normalizedRawHeader === 'mena') return 'currency'
  if (normalizedRawHeader.includes('potvrzen')) return 'confirmedAmountMinor'
  if (normalizedRawHeader.includes('preveden')) return 'transferredAmountMinor'
  if (normalizedRawHeader === 'poplatek celkem') return 'totalFeeMinor'
  if (normalizedRawHeader.includes('mezibankovn')) return 'interbankFeeMinor'
  if (normalizedRawHeader.includes('asociace')) return 'associationFeeMinor'
  if (normalizedRawHeader.includes('zpracovatel')) return 'processorFeeMinor'
  if (normalizedRawHeader.includes('typ karty')) return 'cardType'

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

function extractMonthlySettlementSummary(
  rows: Array<Record<string, string>>,
  fieldMap: MonthlySettlementFieldMap
): DailySettlementSummary {
  let componentRowCount = 0
  let explicitSettlementTotalMinor: number | undefined
  let explicitSettlementGrossTotalMinor: number | undefined

  for (const row of rows) {
    if (isMonthlySettlementSummaryRow(row, fieldMap)) {
      explicitSettlementTotalMinor = parseOptionalAmountMinor(
        fieldMap.transferredAmountMinor ? row[fieldMap.transferredAmountMinor] : undefined,
        'Comgate monthly settlement explicitSettlementTotalMinor'
      )
      explicitSettlementGrossTotalMinor = parseOptionalAmountMinor(
        fieldMap.confirmedAmountMinor ? row[fieldMap.confirmedAmountMinor] : undefined,
        'Comgate monthly settlement explicitSettlementGrossTotalMinor'
      )
      continue
    }

    if (isMonthlySettlementPaymentRow(row, fieldMap)) {
      componentRowCount += 1
    }
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

function isMonthlySettlementSummaryRow(
  row: Record<string, string>,
  fieldMap: MonthlySettlementFieldMap
): boolean {
  const product = normalizeLooseHeader(fieldMap.product ? row[fieldMap.product] ?? '' : '')
  const description = normalizeLooseHeader(fieldMap.merchantOrderReference ? row[fieldMap.merchantOrderReference] ?? '' : '')

  return product === 'suma' || description === 'suma'
}

function isMonthlySettlementPaymentRow(
  row: Record<string, string>,
  fieldMap: MonthlySettlementFieldMap
): boolean {
  if (isMonthlySettlementSummaryRow(row, fieldMap)) {
    return false
  }

  const transactionId = trimOptionalValue(fieldMap.transactionId ? row[fieldMap.transactionId] : undefined)
  return Boolean(transactionId && transactionId !== '-')
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

function buildMonthlySettlementRecords(
  parsed: ParsedDelimitedContent,
  input: ParseComgateExportInput,
  fieldMap: MonthlySettlementFieldMap
): ExtractedRecord[] {
  const summary = extractMonthlySettlementSummary(parsed.rows, fieldMap)
  const records: ExtractedRecord[] = []

  for (const row of parsed.rows) {
    if (isMonthlySettlementSummaryRow(row, fieldMap)) {
      const transferredAt = parseOptionalIsoDate(
        fieldMap.transferredAt ? row[fieldMap.transferredAt] : undefined,
        'Comgate monthly settlement summary transferredAt'
      )
      const payoutReference = trimOptionalValue(fieldMap.transferReference ? row[fieldMap.transferReference] : undefined)
      const currency = trimOptionalValue(fieldMap.currency ? row[fieldMap.currency] : undefined)
      const confirmedGrossMinor = parseOptionalAmountMinor(
        fieldMap.confirmedAmountMinor ? row[fieldMap.confirmedAmountMinor] : undefined,
        'Comgate monthly settlement summary confirmedGrossMinor'
      )
      const transferredNetMinor = parseOptionalAmountMinor(
        fieldMap.transferredAmountMinor ? row[fieldMap.transferredAmountMinor] : undefined,
        'Comgate monthly settlement summary transferredNetMinor'
      )
      const feeTotalMinor = parseOptionalAmountMinor(
        fieldMap.totalFeeMinor ? row[fieldMap.totalFeeMinor] : undefined,
        'Comgate monthly settlement summary feeTotalMinor'
      )
      const feeInterbankMinor = parseOptionalAmountMinor(
        fieldMap.interbankFeeMinor ? row[fieldMap.interbankFeeMinor] : undefined,
        'Comgate monthly settlement summary feeInterbankMinor'
      )
      const feeAssociationMinor = parseOptionalAmountMinor(
        fieldMap.associationFeeMinor ? row[fieldMap.associationFeeMinor] : undefined,
        'Comgate monthly settlement summary feeAssociationMinor'
      )
      const feeProcessorMinor = parseOptionalAmountMinor(
        fieldMap.processorFeeMinor ? row[fieldMap.processorFeeMinor] : undefined,
        'Comgate monthly settlement summary feeProcessorMinor'
      )

      if (!transferredAt || !payoutReference || !currency || typeof transferredNetMinor !== 'number') {
        continue
      }

      records.push({
        id: `comgate-summary-${records.filter((record) => record.recordType === 'payout-batch-summary').length + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'payout-batch-summary',
        extractedAt: input.extractedAt,
        rawReference: payoutReference,
        amountMinor: transferredNetMinor,
        currency: currency.toUpperCase(),
        occurredAt: transferredAt,
        data: {
          platform: 'comgate',
          accountId: 'expected-payouts',
          rowKind: 'payout-batch-summary',
          payoutReference,
          bookedAt: transferredAt,
          transferredAt,
          transferredNetMinor,
          ...(typeof confirmedGrossMinor === 'number' ? { confirmedGrossMinor } : {}),
          ...(typeof feeTotalMinor === 'number' ? { feeTotalMinor } : {}),
          ...(typeof feeInterbankMinor === 'number' ? { feeInterbankMinor } : {}),
          ...(typeof feeAssociationMinor === 'number' ? { feeAssociationMinor } : {}),
          ...(typeof feeProcessorMinor === 'number' ? { feeProcessorMinor } : {}),
          explicitSettlementTotalMinor: transferredNetMinor,
          ...(typeof confirmedGrossMinor === 'number'
            ? { explicitSettlementGrossTotalMinor: confirmedGrossMinor }
            : {}),
          comgateParserVariant: 'monthly-settlement'
        }
      })
      continue
    }

    if (!isMonthlySettlementPaymentRow(row, fieldMap)) {
      continue
    }

    const transactionId = trimOptionalValue(fieldMap.transactionId ? row[fieldMap.transactionId] : undefined)
    const merchant = trimOptionalValue(fieldMap.merchant ? row[fieldMap.merchant] : undefined)
    const paymentMethod = trimOptionalValue(fieldMap.paymentMethod ? row[fieldMap.paymentMethod] : undefined)
    const product = trimOptionalValue(fieldMap.product ? row[fieldMap.product] : undefined)
    const merchantOrderReference = trimOptionalValue(fieldMap.merchantOrderReference ? row[fieldMap.merchantOrderReference] : undefined)
    const payerEmail = trimOptionalValue(fieldMap.payerEmail ? row[fieldMap.payerEmail] : undefined)
    const payerVariableSymbol = trimOptionalValue(fieldMap.payerVariableSymbol ? row[fieldMap.payerVariableSymbol] : undefined)
    const payoutReference = trimOptionalValue(fieldMap.transferReference ? row[fieldMap.transferReference] : undefined)
    const clientId = trimOptionalValue(fieldMap.clientId ? row[fieldMap.clientId] : undefined)
    const currency = trimOptionalValue(fieldMap.currency ? row[fieldMap.currency] : undefined)
    const confirmedGrossMinor = parseAmountMinor(
      fieldMap.confirmedAmountMinor ? row[fieldMap.confirmedAmountMinor] : '',
      'Comgate monthly settlement confirmedGrossMinor'
    )
    const transferredNetMinor = parseAmountMinor(
      fieldMap.transferredAmountMinor ? row[fieldMap.transferredAmountMinor] : '',
      'Comgate monthly settlement transferredNetMinor'
    )
    const feeTotalMinor = parseOptionalAmountMinor(
      fieldMap.totalFeeMinor ? row[fieldMap.totalFeeMinor] : undefined,
      'Comgate monthly settlement feeTotalMinor'
    )
    const feeInterbankMinor = parseOptionalAmountMinor(
      fieldMap.interbankFeeMinor ? row[fieldMap.interbankFeeMinor] : undefined,
      'Comgate monthly settlement feeInterbankMinor'
    )
    const feeAssociationMinor = parseOptionalAmountMinor(
      fieldMap.associationFeeMinor ? row[fieldMap.associationFeeMinor] : undefined,
      'Comgate monthly settlement feeAssociationMinor'
    )
    const feeProcessorMinor = parseOptionalAmountMinor(
      fieldMap.processorFeeMinor ? row[fieldMap.processorFeeMinor] : undefined,
      'Comgate monthly settlement feeProcessorMinor'
    )
    const createdAt = parseOptionalIsoDate(
      fieldMap.createdAt ? row[fieldMap.createdAt] : undefined,
      'Comgate monthly settlement createdAt'
    )
    const paidAt = parseOptionalIsoDate(
      fieldMap.paidAt ? row[fieldMap.paidAt] : undefined,
      'Comgate monthly settlement paidAt'
    )
    const transferredAt = parseOptionalIsoDate(
      fieldMap.transferredAt ? row[fieldMap.transferredAt] : undefined,
      'Comgate monthly settlement transferredAt'
    )
    const bookedAt = transferredAt ?? paidAt ?? createdAt
    const reference = payoutReference

    records.push({
      id: `comgate-row-${records.filter((record) => record.recordType === 'payout-line').length + 1}`,
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'payout-line',
      extractedAt: input.extractedAt,
      ...(transactionId ? { rawReference: transactionId } : reference ? { rawReference: reference } : {}),
      amountMinor: transferredNetMinor,
      ...(currency ? { currency: currency.toUpperCase() } : {}),
      ...(bookedAt ? { occurredAt: bookedAt } : {}),
      data: {
        platform: 'comgate',
        accountId: 'expected-payouts',
        amountMinor: transferredNetMinor,
        currency: currency?.toUpperCase() ?? 'CZK',
        ...(bookedAt ? { bookedAt } : {}),
        ...(reference ? { reference } : {}),
        ...(payoutReference ? { payoutReference } : {}),
        ...(transactionId ? { transactionId } : {}),
        ...(clientId ? { clientId, reservationId: clientId } : {}),
        ...(merchantOrderReference ? { merchantOrderReference } : {}),
        ...(payerVariableSymbol ? { payerVariableSymbol } : {}),
        ...(payerEmail ? { payerEmail } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(paidAt ? { paidAt } : {}),
        ...(transferredAt ? { transferredAt } : {}),
        confirmedGrossMinor,
        transferredNetMinor,
        ...(typeof feeTotalMinor === 'number' ? { feeTotalMinor, totalFeeMinor: feeTotalMinor } : {}),
        ...(typeof feeInterbankMinor === 'number' ? { feeInterbankMinor, interbankFeeMinor: feeInterbankMinor } : {}),
        ...(typeof feeAssociationMinor === 'number' ? { feeAssociationMinor, associationFeeMinor: feeAssociationMinor } : {}),
        ...(typeof feeProcessorMinor === 'number' ? { feeProcessorMinor, processorFeeMinor: feeProcessorMinor } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(product ? { product, paymentPurpose: product } : {}),
        ...(merchant ? { merchant } : {}),
        ...(typeof summary.explicitSettlementTotalMinor === 'number'
          ? { explicitSettlementTotalMinor: summary.explicitSettlementTotalMinor }
          : {}),
        ...(typeof summary.explicitSettlementGrossTotalMinor === 'number'
          ? { explicitSettlementGrossTotalMinor: summary.explicitSettlementGrossTotalMinor }
          : {}),
        comgateParserVariant: 'monthly-settlement',
        ...(fieldMap.cardType && trimOptionalValue(row[fieldMap.cardType]) ? { cardType: trimOptionalValue(row[fieldMap.cardType]) } : {})
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

function parseOptionalIsoDate(value: string | undefined, fieldName: string): string | undefined {
  const normalized = trimOptionalValue(value)
  if (!normalized || normalized === '-') {
    return undefined
  }

  return parseIsoDate(normalized, fieldName)
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
