import type { ExtractedRecord, SourceDocument } from '../../domain'
import * as XLSX from 'xlsx'
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
  binaryContentBase64?: string
}

const REQUIRED_HEADERS = [
  'stayDate',
  'amountMinor',
  'currency',
  'voucher',
  'reservationId'
]

const HEADER_ALIASES = {
  stayDate: ['stayDate', 'stay_date', 'serviceDate', 'datumPobytu', 'datum', 'checkIn', 'checkin', 'arrivalDate', 'arrival'],
  stayEndDate: ['stayEndDate', 'stay_end_date', 'checkout', 'checkOut', 'departureDate', 'departure', 'checkOutDate'],
  createdAt: ['createdAt', 'created_at', 'created', 'vytvořeno', 'vytvoreno'],
  voucher: ['voucher', 'reservationReference', 'reservation_reference', 'reference', 'bookingReference'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'grossAmount', 'castka', 'částka'],
  netAmountMinor: ['netAmountMinor', 'net_amount_minor', 'netAmount', 'amountNet', 'cistaCastka', 'čistá částka'],
  outstandingBalanceMinor: ['outstandingBalanceMinor', 'outstanding_balance_minor', 'saldo'],
  currency: ['currency', 'mena', 'měna'],
  reservationReference: ['reservationReference', 'reservation_reference', 'reference', 'bookingReference'],
  reservationId: ['reservationId', 'reservation_id', 'reservationNumber', 'bookingNumber'],
  propertyId: ['propertyId', 'property_id', 'hotelId', 'propertyCode'],
  guestName: ['guestName', 'guest_name', 'guest', 'name', 'guestFullName', 'jmenoHosta', 'jméno hosta'],
  channel: ['channel', 'platform', 'sourceChannel', 'reservationSource', 'zdroj', 'kanal', 'kanál', 'pp'],
  companyName: ['companyName', 'company_name', 'firma'],
  roomName: ['roomName', 'room_name', 'pokoj']
} satisfies Record<string, string[]>

const PREVIO_RESERVATION_WORKBOOK_SHEET = 'Seznam rezervací'
const PREVIO_WORKBOOK_HEADER_COLUMNS = [
  'Vytvořeno',
  'Termín od',
  'Termín do',
  'Nocí',
  'Voucher',
  'Počet hostů',
  'Hosté',
  'Check-In dokončen',
  'Market kody',
  'Firma',
  'PP',
  'Stav',
  'Cena',
  'Saldo',
  'Pokoj'
] as const
const PREVIO_WORKBOOK_TRACE_COLUMNS = ['Voucher', 'Termín od', 'Termín do', 'Hosté', 'PP', 'Cena', 'Saldo', 'Stav'] as const
type PrevioWorkbookRowKind = 'accommodation' | 'ancillary' | 'ignorable'

interface WorkbookAccommodationContext {
  stayStartAt?: string
  stayEndAt?: string
}

interface ClassifiedWorkbookRow {
  row: Record<string, unknown>
  kind: PrevioWorkbookRowKind
}

export class PrevioReservationParser {
  parse(input: ParsePrevioReservationExportInput): ExtractedRecord[] {
    if (input.binaryContentBase64) {
      return parsePrevioReservationWorkbook(input)
    }

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
      const createdAt = typeof row.createdAt === 'string' && row.createdAt.trim().length > 0
        ? parseFlexiblePrevioDate(row.createdAt, 'Previo createdAt')
        : undefined
      const amountMinor = parseAmountMinor(row.amountMinor, 'Previo amountMinor')
      const netAmountMinor = typeof row.netAmountMinor === 'string' && row.netAmountMinor.trim().length > 0
        ? parseAmountMinor(row.netAmountMinor, 'Previo netAmountMinor')
        : undefined
      const outstandingBalanceMinor = typeof row.outstandingBalanceMinor === 'string' && row.outstandingBalanceMinor.trim().length > 0
        ? parseAmountMinor(row.outstandingBalanceMinor, 'Previo outstandingBalanceMinor')
        : undefined
      const currency = row.currency.trim().toUpperCase()
      const reservationReference = stringOrEmpty(row.reservationReference || row.voucher)
      const reservationId = row.reservationId.trim()
      const propertyId = typeof row.propertyId === 'string' ? row.propertyId.trim() : undefined
      const guestName = typeof row.guestName === 'string' ? row.guestName.trim() : undefined
      const channel = typeof row.channel === 'string' ? row.channel.trim() : undefined
      const companyName = typeof row.companyName === 'string' ? row.companyName.trim() : undefined
      const roomName = typeof row.roomName === 'string' ? row.roomName.trim() : undefined

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
          createdAt,
          stayStartAt: stayDate,
          stayEndAt: stayEndDate,
          amountMinor,
          netAmountMinor,
          outstandingBalanceMinor,
          currency,
          accountId: 'expected-payouts',
          reference: reservationReference,
          reservationId,
          propertyId,
          guestName,
          channel,
          companyName,
          roomName
        }
      }
    })
  }
}

