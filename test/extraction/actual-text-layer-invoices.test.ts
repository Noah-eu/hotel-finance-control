import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBrowserRuntimeStateFromSelectedFiles, type BrowserRuntimeUploadState } from '../../src/upload-web'
import expectedValues from '../actual-documents/2026-04/expected-document-values.json'

interface ExpectedDocumentValues {
  fileName: string
  documentKind: 'invoice'
  expectedSupplier: string
  expectedDocumentNumber: string
  expectedReference: string
  expectedIssueDate: string
  expectedDueDate?: string
  expectedPaymentDate?: string
  expectedTotalAmountMinor: number
  expectedVatAmountMinor?: number
  expectedVatBaseAmountMinor?: number
  expectedCurrency: string
  expectedPaymentMethod?: string
}

const actualDocumentsRoot = 'test/actual-documents/2026-04'
const inputDir = join(actualDocumentsRoot, 'input')
const receiptScanFiles = new Set([
  'Tesco2153.PDF',
  'DM388.7.PDF',
  'Potraviny640.pdf',
  'ScanTesco.PDF'
])
const forbiddenSupplierValues = new Set([
  'jokeland s.r.o.',
  'jokeland, s.r.o.',
  'příkazem',
  'převodem',
  'platba kartou',
  'inkaso'
])
let statePromise: Promise<BrowserRuntimeUploadState> | undefined

describe('actual 2026-04 text-layer invoice extraction', () => {
  it('extracts manifest invoice values from real text-layer PDFs without receipt scan tuning', async () => {
    const invoiceManifest = (expectedValues as ExpectedDocumentValues[])
      .filter((entry) => entry.fileName !== 'Vydana faktura 2616762.pdf')

    for (const expected of invoiceManifest) {
      const state = await buildActualDocumentState([expected.fileName])
      const extraction = state.documentExtractions.find((entry: BrowserRuntimeUploadState['documentExtractions'][number]) => entry.fileName === expected.fileName)
      const values = extraction?.effectiveValues
      const rawData = extraction?.rawAutoData.extractedRecordData as Record<string, unknown> | undefined

      expect(values, expected.fileName).toBeTruthy()
      expect(values?.supplierName, expected.fileName).toBe(expected.expectedSupplier)
      expect(values?.documentNumber, expected.fileName).toBe(expected.expectedDocumentNumber)
      expect(rawData?.variableSymbol ?? values?.documentNumber, expected.fileName).toBe(expected.expectedReference)
      expect(values?.issueDate, expected.fileName).toBe(expected.expectedIssueDate)
      if (expected.expectedDueDate) {
        expect(values?.dueDate, expected.fileName).toBe(expected.expectedDueDate)
      }
      expect(values?.totalAmountMinor, expected.fileName).toBe(expected.expectedTotalAmountMinor)
      expect(values?.currency, expected.fileName).toBe(expected.expectedCurrency)
      if (expected.expectedVatAmountMinor !== undefined) {
        expect(rawData?.vatAmountMinor ?? values?.vatAmountMinor, expected.fileName).toBe(expected.expectedVatAmountMinor)
      }
      if (expected.expectedVatBaseAmountMinor !== undefined) {
        expect(rawData?.vatBaseAmountMinor ?? values?.vatBaseAmountMinor, expected.fileName).toBe(expected.expectedVatBaseAmountMinor)
      }
      if (expected.expectedPaymentMethod) {
        expect(values?.paymentMethod, expected.fileName).toBe(expected.expectedPaymentMethod)
      }
      expect(forbiddenSupplierValues.has(String(values?.supplierName ?? '').toLowerCase()), expected.fileName).toBe(false)
    }

    const receiptGuardState = await buildActualDocumentState(Array.from(receiptScanFiles))
    for (const fileName of receiptScanFiles) {
      const route = receiptGuardState.fileRoutes.find((entry: BrowserRuntimeUploadState['fileRoutes'][number]) => entry.fileName === fileName)
      expect(route?.sourceSystem, fileName).toBe('receipt')
    }
  }, 60000)

  it('keeps representative invoice effectiveValues populated in browser debug workspace truth shape', async () => {
    const subset = [
      '141848652_1.pdf',
      '4017179840.pdf',
      'Sonet.pdf',
      'PRE_187131229.pdf',
      'Booking.pdf'
    ]
    const state = await buildActualDocumentState(subset)

    for (const fileName of subset) {
      const expected = (expectedValues as ExpectedDocumentValues[]).find((entry) => entry.fileName === fileName)!
      const extraction = state.documentExtractions.find((entry: BrowserRuntimeUploadState['documentExtractions'][number]) => entry.fileName === fileName)

      expect(extraction?.effectiveValues, fileName).toMatchObject({
        supplierName: expected.expectedSupplier,
        documentNumber: expected.expectedDocumentNumber,
        totalAmountMinor: expected.expectedTotalAmountMinor,
        currency: expected.expectedCurrency
      })
      expect(forbiddenSupplierValues.has(String(extraction?.effectiveValues.supplierName ?? '').toLowerCase()), fileName).toBe(false)
    }
  }, 30000)
})

async function buildActualDocumentState(onlyFileNames?: string[]): Promise<BrowserRuntimeUploadState> {
  if (!onlyFileNames && statePromise) {
    return statePromise
  }

  const files = readdirSync(inputDir)
    .filter((fileName) => /\.pdf$/i.test(fileName))
    .filter((fileName) => !onlyFileNames || onlyFileNames.includes(fileName))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const bytes = readFileSync(join(inputDir, name))
      return {
        name,
        type: 'application/pdf',
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        }
      }
    })

  const result = buildBrowserRuntimeStateFromSelectedFiles({
    files,
    month: '2026-04',
    generatedAt: '2026-04-28T10:00:00.000Z'
  })
  if (!onlyFileNames) {
    statePromise = result
  }
  return result
}
