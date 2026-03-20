import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { buildExportArtifacts } from '../../src/export'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import { runMonthlyReconciliationBatch } from '../../src/monthly-batch'
import { buildReviewScreen } from '../../src/review'

describe('buildExportArtifacts', () => {
  it('builds practical CSV and XLSX exports from shared monthly batch and review outputs', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')

    const batch = runMonthlyReconciliationBatch({
      files: [booking, raiffeisen].map((fixture) => ({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content
      })),
      reconciliationContext: {
        runId: 'export-run-1',
        requestedAt: '2026-03-18T21:00:00.000Z'
      },
      reportGeneratedAt: '2026-03-18T21:01:00.000Z'
    })

    const review = buildReviewScreen({
      batch,
      generatedAt: '2026-03-18T21:02:00.000Z'
    })

    const result = buildExportArtifacts({ batch, review })

    expect(result.files.map((file) => file.fileName)).toEqual([
      'reconciliation-transactions.csv',
      'review-items.csv',
      'monthly-review-export.xlsx'
    ])

    const transactionsCsv = result.files[0]
    expect(typeof transactionsCsv.content).toBe('string')
    expect(String(transactionsCsv.content)).toContain('ID transakce')
    expect(String(transactionsCsv.content)).toContain('txn:payout:booking-payout-1')
    expect(String(transactionsCsv.content)).toContain('Částka')
    expect(String(transactionsCsv.content)).toContain('1 250,00 Kč')

    const workbookFile = result.files[2]
    const workbook = XLSX.read(Buffer.from(workbookFile.content as Uint8Array), { type: 'buffer' })
    expect(workbook.SheetNames).toEqual(['Transakce', 'Kontrola', 'Payout dávky', 'Souhrn'])
    expect(workbook.Sheets.Transakce.A1.v).toBe('ID transakce')
    expect(workbook.Sheets.Transakce.D1.v).toBe('Částka')
    expect(workbook.Sheets.Transakce.D2.v).toBe('1 250,00 Kč')
    expect(workbook.Sheets['Payout dávky'].A1.v).toBe('Platforma')
    expect(workbook.Sheets.Souhrn.D1.v).toBe('Nespárované payout dávky')
  })

  it('includes unmatched payout batches in review csv and payout workbook sheet with business-facing reason', () => {
    const booking = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const batch = runMonthlyReconciliationBatch({
      files: [
        {
          sourceDocument: {
            id: 'uploaded:bank:1:pohyby-5599955956-202603191023-csv' as never,
            sourceSystem: 'bank',
            documentType: 'bank_statement',
            fileName: 'Pohyby_5599955956_202603191023.csv',
            uploadedAt: '2026-03-20T11:35:00.000Z'
          },
          content: [
            '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
            '19.03.2026 06:20;19.03.2026 06:23;5599955956/5500;000000-1234567890/0100;Comgate a.s.;1540,00;CZK;Platba rezervace WEB-2001'
          ].join('\n')
        },
        {
          sourceDocument: booking.sourceDocument,
          content: booking.rawInput.content
        }
      ],
      reconciliationContext: {
        runId: 'export-unmatched-payout-batch',
        requestedAt: '2026-03-20T11:35:00.000Z'
      },
      reportGeneratedAt: '2026-03-20T11:35:00.000Z'
    })

    const review = buildReviewScreen({
      batch,
      generatedAt: '2026-03-20T11:35:00.000Z'
    })

    const result = buildExportArtifacts({ batch, review })
    const reviewCsv = String(result.files[1]?.content)
    const workbook = XLSX.read(Buffer.from(result.files[2]?.content as Uint8Array), { type: 'buffer' })

    expect(review.payoutBatchUnmatched).toHaveLength(1)
    expect(reviewCsv).toContain('Booking payout dávka PAYOUT-BOOK-20260310')
    expect(reviewCsv).toContain('Žádná bankovní položka se stejnou částkou.')
    expect(reviewCsv).not.toContain('noExactAmount')
    expect(workbook.Sheets['Payout dávky'].G3?.v ?? workbook.Sheets['Payout dávky'].G2?.v).toBe('Nespárováno')
  })

  it('writes actual CSV and XLSX files to disk when outputDir is provided', () => {
    const booking = getRealInputFixture('booking-payout-export')
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const outputDir = resolve(process.cwd(), 'dist/test-export')

    rmSync(outputDir, {
      recursive: true,
      force: true
    })

    const batch = runMonthlyReconciliationBatch({
      files: [booking, raiffeisen].map((fixture) => ({
        sourceDocument: fixture.sourceDocument,
        content: fixture.rawInput.content
      })),
      reconciliationContext: {
        runId: 'export-run-2',
        requestedAt: '2026-03-18T21:10:00.000Z'
      },
      reportGeneratedAt: '2026-03-18T21:11:00.000Z'
    })

    const review = buildReviewScreen({
      batch,
      generatedAt: '2026-03-18T21:12:00.000Z'
    })

    const result = buildExportArtifacts({
      batch,
      review,
      outputDir
    })

    const paths = result.files.map((file) => file.outputPath)
    expect(paths.every((path) => path && existsSync(path))).toBe(true)
    expect(readFileSync(resolve(outputDir, 'reconciliation-transactions.csv'), 'utf8')).toContain('Zdrojové dokumenty')
    expect(readFileSync(resolve(outputDir, 'reconciliation-transactions.csv'), 'utf8')).toContain('1 250,00 Kč')
    expect(readFileSync(resolve(outputDir, 'review-items.csv'), 'utf8')).toContain('Chybějící doklady')
    expect(readFileSync(resolve(outputDir, 'monthly-review-export.xlsx')).subarray(0, 2).toString()).toBe('PK')
  })
})