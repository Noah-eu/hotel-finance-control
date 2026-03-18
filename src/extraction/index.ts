export function placeholder() {
  return {
    name: 'extraction',
    parser: 'deterministic'
  }
}

export type {
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
export type { ParseComgateExportInput } from './parsers/comgate.parser'
export { ComgateParser, parseComgateExport } from './parsers/comgate.parser'
export type { ParseInvoiceDocumentInput } from './parsers/invoice-document.parser'
export { InvoiceDocumentParser, parseInvoiceDocument } from './parsers/invoice-document.parser'
