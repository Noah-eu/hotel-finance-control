import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { parseFioStatement } from '../../src/extraction'

describe('parseFioStatement', () => {
  it('extracts deterministic bank transaction records from the representative Fio fixture', () => {
    const fixture = getRealInputFixture('fio-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T21:30:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      id: 'fio-row-1',
      recordType: 'bank-transaction',
      rawReference: 'EXP-TERM-1001',
      data: {
        transactionType: 'expedia-terminal',
        accountId: 'fio-expedia'
      }
    })
    expect(records[1]).toMatchObject({
      id: 'fio-row-2',
      rawReference: 'EXP-TERM-1002'
    })
  })

  it('matches the representative expected extracted output for the lead fixture row', () => {
    const fixture = getRealInputFixture('fio-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])
  })

  it('throws a clear error when required statement columns are missing', () => {
    const fixture = getRealInputFixture('fio-statement')

    expect(() =>
      parseFioStatement({
        sourceDocument: fixture.sourceDocument,
        content: 'bookedAt,amountMinor,currency\n2026-03-11,65000,CZK',
        extractedAt: '2026-03-18T21:30:00.000Z'
      })
    ).toThrow('Fio statement is missing required columns')
  })

  it('accepts aliased headers, timestamps, and decimal amount formatting', () => {
    const fixture = getRealInputFixture('fio-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: [
        'date,amount,měna,účet,partner,paymentReference,type',
        '2026-03-11 08:15:00,650.00,CZK,fio-expedia,EXPEDIA TERMINAL,EXP-TERM-1001,expedia-terminal'
      ].join('\n'),
      extractedAt: '2026-03-18T21:30:00.000Z'
    })

    expect(records[0]).toMatchObject({
      id: 'fio-row-1',
      amountMinor: 65000,
      occurredAt: '2026-03-11',
      currency: 'CZK',
      rawReference: 'EXP-TERM-1001'
    })
  })

  it('maps representative localized Fio Czech headers into canonical parser fields', () => {
    const fixture = getRealInputFixture('fio-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum provedení;Číslo účtu;Datum zaúčtování;Typ pohybu;Zaúčtovaná částka;Měna účtu;Název protiúčtu;Zpráva pro příjemce',
        '19.03.2026;5599955956/2010;19.03.2026;Bezhotovostní příjem;1540,00;CZK;Comgate a.s.;Platba rezervace WEB-1001'
      ].join('\n'),
      extractedAt: '2026-03-19T15:00:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'fio-row-1',
        amountMinor: 154000,
        currency: 'CZK',
        occurredAt: '2026-03-19',
        rawReference: 'Platba rezervace WEB-1001',
        data: expect.objectContaining({
          bookedAt: '2026-03-19',
          amountMinor: 154000,
          currency: 'CZK',
          accountId: '5599955956/2010',
          counterparty: 'Comgate a.s.',
          reference: 'Platba rezervace WEB-1001',
          transactionType: 'Bezhotovostní příjem'
        })
      })
    ])
  })

  it('keeps failure explicit when a localized Fio export still lacks a deterministic counterparty field', () => {
    const fixture = getRealInputFixture('fio-statement')

    expect(() =>
      parseFioStatement({
        sourceDocument: fixture.sourceDocument,
        content: [
          'Datum zaúčtování;Zaúčtovaná částka;Měna účtu;Číslo účtu',
          '19.03.2026;1540,00;CZK;5599955956/2010'
        ].join('\n'),
        extractedAt: '2026-03-19T15:00:00.000Z'
      })
    ).toThrow('Fio statement is missing required columns: counterparty')
  })
})
