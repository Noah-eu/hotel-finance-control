import { describe, expect, it } from 'vitest'
import { parseAirbnbPayoutExport } from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parseAirbnbPayoutExport', () => {
  it('extracts deterministic reservation and transfer payout-line records from the representative Airbnb fixture', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-19T10:30:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      id: 'airbnb-payout-1',
      recordType: 'payout-line',
      rawReference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
      data: {
        platform: 'airbnb',
        rowKind: 'reservation',
        reservationId: 'AIRBNB-RES:hma4tr9:2026-03-10:2026-03-12:106000',
        guestName: 'Jan Novak',
        confirmationCode: 'HMA4TR9'
      }
    })
    expect(records[1]).toMatchObject({
      id: 'airbnb-payout-2',
      recordType: 'payout-line',
      rawReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
      occurredAt: '2026-03-15',
      data: {
        platform: 'airbnb',
        rowKind: 'transfer',
        transferDescriptor: 'Převod Jokeland s.r.o.'
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

    expect(records).toEqual(fixture.expectedExtractedRecords)
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

  it('supports the grounded real Airbnb mixed export shape with separate reservation and transfer rows', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-20T13:00:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      rawReference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
      occurredAt: '2026-03-12',
      amountMinor: 106000,
      data: {
        rowKind: 'reservation',
        stayStartAt: '2026-03-10',
        stayEndAt: '2026-03-12',
        guestName: 'Jan Novak',
        confirmationCode: 'HMA4TR9',
        paidOutAmountMinor: 98000,
        serviceFeeMinor: -8000,
        grossEarningsMinor: 106000
      }
    })
    expect(records[1]).toMatchObject({
      rawReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
      occurredAt: '2026-03-15',
      amountMinor: 98000,
      data: {
        rowKind: 'transfer',
        payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
        transferDescriptor: 'Převod Jokeland s.r.o.',
        availableUntilDate: '2026-03-15'
      }
    })
  })

  it('supports slash-based US-style real Airbnb dates like 03/20/2026 in reservation and transfer rows', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '03/20/2026;03/20/2026;Rezervace;03/18/2026;03/20/2026;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;-80,00;1 060,00',
        '03/20/2026;03/21/2026;Payout;03/18/2026;03/20/2026;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;0,00;980,00'
      ].join('\n'),
      extractedAt: '2026-03-21T13:00:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      occurredAt: '2026-03-20',
      data: {
        rowKind: 'reservation',
        stayStartAt: '2026-03-18',
        stayEndAt: '2026-03-20',
        availableUntilDate: '2026-03-20'
      }
    })
    expect(records[1]).toMatchObject({
      occurredAt: '2026-03-21',
      data: {
        rowKind: 'transfer',
        stayStartAt: '2026-03-18',
        stayEndAt: '2026-03-20',
        availableUntilDate: '2026-03-21'
      }
    })
  })

  it('uses Částka for reservation rows and Vyplaceno for payout rows when the payout row leaves Částka empty', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-21T14:00:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      amountMinor: 106000,
      rawReference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
      data: {
        rowKind: 'reservation',
        confirmationCode: 'HMA4TR9',
        details: 'Rezervace HMA4TR9',
        availableUntilDate: '2026-03-12'
      }
    })
    expect(records[1]).toMatchObject({
      amountMinor: 98000,
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        details: 'Převod Jokeland s.r.o., IBAN 5956 (CZK)',
        availableUntilDate: '2026-03-15',
        paidOutAmountMinor: 98000
      }
    })
  })

  it('fails fast for unsupported real-style Airbnb files when transfer details are not deterministic', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    expect(() =>
      parseAirbnbPayoutExport({
        sourceDocument: fixture.sourceDocument,
        content: [
          'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
          '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod na účet hostitele bez IBAN reference;REF-HMA4TR9;;CZK;;980,00;0,00;980,00'
        ].join('\n'),
        extractedAt: '2026-03-20T13:20:00.000Z'
      })
    ).toThrow('Airbnb transfer row has unsupported details format')
  })
})