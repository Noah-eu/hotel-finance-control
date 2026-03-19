import { describe, expect, it } from 'vitest'
import { parseDelimitedRows, normalizeHeaderCell } from '../../src/extraction/parsers/csv-utils'

describe('csv-utils header normalization', () => {
    it('strips BOM, whitespace, and surrounding quotes from header cells before alias matching', () => {
        expect(normalizeHeaderCell('\uFEFF  "Datum"  ')).toBe('Datum')
        expect(normalizeHeaderCell(' "Objem"')).toBe('Objem')
        expect(normalizeHeaderCell('"Měna" ')).toBe('Měna')
        expect(normalizeHeaderCell('"Protiúčet"')).toBe('Protiúčet')
        expect(normalizeHeaderCell('"Typ"')).toBe('Typ')
    })

    it('maps quoted localized bank headers through shared canonical header matching', () => {
        const rows = parseDelimitedRows(
            [
                '\uFEFF"Datum";"Objem";"Měna";"Protiúčet";"Typ"',
                '19.03.2026 06:23;1540,00;CZK;1234567890;Příchozí platba'
            ].join('\n'),
            {
                canonicalHeaders: {
                    bookedAt: ['datum'],
                    amountMinor: ['objem'],
                    currency: ['měna', 'mena'],
                    counterparty: ['protiúčet', 'protiucet'],
                    transactionType: ['typ']
                }
            }
        )

        expect(rows).toEqual([
            {
                bookedAt: '19.03.2026 06:23',
                amountMinor: '1540,00',
                currency: 'CZK',
                counterparty: '1234567890',
                transactionType: 'Příchozí platba'
            }
        ])
    })
})