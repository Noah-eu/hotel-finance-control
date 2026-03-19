import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { getDemoFixture, type DemoFixture } from '../demo-fixtures'
import { reconcileExtractedRecords } from '../reconciliation'
import { buildReconciliationReport, type ReconciliationReport } from '../reporting'
import {
  buildBrowserUploadedMonthlyRun,
  buildUploadWebFlow,
  type BrowserUploadedMonthlyRunResult
} from '../upload-web'
import { getRealInputFixture } from '../real-input-fixtures'
import { formatAmountMinorCs } from '../shared/money'

export interface BuildWebDemoOptions {
  generatedAt?: string
  outputPath?: string
}

export interface WebDemoResult {
  html: string
  outputPath?: string
  browserRun: BrowserUploadedMonthlyRunResult
}

export interface BuildFixtureWebDemoOptions {
  fixtureKey?: DemoFixture['key']
  generatedAt?: string
  outputPath?: string
}

export interface FixtureWebDemoResult {
  fixture: DemoFixture
  report: ReconciliationReport
  html: string
  outputPath?: string
}

export function buildWebDemo(options: BuildWebDemoOptions = {}): WebDemoResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const booking = getRealInputFixture('booking-payout-export')
  const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
  const invoice = getRealInputFixture('invoice-document')
  const runtimeDemoFiles = [
    {
      name: booking.sourceDocument.fileName,
      content: booking.rawInput.content,
      uploadedAt: generatedAt
    },
    {
      name: raiffeisen.sourceDocument.fileName,
      content: raiffeisen.rawInput.content,
      uploadedAt: generatedAt
    },
    {
      name: invoice.sourceDocument.fileName,
      content: invoice.rawInput.content,
      uploadedAt: generatedAt
    }
  ]

  const browserRun = buildBrowserUploadedMonthlyRun({
    files: runtimeDemoFiles,
    runId: 'web-demo-uploaded-monthly-run',
    generatedAt,
    outputPath: undefined
  })
  const uploadFlow = buildUploadWebFlow({ generatedAt })
  const html = renderOperatorWebDemoHtml({
    generatedAt,
    uploadFlowHtml: uploadFlow.html,
    browserRun,
    outputPath: options.outputPath
  })

  if (options.outputPath) {
    const resolved = resolve(options.outputPath)
    mkdirSync(dirname(resolved), { recursive: true })
    writeFileSync(resolved, html, 'utf8')

    return {
      html,
      outputPath: resolved,
      browserRun
    }
  }

  return {
    html,
    browserRun
  }
}

