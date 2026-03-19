import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  getAccountIdFromFileName,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParseRaiffeisenbankStatementInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
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
  reference: ['reference', 'variableSymbol', 'paymentReference', 'zprávaProPříjemce', 'zpravaProPrijemce', 'zprava', 'poznámka'],
  transactionType: ['transactionType', 'transaction_type', 'type', 'typTransakce', 'typ']
} satisfies Record<string, string[]>

export class RaiffeisenbankParser {
  parse(input: ParseRaiffeisenbankStatementInput): ExtractedRecord[] {
    const rows = parseDelimitedRows(input.content).map((row) => {
      const fallbackAccountId = getAccountIdFromFileName(input.sourceDocument.fileName)

      return {
        bookedAt: firstPresent(row, HEADER_ALIASES.bookedAt),
        amountMinor: firstPresent(row, HEADER_ALIASES.amountMinor),
        currency: firstPresent(row, HEADER_ALIASES.currency),
        accountId: firstPresent(row, HEADER_ALIASES.accountId) || fallbackAccountId || '',
        counterparty: firstPresent(row, HEADER_ALIASES.counterparty),
        reference: firstPresent(row, HEADER_ALIASES.reference),
        transactionType: firstPresent(row, HEADER_ALIASES.transactionType)
      }
    }) as Array<Record<string, string>>

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
      const amountMinor = parseAmountMinor(row.amountMinor, 'Raiffeisenbank amountMinor')
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
}

function firstPresent(row: Record<string, string>, aliases: string[]): string {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), value] as const)

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias)
    const value = normalizedEntries.find(([key]) => key === normalizedAlias)?.[1]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return ''
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
