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

  it('daily-settlement CSV with ID od klienta produces parsed row with clientId and reservationId', () => {
    const fixture = getRealInputFixture('comgate-export')

    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        '"Merchant";"ID ComGate";"Metoda";"Potvrzená částka";"Převedená částka";"Produkt";"Variabilní symbol převodu";"ID od klienta"',
        '"499465";"M6F7-DQEO-J1BD";"Karta online";"613,00";"606,99";"";"1817482862";"109189209"',
        '"suma";"";"";"";"";"";"";""'
      ].join('\n'),
      extractedAt: '2026-04-01T08:00:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      data: {
        comgateParserVariant: 'daily-settlement',
        clientId: '109189209',
        reservationId: '109189209',
        reference: '1817482862',
        transactionId: 'M6F7-DQEO-J1BD'
      }
    })
  })

  it('daily-settlement with extra Datum převodu column still detects as daily-settlement and preserves clientId', () => {
    const fixture = getRealInputFixture('comgate-export')

    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        '"Merchant";"ID ComGate";"Metoda";"Potvrzená částka";"Převedená částka";"Produkt";"Variabilní symbol převodu";"ID od klienta";"Datum převodu"',
        '"499465";"M6F7-DQEO-J1BD";"Karta online";"613,00";"606,99";"";"1817482862";"109189209";"31.03.2026"',
        '"suma";"";"";"";"";"";"";"";""'
      ].join('\n'),
      extractedAt: '2026-04-01T08:00:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      data: {
        comgateParserVariant: 'daily-settlement',
        clientId: '109189209',
        reservationId: '109189209',
        reference: '1817482862',
        transactionId: 'M6F7-DQEO-J1BD'
      }
    })
  })

  it('classifies full monthly Comgate export as monthly-settlement and preserves Popis as merchantOrderReference', () => {
    const fixture = getRealInputFixture('comgate-export')
    const content = [
      '"Merchant";"Datum založení";"Datum zaplacení";"Datum převodu";"ID ComGate";"Metoda";"Produkt";"Popis";"E-mail plátce";"Variabilní symbol plátce";"Variabilní symbol převodu";"ID od klienta";"Měna";"Potvrzená částka";"Převedená částka";"Poplatek celkem";"Poplatek mezibankovní";"Poplatek asociace";"Poplatek zpracovatel";"Typ karty"',
      '"499465";"27.03.2026 09:15";"27.03.2026 09:16";"28.03.2026";"CG-MONTHLY-TRX-1";"Karta online";"website-reservation";"20250680";"guest1@example.com";"109047421";"1816480742";"999900001";"CZK";"302940,00";"300000,00";"2940,00";"1000,00";"940,00";"1000,00";"VISA"',
      '"499465";"27.03.2026 09:17";"27.03.2026 09:18";"28.03.2026";"CG-MONTHLY-TRX-2";"Karta online";"website-reservation";"VOUCHER-109003481";"guest2@example.com";"109003481";"1816303586";"999900002";"CZK";"242351,00";"240000,00";"2351,00";"800,00";"751,00";"800,00";"MASTERCARD"',
      '"499465";"";"";"28.03.2026";"";"";"suma";"suma";"";"";"1816480742";"";"CZK";"545291,00";"540000,00";"5291,00";"1800,00";"1691,00";"1800,00";""'
    ].join('\n')

    const diagnostics = inspectComgateHeaderDiagnostics(content)
    const records = parseComgateExport({
      sourceDocument: fixture.sourceDocument,
      content,
      extractedAt: '2026-04-10T14:00:00.000Z'
    })

    expect(diagnostics).toMatchObject({
      detectedFileKind: 'monthly-settlement',
      parserVariant: 'monthly-settlement',
      requiredCanonicalHeaders: [
        'transactionId',
        'createdAt',
        'paidAt',
        'transferredAt',
        'merchantOrderReference',
        'payerVariableSymbol',
        'transferReference',
        'clientId',
        'currency',
        'confirmedAmountMinor',
        'transferredAmountMinor'
      ],
      missingCanonicalHeaders: [],
      containsExplicitSettlementTotal: true,
      explicitSettlementTotalMinor: 54000000
    })
    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({
      id: 'comgate-row-1',
      recordType: 'payout-line',
      rawReference: 'CG-MONTHLY-TRX-1',
      amountMinor: 30000000,
      currency: 'CZK',
      occurredAt: '2026-03-28',
      data: {
        comgateParserVariant: 'monthly-settlement',
        transactionId: 'CG-MONTHLY-TRX-1',
        reference: '1816480742',
        clientId: '999900001',
        reservationId: '999900001',
        merchantOrderReference: '20250680',
        payerVariableSymbol: '109047421',
        createdAt: '2026-03-27T09:15:00',
        paidAt: '2026-03-27T09:16:00',
        transferredAt: '2026-03-28',
        confirmedGrossMinor: 30294000,
        transferredNetMinor: 30000000,
        feeTotalMinor: 294000,
        feeInterbankMinor: 100000,
        feeAssociationMinor: 94000,
        feeProcessorMinor: 100000,
        paymentMethod: 'Karta online',
        cardType: 'VISA'
      }
    })
    expect(records[2]).toMatchObject({
      id: 'comgate-summary-1',
      recordType: 'payout-batch-summary',
      rawReference: '1816480742',
      amountMinor: 54000000,
      currency: 'CZK',
      occurredAt: '2026-03-28',
      data: {
        comgateParserVariant: 'monthly-settlement',
        rowKind: 'payout-batch-summary',
        payoutReference: '1816480742',
        transferredAt: '2026-03-28',
        transferredNetMinor: 54000000,
        confirmedGrossMinor: 54529100
      }
    })
  })
})
