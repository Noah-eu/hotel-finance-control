import type { ExtractedRecord, SourceDocument } from '../../domain'
import * as XLSX from 'xlsx'
// @ts-expect-error – cpexcel.full.mjs has no type declarations
import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs'
import { parseAmountMinor, parseIsoDate } from './csv-utils'

export interface ParseInvoiceListWorkbookInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
  binaryContentBase64?: string
}

const INVOICE_LIST_SHEET_NAME = 'Seznam dokladů'
const INVOICE_LIST_PRODUCTION_PRIMARY_SHEET_NAME = 'Doklady'
const INVOICE_LIST_PRODUCTION_LINE_ITEMS_SHEET_NAME = 'Položky dokladů'
const INVOICE_LIST_WORKBOOK_SIGNATURE_DETECTOR_NAME = 'detectInvoiceListWorkbookSignature'

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

const INVOICE_LIST_HEADER_FIELD_ALIASES = {
  invoiceDocumentType: ['Typ', 'Typ dokladu', 'Typ faktury'],
  voucher: ['Voucher', 'Rezervace', 'Číslo rezervace', 'Rezervační číslo', 'Rezervacni cislo'],
  variableSymbol: ['Variabilní symbol', 'VS'],
  stayStartAt: ['Příjezd', 'Termín od', 'Datum od', 'Prijezd', 'Termin od'],
  stayEndAt: ['Odjezd', 'Termín do', 'Datum do', 'Odjezd', 'Termin do'],
  guestName: ['Jméno', 'Host', 'Jméno hosta', 'Jmeno', 'Jmeno hosta'],
  roomName: ['Pokoje', 'Pokoj', 'Jednotka', 'Pokoj/c.j.'],
  paymentMethod: ['Způsob úhrady', 'Úhrada'],
  customerName: ['Zákazník', 'Klient', 'Firma', 'Zakaznik'],
  customerId: ['ID zákazníka', 'ID klienta'],
  invoiceNumber: ['Číslo dokladu', 'Doklad', 'Číslo', 'Číslo faktury', 'Doklad č.', 'Cislo dokladu', 'Cislo faktury'],
  grossAmount: ['Celkem s DPH', 'Částka s DPH', 'Celkem vč. DPH', 'Celkem', 'Částka celkem', 'Castka celkem', 'Celkem vcetne dph'],
  netAmount: ['Celkem bez DPH', 'Základ DPH', 'Bez DPH', 'Zaklad dph']
} as const

const INVOICE_LIST_LINE_FIELD_ALIASES = {
  invoiceLineDocumentType: ['Typ dokladu', 'Typ'],
  invoiceNumber: ['Číslo dokladu', 'Doklad', 'Číslo', 'Číslo faktury', 'Doklad č.', 'Cislo dokladu', 'Cislo faktury'],
  voucher: ['Voucher', 'Rezervace', 'Číslo rezervace', 'Rezervační číslo'],
  itemLabel: ['Název', 'Popis', 'Položka', 'Nazev', 'Název položky', 'Nazev polozky'],
  amountGross: ['Celkem s DPH', 'Cena s DPH', 'Částka', 'Celkem', 'Castka celkem', 'Částka celkem'],
  amountNet: ['Celkem bez DPH', 'Cena bez DPH', 'Základ DPH', 'Zaklad dph']
} as const

interface InvoiceListHeaderDetectionRule {
  requiredAnyOf: ReadonlyArray<readonly string[]>
  minGroupsMatched: number
}

const INVOICE_LIST_LEGACY_HEADER_RULE: InvoiceListHeaderDetectionRule = {
  requiredAnyOf: [
    ['Voucher'],
    ['Variabilní symbol', 'VS'],
    ['Příjezd', 'Termín od'],
    ['Číslo dokladu', 'Doklad', 'Číslo faktury'],
    ['Název', 'Popis', 'Položka']
  ],
  minGroupsMatched: 4
}

const INVOICE_LIST_PRODUCTION_PRIMARY_HEADER_RULE: InvoiceListHeaderDetectionRule = {
  requiredAnyOf: [
    INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceNumber,
    INVOICE_LIST_HEADER_FIELD_ALIASES.grossAmount,
    INVOICE_LIST_HEADER_FIELD_ALIASES.voucher,
    INVOICE_LIST_HEADER_FIELD_ALIASES.guestName
  ],
  minGroupsMatched: 2
}

const INVOICE_LIST_PRODUCTION_LINE_ITEMS_HEADER_RULE: InvoiceListHeaderDetectionRule = {
  requiredAnyOf: [
    INVOICE_LIST_LINE_FIELD_ALIASES.invoiceNumber,
    INVOICE_LIST_LINE_FIELD_ALIASES.itemLabel,
    INVOICE_LIST_LINE_FIELD_ALIASES.amountGross
  ],
  minGroupsMatched: 2
}

