import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { parseFioStatement } from '../../src/extraction'

describe('parseFioStatement', () => {
  it('extracts deterministic bank transaction records from the exact Fio GPC fixture', () => {
    const fixture = getRealInputFixture('fio-gpc-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-04-03T17:30:00.000Z'
    })

    expect(records).toHaveLength(7)
    expect(records[0]).toMatchObject({
      id: 'fio-row-1',
      sourceDocumentId: fixture.sourceDocument.id,
      recordType: 'bank-transaction',
      rawReference: '50905871',
      amountMinor: -3000000,
      currency: 'CZK',
      occurredAt: '2026-03-01',
      data: expect.objectContaining({
        sourceSystem: 'bank',
        bankParserVariant: 'fio-gpc',
        bankStatementSource: 'fio',
        bookedAt: '2026-03-01',
        valueAt: '2026-03-01',
        amountMinor: -3000000,
        currency: 'CZK',
        accountId: '8888997777',
        counterparty: 'Výběr z bankomatu: M',
        reference: '50905871',
        transactionType: 'Odchozí platba'
      })
    })
    expect(records[1]).toMatchObject({
      id: 'fio-row-2',
      sourceDocumentId: fixture.sourceDocument.id,
      recordType: 'bank-transaction',
      rawReference: '51629242',
      amountMinor: 4879694,
      currency: 'CZK',
      occurredAt: '2026-03-03',
      data: expect.objectContaining({
        sourceSystem: 'bank',
        bankParserVariant: 'fio-gpc',
        bankStatementSource: 'fio',
        bookedAt: '2026-03-03',
        valueAt: '2026-03-03',
        amountMinor: 4879694,
        currency: 'CZK',
        accountId: '8888997777',
        counterparty: 'Fio banka, a.s.',
        counterpartyAccount: '999001788/0027',
        reference: '51629242',
        transactionType: 'Příchozí platba'
      })
    })
    expect(records[5]).toMatchObject({
      id: 'fio-row-6',
      sourceDocumentId: fixture.sourceDocument.id,
      recordType: 'bank-transaction',
      rawReference: '53207532',
      amountMinor: -500000,
      currency: 'CZK',
      occurredAt: '2026-03-13',
      data: expect.objectContaining({
        sourceSystem: 'bank',
        bankParserVariant: 'fio-gpc',
        bankStatementSource: 'fio',
        bookedAt: '2026-03-13',
        valueAt: '2026-03-13',
        amountMinor: -500000,
        currency: 'CZK',
        accountId: '8888997777',
        counterparty: 'hotel RB',
        counterpartyAccount: '5599955956/0027',
        reference: '53207532',
        transactionType: 'Odchozí platba'
      })
    })
    expect(records.every((record) => record.data.bankParserVariant === 'fio-gpc')).toBe(true)
  })

  it('keeps the exact POS-terminal Fio GPC row on the correct ddMMyy slices instead of the preview-broken rmi002 substring', () => {
    const fixture = getRealInputFixture('fio-gpc-statement')
    const lines = fixture.rawInput.content.split('\n')
    const headerLine = lines[0]
    const failingTransactionLine = lines[4]

    expect(failingTransactionLine).toBeDefined()
    expect(failingTransactionLine?.slice(91, 97)).toBe('030326')
    expect(failingTransactionLine?.slice(122, 128)).toBe('030326')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: [headerLine, failingTransactionLine].join('\n'),
      extractedAt: '2026-04-03T18:25:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'fio-row-1',
        occurredAt: '2026-03-03',
        data: expect.objectContaining({
          bankParserVariant: 'fio-gpc',
          bookedAt: '2026-03-03',
          valueAt: '2026-03-03',
          counterparty: 'Zaúčtování POS termi'
        })
      })
    ])
  })

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
        sourceSystem: 'bank',
        bankParserVariant: 'fio',
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
          sourceSystem: 'bank',
          bankParserVariant: 'fio',
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

  it('accepts localized Fio Czech bookedAt datetime values and normalizes them consistently', () => {
    const fixture = getRealInputFixture('fio-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum provedení;Číslo účtu;Datum zaúčtování;Typ pohybu;Zaúčtovaná částka;Měna účtu;Název protiúčtu;Zpráva pro příjemce',
        '19.03.2026 05:55;5599955956/2010;19.03.2026 06:23;Bezhotovostní příjem;1540,00;CZK;Comgate a.s.;Platba rezervace WEB-1001',
        '19.03.2026 07:10;5599955956/2010;19.03.2026 6:23;Bezhotovostní příjem;840,00;CZK;Comgate a.s.;Platba rezervace WEB-1002'
      ].join('\n'),
      extractedAt: '2026-03-19T17:30:00.000Z'
    })

    expect(records.map((record) => record.occurredAt)).toEqual([
      '2026-03-19T06:23:00',
      '2026-03-19T06:23:00'
    ])
  })

  it('maps the Pohyby na účtu Fio export variant into canonical parser fields', () => {
    const fixture = getRealInputFixture('fio-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: [
        '"Datum";"Objem";"Měna";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
        '19.03.2026 06:23;1540,00;CZK;8888997777/2010;000000-1234567890/0100;Comgate a.s.;Platba rezervace WEB-2001'
      ].join('\n'),
      extractedAt: '2026-03-19T18:10:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'fio-row-1',
        amountMinor: 154000,
        currency: 'CZK',
        occurredAt: '2026-03-19T06:23:00',
        rawReference: 'Platba rezervace WEB-2001',
        data: expect.objectContaining({
          accountId: '8888997777/2010',
          counterparty: 'Comgate a.s.',
          reference: 'Platba rezervace WEB-2001'
        })
      })
    ])
  })

  it('accepts CR-only row separators in the localized Fio export variant instead of silently returning zero rows', () => {
    const fixture = getRealInputFixture('fio-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: [
        '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
        '19.03.2026 06:23;19.03.2026 06:23;8888997777/2010;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
      ].join('\r'),
      extractedAt: '2026-03-19T18:10:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toEqual(
      expect.objectContaining({
        id: 'fio-row-1',
        amountMinor: 154000,
        occurredAt: '2026-03-19T06:23:00',
        data: expect.objectContaining({
          counterparty: 'Comgate a.s.',
          reference: 'Platba rezervace WEB-2001'
        })
      })
    )
  })

  it('prefers the transaction-volume amount and booked-at columns when a localized Fio export contains duplicate amount-like and date-like headers', () => {
    const fixture = getRealInputFixture('fio-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: [
        '"Datum provedení";"Datum zaúčtování";"Objem";"Zaúčtovaná částka";"Měna účtu";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zpráva pro příjemce"',
        '19.03.2026 05:55;19.03.2026 06:23;3961,05;999999,99;CZK;5599955956/2010;000000-1234567890/0100;Incoming bank transfer;Settlement credit'
      ].join('\n'),
      extractedAt: '2026-03-19T18:20:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'fio-row-1',
        amountMinor: 396105,
        occurredAt: '2026-03-19T06:23:00',
        data: expect.objectContaining({
          amountMinor: 396105,
          bookedAt: '2026-03-19T06:23:00',
          reference: 'Settlement credit'
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

  it('keeps failure explicit for unsupported localized Fio bookedAt formats', () => {
    const fixture = getRealInputFixture('fio-statement')

    expect(() =>
      parseFioStatement({
        sourceDocument: fixture.sourceDocument,
        content: [
          'Datum provedení;Číslo účtu;Datum zaúčtování;Typ pohybu;Zaúčtovaná částka;Měna účtu;Název protiúčtu',
          '2026/03/19 05:55;5599955956/2010;2026/03/19 06:23;Bezhotovostní příjem;1540,00;CZK;Comgate a.s.'
        ].join('\n'),
        extractedAt: '2026-03-19T17:30:00.000Z'
      })
    ).toThrow('Fio bookedAt has unsupported date format: 2026/03/19 06:23')
  })

  it('keeps the exact Fio GPC file on the Fio parser path instead of treating it as a delimited export', () => {
    const fixture = getRealInputFixture('fio-gpc-statement')

    const records = parseFioStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-04-03T17:35:00.000Z'
    })

    expect(records.map((record) => record.id)).toEqual([
      'fio-row-1',
      'fio-row-2',
      'fio-row-3',
      'fio-row-4',
      'fio-row-5',
      'fio-row-6',
      'fio-row-7'
    ])
    expect(records.map((record) => record.occurredAt)).toEqual([
      '2026-03-01',
      '2026-03-03',
      '2026-03-03',
      '2026-03-03',
      '2026-03-10',
      '2026-03-13',
      '2026-03-14'
    ])
  })
})
