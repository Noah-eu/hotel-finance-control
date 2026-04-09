import type { ExtractedRecord, SourceDocument } from '../../domain'
import * as XLSX from 'xlsx'
import { parseAmountMinor, parseIsoDate } from './csv-utils'

export interface ParseInvoiceListWorkbookInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
  binaryContentBase64?: string
}

const INVOICE_LIST_SHEET_NAME = 'Seznam dokladů'

const INVOICE_LIST_HEADER_COLUMNS = [
  'Voucher',
  'Variabilní symbol',
  'Příjezd',
  'Odjezd',
  'Jméno',
  'Pokoje',
  'Způsob úhrady',
  'Zákazník',
  'ID zákazníka',
  'Číslo dokladu'
] as const

const INVOICE_LIST_TRACE_COLUMNS = [
  'Voucher',
  'Variabilní symbol',
  'Příjezd',
  'Odjezd',
  'Jméno',
  'Pokoje',
  'Číslo dokladu'
] as const

const INVOICE_LIST_DATE_CELL_PATTERN = /^(\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d{4}-\d{2}-\d{2}(?:t\d{2}:\d{2}(?::\d{2})?)?)$/i
const INVOICE_LIST_AMOUNT_CELL_PATTERN = /^(?:(?:€|EUR|Kč|CZK)?\s*-?\d[\d\s,.]*(?:€|EUR|Kč|CZK)?)$/i

// ── public API ──────────────────────────────────────────

export function detectInvoiceListWorkbookSignature(binaryContentBase64: string): boolean {
  try {
    const worksheet = readInvoiceListWorkbookSheet(binaryContentBase64)

    if (!worksheet) {
      return false
    }

    return findInvoiceListHeaderRowIndex(readWorksheetRows(worksheet)) !== -1
  } catch {
    return false
  }
}

export class InvoiceListParser {
  parse(input: ParseInvoiceListWorkbookInput): ExtractedRecord[] {
    if (!input.binaryContentBase64) {
      return []
    }

    return parseInvoiceListWorkbookInternal(input)
  }
}

export function parseInvoiceListWorkbook(input: ParseInvoiceListWorkbookInput): ExtractedRecord[] {
  if (!input.binaryContentBase64) {
    return []
  }

  return parseInvoiceListWorkbookInternal(input)
}

// ── internal parse ──────────────────────────────────────