// ── public API ──────────────────────────────────────────

export function detectInvoiceListWorkbookSignature(binaryContentBase64: string): boolean {
  const diagnostics = diagnoseInvoiceListWorkbookSignature(binaryContentBase64)
  return diagnostics.detected
}

export interface InvoiceListWorkbookSignatureRuntimeDiagnostics {
  workbookSignatureFunctionReached: boolean
  workbookSignatureDetectorName: string
  workbookReadSucceeded: boolean
  workbookSheetNamesRaw: string[]
  workbookSheetNamesNormalized: string[]
  workbookSignatureFailureReason: string
  invoiceListPrimarySheetUsed?: string
  invoiceListLineItemsSheetUsed?: string
  invoiceListParsedRowCount?: number
  invoiceListParsedLineItemCount?: number
  invoiceListPrimaryHeaderScanRows?: Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }>
  invoiceListLineItemsHeaderScanRows?: Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }>
  invoiceListPrimaryDetectedHeaderRowIndex?: number
  invoiceListLineItemsDetectedHeaderRowIndex?: number
  invoiceListPrimaryHeaderCellsRaw?: string[]
  invoiceListLineItemsHeaderCellsRaw?: string[]
  invoiceListPrimaryHeaderCellsNormalized?: string[]
  invoiceListLineItemsHeaderCellsNormalized?: string[]
  invoiceListHeaderFailureReason?: string
}

export interface InvoiceListWorkbookDiagnostics extends InvoiceListWorkbookSignatureRuntimeDiagnostics {
  detected: boolean
  sheetNames: string[]
  matchedSheetName: string | undefined
  headerRowFound: boolean
  error?: string
}