export function detectPrevioReservationWorkbookSignature(binaryContentBase64: string): boolean {
  try {
    const worksheet = readPrevioReservationWorkbookSheet(binaryContentBase64)

    if (!worksheet) {
      return false
    }

    return findWorkbookHeaderRowIndex(readWorksheetRows(worksheet)) !== -1
  } catch {
    return false
  }
}

function parsePrevioReservationWorkbook(input: ParsePrevioReservationExportInput): ExtractedRecord[] {
  const worksheet = readPrevioReservationWorkbookSheet(input.binaryContentBase64!)

  if (!worksheet) {
    throw new Error(`Previo reservation workbook is missing required sheet: ${PREVIO_RESERVATION_WORKBOOK_SHEET}`)
  }

  const extraction = extractWorkbookReservationRows(worksheet)

  if (extraction.candidateRows.length === 0) {
    return []
  }

  const classifiedRows: ClassifiedWorkbookRow[] = extraction.candidateRows.map((row) => ({
    row,
    kind: classifyWorkbookCandidateRow(row)
  }))
  const extractedRows = classifiedRows.filter((entry) => entry.kind !== 'ignorable')

  return extractedRows.map(({ row, kind }, index) => {
    const reservationReference = readWorkbookString(row['Voucher'])
    const ownStayStartAt = kind === 'accommodation'
      ? parseFlexiblePrevioDate(row['Termín od'], 'Previo Termín od')
      : readWorkbookOptionalDate(row['Termín od'], 'Previo Termín od')
    const ownStayEndAt = kind === 'accommodation'
      ? parseFlexiblePrevioDate(row['Termín do'], 'Previo Termín do')
      : readWorkbookOptionalDate(row['Termín do'], 'Previo Termín do')
    const inheritedStayContext = kind === 'ancillary' && !ownStayStartAt && !ownStayEndAt
      ? resolveAdjacentAccommodationContext(extractedRows, index)
      : undefined
    const stayStartAt = ownStayStartAt ?? inheritedStayContext?.stayStartAt
    const stayEndAt = ownStayEndAt ?? inheritedStayContext?.stayEndAt
    const createdAt = readWorkbookOptionalDate(row['Vytvořeno'], 'Previo Vytvořeno')
    const guestName = readWorkbookOptionalString(row['Hosté'])
    const channel = readWorkbookOptionalString(row['PP'])
    const companyName = readWorkbookOptionalString(row['Firma'])
    const roomName = readWorkbookOptionalString(row['Pokoj'])
    const grossAmount = parsePrevioWorkbookAmount(row['Cena'], 'Previo Cena')
    const outstandingBalance = readWorkbookOptionalAmount(row['Saldo'], 'Previo Saldo')
    const occurredAt = stayStartAt ?? createdAt
    const recordType = kind === 'accommodation' ? 'payout-line' : 'expected-revenue-line'
    const recordId = kind === 'accommodation'
      ? `previo-reservation-${index + 1}`
      : `previo-ancillary-${index + 1}`

    return {
      id: recordId,
      sourceDocumentId: input.sourceDocument.id,
      recordType,
      extractedAt: input.extractedAt,
      rawReference: reservationReference,
      amountMinor: grossAmount.amountMinor,
      currency: grossAmount.currency,
      occurredAt,
      data: {
        platform: 'previo',
        rowKind: kind,
        settlementProjectionEligibility: 'intake_only',
        bookedAt: occurredAt,
        createdAt,
        stayStartAt,
        stayEndAt,
        amountMinor: grossAmount.amountMinor,
        outstandingBalanceMinor: outstandingBalance?.amountMinor,
        currency: grossAmount.currency,
        accountId: 'expected-payouts',
        reference: reservationReference,
        reservationId: reservationReference,
        guestName,
        channel,
        companyName,
        roomName,
        itemLabel: kind === 'ancillary' ? roomName ?? readWorkbookOptionalString(row['Stav']) : undefined,
        sourceSheet: PREVIO_RESERVATION_WORKBOOK_SHEET,
        workbookExtractionAudit: {
          sheetName: PREVIO_RESERVATION_WORKBOOK_SHEET,
          headerRowIndex: extraction.headerRowIndex + 1,
          headerRowValues: extraction.headerRowValues,
          headerColumnIndexes: extraction.headerColumnIndexes,
          sampleCandidateRows: extraction.candidateRows.slice(0, 3).map((candidateRow) => toWorkbookTraceRow(candidateRow)),
          candidateRowCount: extraction.candidateRows.length,
          skippedRowCount: extraction.candidateRows.length - extractedRows.length,
          rejectedRowCount: 0,
          extractedRowCount: extractedRows.length
        }
      }
    }
  })
}

