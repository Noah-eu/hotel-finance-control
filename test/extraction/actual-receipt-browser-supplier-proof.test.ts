import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBrowserRuntimeStateFromSelectedFiles, type BrowserRuntimeUploadState } from '../../src/upload-web'

const inputDir = 'test/actual-documents/2026-04/input'

describe('actual receipt browser supplier proof', () => {
  it('keeps Tesco2153 supplier canonical without changing confirmed receipt amounts', async () => {
    const state = await buildActualReceiptBrowserState([
      'Tesco2153.PDF',
      'ScanTesco.PDF',
      'DM388.7.PDF',
      'Potraviny640.pdf'
    ])

    const tesco2153 = findExtraction(state, 'Tesco2153.PDF')
    const tesco2153Data = tesco2153.rawAutoData.extractedRecordData as Record<string, unknown>

    expect(tesco2153.effectiveValues).toMatchObject({
      supplierName: 'TESCO',
      totalAmountMinor: 215300,
      vatBaseAmountMinor: 177934,
      vatAmountMinor: 37366,
      currency: 'CZK'
    })
    expect(tesco2153Data).toMatchObject({
      merchant: 'TESCO',
      amountMinor: 215300,
      vatBaseAmountMinor: 177934,
      vatAmountMinor: 37366,
      currency: 'CZK'
    })

    expect(findExtraction(state, 'ScanTesco.PDF').effectiveValues).toMatchObject({
      supplierName: 'TESCO',
      totalAmountMinor: 378250,
      vatAmountMinor: 65647,
      currency: 'CZK'
    })
    expect(findExtraction(state, 'DM388.7.PDF').effectiveValues).toMatchObject({
      supplierName: 'dm drogerie markt s.r.o.',
      totalAmountMinor: 38870,
      vatBaseAmountMinor: 32124,
      vatAmountMinor: 6746,
      currency: 'CZK'
    })

    const potravinyRoute = state.fileRoutes.find((route) => route.fileName === 'Potraviny640.pdf')
    const potraviny = findExtraction(state, 'Potraviny640.pdf')

    expect(potravinyRoute).toMatchObject({
      status: 'supported',
      parserId: 'receipt'
    })
    expect(potravinyRoute?.decision.ingestionBranch).toBe('ocr-required')
    expect(potraviny.effectiveValues.totalAmountMinor).toBeUndefined()
    expect(potraviny.effectiveValues.supplierName).toBeUndefined()
  }, 60000)
})

async function buildActualReceiptBrowserState(fileNames: string[]): Promise<BrowserRuntimeUploadState> {
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
    generatedAt: '2026-04-28T19:55:00.000Z'
  })
}

function findExtraction(
  state: BrowserRuntimeUploadState,
  fileName: string
): BrowserRuntimeUploadState['documentExtractions'][number] {
  const extraction = state.documentExtractions.find((entry) => entry.fileName === fileName)
  expect(extraction, fileName).toBeDefined()
  return extraction!
}