export function diagnoseInvoiceListWorkbookSignature(binaryContentBase64: string): InvoiceListWorkbookDiagnostics {
  try {
    ensureInvoiceListWorkbookCodepageSupport()
    const workbook = XLSX.read(binaryContentBase64, { type: 'base64', cellDates: false })
    const sheetNames = workbook.SheetNames.slice()
    const workbookContext = resolveInvoiceListWorkbookContext(workbook)
    const matchedSheetName = workbookContext.primarySheetName
    const headerRowFound = workbookContext.primaryHeaderRowFound
    const detected = workbookContext.detected
    const workbookSheetNamesNormalized = sheetNames.map((sheetName) => normalizeWorkbookSignatureName(sheetName))
    const workbookSignatureFailureReason = detected
      ? ''
      : workbookContext.failureReason

    return {
      workbookSignatureFunctionReached: true,
      workbookSignatureDetectorName: INVOICE_LIST_WORKBOOK_SIGNATURE_DETECTOR_NAME,
      workbookReadSucceeded: true,
      workbookSheetNamesRaw: sheetNames,
      workbookSheetNamesNormalized,
      workbookSignatureFailureReason,
      invoiceListPrimarySheetUsed: workbookContext.primarySheetName,
      invoiceListLineItemsSheetUsed: workbookContext.lineItemsSheetName,
      invoiceListParsedRowCount: workbookContext.parsedRowCount,
      invoiceListParsedLineItemCount: workbookContext.parsedLineItemCount,
      invoiceListPrimaryHeaderScanRows: workbookContext.primaryHeaderScanRows,
      invoiceListLineItemsHeaderScanRows: workbookContext.lineItemsHeaderScanRows,
      invoiceListPrimaryDetectedHeaderRowIndex: workbookContext.primaryDetectedHeaderRowIndex,
      invoiceListLineItemsDetectedHeaderRowIndex: workbookContext.lineItemsDetectedHeaderRowIndex,
      invoiceListPrimaryHeaderCellsRaw: workbookContext.primaryHeaderCellsRaw,
      invoiceListLineItemsHeaderCellsRaw: workbookContext.lineItemsHeaderCellsRaw,
      invoiceListPrimaryHeaderCellsNormalized: workbookContext.primaryHeaderCellsNormalized,
      invoiceListLineItemsHeaderCellsNormalized: workbookContext.lineItemsHeaderCellsNormalized,
      invoiceListHeaderFailureReason: workbookContext.headerFailureReason,
      detected,
      sheetNames,
      matchedSheetName,
      headerRowFound
    }
  } catch (error) {
    const reason = error instanceof Error ? `workbook-read-failed:${error.message}` : `workbook-read-failed:${String(error)}`
    return {
      workbookSignatureFunctionReached: true,
      workbookSignatureDetectorName: INVOICE_LIST_WORKBOOK_SIGNATURE_DETECTOR_NAME,
      workbookReadSucceeded: false,
      workbookSheetNamesRaw: [],
      workbookSheetNamesNormalized: [],
      workbookSignatureFailureReason: reason,
      detected: false,
      sheetNames: [],
      matchedSheetName: undefined,
      headerRowFound: false,
      error: error instanceof Error ? error.message : String(error)
    }
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
  const workbook = readInvoiceListWorkbook(input.binaryContentBase64!)
  const workbookContext = resolveInvoiceListWorkbookContext(workbook)

  if (!workbookContext.detected || !workbookContext.primaryWorksheet || !workbookContext.primarySheetName) {
    throw new Error(`Invoice list workbook is missing required sheet family: ${INVOICE_LIST_SHEET_NAME} or ${INVOICE_LIST_PRODUCTION_PRIMARY_SHEET_NAME} + ${INVOICE_LIST_PRODUCTION_LINE_ITEMS_SHEET_NAME}`)
  }

  const records: ExtractedRecord[] = []
  if (workbookContext.shape === 'legacy') {
    records.push(...parseLegacyInvoiceListRows({
      sourceDocument: input.sourceDocument,
      extractedAt: input.extractedAt,
      extraction: workbookContext.primaryExtraction!,
      sourceSheetName: workbookContext.primarySheetName
    }))
  } else {
    records.push(...parseProductionInvoiceListRows({
      sourceDocument: input.sourceDocument,
      extractedAt: input.extractedAt,
      headerExtraction: workbookContext.primaryExtraction!,
      lineItemsExtraction: workbookContext.lineItemsExtraction!,
      sourceSheetName: workbookContext.primarySheetName,
      lineItemsSheetName: workbookContext.lineItemsSheetName ?? INVOICE_LIST_PRODUCTION_LINE_ITEMS_SHEET_NAME
    }))
  }

  return records
}

// ── row classification ──────────────────────────────────

type InvoiceListRowKind = 'header' | 'line-item' | 'ignorable'

interface InvoiceListWorkbookContext {
  detected: boolean
  shape: 'legacy' | 'production' | 'unknown'
  primaryWorksheet?: XLSX.WorkSheet
  lineItemsWorksheet?: XLSX.WorkSheet
  primarySheetName?: string
  lineItemsSheetName?: string
  primaryHeaderRowFound: boolean
  lineItemsHeaderRowFound: boolean
  parsedRowCount: number
  parsedLineItemCount: number
  failureReason: string
  headerFailureReason?: string
  primaryHeaderScanRows: Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }>
  lineItemsHeaderScanRows: Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }>
  primaryDetectedHeaderRowIndex?: number
  lineItemsDetectedHeaderRowIndex?: number
  primaryHeaderCellsRaw?: string[]
  lineItemsHeaderCellsRaw?: string[]
  primaryHeaderCellsNormalized?: string[]
  lineItemsHeaderCellsNormalized?: string[]
  primaryExtraction?: {
    headerRowIndex: number
    headerRowValues: string[]
    headerColumnIndexes: Record<string, number>
    candidateRows: Array<Record<string, unknown>>
  }
  lineItemsExtraction?: {
    headerRowIndex: number
    headerRowValues: string[]
    headerColumnIndexes: Record<string, number>
    candidateRows: Array<Record<string, unknown>>
  }
}

function parseLegacyInvoiceListRows(input: {
  sourceDocument: SourceDocument
  extractedAt: string
  extraction: {
    headerRowIndex: number
    headerRowValues: string[]
    headerColumnIndexes: Record<string, number>
    candidateRows: Array<Record<string, unknown>>
  }
  sourceSheetName: string
}): ExtractedRecord[] {
  const classifiedRows = input.extraction.candidateRows.map((row) => ({
    row,
    kind: classifyInvoiceListRow(row) as InvoiceListRowKind
  }))
  const records: ExtractedRecord[] = []
  let currentHeaderIndex = -1

  for (let index = 0; index < classifiedRows.length; index += 1) {
    const { row, kind } = classifiedRows[index]!

    if (kind === 'ignorable') {
      continue
    }

    if (kind === 'header') {
      currentHeaderIndex = index
      records.push(buildInvoiceListHeaderRecord({
        row,
        index,
        sourceDocumentId: input.sourceDocument.id,
        extractedAt: input.extractedAt,
        sourceSheetName: input.sourceSheetName,
        extraction: input.extraction,
        extractedRowCount: classifiedRows.filter((entry) => entry.kind !== 'ignorable').length
      }))
    }

    if (kind === 'line-item') {
      const parentHeader = currentHeaderIndex >= 0 ? classifiedRows[currentHeaderIndex] : undefined
      const parentRow = parentHeader?.row
      records.push(buildInvoiceListLineItemRecord({
        row,
        index,
        sourceDocumentId: input.sourceDocument.id,
        extractedAt: input.extractedAt,
        sourceSheetName: input.sourceSheetName,
        parentHeaderIndex: currentHeaderIndex >= 0 ? currentHeaderIndex + 1 : undefined,
        parentVoucher: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.voucher) : undefined,
        parentVariableSymbol: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.variableSymbol) : undefined,
        parentInvoiceNumber: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceNumber) : undefined,
        parentCustomerId: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.customerId) : undefined,
        parentGuestName: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.guestName) : undefined,
        parentStayStartAt: parentRow ? readRowDate(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.stayStartAt, 'InvoiceList parent Příjezd') : undefined,
        parentStayEndAt: parentRow ? readRowDate(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.stayEndAt, 'InvoiceList parent Odjezd') : undefined,
        parentRoomName: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.roomName) : undefined,
        parentPaymentMethod: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.paymentMethod) : undefined
      }))
    }
  }

  return records
}

