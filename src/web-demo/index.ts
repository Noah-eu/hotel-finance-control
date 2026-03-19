import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { getDemoFixture, type DemoFixture } from '../demo-fixtures'
import { reconcileExtractedRecords } from '../reconciliation'
import { buildReconciliationReport, type ReconciliationReport } from '../reporting'
import {
  emitBrowserRuntimeAssets,
  renderBrowserRuntimeClientBootstrap,
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
    emitBrowserRuntimeAssets(resolved)

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
  const runtimeAssetPath = input.outputPath
    ? `./${basename(resolve(dirname(input.outputPath), 'browser-runtime.js'))}`
    : './browser-runtime.js'

  const preparedFiles = input.browserRun.run.importedFiles
    .map((file) => `<li><strong>${escapeHtml(file.sourceDocument.fileName)}</strong><br /><span class="hint">${escapeHtml(file.sourceDocument.sourceSystem)} / ${escapeHtml(file.sourceDocument.documentType)}</span><br /><code>${escapeHtml(file.sourceDocument.id)}</code></li>`)
    .join('')

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

  const reviewSummaryItems = [
    ['Spárované položky', input.browserRun.run.review.matched.length],
    ['Nespárované položky', input.browserRun.run.review.unmatched.length],
    ['Podezřelé položky', input.browserRun.run.review.suspicious.length],
    ['Chybějící doklady', input.browserRun.run.review.missingDocuments.length]
  ]
    .map(([label, count]) => `<li><strong>${escapeHtml(String(label))}:</strong> ${escapeHtml(String(count))}</li>`)
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
      .input-grid, .operator-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
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
      label {
        display: block;
        margin-bottom: 8px;
        font-weight: 700;
      }
      input[type="file"],
      input[type="month"] {
        width: 100%;
      }
      button {
        border: 0;
        border-radius: 12px;
        background: #174ea6;
        color: white;
        font-size: 15px;
        font-weight: 700;
        padding: 12px 18px;
        cursor: pointer;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid #e6ebf2;
      }
      .amount {
        font-weight: 700;
      }
      .operator-panel {
        border: 1px solid #dce6f5;
        border-radius: 14px;
        padding: 16px;
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
      .runtime-output {
        margin-top: 16px;
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
        <h2>Praktické spuštění měsíčního workflow</h2>
        <div class="input-grid">
          <div>
            <label for="monthly-files">Soubory k nahrání</label>
            <input id="monthly-files" type="file" multiple />
            <p class="hint">Vyberte bankovní výpisy, OTA exporty, platební brány, faktury a účtenky za jeden měsíc.</p>
          </div>
          <div>
            <label for="month-label">Označení měsíce</label>
            <input id="month-label" type="month" />
            <p class="hint">Např. <code>2026-03</code> pro březen 2026.</p>
          </div>
        </div>
        <p>
          <button id="prepare-upload" type="button">Spustit přípravu a měsíční workflow</button>
        </p>
        <div id="runtime-output" class="operator-panel runtime-output">
          <p class="hint">Měsíční workflow čeká na skutečně vybrané soubory a měsíc operátora.</p>
        </div>
        <div class="operator-panel">
          <h3>Aktuální testovatelný stav v prohlížeči</h3>
          <p class="hint">Tlačítko spouští stejný browser-only sdílený tok jako v <code>src/upload-web</code>: přípravu souborů, runtime stav, kontrolu, report a exportní handoff. Bez backendu a bez fake persistence.</p>
          <div class="summary-grid">
            <div class="metric"><strong>${input.browserRun.run.importedFiles.length}</strong><br />Ukázkové nahrané soubory</div>
            <div class="metric"><strong>${input.browserRun.run.report.summary.normalizedTransactionCount}</strong><br />Normalizované transakce</div>
            <div class="metric"><strong>${input.browserRun.run.review.summary.exceptionCount}</strong><br />Položky ke kontrole</div>
            <div class="metric"><strong>${input.browserRun.run.exports.files.length}</strong><br />Připravené exporty</div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Příprava, kontrola a report v jednom pohledu</h2>
        <div class="operator-grid">
          <section class="metric">
            <h3>Připravené soubory a trasování</h3>
            <ul>${preparedFiles}</ul>
          </section>
          <section class="metric">
            <h3>Kontrolní přehled</h3>
            <ul>${reviewSummaryItems}</ul>
            <p class="hint">Viditelný přehled vychází z téhož sdíleného výsledku jako detailní review a reporting.</p>
          </section>
        </div>
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
        <p class="hint">Sdílený lokální upload workflow zůstává součástí této stránky přímo v hlavním vstupu, ne jako oddělený demo list.</p>
      </section>
    </main>
    <script>
      ${renderBrowserRuntimeClientBootstrap(runtimeAssetPath)}

      const fileInput = document.getElementById('monthly-files');
      const monthInput = document.getElementById('month-label');
      const button = document.getElementById('prepare-upload');
      const runtimeOutput = document.getElementById('runtime-output');
      const generatedAt = ${JSON.stringify(input.generatedAt)};
      let browserRuntime;

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function renderMainRuntimeState(state) {
        const preparedFiles = state.preparedFiles.length === 0
          ? '<li>Žádné připravené soubory.</li>'
          : state.preparedFiles.map((file) => '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">' + escapeHtml(file.sourceSystem) + ' / ' + escapeHtml(file.documentType) + '</span><br /><code>' + escapeHtml(file.sourceDocumentId) + '</code></li>').join('');

        const exports = state.exportFiles.length === 0
          ? '<li>Žádné exporty.</li>'
          : state.exportFiles.map((file) => '<li><strong>' + escapeHtml(file.labelCs) + '</strong> — <code>' + escapeHtml(file.fileName) + '</code></li>').join('');

        return [
          '<h3>Výsledek spuštěného browser workflow</h3>',
          '<p><strong>Měsíc:</strong> ' + escapeHtml(state.monthLabel) + '</p>',
          '<p><strong>Run ID:</strong> <code>' + escapeHtml(state.runId) + '</code></p>',
          '<ul>' + preparedFiles + '</ul>',
          '<p class="hint">Kontrola: ' + state.reviewSummary.exceptionCount + ' položek ke kontrole, exporty: ' + state.exportFiles.length + '.</p>',
          '<ul>' + exports + '</ul>'
        ].join('');
      }

      async function startMainWorkflow() {
        const files = Array.from(fileInput.files || []);
        runtimeOutput.innerHTML = '<p class="hint">Spouštím browser/local workflow nad právě zvolenými soubory…</p>';

        if (files.length === 0) {
          runtimeOutput.innerHTML = '<p class="hint">Nejprve vyberte alespoň jeden soubor.</p>';
          return;
        }

        if (!browserRuntime && typeof window.__hotelFinanceCreateBrowserRuntime === 'function') {
          browserRuntime = window.__hotelFinanceCreateBrowserRuntime();
        }

        if (!browserRuntime) {
          runtimeOutput.innerHTML = '<p class="hint">Sdílený browser runtime se ještě načítá. Zkuste akci za okamžik znovu.</p>';
          return;
        }

        const state = await browserRuntime.buildRuntimeState({
          files,
          month: monthInput.value,
          generatedAt
        });

        runtimeOutput.innerHTML = renderMainRuntimeState(state);
      }

      button.addEventListener('click', () => {
        void startMainWorkflow();
      });
    </script>
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
