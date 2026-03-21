import { describe, expect, it } from 'vitest'
import { parseAirbnbPayoutExport } from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parseAirbnbPayoutExport', () => {
  it('extracts deterministic payout-line records from the representative Airbnb fixture', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-19T10:30:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'airbnb-payout-1',
      recordType: 'payout-line',
      rawReference: 'AIRBNB-20260312',
      data: {
        platform: 'airbnb',
        reservationId: 'HMA4TR9',
        listingId: 'LISTING-CZ-11'
      }
    })
  })

  it('matches the representative expected extracted output for the Airbnb fixture row', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])
  })

  it('throws a clear error when required Airbnb payout columns are missing', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    expect(() =>
      parseAirbnbPayoutExport({
        sourceDocument: fixture.sourceDocument,
        content: 'payoutDate,amountMinor,currency\n2026-03-12,98000,CZK',
        extractedAt: '2026-03-19T10:30:00.000Z'
      })
    ).toThrow('Airbnb payout export is missing required columns')
  })

  it('accepts richer Airbnb transfer export headers while preserving reservation linkage', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum převodu;Částka převodu;Měna;Transfer ID;Confirmation code;Listing name',
        '12.03.2026;980,00;CZK;AIRBNB-20260312;HMA4TR9;LISTING-CZ-11'
      ].join('\n'),
      extractedAt: '2026-03-20T13:00:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      rawReference: 'AIRBNB-20260312',
      occurredAt: '2026-03-12',
      amountMinor: 98000,
      data: {
        reservationId: 'HMA4TR9',
        listingId: 'LISTING-CZ-11',
        propertyId: 'LISTING-CZ-11'
      }
    })
  })
})