function parseProductionInvoiceListRows(input: {
  sourceDocument: SourceDocument
  extractedAt: string
  headerExtraction: {
    headerRowIndex: number
    headerRowValues: string[]
    headerColumnIndexes: Record<string, number>
    candidateRows: Array<Record<string, unknown>>
  }
  lineItemsExtraction: {
    headerRowIndex: number
    headerRowValues: string[]
    headerColumnIndexes: Record<string, number>
    candidateRows: Array<Record<string, unknown>>
  }
  sourceSheetName: string
  lineItemsSheetName: string
}): ExtractedRecord[] {
  const records: ExtractedRecord[] = []
  const headerRows = input.headerExtraction.candidateRows
    .filter((row) => isInvoiceListHeaderCandidateRow(row))
  const headerByInvoiceNumber = new Map<string, Record<string, unknown>>()
  const headerByVoucher = new Map<string, Record<string, unknown>>()

  headerRows.forEach((row, index) => {
    const headerRecord = buildInvoiceListHeaderRecord({
      row,
      index,
      sourceDocumentId: input.sourceDocument.id,
      extractedAt: input.extractedAt,
      sourceSheetName: input.sourceSheetName,
      extraction: input.headerExtraction,
      extractedRowCount: headerRows.length
    })
    const invoiceNumber = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceNumber)
    const voucher = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.voucher)

    if (invoiceNumber) {
      headerByInvoiceNumber.set(invoiceNumber, row)
    }
    if (voucher) {
      headerByVoucher.set(voucher, row)
    }

    records.push(headerRecord)
  })

  const lineRows = input.lineItemsExtraction.candidateRows
    .filter((row) => isInvoiceListLineCandidateRow(row))

  lineRows.forEach((row, index) => {
    const lineInvoiceNumber = readRowString(row, INVOICE_LIST_LINE_FIELD_ALIASES.invoiceNumber)
      ?? readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceNumber)
    const lineVoucher = readRowString(row, INVOICE_LIST_LINE_FIELD_ALIASES.voucher)
      ?? readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.voucher)
    const parentRow = (lineInvoiceNumber ? headerByInvoiceNumber.get(lineInvoiceNumber) : undefined)
      ?? (lineVoucher ? headerByVoucher.get(lineVoucher) : undefined)

    records.push(buildInvoiceListLineItemRecord({
      row,
      index,
      sourceDocumentId: input.sourceDocument.id,
      extractedAt: input.extractedAt,
      sourceSheetName: input.lineItemsSheetName,
      parentHeaderIndex: undefined,
      parentVoucher: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.voucher) : lineVoucher,
      parentVariableSymbol: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.variableSymbol) : undefined,
      parentInvoiceNumber: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceNumber) : lineInvoiceNumber,
      parentCustomerId: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.customerId) : undefined,
      parentGuestName: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.guestName) : undefined,
      parentStayStartAt: parentRow ? readRowDate(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.stayStartAt, 'InvoiceList parent Příjezd') : undefined,
      parentStayEndAt: parentRow ? readRowDate(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.stayEndAt, 'InvoiceList parent Odjezd') : undefined,
      parentRoomName: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.roomName) : undefined,
      parentPaymentMethod: parentRow ? readRowString(parentRow, INVOICE_LIST_HEADER_FIELD_ALIASES.paymentMethod) : undefined
    }))
  })

  return records
}

function classifyInvoiceListRow(row: Record<string, unknown>): InvoiceListRowKind {
  const voucher = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.voucher)
  const guestName = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.guestName)
  const stayStartAt = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.stayStartAt)
  const invoiceNumber = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceNumber)

  if (voucher && guestName && stayStartAt && invoiceNumber) {
    return 'header'
  }

  if (voucher && stayStartAt) {
    return 'header'
  }

  const itemLabel = readRowString(row, INVOICE_LIST_LINE_FIELD_ALIASES.itemLabel)
  const amount = readRowString(row, INVOICE_LIST_LINE_FIELD_ALIASES.amountGross)

  if (itemLabel && amount) {
    return 'line-item'
  }

  return 'ignorable'
}

