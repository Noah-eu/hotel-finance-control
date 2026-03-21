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
const PREVIO_WORKBOOK_REQUIRED_COLUMNS = ['Voucher', 'Termín od', 'Termín do', 'Hosté', 'PP', 'Cena'] as const

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

function parsePrevioReservationWorkbook(input: ParsePrevioReservationExportInput): ExtractedRecord[] {
  const workbook = XLSX.read(input.binaryContentBase64!, { type: 'base64', cellDates: false })
  const worksheet = workbook.Sheets[PREVIO_RESERVATION_WORKBOOK_SHEET]

  if (!worksheet) {
    throw new Error(`Previo reservation workbook is missing required sheet: ${PREVIO_RESERVATION_WORKBOOK_SHEET}`)
  }

  const extraction = extractWorkbookReservationRows(worksheet)

  if (extraction.candidateRows.length === 0) {
    return []
  }

  const reservationRows = extraction.candidateRows.filter((row) => shouldKeepWorkbookReservationRow(row))

  return reservationRows.map((row, index) => {
    const reservationReference = readWorkbookString(row['Voucher'])
    const stayStartAt = parseFlexiblePrevioDate(row['Termín od'], 'Previo Termín od')
    const stayEndAt = parseFlexiblePrevioDate(row['Termín do'], 'Previo Termín do')
    const createdAt = readWorkbookOptionalDate(row['Vytvořeno'], 'Previo Vytvořeno')
    const guestName = readWorkbookOptionalString(row['Hosté'])
    const channel = readWorkbookOptionalString(row['PP'])
    const companyName = readWorkbookOptionalString(row['Firma'])
    const roomName = readWorkbookOptionalString(row['Pokoj'])
    const grossAmountMinor = parsePrevioWorkbookAmount(row['Cena'], 'Previo Cena')
    const outstandingBalanceMinor = readWorkbookOptionalAmount(row['Saldo'], 'Previo Saldo')

    return {
      id: `previo-reservation-${index + 1}`,
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'payout-line',
      extractedAt: input.extractedAt,
      rawReference: reservationReference,
      amountMinor: grossAmountMinor,
      currency: 'CZK',
      occurredAt: stayStartAt,
      data: {
        platform: 'previo',
        bookedAt: stayStartAt,
        createdAt,
        stayStartAt,
        stayEndAt,
        amountMinor: grossAmountMinor,
        outstandingBalanceMinor,
        currency: 'CZK',
        accountId: 'expected-payouts',
        reference: reservationReference,
        reservationId: reservationReference,
        guestName,
        channel,
        companyName,
        roomName,
        sourceSheet: PREVIO_RESERVATION_WORKBOOK_SHEET,
        workbookExtractionAudit: {
          sheetName: PREVIO_RESERVATION_WORKBOOK_SHEET,
          headerRowIndex: extraction.headerRowIndex + 1,
          candidateRowCount: extraction.candidateRows.length,
          skippedRowCount: extraction.candidateRows.length - reservationRows.length,
          rejectedRowCount: 0,
          extractedRowCount: reservationRows.length
        }
      }
    }
  })
}

function extractWorkbookReservationRows(worksheet: XLSX.WorkSheet): {
  headerRowIndex: number
  candidateRows: Array<Record<string, unknown>>
} {
  const sheetRows = XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
  })

  const headerRowIndex = findWorkbookHeaderRowIndex(sheetRows)
  if (headerRowIndex === -1) {
    throw new Error(`Previo reservation workbook is missing the expected header row on sheet: ${PREVIO_RESERVATION_WORKBOOK_SHEET}`)
  }

  const headerRow = sheetRows[headerRowIndex]!.map((cell) => String(cell ?? '').trim())
  const candidateRows = sheetRows
    .slice(headerRowIndex + 1)
    .map((row) => buildWorkbookRowObject(headerRow, row))

  return {
    headerRowIndex,
    candidateRows
  }
}

function findWorkbookHeaderRowIndex(rows: Array<Array<unknown>>): number {
  return rows.findIndex((row) => {
    const normalized = row
      .map((cell) => String(cell ?? '').trim())
      .filter(Boolean)

    return PREVIO_WORKBOOK_REQUIRED_COLUMNS.every((column) => normalized.includes(column))
  })
}

function buildWorkbookRowObject(headers: string[], row: Array<unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {}

  headers.forEach((header, index) => {
    if (!header) {
      return
    }

    record[header] = row[index] ?? ''
  })

  return record
}

function shouldKeepWorkbookReservationRow(row: Record<string, unknown>): boolean {
  const voucher = readWorkbookOptionalString(row['Voucher'])
  if (voucher) {
    return true
  }

  if (isIgnorableWorkbookNonReservationRow(row)) {
    return false
  }

  throw new Error('Previo Voucher is missing or empty')
}

function isIgnorableWorkbookNonReservationRow(row: Record<string, unknown>): boolean {
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

  return !stayStartAt
    && !stayEndAt
    && !guestName
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

function parseFlexiblePrevioDate(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim()

  if (!text) {
    throw new Error(`${label} is missing or empty`)
  }

  if (/^\d{4}-\d{2}-\d{2}(t\d{2}:\d{2}(:\d{2})?)?$/i.test(text)) {
    return parseIsoDate(text, label)
  }

  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) {
    throw new Error(`${label} has unsupported date format: ${text}`)
  }

  const [, day, month, year, hours, minutes, seconds] = match
  const isoDate = `${year}-${padTwo(month)}-${padTwo(day)}`
  if (!hours || !minutes) {
    return isoDate
  }

  return `${isoDate}T${padTwo(hours)}:${minutes}:${seconds ? padTwo(seconds) : '00'}`
}

function parsePrevioWorkbookAmount(value: unknown, label: string): number {
  return parseAmountMinor(normalizeWorkbookAmount(value), label)
}

function readWorkbookOptionalAmount(value: unknown, label: string): number | undefined {
  const normalized = normalizeWorkbookAmount(value)
  return normalized.length > 0 ? parseAmountMinor(normalized, label) : undefined
}

function normalizeWorkbookAmount(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')
    .replace(/Kč|CZK/gi, '')
    .trim()
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

const defaultPrevioReservationParser = new PrevioReservationParser()

export function parsePrevioReservationExport(input: ParsePrevioReservationExportInput): ExtractedRecord[] {
  return defaultPrevioReservationParser.parse(input)
}