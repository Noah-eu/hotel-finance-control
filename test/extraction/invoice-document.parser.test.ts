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
  it('exposes deterministic-first document ingestion capabilities with a browser-safe OCR stub adapter', () => {
    expect(documentIngestionCapabilities()).toEqual({
      browserCapabilityLadder: ['structured-parser', 'text-pdf-parser', 'text-document-parser', 'ocr-required'],
      mode: 'deterministic-primary',
      ocrFallback: 'stub-adapter'
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
      id: fixture.expectedExtractedRecords[0]?.id,
      recordType: 'invoice-document',
      rawReference: 'INV-2026-332',
      data: {
        sourceSystem: 'invoice',
        supplier: 'Laundry Supply s.r.o.',
        description: 'Laundry and linens'
      }
    })
  })

  it('matches the representative expected extracted output and sends partial invoices to needs_review instead of hard failure', () => {
    const fixture = getRealInputFixture('invoice-document')

    const records = parseInvoiceDocument({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])
    expect(inspectInvoiceDocumentExtractionSummary(
      ['Invoice No: INV-2026-332', 'Supplier: Laundry Supply s.r.o.'].join('\n')
    )).toMatchObject({
      finalStatus: 'needs_review',
      requiredFieldsCheck: 'failed',
      missingRequiredFields: expect.arrayContaining(['issueDate', 'dueDate', 'totalAmount'])
    })
    expect(parseInvoiceDocument({
      sourceDocument: fixture.sourceDocument,
      content: ['Invoice No: INV-2026-332', 'Supplier: Laundry Supply s.r.o.'].join('\n'),
      extractedAt: '2026-03-18T22:10:00.000Z'
    })).toEqual([])
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
      id: fixture.expectedExtractedRecords[0]?.id,
      rawReference: 'INV-2026-332',
      amountMinor: 18500,
      occurredAt: '2026-03-19',
      data: {
        supplier: 'Laundry Supply s.r.o.',
        dueDate: '2026-03-26'
      }
    })
  })

  it('extracts deterministic receipt-document records and keeps partial receipts in needs_review instead of hard failure', () => {
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

    expect(inspectReceiptDocumentExtractionSummary(
      ['Merchant: Metro Cash & Carry', 'Total: 2 490 CZK'].join('\n')
    )).toMatchObject({
      finalStatus: 'needs_review',
      requiredFieldsCheck: 'failed'
    })
    expect(parseReceiptDocument({
      sourceDocument: fixture.sourceDocument,
      content: ['Merchant: Metro Cash & Carry', 'Total: 2 490 CZK'].join('\n'),
      extractedAt
    })).toEqual([])
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
      finalStatus: 'parsed',
      requiredFieldsCheck: 'passed',
      missingRequiredFields: []
    })

    expect(inspectReceiptDocumentExtractionSummary(receipt.rawInput.content)).toMatchObject({
      documentKind: 'receipt',
      sourceSystem: 'receipt',
      documentType: 'receipt',
      issuerOrCounterparty: 'Metro Cash & Carry',
      paymentDate: '2026-03-20',
      totalAmountMinor: 249000,
      totalCurrency: 'CZK',
      referenceNumber: 'RCPT-2026-03-55',
      confidence: 'strong',
      finalStatus: 'parsed',
      requiredFieldsCheck: 'passed',
      qrDetected: false,
      ocrDetected: false,
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
          blockTypeCandidate: 'vertical-grouped-block',
          labels: ['Datum splatnosti', 'Forma úhrady', 'Datum vystavení', 'Datum zdanitelného plnění'],
          values: ['25.03.2026', 'Přev.příkaz', '11.03.2026', '11.03.2026'],
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
          blockTypeGuess: 'dates-payment'
        }),
        expect.objectContaining({
          rawLines: ['Rozpis DPH', 'DPH │ Celkem po zaokrouhlení', '21 919,90 Kč │ Záloh celkem', 'Základ DPH'],
          blockTypeGuess: 'totals-payable'
        }),
        expect.objectContaining({
          rawLines: ['S DPH │ 10 437,62 Kč │ 12 629,52 Kč │ Razítko a podpis', 'Předmět plnění', 'Servis vozidla'],
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

  it('keeps the Lenner matching amount on the full invoice total instead of the VAT base subtotal', () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      extractedAt: '2026-03-31T18:40:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 1262952,
      currency: 'CZK',
      occurredAt: '2026-03-11',
      data: {
        amountMinor: 1262952,
        currency: 'CZK',
        vatBaseAmountMinor: 1043762,
        vatBaseCurrency: 'CZK',
        vatAmountMinor: 219190,
        vatCurrency: 'CZK'
      }
    })

    expect(records[0]?.amountMinor).not.toBe(1043762)
    expect((records[0]?.data as { amountMinor?: number }).amountMinor).not.toBe(1043762)
  })

  it('parses Booking invoice PDFs as invoice documents and preserves local CZK payable totals when present', () => {
    const invoice = getRealInputFixture('booking-invoice-pdf')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      binaryContentBase64: invoice.rawInput.binaryContentBase64,
      extractedAt: '2026-03-31T10:20:00.000Z'
    })

    expect(records[0]).toEqual({
      ...invoice.expectedExtractedRecords[0],
      extractedAt: '2026-03-31T10:20:00.000Z'
    })

    expect(inspectInvoiceDocumentExtractionSummary({
      content: invoice.rawInput.content,
      binaryContentBase64: invoice.rawInput.binaryContentBase64
    })).toMatchObject({
      documentKind: 'invoice',
      sourceSystem: 'invoice',
      documentType: 'invoice',
      issuerOrCounterparty: 'Booking.com B.V.',
      issueDate: '2026-03-31',
      dueDate: '2026-04-14',
      totalAmountMinor: 145642,
      totalCurrency: 'EUR',
      localAmountMinor: 3553012,
      localCurrency: 'CZK',
      referenceNumber: 'BOOK-INV-2026-03',
      ibanHint: 'NL91ABNA0417164300',
      confidence: 'strong',
      finalStatus: 'parsed',
      requiredFieldsCheck: 'passed',
      missingRequiredFields: []
    })
  })

  it('parses readable Dobrá Energie invoice PDFs with the correct supplier identity and billing fields', () => {
    const invoice = getRealInputFixture('invoice-document-dobra-energie-pdf')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      extractedAt: '2026-03-30T10:20:00.000Z'
    })

    expect(records[0]).toEqual({
      ...invoice.expectedExtractedRecords[0],
      extractedAt: '2026-03-30T10:20:00.000Z'
    })

    expect(inspectInvoiceDocumentExtractionSummary(invoice.rawInput.content)).toMatchObject({
      documentKind: 'invoice',
      sourceSystem: 'invoice',
      documentType: 'invoice',
      settlementDirection: 'payable_outgoing',
      issuerOrCounterparty: 'Dobrá Energie s.r.o.',
      customer: 'JOKELAND s.r.o.',
      referenceNumber: 'DE-2026-03-4501',
      issueDate: '2026-03-18',
      taxableDate: '2026-03-18',
      dueDate: '2026-04-01',
      paymentMethod: 'Přev. příkaz',
      totalAmountMinor: 712500,
      totalCurrency: 'CZK',
      settlementAmountMinor: 712500,
      settlementCurrency: 'CZK',
      summaryTotalAmountMinor: 6231803,
      summaryTotalCurrency: 'CZK',
      ibanHint: 'CZ6508000000192000145399',
      billingPeriod: '01.03.2026 - 31.03.2026',
      confidence: 'strong',
      finalStatus: 'parsed',
      requiredFieldsCheck: 'passed',
      missingRequiredFields: [],
      fieldExtractionDebug: expect.objectContaining({
        issuerOrCounterparty: expect.objectContaining({
          winnerRule: 'first-page-party-block',
          winnerValue: 'Dobrá Energie s.r.o.'
        })
      })
    })
  })

  it('parses readable Dobrá Energie refund settlement invoices as incoming refund documents with bank-linking hints', () => {
    const invoice = getRealInputFixture('invoice-document-dobra-energie-refund-pdf')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      extractedAt: '2026-03-30T17:00:00.000Z'
    })

    expect(records[0]).toEqual({
      ...invoice.expectedExtractedRecords[0],
      extractedAt: '2026-03-30T17:00:00.000Z'
    })

    expect(inspectInvoiceDocumentExtractionSummary(invoice.rawInput.content)).toMatchObject({
      documentKind: 'invoice',
      sourceSystem: 'invoice',
      documentType: 'invoice',
      settlementDirection: 'refund_incoming',
      issuerOrCounterparty: 'Dobrá Energie s.r.o.',
      customer: 'JOKELAND s.r.o.',
      referenceNumber: 'DE-RET-2026-03-9901',
      variableSymbol: '2026039901',
      issueDate: '2026-03-21',
      dueDate: '2026-03-25',
      totalAmountMinor: 245000,
      totalCurrency: 'CZK',
      settlementAmountMinor: 245000,
      settlementCurrency: 'CZK',
      summaryTotalAmountMinor: 4985442,
      summaryTotalCurrency: 'CZK',
      targetBankAccountHint: '5599955956/5500',
      confidence: 'strong',
      finalStatus: 'parsed',
      requiredFieldsCheck: 'passed',
      missingRequiredFields: []
    })
  })

  it('keeps invoice-wide totals separate from the settlement amount used for Dobrá payable bank matching', () => {
    const invoice = getRealInputFixture('invoice-document-dobra-energie-pdf')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      extractedAt: '2026-03-31T08:10:00.000Z'
    })

    expect(records[0]).toMatchObject({
      amountMinor: 712500,
      currency: 'CZK',
      data: {
        settlementAmountMinor: 712500,
        settlementCurrency: 'CZK',
        summaryTotalAmountMinor: 6231803,
        summaryTotalCurrency: 'CZK'
      }
    })
  })

  it('keeps sparse refund settlement invoices as extracted support documents even when issue date is missing', () => {
    const invoice = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      extractedAt: '2026-03-30T18:20:00.000Z'
    })

    expect(records).toEqual([
      {
        ...invoice.expectedExtractedRecords[0],
        extractedAt: '2026-03-30T18:20:00.000Z'
      }
    ])

    expect(inspectInvoiceDocumentExtractionSummary(invoice.rawInput.content)).toMatchObject({
      documentKind: 'invoice',
      sourceSystem: 'invoice',
      documentType: 'invoice',
      settlementDirection: 'refund_incoming',
      issuerOrCounterparty: 'Dobrá Energie s.r.o.',
      customer: 'JOKELAND s.r.o.',
      referenceNumber: '5125144501',
      variableSymbol: '5125144501',
      dueDate: '2026-03-26',
      totalAmountMinor: 380400,
      totalCurrency: 'CZK',
      targetBankAccountHint: '8888997777/2010',
      finalStatus: 'needs_review',
      requiredFieldsCheck: 'failed',
      missingRequiredFields: ['issueDate']
    })
  })

  it('emits a usable sparse refund settlement record when the invoice arrives through the real binary PDF path', () => {
    const invoice = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      binaryContentBase64: invoice.rawInput.binaryContentBase64,
      extractedAt: '2026-03-31T16:10:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      recordType: 'invoice-document',
      rawReference: '5125144501',
      amountMinor: 380400,
      currency: 'CZK',
      occurredAt: '2026-03-26',
      data: {
        supplier: 'Dobrá Energie s.r.o.',
        invoiceNumber: '5125144501',
        variableSymbol: '5125144501',
        settlementDirection: 'refund_incoming',
        settlementAmountMinor: 380400,
        targetBankAccountHint: '8888997777/2010'
      }
    })
  })

  it('promotes an explicit sparse refund settlement cue into the emitted matching amount even when the refund amount line omits currency', () => {
    const invoice = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')

    const content = [
      'Faktura - daňový doklad',
      'Dodavatel',
      'Dobrá Energie s.r.o.',
      'Odběratel',
      'JOKELAND s.r.o.',
      'Variabilní symbol',
      '5125144501',
      'Datum splatnosti',
      '26.03.2026',
      'Přeplatek -3 804,00',
      'Přeplatek bude připsán na Váš bankovní účet',
      '8888997777/2010',
      'Předmět plnění:',
      'Vyúčtování dodávky elektřiny za březen 2026'
    ].join('\n')

    expect(inspectInvoiceDocumentExtractionSummary(content)).toMatchObject({
      settlementDirection: 'refund_incoming',
      referenceNumber: '5125144501',
      dueDate: '2026-03-26',
      totalAmountMinor: 380400,
      totalCurrency: 'CZK',
      settlementAmountMinor: 380400,
      settlementCurrency: 'CZK',
      targetBankAccountHint: '8888997777/2010',
      finalStatus: 'needs_review',
      requiredFieldsCheck: 'failed',
      missingRequiredFields: ['issueDate']
    })

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content,
      extractedAt: '2026-03-31T17:20:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      recordType: 'invoice-document',
      rawReference: '5125144501',
      amountMinor: 380400,
      currency: 'CZK',
      occurredAt: '2026-03-26',
      data: {
        supplier: 'Dobrá Energie s.r.o.',
        invoiceNumber: '5125144501',
        settlementDirection: 'refund_incoming',
        amountMinor: 380400,
        currency: 'CZK',
        settlementAmountMinor: 380400,
        settlementCurrency: 'CZK',
        targetBankAccountHint: '8888997777/2010'
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
      missingRequiredFields: []
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

  it('extracts Lenner invoice number and payable total from a live-like Czech browser invoice shape with broken invoice-number label text', () => {
    const content = [
      'Faktura - daňový doklad',
      'Dodavatel',
      'Lenner Motors s.r.o.',
      'Odběratel',
      'JOKELAND s.r.o.',
      'Faktura čí lo',
      'Datum splatnosti │ Forma úhrady │ Datum vystavení │ Datum zdanitelného plnění',
      '25.03.2026 │ Přev.příkaz │ 11.03.2026 │ 11.03.2026',
      '141260183',
      'Strana 1/1',
      'Iban:',
      'CZ4903000000000274621920',
      'Rozpis DPH',
      'DPH │ Celkem po zaokrouhlení',
      '21 919,90 Kč │ Záloh celkem',
      'Základ DPH',
      '10 437,62 Kč',
      'DPH',
      '2 191,90 Kč',
      'S DPH │ 10 437,62 Kč │ 12 629,52 Kč │ Razítko a podpis'
    ].join('\n')

    expect(inspectInvoiceDocumentExtractionSummary(content)).toMatchObject({
      referenceNumber: '141260183',
      issueDate: '2026-03-11',
      dueDate: '2026-03-25',
      taxableDate: '2026-03-11',
      totalAmountMinor: 1262952,
      totalCurrency: 'CZK',
      paymentMethod: 'Přev. příkaz',
      qrDetected: false,
      missingRequiredFields: [],
      fieldExtractionDebug: expect.objectContaining({
        referenceNumber: expect.objectContaining({
          winnerRule: 'anchored-header-window',
          candidateValues: expect.arrayContaining(['141260183'])
        }),
        issueDate: expect.objectContaining({
          winnerRule: 'structured-combined-date-payment-row',
          winnerValue: '11.03.2026'
        }),
        dueDate: expect.objectContaining({
          winnerRule: 'structured-combined-date-payment-row',
          winnerValue: '25.03.2026'
        }),
        taxableDate: expect.objectContaining({
          winnerRule: 'structured-combined-date-payment-row',
          winnerValue: '11.03.2026'
        }),
        paymentMethod: expect.objectContaining({
          winnerRule: 'structured-combined-date-payment-row',
          winnerValue: 'Přev. příkaz'
        }),
        totalAmount: expect.objectContaining({
          winnerRule: 'field-specific-summary-total',
          winnerValue: '12 629,52 Kč',
          candidateValues: expect.arrayContaining(['10 437,62 Kč', '12 629,52 Kč']),
          rejectedCandidates: expect.arrayContaining(['10 437,62 Kč [not-money]'])
        })
      })
    })
  })

  it('keeps the Lenner matching amount on the full invoice total when only a generic total label is present above the VAT base', () => {
    const content = [
      'Faktura - daňový doklad',
      'Dodavatel',
      'Lenner Motors s.r.o.',
      'Odběratel',
      'JOKELAND s.r.o.',
      'Faktura číslo',
      '141260183',
      'Datum splatnosti',
      '25.03.2026',
      'Forma úhrady',
      'Přev.příkaz',
      'Datum vystavení',
      '11.03.2026',
      'Datum zdanitelného plnění',
      '11.03.2026',
      'Rozpis DPH',
      'Celkem po zaokrouhlení',
      'Základ DPH',
      '10 437,62 Kč',
      'DPH',
      '2 191,90 Kč',
      'S DPH',
      '12 629,52 Kč'
    ].join('\n')

    expect(inspectInvoiceDocumentExtractionSummary(content)).toMatchObject({
      issuerOrCounterparty: 'Lenner Motors s.r.o.',
      referenceNumber: '141260183',
      totalAmountMinor: 1262952,
      totalCurrency: 'CZK',
      vatBaseAmountMinor: 1043762,
      vatCurrency: 'CZK',
      vatAmountMinor: 219190
    })
    expect(inspectInvoiceDocumentExtractionSummary(content)).not.toHaveProperty('settlementDirection')
    expect(inspectInvoiceDocumentExtractionSummary(content)).not.toHaveProperty('settlementAmountMinor')

    const records = parseInvoiceDocument({
      sourceDocument: {
        id: 'invoice-lenner-generic-total-browser-shape' as never,
        sourceSystem: 'invoice',
        documentType: 'invoice',
        fileName: 'Lenner.pdf',
        uploadedAt: '2026-03-31T18:42:00.000Z'
      },
      content,
      extractedAt: '2026-03-31T18:42:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      amountMinor: 1262952,
      currency: 'CZK',
      rawReference: '141260183',
      data: {
        supplier: 'Lenner Motors s.r.o.',
        invoiceNumber: '141260183',
        amountMinor: 1262952,
        currency: 'CZK',
        vatBaseAmountMinor: 1043762,
        vatBaseCurrency: 'CZK'
      }
    })
    expect(records[0]?.data).not.toHaveProperty('settlementDirection')
    expect(records[0]?.data).not.toHaveProperty('settlementAmountMinor')
  })

  it('recovers Czech invoice payment fields from an embedded SPD / QR Platba payload when text fields are missing', () => {
    const invoice = getRealInputFixture('invoice-document-czech-pdf-with-spd-qr')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      binaryContentBase64: invoice.rawInput.binaryContentBase64,
      extractedAt: '2026-03-28T10:05:00.000Z'
    })

    expect(records[0]).toEqual({
      ...invoice.expectedExtractedRecords[0],
      extractedAt: '2026-03-28T10:05:00.000Z'
    })

    expect(inspectInvoiceDocumentExtractionSummary({
      content: invoice.rawInput.content,
      binaryContentBase64: invoice.rawInput.binaryContentBase64
    })).toMatchObject({
      referenceNumber: '141260183',
      issueDate: '2026-03-11',
      dueDate: '2026-03-25',
      totalAmountMinor: 1850000,
      totalCurrency: 'CZK',
      ibanHint: 'CZ4903000000000274621920',
      qrDetected: true,
      qrRawPayload: 'SPD*1.0*ACC:CZ4903000000000274621920*AM:18500.00*CC:CZK*X-VS:141260183*X-KS:0308*X-SS:1007*RN:QR%20Hotel%20Supply%20s.r.o.*MSG:Faktura%20141260183*DT:20260325',
      qrParsedFields: {
        account: 'CZ4903000000000274621920',
        ibanHint: 'CZ4903000000000274621920',
        amountMinor: 1850000,
        currency: 'CZK',
        variableSymbol: '141260183',
        constantSymbol: '0308',
        specificSymbol: '1007',
        recipientName: 'QR Hotel Supply s.r.o.',
        message: 'Faktura 141260183',
        dueDate: '2026-03-25',
        referenceNumber: '141260183'
      },
      fieldProvenance: expect.objectContaining({
        referenceNumber: 'qr',
        issuerOrCounterparty: 'text+qr-confirmed',
        dueDate: 'qr',
        totalAmount: 'qr',
        ibanHint: 'qr'
      }),
      qrRecoveredFields: expect.arrayContaining(['referenceNumber', 'dueDate', 'totalAmount', 'ibanHint']),
      qrConfirmedFields: expect.arrayContaining(['issuerOrCounterparty']),
      finalStatus: 'parsed',
      requiredFieldsCheck: 'passed',
      missingRequiredFields: []
    })
  })

  it('recovers a scan-like invoice through the OCR fallback stub without changing the normalized invoice shape', () => {
    const invoice = getRealInputFixture('invoice-document-scan-pdf-with-ocr-stub')

    const records = parseInvoiceDocument({
      sourceDocument: invoice.sourceDocument,
      content: invoice.rawInput.content,
      binaryContentBase64: invoice.rawInput.binaryContentBase64,
      extractedAt: '2026-03-29T08:30:00.000Z'
    })

    expect(records[0]).toEqual({
      ...invoice.expectedExtractedRecords[0],
      extractedAt: '2026-03-29T08:30:00.000Z'
    })

    expect(inspectInvoiceDocumentExtractionSummary({
      content: invoice.rawInput.content,
      binaryContentBase64: invoice.rawInput.binaryContentBase64
    })).toMatchObject({
      referenceNumber: 'OCR-INV-2026-77',
      issueDate: '2026-03-20',
      dueDate: '2026-03-27',
      taxableDate: '2026-03-20',
      totalAmountMinor: 650000,
      totalCurrency: 'CZK',
      ibanHint: 'CZ4903000000000274621920',
      ocrDetected: true,
      qrDetected: false,
      ocrRecoveredFields: expect.arrayContaining([
        'referenceNumber',
        'issuerOrCounterparty',
        'customer',
        'issueDate',
        'dueDate',
        'taxableDate',
        'paymentMethod',
        'totalAmount',
        'vatBaseAmount',
        'vatAmount',
        'ibanHint'
      ]),
      fieldProvenance: expect.objectContaining({
        referenceNumber: 'ocr',
        totalAmount: 'ocr',
        ibanHint: 'ocr'
      }),
      finalStatus: 'parsed',
      requiredFieldsCheck: 'passed',
      missingRequiredFields: []
    })
  })

  it('sends handwritten-like receipts with partial OCR data to needs_review instead of failing the ingest path', () => {
    const receipt = getRealInputFixture('receipt-document-handwritten-pdf-with-ocr-stub')
    const records = parseReceiptDocument({
      sourceDocument: receipt.sourceDocument,
      content: receipt.rawInput.content,
      binaryContentBase64: receipt.rawInput.binaryContentBase64,
      extractedAt: '2026-03-29T08:45:00.000Z'
    })

    expect(records[0]).toEqual({
      ...receipt.expectedExtractedRecords[0],
      extractedAt: '2026-03-29T08:45:00.000Z'
    })

    expect(inspectReceiptDocumentExtractionSummary({
      content: receipt.rawInput.content,
      binaryContentBase64: receipt.rawInput.binaryContentBase64
    })).toMatchObject({
      issuerOrCounterparty: 'Fresh Farm Market',
      paymentDate: '2026-03-22',
      totalAmountMinor: 24900,
      totalCurrency: 'CZK',
      ocrDetected: true,
      requiredFieldsCheck: 'failed',
      finalStatus: 'needs_review',
      missingRequiredFields: ['referenceNumber']
    })
  })
})
