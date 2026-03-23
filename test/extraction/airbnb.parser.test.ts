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

    expect(records).toHaveLength(4)
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
      rawReference: 'G-OC3WJE3SIXRO5',
      occurredAt: '2026-03-15',
      data: {
        platform: 'airbnb',
        rowKind: 'transfer',
        transferDescriptor: 'Převod Jokeland s.r.o.',
        transferBatchDescriptor: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
      }
    })
    expect(records[2]).toMatchObject({
      id: 'airbnb-payout-3',
      rawReference: 'G-DXVK4YVI7MJVL',
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        payoutReference: 'G-DXVK4YVI7MJVL'
      }
    })
    expect(records[3]).toMatchObject({
      id: 'airbnb-payout-4',
      rawReference: 'G-ZD5RVTGOHW3GE',
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        payoutReference: 'G-ZD5RVTGOHW3GE'
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

    expect(records).toHaveLength(4)
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
      rawReference: 'G-OC3WJE3SIXRO5',
      occurredAt: '2026-03-15',
      amountMinor: 396105,
      data: {
        rowKind: 'transfer',
        payoutReference: 'G-OC3WJE3SIXRO5',
        transferDescriptor: 'Převod Jokeland s.r.o.',
        transferBatchDescriptor: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)',
        availableUntilDate: '2026-03-15'
      }
    })
    expect(records[2]).toMatchObject({
      rawReference: 'G-DXVK4YVI7MJVL',
      occurredAt: '2026-03-15',
      amountMinor: 445697,
      data: {
        rowKind: 'transfer',
        payoutReference: 'G-DXVK4YVI7MJVL'
      }
    })
    expect(records[3]).toMatchObject({
      rawReference: 'G-ZD5RVTGOHW3GE',
      occurredAt: '2026-03-15',
      amountMinor: 705994,
      data: {
        rowKind: 'transfer',
        payoutReference: 'G-ZD5RVTGOHW3GE'
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

    expect(records).toHaveLength(4)
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
      amountMinor: 396105,
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        details: 'Převod Jokeland s.r.o., IBAN 5956 (CZK)',
        availableUntilDate: '2026-03-15',
        paidOutAmountMinor: 396105,
        payoutReference: 'G-OC3WJE3SIXRO5'
      }
    })
    expect(records[2]).toMatchObject({
      amountMinor: 445697,
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        paidOutAmountMinor: 445697,
        payoutReference: 'G-DXVK4YVI7MJVL'
      }
    })
    expect(records[3]).toMatchObject({
      amountMinor: 705994,
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        paidOutAmountMinor: 705994,
        payoutReference: 'G-ZD5RVTGOHW3GE'
      }
    })
  })

  it('keeps reservation rows valid when Vyplaceno is empty because reservation money still comes from Částka', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;;;'
      ].join('\n'),
      extractedAt: '2026-03-21T17:10:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 106000,
      rawReference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
      data: {
        rowKind: 'reservation',
        paidOutAmountMinor: undefined,
        confirmationCode: 'HMA4TR9'
      }
    })
  })

  it('keeps reservation rows valid when availableUntilDate is empty because occurredAt still comes from Datum', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;;'
      ].join('\n'),
      extractedAt: '2026-03-21T18:05:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      occurredAt: '2026-03-12',
      amountMinor: 106000,
      rawReference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
      data: {
        rowKind: 'reservation',
        availableUntilDate: undefined,
        confirmationCode: 'HMA4TR9'
      }
    })
  })

  it('skips rows that look like transfer-class rows but do not carry a real payout amount', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;;;',
        '2026-03-12;2026-03-15;Payout;;;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;;;'
      ].join('\n'),
      extractedAt: '2026-03-21T17:15:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      data: {
        rowKind: 'reservation'
      }
    })
  })

  it('skips transfer-class rows with empty availableUntilDate when they do not carry a real payout amount', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;;;',
        '2026-03-12;;Payout;;;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;;;'
      ].join('\n'),
      extractedAt: '2026-03-21T18:10:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      data: {
        rowKind: 'reservation',
        availableUntilDate: undefined
      }
    })
  })

  it('fails fast when a kept transfer-money row is missing availableUntilDate', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    expect(() =>
      parseAirbnbPayoutExport({
        sourceDocument: fixture.sourceDocument,
        content: [
          'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
          '2026-03-12;;Payout;;;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;;'
        ].join('\n'),
        extractedAt: '2026-03-21T18:15:00.000Z'
      })
    ).toThrow('Airbnb real export transfer row is missing required availableUntilDate')
  })

  it('keeps reservation rows valid when service fee is empty but all required real-Airbnb fields are present', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;;1 060,00'
      ].join('\n'),
      extractedAt: '2026-03-21T16:00:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 106000,
      rawReference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
      data: {
        rowKind: 'reservation',
        confirmationCode: 'HMA4TR9',
        grossEarningsMinor: 106000,
        serviceFeeMinor: undefined
      }
    })
  })

  it('keeps payout rows valid when service fee is empty in the real Airbnb export shape', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;;980,00'
      ].join('\n'),
      extractedAt: '2026-03-21T16:05:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 98000,
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        paidOutAmountMinor: 98000,
        serviceFeeMinor: undefined,
        payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
      }
    })
  })

  it('keeps reservation rows valid when gross earnings is empty but all other required real-Airbnb fields are present', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;2026-03-12;Rezervace;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Rezervace HMA4TR9;REF-HMA4TR9;HMA4TR9;CZK;1 060,00;980,00;;'
      ].join('\n'),
      extractedAt: '2026-03-21T16:25:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 106000,
      rawReference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12',
      data: {
        rowKind: 'reservation',
        confirmationCode: 'HMA4TR9',
        serviceFeeMinor: undefined,
        grossEarningsMinor: undefined
      }
    })
  })

  it('keeps payout rows valid when gross earnings is empty in the real Airbnb export shape', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;;'
      ].join('\n'),
      extractedAt: '2026-03-21T16:30:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 98000,
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        paidOutAmountMinor: 98000,
        serviceFeeMinor: undefined,
        grossEarningsMinor: undefined,
        payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
      }
    })
  })

  it('keeps payout rows valid when stay dates are empty in the real Airbnb export shape', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
        '2026-03-12;2026-03-15;Payout;;;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);REF-HMA4TR9;;CZK;;980,00;;'
      ].join('\n'),
      extractedAt: '2026-03-21T16:50:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 98000,
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        stayStartAt: undefined,
        stayEndAt: undefined,
        paidOutAmountMinor: 98000,
        payoutReference: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
      }
    })
  })

  it('preserves real Airbnb payout references when browser-upload headers drop Czech diacritics', () => {
    const fixture = getRealInputFixture('airbnb-payout-export')

    const records = parseAirbnbPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Datum;Bude pripsan do dne;Typ;Datum zahajeni;Datum ukonceni;Host;Nabidka;Podrobnosti;Referencni kod;Potvrzujici kod;Mena;Castka;Vyplaceno;Servisni poplatek;Hrube vydelky',
        '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Prevod Jokeland s.r.o., IBAN 5956 (CZK);G-OC3WJE3SIXRO5;;CZK;;980,00;0,00;980,00'
      ].join('\n'),
      extractedAt: '2026-03-21T17:45:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      rawReference: 'G-OC3WJE3SIXRO5',
      amountMinor: 98000,
      occurredAt: '2026-03-15',
      data: {
        rowKind: 'transfer',
        reference: 'G-OC3WJE3SIXRO5',
        referenceCode: 'G-OC3WJE3SIXRO5',
        payoutReference: 'G-OC3WJE3SIXRO5',
        payoutBatchKey: 'G-OC3WJE3SIXRO5',
        transferBatchDescriptor: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
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