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
          reference,
          transactionType
        }
      }
    })
  }
}

const defaultFioParser = new FioParser()

export function parseFioStatement(input: ParseFioStatementInput): ExtractedRecord[] {
  return defaultFioParser.parse(input)
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
