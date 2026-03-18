import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as XLSX from 'xlsx'
import type { MonthlyBatchResult } from '../monthly-batch'
import type { ReviewScreenData } from '../review'

export interface ExportArtifactsInput {
  batch: MonthlyBatchResult
  review: ReviewScreenData
  outputDir?: string
}

export interface ExportFileArtifact {
  kind: 'csv' | 'xlsx'
  labelCs: string
  fileName: string
  content: string | Uint8Array
  outputPath?: string
}

export interface ExportArtifactsResult {
  files: ExportFileArtifact[]
}

export function buildExportArtifacts(input: ExportArtifactsInput): ExportArtifactsResult {
  const files: ExportFileArtifact[] = [
    buildReconciliationTransactionsCsv(input.batch),
    buildReviewItemsCsv(input.review),
    buildWorkbookArtifact(input.batch, input.review)
  ]

  if (input.outputDir) {
    const outputDir = resolve(input.outputDir)
    mkdirSync(outputDir, { recursive: true })

    for (const file of files) {
      const outputPath = resolve(outputDir, file.fileName)
      mkdirSync(dirname(outputPath), { recursive: true })

      if (typeof file.content === 'string') {
        writeFileSync(outputPath, file.content, 'utf8')
      } else {
        writeFileSync(outputPath, Buffer.from(file.content))
      }

      file.outputPath = outputPath
    }
  }

  return { files }
}

export function placeholder() {
  return {
    name: 'export',
    formats: ['csv', 'xlsx'],
    buildExportArtifacts
  }
}

function buildReconciliationTransactionsCsv(batch: MonthlyBatchResult): ExportFileArtifact {
  const headers = [
    'ID transakce',
    'Zdroj',
    'Směr',
    'Částka v haléřích',
    'Měna',
    'Datum zaúčtování',
    'Reference',
    'Stav',
    'Zdrojové dokumenty',
    'Extrahované záznamy'
  ]

  const rows = batch.reconciliation.normalizedTransactions.map((transaction) => {
    const reportRow = batch.report.transactions.find((item) => item.transactionId === transaction.id)
    return [
      transaction.id,
      transaction.source,
      transaction.direction,
      String(transaction.amountMinor),
      transaction.currency,
      transaction.bookedAt,
      transaction.reference ?? '',
      reportRow?.status ?? '',
      transaction.sourceDocumentIds.join('|'),
      transaction.extractedRecordIds.join('|')
    ]
  })

  return {
    kind: 'csv',
    labelCs: 'Export transakcí a párování',
    fileName: 'reconciliation-transactions.csv',
    content: toCsv([headers, ...rows])
  }
}

function buildReviewItemsCsv(review: ReviewScreenData): ExportFileArtifact {
  const headers = [
    'Sekce',
    'ID',
    'Titulek',
    'Detail',
    'Závažnost',
    'Transakce',
    'Zdrojové dokumenty'
  ]

  const items = [
    ...review.matched,
    ...review.unmatched,
    ...review.suspicious,
    ...review.missingDocuments
  ]

  const rows = items.map((item) => [
    toSectionLabel(item.kind),
    item.id,
    item.title,
    item.detail,
    item.severity ?? '',
    item.transactionIds.join('|'),
    item.sourceDocumentIds.join('|')
  ])

  return {
    kind: 'csv',
    labelCs: 'Export kontrolních položek',
    fileName: 'review-items.csv',
    content: toCsv([headers, ...rows])
  }
}

function buildWorkbookArtifact(batch: MonthlyBatchResult, review: ReviewScreenData): ExportFileArtifact {
  const workbook = XLSX.utils.book_new()

  const transactionsSheet = XLSX.utils.json_to_sheet(
    batch.reconciliation.normalizedTransactions.map((transaction) => ({
      'ID transakce': transaction.id,
      Zdroj: transaction.source,
      Směr: transaction.direction,
      'Částka v haléřích': transaction.amountMinor,
      Měna: transaction.currency,
      'Datum zaúčtování': transaction.bookedAt,
      Reference: transaction.reference ?? '',
      'Zdrojové dokumenty': transaction.sourceDocumentIds.join('|'),
      'Extrahované záznamy': transaction.extractedRecordIds.join('|')
    }))
  )

  const reviewSheet = XLSX.utils.json_to_sheet(
    [...review.matched, ...review.unmatched, ...review.suspicious, ...review.missingDocuments].map((item) => ({
      Sekce: toSectionLabel(item.kind),
      ID: item.id,
      Titulek: item.title,
      Detail: item.detail,
      Závažnost: item.severity ?? '',
      Transakce: item.transactionIds.join('|'),
      'Zdrojové dokumenty': item.sourceDocumentIds.join('|')
    }))
  )

  const summarySheet = XLSX.utils.json_to_sheet([
    {
      'Normalizované transakce': batch.reconciliation.summary.normalizedTransactionCount,
      'Spárované skupiny': batch.reconciliation.summary.matchedGroupCount,
      'Položky ke kontrole': batch.reconciliation.summary.exceptionCount,
      'Nespárované očekávané': batch.reconciliation.summary.unmatchedExpectedCount,
      'Nespárované skutečné': batch.reconciliation.summary.unmatchedActualCount
    }
  ])

  XLSX.utils.book_append_sheet(workbook, transactionsSheet, 'Transakce')
  XLSX.utils.book_append_sheet(workbook, reviewSheet, 'Kontrola')
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Souhrn')

  const content = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as Uint8Array

  return {
    kind: 'xlsx',
    labelCs: 'Excel export měsíční kontroly',
    fileName: 'monthly-review-export.xlsx',
    content
  }
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
}

function escapeCsv(value: string): string {
  const escaped = value.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function toSectionLabel(kind: ReviewScreenData['matched'][number]['kind']): string {
  switch (kind) {
    case 'matched':
      return 'Spárované položky'
    case 'unmatched':
      return 'Nespárované položky'
    case 'suspicious':
      return 'Podezřelé položky'
    case 'missing-document':
      return 'Chybějící doklady'
  }
}