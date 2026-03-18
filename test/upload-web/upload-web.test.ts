import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import {
  buildBrowserUploadedMonthlyRun,
  buildBrowserExportPackage,
  buildBrowserReviewScreen,
  buildUploadedMonthlyRun,
  buildUploadedBatchPreview,
  buildUploadWebFlow
} from '../../src/upload-web'

describe('buildUploadWebFlow', () => {
  it('renders a browser-visible local upload flow with practical Czech copy', () => {
    const result = buildUploadWebFlow({
      generatedAt: '2026-03-18T20:30:00.000Z'
    })

    expect(result.html).toContain('<!doctype html>')
    expect(result.html).toContain('Hotel Finance Control – nahrání měsíčních souborů')
    expect(result.html).toContain('Připravit soubory ke zpracování')
    expect(result.html).toContain('monthly-batch')
    expect(result.html).toContain('Zatím nebyly vybrány žádné soubory.')
  })

  it('writes the generated upload page to disk when outputPath is provided', () => {
    const outputDir = resolve(process.cwd(), 'dist/test-upload-web')
    const outputPath = resolve(outputDir, 'index.html')
    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildUploadWebFlow({
      generatedAt: '2026-03-18T20:30:00.000Z',
      outputPath
    })

    expect(result.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('Tato verze zůstává čistě lokální a bez backendu')
  })

  it('prepares uploaded files through the shared monthly-batch and review pipeline', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const result = buildUploadedBatchPreview({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:30:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:30:00.000Z'
        }
      ],
      runId: 'upload-preview-run',
      generatedAt: '2026-03-18T20:30:00.000Z'
    })

    expect(result.importedFiles).toHaveLength(2)
    expect(result.importedFiles[0].sourceDocument).toMatchObject({
      sourceSystem: 'booking',
      documentType: 'ota_report',
      fileName: 'booking-payout-2026-03.csv'
    })
    expect(result.importedFiles[1].sourceDocument).toMatchObject({
      sourceSystem: 'bank',
      documentType: 'bank_statement',
      fileName: 'raiffeisen-2026-03.csv'
    })
    expect(result.batch.reconciliation.summary.matchedGroupCount).toBe(1)
    expect(result.batch.files).toHaveLength(2)
    expect(result.review.matched).toHaveLength(1)
  })

  it('renders a browser-visible review screen from the shared uploaded batch preview flow', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const outputDir = resolve(process.cwd(), 'dist/test-browser-review')
    const outputPath = resolve(outputDir, 'index.html')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildBrowserReviewScreen({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:35:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:35:00.000Z'
        }
      ],
      runId: 'browser-review-run',
      generatedAt: '2026-03-18T20:35:00.000Z',
      outputPath
    })

    expect(result.preview.review.matched).toHaveLength(1)
    expect(result.html).toContain('První kontrolní obrazovka měsíčního zpracování')
    expect(result.html).toContain('Spárované položky')
    expect(result.html).toContain('Nespárované položky')
    expect(result.html).toContain('Podezřelé položky')
    expect(result.html).toContain('Chybějící doklady')
    expect(result.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('Kontrola měsíce')
  })

  it('builds practical CSV and XLSX browser export files from the shared uploaded batch preview flow', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const outputDir = resolve(process.cwd(), 'dist/test-browser-export')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildBrowserExportPackage({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:40:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:40:00.000Z'
        }
      ],
      runId: 'browser-export-run',
      generatedAt: '2026-03-18T20:40:00.000Z',
      outputDir
    })

    expect(result.preview.review.matched).toHaveLength(1)
    expect(result.exports.files).toHaveLength(3)
    expect(result.exports.files.map((file) => file.fileName)).toContain('monthly-review-export.xlsx')
    expect(existsSync(resolve(outputDir, 'review-items.csv'))).toBe(true)
  })

  it('runs one real uploaded monthly flow through preparation, review, reporting, and export handoff', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const receipt = getRealInputFixture('receipt-document')

    const result = buildUploadedMonthlyRun({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:45:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:45:00.000Z'
        },
        {
          name: receipt.sourceDocument.fileName,
          content: receipt.rawInput.content,
          uploadedAt: '2026-03-18T20:45:00.000Z'
        }
      ],
      runId: 'uploaded-monthly-run',
      generatedAt: '2026-03-18T20:45:00.000Z'
    })

    expect(result.importedFiles).toHaveLength(3)
    expect(result.batch.files).toHaveLength(3)
    expect(result.report.summary).toEqual(result.batch.report.summary)
    expect(result.review.summary).toEqual(result.batch.reconciliation.summary)
    expect(result.exports.files.map((file) => file.fileName)).toEqual([
      'reconciliation-transactions.csv',
      'review-items.csv',
      'monthly-review-export.xlsx'
    ])
    expect(result.batch.reconciliation.normalizedTransactions.some((transaction) => transaction.id === 'txn:document:receipt-record-1')).toBe(true)
  })

  it('renders one browser-visible uploaded monthly run page and writes it to disk when requested', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const invoice = getRealInputFixture('invoice-document')
    const outputDir = resolve(process.cwd(), 'dist/test-uploaded-monthly-run')
    const outputPath = resolve(outputDir, 'index.html')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const result = buildBrowserUploadedMonthlyRun({
      files: [
        {
          name: booking.sourceDocument.fileName,
          content: booking.rawInput.content,
          uploadedAt: '2026-03-18T20:50:00.000Z'
        },
        {
          name: raiffeisen.sourceDocument.fileName,
          content: raiffeisen.rawInput.content,
          uploadedAt: '2026-03-18T20:50:00.000Z'
        },
        {
          name: invoice.sourceDocument.fileName,
          content: invoice.rawInput.content,
          uploadedAt: '2026-03-18T20:50:00.000Z'
        }
      ],
      runId: 'browser-uploaded-monthly-run',
      generatedAt: '2026-03-18T20:50:00.000Z',
      outputDir,
      outputPath
    })

    expect(result.run.report.transactions.length).toBeGreaterThan(0)
    expect(result.run.exports.files).toHaveLength(3)
    expect(result.html).toContain('Výsledek měsíčního zpracování z nahraných souborů')
    expect(result.html).toContain('Exporty připravené ke stažení')
    expect(result.html).toContain('Trace nahraných souborů')
    expect(result.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('jeden skutečný deterministický běh')
    expect(existsSync(resolve(outputDir, 'monthly-review-export.xlsx'))).toBe(true)
  })
})