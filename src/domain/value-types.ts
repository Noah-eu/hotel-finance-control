export type Brand<T, B extends string> = T & { readonly __brand: B }

export type RecordId = Brand<string, 'RecordId'>
export type DocumentId = Brand<string, 'DocumentId'>
export type TransactionId = Brand<string, 'TransactionId'>
export type MatchGroupId = Brand<string, 'MatchGroupId'>
export type ExceptionCaseId = Brand<string, 'ExceptionCaseId'>

export type ISODateString = string

export type CurrencyCode = string

export interface Money {
  amountMinor: number
  currency: CurrencyCode
}

export type SourceSystem =
  | 'booking'
  | 'airbnb'
  | 'comgate'
  | 'previo'
  | 'expedia'
  | 'bank'
  | 'invoice'
  | 'receipt'
  | 'terminal'
  | 'manual'
  | 'unknown'

export type ReservationSettlementChannel =
  | 'booking'
  | 'airbnb'
  | 'comgate'
  | 'expedia_direct_bank'

export type DocumentSettlementDirection =
  | 'payable_outgoing'
  | 'refund_incoming'

export type SettlementRoutingTarget =
  | 'rb_bank_inflow'
  | 'fio_bank_inflow'
  | 'document_refund_inflow'
  | 'document_expense_outflow'

export type PayoutBatchPlatform = 'booking' | 'airbnb' | 'comgate'

export type ExpenseSettlementKind =
  | 'supplier_invoice'
  | 'supplier_refund'
  | 'merchant_receipt'

export type BankFeeCategory =
  | 'fio_terminal_fee'
  | 'rb_account_fee'

export type DocumentKind =
  | 'bank_statement'
  | 'ota_report'
  | 'payment_gateway_report'
  | 'reservation_export'
  | 'invoice'
  | 'receipt'
  | 'other'

export type ExtractionMethod = 'deterministic' | 'ocr' | 'ai_fallback' | 'manual'

export type TransactionDirection = 'in' | 'out' | 'internal'

export type TransactionCategory =
  | 'reservation_payment'
  | 'payout'
  | 'expense'
  | 'salary'
  | 'transfer'
  | 'fee'
  | 'tax'
  | 'parking'
  | 'other'

export type MatchStatus = 'proposed' | 'confirmed' | 'rejected'

export type ExceptionStatus = 'open' | 'in_review' | 'resolved' | 'dismissed'

export type ExceptionSeverity = 'low' | 'medium' | 'high' | 'critical'
