import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  getAccountIdFromFileName,
  isExplicitMinorAmountHeader,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParseFioStatementInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

interface ParsedFioGpcHeader {
  accountId: string
  currency: string
}

interface ParsedFioGpcTransaction {
  bookedAt: string
  valueAt?: string
  amountMinor: number
  currency: string
  counterparty: string
  counterpartyAccount?: string
  reference: string
  transactionType: string
}

interface ParsedFioRow extends Record<string, string> {
  amountMinorUsesMajorUnits: 'true' | 'false'
}

const REQUIRED_HEADERS = [
  'bookedAt',
  'amountMinor',
  'currency',
  'accountId',
  'counterparty'
]

export class FioParser {
  parse(input: ParseFioStatementInput): ExtractedRecord[] {
    if (looksLikeFioGpcStatement(input.content, input.sourceDocument.fileName)) {
      return this.parseGpc(input)
    }

    const rows = parseDelimitedRows(input.content).map((row) => {
      const fallbackAccountId = getAccountIdFromFileName(input.sourceDocument.fileName)
      const amountField = firstPresentWithHeader(row, PRIORITIZED_HEADER_ALIASES.amountMinor)

      return {
        bookedAt: firstPresent(row, PRIORITIZED_HEADER_ALIASES.bookedAt),
        amountMinor: amountField.value,
        amountMinorUsesMajorUnits: amountField.matchedHeader && isExplicitMinorAmountHeader(amountField.matchedHeader) ? 'false' : 'true',
        currency: firstPresent(row, PRIORITIZED_HEADER_ALIASES.currency),
        accountId: firstPresent(row, PRIORITIZED_HEADER_ALIASES.accountId) || fallbackAccountId || '',
        counterparty: firstPresent(row, PRIORITIZED_HEADER_ALIASES.counterparty),
        counterpartyAccount: resolveDelimitedCounterpartyAccount(row),
        reference: firstPresent(row, PRIORITIZED_HEADER_ALIASES.reference),
        transactionType: firstPresent(row, PRIORITIZED_HEADER_ALIASES.transactionType)
      }
    }) as ParsedFioRow[]

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS).concat(
      REQUIRED_HEADERS.filter((header) => rows.every((row) => row[header].trim().length === 0))
    )
    if (missing.length > 0) {
      throw new Error(`Fio statement is missing required columns: ${Array.from(new Set(missing)).join(', ')}`)
    }

    return rows.map((row, index) => {
      const recordId = `fio-row-${index + 1}`
      const bookedAt = parseIsoDate(row.bookedAt, 'Fio bookedAt')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Fio amountMinor', {
        integerIsMajorUnit: row.amountMinorUsesMajorUnits === 'true'
      })
      const currency = row.currency.trim().toUpperCase()
      const accountId = row.accountId.trim()
      const counterparty = row.counterparty.trim()
      const reference = row.reference?.trim() || ''
      const transactionType = row.transactionType?.trim() ?? 'bank-transaction'

      return {
        id: recordId,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'bank-transaction',
        extractedAt: input.extractedAt,
        rawReference: reference,
        amountMinor,
        currency,
        occurredAt: bookedAt,
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'fio',
          bookedAt,
          amountMinor,
          currency,
          accountId,
          counterparty,
          counterpartyAccount: row.counterpartyAccount?.trim() || undefined,
          reference,
          transactionType
        }
      }
    })
  }

  private parseGpc(input: ParseFioStatementInput): ExtractedRecord[] {
    const lines = input.content
      .replace(/^\uFEFF/, '')
      .split(/\r\n|\n|\r/)
      .map((line) => line.replace(/\s+$/, ''))
      .filter((line) => line.trim().length > 0)

    const headerLine = lines.find((line) => line.startsWith('074'))
    if (!headerLine) {
      throw new Error('Fio GPC statement is missing header/account context')
    }

    const header = parseFioGpcHeader(headerLine, input.sourceDocument)
    const transactions = lines
      .filter((line) => line.startsWith('075'))
      .map((line) => parseFioGpcTransaction(line, header))

    return transactions.map((transaction, index) => ({
      id: `fio-row-${index + 1}`,
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'bank-transaction',
      extractedAt: input.extractedAt,
      rawReference: transaction.reference,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      occurredAt: transaction.bookedAt,
      data: {
        sourceSystem: 'bank',
        bankParserVariant: 'fio-gpc',
        bankStatementSource: 'fio',
        bookedAt: transaction.bookedAt,
        valueAt: transaction.valueAt,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        accountId: header.accountId,
        counterparty: transaction.counterparty,
        counterpartyAccount: transaction.counterpartyAccount,
        reference: transaction.reference,
        transactionType: transaction.transactionType
      }
    }))
  }
}

