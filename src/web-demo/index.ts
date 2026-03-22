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
  debugMode?: boolean
}

export interface WebDemoResult {
  html: string
  outputPath?: string
  runtimeAssetPath?: string
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

const WEB_DEMO_RENDERER_MARKER = 'web-demo-operator-v3'

export async function buildWebDemo(options: BuildWebDemoOptions = {}): Promise<WebDemoResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const runtimeDemoFiles = [
    {
      name: 'airbnb.csv',
      content: buildActualUploadedAirbnbContent(),
      uploadedAt: generatedAt
    },
    {
      name: 'Pohyby_5599955956_202603191023.csv',
      content: buildActualUploadedRbCitiContent(),
      uploadedAt: generatedAt
    }
  ]

  const browserRun = buildBrowserUploadedMonthlyRun({
    files: runtimeDemoFiles,
    runId: 'browser-runtime-upload-2026-03',
    generatedAt,
    outputPath: undefined
  })
  const uploadFlow = buildUploadWebFlow({ generatedAt })
  if (options.outputPath) {
    const resolved = resolve(options.outputPath)
    mkdirSync(dirname(resolved), { recursive: true })
    const [runtimeAssetPath] = await emitBrowserRuntimeAssets(resolved)
    const html = renderOperatorWebDemoHtml({
      generatedAt,
      uploadFlowHtml: uploadFlow.html,
      browserRun,
      runtimeAssetPath
    })
    writeFileSync(resolved, html, 'utf8')

    return {
      html,
      outputPath: resolved,
      runtimeAssetPath,
      browserRun
    }
  }

  const html = renderOperatorWebDemoHtml({
    generatedAt,
    uploadFlowHtml: uploadFlow.html,
    browserRun,
    runtimeAssetPath: './browser-runtime.js',
    debugMode: options.debugMode ?? false
  })

  return {
    html,
    browserRun
  }
}

