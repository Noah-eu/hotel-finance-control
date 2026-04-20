export const potraviny640ImageOnlyReceiptFixture = {
    fileName: 'Potraviny640.pdf',
    expectedSourceDocumentId: 'uploaded:receipt:9:potraviny640-pdf',
    expectedSupplierName: 'POTRAVINY',
    expectedTotalAmountMinor: 64000,
    expectedCurrency: 'CZK',
    expectedUploadDisplayAmount: '640,00 Kč',
    expectedWebDisplayAmount: '640,00 CZK',
    ocrRawText: [
        'POTRAVINY',
        'Datum 20.03.2026 08:10',
        'Cislo uctenky 2026032000006',
        'Celkem 640,00 CZK',
        'Hotovost 640,00 CZK',
        'Zaokrouhleno 0,00 CZK'
    ].join('\n')
} as const

export function buildPotraviny640ImageOnlyReceiptPdfBase64(): string {
    const payload = Buffer.from(JSON.stringify({
        documentKind: 'receipt',
        adapter: 'ocr',
        fields: {
            rawText: potraviny640ImageOnlyReceiptFixture.ocrRawText
        }
    }), 'utf8').toString('base64')

    return Buffer.from(`%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n% HFC_OCR_STUB:${payload}`, 'latin1').toString('base64')
}