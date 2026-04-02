import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  getAccountIdFromFileName,
  isExplicitMinorAmountHeader,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParseRaiffeisenbankStatementInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

interface ParsedRaiffeisenbankGpcHeader {
  accountId: string
  currency: string
}

interface ParsedRaiffeisenbankGpcTransaction {
  bookedAt: string
  valueAt?: string
  amountMinor: number
  currency: string
  counterparty: string
  counterpartyAccount?: string
  variableSymbol?: string
  message?: string
  continuations: string[]
  transactionType: string
}

interface ParsedRaiffeisenbankRow extends Record<string, string> {
  amountMinorUsesMajorUnits: 'true' | 'false'
}

const REQUIRED_HEADERS = [
  'bookedAt',
  'amountMinor',
  'currency',
  'accountId',
  'counterparty',
  'reference',
  'transactionType'
]

const HEADER_ALIASES = {
  bookedAt: ['bookedAt', 'booked_at', 'bookingDate', 'date', 'datum'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'castka', 'částka', 'objem'],
  currency: ['currency', 'mena', 'měna'],
  accountId: ['accountId', 'account_id', 'account', 'ucet', 'účet'],
  counterparty: ['counterparty', 'counterpartyName', 'partner', 'protistrana', 'protiúčet', 'protiucet'],
  counterpartyBankCode: ['counterpartyBankCode', 'bankCode', 'kódBanky', 'kodBanky'],
  reference: ['reference', 'variableSymbol', 'paymentReference', 'zprávaProPříjemce', 'zpravaProPrijemce', 'zprava', 'poznámka'],
  transactionType: ['transactionType', 'transaction_type', 'type', 'typTransakce', 'typ']
} satisfies Record<string, string[]>

export class RaiffeisenbankParser {
  parse(input: ParseRaiffeisenbankStatementInput): ExtractedRecord[] {
    if (looksLikeRaiffeisenbankGpcStatement(input.content, input.sourceDocument.fileName)) {
      return this.parseGpc(input)
    }

    return this.parseDelimited(input)
  }

  private parseDelimited(input: ParseRaiffeisenbankStatementInput): ExtractedRecord[] {
    const rows = parseDelimitedRows(input.content).map((row) => {
      const fallbackAccountId = getAccountIdFromFileName(input.sourceDocument.fileName)
      const amountField = firstPresentWithHeader(row, HEADER_ALIASES.amountMinor)

      return {
        bookedAt: firstPresent(row, HEADER_ALIASES.bookedAt),
        amountMinor: amountField.value,
        amountMinorUsesMajorUnits: amountField.matchedHeader && isExplicitMinorAmountHeader(amountField.matchedHeader) ? 'false' : 'true',
        currency: firstPresent(row, HEADER_ALIASES.currency),
        accountId: firstPresent(row, HEADER_ALIASES.accountId) || fallbackAccountId || '',
        counterparty: resolveCounterparty(row),
        reference: firstPresent(row, HEADER_ALIASES.reference),
        transactionType: firstPresent(row, HEADER_ALIASES.transactionType)
      }
    }) as ParsedRaiffeisenbankRow[]

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS).concat(
      REQUIRED_HEADERS.filter((header) => rows.every((row) => row[header].trim().length === 0))
    )
    if (missing.length > 0) {
      throw new Error(
        `Raiffeisenbank statement is missing required columns: ${Array.from(new Set(missing)).join(', ')}`
      )
    }

