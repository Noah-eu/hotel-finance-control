import { describe, it, expect } from 'vitest'
import { bootstrap } from '../src/index'

describe('smoke', () => {
  it('bootstrap returns module placeholders', () => {
    const result = bootstrap()
    expect(result).toBeTypeOf('object')
    expect(result.domain).toHaveProperty('name', 'domain')
    expect(result.import).toHaveProperty('name', 'import')
    expect(result.extraction.placeholder()).toEqual({
      name: 'extraction',
      parser: 'deterministic'
    })
    expect(result.extraction.documentIngestionCapabilities()).toEqual({
      mode: 'deterministic-primary',
      ocrFallback: 'not-implemented'
    })
    expect(result).toHaveProperty('extraction.parseBookingPayoutExport')
    expect(result).toHaveProperty('extraction.parseComgateExport')
    expect(result).toHaveProperty('extraction.parseRaiffeisenbankStatement')
    expect(result).toHaveProperty('extraction.parseFioStatement')
    expect(result).toHaveProperty('extraction.parseInvoiceDocument')
    expect(result.normalization).toHaveProperty('name', 'normalization')
    expect(result.exceptions).toHaveProperty('detector', 'baseline')
    expect(result.reporting).toHaveProperty('renderer', 'reconciliation-report')
    expect(result).toHaveProperty('reconciliation.pipeline', 'default')
    expect(result.monthlyBatch.placeholder()).toEqual({
      name: 'monthly-batch',
      mode: 'deterministic'
    })
    expect(result).toHaveProperty('monthlyBatch.runMonthlyReconciliationBatch')
    expect(result.review.placeholder()).toEqual({
      name: 'review',
      surface: 'baseline',
      buildReviewScreen: result.review.buildReviewScreen
    })
    expect(result).toHaveProperty('review.buildReviewScreen')
    expect(result.uploadWeb.placeholder()).toEqual({
      name: 'upload-web',
      mode: 'local-static',
      buildUploadWebFlow: result.uploadWeb.buildUploadWebFlow,
      buildUploadedBatchPreview: result.uploadWeb.buildUploadedBatchPreview,
      buildBrowserReviewScreen: result.uploadWeb.buildBrowserReviewScreen
    })
    expect(result).toHaveProperty('uploadWeb.buildUploadWebFlow')
    expect(result).toHaveProperty('uploadWeb.buildUploadedBatchPreview')
    expect(result).toHaveProperty('uploadWeb.buildBrowserReviewScreen')
    expect(result).toHaveProperty('cliDemo.runCliDemo')
    expect(result).toHaveProperty('webDemo.buildWebDemo')
    expect(result).toHaveProperty('realInputFixtures.getRealInputFixture')
  })
})
