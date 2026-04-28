import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildBrowserRuntimeStateFromSelectedFiles,
  prepareBrowserRuntimeUploadedFilesFromSelectedFiles
} from '../../../src/upload-web'
import expectedValues from './expected-document-values.json'

interface ExpectedDocumentValues {
  fileName: string
  documentKind: string
  expectedSupplier?: string
  expectedDocumentNumber?: string
  expectedReference?: string
  expectedIssueDate?: string
  expectedDueDate?: string
  expectedPaymentDate?: string
  expectedTotalAmountMinor?: number
  expectedVatAmountMinor?: number
  expectedVatBaseAmountMinor?: number
  expectedCurrency?: string
  expectedPaymentMethod?: string
}

interface AuditEntry {
  fileName: string
  sourceDocumentId?: string
  parserId?: string
  runtimeClassifierPath?: string
  runtimeIngestionBranch?: string
  expectedSupplier?: string
  actualSupplier?: string
  expectedDocumentNumber?: string
  actualDocumentNumber?: string
  expectedReference?: string
  actualReference?: string
  expectedAmount?: number
  actualAmount?: number
  expectedIssueDate?: string
  actualIssueDate?: string
  mismatchTypes: string[]
  firstDivergenceLayer: 'browser_intake' | 'pdf_text_layer' | 'invoice_parser' | 'document_extractions' | 'effective_values' | 'review_render'
  textExtractionStatus?: string
  sourceDocumentType?: string
  rawTextSnippet?: string
}

const root = new URL('../../..', import.meta.url).pathname
const actualDocumentRoot = join(root, 'test/actual-documents/2026-04')
const inputDir = join(actualDocumentRoot, 'input')
const generatedAt = '2026-04-28T10:00:00.000Z'
const manifest = expectedValues as ExpectedDocumentValues[]
const manifestByFileName = new Map(manifest.map((entry) => [entry.fileName, entry]))

const files = readdirSync(inputDir)
  .filter((fileName) => /\.pdf$/i.test(fileName))
  .sort((left, right) => left.localeCompare(right))
  .map((fileName) => {
    const bytes = readFileSync(join(inputDir, fileName))

    return {
      name: fileName,
      type: 'application/pdf',
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      }
    }
  })

const preparedFiles = await prepareBrowserRuntimeUploadedFilesFromSelectedFiles({
  files,
  generatedAt
})
const state = await buildBrowserRuntimeStateFromSelectedFiles({
  files,
  month: '2026-04',
  generatedAt
})

const audit: AuditEntry[] = files.map((file) => {
  const expected = manifestByFileName.get(file.name)
  const prepared = preparedFiles.find((item) => item.name === file.name)
  const route = state.fileRoutes.find((item) => item.fileName === file.name)
  const extraction = state.documentExtractions.find((entry) => entry.fileName === file.name)
  const values = extraction?.effectiveValues ?? {}
  const rawData = extraction?.rawAutoData?.extractedRecordData
  const summary = extraction?.rawAutoData?.documentExtractionSummary
  const actualSupplier = values.supplierName
  const actualDocumentNumber = values.documentNumber
  const actualReference = optionalString(rawData?.variableSymbol)
    ?? optionalString(summary?.variableSymbol)
    ?? optionalString(rawData?.referenceNumber)
    ?? optionalString(extraction?.rawAutoData?.rawReference)
    ?? actualDocumentNumber
  const actualIssueDate = values.issueDate
  const actualAmount = values.totalAmountMinor
  const mismatchTypes = collectMismatchTypes(expected, {
    actualSupplier,
    actualDocumentNumber,
    actualReference,
    actualIssueDate,
    actualAmount,
    actualCurrency: values.currency
  })

  if (!expected) {
    mismatchTypes.push('missing_expected_manifest')
  }

  return {
    fileName: file.name,
    sourceDocumentId: route?.sourceDocumentId ?? extraction?.sourceDocumentId,
    parserId: route?.parserId,
    runtimeClassifierPath: route?.decision?.matchedRules?.join(' > '),
    runtimeIngestionBranch: route?.decision?.ingestionBranch,
    expectedSupplier: expected?.expectedSupplier,
    actualSupplier,
    expectedDocumentNumber: expected?.expectedDocumentNumber,
    actualDocumentNumber,
    expectedReference: expected?.expectedReference,
    actualReference,
    expectedAmount: expected?.expectedTotalAmountMinor,
    actualAmount,
    expectedIssueDate: expected?.expectedIssueDate ?? expected?.expectedPaymentDate,
    actualIssueDate,
    mismatchTypes,
    firstDivergenceLayer: resolveFirstDivergenceLayer({
      expected,
      prepared,
      route,
      extraction,
      mismatchTypes
    }),
    textExtractionStatus: prepared?.sourceDescriptor?.browserTextExtraction?.status,
    sourceDocumentType: route?.documentType,
    rawTextSnippet: prepared?.content?.slice(0, 600)
  }
})