function resolveAdjacentAccommodationContext(
  extractedRows: ClassifiedWorkbookRow[],
  ancillaryIndex: number
): WorkbookAccommodationContext | undefined {
  const previousAccommodation = findNearestAccommodationContext(extractedRows, ancillaryIndex, -1)
  const nextAccommodation = findNearestAccommodationContext(extractedRows, ancillaryIndex, 1)

  if (previousAccommodation) {
    return previousAccommodation.context
  }

  return nextAccommodation?.context
}

function findNearestAccommodationContext(
  extractedRows: ClassifiedWorkbookRow[],
  startIndex: number,
  direction: -1 | 1
): { distance: number; context: WorkbookAccommodationContext } | undefined {
  for (
    let index = startIndex + direction, distance = 1;
    index >= 0 && index < extractedRows.length;
    index += direction, distance += 1
  ) {
    const candidate = extractedRows[index]

    if (!candidate || candidate.kind !== 'accommodation') {
      continue
    }

    const stayStartAt = readWorkbookOptionalDate(candidate.row['Termín od'], 'Previo Termín od')
    const stayEndAt = readWorkbookOptionalDate(candidate.row['Termín do'], 'Previo Termín do')

    if (!stayStartAt && !stayEndAt) {
      continue
    }

    return {
      distance,
      context: {
        stayStartAt,
        stayEndAt
      }
    }
  }

  return undefined
}

function extractWorkbookReservationRows(worksheet: XLSX.WorkSheet): {
  headerRowIndex: number
  headerRowValues: string[]
  headerColumnIndexes: Record<string, number>
  candidateRows: Array<Record<string, unknown>>
} {
  const sheetRows = readWorksheetRows(worksheet)

  const headerRowIndex = findWorkbookHeaderRowIndex(sheetRows)
  if (headerRowIndex === -1) {
    throw new Error(`Previo reservation workbook is missing the expected header row on sheet: ${PREVIO_RESERVATION_WORKBOOK_SHEET}`)
  }

  const headerRow = sheetRows[headerRowIndex]!.map((cell) => String(cell ?? '').trim())
  const headerColumnIndexes = indexWorkbookColumns(headerRow)
  const candidateRows = sheetRows
    .slice(headerRowIndex + 1)
    .map((row) => buildWorkbookRowObject(headerColumnIndexes, row))

  return {
    headerRowIndex,
    headerRowValues: headerRow,
    headerColumnIndexes,
    candidateRows
  }
}

function findWorkbookHeaderRowIndex(rows: Array<Array<unknown>>): number {
  return rows.findIndex((row, rowIndex) => isWorkbookHeaderRowCandidate(rows, rowIndex))
}

function isWorkbookHeaderRowCandidate(rows: Array<Array<unknown>>, rowIndex: number): boolean {
  const row = rows[rowIndex]
  if (!row) {
    return false
  }

  const normalized = row.map((cell) => String(cell ?? '').trim())
  const nonEmpty = normalized.filter(Boolean)

  if (!PREVIO_WORKBOOK_HEADER_COLUMNS.every((column) => nonEmpty.includes(column))) {
    return false
  }

  const headerColumnIndexes = indexWorkbookColumns(normalized)
  const nextRows = rows.slice(rowIndex + 1, rowIndex + 4)

  return nextRows.some((candidateRow) => isLikelyWorkbookReservationRow(candidateRow, headerColumnIndexes))
}

