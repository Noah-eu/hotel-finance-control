import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  findMissingHeaders,
  parseAmountMinor,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParseComgateExportInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

const REQUIRED_HEADERS = [
  'paidAt',
  'amountMinor',
  'currency',
  'reference',
  'paymentPurpose',
  'reservationId'
]

const HEADER_ALIASES = {
  paidAt: ['paidAt', 'paid_at', 'paymentDate', 'datumPlatby', 'datum', 'datum zaplacení', 'datum úhrady'],
  amountMinor: ['amountMinor', 'amount_minor', 'amount', 'castka', 'částka', 'uhrazená částka', 'zaplacená částka'],
  currency: ['currency', 'mena', 'měna'],
  reference: ['reference', 'paymentReference', 'transactionReference', 'variabilniSymbol', 'variabilní symbol', 'id transakce', 'transaction id'],
  paymentPurpose: ['paymentPurpose', 'payment_purpose', 'purpose', 'ucelPlatby', 'účelPlatby', 'štítek', 'typ platby', 'payment label'],
  reservationId: ['reservationId', 'reservation_id', 'reservation', 'orderId', 'číslo objednávky', 'order id', 'merchant id']
} satisfies Record<string, string[]>

export class ComgateParser {
  parse(input: ParseComgateExportInput): ExtractedRecord[] {
    const rows = parseDelimitedRows(input.content, { canonicalHeaders: HEADER_ALIASES })

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS)
    if (missing.length > 0) {
      throw new Error(`Comgate export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const recordId = `comgate-row-${index + 1}`
      const paidAt = parseIsoDate(row.paidAt, 'Comgate paidAt')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Comgate amountMinor')
      const currency = row.currency.trim().toUpperCase()
      const reference = row.reference.trim()
      const paymentPurpose = row.paymentPurpose.trim()
      const reservationId = row.reservationId.trim()

      return {
        id: recordId,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'payout-line',
        extractedAt: input.extractedAt,
        rawReference: reference,
        amountMinor,
        currency,
        occurredAt: paidAt,
        data: {
          platform: 'comgate',
          bookedAt: paidAt,
          amountMinor,
          currency,
          accountId: 'expected-payouts',
          reference,
          reservationId,
          paymentPurpose
        }
      }
    })
  }
}

const defaultComgateParser = new ComgateParser()

export function parseComgateExport(input: ParseComgateExportInput): ExtractedRecord[] {
  return defaultComgateParser.parse(input)
}