writeFileSync(
  join(actualDocumentRoot, 'document-extraction-audit.json'),
  `${JSON.stringify({
    generatedAt,
    scope: 'pre-fix current runtime extraction audit for actual 2026-04 document input',
    entries: audit
  }, null, 2)}\n`
)

writeFileSync(
  join(actualDocumentRoot, 'document-extraction-audit.md'),
  buildMarkdownAudit(audit)
)

function collectMismatchTypes(
  expected: ExpectedDocumentValues | undefined,
  actual: {
    actualSupplier?: string
    actualDocumentNumber?: string
    actualReference?: string
    actualIssueDate?: string
    actualAmount?: number
    actualCurrency?: string
  }
): string[] {
  if (!expected) {
    return []
  }

  const mismatches: string[] = []

  if (expected.expectedSupplier && expected.expectedSupplier !== actual.actualSupplier) {
    mismatches.push('supplier_mismatch')
  }

  if (expected.expectedDocumentNumber && expected.expectedDocumentNumber !== actual.actualDocumentNumber) {
    mismatches.push('document_number_mismatch')
  }

  if (expected.expectedReference && expected.expectedReference !== actual.actualReference) {
    mismatches.push('reference_mismatch')
  }

  const expectedDate = expected.expectedIssueDate ?? expected.expectedPaymentDate
  if (expectedDate && expectedDate !== actual.actualIssueDate) {
    mismatches.push('issue_date_mismatch')
  }

  if (typeof expected.expectedTotalAmountMinor === 'number' && expected.expectedTotalAmountMinor !== actual.actualAmount) {
    mismatches.push('amount_mismatch')
  }

  if (expected.expectedCurrency && expected.expectedCurrency !== actual.actualCurrency) {
    mismatches.push('currency_mismatch')
  }

  return mismatches
}

function resolveFirstDivergenceLayer(input: {
  expected?: ExpectedDocumentValues
  prepared?: (typeof preparedFiles)[number]
  route?: (typeof state.fileRoutes)[number]
  extraction?: (typeof state.documentExtractions)[number]
  mismatchTypes: string[]
}): AuditEntry['firstDivergenceLayer'] {
  if (!input.expected || !input.route || input.route.intakeStatus === 'error' || input.route.status === 'unsupported') {
    return 'browser_intake'
  }

  if (input.prepared?.sourceDescriptor?.browserTextExtraction?.status !== 'extracted') {
    return 'pdf_text_layer'
  }

  if (!input.extraction || !input.extraction.rawAutoData?.extractedRecordData) {
    return 'invoice_parser'
  }

  if (input.mismatchTypes.length > 0) {
    return 'invoice_parser'
  }

  return 'review_render'
}

function buildMarkdownAudit(entries: AuditEntry[]): string {
  const lines = [
    '# Document extraction audit',
    '',
    'Scope: pre-fix current runtime extraction audit for `test/actual-documents/2026-04/input`.',
    '',
    '| fileName | parserId | branch | expected supplier | actual supplier | expected document | actual document | expected reference | actual reference | expected amount | actual amount | expected issue date | actual issue date | mismatch types | first divergence |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |'
  ]

  for (const entry of entries) {
    lines.push([
      entry.fileName,
      entry.parserId ?? '',
      entry.runtimeIngestionBranch ?? '',
      entry.expectedSupplier ?? '',
      entry.actualSupplier ?? '',
      entry.expectedDocumentNumber ?? '',
      entry.actualDocumentNumber ?? '',
      entry.expectedReference ?? '',
      entry.actualReference ?? '',
      String(entry.expectedAmount ?? ''),
      String(entry.actualAmount ?? ''),
      entry.expectedIssueDate ?? '',
      entry.actualIssueDate ?? '',
      entry.mismatchTypes.join(', '),
      entry.firstDivergenceLayer
    ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }

  lines.push('')
  return `${lines.join('\n')}\n`
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
