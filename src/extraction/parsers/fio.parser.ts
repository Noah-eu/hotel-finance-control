import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  getAccountIdFromFileName,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParseFioStatementInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

const REQUIRED_HEADERS = [
  'bookedAt',
  'amountMinor',
  'currency',
  'accountId',
  'counterparty'
]

const HEADER_ALIASES = {
  bookedAt: ['bookedAt', 'booked_at', 'date', 'datum', 'paidAt', 'datumZaúčtování', 'datumZauctovani'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'castka', 'částka', 'zaúčtovanáČástka', 'zauctovanaCastka', 'objem'],
  currency: ['currency', 'mena', 'měna', 'měnaÚčtu', 'menaUctu'],
  accountId: ['accountId', 'account_id', 'account', 'ucet', 'účet', 'čísloÚčtu', 'cisloUctu'],
  counterparty: [
    'counterparty',
    'counterpartyName',
    'partner',
    'protistrana',
    'názevProtiúčtu',
    'nazevProtiuctu',
    'čísloProtiúčtu',
    'cisloProtiuctu',
    'protiúčet',
    'protiucet'
  ],
  reference: [
    'reference',
    'paymentReference',
    'variableSymbol',
    'zprava',
    'poznámka',
    'zprávaProPříjemce',
    'zpravaProPrijemce'
  ],
  transactionType: ['transactionType', 'transaction_type', 'type', 'typTransakce', 'typ', 'typPohybu']
} satisfies Record<string, string[]>

export class FioParser {
  parse(input: ParseFioStatementInput): ExtractedRecord[] {
    const rows = parseDelimitedRows(input.content, { canonicalHeaders: HEADER_ALIASES }).map((row) => {
      const fallbackAccountId = getAccountIdFromFileName(input.sourceDocument.fileName)

      return {
        ...row,
        accountId: row.accountId || fallbackAccountId || ''
      }
    }) as Array<Record<string, string>>

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS)
    if (missing.length > 0) {
      throw new Error(`Fio statement is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const recordId = `fio-row-${index + 1}`
      const bookedAt = parseIsoDate(row.bookedAt, 'Fio bookedAt')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Fio amountMinor')
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