    return rows.map((row, index) => {
      const recordId = `raif-row-${index + 1}`
      const bookedAt = parseIsoDate(row.bookedAt, 'Raiffeisenbank bookedAt')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Raiffeisenbank amountMinor', {
        integerIsMajorUnit: row.amountMinorUsesMajorUnits === 'true'
      })
      const currency = row.currency.trim().toUpperCase()
      const accountId = row.accountId.trim()
      const counterparty = row.counterparty.trim()
      const reference = row.reference.trim()
      const transactionType = row.transactionType.trim()

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
          bankParserVariant: 'raiffeisenbank',
          bookedAt,
          amountMinor,
          currency,
          accountId,
          counterparty,
          reference,
          transactionType
        }
      }
    })
  }

  private parseGpc(input: ParseRaiffeisenbankStatementInput): ExtractedRecord[] {
    const lines = input.content
      .replace(/^\uFEFF/, '')
      .split(/\r\n|\n|\r/)
      .map((line) => line.replace(/\s+$/, ''))
      .filter((line) => line.trim().length > 0)

    const headerLine = lines.find((line) => line.startsWith('074'))
    if (!headerLine) {
      throw new Error('Raiffeisenbank GPC statement is missing header/account context')
    }

    const header = parseGpcHeader(headerLine, input.sourceDocument)
    const transactions: ParsedRaiffeisenbankGpcTransaction[] = []
    let current: ParsedRaiffeisenbankGpcTransaction | undefined

    for (const line of lines) {
      const recordType = line.slice(0, 3)

      if (recordType === '075') {
        if (current) {
          transactions.push(current)
        }

        current = parseGpcTransaction(line, header)
        continue
      }

      if ((recordType === '078' || recordType === '079') && current) {
        const continuation = line.slice(3).trim()
        if (continuation) {
          current.continuations.push(continuation)
        }
      }
    }

    if (current) {
      transactions.push(current)
    }

    return transactions.map((transaction, index) => {
      const reference = buildGpcReference(transaction)

      return {
        id: `raif-row-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'bank-transaction',
        extractedAt: input.extractedAt,
        rawReference: reference,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        occurredAt: transaction.bookedAt,
        data: {
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank-gpc',
          bankStatementSource: 'raiffeisenbank',
          bookedAt: transaction.bookedAt,
          valueAt: transaction.valueAt,
          amountMinor: transaction.amountMinor,
          currency: transaction.currency,
          accountId: header.accountId,
          counterparty: transaction.counterparty,
          counterpartyAccount: transaction.counterpartyAccount,
          reference,
          variableSymbol: transaction.variableSymbol,
          transactionType: transaction.transactionType
        }
      }
    })
  }
}

export function looksLikeRaiffeisenbankGpcStatement(content: string, fileName = ''): boolean {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return false
  }

  const normalizedFileName = fileName.trim().toLowerCase()
  const hasGpcExtension = normalizedFileName.endsWith('.gpc')
  const hasHeader = lines.some((line) => line.startsWith('074'))
  const hasTransaction = lines.some((line) => line.startsWith('075'))
  const hasContinuation = lines.some((line) => line.startsWith('078') || line.startsWith('079'))

  return hasHeader && hasTransaction && (hasGpcExtension || hasContinuation)
}

function parseGpcHeader(line: string, sourceDocument: SourceDocument): ParsedRaiffeisenbankGpcHeader {
  const fallbackAccountId = getAccountIdFromFileName(sourceDocument.fileName)
  const accountId = line.slice(3, 19).trim() || fallbackAccountId || ''
  const currency = (line.slice(19, 22).trim() || 'CZK').toUpperCase()

  if (!accountId) {
    throw new Error('Raiffeisenbank GPC statement is missing accountId context')
  }

  return {
    accountId,
    currency
  }
}

function parseGpcTransaction(line: string, header: ParsedRaiffeisenbankGpcHeader): ParsedRaiffeisenbankGpcTransaction {
  const bookedAt = parseCompactGpcDate(line.slice(3, 11), 'Raiffeisenbank GPC bookedAt')
  const valueAtRaw = line.slice(11, 19).trim()
  const sign = line.slice(19, 20)
  const amountDigits = line.slice(20, 32).trim()
  const currency = (line.slice(32, 35).trim() || header.currency).toUpperCase()
  const counterpartyAccount = line.slice(35, 51).trim() || undefined
  const counterparty = line.slice(51, 81).trim() || counterpartyAccount || 'Unknown counterparty'
  const variableSymbol = line.slice(81, 91).trim() || undefined
  const message = line.slice(91).trim() || undefined

  return {
    bookedAt,
    valueAt: valueAtRaw ? parseCompactGpcDate(valueAtRaw, 'Raiffeisenbank GPC valueAt') : undefined,
    amountMinor: parseGpcAmountMinor(sign, amountDigits, 'Raiffeisenbank GPC amountMinor'),
    currency,
    counterparty,
    counterpartyAccount,
    variableSymbol,
    message,
    continuations: [],
    transactionType: sign === '-' ? 'Odchozí platba' : 'Příchozí platba'
  }
}

function parseCompactGpcDate(value: string, fieldName: string): string {
  const normalized = value.trim()

  if (!/^\d{8}$/.test(normalized)) {
    throw new Error(`${fieldName} has unsupported date format: ${value}`)
  }

  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`
}

function parseGpcAmountMinor(sign: string, digits: string, fieldName: string): number {
  if (!/^\d+$/.test(digits)) {
    throw new Error(`${fieldName} has unsupported amount format: ${digits}`)
  }

  const absoluteAmountMinor = Number.parseInt(digits, 10)
  return sign === '-' ? -absoluteAmountMinor : absoluteAmountMinor
}

function buildGpcReference(transaction: ParsedRaiffeisenbankGpcTransaction): string {
  const parts = [
    transaction.message,
    transaction.variableSymbol ? `VS ${transaction.variableSymbol}` : undefined,
    ...transaction.continuations
  ].filter((value): value is string => Boolean(value && value.trim().length > 0))

  return parts.join(' | ')
}

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

function resolveCounterparty(row: Record<string, string>): string {
  const account = firstPresent(row, HEADER_ALIASES.counterparty)
  const bankCode = firstPresent(row, HEADER_ALIASES.counterpartyBankCode)

  if (account && bankCode && !account.includes('/')) {
    return `${account}/${bankCode}`
  }

  return account
}

function normalizeHeaderKey(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, '')
}

const defaultRaiffeisenbankParser = new RaiffeisenbankParser()

export function parseRaiffeisenbankStatement(
  input: ParseRaiffeisenbankStatementInput
): ExtractedRecord[] {
  return defaultRaiffeisenbankParser.parse(input)
}
