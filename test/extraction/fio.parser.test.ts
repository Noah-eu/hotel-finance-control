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
})
