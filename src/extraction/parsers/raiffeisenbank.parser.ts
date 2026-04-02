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
  primaryText?: string
  bankReference?: string
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
      const { counterparty, reference } = resolveGpcCounterpartyAndReference({
        primaryText: transaction.primaryText,
        continuations: transaction.continuations,
        counterpartyAccount: transaction.counterpartyAccount,
        bankReference: transaction.bankReference
      })

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
          counterparty,
          counterpartyAccount: transaction.counterpartyAccount,
          reference,
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
  const accountId = normalizeGpcAccountId(line.slice(3, 19)) || fallbackAccountId || ''
  const currency = extractGpcCurrencyFromFileName(sourceDocument.fileName) || 'CZK'

  if (!accountId) {
    throw new Error('Raiffeisenbank GPC statement is missing accountId context')
  }

  return {
    accountId,
    currency
  }
}

function parseGpcTransaction(line: string, header: ParsedRaiffeisenbankGpcHeader): ParsedRaiffeisenbankGpcTransaction {
  const counterpartyPrefix = line.slice(19, 25)
  const counterpartyAccountNumber = line.slice(25, 35)
  const counterpartyBankCode = line.slice(35, 39)
  const bankReference = line.slice(39, 47).trim() || undefined
  const amountDigits = line.slice(48, 60).trim()
  const directionCode = line.slice(60, 61)
  const valueAtRaw = line.slice(91, 97).trim()
  const bookedAtRaw = line.slice(122, 128).trim()
  const primaryText = line.slice(97, 117).trim() || undefined
  const counterpartyAccount = formatGpcCounterpartyAccount(counterpartyPrefix, counterpartyAccountNumber, counterpartyBankCode)
  const direction = parseGpcDirectionCode(directionCode, 'Raiffeisenbank GPC direction')
  const amountMinor = parseUnsignedGpcAmountMinor(amountDigits, 'Raiffeisenbank GPC amountMinor')
  const bookedAt = bookedAtRaw ? parseCompactGpcDateDdMmYy(bookedAtRaw, 'Raiffeisenbank GPC bookedAt') : undefined
  const valueAt = valueAtRaw ? parseCompactGpcDateDdMmYy(valueAtRaw, 'Raiffeisenbank GPC valueAt') : undefined

  if (!bookedAt) {
    throw new Error('Raiffeisenbank GPC transaction is missing bookedAt')
  }

  const { counterparty, reference } = resolveGpcCounterpartyAndReference({
    primaryText,
    continuations: [],
    counterpartyAccount,
    bankReference
  })

  return {
    bookedAt,
    valueAt,
    amountMinor: direction === 'out' ? -amountMinor : amountMinor,
    currency: header.currency,
    counterparty,
    counterpartyAccount,
    primaryText,
    bankReference: reference || bankReference,
    continuations: [],
    transactionType: direction === 'out' ? 'Odchozí platba' : 'Příchozí platba'
  }
}

function parseCompactGpcDateDdMmYy(value: string, fieldName: string): string {
  const normalized = value.trim()

  if (!/^\d{6}$/.test(normalized)) {
    throw new Error(`${fieldName} has unsupported date format: ${value}`)
  }

  const day = normalized.slice(0, 2)
  const month = normalized.slice(2, 4)
  const year = normalized.slice(4, 6)

  return `20${year}-${month}-${day}`
}

function parseUnsignedGpcAmountMinor(digits: string, fieldName: string): number {
  if (!/^\d+$/.test(digits)) {
    throw new Error(`${fieldName} has unsupported amount format: ${digits}`)
  }

  return Number.parseInt(digits, 10)
}

function buildGpcReference(transaction: ParsedRaiffeisenbankGpcTransaction): string {
  return resolveGpcCounterpartyAndReference({
    primaryText: transaction.primaryText,
    continuations: transaction.continuations,
    counterpartyAccount: transaction.counterpartyAccount,
    bankReference: transaction.bankReference
  }).reference
}

function parseGpcDirectionCode(value: string, fieldName: string): 'in' | 'out' {
  const normalized = value.trim()

  if (normalized === '1') {
    return 'out'
  }

  if (normalized === '2') {
    return 'in'
  }

  throw new Error(`${fieldName} has unsupported direction code: ${value}`)
}

function extractGpcCurrencyFromFileName(fileName: string): string | undefined {
  const match = fileName.match(/_([A-Z]{3})_\d{4}_\d+\.gpc$/i)
  return match?.[1]?.toUpperCase()
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

function resolveGpcCounterpartyAndReference(input: {
  primaryText?: string
  continuations: string[]
  counterpartyAccount?: string
  bankReference?: string
}): { counterparty: string, reference: string } {
  const primaryText = normalizeGpcText(input.primaryText)
  const continuations = input.continuations
    .map((value) => normalizeGpcText(value))
    .filter((value): value is string => Boolean(value))
  const referenceParts: string[] = []
  let counterparty: string | undefined

  if (primaryText && looksLikeGpcCounterparty(primaryText)) {
    counterparty = primaryText
  } else if (primaryText) {
    referenceParts.push(primaryText)
  }

  if (!counterparty && continuations.length > 0 && !looksLikeStructuredGpcReference(continuations[0]!)) {
    counterparty = continuations[0]
  }

  if (counterparty && continuations.length > 0 && continuations[0] === counterparty) {
    referenceParts.push(...continuations.slice(1))
  } else {
    referenceParts.push(...continuations)
  }

  if (referenceParts.length === 0 && input.bankReference) {
    referenceParts.push(input.bankReference)
  }

  return {
    counterparty: counterparty || input.counterpartyAccount || 'Unknown counterparty',
    reference: referenceParts.join(' | ')
  }
}

function looksLikeGpcCounterparty(value: string): boolean {
  if (value.startsWith('PK:')) {
    return false
  }

  return /[A-Za-z]/.test(value)
}

function looksLikeStructuredGpcReference(value: string): boolean {
  return /^[A-Z0-9:/ .,-]+$/.test(value) && /[/:-]/.test(value)
}

function normalizeGpcText(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length > 0 ? normalized : undefined
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