// ── workbook reading ────────────────────────────────────

function readInvoiceListWorkbook(binaryContentBase64: string): XLSX.WorkBook {
  ensureInvoiceListWorkbookCodepageSupport()
  return XLSX.read(binaryContentBase64, { type: 'base64', cellDates: false })
}

function resolveInvoiceListWorkbookContext(workbook: XLSX.WorkBook): InvoiceListWorkbookContext {
  const legacyWorksheet = findWorksheetByNormalizedName(workbook, INVOICE_LIST_SHEET_NAME)
  const legacySheetName = resolveWorksheetName(workbook, legacyWorksheet)

  if (legacyWorksheet && legacySheetName) {
    const extraction = extractInvoiceListRows(legacyWorksheet, INVOICE_LIST_LEGACY_HEADER_RULE)

    if (extraction) {
      return {
        detected: true,
        shape: 'legacy',
        primaryWorksheet: legacyWorksheet,
        primarySheetName: legacySheetName,
        primaryHeaderRowFound: true,
        lineItemsHeaderRowFound: false,
        parsedRowCount: extraction.candidateRows.length,
        parsedLineItemCount: extraction.candidateRows.filter((row) => classifyInvoiceListRow(row) === 'line-item').length,
        failureReason: '',
        headerFailureReason: '',
        primaryHeaderScanRows: extraction.headerScanRows,
        lineItemsHeaderScanRows: [],
        primaryDetectedHeaderRowIndex: extraction.headerRowIndex,
        lineItemsDetectedHeaderRowIndex: undefined,
        primaryHeaderCellsRaw: extraction.headerRowValues,
        lineItemsHeaderCellsRaw: undefined,
        primaryHeaderCellsNormalized: extraction.headerRowValues.map((value) => normalizeWorkbookSignatureName(value)),
        lineItemsHeaderCellsNormalized: undefined,
        primaryExtraction: extraction
      }
    }
  }

  const productionPrimaryWorksheet = findWorksheetByNormalizedName(workbook, INVOICE_LIST_PRODUCTION_PRIMARY_SHEET_NAME)
  const productionLineItemsWorksheet = findWorksheetByNormalizedName(workbook, INVOICE_LIST_PRODUCTION_LINE_ITEMS_SHEET_NAME)
  const productionPrimarySheetName = resolveWorksheetName(workbook, productionPrimaryWorksheet)
  const productionLineItemsSheetName = resolveWorksheetName(workbook, productionLineItemsWorksheet)

  if (!productionPrimaryWorksheet || !productionPrimarySheetName || !productionLineItemsWorksheet || !productionLineItemsSheetName) {
    return {
      detected: false,
      shape: 'unknown',
      primaryWorksheet: productionPrimaryWorksheet,
      lineItemsWorksheet: productionLineItemsWorksheet,
      primarySheetName: productionPrimarySheetName,
      lineItemsSheetName: productionLineItemsSheetName,
      primaryHeaderRowFound: false,
      lineItemsHeaderRowFound: false,
      parsedRowCount: 0,
      parsedLineItemCount: 0,
      failureReason: 'required-sheet-not-found',
      headerFailureReason: 'required-sheet-not-found',
      primaryHeaderScanRows: [],
      lineItemsHeaderScanRows: []
    }
  }

  const headerExtraction = extractInvoiceListRows(productionPrimaryWorksheet, INVOICE_LIST_PRODUCTION_PRIMARY_HEADER_RULE)
  const lineItemsExtraction = extractInvoiceListRows(productionLineItemsWorksheet, INVOICE_LIST_PRODUCTION_LINE_ITEMS_HEADER_RULE)

  if (!headerExtraction || !lineItemsExtraction) {
    return {
      detected: false,
      shape: 'production',
      primaryWorksheet: productionPrimaryWorksheet,
      lineItemsWorksheet: productionLineItemsWorksheet,
      primarySheetName: productionPrimarySheetName,
      lineItemsSheetName: productionLineItemsSheetName,
      primaryHeaderRowFound: Boolean(headerExtraction),
      lineItemsHeaderRowFound: Boolean(lineItemsExtraction),
      parsedRowCount: headerExtraction?.candidateRows.length ?? 0,
      parsedLineItemCount: lineItemsExtraction?.candidateRows.length ?? 0,
      failureReason: 'header-row-not-found',
      headerFailureReason: !headerExtraction && !lineItemsExtraction
        ? 'primary-and-line-items-header-row-not-found'
        : !headerExtraction
          ? 'primary-header-row-not-found'
          : 'line-items-header-row-not-found',
      primaryHeaderScanRows: headerExtraction?.headerScanRows ?? scanWorksheetHeaderRows(productionPrimaryWorksheet),
      lineItemsHeaderScanRows: lineItemsExtraction?.headerScanRows ?? scanWorksheetHeaderRows(productionLineItemsWorksheet),
      primaryDetectedHeaderRowIndex: headerExtraction?.headerRowIndex,
      lineItemsDetectedHeaderRowIndex: lineItemsExtraction?.headerRowIndex,
      primaryHeaderCellsRaw: headerExtraction?.headerRowValues,
      lineItemsHeaderCellsRaw: lineItemsExtraction?.headerRowValues,
      primaryHeaderCellsNormalized: headerExtraction?.headerRowValues.map((value) => normalizeWorkbookSignatureName(value)),
      lineItemsHeaderCellsNormalized: lineItemsExtraction?.headerRowValues.map((value) => normalizeWorkbookSignatureName(value))
    }
  }

  const parsedLineItemCount = lineItemsExtraction.candidateRows.filter((row) => isInvoiceListLineCandidateRow(row)).length

  return {
    detected: true,
    shape: 'production',
    primaryWorksheet: productionPrimaryWorksheet,
    lineItemsWorksheet: productionLineItemsWorksheet,
    primarySheetName: productionPrimarySheetName,
    lineItemsSheetName: productionLineItemsSheetName,
    primaryHeaderRowFound: true,
    lineItemsHeaderRowFound: true,
    parsedRowCount: headerExtraction.candidateRows.length,
    parsedLineItemCount,
    failureReason: '',
    headerFailureReason: '',
    primaryHeaderScanRows: headerExtraction.headerScanRows,
    lineItemsHeaderScanRows: lineItemsExtraction.headerScanRows,
    primaryDetectedHeaderRowIndex: headerExtraction.headerRowIndex,
    lineItemsDetectedHeaderRowIndex: lineItemsExtraction.headerRowIndex,
    primaryHeaderCellsRaw: headerExtraction.headerRowValues,
    lineItemsHeaderCellsRaw: lineItemsExtraction.headerRowValues,
    primaryHeaderCellsNormalized: headerExtraction.headerRowValues.map((value) => normalizeWorkbookSignatureName(value)),
    lineItemsHeaderCellsNormalized: lineItemsExtraction.headerRowValues.map((value) => normalizeWorkbookSignatureName(value)),
    primaryExtraction: headerExtraction,
    lineItemsExtraction
  }
}

