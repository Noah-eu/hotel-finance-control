import { describe, expect, it } from 'vitest'
import { parseComgateExport } from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parseComgateExport', () => {
  it('extracts deterministic payout-line records for website reservations and parking flows', () => {
    const fixture = getRealInputFixture('comgate-export')

    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T22:00:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      id: 'comgate-row-1',
      recordType: 'payout-line',
      rawReference: 'CG-RES-991',
      data: {
        platform: 'comgate',
        paymentPurpose: 'website-reservation',
        reservationId: 'WEB-RES-991'
      }
    })
    expect(records[1]).toMatchObject({
      id: 'comgate-row-2',
      rawReference: 'CG-PARK-551',
      data: {
        paymentPurpose: 'parking',
        reservationId: 'PARK-551'
      }
    })
  })

  it('accepts richer Comgate client portal headers with explicit label and order linkage', () => {
    const fixture = getRealInputFixture('comgate-export')

    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum zaplacení;Uhrazená částka;Měna;Variabilní symbol;Štítek;Číslo objednávky',
        '15.03.2026;380,00;CZK;CG-RES-991;website-reservation;WEB-RES-991'
      ].join('\n'),
      extractedAt: '2026-03-20T13:10:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      rawReference: 'CG-RES-991',
      occurredAt: '2026-03-15',
      amountMinor: 38000,
      data: {
        paymentPurpose: 'website-reservation',
        reservationId: 'WEB-RES-991'
      }
    })
  })

  it('matches the representative expected extracted outputs for the fixture rows', () => {
    const fixture = getRealInputFixture('comgate-export')

    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records).toEqual(fixture.expectedExtractedRecords)
  })

  it('throws a clear error when required Comgate columns are missing', () => {
    const fixture = getRealInputFixture('comgate-export')

    expect(() =>
      parseComgateExport({
        sourceDocument: fixture.sourceDocument,
        content: 'paidAt,amountMinor,currency\n2026-03-15,38000,CZK',
        extractedAt: '2026-03-18T22:00:00.000Z'
      })
    ).toThrow('Comgate export is missing required columns')
  })

  it('accepts aliased Comgate headers and decimal amounts without misclassifying fields', () => {
    const fixture = getRealInputFixture('comgate-export')

    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'datumPlatby,amount,měna,transactionReference,účelPlatby,orderId',
        '2026-03-15 09:05:00,380.00,CZK,CG-RES-991,website-reservation,WEB-RES-991'
      ].join('\n'),
      extractedAt: '2026-03-18T22:00:00.000Z'
    })

    expect(records[0]).toMatchObject({
      id: 'comgate-row-1',
      amountMinor: 38000,
      occurredAt: '2026-03-15',
      rawReference: 'CG-RES-991',
      data: {
        paymentPurpose: 'website-reservation',
        reservationId: 'WEB-RES-991'
      }
    })
  })
})