function renderOperatorWebDemoHtml(input: {
  generatedAt: string
  uploadFlowHtml: string
  browserRun: BrowserUploadedMonthlyRunResult
  outputPath?: string
}): string {
  const reportRows = input.browserRun.run.report.transactions
    .slice(0, 5)
    .map((transaction) => `
      <tr>
        <td><code>${escapeHtml(transaction.transactionId)}</code></td>
        <td>${escapeHtml(transaction.source)}</td>
        <td><span class="amount">${escapeHtml(formatAmountMinorCs(transaction.amountMinor, transaction.currency))}</span></td>
        <td>${escapeHtml(transaction.status)}</td>
      </tr>`)
    .join('')

  const exportItems = input.browserRun.run.exports.files
    .map((file) => `<li><strong>${escapeHtml(file.labelCs)}</strong> — <code>${escapeHtml(file.fileName)}</code></li>`)
    .join('')

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hotel Finance Control – Operátorský měsíční běh</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
        background: #f3f6fb;
        color: #142033;
      }
      main {
        max-width: 1240px;
        margin: 0 auto;
      }
      .hero, .card {
        background: white;
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 10px 35px rgba(20, 32, 51, 0.08);
        margin-bottom: 20px;
      }
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #eaf2ff;
        color: #174ea6;
        font-size: 12px;
        font-weight: 700;
      }
      .summary-grid, .flow-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .metric, .flow-item {
        background: #f7f9fc;
        border-radius: 14px;
        padding: 16px;
      }
      .flow-item strong {
        display: block;
        margin-bottom: 6px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid #e6ebf2;
      }
      .amount {
        font-weight: 700;
      }
      iframe {
        width: 100%;
        min-height: 950px;
        border: 0;
        border-radius: 16px;
        background: #fbfdff;
      }
      code {
        background: #f1f4f8;
        padding: 2px 6px;
        border-radius: 6px;
      }
      ul {
        padding-left: 20px;
      }
      .hint {
        color: #52627a;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="pill">Viditelný operátorský vstup</span>
        <h1>Hotel Finance Control – měsíční workflow pro operátora</h1>
        <p>Hlavní viditelný vstup teď odpovídá reálným možnostem současného browser/runtime režimu: operátor vybírá soubory, spouští sdílený měsíční běh, kontroluje výsledek, čte náhled reportu a předává exporty.</p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(input.generatedAt)}</p>
      </section>

      <section class="card">
        <h2>Sekvence měsíčního běhu</h2>
        <div class="flow-grid">
          <div class="flow-item"><strong>1. Výběr souborů</strong><span class="hint">Skutečné měsíční soubory vybrané v prohlížeči.</span></div>
          <div class="flow-item"><strong>2. Příprava a trasování</strong><span class="hint">Sdílené ID dokumentů, extrahovaných záznamů a souborových zdrojů.</span></div>
          <div class="flow-item"><strong>3. Kontrola operátora</strong><span class="hint">Spárované, nespárované, podezřelé položky a chybějící doklady.</span></div>
          <div class="flow-item"><strong>4. Report a export</strong><span class="hint">Stejný výsledek pro náhled reportu i exportní handoff.</span></div>
        </div>
      </section>

      <section class="card">
        <h2>Souhrn připraveného běhu</h2>
        <div class="summary-grid">
          <div class="metric"><strong>${input.browserRun.run.importedFiles.length}</strong><br />Nahrané soubory</div>
          <div class="metric"><strong>${input.browserRun.run.report.summary.normalizedTransactionCount}</strong><br />Normalizované transakce</div>
          <div class="metric"><strong>${input.browserRun.run.review.summary.exceptionCount}</strong><br />Položky ke kontrole</div>
          <div class="metric"><strong>${input.browserRun.run.exports.files.length}</strong><br />Připravené exporty</div>
        </div>
      </section>

      <section class="card">
        <h2>Krátký náhled reportu</h2>
        <p class="hint">Částky jsou v hlavním vstupu zobrazené jako české koruny tam, kde se operátor rozhoduje nad výsledkem.</p>
        <table>
          <thead>
            <tr>
              <th>Transakce</th>
              <th>Zdroj</th>
              <th>Částka</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>${reportRows}</tbody>
        </table>
      </section>

      <section class="card">
        <h2>Exportní handoff</h2>
        <ul>${exportItems}</ul>
        <p class="hint">Exporty vznikají z téhož sdíleného výsledku jako kontrolní sekce a report.</p>
      </section>

      <section class="card">
        <h2>Interaktivní lokální workflow</h2>
        <p class="hint">Níže je stejná lokální upload obrazovka pro skutečný výběr souborů v prohlížeči. Bez backendu, bez fake persistence a bez paralelního UI modelu.</p>
        <iframe title="Lokální upload workflow" srcdoc=${JSON.stringify(input.uploadFlowHtml)}></iframe>
      </section>
    </main>
  </body>