const defaultFioParser = new FioParser()

export function parseFioStatement(input: ParseFioStatementInput): ExtractedRecord[] {
  return defaultFioParser.parse(input)
}

export function looksLikeFioGpcStatement(content: string, fileName = ''): boolean {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    return false
  }

  const normalizedFileName = fileName.trim().toLowerCase()
  const headerLine = lines.find((line) => line.startsWith('074'))
  const transactionLines = lines.filter((line) => line.startsWith('075'))
  const hasOnlySupportedRecords = lines.every((line) => line.startsWith('074') || line.startsWith('075'))
  const headerLooksLikeFio = headerLine?.trim().toUpperCase().endsWith('FIO') === true

  const fileNameLooksLikeFio = normalizedFileName.length === 0
    || (normalizedFileName.endsWith('.gpc') && normalizedFileName.startsWith('vypis_z_uctu-'))

  return fileNameLooksLikeFio
    && Boolean(headerLine)
    && transactionLines.length > 0
    && hasOnlySupportedRecords
    && headerLooksLikeFio
}

const PRIORITIZED_HEADER_ALIASES = {
  bookedAt: [
    'datumZaúčtování',
    'datumZauctovani',
    'bookedAt',
    'booked_at',
    'paidAt',
    'date',
    'datum'
  ],
  amountMinor: [
    'objem',
    'zaúčtovanáČástka',
    'zauctovanaCastka',
    'amountMinor',
    'amount_minor',
    'amount',
    'částka',
    'castka'
  ],
  currency: ['měnaÚčtu', 'menaUctu', 'currency', 'měna', 'mena'],
  accountId: ['čísloÚčtu', 'cisloUctu', 'accountId', 'account_id', 'account', 'účet', 'ucet'],
  counterparty: [
    'názevProtiúčtu',
    'nazevProtiuctu',
    'counterpartyName',
    'counterparty',
    'partner',
    'protistrana',
    'protiúčet',
    'protiucet',
    'čísloProtiúčtu',
    'cisloProtiuctu'
  ],
  reference: [
    'zprávaProPříjemce',
    'zpravaProPrijemce',
    'poznámka',
    'zpráva',
    'zprava',
    'reference',
    'paymentReference',
    'variableSymbol'
  ],
  transactionType: ['typPohybu', 'typTransakce', 'transactionType', 'transaction_type', 'type', 'typ']
} satisfies Record<string, string[]>

function firstPresentWithHeader(row: Record<string, string>, aliases: string[]): { value: string, matchedHeader?: string } {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), key, value] as const)

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias)
    const entry = normalizedEntries.find(([key]) => key === normalizedAlias)
    const value = entry?.[2]

    if (typeof value === 'string' && value.trim().length > 0) {
      return {
        value,
        matchedHeader: entry?.[1]
      }
    }
  }

  return { value: '' }
}

function firstPresent(row: Record<string, string>, aliases: string[]): string {
  return firstPresentWithHeader(row, aliases).value
}

function resolveDelimitedCounterpartyAccount(row: Record<string, string>): string | undefined {
  const directCounterpartyAccount = firstPresent(row, [
    'čísloProtiúčtu',
    'cisloProtiuctu',
    'protiúčet',
    'protiucet',
    'counterpartyAccount'
  ]).trim()

  if (looksLikeDelimitedCounterpartyAccount(directCounterpartyAccount)) {
    return directCounterpartyAccount
  }

  const counterparty = firstPresent(row, PRIORITIZED_HEADER_ALIASES.counterparty).trim()
  if (looksLikeDelimitedCounterpartyAccount(counterparty)) {
    return counterparty
  }

  return undefined
}