function readPrevioReservationWorkbookSheet(binaryContentBase64: string): XLSX.WorkSheet | undefined {
  const workbook = XLSX.read(binaryContentBase64, { type: 'base64', cellDates: false })
  return workbook.Sheets[PREVIO_RESERVATION_WORKBOOK_SHEET]
}

function readWorksheetRows(worksheet: XLSX.WorkSheet): Array<Array<unknown>> {
  return XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
  })
}

function indexWorkbookColumns(headers: string[]): Record<string, number> {
  const indexMap: Record<string, number> = {}

  headers.forEach((header, index) => {
    const normalized = String(header ?? '').trim()
    if (!normalized || normalized in indexMap) {
      return
    }

    indexMap[normalized] = index
  })

  return indexMap
}

function buildWorkbookRowObject(headerColumnIndexes: Record<string, number>, row: Array<unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {}

  for (const [header, index] of Object.entries(headerColumnIndexes)) {
    if (index < 0) {
      continue
    }

    record[header] = row[index] ?? ''
  }

  return record
}

function isLikelyWorkbookReservationRow(
  row: Array<unknown>,
  headerColumnIndexes: Record<string, number>
): boolean {
  const voucher = readWorkbookOptionalString(readWorkbookCellAt(row, headerColumnIndexes, 'Voucher'))
  const stayStartAt = readWorkbookOptionalString(readWorkbookCellAt(row, headerColumnIndexes, 'Termín od'))
  const stayEndAt = readWorkbookOptionalString(readWorkbookCellAt(row, headerColumnIndexes, 'Termín do'))
  const guestName = readWorkbookOptionalString(readWorkbookCellAt(row, headerColumnIndexes, 'Hosté'))
  const amount = readWorkbookOptionalString(readWorkbookCellAt(row, headerColumnIndexes, 'Cena'))

  return Boolean(
    voucher
    && guestName
    && stayStartAt
    && PREVIO_DATE_CELL_PATTERN.test(stayStartAt)
    && stayEndAt
    && PREVIO_DATE_CELL_PATTERN.test(stayEndAt)
    && amount
    && PREVIO_AMOUNT_CELL_PATTERN.test(amount.replace(/\u00a0/g, '').replace(/\s+/g, ''))
  )
}

function readWorkbookCellAt(
  row: Array<unknown>,
  headerColumnIndexes: Record<string, number>,
  header: string
): unknown {
  const index = headerColumnIndexes[header]
  return typeof index === 'number' ? row[index] ?? '' : ''
}

function toWorkbookTraceRow(row: Record<string, unknown>): Record<string, string> {
  const trace: Record<string, string> = {}

  PREVIO_WORKBOOK_TRACE_COLUMNS.forEach((column) => {
    const value = row[column]
    trace[column] = String(value ?? '').trim()
  })

  return trace
}

function classifyWorkbookCandidateRow(row: Record<string, unknown>): PrevioWorkbookRowKind {
  if (isAccommodationWorkbookRow(row)) {
    return 'accommodation'
  }

  if (isAncillaryWorkbookRow(row)) {
    return 'ancillary'
  }

  if (isIgnorableWorkbookNonReservationRow(row)) {
    return 'ignorable'
  }

  throw new Error('Previo Voucher is missing or empty')
}

function isAccommodationWorkbookRow(row: Record<string, unknown>): boolean {
  const voucher = readWorkbookOptionalString(row['Voucher'])
  const stayStartAt = readWorkbookOptionalString(row['Termín od'])
  const stayEndAt = readWorkbookOptionalString(row['Termín do'])
  const guestName = readWorkbookOptionalString(row['Hosté'])
  const amount = readWorkbookOptionalString(row['Cena'])

  return Boolean(
    voucher
    && isLikelyReservationReference(voucher)
    && guestName
    && stayStartAt
    && PREVIO_DATE_CELL_PATTERN.test(stayStartAt)
    && stayEndAt
    && PREVIO_DATE_CELL_PATTERN.test(stayEndAt)
    && amount
    && PREVIO_AMOUNT_CELL_PATTERN.test(amount.replace(/\u00a0/g, '').replace(/\s+/g, ''))
  )
}

