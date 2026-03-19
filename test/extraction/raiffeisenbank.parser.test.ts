import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { parseRaiffeisenbankStatement } from '../../src/extraction'

describe('parseRaiffeisenbankStatement', () => {
  it('extracts deterministic bank transaction records from the representative Raiffeisenbank fixture', () => {
    const fixture = getRealInputFixture('raiffeisenbank-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T21:00:00.000Z'
    })

    expect(records).toHaveLength(6)
    expect(records[0]).toMatchObject({
      id: 'raif-row-1',
      recordType: 'bank-transaction',
      rawReference: 'PAYOUT-BOOK-20260310',
      data: {
        transactionType: 'booking-payout',
        accountId: 'raiffeisen-main'
      }
    })
    expect(records[3]).toMatchObject({
      id: 'raif-row-4',
      amountMinor: -55000,
      data: {
        transactionType: 'payroll'
      }
    })
    expect(records[5]).toMatchObject({
      id: 'raif-row-6',
      data: {
        transactionType: 'suspicious-private'
      }
    })
  })

  it('matches the representative expected extracted outputs for key rows', () => {
    const fixture = getRealInputFixture('raiffeisenbank-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])
    expect(records[3]).toEqual(fixture.expectedExtractedRecords[1])
    expect(records[5]).toEqual(fixture.expectedExtractedRecords[2])
  })

  it('throws a clear error when required statement columns are missing', () => {
    const fixture = getRealInputFixture('raiffeisenbank-statement')

    expect(() =>
      parseRaiffeisenbankStatement({
        sourceDocument: fixture.sourceDocument,
        content: 'bookedAt,amountMinor,currency\n2026-03-10,125000,CZK',
        extractedAt: '2026-03-18T21:00:00.000Z'
      })
    ).toThrow('Raiffeisenbank statement is missing required columns')
  })

  it('accepts semicolon-delimited statements with BOM, quoted cells, and localized aliases', () => {
    const fixture = getRealInputFixture('raiffeisenbank-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: fixture.sourceDocument,
      content: [
        '\uFEFFdatum;částka;měna;účet;protistrana;poznámka;typ',
        '10.03.2026;"1250,00";czk;raiffeisen-main;"Booking BV";PAYOUT-BOOK-20260310;booking-payout'
      ].join('\n'),
      extractedAt: '2026-03-18T21:00:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'raif-row-1',
        amountMinor: 125000,
        currency: 'CZK',
        occurredAt: '2026-03-10',
        rawReference: 'PAYOUT-BOOK-20260310',
        data: expect.objectContaining({
          counterparty: 'Booking BV',
          transactionType: 'booking-payout'
        })
      })
    ])
  })

  it('parses the current real localized Raiffeisenbank CSV shape with filename-derived accountId fallback', () => {
    const fixture = getRealInputFixture('raiffeisenbank-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: {
        ...fixture.sourceDocument,
        fileName: 'Pohyby_5500123456_20260319.csv'
      },
      content: [
        '\uFEFF"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
        '19.03.2026 06:23;1250,00;CZK;5500/1234;5500;PAYOUT-BOOK-20260310;Booking BV;Příchozí platba'
      ].join('\n'),
      extractedAt: '2026-03-19T20:00:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'raif-row-1',
        amountMinor: 125000,
        currency: 'CZK',
        occurredAt: '2026-03-19T06:23:00',
        rawReference: 'Booking BV',
        data: expect.objectContaining({
          accountId: '5500123456',
          counterparty: '5500/1234',
          reference: 'Booking BV',
          transactionType: 'Příchozí platba'
        })
      })
    ])
  })
})
