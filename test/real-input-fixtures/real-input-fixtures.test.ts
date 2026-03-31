import { describe, expect, it } from 'vitest'
import { getRealInputFixture, realInputFixtures } from '../../src/real-input-fixtures'

describe('realInputFixtures', () => {
  it('covers the first practical hotel-finance source types with deterministic metadata', () => {
    expect(realInputFixtures.map((fixture) => fixture.key)).toEqual([
      'raiffeisenbank-statement',
      'fio-statement',
      'booking-payout-export',
      'booking-payout-export-browser-upload-shape',
      'booking-payout-export-browser-upload-batch-shape',
      'booking-payout-statement-pdf',
      'airbnb-payout-export',
      'expedia-payout-export',
      'previo-reservation-export',
      'comgate-export',
      'comgate-export-current-portal',
      'invoice-document',
      'booking-invoice-pdf',
      'invoice-document-czech-pdf',
      'invoice-document-dobra-energie-pdf',
      'invoice-document-dobra-energie-refund-pdf',
      'invoice-document-dobra-energie-refund-sparse-pdf',
      'invoice-document-czech-pdf-with-spd-qr',
      'invoice-document-scan-pdf-with-ocr-stub',
      'receipt-document',
      'receipt-document-handwritten-pdf-with-ocr-stub'
    ])

    for (const fixture of realInputFixtures) {
      expect(
        fixture.rawInput.content.length > 0 || Boolean(fixture.rawInput.binaryContentBase64)
      ).toBe(true)
      expect(fixture.expectedExtractedRecords.length).toBeGreaterThan(0)
      expect(fixture.sourceDocument.fileName.length).toBeGreaterThan(0)
    }
  })

  it('keeps representative extracted outputs aligned with downstream contracts', () => {
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const booking = getRealInputFixture('booking-payout-export')
    const bookingBatch = getRealInputFixture('booking-payout-export-browser-upload-batch-shape')
    const bookingPayoutStatementPdf = getRealInputFixture('booking-payout-statement-pdf')
    const airbnb = getRealInputFixture('airbnb-payout-export')
    const expedia = getRealInputFixture('expedia-payout-export')
    const previo = getRealInputFixture('previo-reservation-export')
    const invoice = getRealInputFixture('invoice-document')
    const bookingInvoicePdf = getRealInputFixture('booking-invoice-pdf')
    const czechInvoicePdf = getRealInputFixture('invoice-document-czech-pdf')
    const dobraInvoicePdf = getRealInputFixture('invoice-document-dobra-energie-pdf')
    const dobraRefundInvoicePdf = getRealInputFixture('invoice-document-dobra-energie-refund-pdf')
    const dobraSparseRefundInvoicePdf = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')
    const czechInvoicePdfWithQr = getRealInputFixture('invoice-document-czech-pdf-with-spd-qr')
    const scanInvoiceWithOcr = getRealInputFixture('invoice-document-scan-pdf-with-ocr-stub')
    const receipt = getRealInputFixture('receipt-document')
    const handwrittenReceiptWithOcr = getRealInputFixture('receipt-document-handwritten-pdf-with-ocr-stub')

    expect(raiffeisen.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'bank-transaction',
      data: {
        sourceSystem: 'bank',
        transactionType: 'booking-payout'
      }
    })
    expect(booking.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'payout-line',
      data: {
        platform: 'booking',
        bookingPayoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-BOOK-20260310',
        reservationId: 'RES-BOOK-8841'
      }
    })
    expect(bookingBatch.expectedExtractedRecords.map((record) => record.data.bookingPayoutBatchKey)).toEqual([
      'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
      'booking-batch:2026-03-12:PAYOUT-BOOK-20260310'
    ])
    expect(bookingPayoutStatementPdf.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'payout-supplement',
      data: {
        platform: 'booking',
        supplementRole: 'payout_statement',
        paymentId: 'PAYOUT-BOOK-20260310',
        payoutDate: '2026-03-12',
        ibanSuffix: '5956'
      }
    })
    expect(airbnb.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'payout-line',
      data: {
        platform: 'airbnb',
        rowKind: 'reservation',
        reservationId: 'AIRBNB-RES:hma4tr9:2026-03-10:2026-03-12:106000'
      }
    })
    expect(airbnb.expectedExtractedRecords[1]).toMatchObject({
      recordType: 'payout-line',
      data: {
        platform: 'airbnb',
        rowKind: 'transfer',
        payoutReference: 'G-OC3WJE3SIXRO5',
        transferBatchDescriptor: 'AIRBNB-TRANSFER:Jokeland s.r.o.:IBAN-5956-(CZK)'
      }
    })
    expect(expedia.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'payout-line',
      data: {
        platform: 'expedia',
        reservationId: 'EXP-RES-1001'
      }
    })
    expect(previo.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'payout-line',
      data: {
        platform: 'previo',
        reservationId: 'PREVIO-20260314'
      }
    })
    expect(invoice.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      amountMinor: 1850000,
      data: {
        invoiceNumber: 'INV-2026-332',
        supplier: 'Laundry Supply s.r.o.',
        amountMinor: 1850000
      }
    })
    expect(bookingInvoicePdf.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      amountMinor: 145642,
      currency: 'EUR',
      data: {
        invoiceNumber: 'BOOK-INV-2026-03',
        supplier: 'Booking.com B.V.',
        amountMinor: 145642,
        localAmountMinor: 3553012,
        localCurrency: 'CZK',
        referenceHints: ['BOOK-INV-2026-03', 'CHILL-APT-PRG']
      }
    })
    expect(czechInvoicePdf.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      amountMinor: 1262952,
      data: {
        invoiceNumber: '141260183',
        supplier: 'Lenner Motors s.r.o.',
        customer: 'JOKELAND s.r.o.',
        paymentMethod: 'Přev. příkaz'
      }
    })
    expect(dobraInvoicePdf.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      amountMinor: 712500,
      data: {
        settlementDirection: 'payable_outgoing',
        invoiceNumber: 'DE-2026-03-4501',
        supplier: 'Dobrá Energie s.r.o.',
        customer: 'JOKELAND s.r.o.',
        dueDate: '2026-04-01',
        summaryTotalAmountMinor: 6231803,
        billingPeriod: '01.03.2026 - 31.03.2026'
      }
    })
    expect(dobraRefundInvoicePdf.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      amountMinor: 245000,
      data: {
        settlementDirection: 'refund_incoming',
        invoiceNumber: 'DE-RET-2026-03-9901',
        variableSymbol: '2026039901',
        supplier: 'Dobrá Energie s.r.o.',
        dueDate: '2026-03-25',
        summaryTotalAmountMinor: 4985442,
        targetBankAccountHint: '5599955956/5500'
      }
    })
    expect(dobraSparseRefundInvoicePdf.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      amountMinor: 380400,
      occurredAt: '2026-03-26',
      data: {
        settlementDirection: 'refund_incoming',
        invoiceNumber: '5125144501',
        variableSymbol: '5125144501',
        supplier: 'Dobrá Energie s.r.o.',
        dueDate: '2026-03-26',
        settlementAmountMinor: 380400,
        settlementCurrency: 'CZK',
        targetBankAccountHint: '8888997777/2010'
      }
    })
    expect(czechInvoicePdfWithQr.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      amountMinor: 1850000,
      data: {
        invoiceNumber: '141260183',
        supplier: 'QR Hotel Supply s.r.o.',
        customer: 'JOKELAND s.r.o.'
      }
    })
    expect(scanInvoiceWithOcr.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      amountMinor: 650000,
      data: {
        invoiceNumber: 'OCR-INV-2026-77',
        supplier: 'Scan Laundry Supply s.r.o.'
      }
    })
    expect(receipt.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'receipt-document',
      amountMinor: 249000,
      data: {
        receiptNumber: 'RCPT-2026-03-55',
        merchant: 'Metro Cash & Carry',
        amountMinor: 249000
      }
    })
    expect(handwrittenReceiptWithOcr.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'receipt-document',
      amountMinor: 24900,
      data: {
        merchant: 'Fresh Farm Market'
      }
    })
  })

  it('includes normalized expectations where current deterministic normalizers already apply', () => {
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const booking = getRealInputFixture('booking-payout-export')
    const bookingBatch = getRealInputFixture('booking-payout-export-browser-upload-batch-shape')
    const airbnb = getRealInputFixture('airbnb-payout-export')
    const expedia = getRealInputFixture('expedia-payout-export')
    const previo = getRealInputFixture('previo-reservation-export')

    expect(raiffeisen.expectedNormalizedTransactions).toBeDefined()
    expect(booking.expectedNormalizedTransactions).toBeDefined()
    expect(airbnb.expectedNormalizedTransactions).toBeDefined()
    expect(expedia.expectedNormalizedTransactions).toBeDefined()
    expect(previo.expectedNormalizedTransactions).toBeDefined()
    expect(booking.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'booking',
      reference: 'PAYOUT-BOOK-20260310',
      bookingPayoutBatchKey: 'booking-batch:2026-03-10:PAYOUT-BOOK-20260310'
    })
    expect(bookingBatch.expectedNormalizedTransactions?.map((transaction) => transaction.bookingPayoutBatchKey)).toEqual([
      'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
      'booking-batch:2026-03-12:PAYOUT-BOOK-20260310'
    ])
    expect(airbnb.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'airbnb',
      reference: 'AIRBNB-STAY:hma4tr9:2026-03-10:2026-03-12'
    })
    expect(airbnb.expectedNormalizedTransactions?.[1]).toMatchObject({
      source: 'airbnb',
      reference: 'G-OC3WJE3SIXRO5'
    })
    expect(expedia.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'expedia',
      reference: 'EXP-TERM-1001'
    })
    expect(previo.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'previo',
      reference: 'PREVIO-20260314'
    })

    const invoice = getRealInputFixture('invoice-document')
    const czechInvoicePdf = getRealInputFixture('invoice-document-czech-pdf')
    const dobraInvoicePdf = getRealInputFixture('invoice-document-dobra-energie-pdf')
    const dobraRefundInvoicePdf = getRealInputFixture('invoice-document-dobra-energie-refund-pdf')
    const dobraSparseRefundInvoicePdf = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')
    const czechInvoicePdfWithQr = getRealInputFixture('invoice-document-czech-pdf-with-spd-qr')
    const scanInvoiceWithOcr = getRealInputFixture('invoice-document-scan-pdf-with-ocr-stub')
    const receipt = getRealInputFixture('receipt-document')
    const handwrittenReceiptWithOcr = getRealInputFixture('receipt-document-handwritten-pdf-with-ocr-stub')
    expect(invoice.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'invoice',
      amountMinor: 1850000,
      accountId: 'document-expenses'
    })
    expect(czechInvoicePdf.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'invoice',
      amountMinor: 1262952,
      accountId: 'document-expenses',
      counterparty: 'Lenner Motors s.r.o.',
      reference: '141260183'
    })
    expect(dobraInvoicePdf.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'invoice',
      direction: 'out',
      amountMinor: 712500,
      accountId: 'document-expenses',
      counterparty: 'Dobrá Energie s.r.o.',
      reference: 'DE-2026-03-4501'
    })
    expect(dobraRefundInvoicePdf.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'invoice',
      direction: 'in',
      settlementDirection: 'refund_incoming',
      amountMinor: 245000,
      accountId: 'document-refunds',
      counterparty: 'Dobrá Energie s.r.o.',
      reference: 'DE-RET-2026-03-9901',
      targetBankAccountHint: '5599955956/5500'
    })
    expect(dobraSparseRefundInvoicePdf.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'invoice',
      direction: 'in',
      settlementDirection: 'refund_incoming',
      amountMinor: 380400,
      accountId: 'document-refunds',
      counterparty: 'Dobrá Energie s.r.o.',
      reference: '5125144501',
      targetBankAccountHint: '8888997777/2010'
    })
    expect(dobraSparseRefundInvoicePdf.expectedExtractedRecords?.[0]).toMatchObject({
      recordType: 'invoice-document',
      rawReference: '5125144501',
      amountMinor: 380400,
      currency: 'CZK',
      occurredAt: '2026-03-26',
      data: {
        settlementDirection: 'refund_incoming',
        settlementAmountMinor: 380400,
        settlementCurrency: 'CZK',
        targetBankAccountHint: '8888997777/2010'
      }
    })
    expect(czechInvoicePdfWithQr.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'invoice',
      amountMinor: 1850000,
      accountId: 'document-expenses',
      counterparty: 'QR Hotel Supply s.r.o.',
      reference: '141260183'
    })
    expect(scanInvoiceWithOcr.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'invoice',
      amountMinor: 650000,
      accountId: 'document-expenses',
      counterparty: 'Scan Laundry Supply s.r.o.',
      reference: 'OCR-INV-2026-77'
    })
    expect(receipt.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'receipt',
      amountMinor: 249000,
      accountId: 'document-expenses'
    })
    expect(handwrittenReceiptWithOcr.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'receipt',
      amountMinor: 24900,
      accountId: 'document-expenses',
      counterparty: 'Fresh Farm Market'
    })
  })
})