</html>
`
}

export function buildFixtureWebDemo(options: BuildFixtureWebDemoOptions = {}): FixtureWebDemoResult {
  const fixture = getDemoFixture(options.fixtureKey ?? 'matched-payout')
  const reconciliation = reconcileExtractedRecords(
    { extractedRecords: fixture.extractedRecords },
    fixture.reconciliationContext
  )
  const report = buildReconciliationReport({
    reconciliation,
    generatedAt: options.generatedAt ?? fixture.reconciliationContext.requestedAt
  })
  const html = renderFixtureWebDemoHtml(fixture, report)

  if (options.outputPath) {
    const resolved = resolve(options.outputPath)
    mkdirSync(dirname(resolved), { recursive: true })
    writeFileSync(resolved, html, 'utf8')

    return {
      fixture,
      report,
      html,
      outputPath: resolved
    }
  }

  return { fixture, report, html }
}

export function renderFixtureWebDemoHtml(
  fixture: DemoFixture,
  report: ReconciliationReport
): string {
  const matchItems = report.matches.length === 0
    ? '<li>Žádné položky</li>'
    : report.matches
        .map((match) => `<li><strong>${escapeHtml(match.matchGroupId)}</strong> — ${escapeHtml(match.transactionIds.join(' ↔ '))} — jistota ${match.confidence.toFixed(2)}</li>`)
        .join('')

  const exceptionItems = report.exceptions.length === 0
    ? '<li>Žádné položky</li>'
    : report.exceptions
        .map((exceptionCase) => `<li><strong>${escapeHtml(exceptionCase.exceptionCaseId)}</strong> — ${escapeHtml(exceptionCase.explanation)}</li>`)
        .join('')

  const transactionRows = report.transactions
    .map((transaction) => `
      <tr>
        <td>${escapeHtml(transaction.transactionId)}</td>
        <td>${escapeHtml(transaction.source)}</td>
        <td>${escapeHtml(transaction.direction)}</td>
        <td>${escapeHtml(formatAmountMinorCs(transaction.amountMinor, transaction.currency))}</td>
        <td>${escapeHtml(transaction.currency)}</td>
        <td>${escapeHtml(transaction.bookedAt)}</td>
        <td>${escapeHtml(transaction.status)}</td>
      </tr>`)
    .join('')

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hotel Finance Control – Pomocná ukázka fixture</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
        background: #f3f6fb;
        color: #142033;
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
      }
      .hero, .card {
        background: white;
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 10px 35px rgba(20, 32, 51, 0.08);
        margin-bottom: 20px;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .metric {
        padding: 16px;
        border-radius: 14px;
        background: #f7f9fc;
      }
      h1, h2 {
        margin-top: 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid #e6ebf2;
      }
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #eaf2ff;
        color: #174ea6;
        font-size: 12px;
        font-weight: 600;
      }
      code {
        background: #f1f4f8;
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="pill">Pomocná ukázka fixture</span>
        <h1>Pomocná ukázka párování nad fixture daty</h1>
        <p>${escapeHtml(fixture.description)}</p>
        <p><strong>Fixture:</strong> <code>${escapeHtml(fixture.key)}</code></p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(report.generatedAt)}</p>
      </section>

      <section class="card">
        <h2>Souhrn</h2>
        <div class="summary-grid">
          <div class="metric"><strong>${report.summary.normalizedTransactionCount}</strong><br />Normalizované transakce</div>
          <div class="metric"><strong>${report.summary.matchedGroupCount}</strong><br />Spárované skupiny</div>
          <div class="metric"><strong>${report.summary.exceptionCount}</strong><br />Položky ke kontrole</div>
          <div class="metric"><strong>${report.summary.unmatchedExpectedCount}</strong><br />Nespárované očekávané</div>
          <div class="metric"><strong>${report.summary.unmatchedActualCount}</strong><br />Nespárované skutečné</div>
        </div>
      </section>

      <section class="card">
        <h2>Spárování</h2>
        <ul>${matchItems}</ul>
      </section>

      <section class="card">
        <h2>Výjimky</h2>
        <ul>${exceptionItems}</ul>
      </section>

      <section class="card">
        <h2>Transakce</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Zdroj</th>
              <th>Směr</th>
              <th>Částka</th>
              <th>Měna</th>
              <th>Zaúčtováno</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>${transactionRows}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>
`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
