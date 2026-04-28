import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBrowserRuntimeStateFromSelectedFiles, type BrowserRuntimeUploadState } from '../../src/upload-web'

const inputDir = 'test/actual-documents/2026-04/input'

interface ExpectedReceiptScanValues {
  fileName: string
  totalAmountMinor: number
  vatAmountMinor: number
  vatBaseAmountMinor?: number
  currency: string
}

const expectedReceiptScans: ExpectedReceiptScanValues[] = [
  {
    fileName: 'Tesco2153.PDF',
    totalAmountMinor: 215300,
    vatAmountMinor: 37366,
    currency: 'CZK'
  },
  {
    fileName: 'ScanTesco.PDF',
    totalAmountMinor: 378250,
    vatAmountMinor: 65647,
    currency: 'CZK'
  },
  {
    fileName: 'DM388.7.PDF',
    totalAmountMinor: 38870,
    vatAmountMinor: 6746,
    vatBaseAmountMinor: 32124,
    currency: 'CZK'
  }
]

describe('actual receipt scan VAT extraction', () => {
  it('keeps actual Tesco and dm scan totals and VAT visible in browser runtime truth', async () => {
    const state = await buildActualReceiptScanState(expectedReceiptScans.map((entry) => entry.fileName))

    for (const expected of expectedReceiptScans) {
      const extraction = state.documentExtractions.find((entry) => entry.fileName === expected.fileName)
      const data = extraction?.rawAutoData.extractedRecordData as Record<string, unknown> | undefined

      expect(extraction?.effectiveValues, expected.fileName).toMatchObject({
        totalAmountMinor: expected.totalAmountMinor,
        vatAmountMinor: expected.vatAmountMinor,
        currency: expected.currency
      })
      expect(data, expected.fileName).toMatchObject({
        amountMinor: expected.totalAmountMinor,
        vatAmountMinor: expected.vatAmountMinor,
        currency: expected.currency
      })

      if (expected.vatBaseAmountMinor !== undefined) {
        expect(extraction?.effectiveValues.vatBaseAmountMinor, expected.fileName).toBe(expected.vatBaseAmountMinor)
        expect(data?.vatBaseAmountMinor, expected.fileName).toBe(expected.vatBaseAmountMinor)
      }
    }
  }, 60000)
})

async function buildActualReceiptScanState(fileNames: string[]): Promise<BrowserRuntimeUploadState> {
  const files = fileNames.map((name) => {
    const bytes = readFileSync(join(inputDir, name))
    return {
      name,
      type: 'application/pdf',
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      }
    }
  })

  return buildBrowserRuntimeStateFromSelectedFiles({
    files,
    month: '2026-04',
    generatedAt: '2026-04-28T15:55:00.000Z'
  })
}
