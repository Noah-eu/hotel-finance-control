import { describe, expect, it } from 'vitest'
import {
  documentIngestionCapabilities,
  parseInvoiceDocument,
  parseReceiptDocument
} from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parseInvoiceDocument', () => {
  it('exposes deterministic-first document ingestion capabilities with OCR left as future fallback', () => {
    expect(documentIngestionCapabilities()).toEqual({
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
})