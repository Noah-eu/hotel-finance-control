import { describe, expect, it } from 'vitest'
import { inspectComgateHeaderDiagnostics, parseComgateExport } from '../../src/extraction'
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
        comgateParserVariant: 'legacy',
        paymentPurpose: 'website-reservation',
        reservationId: 'WEB-RES-991'
      }
    })
    expect(records[1]).toMatchObject({
      id: 'comgate-row-2',
      rawReference: 'CG-PARK-551',
      data: {
        comgateParserVariant: 'legacy',
        paymentPurpose: 'parking',
        reservationId: 'PARK-551'
      }
    })
  })

  it('supports the current klientský portál Comgate export shape without failing on missing legacy reference and reservation columns', () => {
    const fixture = getRealInputFixture('comgate-export-current-portal')

    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-31T19:30:00.000Z'
    })

    expect(records).toEqual([
      {
        ...fixture.expectedExtractedRecords[0],
        extractedAt: '2026-03-31T19:30:00.000Z'
      },
      {
        ...fixture.expectedExtractedRecords[1],
        extractedAt: '2026-03-31T19:30:00.000Z'
      }
    ])
    expect(records[0]?.data).not.toHaveProperty('reservationId')
  })

  it('maps the real Czech browser current-portal header row to the current-portal variant with no missing canonical fields', () => {
    const fixture = getRealInputFixture('comgate-export-current-portal')

    const diagnostics = inspectComgateHeaderDiagnostics(fixture.rawInput.content)

    expect(diagnostics).toMatchObject({
      detectedDelimiter: ';',
      detectedFileKind: 'current-portal-guest-payments',
      parserVariant: 'current-portal',
      rawHeaders: ['Comgate ID', 'ID od klienta', 'Datum založení', 'Datum zaplacení', 'Datum převodu', 'E-mail plátce', 'VS platby', 'Obchod', 'Cena', 'Měna', 'Typ platby', 'Mezibankovní poplatek', 'Poplatek asociace', 'Poplatek zpracovatel', 'Poplatek celkem'],
      canonicalHeaders: ['transactionId', 'paymentReference', 'Datum založení', 'paidAt', 'payoutDate', 'E-mail plátce', 'paymentReference', 'Obchod', 'amountMinor', 'currency', 'paymentType', 'interbankFeeMinor', 'associationFeeMinor', 'processorFeeMinor', 'totalFeeMinor'],
      requiredCanonicalHeaders: ['payoutDate', 'amountMinor', 'currency'],
      missingCanonicalHeaders: [],
      containsExplicitSettlementTotal: false
    })
  })

  it('reproduces the daily Comgate settlement CSV as a distinct settlement shape that is not the current-portal guest-payments variant', () => {
    const fixture = getRealInputFixture('comgate-daily-payout-export')

    const diagnostics = inspectComgateHeaderDiagnostics(fixture.rawInput.content)
    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-04-01T08:00:00.000Z'
    })

    expect(diagnostics).toMatchObject({
      detectedDelimiter: ';',
      detectedFileKind: 'daily-settlement',
      parserVariant: 'daily-settlement',
      rawHeaders: ['Merchant', 'ID ComGate', 'Metoda', 'Potvrzen� ��stka', 'P�eveden� ��stka', 'Produkt', 'Variabiln� symbol p�evodu', 'ID od klienta'],
      canonicalHeaders: ['merchant', 'transactionId', 'paymentMethod', 'confirmedAmountMinor', 'transferredAmountMinor', 'product', 'transferReference', 'clientId'],
      requiredCanonicalHeaders: ['transactionId', 'confirmedAmountMinor', 'transferredAmountMinor', 'transferReference', 'clientId'],
      missingCanonicalHeaders: [],
      containsExplicitSettlementTotal: true,
      explicitSettlementTotalMinor: 605879,
      explicitSettlementGrossTotalMinor: 611876,
      componentRowCount: 3
    })
    expect(diagnostics.parserVariant).not.toBe('current-portal')
    expect(records).toEqual([
      {
        ...fixture.expectedExtractedRecords[0],
        extractedAt: '2026-04-01T08:00:00.000Z'
      },
      {
        ...fixture.expectedExtractedRecords[1],
        extractedAt: '2026-04-01T08:00:00.000Z'
      },
      {
        ...fixture.expectedExtractedRecords[2],
        extractedAt: '2026-04-01T08:00:00.000Z'
      }
    ])
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

  it('preserves legacy Comgate parsing for the older reservation-linked export shape', () => {
    const fixture = getRealInputFixture('comgate-export')

    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T22:00:00.000Z'
    })

    expect(records.every((record) => record.data.comgateParserVariant === 'legacy')).toBe(true)
    expect(records.map((record) => record.rawReference)).toEqual(['CG-RES-991', 'CG-PARK-551'])
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
        comgateParserVariant: 'legacy',
        paymentPurpose: 'website-reservation',
        reservationId: 'WEB-RES-991'
      }
    })
  })
})