function resolveWorksheetName(workbook: XLSX.WorkBook, worksheet: XLSX.WorkSheet | undefined): string | undefined {
  if (!worksheet) {
    return undefined
  }

  return workbook.SheetNames.find((sheetName) => workbook.Sheets[sheetName] === worksheet)
}

/**
 * Find a worksheet by name with fallback to diacritics-tolerant matching.
 * Old .xls files (BIFF8) encode sheet names using the file's codepage (e.g. CP 1250
 * for Czech). The xlsx library needs the optional `codepage` module to decode these
 * correctly. Without it the library falls back to Latin-1, which maps e.g. 'ů' (U+016F,
 * CP 1250 0xF9) to 'ù' (U+00F9). This function normalizes both sides so the lookup
 * succeeds regardless of codepage support.
 */
function findWorksheetByNormalizedName(workbook: XLSX.WorkBook, targetSheetName: string): XLSX.WorkSheet | undefined {
  if (workbook.Sheets[targetSheetName]) {
    return workbook.Sheets[targetSheetName]
  }

  const normalizedTarget = stripDiacriticsLower(targetSheetName)

  for (const sheetName of workbook.SheetNames) {
    if (stripDiacriticsLower(sheetName) === normalizedTarget) {
      return workbook.Sheets[sheetName]
    }
  }

  return undefined
}

function stripDiacriticsLower(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

let invoiceListWorkbookCodepageSupportInitialized = false

function ensureInvoiceListWorkbookCodepageSupport(): void {
  if (invoiceListWorkbookCodepageSupportInitialized) {
    return
  }

  invoiceListWorkbookCodepageSupportInitialized = true
  ;(globalThis as Record<string, unknown>).cptable = cpexcel
  const xlsxWithCodepageSetter = XLSX as typeof XLSX & { set_cptable?: (table: unknown) => void }

  if (typeof xlsxWithCodepageSetter.set_cptable === 'function') {
    xlsxWithCodepageSetter.set_cptable(cpexcel)
  }
}

function normalizeWorkbookSignatureName(value: string): string {
  return stripDiacriticsLower(value)
    .replace(/[\u00a0]/g, ' ')
    .replace(/[_./\\\-]+/g, ' ')
    .replace(/[(){}\[\]:;,'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readWorksheetRows(worksheet: XLSX.WorkSheet): Array<Array<unknown>> {
  return XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
  })
}

function extractInvoiceListRows(
  worksheet: XLSX.WorkSheet,
  headerRule: InvoiceListHeaderDetectionRule
): {
  headerRowIndex: number
  headerRowValues: string[]
  headerColumnIndexes: Record<string, number>
  candidateRows: Array<Record<string, unknown>>
  headerScanRows: Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }>
} | undefined {
  const sheetRows = readWorksheetRows(worksheet)
  const scanResult = findInvoiceListHeaderRowIndex(sheetRows, headerRule)
  const headerRowIndex = scanResult.headerRowIndex
  if (headerRowIndex === -1) {
    return undefined
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
    candidateRows,
    headerScanRows: scanResult.scanRows
  }
}

