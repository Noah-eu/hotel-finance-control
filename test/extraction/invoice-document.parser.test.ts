import { describe, expect, it } from 'vitest'
import {
  detectInvoiceDocumentKeywordHits,
  documentIngestionCapabilities,
  inspectInvoiceDocumentExtractionSummary,
  inspectReceiptDocumentExtractionSummary,
  parseInvoiceDocument,
  parseReceiptDocument
} from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parseInvoiceDocument', () => {
  it('exposes deterministic-first document ingestion capabilities with OCR left as future fallback', () => {
    expect(documentIngestionCapabilities()).toEqual({
      browserCapabilityLadder: ['structured-parser', 'text-pdf-parser', 'text-document-parser', 'ocr-required'],
      mode: 'deterministic-primary',
      ocrFallback: 'not-implemented'
    })
  })

  it('extracts a deterministic invoice-document record from the representative invoice fixture', () => {
    const fixture = getRealInputFixture('invoice-document')

    const records = parseInvoiceDocument({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T22:10:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'invoice-record-1',
      recordType: 'invoice-document',
      rawReference: 'INV-2026-332',
      data: {
        sourceSystem: 'invoice',
        supplier: 'Laundry Supply s.r.o.',
        description: 'Laundry and linens'
      }
    })
  })

  it('matches the representative expected extracted output and fails clearly on missing fields', () => {
    const fixture = getRealInputFixture('invoice-document')

    const records = parseInvoiceDocument({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])

    expect(() =>
      parseInvoiceDocument({
        sourceDocument: fixture.sourceDocument,
        content: ['Invoice No: INV-2026-332', 'Supplier: Laundry Supply s.r.o.'].join('\n'),
        extractedAt: '2026-03-18T22:10:00.000Z'
      })
    ).toThrow('Invoice document is missing required fields')
  })

  it('accepts realistic invoice field aliases and localized amount/date formatting', () => {
    const fixture = getRealInputFixture('invoice-document')

    const records = parseInvoiceDocument({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Číslo faktury: INV-2026-332',
        'Dodavatel: Laundry Supply s.r.o.',
        'Datum vystavení: 19.03.2026',
        'Datum splatnosti: 26/03/2026',
        'Celkem: 185,00 CZK',
        'Předmět plnění: Laundry and linens'
      ].join('\n'),
      extractedAt: '2026-03-18T22:10:00.000Z'
    })

    expect(records[0]).toMatchObject({
      id: 'invoice-record-1',
      rawReference: 'INV-2026-332',
      amountMinor: 18500,
      occurredAt: '2026-03-19',
      data: {
        supplier: 'Laundry Supply s.r.o.',
        dueDate: '2026-03-26'
      }
    })
  })

  it('extracts deterministic receipt-document records and fails clearly on missing fields', () => {
    const fixture = getRealInputFixture('receipt-document')
    const extractedAt = '2026-03-18T22:10:00.000Z'

    const records = parseReceiptDocument({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt
    })

    expect(records[0]).toEqual({
      ...fixture.expectedExtractedRecords[0],
      extractedAt
    })

    expect(() =>
      parseReceiptDocument({
        sourceDocument: fixture.sourceDocument,
        content: ['Merchant: Metro Cash & Carry', 'Total: 2 490 CZK'].join('\n'),
        extractedAt
      })
    ).toThrow('Receipt document is missing required fields')
  })

  it('accepts realistic receipt field aliases and decimal totals', () => {
    const fixture = getRealInputFixture('receipt-document')

    const records = parseReceiptDocument({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Číslo účtenky: RCPT-2026-03-55',
        'Obchod: Metro Cash & Carry',
        'Datum nákupu: 20.03.2026',
        'Zaplaceno: 24.90 CZK',
        'Kategorie: supplies',
        'Poznámka: Cleaning materials'
      ].join('\n'),
      extractedAt: '2026-03-18T22:10:00.000Z'
    })

    expect(records[0]).toMatchObject({
      id: 'receipt-record-1',
      amountMinor: 2490,
      occurredAt: '2026-03-20',
      data: {
        merchant: 'Metro Cash & Carry',
        category: 'supplies'
      }
    })
  })

  it('converts human-readable whole-unit document totals into minor units in the shared path', () => {
    const invoice = getRealInputFixture('invoice-document')
    const receipt = getRealInputFixture('receipt-document')

    const invoiceRecords = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      extractedAt: '2026-03-18T22:10:00.000Z'
    })
    const receiptRecords = parseReceiptDocument({
      sourceDocument: receipt.sourceDocument,
      content: receipt.rawInput.content,
      extractedAt: '2026-03-18T22:10:00.000Z'
    })

    expect(invoiceRecords[0].amountMinor).toBe(1850000)
    expect(receiptRecords[0].amountMinor).toBe(249000)
    expect(parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: [
        'Číslo faktury: INV-2026-332',
        'Dodavatel: Laundry Supply s.r.o.',
        'Datum vystavení: 19.03.2026',
        'Datum splatnosti: 26/03/2026',
        'Celkem: 185,00 CZK',
        'Předmět plnění: Laundry and linens'
      ].join('\n'),
      extractedAt: '2026-03-18T22:10:00.000Z'
    })[0].amountMinor).toBe(18500)
    expect(parseReceiptDocument({
      sourceDocument: receipt.sourceDocument,
      content: [
        'Číslo účtenky: RCPT-2026-03-55',
        'Obchod: Metro Cash & Carry',
        'Datum nákupu: 20.03.2026',
        'Zaplaceno: 24.90 CZK',
        'Kategorie: supplies',
        'Poznámka: Cleaning materials'
      ].join('\n'),
      extractedAt: '2026-03-18T22:10:00.000Z'
    })[0].amountMinor).toBe(2490)
  })

  it('builds reusable extraction summaries for invoice and receipt documents', () => {
    const invoice = getRealInputFixture('invoice-document')
    const receipt = getRealInputFixture('receipt-document')

    expect(inspectInvoiceDocumentExtractionSummary(invoice.rawInput.content)).toMatchObject({
      documentKind: 'invoice',
      sourceSystem: 'invoice',
      documentType: 'invoice',
      issuerOrCounterparty: 'Laundry Supply s.r.o.',
      issueDate: '2026-03-19',
      dueDate: '2026-03-26',
      totalAmountMinor: 1850000,
      totalCurrency: 'CZK',
      referenceNumber: 'INV-2026-332',
      confidence: 'strong',
      missingRequiredFields: []
    })

    expect(inspectReceiptDocumentExtractionSummary(receipt.rawInput.content)).toEqual({
      documentKind: 'receipt',
      sourceSystem: 'receipt',
      documentType: 'receipt',
      issuerOrCounterparty: 'Metro Cash & Carry',
      paymentDate: '2026-03-20',
      totalAmountMinor: 249000,
      totalCurrency: 'CZK',
      referenceNumber: 'RCPT-2026-03-55',
      confidence: 'strong',
      missingRequiredFields: []
    })
  })

  it('recognizes Czech text-layer invoice PDFs with structured accounting fields', () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    expect(detectInvoiceDocumentKeywordHits(invoice.rawInput.content)).toEqual(expect.arrayContaining([
      'Faktura',
      'Faktura - daňový doklad',
      'daňový doklad',
      'Dodavatel',
      'Odběratel',
      'Datum vystavení',
      'Datum splatnosti',
      'Datum zdanitelného plnění',
      'Forma úhrady',
      'Rozpis DPH',
      'Celkem po zaokrouhlení',
      'IBAN'
    ]))

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      extractedAt: '2026-03-26T12:10:00.000Z'
    })

    expect(records[0]).toEqual({
      ...invoice.expectedExtractedRecords[0],
      extractedAt: '2026-03-26T12:10:00.000Z'
    })

    expect(inspectInvoiceDocumentExtractionSummary(invoice.rawInput.content)).toMatchObject({
      documentKind: 'invoice',
      sourceSystem: 'invoice',
      documentType: 'invoice',
      issuerOrCounterparty: 'Lenner Motors s.r.o.',
      customer: 'JOKELAND s.r.o.',
      issueDate: '2026-03-11',
      taxableDate: '2026-03-11',
      dueDate: '2026-03-25',
      paymentMethod: 'Přev. příkaz',
      totalAmountMinor: 1262952,
      totalCurrency: 'CZK',
      vatBaseAmountMinor: 1043762,
      vatBaseCurrency: 'CZK',
      vatAmountMinor: 219190,
      vatCurrency: 'CZK',
      referenceNumber: '141260183',
      ibanHint: 'CZ4903000000000274621920',
      confidence: 'strong',
      missingRequiredFields: [],
      groupedHeaderBlockDebug: expect.arrayContaining([
        expect.objectContaining({
          blockTypeCandidate: 'vertical-structured-header-block',
          labels: ['Datum splatnosti', 'Forma úhrady', 'Datum vystavení', 'Datum zdanitelného plnění'],
          values: ['11.03.2026', 'n/a', '25.03.2026', '11.03.2026'],
          accepted: false,
          rejectionReason: 'missing reference label'
        }),
        expect.objectContaining({
          blockTypeCandidate: 'vertical-grouped-block',
          labels: ['Forma úhrady', 'Datum vystavení', 'Datum zdanitelného plnění'],
          values: ['25.03.2026 Přev.příkaz 11.03.2026 11.03.2026 141260183', 'Strana 1/1'],
          accepted: false,
          rejectionReason: 'missing reference label'
        })
      ]),
      rawBlockDiscoveryDebug: expect.arrayContaining([
        expect.objectContaining({
          rawLines: [
            'Datum splatnosti',
            'Forma úhrady',
            'Datum vystavení',
            'Datum zdanitelného plnění'
          ],
          blockTypeGuess: 'dates-payment',
          promotionDecision: 'rejected:missing reference label'
        }),
        expect.objectContaining({
          rawLines: ['DPH Celkem po zaokrouhlení', '21,00 % Záloh celkem', 'Základ DPH', '10 437,62'],
          blockTypeGuess: 'totals-payable'
        }),
        expect.objectContaining({
          rawLines: ['S DPH', '10 437,62 Kč', '12 629,52 Kč', 'Razítko a podpis'],
          blockTypeGuess: 'totals-vat'
        })
      ]),
      fieldExtractionDebug: {
        referenceNumber: expect.objectContaining({
          winnerRule: 'anchored-header-window',
          winnerValue: '141260183',
          candidateValues: expect.arrayContaining(['141260183'])
        }),
        issueDate: expect.objectContaining({
          winnerRule: 'grouped-combined-date-payment-row',
          winnerValue: '11.03.2026'
        }),
        dueDate: expect.objectContaining({
          winnerRule: 'grouped-combined-date-payment-row',
          winnerValue: '25.03.2026'
        }),
        taxableDate: expect.objectContaining({
          winnerRule: 'grouped-combined-date-payment-row',
          winnerValue: '11.03.2026'
        }),
        paymentMethod: expect.objectContaining({
          winnerRule: 'grouped-combined-date-payment-row',
          winnerValue: 'Přev. příkaz',
          candidateValues: expect.arrayContaining(['Přev.příkaz']),
          rejectedCandidates: expect.arrayContaining(['Datum vystavení [label-text]'])
        }),
        totalAmount: expect.objectContaining({
          winnerRule: 'field-specific-summary-total',
          winnerValue: '12 629,52 Kč',
          candidateValues: expect.arrayContaining(['10 437,62 Kč', '12 629,52 Kč'])
        })
      }
    })
  })

  it('keeps grouped Czech invoice header/value blocks aligned when the value cells spill into following lines', () => {
    const content = [
      'Faktura - daňový doklad',
      'Dodavatel',
      'Lenner Motors s.r.o.',
      'Odběratel',
      'JOKELAND s.r.o.',
      'Faktura číslo Forma úhrady Datum vystavení Datum zdanitelného plnění Datum splatnosti',
      '141260183',
      'Přev.příkaz',
      '11.03.2026',
      '11.03.2026',
      '25.03.2026',
      'Iban:',
      'CZ4903000000000274621920',
      'Rozpis DPH',
      'Základ DPH DPH Celkem po zaokrouhlení',
      '10 437,62',
      '2 191,90',
      '12 629,52',
      'Celkem Kč k úhradě',
      '12 629,52'
    ].join('\n')

    expect(inspectInvoiceDocumentExtractionSummary(content)).toMatchObject({
      referenceNumber: '141260183',
      issueDate: '2026-03-11',
      taxableDate: '2026-03-11',
      dueDate: '2026-03-25',
      paymentMethod: 'Přev. příkaz',
      totalAmountMinor: 1262952,
      totalCurrency: 'CZK',
      ibanHint: 'CZ4903000000000274621920',
      missingRequiredFields: [],
      groupedHeaderLabels: ['Faktura číslo', 'Forma úhrady', 'Datum vystavení', 'Datum zdanitelného plnění', 'Datum splatnosti'],
      groupedHeaderValues: ['141260183', 'Přev.příkaz', '11.03.2026', '11.03.2026', '25.03.2026']
    })
  })

  it('parses vertical grouped Czech invoice labels when the values arrive in one combined browser row', () => {
    const content = [
      'Faktura - daňový doklad',
      'Dodavatel',
      'Lenner Motors s.r.o.',
      'Odběratel',
      'JOKELAND s.r.o.',
      'Faktura číslo',
      'Forma úhrady',
      'Datum vystavení',
      'Datum zdanitelného plnění',
      'Datum splatnosti',
      '141260183 Přev.příkaz 11.03.2026 11.03.2026 25.03.2026',
      'Iban:',
      'CZ4903000000000274621920',
      'Rozpis DPH',
      'Základ DPH',
      'DPH',
      'Celkem po zaokrouhlení',
      '10 437,62 2 191,90 12 629,52',
      'Celkem Kč k úhradě',
      '12 629,52'
    ].join('\n')

    expect(inspectInvoiceDocumentExtractionSummary(content)).toMatchObject({
      referenceNumber: '141260183',
      issueDate: '2026-03-11',
      taxableDate: '2026-03-11',
      dueDate: '2026-03-25',
      paymentMethod: 'Přev. příkaz',
      totalAmountMinor: 1262952,
      totalCurrency: 'CZK',
      ibanHint: 'CZ4903000000000274621920',
      missingRequiredFields: [],
      groupedHeaderLabels: ['Faktura číslo', 'Forma úhrady', 'Datum vystavení', 'Datum zdanitelného plnění', 'Datum splatnosti'],
      groupedHeaderValues: ['141260183', 'Přev.příkaz', '11.03.2026', '11.03.2026', '25.03.2026'],
      groupedTotalsLabels: ['Základ DPH', 'DPH', 'Celkem po zaokrouhlení'],
      groupedTotalsValues: ['10 437,62 CZK', '2 191,90 CZK', '12 629,52 CZK']
    })
  })

  it('extracts Lenner invoice number and payable total from a live-like split Czech browser invoice shape', () => {
    const content = [
      'Faktura - daňový doklad',
      'Dodavatel',
      'Lenner Motors s.r.o.',
      'Odběratel',
      'JOKELAND s.r.o.',
      'Datum zdanitelného plnění',
      'Forma úhrady',
      'Datum vystavení',
      '25.03.2026',
      'Strana 1/1',
      'Faktura číslo',
      'Forma úhrady',
      'Datum vystavení',
      'Datum zdanitelného plnění',
      'Datum splatnosti',
      '141260183',
      'Přev.příkaz',
      '11.03.2026',
      '11.03.2026',
      '25.03.2026',
      'DPH Celkem po zaokrouhlení',
      '21,00 % Záloh celkem',
      'Základ DPH',
      '10 437,62',
      'DPH',
      '2 191,90',
      'Celkem po zaokrouhlení',
      '12 629,52',
      'Celkem Kč k úhradě',
      '12 629,52',
      'K úhradě',
      '12 629,52'
    ].join('\n')

    expect(inspectInvoiceDocumentExtractionSummary(content)).toMatchObject({
      referenceNumber: '141260183',
      issueDate: '2026-03-11',
      dueDate: '2026-03-25',
      taxableDate: '2026-03-11',
      totalAmountMinor: 1262952,
      totalCurrency: 'CZK',
      paymentMethod: 'Přev. příkaz',
      missingRequiredFields: [],
      fieldExtractionDebug: expect.objectContaining({
        referenceNumber: expect.objectContaining({
          winnerRule: 'vertical-structured-header-block',
          candidateValues: expect.arrayContaining(['141260183'])
        }),
        issueDate: expect.objectContaining({
          winnerRule: 'vertical-structured-header-block',
          winnerValue: '11.03.2026'
        }),
        paymentMethod: expect.objectContaining({
          winnerRule: 'vertical-structured-header-block',
          winnerValue: 'Přev. příkaz'
        }),
        totalAmount: expect.objectContaining({
          winnerRule: 'field-specific-payable-total',
          winnerValue: '12 629,52 CZK',
          candidateValues: expect.arrayContaining(['12 629,52', '12 629,52 CZK'])
        })
      }),
      groupedHeaderLabels: ['Faktura číslo', 'Forma úhrady', 'Datum vystavení', 'Datum zdanitelného plnění', 'Datum splatnosti'],
      groupedHeaderValues: ['141260183', 'Přev.příkaz', '11.03.2026', '11.03.2026', '25.03.2026']
    })
  })
})