function parseInvoiceListWorkbookInternal(input: ParseInvoiceListWorkbookInput): ExtractedRecord[] {
  const worksheet = readInvoiceListWorkbookSheet(input.binaryContentBase64!)

  if (!worksheet) {
    throw new Error(`Invoice list workbook is missing required sheet: ${INVOICE_LIST_SHEET_NAME}`)
  }

  const extraction = extractInvoiceListRows(worksheet)

  if (extraction.candidateRows.length === 0) {
    return []
  }

  const classifiedRows = extraction.candidateRows.map((row) => ({
    row,
    kind: classifyInvoiceListRow(row) as InvoiceListRowKind
  }))

  const records: ExtractedRecord[] = []
  let currentHeaderIndex = -1

  for (let index = 0; index < classifiedRows.length; index++) {
    const { row, kind } = classifiedRows[index]

    if (kind === 'ignorable') {
      continue
    }

    if (kind === 'header') {
      currentHeaderIndex = index
      const voucher = readOptionalString(row['Voucher'])
      const variableSymbol = readOptionalString(row['Variabilní symbol'])
      const invoiceNumber = readOptionalString(row['Číslo dokladu'])
      const customerId = readOptionalString(row['ID zákazníka'])
      const customerName = readOptionalString(row['Zákazník'])
      const guestName = readOptionalString(row['Jméno'])
      const stayStartAt = readOptionalDate(row['Příjezd'], 'InvoiceList Příjezd')
      const stayEndAt = readOptionalDate(row['Odjezd'], 'InvoiceList Odjezd')
      const roomName = readOptionalString(row['Pokoje'])
      const paymentMethod = readOptionalString(row['Způsob úhrady'])
      const grossAmount = readOptionalAmount(row['Celkem s DPH'], 'InvoiceList Celkem s DPH')
      const netAmount = readOptionalAmount(row['Celkem bez DPH'], 'InvoiceList Celkem bez DPH')
      const reference = voucher ?? invoiceNumber ?? variableSymbol ?? `invoice-list-header-${index + 1}`
      const occurredAt = stayStartAt ?? input.extractedAt.slice(0, 10)

      records.push({
        id: `invoice-list-header-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'invoice-list-header',
        extractedAt: input.extractedAt,
        rawReference: reference,
        amountMinor: grossAmount?.amountMinor ?? 0,
        currency: grossAmount?.currency ?? 'CZK',
        occurredAt,
        data: {
          platform: 'previo-invoice-list',
          rowKind: 'header',
          enrichmentOnly: true,
          voucher,
          variableSymbol,
          invoiceNumber,
          customerId,
          customerName,
          guestName,
          stayStartAt,
          stayEndAt,
          roomName,
          paymentMethod,
          grossAmountMinor: grossAmount?.amountMinor,
          netAmountMinor: netAmount?.amountMinor,
          currency: grossAmount?.currency ?? 'CZK',
          reference,
          sourceSheet: INVOICE_LIST_SHEET_NAME,
          workbookExtractionAudit: {
            sheetName: INVOICE_LIST_SHEET_NAME,
            headerRowIndex: extraction.headerRowIndex + 1,
            headerRowValues: extraction.headerRowValues,
            headerColumnIndexes: extraction.headerColumnIndexes,
            candidateRowCount: extraction.candidateRows.length,
            extractedRowCount: classifiedRows.filter((r) => r.kind !== 'ignorable').length
          }
        }
      })
    }

    if (kind === 'line-item') {
      const parentHeader = currentHeaderIndex >= 0 ? classifiedRows[currentHeaderIndex] : undefined
      const parentVoucher = parentHeader ? readOptionalString(parentHeader.row['Voucher']) : undefined
      const parentVariableSymbol = parentHeader ? readOptionalString(parentHeader.row['Variabilní symbol']) : undefined
      const parentInvoiceNumber = parentHeader ? readOptionalString(parentHeader.row['Číslo dokladu']) : undefined
      const parentCustomerId = parentHeader ? readOptionalString(parentHeader.row['ID zákazníka']) : undefined
      const parentGuestName = parentHeader ? readOptionalString(parentHeader.row['Jméno']) : undefined
      const parentStayStartAt = parentHeader ? readOptionalDate(parentHeader.row['Příjezd'], 'InvoiceList parent Příjezd') : undefined
      const parentStayEndAt = parentHeader ? readOptionalDate(parentHeader.row['Odjezd'], 'InvoiceList parent Odjezd') : undefined
      const parentRoomName = parentHeader ? readOptionalString(parentHeader.row['Pokoje']) : undefined
      const parentPaymentMethod = parentHeader ? readOptionalString(parentHeader.row['Způsob úhrady']) : undefined

      const itemLabel = readOptionalString(row['Název']) ?? readOptionalString(row['Popis']) ?? readOptionalString(row['Položka'])
      const itemAmount = readOptionalAmount(row['Celkem s DPH'] ?? row['Cena s DPH'] ?? row['Částka'], 'InvoiceList line amount')
      const itemNetAmount = readOptionalAmount(row['Celkem bez DPH'] ?? row['Cena bez DPH'], 'InvoiceList line net amount')
      const reference = parentVoucher ?? parentInvoiceNumber ?? parentVariableSymbol ?? `invoice-list-line-${index + 1}`

      records.push({
        id: `invoice-list-line-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'invoice-list-line',
        extractedAt: input.extractedAt,
        rawReference: reference,
        amountMinor: itemAmount?.amountMinor ?? 0,
        currency: itemAmount?.currency ?? 'CZK',
        occurredAt: parentStayStartAt ?? input.extractedAt.slice(0, 10),
        data: {
          platform: 'previo-invoice-list',
          rowKind: 'line-item',
          enrichmentOnly: true,
          parentHeaderIndex: currentHeaderIndex >= 0 ? currentHeaderIndex + 1 : undefined,
          voucher: parentVoucher,
          variableSymbol: parentVariableSymbol,
          invoiceNumber: parentInvoiceNumber,
          customerId: parentCustomerId,
          guestName: parentGuestName,
          stayStartAt: parentStayStartAt,
          stayEndAt: parentStayEndAt,
          roomName: parentRoomName,
          paymentMethod: parentPaymentMethod,
          itemLabel,
          grossAmountMinor: itemAmount?.amountMinor,
          netAmountMinor: itemNetAmount?.amountMinor,
          currency: itemAmount?.currency ?? 'CZK',
          reference,
          sourceSheet: INVOICE_LIST_SHEET_NAME
        }
      })
    }
  }

  return records
}

// ── row classification ──────────────────────────────────

type InvoiceListRowKind = 'header' | 'line-item' | 'ignorable'

function classifyInvoiceListRow(row: Record<string, unknown>): InvoiceListRowKind {
  const voucher = readOptionalString(row['Voucher'])
  const guestName = readOptionalString(row['Jméno'])
  const stayStartAt = readOptionalString(row['Příjezd'])
  const invoiceNumber = readOptionalString(row['Číslo dokladu'])

  if (voucher && guestName && stayStartAt && invoiceNumber) {
    return 'header'
  }

  if (voucher && stayStartAt) {
    return 'header'
  }

  const itemLabel = readOptionalString(row['Název']) ?? readOptionalString(row['Popis']) ?? readOptionalString(row['Položka'])
  const amount = readOptionalString(row['Celkem s DPH'] ?? row['Cena s DPH'] ?? row['Částka'])

  if (itemLabel && amount) {
    return 'line-item'
  }

  return 'ignorable'
}