function isAncillaryWorkbookRow(row: Record<string, unknown>): boolean {
  const voucher = readWorkbookOptionalString(row['Voucher'])
  const guestName = readWorkbookOptionalString(row['Hosté'])
  const amount = readWorkbookOptionalString(row['Cena'])
  const roomName = readWorkbookOptionalString(row['Pokoj'])
  const stayStartAt = readWorkbookOptionalString(row['Termín od'])
  const stayEndAt = readWorkbookOptionalString(row['Termín do'])

  return Boolean(
    voucher
    && isLikelyReservationReference(voucher)
    && !guestName
    && amount
    && PREVIO_AMOUNT_CELL_PATTERN.test(amount.replace(/\u00a0/g, '').replace(/\s+/g, ''))
    && roomName
    && (!stayStartAt || PREVIO_DATE_CELL_PATTERN.test(stayStartAt))
    && (!stayEndAt || PREVIO_DATE_CELL_PATTERN.test(stayEndAt))
  )
}

function isIgnorableWorkbookNonReservationRow(row: Record<string, unknown>): boolean {
  if (isWorkbookLegendRow(row)) {
    return true
  }

  const stayStartAt = readWorkbookOptionalString(row['Termín od'])
  const stayEndAt = readWorkbookOptionalString(row['Termín do'])
  const guestName = readWorkbookOptionalString(row['Hosté'])
  const amount = readWorkbookOptionalString(row['Cena'])
  const roomName = readWorkbookOptionalString(row['Pokoj'])
  const companyName = readWorkbookOptionalString(row['Firma'])
  const status = readWorkbookOptionalString(row['Stav'])
  const marketCodes = readWorkbookOptionalString(row['Market kody'])
  const checkInCompleted = readWorkbookOptionalString(row['Check-In dokončen'])
  const occupancy = readWorkbookOptionalString(row['Počet hostů'])
  const nights = readWorkbookOptionalString(row['Nocí'])
  const channel = readWorkbookOptionalString(row['PP'])
  const voucher = readWorkbookOptionalString(row['Voucher'])

  return !stayStartAt
    && !stayEndAt
    && !guestName
    && !voucher
    && !amount
    && !roomName
    && !companyName
    && !status
    && !marketCodes
    && !checkInCompleted
    && !occupancy
    && !nights
    && !channel
}

function isWorkbookLegendRow(row: Record<string, unknown>): boolean {
  const values = Object.values(toWorkbookTraceRow(row)).filter(Boolean)

  if (values.length === 0) {
    return false
  }

  const explanatoryValues = values.filter((value) => /^\p{L}\s*=\s*.+$/u.test(value))

  return explanatoryValues.length >= 2 && explanatoryValues.length === values.length
}

function parseFlexiblePrevioDate(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim()

  if (!text) {
    throw new Error(`${label} is missing or empty`)
  }

  if (/^\d{4}-\d{2}-\d{2}(t\d{2}:\d{2}(:\d{2})?)?$/i.test(text)) {
    return parseIsoDate(text, label)
  }

  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) {
    const [, day, month, year, hours, minutes, seconds] = match
    const isoDate = `${year}-${padTwo(month)}-${padTwo(day)}`
    if (!hours || !minutes) {
      return isoDate
    }

    return `${isoDate}T${padTwo(hours)}:${minutes}:${seconds ? padTwo(seconds) : '00'}`
  }

  const shortYearMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (shortYearMatch) {
    const [, day, month, shortYear, hours, minutes, seconds] = shortYearMatch
    const year = normalizeTwoDigitYear(shortYear)
    const isoDate = `${year}-${padTwo(month)}-${padTwo(day)}`
    if (!hours || !minutes) {
      return isoDate
    }

    return `${isoDate}T${padTwo(hours)}:${minutes}:${seconds ? padTwo(seconds) : '00'}`
  }

  throw new Error(`${label} has unsupported date format: ${text}`)
}

function parsePrevioWorkbookAmount(value: unknown, label: string): { amountMinor: number; currency: 'CZK' | 'EUR' } {
  const normalized = normalizeWorkbookAmount(value, label)

  if (!normalized) {
    throw new Error(`${label} is missing or empty`)
  }

  return {
    amountMinor: parseAmountMinor(normalized.amount, label),
    currency: normalized.currency
  }
}

