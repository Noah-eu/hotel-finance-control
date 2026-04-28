import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBrowserRuntimeStateFromSelectedFiles, type BrowserRuntimeUploadState } from '../../src/upload-web'

const inputDir = 'test/actual-documents/2026-04/input'

const actualJpgReceiptFiles = [
  'Lidl_Zdiby_299_90_2026-04-19_1256.jpg',
  'Tesco_729_00_2026-04-20.jpg',
  'Tesco_2542_23_2026-04-20.jpg',
  'Bauhaus_318_00_2026-04-12.jpg',
  'Lidl_Kralupy_299_90_2026-04-19.jpg',
  'Lidl_Zdiby_299_90_2026-04-19_1317.jpg',
  'Locksystems_180_00_2026-04-17.jpg'
]

const bogusByteDerivedAmounts = new Set([100, 200, 500, 900, 9200])

describe('actual JPG receipt no-OCR guard', () => {
  it('keeps real JPG receipt uploads guarded instead of parsing JPEG/EXIF bytes as receipt text', async () => {
    const state = await buildActualJpgReceiptState(actualJpgReceiptFiles)

    for (const fileName of actualJpgReceiptFiles) {
      const route = state.fileRoutes.find((entry) => entry.fileName === fileName)
      const extraction = state.documentExtractions.find((entry) => entry.fileName === fileName)

      expect(route?.decision.capability.profile, fileName).toBe('image_receipt_like')
      expect(route?.decision.capability.transportProfile, fileName).toBe('image_document')
      expect(route?.decision.ingestionBranch, fileName).toBe('ocr-required')
      expect(route?.decision.matchedRules, fileName).toContain('capability-ocr-required')
      expect(route?.decision.matchedRules, fileName).not.toContain('ocr-fallback-parser-supported')
      expect(route?.decision.parserSupported, fileName).toBe(false)
      expect(route?.status, fileName).toBe('unsupported')
      expect(route?.intakeStatus, fileName).toBe('unsupported')
      expect(route?.extractedCount, fileName).toBe(0)
      expect(extraction, fileName).toBeUndefined()

      const serialized = JSON.stringify({ route, extraction })
      expect(serialized, fileName).not.toContain('20250502')
      expect(serialized, fileName).not.toContain('2023-00-10')
      expect(serialized, fileName).not.toMatch(/Exif|JFIF|motorola|JPEG/i)
      for (const amount of bogusByteDerivedAmounts) {
        expect(serialized, fileName).not.toContain(`"totalAmountMinor":${amount}`)
      }
    }
  }, 60000)
})

async function buildActualJpgReceiptState(fileNames: string[]): Promise<BrowserRuntimeUploadState> {
  const files = fileNames.map((name) => {
    const bytes = readFileSync(join(inputDir, name))
    return {
      name,
      type: 'image/jpeg',
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      }
    }
  })

  return buildBrowserRuntimeStateFromSelectedFiles({
    files,
    month: '2026-04',
    generatedAt: '2026-04-28T20:40:00.000Z'
  })
}
