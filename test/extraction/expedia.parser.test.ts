import { describe, expect, it } from 'vitest'
import { parseExpediaPayoutExport } from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parseExpediaPayoutExport', () => {
  it('extracts deterministic payout-line records from the representative Expedia fixture', () => {
    const fixture = getRealInputFixture('expedia-payout-export')

    const records = parseExpediaPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-19T10:35:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'expedia-payout-1',
      recordType: 'payout-line',
      rawReference: 'EXP-TERM-1001',
      data: {
        platform: 'expedia',
        reservationId: 'EXP-RES-1001',
        propertyId: 'HOTEL-CZ-001'
      }
    })
  })

  it('matches the representative expected extracted output for the Expedia fixture row', () => {
    const fixture = getRealInputFixture('expedia-payout-export')

    const records = parseExpediaPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])
  })

  it('throws a clear error when required Expedia payout columns are missing', () => {
    const fixture = getRealInputFixture('expedia-payout-export')

    expect(() =>
      parseExpediaPayoutExport({
        sourceDocument: fixture.sourceDocument,
        content: 'payoutDate,amountMinor,currency\n2026-03-11,65000,CZK',
        extractedAt: '2026-03-19T10:35:00.000Z'
      })
    ).toThrow('Expedia payout export is missing required columns')
  })
})