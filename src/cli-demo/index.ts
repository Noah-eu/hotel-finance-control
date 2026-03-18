import { getDemoFixture, type DemoFixture } from '../demo-fixtures'
import { reconcileExtractedRecords } from '../reconciliation'
import { buildReconciliationReport, type ReconciliationReport } from '../reporting'

export interface RunCliDemoOptions {
  fixtureKey?: DemoFixture['key']
  generatedAt?: string
}

export interface CliDemoResult {
  fixture: DemoFixture
  report: ReconciliationReport
  output: string
}

export function runCliDemo(options: RunCliDemoOptions = {}): CliDemoResult {
  const fixture = getDemoFixture(options.fixtureKey ?? 'matched-payout')
  const reconciliation = reconcileExtractedRecords(
    { extractedRecords: fixture.extractedRecords },
    fixture.reconciliationContext
  )
  const report = buildReconciliationReport({
    reconciliation,
    generatedAt: options.generatedAt ?? fixture.reconciliationContext.requestedAt
  })

  return {
    fixture,
    report,
    output: formatCliReport(fixture, report)
  }
}

export function formatCliReport(
  fixture: DemoFixture,
  report: ReconciliationReport
): string {
  const lines: string[] = [
    'Hotel Finance Reconciliation Demo',
    `Fixture: ${fixture.key}`,
    `Description: ${fixture.description}`,
    `Generated at: ${report.generatedAt}`,
    '',
    'Summary',
    `- normalized transactions: ${report.summary.normalizedTransactionCount}`,
    `- matched groups: ${report.summary.matchedGroupCount}`,
    `- exception cases: ${report.summary.exceptionCount}`,
    `- unmatched expected: ${report.summary.unmatchedExpectedCount}`,
    `- unmatched actual: ${report.summary.unmatchedActualCount}`,
    '',
    'Matches'
  ]

  if (report.matches.length === 0) {
    lines.push('- none')
  } else {
    for (const match of report.matches) {
      lines.push(
        `- ${match.matchGroupId}: ${match.transactionIds.join(' <-> ')} | confidence ${match.confidence.toFixed(2)} | ${match.ruleKey}`
      )
    }
  }

  lines.push('', 'Exceptions')

  if (report.exceptions.length === 0) {
    lines.push('- none')
  } else {
    for (const exceptionCase of report.exceptions) {
      lines.push(
        `- ${exceptionCase.exceptionCaseId}: ${exceptionCase.type} (${exceptionCase.severity}) -> ${exceptionCase.explanation}`
      )
    }
  }

  lines.push('', 'Transactions')

  for (const transaction of report.transactions) {
    lines.push(
      `- ${transaction.transactionId}: ${transaction.source} ${transaction.direction} ${transaction.amountMinor} ${transaction.currency} on ${transaction.bookedAt} [${transaction.status}]`
    )
  }

  return `${lines.join('\n')}\n`
}