function findInvoiceListHeaderRowIndex(
  rows: Array<Array<unknown>>,
  headerRule: InvoiceListHeaderDetectionRule
): {
  headerRowIndex: number
  scanRows: Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }>
} {
  const scanRows = scanHeaderRows(rows)
  const minGroupsMatched = Math.max(1, headerRule.minGroupsMatched)

  for (const scanRow of scanRows) {
    const presentHeaders = new Set(scanRow.cellsNormalized)
    const matchedGroups = headerRule.requiredAnyOf.filter((aliasGroup) => {
      return aliasGroup.some((alias) => presentHeaders.has(normalizeWorkbookSignatureName(alias)))
    }).length

    if (matchedGroups >= minGroupsMatched) {
      return {
        headerRowIndex: scanRow.rowIndex,
        scanRows
      }
    }
  }

  return {
    headerRowIndex: -1,
    scanRows
  }
}

function scanWorksheetHeaderRows(worksheet: XLSX.WorkSheet): Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }> {
  return scanHeaderRows(readWorksheetRows(worksheet))
}

function scanHeaderRows(rows: Array<Array<unknown>>): Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }> {
  const scans: Array<{ rowIndex: number; cellsRaw: string[]; cellsNormalized: string[] }> = []

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const rawCells = (rows[rowIndex] ?? [])
      .map((cell) => String(cell ?? '').trim())
      .filter(Boolean)

    if (rawCells.length === 0) {
      continue
    }

    scans.push({
      rowIndex,
      cellsRaw: rawCells.slice(0, 30),
      cellsNormalized: rawCells.map((cell) => normalizeWorkbookSignatureName(cell)).filter(Boolean).slice(0, 30)
    })

    if (scans.length >= 40) {
      break
    }
  }

  return scans
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

function buildInvoiceListHeaderRecord(input: {
  row: Record<string, unknown>
  index: number
  sourceDocumentId: SourceDocument['id']
  extractedAt: string
  sourceSheetName: string
  extraction: {
    headerRowIndex: number
    headerRowValues: string[]
    headerColumnIndexes: Record<string, number>
    candidateRowCount: number
  } | {
    headerRowIndex: number
    headerRowValues: string[]
    headerColumnIndexes: Record<string, number>
    candidateRows: Array<Record<string, unknown>>
  }
  extractedRowCount: number
}): ExtractedRecord {
  const invoiceDocumentType = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceDocumentType)
  const voucher = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.voucher)
  const variableSymbol = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.variableSymbol)
  const invoiceNumber = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceNumber)
  const customerId = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.customerId)
  const customerName = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.customerName)
  const guestName = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.guestName)
  const stayStartAt = readRowDate(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.stayStartAt, 'InvoiceList Příjezd')
  const stayEndAt = readRowDate(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.stayEndAt, 'InvoiceList Odjezd')
  const roomName = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.roomName)
  const paymentMethod = readRowString(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.paymentMethod)
  const grossAmount = readRowAmount(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.grossAmount, 'InvoiceList Celkem s DPH')
  const netAmount = readRowAmount(input.row, INVOICE_LIST_HEADER_FIELD_ALIASES.netAmount, 'InvoiceList Celkem bez DPH')
  const reference = voucher ?? invoiceNumber ?? variableSymbol ?? `invoice-list-header-${input.index + 1}`
  const occurredAt = stayStartAt ?? input.extractedAt.slice(0, 10)

  return {
    id: `invoice-list-header-${input.index + 1}`,
    sourceDocumentId: input.sourceDocumentId,
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
      invoiceDocumentType,
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
      sourceSheet: input.sourceSheetName,
      workbookExtractionAudit: {
        sheetName: input.sourceSheetName,
        headerRowIndex: input.extraction.headerRowIndex + 1,
        headerRowValues: input.extraction.headerRowValues,
        headerColumnIndexes: input.extraction.headerColumnIndexes,
        candidateRowCount: 'candidateRows' in input.extraction ? input.extraction.candidateRows.length : input.extraction.candidateRowCount,
        extractedRowCount: input.extractedRowCount
      }
    }
  }
}

