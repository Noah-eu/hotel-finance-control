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
      'Celkem po zaokrouhlení',
      'Datum vystavení',
      'Datum splatnosti',
      'Datum zdanitelného plnění',
      'Forma úhrady',
      'Rozpis DPH',
      'K úhradě',
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
      fieldExtractionDebug: {
        referenceNumber: expect.objectContaining({
          winnerRule: 'vertical-grouped-block',
          winnerValue: '141260183'
        }),
        issueDate: expect.objectContaining({
          winnerRule: 'vertical-grouped-block',
          winnerValue: '11.03.2026'
        }),
        dueDate: expect.objectContaining({
          winnerRule: 'vertical-grouped-block',
          winnerValue: '25.03.2026'
        }),
        paymentMethod: expect.objectContaining({
          winnerRule: 'vertical-grouped-block',
          winnerValue: 'Přev. příkaz',
          candidateValues: expect.arrayContaining(['Datum vystavení', 'Přev.příkaz'])
        }),
        totalAmount: expect.objectContaining({
          winnerRule: 'line-window',
          winnerValue: '12 629,52 Kč',
          candidateValues: expect.arrayContaining(['12 629,52 Kč', 'K úhradě'])
        })
      }
    })
  })
})