function renderOperatorWebDemoHtml(input: {
  generatedAt: string
  uploadFlowHtml: string
  browserRun: BrowserUploadedMonthlyRunResult
  runtimeAssetPath: string
  debugMode?: boolean
}): string {
  const buildFingerprintVersion = input.runtimeAssetPath.replace(/^\.\//, '').replace(/\.js$/, '')
  const initialPayoutMatchedCount = input.browserRun.run.review.payoutBatchMatched.length
  const initialPayoutUnmatchedCount = input.browserRun.run.review.payoutBatchUnmatched.length
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
    ['Spárované Airbnb / OTA payout dávky', input.browserRun.run.review.payoutBatchMatched.length],
    ['Nespárované payout dávky', input.browserRun.run.review.payoutBatchUnmatched.length],
    ['Nespárované rezervace k úhradě', input.browserRun.run.review.unmatchedReservationSettlements.length],
    ['Podezřelé položky', input.browserRun.run.review.suspicious.length],
    ['Chybějící doklady', input.browserRun.run.review.missingDocuments.length]
  ]
    .map(([label, count]) => `<li><strong>${escapeHtml(String(label))}:</strong> ${escapeHtml(String(count))}</li>`)
    .join('')

  const exportItems = input.browserRun.run.exports.files
    .map((file) => `<li><strong>${escapeHtml(file.labelCs)}</strong> — <code>${escapeHtml(file.fileName)}</code></li>`)
    .join('')
  const buildExtractedRecordsMarkupFunction = input.debugMode
    ? buildDebugExtractedRecordsMarkupFunctionSource()
    : buildDefaultExtractedRecordsMarkupFunctionSource()

  const initialRuntimeState = {
    debugMode: Boolean(input.debugMode),
    generatedAt: input.generatedAt,
    runId: 'browser-runtime-upload-2026-03',
    monthLabel: 'ukázkový snapshot',
    preparedFiles: input.browserRun.run.importedFiles.map((file) => ({
      fileName: file.sourceDocument.fileName,
      sourceDocumentId: file.sourceDocument.id,
      sourceSystem: file.sourceDocument.sourceSystem,
      documentType: file.sourceDocument.documentType
    })),
    extractedRecords: input.browserRun.run.batch.files.map((fileResult) => ({
      fileName: fileNameFromSourceDocumentId(input.browserRun, fileResult.sourceDocumentId),
      extractedCount: fileResult.extractedCount,
      extractedRecordIds: fileResult.extractedRecordIds,
      accountLabelCs: buildVisibleAccountLabel(
        input.browserRun.run.batch.extractedRecords.find((record) => record.sourceDocumentId === fileResult.sourceDocumentId)?.data.accountId,
        fileNameFromSourceDocumentId(input.browserRun, fileResult.sourceDocumentId),
        sourceSystemFromSourceDocumentId({ browserRun: input.browserRun }, fileResult.sourceDocumentId),
        documentTypeFromSourceDocumentId({ browserRun: input.browserRun }, fileResult.sourceDocumentId)
      ),
      parserDebugLabel: toOptionalString(
        input.browserRun.run.batch.extractedRecords.find((record) => record.sourceDocumentId === fileResult.sourceDocumentId)?.data.bankParserVariant
      )
    })),
    reviewSummary: input.browserRun.run.review.summary,
    reviewSections: input.browserRun.run.review,
    reportTransactions: input.browserRun.run.report.transactions.slice(0, 5).map((transaction) => ({
      transactionId: transaction.transactionId,
      labelCs: buildVisibleTransactionLabel(
        transaction.transactionId,
        transaction.source,
        findVisibleTransactionSubtype(input.browserRun, transaction.transactionId, transaction.source)
      ),
      source: transaction.source,
      subtype: findVisibleTransactionSubtype(input.browserRun, transaction.transactionId, transaction.source),
      amount: formatAmountMinorCs(transaction.amountMinor, transaction.currency),
      status: transaction.status
    })),
    exportFiles: input.browserRun.run.exports.files.map((file) => ({
      labelCs: file.labelCs,
      fileName: file.fileName
    }))
  }

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
      .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 16px;
      }
      .metric, .flow-item {
        background: #f7f9fc;
        border-radius: 14px;
        padding: 16px;
      }
      .detail-panel {
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
${input.debugMode ? `
      details.debug-details {
        margin-top: 8px;
      }
      details.debug-details summary {
        cursor: pointer;
        color: #52627a;
        font-size: 13px;
      }
      .debug-meta {
        margin-top: 8px;
        padding-left: 4px;
      }
` : ''}
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="pill">Viditelný operátorský vstup</span>
        <h1>Hotel Finance Control – měsíční workflow pro operátora</h1>
        <p>Hlavní viditelný vstup teď odpovídá reálným možnostem současného browser/runtime režimu: operátor vybírá soubory, spouští sdílený měsíční běh, kontroluje výsledek, čte náhled reportu a předává exporty.</p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(input.generatedAt)}</p>
  <p id="build-fingerprint" class="hint">Build: <strong>${escapeHtml(buildFingerprintVersion)}</strong> · Renderer: <strong>${escapeHtml(WEB_DEMO_RENDERER_MARKER)}</strong> · Payout matched: <strong>${initialPayoutMatchedCount}</strong> · Payout unmatched: <strong>${initialPayoutUnmatchedCount}</strong></p>
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
        <div id="runtime-stage-banner" class="operator-panel">
          <h3>Aktuální testovatelný stav v prohlížeči</h3>
          <p id="runtime-stage-copy" class="hint">Tlačítko spouští stejný browser-only sdílený tok jako v <code>src/upload-web</code>: přípravu souborů, runtime stav, kontrolu, report a exportní handoff. Bez backendu a bez fake persistence.</p>
          <div class="summary-grid">
            <div class="metric"><strong id="runtime-summary-uploaded-files">${input.browserRun.run.importedFiles.length}</strong><br />Ukázkové nahrané soubory</div>
            <div class="metric"><strong id="runtime-summary-normalized-transactions">${input.browserRun.run.report.summary.normalizedTransactionCount}</strong><br />Normalizované transakce</div>
            <div class="metric"><strong id="runtime-summary-review-items">${input.browserRun.run.review.summary.exceptionCount}</strong><br />Položky ke kontrole</div>
            <div class="metric"><strong id="runtime-summary-export-files">${input.browserRun.run.exports.files.length}</strong><br />Připravené exporty</div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Příprava, kontrola a report v jednom pohledu</h2>
        <div class="operator-grid">
          <section id="prepared-files-section" class="metric" data-runtime-phase="placeholder">
            <h3>Připravené soubory a trasování</h3>
            <div id="prepared-files-content">
              <p class="hint">Výchozí ukázkový snapshot před spuštěním runtime běhu.</p>
              <ul>${preparedFiles}</ul>
            </div>
          </section>
          <section id="review-summary-section" class="metric" data-runtime-phase="placeholder">
            <h3>Kontrolní přehled</h3>
            <div id="review-summary-content">
              <p class="hint">Výchozí ukázkový snapshot před spuštěním runtime běhu.</p>
              <ul>${reviewSummaryItems}</ul>
              <p class="hint">Viditelný přehled vychází z téhož sdíleného výsledku jako detailní review a reporting.</p>
            </div>
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
          <tbody id="report-preview-body" data-runtime-phase="placeholder">${reportRows}</tbody>
        </table>
      </section>

      <section class="card">
        <h2>Detail kontrolních sekcí</h2>
        <div class="detail-grid">
          <section id="matched-payout-batches-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Spárované Airbnb / OTA payout dávky</h3>
            <div id="matched-payout-batches-content">
              <p class="hint">Po spuštění se zde zobrazí business-facing přehled spárovaných payout dávek včetně reference, bankovního přípisu a částky.</p>
            </div>
          </section>
          <section id="unmatched-payout-batches-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Nespárované payout dávky</h3>
            <div id="unmatched-payout-batches-content">
              <p class="hint">Po spuštění se zde zobrazí payout dávky, které stále čekají na dohledání v bance.</p>
            </div>
          </section>
          <section id="reservation-settlement-overview-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Hlavní ubytovací rezervace</h3>
            <div id="reservation-settlement-overview-content">
              <p class="hint">Po spuštění se zde zobrazí hlavní Previo rezervace, očekávaná cesta úhrady a stav kandidáta.</p>
            </div>
          </section>
          <section id="ancillary-settlement-overview-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Doplňkové položky / ancillary revenue</h3>
            <div id="ancillary-settlement-overview-content">
              <p class="hint">Po spuštění se zde zobrazí doplňkové položky jako parkování a jejich očekávaná cesta úhrady.</p>
            </div>
          </section>
          <section id="unmatched-reservations-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Nespárované rezervace k úhradě</h3>
            <div id="unmatched-reservations-content">
              <p class="hint">Výchozí ukázkový snapshot před spuštěním runtime běhu.</p>
              <p class="hint">Po spuštění se zde zobrazí konkrétní rezervace čekající na dohledání úhrady.</p>
            </div>
          </section>
        </div>
      </section>

      <section id="export-handoff-section" class="card" data-runtime-phase="placeholder">
        <h2>Exportní handoff</h2>
        <div id="export-handoff-content">
          <p class="hint">Výchozí ukázkový snapshot před spuštěním runtime běhu.</p>
          <ul>${exportItems}</ul>
          <p class="hint">Exporty vznikají z téhož sdíleného výsledku jako kontrolní sekce a report.</p>
        </div>
        <p class="hint">Sdílený lokální upload workflow zůstává součástí této stránky přímo v hlavním vstupu, ne jako oddělený demo list.</p>
      </section>
    </main>
    <script>
      ${renderBrowserRuntimeClientBootstrap(input.runtimeAssetPath)}

      const fileInput = document.getElementById('monthly-files');
      const monthInput = document.getElementById('month-label');
      const button = document.getElementById('prepare-upload');
      const runtimeOutput = document.getElementById('runtime-output');
  const runtimeStageCopy = document.getElementById('runtime-stage-copy');
  const buildFingerprint = document.getElementById('build-fingerprint');
  const runtimeSummaryUploadedFiles = document.getElementById('runtime-summary-uploaded-files');
  const runtimeSummaryNormalizedTransactions = document.getElementById('runtime-summary-normalized-transactions');
  const runtimeSummaryReviewItems = document.getElementById('runtime-summary-review-items');
  const runtimeSummaryExportFiles = document.getElementById('runtime-summary-export-files');
  const preparedFilesSection = document.getElementById('prepared-files-section');
  const preparedFilesContent = document.getElementById('prepared-files-content');
  const reviewSummarySection = document.getElementById('review-summary-section');
  const reviewSummaryContent = document.getElementById('review-summary-content');
  const reportPreviewBody = document.getElementById('report-preview-body');
  const reservationSettlementOverviewSection = document.getElementById('reservation-settlement-overview-section');
  const reservationSettlementOverviewContent = document.getElementById('reservation-settlement-overview-content');
  const ancillarySettlementOverviewSection = document.getElementById('ancillary-settlement-overview-section');
  const ancillarySettlementOverviewContent = document.getElementById('ancillary-settlement-overview-content');
  const matchedPayoutBatchesSection = document.getElementById('matched-payout-batches-section');
  const matchedPayoutBatchesContent = document.getElementById('matched-payout-batches-content');
  const unmatchedPayoutBatchesSection = document.getElementById('unmatched-payout-batches-section');
  const unmatchedPayoutBatchesContent = document.getElementById('unmatched-payout-batches-content');
  const unmatchedReservationsSection = document.getElementById('unmatched-reservations-section');
  const unmatchedReservationsContent = document.getElementById('unmatched-reservations-content');
  const exportHandoffSection = document.getElementById('export-handoff-section');
  const exportHandoffContent = document.getElementById('export-handoff-content');
      const generatedAt = ${JSON.stringify(input.generatedAt)};
  const buildFingerprintVersion = ${JSON.stringify(buildFingerprintVersion)};
  const initialRuntimeState = ${JSON.stringify(initialRuntimeState)};
      let browserRuntime;
      const debugModeFromQuery = new URLSearchParams(window.location.search).get('debug') === '1';
      const debugMode = Boolean(initialRuntimeState.debugMode || debugModeFromQuery);

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function buildVisibleTransactionLabel(transactionId, source) {
        const normalizedSource = String(source || '').toLowerCase();
        const normalizedId = String(transactionId || '').toLowerCase();

        if (normalizedSource.includes('booking') || normalizedId.includes('booking')) {
          return 'Booking.com payout';
        }

        if (normalizedSource.includes('airbnb') || normalizedId.includes('airbnb')) {
          return 'Airbnb payout';
        }

        if (normalizedSource.includes('comgate') || normalizedId.includes('comgate')) {
          return 'Comgate platba';
        }

        if (normalizedSource.includes('expedia') || normalizedId.includes('expedia')) {
          return 'Expedia settlement';
        }

        if (normalizedSource.includes('bank') || normalizedId.includes('bank')) {
          return 'Bankovní pohyb';
        }

        if (normalizedSource.includes('invoice') || normalizedId.includes('invoice')) {
          return 'Faktura';
        }

        if (normalizedSource.includes('receipt') || normalizedId.includes('receipt')) {
          return 'Účtenka';
        }

        return 'Transakce měsíčního běhu';
      }

      ${buildExtractedRecordsMarkupFunction}

      function buildPreparedFilesMarkup(state) {
        const preparedFiles = state.preparedFiles.length === 0
          ? '<li>Žádné připravené soubory.</li>'
          : state.preparedFiles.map((file) => '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">' + escapeHtml(file.sourceSystem) + ' / ' + escapeHtml(file.documentType) + '</span><br /><code>' + escapeHtml(file.sourceDocumentId) + '</code></li>').join('');

        const extractedRecords = buildExtractedRecordsMarkup(state.extractedRecords, escapeHtml);

        return [
          '<p class="hint">Tato část po spuštění zobrazuje skutečný runtime výsledek místo původního snapshotu.</p>',
          '<ul>' + preparedFiles + '</ul>',
          '<h4>Extrahované záznamy</h4>',
          '<ul>' + extractedRecords + '</ul>'
        ].join('');
      }

      function buildReviewSummaryMarkup(state) {
        const payoutBatchMatchedCount = ((state.reviewSections && state.reviewSections.payoutBatchMatched) || []).length;
        const payoutBatchUnmatchedCount = ((state.reviewSections && state.reviewSections.payoutBatchUnmatched) || []).length;
        const reviewSummaryItems = [
          ['Spárované Airbnb / OTA payout dávky', payoutBatchMatchedCount],
          ['Nespárované payout dávky', payoutBatchUnmatchedCount],
          ['Nespárované rezervace k úhradě', state.reviewSections.unmatchedReservationSettlements.length],
          ['Podezřelé položky', state.reviewSections.suspicious.length],
          ['Chybějící doklady', state.reviewSections.missingDocuments.length]
        ].map((entry) => '<li><strong>' + escapeHtml(entry[0]) + ':</strong> ' + escapeHtml(String(entry[1])) + '</li>').join('');

        return [
          '<p class="hint">Viditelný přehled je po spuštění přepsaný skutečným výsledkem sdíleného runtime běhu.</p>',
          '<ul>' + reviewSummaryItems + '</ul>',
          '<p class="hint">Souhrn kontroly: ' + escapeHtml(String(state.reviewSummary.exceptionCount)) + ' položek ke kontrole.</p>'
        ].join('');
      }

      function buildFingerprintMarkup(state) {
        const payoutBatchMatchedCount = ((state.reviewSections && state.reviewSections.payoutBatchMatched) || []).length;
        const payoutBatchUnmatchedCount = ((state.reviewSections && state.reviewSections.payoutBatchUnmatched) || []).length;

  return 'Build: <strong>' + escapeHtml(buildFingerprintVersion) + '</strong> · Renderer: <strong>' + escapeHtml(${JSON.stringify(WEB_DEMO_RENDERER_MARKER)}) + '</strong> · Payout matched: <strong>' + escapeHtml(String(payoutBatchMatchedCount)) + '</strong> · Payout unmatched: <strong>' + escapeHtml(String(payoutBatchUnmatchedCount)) + '</strong>';
      }

      function buildReportRowsMarkup(state) {
        if (state.reportTransactions.length === 0) {
          return '<tr><td colspan="4"><span class="hint">Runtime běh zatím nevygeneroval žádné transakce pro náhled reportu.</span></td></tr>';
        }

        return state.reportTransactions.map((transaction) => [
          '<tr>',
          '<td><strong>' + escapeHtml(transaction.labelCs || 'Transakce') + '</strong></td>',
          '<td>' + escapeHtml(transaction.source) + '</td>',
          '<td><span class="amount">' + escapeHtml(transaction.amount) + '</span></td>',
          '<td>' + escapeHtml(transaction.status) + '</td>',
          '</tr>'
        ].join('')).join('');
      }

      function buildUnmatchedReservationDetailsMarkup(state) {
        const items = (state.reviewSections && state.reviewSections.unmatchedReservationSettlements) || [];

        if (items.length === 0) {
          return '<p class="hint">Žádné položky v této sekci.</p>';
        }

        return '<ul>' + items.map((item) =>
          '<li><strong>' + escapeHtml(item.title) + '</strong><br /><span class="hint">' + escapeHtml(item.detail) + '</span></li>'
        ).join('') + '</ul>';
      }

      function buildSettlementOverviewMarkup(items) {
        if (!items || items.length === 0) {
          return '<p class="hint">Žádné položky v této sekci.</p>';
        }

        return '<ul>' + items.map((item) =>
          '<li><strong>' + escapeHtml(item.title) + '</strong><br /><span class="hint">' + escapeHtml(item.detail) + '</span></li>'
        ).join('') + '</ul>';
      }

      function buildPayoutBatchDetailMarkup(items) {
        if (!items || items.length === 0) {
          return '<p class="hint">Žádné položky v této sekci.</p>';
        }

        return '<ul>' + items.map((item) =>
          '<li><strong>' + escapeHtml(item.title) + '</strong><br /><span class="hint">' + escapeHtml(item.detail) + '</span></li>'
        ).join('') + '</ul>';
      }

      function buildExportMarkup(state) {
        const exports = state.exportFiles.length === 0
          ? '<li>Žádné exporty.</li>'
          : state.exportFiles.map((file) => '<li><strong>' + escapeHtml(file.labelCs) + '</strong> — <code>' + escapeHtml(file.fileName) + '</code></li>').join('');

        return [
          '<p class="hint">Exportní handoff je po spuštění přepsaný skutečným runtime výsledkem.</p>',
          '<ul>' + exports + '</ul>',
          '<p class="hint">Run ID: <code>' + escapeHtml(state.runId) + '</code></p>'
        ].join('');
      }

      function renderMainRuntimeState(state) {
        return [
          '<h3>Výsledek spuštěného browser workflow</h3>',
          '<p><strong>Měsíc:</strong> ' + escapeHtml(state.monthLabel) + '</p>',
          '<p><strong>Run ID:</strong> <code>' + escapeHtml(state.runId) + '</code></p>',
          '<p><strong>Vygenerováno:</strong> ' + escapeHtml(state.generatedAt) + '</p>',
          '<p class="hint">Viditelné sekce stránky byly nahrazené skutečným runtime výsledkem ze sdíleného browser toku.</p>'
        ].join('');
      }

      function applyVisibleRuntimeState(state, phase) {
        preparedFilesSection.setAttribute('data-runtime-phase', phase);
        reviewSummarySection.setAttribute('data-runtime-phase', phase);
        reportPreviewBody.setAttribute('data-runtime-phase', phase);
  matchedPayoutBatchesSection.setAttribute('data-runtime-phase', phase);
  unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', phase);
  reservationSettlementOverviewSection.setAttribute('data-runtime-phase', phase);
  ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', phase);
  unmatchedReservationsSection.setAttribute('data-runtime-phase', phase);
        exportHandoffSection.setAttribute('data-runtime-phase', phase);

        if (runtimeSummaryUploadedFiles) {
          runtimeSummaryUploadedFiles.textContent = String((state.preparedFiles || []).length);
        }
        if (runtimeSummaryNormalizedTransactions) {
          runtimeSummaryNormalizedTransactions.textContent = String(state.reviewSummary?.normalizedTransactionCount ?? state.reportSummary?.normalizedTransactionCount ?? 0);
        }
        if (runtimeSummaryReviewItems) {
          runtimeSummaryReviewItems.textContent = String(state.reviewSummary?.exceptionCount ?? 0);
        }
        if (runtimeSummaryExportFiles) {
          runtimeSummaryExportFiles.textContent = String((state.exportFiles || []).length);
        }
        if (buildFingerprint) {
          buildFingerprint.innerHTML = buildFingerprintMarkup(state);
        }

        preparedFilesContent.innerHTML = buildPreparedFilesMarkup(state);
        reviewSummaryContent.innerHTML = buildReviewSummaryMarkup(state);
        reportPreviewBody.innerHTML = buildReportRowsMarkup(state);
  matchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup((state.reviewSections && state.reviewSections.payoutBatchMatched) || []);
  unmatchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup((state.reviewSections && state.reviewSections.payoutBatchUnmatched) || []);
        reservationSettlementOverviewContent.innerHTML = buildSettlementOverviewMarkup((state.reviewSections && state.reviewSections.reservationSettlementOverview) || []);
        ancillarySettlementOverviewContent.innerHTML = buildSettlementOverviewMarkup((state.reviewSections && state.reviewSections.ancillarySettlementOverview) || []);
        unmatchedReservationsContent.innerHTML = buildUnmatchedReservationDetailsMarkup(state);
        exportHandoffContent.innerHTML = buildExportMarkup(state);
      }

      function renderRunningState(files) {
        const fileNames = files.length === 0
          ? '<li>Žádné soubory.</li>'
          : files.map((file) => '<li><strong>' + escapeHtml(file.name) + '</strong></li>').join('');

        preparedFilesSection.setAttribute('data-runtime-phase', 'running');
        reviewSummarySection.setAttribute('data-runtime-phase', 'running');
        reportPreviewBody.setAttribute('data-runtime-phase', 'running');
  matchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'running');
  unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'running');
  reservationSettlementOverviewSection.setAttribute('data-runtime-phase', 'running');
  ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', 'running');
  unmatchedReservationsSection.setAttribute('data-runtime-phase', 'running');
        exportHandoffSection.setAttribute('data-runtime-phase', 'running');

        if (runtimeSummaryUploadedFiles) {
          runtimeSummaryUploadedFiles.textContent = String(files.length);
        }
        if (buildFingerprint) {
          buildFingerprint.innerHTML = 'Build: <strong>' + escapeHtml(buildFingerprintVersion) + '</strong> · Renderer: <strong>' + escapeHtml(${JSON.stringify(WEB_DEMO_RENDERER_MARKER)}) + '</strong> · Payout matched: <strong>načítám…</strong> · Payout unmatched: <strong>načítám…</strong>';
        }

        preparedFilesContent.innerHTML = '<p class="hint">Probíhá příprava skutečně vybraných souborů pro sdílený runtime běh.</p><ul>' + fileNames + '</ul>';
        reviewSummaryContent.innerHTML = '<p class="hint">Kontrolní přehled se teď počítá ze sdíleného browser runtime běhu…</p>';
        reportPreviewBody.innerHTML = '<tr><td colspan="4"><span class="hint">Report preview se právě nahrazuje runtime výsledkem…</span></td></tr>';
  matchedPayoutBatchesContent.innerHTML = '<p class="hint">Spárované payout dávky se právě načítají ze sdíleného runtime běhu…</p>';
  unmatchedPayoutBatchesContent.innerHTML = '<p class="hint">Nespárované payout dávky se právě načítají ze sdíleného runtime běhu…</p>';
        reservationSettlementOverviewContent.innerHTML = '<p class="hint">Přehled hlavních rezervací se právě načítá ze sdíleného runtime běhu…</p>';
        ancillarySettlementOverviewContent.innerHTML = '<p class="hint">Přehled doplňkových položek se právě načítá ze sdíleného runtime běhu…</p>';
        unmatchedReservationsContent.innerHTML = '<p class="hint">Detail nespárovaných rezervací se právě načítá ze sdíleného runtime běhu…</p>';
        exportHandoffContent.innerHTML = '<p class="hint">Exportní handoff se právě připravuje ze stejného runtime výsledku…</p>';
      }

      function renderFailedState(error) {
        const message = escapeHtml(error instanceof Error ? error.message : String(error));

        preparedFilesSection.setAttribute('data-runtime-phase', 'failed');
        reviewSummarySection.setAttribute('data-runtime-phase', 'failed');
        reportPreviewBody.setAttribute('data-runtime-phase', 'failed');
  matchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'failed');
  unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'failed');
  reservationSettlementOverviewSection.setAttribute('data-runtime-phase', 'failed');
  ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', 'failed');
  unmatchedReservationsSection.setAttribute('data-runtime-phase', 'failed');
        exportHandoffSection.setAttribute('data-runtime-phase', 'failed');

        preparedFilesContent.innerHTML = '<p><strong>Runtime běh selhal.</strong></p><p class="hint">Viditelné sekce nebylo možné aktualizovat, protože sdílený browser runtime skončil chybou.</p>';
        reviewSummaryContent.innerHTML = '<p class="hint">Chyba runtime běhu: ' + message + '</p>';
        reportPreviewBody.innerHTML = '<tr><td colspan="4"><span class="hint">Runtime běh selhal: ' + message + '</span></td></tr>';
  matchedPayoutBatchesContent.innerHTML = '<p class="hint">Spárované payout dávky nejsou k dispozici, protože runtime běh selhal.</p>';
  unmatchedPayoutBatchesContent.innerHTML = '<p class="hint">Nespárované payout dávky nejsou k dispozici, protože runtime běh selhal.</p>';
        reservationSettlementOverviewContent.innerHTML = '<p class="hint">Přehled hlavních rezervací není k dispozici, protože runtime běh selhal.</p>';
        ancillarySettlementOverviewContent.innerHTML = '<p class="hint">Přehled doplňkových položek není k dispozici, protože runtime běh selhal.</p>';
        unmatchedReservationsContent.innerHTML = '<p class="hint">Detail nespárovaných rezervací není k dispozici, protože runtime běh selhal.</p>';
        exportHandoffContent.innerHTML = '<p class="hint">Exportní handoff není k dispozici, protože runtime běh selhal.</p>';
        if (buildFingerprint) {
          buildFingerprint.innerHTML = 'Build: <strong>' + escapeHtml(buildFingerprintVersion) + '</strong> · Renderer: <strong>' + escapeHtml(${JSON.stringify(WEB_DEMO_RENDERER_MARKER)}) + '</strong> · Payout matched: <strong>chyba</strong> · Payout unmatched: <strong>chyba</strong>';
        }
      }

      function renderInitialVisibleState() {
        applyVisibleRuntimeState(initialRuntimeState, 'placeholder');
      }

      async function startMainWorkflow() {
        const files = Array.from(fileInput.files || []);
        runtimeOutput.innerHTML = '<p class="hint">Spouštím browser/local workflow nad právě zvolenými soubory…</p>';

        if (files.length === 0) {
          runtimeOutput.innerHTML = '<p class="hint">Nejprve vyberte alespoň jeden soubor.</p>';
          return;
        }

        runtimeStageCopy.innerHTML = 'Stav stránky: <strong>běh právě probíhá</strong>. Původní ukázkový snapshot se teď nahrazuje skutečným výsledkem vybraných souborů.';
        renderRunningState(files);

        if (!browserRuntime && typeof window.__hotelFinanceCreateBrowserRuntime === 'function') {
          browserRuntime = window.__hotelFinanceCreateBrowserRuntime();
        }

        if (!browserRuntime) {
          runtimeOutput.innerHTML = '<p class="hint">Sdílený browser runtime se ještě načítá. Zkuste akci za okamžik znovu.</p>';
          runtimeStageCopy.innerHTML = 'Stav stránky: <strong>runtime ještě není připravený</strong>. Viditelný výsledek zatím zůstává ve výchozím ukázkovém stavu.';
          renderInitialVisibleState();
          return;
        }

        try {
          const state = await browserRuntime.buildRuntimeState({
            files,
            month: monthInput.value,
            generatedAt
          });

          applyVisibleRuntimeState({
            ...state,
            reportTransactions: ${JSON.stringify(input.browserRun.run.report.transactions.slice(0, 1))}.slice(0, 0)
          }, 'completed');
          applyVisibleRuntimeState({
            generatedAt: state.generatedAt,
            runId: state.runId,
            monthLabel: state.monthLabel,
            preparedFiles: state.preparedFiles,
            extractedRecords: state.extractedRecords,
            reviewSummary: state.reviewSummary,
            reviewSections: state.reviewSections,
            reportTransactions: (state.reportTransactions || []).map((transaction) => ({
              ...transaction,
              labelCs: buildVisibleTransactionLabel(transaction.transactionId, transaction.source)
            })),
            exportFiles: state.exportFiles
          }, 'completed');
          runtimeOutput.innerHTML = renderMainRuntimeState(state);
        } catch (error) {
          runtimeStageCopy.innerHTML = 'Stav stránky: <strong>runtime běh selhal</strong>. Viditelně zobrazujeme chybu místo tichého ponechání ukázkového snapshotu.';
          renderFailedState(error);
          runtimeOutput.innerHTML = [
            '<h3>Výsledek spuštěného browser workflow</h3>',
            '<p><strong>Runtime běh selhal.</strong></p>',
            '<p class="hint">' + escapeHtml(error instanceof Error ? error.message : String(error)) + '</p>'
          ].join('');
        }
      }

      button.addEventListener('click', () => {
        void startMainWorkflow();
      });

      renderInitialVisibleState();
    </script>
  </body>