function buildInvoiceListLineItemRecord(input: {
  row: Record<string, unknown>
  index: number
  sourceDocumentId: SourceDocument['id']
  extractedAt: string
  sourceSheetName: string
  parentHeaderIndex?: number
  parentVoucher?: string
  parentVariableSymbol?: string
  parentInvoiceNumber?: string
  parentCustomerId?: string
  parentGuestName?: string
  parentStayStartAt?: string
  parentStayEndAt?: string
  parentRoomName?: string
  parentPaymentMethod?: string
}): ExtractedRecord {
  const invoiceLineDocumentType = readRowString(input.row, INVOICE_LIST_LINE_FIELD_ALIASES.invoiceLineDocumentType)
  const itemLabel = readRowString(input.row, INVOICE_LIST_LINE_FIELD_ALIASES.itemLabel)
  const itemAmount = readRowAmount(input.row, INVOICE_LIST_LINE_FIELD_ALIASES.amountGross, 'InvoiceList line amount')
  const itemNetAmount = readRowAmount(input.row, INVOICE_LIST_LINE_FIELD_ALIASES.amountNet, 'InvoiceList line net amount')
  const reference = input.parentVoucher ?? input.parentInvoiceNumber ?? input.parentVariableSymbol ?? `invoice-list-line-${input.index + 1}`

  return {
    id: `invoice-list-line-${input.index + 1}`,
    sourceDocumentId: input.sourceDocumentId,
    recordType: 'invoice-list-line',
    extractedAt: input.extractedAt,
    rawReference: reference,
    amountMinor: itemAmount?.amountMinor ?? 0,
    currency: itemAmount?.currency ?? 'CZK',
    occurredAt: input.parentStayStartAt ?? input.extractedAt.slice(0, 10),
    data: {
      platform: 'previo-invoice-list',
      rowKind: 'line-item',
      enrichmentOnly: true,
      invoiceLineDocumentType,
      parentHeaderIndex: input.parentHeaderIndex,
      voucher: input.parentVoucher,
      variableSymbol: input.parentVariableSymbol,
      invoiceNumber: input.parentInvoiceNumber,
      customerId: input.parentCustomerId,
      guestName: input.parentGuestName,
      stayStartAt: input.parentStayStartAt,
      stayEndAt: input.parentStayEndAt,
      roomName: input.parentRoomName,
      paymentMethod: input.parentPaymentMethod,
      itemLabel,
      grossAmountMinor: itemAmount?.amountMinor,
      netAmountMinor: itemNetAmount?.amountMinor,
      currency: itemAmount?.currency ?? 'CZK',
      reference,
      sourceSheet: input.sourceSheetName
    }
  }
}

function isInvoiceListHeaderCandidateRow(row: Record<string, unknown>): boolean {
  const invoiceNumber = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.invoiceNumber)
  const voucher = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.voucher)
  const guestName = readRowString(row, INVOICE_LIST_HEADER_FIELD_ALIASES.guestName)
  return Boolean(invoiceNumber || voucher || guestName)
}

function isInvoiceListLineCandidateRow(row: Record<string, unknown>): boolean {
  const invoiceNumber = readRowString(row, INVOICE_LIST_LINE_FIELD_ALIASES.invoiceNumber)
  const itemLabel = readRowString(row, INVOICE_LIST_LINE_FIELD_ALIASES.itemLabel)
  return Boolean(invoiceNumber && itemLabel)
}

function readRowString(
  row: Record<string, unknown>,
  aliasGroups: readonly string[]
): string | undefined {
  const value = readRowValueByAliases(row, aliasGroups)
  return readOptionalString(value)
}

function readRowDate(
  row: Record<string, unknown>,
  aliasGroups: readonly string[],
  label: string
): string | undefined {
  const value = readRowValueByAliases(row, aliasGroups)
  return readOptionalDate(value, label)
}

function readRowAmount(
  row: Record<string, unknown>,
  aliasGroups: readonly string[],
  label: string
): { amountMinor: number; currency: 'CZK' | 'EUR' } | undefined {
  const value = readRowValueByAliases(row, aliasGroups)
  return readOptionalAmount(value, label)
}

function readRowValueByAliases(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) {
      return row[alias]
    }
  }

  const normalizedRowEntries = Object.entries(row).map(([key, value]) => [normalizeWorkbookSignatureName(key), value] as const)

  for (const alias of aliases) {
    const normalizedAlias = normalizeWorkbookSignatureName(alias)
    const foundEntry = normalizedRowEntries.find(([normalizedKey]) => normalizedKey === normalizedAlias)
    if (foundEntry) {
      return foundEntry[1]
    }
  }

  return ''
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
