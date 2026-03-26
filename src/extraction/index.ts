export function placeholder() {
  return {
    name: 'extraction',
    parser: 'deterministic'
  }
}

export type {
  DeterministicDocumentFieldExtractionDebug,
  DeterministicDocumentExtractionSummary,
  DeterministicDocumentParser,
  DeterministicDocumentParserInput,
  DocumentIngestionCapabilities
} from './contracts'
export { documentIngestionCapabilities } from './contracts'
export type { ParseRaiffeisenbankStatementInput } from './parsers/raiffeisenbank.parser'
export { RaiffeisenbankParser, parseRaiffeisenbankStatement } from './parsers/raiffeisenbank.parser'
export type { ParseFioStatementInput } from './parsers/fio.parser'
export { FioParser, parseFioStatement } from './parsers/fio.parser'
export type { ParseBookingPayoutExportInput } from './parsers/booking.parser'
export { BookingPayoutParser, parseBookingPayoutExport } from './parsers/booking.parser'
export type {
  BookingPayoutStatementFieldCheck,
  BookingPayoutStatementFields,
  BookingPayoutStatementSignals,
  ParseBookingPayoutStatementPdfInput
} from './parsers/booking-payout-statement.parser'
export {
  BookingPayoutStatementPdfParser,
  detectBookingPayoutStatementKeywordHits,
  detectBookingPayoutStatementSignals,
  extractBookingPayoutStatementFields,
  inspectBookingPayoutStatementExtractionSummary,
  inspectBookingPayoutStatementFieldCheck,
  parseBookingPayoutStatementPdf
} from './parsers/booking-payout-statement.parser'
export type { ParseAirbnbPayoutExportInput } from './parsers/airbnb.parser'
export { AirbnbPayoutParser, parseAirbnbPayoutExport } from './parsers/airbnb.parser'
export type { ParseExpediaPayoutExportInput } from './parsers/expedia.parser'
export { ExpediaPayoutParser, parseExpediaPayoutExport } from './parsers/expedia.parser'
export type { ParsePrevioReservationExportInput } from './parsers/previo.parser'
export { PrevioReservationParser, parsePrevioReservationExport } from './parsers/previo.parser'
export type { ParseComgateExportInput } from './parsers/comgate.parser'
export { ComgateParser, parseComgateExport } from './parsers/comgate.parser'
export type { ParseInvoiceDocumentInput } from './parsers/invoice-document.parser'
export {
  detectInvoiceDocumentKeywordHits,
  InvoiceDocumentParser,
  inspectInvoiceDocumentExtractionSummary,
  parseInvoiceDocument
} from './parsers/invoice-document.parser'
export type { ParseReceiptDocumentInput } from './parsers/receipt-document.parser'
export {
  ReceiptDocumentParser,
  inspectReceiptDocumentExtractionSummary,
  parseReceiptDocument
} from './parsers/receipt-document.parser'
