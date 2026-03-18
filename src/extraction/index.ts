export function placeholder() {
  return {
    name: 'extraction',
    parser: 'deterministic'
  }
}

export type { ParseRaiffeisenbankStatementInput } from './parsers/raiffeisenbank.parser'
export { RaiffeisenbankParser, parseRaiffeisenbankStatement } from './parsers/raiffeisenbank.parser'
export type { ParseFioStatementInput } from './parsers/fio.parser'
export { FioParser, parseFioStatement } from './parsers/fio.parser'