function readWorkbookOptionalAmount(value: unknown, label: string): { amountMinor: number; currency: 'CZK' | 'EUR' } | undefined {
  const normalized = normalizeWorkbookAmount(value, label, true)
  return normalized ? {
    amountMinor: parseAmountMinor(normalized.amount, label),
    currency: normalized.currency
  } : undefined
}

function normalizeWorkbookAmount(
  value: unknown,
  label: string,
  optional = false
): { amount: string; currency: 'CZK' | 'EUR' } | undefined {
  const raw = String(value ?? '')
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')

  if (!raw) {
    return optional ? undefined : { amount: raw, currency: 'CZK' }
  }

  const currencyMatch = raw.match(/^(€|EUR|Kč|CZK)?(.*?)(€|EUR|Kč|CZK)?$/i)
  if (!currencyMatch) {
    throw new Error(`${label} has unsupported amount format: ${raw}`)
  }

  const [, leadingCurrency, amount, trailingCurrency] = currencyMatch
  const detectedCurrencies = [leadingCurrency, trailingCurrency]
    .filter((currency): currency is string => Boolean(currency))
    .map((currency) => inferWorkbookCurrency(currency, label, raw))

  if (detectedCurrencies.length > 1 && detectedCurrencies[0] !== detectedCurrencies[1]) {
    throw new Error(`${label} has unsupported amount format: ${raw}`)
  }

  const normalizedAmount = normalizeWorkbookAmountNumber(amount.trim(), label, raw)

  return {
    amount: normalizedAmount,
    currency: detectedCurrencies[0] ?? 'CZK'
  }
}

function normalizeWorkbookAmountNumber(amount: string, label: string, raw: string): string {
  if (/^\d+(,\d{2})$/.test(amount)) {
    return amount
  }

  if (/^\d{1,3}(,\d{3})+(\.\d{2})$/.test(amount)) {
    return amount.replace(/,/g, '')
  }

  if (/^\d+(\.\d{2})$/.test(amount)) {
    return amount
  }

  if (/^\d+$/.test(amount)) {
    return amount
  }

  throw new Error(`${label} has unsupported amount format: ${raw}`)
}

function inferWorkbookCurrency(token: string, label: string, raw: string): 'CZK' | 'EUR' {
  if (/^(€|EUR)$/i.test(token)) {
    return 'EUR'
  }

  if (/^(Kč|CZK)$/i.test(token)) {
    return 'CZK'
  }

  throw new Error(`${label} has unsupported amount format: ${raw}`)
}

function readWorkbookString(value: unknown): string {
  const result = readWorkbookOptionalString(value)
  if (!result) {
    throw new Error('Previo Voucher is missing or empty')
  }

  return result
}

function readWorkbookOptionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}

function readWorkbookOptionalDate(value: unknown, label: string): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? parseFlexiblePrevioDate(text, label) : undefined
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function padTwo(value: string): string {
  return value.padStart(2, '0')
}

function normalizeTwoDigitYear(value: string): string {
  const numericYear = Number.parseInt(value, 10)

  if (!Number.isFinite(numericYear)) {
    throw new Error(`Unsupported two-digit year value: ${value}`)
  }

  if (numericYear >= 70) {
    return `19${padTwo(value)}`
  }

  return `20${padTwo(value)}`
}

function isLikelyReservationReference(value: string): boolean {
  return !/=/.test(value)
}

const PREVIO_DATE_CELL_PATTERN = /^(\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d{4}-\d{2}-\d{2}(?:t\d{2}:\d{2}(?::\d{2})?)?)$/i
const PREVIO_AMOUNT_CELL_PATTERN = /^(?:(?:€|EUR|Kč|CZK)?(?:\d+(?:,\d{2})|\d{1,3}(?:,\d{3})+(?:\.\d{2})|\d+(?:\.\d{2})|\d+)(?:€|EUR|Kč|CZK)?)$/i

const defaultPrevioReservationParser = new PrevioReservationParser()

export function parsePrevioReservationExport(input: ParsePrevioReservationExportInput): ExtractedRecord[] {
  return defaultPrevioReservationParser.parse(input)
}