// ── workbook reading ────────────────────────────────────

function readInvoiceListWorkbookSheet(binaryContentBase64: string): XLSX.WorkSheet | undefined {
  const workbook = XLSX.read(binaryContentBase64, { type: 'base64', cellDates: false })
  return workbook.Sheets[INVOICE_LIST_SHEET_NAME]
}

function readWorksheetRows(worksheet: XLSX.WorkSheet): Array<Array<unknown>> {
  return XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
  })
}

function extractInvoiceListRows(worksheet: XLSX.WorkSheet): {
  headerRowIndex: number
  headerRowValues: string[]
  headerColumnIndexes: Record<string, number>
  candidateRows: Array<Record<string, unknown>>
} {
  const sheetRows = readWorksheetRows(worksheet)

  const headerRowIndex = findInvoiceListHeaderRowIndex(sheetRows)
  if (headerRowIndex === -1) {
    throw new Error(`Invoice list workbook is missing the expected header row on sheet: ${INVOICE_LIST_SHEET_NAME}`)
  }

  const headerRow = sheetRows[headerRowIndex]!.map((cell) => String(cell ?? '').trim())
  const headerColumnIndexes = indexColumns(headerRow)
  const candidateRows = sheetRows
    .slice(headerRowIndex + 1)
    .map((row) => buildRowObject(headerColumnIndexes, row))

  return {
    headerRowIndex,
    headerRowValues: headerRow,
    headerColumnIndexes,
    candidateRows
  }
}

function findInvoiceListHeaderRowIndex(rows: Array<Array<unknown>>): number {
  return rows.findIndex((row) => {
    const normalized = row.map((cell) => String(cell ?? '').trim())
    const nonEmpty = normalized.filter(Boolean)

    return INVOICE_LIST_HEADER_COLUMNS.every((column) => nonEmpty.includes(column))
  })
}

function indexColumns(headers: string[]): Record<string, number> {
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

function buildRowObject(headerColumnIndexes: Record<string, number>, row: Array<unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {}

  for (const [header, index] of Object.entries(headerColumnIndexes)) {
    if (index < 0) {
      continue
    }

    record[header] = row[index] ?? ''
  }

  return record
}

// ── cell readers ────────────────────────────────────────

function readOptionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}

function readOptionalDate(value: unknown, label: string): string | undefined {
  const text = String(value ?? '').trim()
  if (!text) {
    return undefined
  }

  if (/^\d{4}-\d{2}-\d{2}(t\d{2}:\d{2}(:\d{2})?)?$/i.test(text)) {
    return parseIsoDate(text, label)
  }

  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) {
    const [, day, month, year] = match
    return `${year}-${padTwo(month!)}-${padTwo(day!)}`
  }

  const shortYearMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (shortYearMatch) {
    const [, day, month, shortYear] = shortYearMatch
    const year = Number.parseInt(shortYear!, 10) >= 70 ? `19${padTwo(shortYear!)}` : `20${padTwo(shortYear!)}`
    return `${year}-${padTwo(month!)}-${padTwo(day!)}`
  }

  return undefined
}

function readOptionalAmount(
  value: unknown,
  label: string
): { amountMinor: number; currency: 'CZK' | 'EUR' } | undefined {
  const raw = String(value ?? '')
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')

  if (!raw) {
    return undefined
  }

  const currencyMatch = raw.match(/^(€|EUR|Kč|CZK)?(-?[\d.,]+)(€|EUR|Kč|CZK)?$/i)
  if (!currencyMatch) {
    return undefined
  }

  const [, leadingCurrency, amount, trailingCurrency] = currencyMatch
  const currency = inferCurrency(leadingCurrency) ?? inferCurrency(trailingCurrency) ?? 'CZK'
  const normalizedAmount = normalizeAmount(amount!)

  if (!normalizedAmount) {
    return undefined
  }

  try {
    return {
      amountMinor: parseAmountMinor(normalizedAmount, label),
      currency
    }
  } catch {
    return undefined
  }
}

function normalizeAmount(amount: string): string | undefined {
  if (/^-?\d+(,\d{2})$/.test(amount)) {
    return amount
  }

  if (/^-?\d{1,3}(,\d{3})+(\.\d{2})$/.test(amount)) {
    return amount.replace(/,/g, '')
  }

  if (/^-?\d+(\.\d{2})$/.test(amount)) {
    return amount
  }

  if (/^-?\d+$/.test(amount)) {
    return amount
  }

  return undefined
}

function inferCurrency(token: string | undefined): 'CZK' | 'EUR' | undefined {
  if (!token) {
    return undefined
  }

  if (/^(€|EUR)$/i.test(token)) {
    return 'EUR'
  }

  if (/^(Kč|CZK)$/i.test(token)) {
    return 'CZK'
  }

  return undefined
}

function padTwo(value: string): string {
  return value.padStart(2, '0')
}