function looksLikeDelimitedCounterpartyAccount(value: string): boolean {
  if (!value || /[A-Za-z\u00C0-\u024F]/.test(value)) {
    return false
  }

  return value.replace(/\D+/g, '').length >= 6
}

function normalizeHeaderKey(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/^"|"$/g, '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ _-]+/g, '')
}

function parseFioGpcHeader(line: string, sourceDocument: SourceDocument): ParsedFioGpcHeader {
  const fallbackAccountId = getAccountIdFromFileName(sourceDocument.fileName)
  const accountId = normalizeGpcAccountId(line.slice(3, 19)) || fallbackAccountId || ''

  if (!accountId) {
    throw new Error('Fio GPC statement is missing accountId context')
  }

  return {
    accountId,
    currency: 'CZK'
  }
}

function parseFioGpcTransaction(line: string, header: ParsedFioGpcHeader): ParsedFioGpcTransaction {
  const counterpartyPrefix = line.slice(19, 25)
  const counterpartyAccountNumber = line.slice(25, 35)
  const counterpartyBankCode = line.slice(35, 39)
  const reference = line.slice(39, 47).trim()
  const amountDigits = line.slice(48, 60).trim()
  const direction = parseFioGpcDirectionCode(line.slice(60, 61))
  const valueAtRaw = line.slice(91, 97).trim()
  const bookedAtRaw = line.slice(122, 128).trim()
  const primaryText = line.slice(97, 117).trim()
  const counterpartyAccount = formatGpcCounterpartyAccount(counterpartyPrefix, counterpartyAccountNumber, counterpartyBankCode)

  if (!bookedAtRaw) {
    throw new Error('Fio GPC transaction is missing bookedAt')
  }

  const amountMinor = parseUnsignedGpcAmountMinor(amountDigits, 'Fio GPC amountMinor')

  return {
    bookedAt: parseCompactGpcDateDdMmYy(bookedAtRaw, 'Fio GPC bookedAt'),
    valueAt: valueAtRaw ? parseCompactGpcDateDdMmYy(valueAtRaw, 'Fio GPC valueAt') : undefined,
    amountMinor: direction === 'out' ? -amountMinor : amountMinor,
    currency: header.currency,
    counterparty: primaryText || counterpartyAccount || '',
    counterpartyAccount,
    reference,
    transactionType: direction === 'out' ? 'Odchozí platba' : 'Příchozí platba'
  }
}

function parseCompactGpcDateDdMmYy(value: string, fieldName: string): string {
  const normalized = value.trim()

  if (!/^\d{6}$/.test(normalized)) {
    throw new Error(`${fieldName} has unsupported date format: ${value}`)
  }

  return `20${normalized.slice(4, 6)}-${normalized.slice(2, 4)}-${normalized.slice(0, 2)}`
}

function parseUnsignedGpcAmountMinor(digits: string, fieldName: string): number {
  if (!/^\d+$/.test(digits)) {
    throw new Error(`${fieldName} has unsupported amount format: ${digits}`)
  }

  return Number.parseInt(digits, 10)
}

function parseFioGpcDirectionCode(value: string): 'in' | 'out' {
  const normalized = value.trim()

  if (normalized === '1') {
    return 'out'
  }

  if (normalized === '2') {
    return 'in'
  }

  throw new Error(`Fio GPC direction has unsupported direction code: ${value}`)
}

function normalizeGpcAccountId(value: string): string | undefined {
  const digits = value.trim().replace(/^0+/, '')
  return digits.length > 0 ? digits : undefined
}

function formatGpcCounterpartyAccount(prefix: string, accountNumber: string, bankCode: string): string | undefined {
  const normalizedAccountNumber = normalizeGpcAccountId(accountNumber)
  const normalizedBankCode = bankCode.trim()

  if (!normalizedAccountNumber || !normalizedBankCode) {
    return undefined
  }

  const normalizedPrefix = normalizeGpcAccountId(prefix)

  if (normalizedPrefix) {
    return `${normalizedPrefix}-${normalizedAccountNumber}/${normalizedBankCode}`
  }

  return `${normalizedAccountNumber}/${normalizedBankCode}`
}