</html>
`
}

function buildDefaultExtractedRecordsMarkupFunctionSource(): string {
  return `function buildExtractedRecordsMarkup(extractedRecords, escapeHtml) {
        if (extractedRecords.length === 0) {
          return '<li>Žádné extrahované záznamy.</li>';
        }

        return extractedRecords.map((file) => '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">Účet: ' + escapeHtml(file.accountLabelCs) + '</span><br /><span class="hint">Extrahováno: ' + escapeHtml(String(file.extractedCount)) + '</span></li>').join('');
      }`
}

function buildDebugExtractedRecordsMarkupFunctionSource(): string {
  return `function buildExtractedRecordsMarkup(extractedRecords, escapeHtml) {
        if (extractedRecords.length === 0) {
          return '<li>Žádné extrahované záznamy.</li>';
        }

        return extractedRecords.map((file) => {
          const hasDebugMeta = file.extractedRecordIds.length > 0 || Boolean(file.parserDebugLabel);
          const debugBlock = !hasDebugMeta
            ? ''
            : '<details class="debug-details"><summary>Technické ladicí údaje (debug)</summary><div class="debug-meta">'
              + (file.parserDebugLabel
                ? '<div><span class="hint">Technický tvar exportu (debug): </span><code>' + escapeHtml(file.parserDebugLabel) + '</code></div>'
                : '')
              + (file.extractedRecordIds.length > 0
                ? '<div><span class="hint">Technická ID extrahovaných záznamů (debug): </span><code>' + escapeHtml(file.extractedRecordIds.join(', ')) + '</code></div>'
                : '<div><span class="hint">Technická ID extrahovaných záznamů (debug): nejsou k dispozici.</span></div>')
              + '</div></details>';

          return '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">Účet: ' + escapeHtml(file.accountLabelCs) + '</span><br /><span class="hint">Extrahováno: ' + escapeHtml(String(file.extractedCount)) + '</span>' + debugBlock + '</li>';
        }).join('');
      }`
}

function fileNameFromSourceDocumentId(
  browserRun: BrowserUploadedMonthlyRunResult,
  sourceDocumentId: string
): string {
  return browserRun.run.importedFiles.find((file) => file.sourceDocument.id === sourceDocumentId)?.sourceDocument.fileName ?? sourceDocumentId
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function buildVisibleAccountLabel(
  accountIdValue: unknown,
  fileName: string,
  sourceSystem: string | undefined,
  documentType: string | undefined
): string {
  const accountId = toOptionalString(accountIdValue)
  const normalizedFileName = fileName.toLowerCase()

  if (sourceSystem && sourceSystem !== 'bank') {
    return buildVisibleNonBankSourceLabel(sourceSystem, documentType)
  }

  if (accountId) {
    if (accountId.startsWith('5599955956')) {
      return `RB účet ${accountId}`
    }

    if (accountId.startsWith('8888997777')) {
      return `Fio účet ${accountId}`
    }

    return `Bankovní účet ${accountId}`
  }

  if (normalizedFileName.includes('5599955956')) {
    return 'RB účet 5599955956'
  }

  if (normalizedFileName.includes('8888997777')) {
    return 'Fio účet 8888997777'
  }

  return 'Bankovní účet neuveden'
}

function buildVisibleNonBankSourceLabel(sourceSystem: string, documentType?: string): string {
  if (sourceSystem === 'booking') {
    return 'Booking payout report'
  }

  if (sourceSystem === 'airbnb') {
    return 'Airbnb payout report'
  }

  if (sourceSystem === 'comgate') {
    return 'Comgate platební report'
  }

  if (sourceSystem === 'expedia') {
    return 'Expedia payout report'
  }

  if (sourceSystem === 'previo') {
    return 'Previo rezervační export'
  }

  if (documentType === 'invoice') {
    return 'Dodavatelská faktura'
  }

  if (documentType === 'receipt') {
    return 'Výdajový doklad'
  }

  if (documentType === 'ota_report') {
    return 'OTA payout report'
  }

  return 'Nebankovní zdroj zpracování'
}

function sourceSystemFromSourceDocumentId(input: {
  browserRun: BrowserUploadedMonthlyRunResult
}, sourceDocumentId: string): string | undefined {
  return input.browserRun.run.importedFiles.find((file) => file.sourceDocument.id === sourceDocumentId)?.sourceDocument.sourceSystem
}

function documentTypeFromSourceDocumentId(input: {
  browserRun: BrowserUploadedMonthlyRunResult
}, sourceDocumentId: string): string | undefined {
  return input.browserRun.run.importedFiles.find((file) => file.sourceDocument.id === sourceDocumentId)?.sourceDocument.documentType
}

function findVisibleTransactionSubtype(
  browserRun: BrowserUploadedMonthlyRunResult,
  transactionId: string,
  source: string
): string | undefined {
  if (source !== 'airbnb') {
    return undefined
  }

  const extractedRecord = browserRun.run.batch.extractedRecords.find((record) => `txn:payout:${record.id}` === transactionId)
  return typeof extractedRecord?.data.rowKind === 'string' ? extractedRecord.data.rowKind : undefined
}

function buildVisibleTransactionLabel(transactionId: string, source: string, subtype?: string): string {
  const normalizedSource = source.toLowerCase()
  const normalizedId = transactionId.toLowerCase()

  if (normalizedSource.includes('booking') || normalizedId.includes('booking')) {
    return 'Booking.com payout'
  }

  if (normalizedSource.includes('airbnb') || normalizedId.includes('airbnb')) {
    if (subtype === 'reservation') {
      return 'Airbnb rezervace'
    }

    return 'Airbnb payout'
  }

  if (normalizedSource.includes('comgate') || normalizedId.includes('comgate')) {
    return 'Comgate platba'
  }

  if (normalizedSource.includes('expedia') || normalizedId.includes('expedia')) {
    return 'Expedia settlement'
  }

  if (normalizedSource.includes('bank') || normalizedId.includes('bank')) {
    return 'Bankovní transakce'
  }

  return 'Transakce'
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

function buildActualUploadedAirbnbContent(): string {
  return [
    'Datum;Bude připsán do dne;Typ;Datum zahájení;Datum ukončení;Host;Nabídka;Podrobnosti;Referenční kód;Potvrzující kód;Měna;Částka;Vyplaceno;Servisní poplatek;Hrubé výdělky',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Jan Novak;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-OC3WJE3SIXRO5;;CZK;;3 961,05;0,00;3 961,05',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 2;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-DXVK4YVI7MJVL;;CZK;;4 456,97;0,00;4 456,97',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 3;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-ZD5RVTGOHW3GE;;CZK;;7 059,94;0,00;7 059,94',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 4;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-ZWNWMP6UYWNI7;;CZK;;15 701,41;0,00;15 701,41',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 5;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-WLT46RY3MOZIF;;CZK;;1 112,59;0,00;1 112,59',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 6;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-L4RVQL6SE24XJ;;CZK;;1 152,81;0,00;1 152,81',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 7;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-TGCGGWASBTWWW;;CZK;;970,36;0,00;970,36',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 8;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-TKC6CS3OTDMGN;;CZK;;9 785,73;0,00;9 785,73',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 9;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-2F2LZZKYTRZ6E;;CZK;;3 518,94;0,00;3 518,94',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 10;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-MUEMMKRWRPQNQ;;CZK;;12 123,52;0,00;12 123,52',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 11;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-RFF4BW3JFXE6T;;CZK;;2 248,17;0,00;2 248,17',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 12;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-EPATNPP5RBQDW;;CZK;;2 492,32;0,00;2 492,32',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 13;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-JWVQXQVW6DET3;;CZK;;18 912,42;0,00;18 912,42',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 14;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-FE2CKQSBT6E7N;;CZK;;9 771,27;0,00;9 771,27',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 15;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-OLIOSSDGKKF3X;;CZK;;1 475,08;0,00;1 475,08',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 16;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-IZLCELA7C5EFN;;CZK;;8 241,96;0,00;8 241,96',
    '2026-03-12;2026-03-15;Payout;2026-03-10;2026-03-12;Host 17;Jokeland apartment;Převod Jokeland s.r.o., IBAN 5956 (CZK);G-6G5WFOJO5DJCI;;CZK;;1 117,01;0,00;1 117,01'
  ].join('\n')
}

function buildActualUploadedRbCitiContent(): string {
  return [
    '"Datum provedení";"Datum zaúčtování";"Číslo účtu";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"Zpráva pro příjemce"',
    '15.03.2026 06:20;15.03.2026 06:23;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;3961,05;CZK;G-OC3WJE3SIXRO5',
    '15.03.2026 06:21;15.03.2026 06:24;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;4456,97;CZK;G-DXVK4YVI7MJVL',
    '15.03.2026 06:22;15.03.2026 06:25;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;7059,94;CZK;G-ZD5RVTGOHW3GE',
    '15.03.2026 06:23;15.03.2026 06:26;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;15701,41;CZK;G-ZWNWMP6UYWNI7',
    '15.03.2026 06:24;15.03.2026 06:27;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;1112,59;CZK;G-WLT46RY3MOZIF',
    '15.03.2026 06:25;15.03.2026 06:28;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;1152,81;CZK;G-L4RVQL6SE24XJ',
    '15.03.2026 06:26;15.03.2026 06:29;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;970,36;CZK;G-TGCGGWASBTWWW',
    '15.03.2026 06:27;15.03.2026 06:30;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;9785,73;CZK;G-TKC6CS3OTDMGN',
    '15.03.2026 06:28;15.03.2026 06:31;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;3518,94;CZK;G-2F2LZZKYTRZ6E',
    '15.03.2026 06:29;15.03.2026 06:32;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;12123,52;CZK;G-MUEMMKRWRPQNQ',
    '15.03.2026 06:30;15.03.2026 06:33;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;2248,17;CZK;G-RFF4BW3JFXE6T',
    '15.03.2026 06:31;15.03.2026 06:34;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;2492,32;CZK;G-EPATNPP5RBQDW',
    '15.03.2026 06:32;15.03.2026 06:35;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;18912,42;CZK;G-JWVQXQVW6DET3',
    '15.03.2026 06:33;15.03.2026 06:36;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;9771,27;CZK;G-FE2CKQSBT6E7N',
    '15.03.2026 06:34;15.03.2026 06:37;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;1475,08;CZK;G-OLIOSSDGKKF3X',
    '15.03.2026 06:35;15.03.2026 06:38;5599955956/5500;000000-1234567890/0100;CITIBANK EUROPE PLC;555,55;CZK;NON-MATCHING-CITIBANK-ROW'
  ].join('\n')
}
