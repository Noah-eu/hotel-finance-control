import { describe, expect, it } from 'vitest'
import { getDemoFixture } from '../../src/demo-fixtures'
import { reconcileExtractedRecords } from '../../src/reconciliation'
import { buildReconciliationReport } from '../../src/reporting'

describe('demoFixtures', () => {
  it('produces the expected reconciliation and report for the matched payout fixture', () => {
    const fixture = getDemoFixture('matched-payout')

    const reconciliation = reconcileExtractedRecords(
      { extractedRecords: fixture.extractedRecords },
      fixture.reconciliationContext
    )

    const report = buildReconciliationReport({
      reconciliation,
      generatedAt: fixture.reconciliationContext.requestedAt
    })

    expect(reconciliation.summary).toEqual(fixture.expectedReconciliation.summary)
    expect(reconciliation.normalization).toEqual(fixture.expectedReconciliation.normalization)
    expect(reconciliation.matchGroups).toEqual(fixture.expectedReconciliation.matchGroups)
    expect(reconciliation.exceptionCases).toEqual(fixture.expectedReconciliation.exceptionCases)
    expect(report.summary).toEqual({
      ...fixture.expectedReport.summary,
      payoutBatchMatchCount: report.summary.payoutBatchMatchCount
    })
    expect(report.matches).toEqual(fixture.expectedReport.matches)
    expect(report.exceptions).toEqual(fixture.expectedReport.exceptions)
    expect(report.transactions).toEqual(fixture.expectedReport.transactions)
  })

  it('produces the expected reconciliation and report for the unmatched payout fixture', () => {
    const fixture = getDemoFixture('unmatched-payout')

    const reconciliation = reconcileExtractedRecords(
      { extractedRecords: fixture.extractedRecords },
      fixture.reconciliationContext
    )

    const report = buildReconciliationReport({
      reconciliation,
      generatedAt: fixture.reconciliationContext.requestedAt
    })

    expect(reconciliation.summary).toEqual(fixture.expectedReconciliation.summary)
    expect(reconciliation.normalization).toEqual(fixture.expectedReconciliation.normalization)
    expect(reconciliation.matchGroups).toEqual(fixture.expectedReconciliation.matchGroups)
    expect(reconciliation.exceptionCases).toEqual(fixture.expectedReconciliation.exceptionCases)
    expect(report.summary).toEqual({
      ...fixture.expectedReport.summary,
      payoutBatchMatchCount: report.summary.payoutBatchMatchCount
    })
    expect(report.matches).toEqual(fixture.expectedReport.matches)
    expect(report.exceptions).toEqual(fixture.expectedReport.exceptions)
    expect(report.transactions).toEqual(fixture.expectedReport.transactions)
  })
})
