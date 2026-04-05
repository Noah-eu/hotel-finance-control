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
        sourceSystem: 'bank',
        bankParserVariant: 'raiffeisenbank',
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
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank',
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
        rawReference: 'PAYOUT-BOOK-20260310',
        data: expect.objectContaining({
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank',
          accountId: '5500123456',
          counterparty: '5500/1234',
          reference: 'PAYOUT-BOOK-20260310',
          transactionType: 'Příchozí platba'
        })
      })
    ])
  })

  it('parses the current failing real localized bank shape when counterparty account and bank code are split across separate columns', () => {
    const fixture = getRealInputFixture('raiffeisenbank-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: {
        ...fixture.sourceDocument,
        fileName: 'Pohyby_5599955956_202603191023.csv'
      },
      content: [
        '\uFEFF"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
        '19.03.2026 06:23;1540,00;CZK;1234567890;2010;PAYOUT-BOOK-20260310;Booking BV;Příchozí platba'
      ].join('\n'),
      extractedAt: '2026-03-19T20:00:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'raif-row-1',
        amountMinor: 154000,
        currency: 'CZK',
        occurredAt: '2026-03-19T06:23:00',
        rawReference: 'PAYOUT-BOOK-20260310',
        data: expect.objectContaining({
          sourceSystem: 'bank',
          bankParserVariant: 'raiffeisenbank',
          accountId: '5599955956',
          counterparty: '1234567890/2010',
          counterpartyAccount: '1234567890/2010',
          reference: 'PAYOUT-BOOK-20260310',
          transactionType: 'Příchozí platba'
        })
      })
    ])
  })

  it('parses the exact quoted localized RB export shape currently failing in browser runtime', () => {
    const fixture = getRealInputFixture('raiffeisenbank-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: {
        ...fixture.sourceDocument,
        fileName: 'Pohyby_5599955956_202603191023.csv'
      },
      content: [
        '\uFEFF"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
        '"19.03.2026 06:23";"1 540,00";"CZK";"1234567890";"2010";"PAYOUT-BOOK-20260310";"Booking BV";"Příchozí platba"'
      ].join('\n'),
      extractedAt: '2026-03-19T20:00:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'raif-row-1',
        amountMinor: 154000,
        currency: 'CZK',
        occurredAt: '2026-03-19T06:23:00',
        rawReference: 'PAYOUT-BOOK-20260310',
        data: expect.objectContaining({
          accountId: '5599955956',
          counterparty: '1234567890/2010',
          reference: 'PAYOUT-BOOK-20260310',
          transactionType: 'Příchozí platba'
        })
      })
    ])
  })

  it('treats bare integer values from human-readable amount headers as major CZK units, not already-scaled minor units', () => {
    const fixture = getRealInputFixture('raiffeisenbank-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: {
        ...fixture.sourceDocument,
        fileName: 'Pohyby_5599955956_202603191023.csv'
      },
      content: [
        '\uFEFF"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
        '"26.03.2026 11:20";"-3120";"CZK";"0000001111111111";"0100";"Platba bez dokladu";"Dodavatel bez dokladu";"Odchozí platba"'
      ].join('\n'),
      extractedAt: '2026-03-29T20:00:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'raif-row-1',
        amountMinor: -312000,
        currency: 'CZK',
        occurredAt: '2026-03-26T11:20:00',
        data: expect.objectContaining({
          counterparty: '0000001111111111/0100',
          reference: 'Platba bez dokladu',
          transactionType: 'Odchozí platba'
        })
      })
    ])
  })

  it('parses the real Raiffeisenbank GPC sample excerpt with the correct fixed-width offsets for key rows', () => {
    const fixture = getRealInputFixture('raiffeisenbank-gpc-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-20T10:00:00.000Z'
    })

    expect(records).toHaveLength(10)
    expect(records[0]).toEqual({
      ...fixture.expectedExtractedRecords[0],
      extractedAt: '2026-03-20T10:00:00.000Z'
    })
    expect(records[1]).toEqual({
      ...fixture.expectedExtractedRecords[1],
      extractedAt: '2026-03-20T10:00:00.000Z'
    })
    expect(records[2]).toEqual({
      ...fixture.expectedExtractedRecords[2],
      extractedAt: '2026-03-20T10:00:00.000Z'
    })
    expect(records[9]).toEqual({
      ...fixture.expectedExtractedRecords[3],
      extractedAt: '2026-03-20T10:00:00.000Z'
    })
    expect(records[0]).toMatchObject({
      id: 'raif-row-1',
      occurredAt: '2026-02-01',
      amountMinor: -192644,
      currency: 'CZK',
      rawReference: 'PK: 547872XXXXXX2805',
      data: {
        bankParserVariant: 'raiffeisenbank-gpc',
        bankStatementSource: 'raiffeisenbank',
        accountId: '5599955956',
        counterparty: 'DEKUJEME, ROHLIK.CZ, Prague 8, CZE',
        valueAt: '2026-01-31',
        transactionType: 'Odchozí platba'
      }
    })
  })

  it('parses real GPC card-merchant rows that encode outgoing debits with direction code 4', () => {
    const fixture = getRealInputFixture('raiffeisenbank-gpc-statement-direction-4')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-20T10:00:00.000Z'
    })

    expect(records).toHaveLength(5)
    expect(records[2]).toEqual({
      ...fixture.expectedExtractedRecords[2],
      extractedAt: '2026-03-20T10:00:00.000Z'
    })
    expect(records[2]).toMatchObject({
      amountMinor: -341900,
      occurredAt: '2026-03-03',
      currency: 'CZK',
      data: {
        counterparty: 'Alza.cz, Prague, CZE',
        counterpartyAccount: undefined,
        reference: '67100928',
        transactionType: 'Odchozí platba'
      }
    })
    expect(records[3]).toMatchObject({
      amountMinor: -369800,
      occurredAt: '2026-03-07',
      data: {
        counterparty: 'Alza.cz a.s., Prague, CZE',
        transactionType: 'Odchozí platba'
      }
    })
    expect(records[4]).toMatchObject({
      amountMinor: -31700,
      occurredAt: '2026-03-19',
      data: {
        counterparty: 'Alza.cz a.s., Prague, CZE',
        transactionType: 'Odchozí platba'
      }
    })
  })

  it('keeps a single VS-style GPC continuation as payment reference instead of misclassifying it as counterparty', () => {
    const transactionLine = buildGpcTransactionLine({
      mainAccountId: '0000005599955956',
      counterpartyPrefix: '000000',
      counterpartyAccountNumber: '0274621920',
      counterpartyBankCode: '0300',
      amountMinor: '000001262952',
      directionCode: '4',
      valueAt: '080426',
      bookedAt: '080426'
    })

    const records = parseRaiffeisenbankStatement({
      sourceDocument: {
        id: 'doc-raif-gpc-lenner-review' as never,
        sourceSystem: 'bank',
        documentType: 'bank_statement',
        fileName: 'Vypis_5599955956_CZK_2026_004.gpc',
        uploadedAt: '2026-04-03T11:00:00.000Z'
      },
      content: [
        '0740000005599955956JOKELAND s.r.o.',
        transactionLine,
        '078VS 141260183 Servis vozidla'
      ].join('\n'),
      extractedAt: '2026-04-03T11:00:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        amountMinor: -1262952,
        rawReference: 'VS 141260183 Servis vozidla',
        data: expect.objectContaining({
          bankParserVariant: 'raiffeisenbank-gpc',
          accountId: '5599955956',
          counterparty: '274621920/0300',
          reference: 'VS 141260183 Servis vozidla',
          transactionType: 'Odchozí platba'
        })
      })
    ])
  })

  it('keeps a service-text continuation as counterparty while preserving the fixed-width counterparty account for downstream review lookup', () => {
    const transactionLine = buildGpcTransactionLine({
      mainAccountId: '0000005599955956',
      counterpartyPrefix: '000000',
      counterpartyAccountNumber: '0274621920',
      counterpartyBankCode: '0300',
      amountMinor: '000001262952',
      directionCode: '1',
      valueAt: '080426',
      bookedAt: '080426'
    })

    const records = parseRaiffeisenbankStatement({
      sourceDocument: {
        id: 'doc-raif-gpc-lenner-service-only' as never,
        sourceSystem: 'bank',
        documentType: 'bank_statement',
        fileName: 'Vypis_5599955956_CZK_2026_004.gpc',
        uploadedAt: '2026-04-03T11:10:00.000Z'
      },
      content: [
        '0740000005599955956JOKELAND s.r.o.',
        transactionLine,
        '078Servis vozidla'
      ].join('\n'),
      extractedAt: '2026-04-03T11:10:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        amountMinor: -1262952,
        rawReference: '',
        data: expect.objectContaining({
          bankParserVariant: 'raiffeisenbank-gpc',
          accountId: '5599955956',
          counterparty: 'Servis vozidla',
          counterpartyAccount: '274621920/0300',
          reference: '',
          transactionType: 'Odchozí platba'
        })
      })
    ])
  })

  it('keeps the direction-code-4 Raiffeisenbank GPC excerpt within sane parser invariants', () => {
    const fixture = getRealInputFixture('raiffeisenbank-gpc-statement-direction-4')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-20T10:00:00.000Z'
    })

    expect(records).toHaveLength(
      fixture.rawInput.content.split('\n').filter((line) => line.startsWith('075')).length
    )
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length)
    expect(records.every((record) => /^\d{4}-\d{2}-\d{2}$/.test(record.occurredAt ?? ''))).toBe(true)
    expect(records.every((record) => !record.occurredAt?.startsWith('0000-00-'))).toBe(true)
    expect(records.every((record) => record.currency === 'CZK')).toBe(true)
    expect(records.every((record) => Number.isInteger(record.amountMinor))).toBe(true)
    expect(records.some((record) => (record.amountMinor ?? 0) > 0)).toBe(true)
    expect(records.filter((record) => (record.amountMinor ?? 0) < 0)).toHaveLength(4)
  })

  it('keeps the real Raiffeisenbank GPC sample excerpt within sane parser invariants', () => {
    const fixture = getRealInputFixture('raiffeisenbank-gpc-statement')

    const records = parseRaiffeisenbankStatement({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-20T10:00:00.000Z'
    })

    expect(records).toHaveLength(
      fixture.rawInput.content.split('\n').filter((line) => line.startsWith('075')).length
    )
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length)
    expect(records.every((record) => /^\d{4}-\d{2}-\d{2}$/.test(record.occurredAt ?? ''))).toBe(true)
    expect(records.every((record) => !record.occurredAt?.startsWith('0000-00-'))).toBe(true)
    expect(records.every((record) => record.currency === 'CZK')).toBe(true)
    expect(records.every((record) => !/^\d+$/.test(record.currency ?? ''))).toBe(true)
    expect(records.every((record) => Number.isInteger(record.amountMinor))).toBe(true)
    expect(records.some((record) => (record.amountMinor ?? 0) < 0)).toBe(true)
    expect(records.some((record) => (record.amountMinor ?? 0) > 0)).toBe(true)
  })
})

function buildGpcTransactionLine(input: {
  mainAccountId: string
  counterpartyPrefix: string
  counterpartyAccountNumber: string
  counterpartyBankCode: string
  amountMinor: string
  directionCode: string
  valueAt: string
  bookedAt: string
}): string {
  const chars = Array.from({ length: 128 }, () => ' ')
  writeGpcField(chars, 0, 3, '075')
  writeGpcField(chars, 3, 19, input.mainAccountId)
  writeGpcField(chars, 19, 25, input.counterpartyPrefix)
  writeGpcField(chars, 25, 35, input.counterpartyAccountNumber)
  writeGpcField(chars, 35, 39, input.counterpartyBankCode)
  writeGpcField(chars, 47, 48, '5')
  writeGpcField(chars, 48, 60, input.amountMinor)
  writeGpcField(chars, 60, 61, input.directionCode)
  writeGpcField(chars, 91, 97, input.valueAt)
  writeGpcField(chars, 122, 128, input.bookedAt)

  return chars.join('')
}

function writeGpcField(buffer: string[], start: number, end: number, value: string): void {
  const normalized = value.padEnd(end - start, ' ').slice(0, end - start)
  buffer.splice(start, end - start, ...normalized)
}
