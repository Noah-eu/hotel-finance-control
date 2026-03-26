import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const WEB_DEMO_PAYOUT_PROJECTION_MARKER = 'payout-projection-v4'

export async function buildWebDemo(options: BuildWebDemoOptions = {}): Promise<WebDemoResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const debugMode = options.debugMode ?? false
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
      runtimeAssetPath,
      debugMode
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
    debugMode
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
  const runtimeBuildInfo = {
    gitCommitHash: resolveGitCommitHash(),
    buildTimestamp: input.generatedAt,
    runtimeModuleVersion: buildFingerprintVersion,
    rendererVersion: WEB_DEMO_RENDERER_MARKER,
    payoutProjectionVersion: WEB_DEMO_PAYOUT_PROJECTION_MARKER
  }
  const showRuntimePayoutDiagnostics = Boolean(input.debugMode)
  const buildExtractedRecordsMarkupFunction = input.debugMode
    ? buildDebugExtractedRecordsMarkupFunctionSource()
    : buildDefaultExtractedRecordsMarkupFunctionSource()
  const runtimePayoutDiagnosticsBindings = showRuntimePayoutDiagnostics
    ? `
  const runtimePayoutDiagnosticsSection = document.getElementById('runtime-payout-diagnostics-section');
  const runtimePayoutDiagnosticsContent = document.getElementById('runtime-payout-diagnostics-content');`
    : `
  const runtimePayoutDiagnosticsSection = null;
  const runtimePayoutDiagnosticsContent = null;`
  const runtimeFileIntakeDiagnosticsBindings = `
  const runtimeFileIntakeDiagnosticsSection = document.getElementById('runtime-file-intake-diagnostics-section');
  const runtimeFileIntakeDiagnosticsContent = document.getElementById('runtime-file-intake-diagnostics-content');`

  const initialRuntimeState = {
    debugMode: Boolean(input.debugMode),
    generatedAt: input.generatedAt,
    runtimeBuildInfo,
    runId: 'web-demo-empty-initial-state',
    monthLabel: '',
    routingSummary: {
      uploadedFileCount: 0,
      supportedFileCount: 0,
      unsupportedFileCount: 0,
      errorFileCount: 0
    },
    reconciliationSnapshot: {
      sourceFunction: 'buildBrowserRuntimeUploadStateFromFiles -> batch.reconciliation',
      objectPath: 'state.reconciliationSnapshot',
      matchedCount: 0,
      unmatchedCount: 0,
      matchedPayoutBatchKeys: [],
      unmatchedPayoutBatchKeys: [],
      payoutBatchDecisions: [],
      airbnbUnmatchedHistogram: {
        noExactAmount: 0,
        dateRejected: 0,
        evidenceRejected: 0,
        ambiguous: 0,
        other: 0
      },
      inboundBankTransactions: []
    },
    preparedFiles: [],
    fileRoutes: [],
    extractedRecords: [],
    reviewSummary: {
      matchedGroupCount: 0,
      exceptionCount: 0,
      unsupportedFileCount: 0,
      preparedFileCount: 0,
      extractedRecordCount: 0,
      normalizedTransactionCount: 0,
      payoutBatchMatchCount: 0,
      unmatchedPayoutBatchCount: 0
    },
    runtimeAudit: {
      payoutDiagnostics: {
        extractedAirbnbPayoutRowRefs: [],
        extractedAirbnbRawReferences: [],
        extractedAirbnbDataReferences: [],
        extractedAirbnbReferenceCodes: [],
        extractedAirbnbPayoutReferences: [],
        workflowPayoutBatchKeys: [],
        workflowPayoutReferences: [],
        reportMatchedPayoutReferences: [],
        reportUnmatchedPayoutReferences: [],
        runtimeMatchedTitleSourceValues: [],
        runtimeUnmatchedTitleSourceValues: []
      },
      fileIntakeDiagnostics: []
    },
    reviewSections: {
      matched: [],
      reservationSettlementOverview: [],
      ancillarySettlementOverview: [],
      unmatchedReservationSettlements: [],
      payoutBatchMatched: [],
      payoutBatchUnmatched: [],
      unmatched: [],
      suspicious: [],
      missingDocuments: []
    },
    finalPayoutProjection: {
      sourceFunction: 'buildCompletedVisibleRuntimeState -> collectVisiblePayoutProjection',
      objectPath: 'state.finalPayoutProjection',
      matchedCount: 0,
      unmatchedCount: 0,
      matchedSectionCount: 0,
      unmatchedSectionCount: 0,
      matchedIds: [],
      unmatchedIds: [],
      matchedItems: [],
      unmatchedItems: []
    },
    reportTransactions: [],
    exportFiles: []
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
${showRuntimePayoutDiagnostics ? `
      .diagnostic-list {
        list-style: disc;
        margin: 8px 0 0;
        padding-left: 20px;
      }
      .diagnostic-list li {
        margin-bottom: 6px;
      }
` : `
      .diagnostic-list {
        list-style: disc;
        margin: 8px 0 0;
        padding-left: 20px;
      }
      .diagnostic-list li {
        margin-bottom: 6px;
      }
`}
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
  <p id="build-fingerprint" class="hint">Build: <strong>${escapeHtml(buildFingerprintVersion)}</strong> · Renderer: <strong>${escapeHtml(WEB_DEMO_RENDERER_MARKER)}</strong> · Payout matched: <strong>žádný upload</strong> · Payout unmatched: <strong>žádný upload</strong></p>
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
          <p class="hint">Měsíční workflow zatím neběželo. Výsledek se zobrazí až po výběru skutečných souborů a spuštění uploadu.</p>
        </div>
        <div id="runtime-stage-banner" class="operator-panel">
          <h3>Aktuální testovatelný stav v prohlížeči</h3>
          <p id="runtime-stage-copy" class="hint">Tlačítko spouští stejný browser-only sdílený tok jako v <code>src/upload-web</code>: přípravu souborů, runtime stav, kontrolu, report a exportní handoff. Bez backendu a bez fake persistence.</p>
          <div class="summary-grid">
            <div class="metric"><strong id="runtime-summary-uploaded-files">0</strong><br />Nahrané soubory</div>
            <div class="metric"><strong id="runtime-summary-normalized-transactions">0</strong><br />Normalizované transakce</div>
            <div class="metric"><strong id="runtime-summary-review-items">0</strong><br />Položky ke kontrole</div>
            <div class="metric"><strong id="runtime-summary-export-files">0</strong><br />Připravené exporty</div>
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
              <p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh.</p>
            </div>
          </section>
          <section id="review-summary-section" class="metric" data-runtime-phase="placeholder">
            <h3>Kontrolní přehled</h3>
            <div id="review-summary-content">
              <p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p>
              <p class="hint">Kontrolní přehled se naplní až po spuštění nad vybranými soubory.</p>
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
          <tbody id="report-preview-body" data-runtime-phase="placeholder"><tr><td colspan="4"><span class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek pro náhled reportu.</span></td></tr></tbody>
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
          <p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek pro exportní handoff.</p>
          <p class="hint">Exporty vzniknou až ze skutečně spuštěného běhu nad vybranými soubory.</p>
        </div>
        <p class="hint">Sdílený lokální upload workflow zůstává součástí této stránky přímo v hlavním vstupu, ne jako oddělený demo list.</p>
      </section>
${showRuntimePayoutDiagnostics ? `
      <section id="runtime-payout-diagnostics-section" class="card" data-runtime-phase="placeholder">
        <h2>Diagnostika runtime payout dávek</h2>
        <div id="runtime-payout-diagnostics-content">
          <p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p>
          <p class="hint">Po spuštění zde uvidíte přesné payout reference a titulky z aktuálního runtime běhu.</p>
        </div>
      </section>
` : ''}
      <section id="runtime-file-intake-diagnostics-section" class="card" data-runtime-phase="placeholder" hidden>
        <h2>Diagnostika intake souborů</h2>
        <div id="runtime-file-intake-diagnostics-content">
          <p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p>
          <p class="hint">Po spuštění zde uvidíte skutečný browser intake handoff pro každý vybraný soubor.</p>
        </div>
      </section>
      <section id="runtime-payout-projection-debug-section" class="card" data-runtime-phase="placeholder" hidden>
        <h2>Diagnostika finální payout projekce</h2>
        <div id="runtime-payout-projection-debug-content">
          <p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p>
          <p class="hint">Po spuštění zde uvidíte build/runtime marker a finální payout projekci ze stejného state objektu, který používá summary i detailní payout sekce.</p>
        </div>
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
  const exportHandoffContent = document.getElementById('export-handoff-content');${runtimePayoutDiagnosticsBindings}${runtimeFileIntakeDiagnosticsBindings}
  const runtimePayoutProjectionDebugSection = document.getElementById('runtime-payout-projection-debug-section');
  const runtimePayoutProjectionDebugContent = document.getElementById('runtime-payout-projection-debug-content');
      const generatedAt = ${JSON.stringify(input.generatedAt)};
  const buildFingerprintVersion = ${JSON.stringify(buildFingerprintVersion)};
  const initialRuntimeState = ${JSON.stringify(initialRuntimeState)};
      let browserRuntime;
      const debugModeFromQuery = new URLSearchParams(window.location.search).get('debug') === '1';
      const debugModeFromHash = /(^#debug(?:=1)?$|[?&#]debug(?:=1)?(?:$|[&#]))/i.test(String(window.location.hash || ''));
      const runtimeOperatorDebugMode = Boolean(initialRuntimeState.debugMode || debugModeFromQuery || debugModeFromHash);
      const runtimeFileIntakeDebugMode = runtimeOperatorDebugMode;
      const runtimePayoutProjectionDebugMode = runtimeOperatorDebugMode;

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function buildAmountDisplay(amountMinor, currency) {
        const minor = Number.isFinite(amountMinor) ? Number(amountMinor) : 0;
        const normalizedCurrency = String(currency || 'CZK').toUpperCase();
        const absolute = Math.abs(minor) / 100;

        try {
          return new Intl.NumberFormat('cs-CZ', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(absolute) + ' ' + normalizedCurrency;
        } catch {
          return String((absolute).toFixed(2)) + ' ' + normalizedCurrency;
        }
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

      function buildClassificationBasisLabel(value) {
        if (value === 'content') {
          return 'podle obsahu';
        }

        if (value === 'binary-workbook') {
          return 'podle workbook exportu';
        }

        if (value === 'file-name') {
          return 'podle názvu souboru';
        }

        return 'bez rozpoznání';
      }

      function buildCapabilityProfileLabel(value) {
        if (value === 'structured_tabular') {
          return 'Strukturovaný export';
        }

        if (value === 'text_document') {
          return 'Textový doklad';
        }

        if (value === 'pdf_text_layer') {
          return 'Textové PDF';
        }

        if (value === 'pdf_image_only') {
          return 'Scan / OCR potřeba';
        }

        if (value === 'image_receipt_like') {
          return 'Obrázek / OCR potřeba';
        }

        if (value === 'unsupported_binary') {
          return 'Nepodporovaný vstup';
        }

        return 'Nepodporovaný vstup';
      }

      function buildCapabilityTransportProfileLabel(value) {
        if (value === 'structured_csv' || value === 'structured_workbook') {
          return 'Strukturovaný export';
        }

        if (value === 'text_pdf') {
          return 'Textové PDF';
        }

        if (value === 'image_pdf') {
          return 'Scan / OCR potřeba';
        }

        if (value === 'text_document') {
          return 'Textový doklad';
        }

        if (value === 'image_document') {
          return 'Obrázkový doklad / OCR potřeba';
        }

        if (value === 'unsupported_binary') {
          return 'Nepodporovaný vstup';
        }

        return 'Nepodporovaný vstup';
      }

      function buildDocumentHintLabel(value) {
        if (value === 'invoice_like') {
          return 'invoice_like';
        }

        if (value === 'receipt_like') {
          return 'receipt_like';
        }

        if (value === 'payout_statement_like') {
          return 'payout_statement_like';
        }

        return String(value || 'unknown_hint');
      }

      function buildIngestionBranchLabel(value) {
        if (value === 'structured-parser') {
          return 'strukturovaný parser';
        }

        if (value === 'text-document-parser') {
          return 'textový dokument';
        }

        if (value === 'text-pdf-parser') {
          return 'textové PDF';
        }

        if (value === 'ocr-required') {
          return 'OCR potřeba';
        }

        return 'nepodporovaná větev';
      }

      function buildFileRouteSourceLabel(sourceSystem, documentType) {
        if (sourceSystem === 'bank') {
          return 'Bankovní výpis';
        }

        if (sourceSystem === 'booking' && documentType === 'payout_statement') {
          return 'Booking payout statement PDF';
        }

        if (sourceSystem === 'booking') {
          return 'Booking payout report';
        }

        if (sourceSystem === 'airbnb') {
          return 'Airbnb payout report';
        }

        if (sourceSystem === 'comgate') {
          return 'Comgate platební report';
        }

        if (sourceSystem === 'expedia') {
          return 'Expedia payout report';
        }

        if (sourceSystem === 'previo') {
          return 'Previo rezervační export';
        }

        if (documentType === 'invoice' || sourceSystem === 'invoice') {
          return 'Dodavatelská faktura';
        }

        if (documentType === 'receipt' || sourceSystem === 'receipt') {
          return 'Výdajový doklad';
        }

        return 'Nepřiřazený vstup';
      }

      function buildFileRouteOutcomeLabel(file) {
        if (file.status === 'supported') {
          return file.role === 'supplemental'
            ? 'Podporovaný doplňkový payout dokument'
            : 'Rozpoznaný a zpracovaný zdroj';
        }

        if (file.status === 'error') {
          return 'Selhání ingestu';
        }

        if (file.intakeStatus === 'unsupported') {
          return 'Rozpoznaný, ale nepodporovaný vstup';
        }

        return 'Nerozpoznaný vstup';
      }

      function buildDebugBooleanLabel(value) {
        return value ? 'ano' : 'ne';
      }

      function buildDebugOutcomeBucketLabel(file) {
        if (file.status === 'supported') {
          return file.role === 'supplemental'
            ? 'supplemental supported'
            : 'recognized supported';
        }

        if (file.status === 'error') {
          return 'ingest failure';
        }

        if (file.intakeStatus === 'unsupported') {
          return 'unsupported';
        }

        return 'unclassified';
      }

      function buildDebugTextPreviewLabel(value) {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();

        if (!normalized) {
          return 'žádný čitelný text';
        }

        return normalized.length > 120
          ? normalized.slice(0, 117) + '...'
          : normalized;
      }

      function buildDebugClassifierDecisionLabel(file) {
        return String(file.sourceSystem || 'unknown')
          + ' / '
          + String(file.documentType || 'other')
          + ' / '
          + String(file.classificationBasis || 'unknown');
      }

      function buildDebugDecisionReasonLabel(file) {
        const matchedRules = Array.isArray(file.matchedRules) && file.matchedRules.length > 0
          ? file.matchedRules.join(', ')
          : 'žádné matched rules';
        const missingSignals = Array.isArray(file.missingSignals) && file.missingSignals.length > 0
          ? file.missingSignals.join(', ')
          : 'žádné';

        return 'confidence=' + String(file.decisionConfidence || 'none')
          + ' · parser=' + buildDebugBooleanLabel(Boolean(file.parserSupported))
          + ' · matched=' + matchedRules
          + ' · missing=' + missingSignals;
      }

      function syncRuntimeFileIntakeDiagnosticsVisibility() {
        runtimeFileIntakeDiagnosticsSection.hidden = !runtimeFileIntakeDebugMode;
      }

      function collectVisiblePayoutProjection(state) {
        const reviewSections = (state && state.reviewSections) || {};
        const matchedItems = Array.isArray(reviewSections.payoutBatchMatched) ? reviewSections.payoutBatchMatched : [];
        const unmatchedItems = Array.isArray(reviewSections.payoutBatchUnmatched) ? reviewSections.payoutBatchUnmatched : [];

        return {
          sourceFunction: 'buildCompletedVisibleRuntimeState -> collectVisiblePayoutProjection',
          objectPath: 'state.finalPayoutProjection',
          matchedCount: matchedItems.length,
          unmatchedCount: unmatchedItems.length,
          matchedSectionCount: matchedItems.length,
          unmatchedSectionCount: unmatchedItems.length,
          matchedIds: matchedItems.map((item) => String(item.id || '')),
          unmatchedIds: unmatchedItems.map((item) => String(item.id || '')),
          matchedItems,
          unmatchedItems
        };
      }

      function getVisiblePayoutProjection(state) {
        if (state && state.finalPayoutProjection) {
          return state.finalPayoutProjection;
        }

        return collectVisiblePayoutProjection(state);
      }

      function buildPreparedFilesMarkup(state) {
        const fileRoutes = Array.isArray(state.fileRoutes) ? state.fileRoutes : [];
        const recognizedFiles = fileRoutes.filter((file) => file.status === 'supported');
        const unsupportedFiles = fileRoutes.filter((file) => file.status === 'unsupported');
        const errorFiles = fileRoutes.filter((file) => file.status === 'error');
        const preparedFiles = recognizedFiles.length === 0
          ? '<li>Žádné rozpoznané soubory.</li>'
          : recognizedFiles.map((file) => {
            const warningLine = file.warnings && file.warnings.length > 0
              ? '<br /><span class="hint">Varování: ' + escapeHtml(file.warnings.join(' ')) + '</span>'
              : '';

            return '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">'
              + escapeHtml(buildFileRouteOutcomeLabel(file))
              + ' · ' + escapeHtml(buildFileRouteSourceLabel(file.sourceSystem, file.documentType))
              + ' · ' + escapeHtml(buildCapabilityProfileLabel(file.decision && file.decision.capability ? file.decision.capability.profile : 'unknown'))
              + '</span><br /><code>' + escapeHtml(file.sourceDocumentId || '') + '</code><br /><span class="hint">Extrahováno: ' + escapeHtml(String(file.extractedCount || 0)) + '</span>'
              + warningLine
              + '</li>';
          }).join('');
        const unsupportedMarkup = unsupportedFiles.length === 0
          ? '<p class="hint">V tomto běhu se neobjevily žádné nepodporované nebo nerozpoznané soubory.</p>'
          : [
            '<h4>Nepodporované nebo nerozpoznané soubory</h4>',
            '<ul>' + unsupportedFiles.map((file) => {
              const warningLine = file.warnings && file.warnings.length > 0
                ? '<br /><span class="hint">Varování: ' + escapeHtml(file.warnings.join(' ')) + '</span>'
                : '';

              return '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">'
                + escapeHtml(file.reason || 'Soubor nebylo možné bezpečně přiřadit k podporovanému zdroji.')
                + '</span><br /><span class="hint">Typ vstupu: '
                + escapeHtml(buildCapabilityProfileLabel(file.decision && file.decision.capability ? file.decision.capability.profile : 'unknown'))
                + ' · Větev: '
                + escapeHtml(buildIngestionBranchLabel(file.decision ? file.decision.ingestionBranch : 'unsupported'))
                + '</span>'
                + warningLine
                + '</li>';
            }).join('') + '</ul>'
          ].join('');
        const errorMarkup = errorFiles.length === 0
          ? '<p class="hint">V tomto běhu se neobjevily žádné soubory se selháním ingestu.</p>'
          : [
            '<h4>Soubory se selháním ingestu</h4>',
            '<ul>' + errorFiles.map((file) => {
              const warningLine = file.warnings && file.warnings.length > 0
                ? '<br /><span class="hint">Varování: ' + escapeHtml(file.warnings.join(' ')) + '</span>'
                : '';

              return '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">'
                + escapeHtml(file.errorMessage || file.reason || 'Ingest souboru selhal.')
                + '</span><br /><span class="hint">Typ vstupu: '
                + escapeHtml(buildCapabilityProfileLabel(file.decision && file.decision.capability ? file.decision.capability.profile : 'unknown'))
                + ' · Větev: '
                + escapeHtml(buildIngestionBranchLabel(file.decision ? file.decision.ingestionBranch : 'unsupported'))
                + '</span>'
                + warningLine
                + '</li>';
            }).join('') + '</ul>'
          ].join('');

        const extractedRecords = buildExtractedRecordsMarkup(state.extractedRecords, escapeHtml);

        return [
          '<p class="hint">Tato část po spuštění zobrazuje skutečný runtime výsledek místo původního snapshotu.</p>',
          '<p class="hint">Rozpoznáno souborů: ' + escapeHtml(String((state.routingSummary && state.routingSummary.supportedFileCount) || recognizedFiles.length)) + ' · Nepodporováno: ' + escapeHtml(String((state.routingSummary && state.routingSummary.unsupportedFileCount) || unsupportedFiles.length)) + ' · Selhání ingestu: ' + escapeHtml(String((state.routingSummary && state.routingSummary.errorFileCount) || errorFiles.length)) + '</p>',
          '<ul>' + preparedFiles + '</ul>',
          unsupportedMarkup,
          errorMarkup,
          '<h4>Extrahované záznamy</h4>',
          '<ul>' + extractedRecords + '</ul>'
        ].join('');
      }

      function buildReviewSummaryMarkup(state) {
        const payoutProjection = getVisiblePayoutProjection(state);
        const payoutBatchMatchedCount = payoutProjection.matchedCount;
        const payoutBatchUnmatchedCount = payoutProjection.unmatchedCount;
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

      function buildDiagnosticListMarkup(label, values) {
        if (!values || values.length === 0) {
          return '<li><strong>' + escapeHtml(label) + ':</strong> <span class="hint">žádné</span></li>';
        }

        return '<li><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(values.join(', ')) + '</li>';
      }

${showRuntimePayoutDiagnostics ? `
      function collectRuntimePayoutDiagnosticData(state) {
        const runtimeAudit = (state && state.runtimeAudit && state.runtimeAudit.payoutDiagnostics) || {};
        const reviewSections = (state.reviewSections || {});
        const runtimeMatchedTitleSourceValues = ((runtimeAudit.runtimeMatchedTitleSourceValues) || []).length > 0
          ? runtimeAudit.runtimeMatchedTitleSourceValues
          : ((reviewSections.payoutBatchMatched) || [])
            .filter((item) => String(item.title || '').startsWith('Airbnb payout dávka '))
            .map((item) => String(item.title || '').replace(/^Airbnb payout dávka\s+/, ''));
        const runtimeUnmatchedTitleSourceValues = ((runtimeAudit.runtimeUnmatchedTitleSourceValues) || []).length > 0
          ? runtimeAudit.runtimeUnmatchedTitleSourceValues
          : ((reviewSections.payoutBatchUnmatched) || [])
            .filter((item) => String(item.title || '').startsWith('Airbnb payout dávka '))
            .map((item) => String(item.title || '').replace(/^Airbnb payout dávka\s+/, ''));

        return {
          extractedRecordIds: (runtimeAudit.extractedAirbnbPayoutRowRefs) || [],
          extractedRawReferences: (runtimeAudit.extractedAirbnbRawReferences) || [],
          extractedDataReferences: (runtimeAudit.extractedAirbnbDataReferences) || [],
          extractedReferenceCodes: (runtimeAudit.extractedAirbnbReferenceCodes) || [],
          extractedPayoutReferences: (runtimeAudit.extractedAirbnbPayoutReferences) || [],
          workflowPayoutBatchKeys: (runtimeAudit.workflowPayoutBatchKeys) || [],
          workflowPayoutReferences: (runtimeAudit.workflowPayoutReferences) || [],
          reportMatchedReferences: (runtimeAudit.reportMatchedPayoutReferences) || [],
          reportUnmatchedReferences: (runtimeAudit.reportUnmatchedPayoutReferences) || [],
          runtimeMatchedTitleSourceValues,
          runtimeUnmatchedTitleSourceValues,
          runtimeMatchedTitles: ((reviewSections.payoutBatchMatched) || []).map((item) => item.title),
          runtimeUnmatchedTitles: ((reviewSections.payoutBatchUnmatched) || []).map((item) => item.title)
        };
      }

      function buildRuntimePayoutDiagnosticsMarkup(state) {
        const diagnostics = collectRuntimePayoutDiagnosticData(state);

        return [
          '<p class="hint">Tento blok ukazuje přesné runtime hodnoty pro Airbnb payout rows po uploadu, odděleně od interních extracted record ID.</p>',
          '<ul class="diagnostic-list">',
          '<li><strong>Runtime matched refs count:</strong> ' + escapeHtml(String(diagnostics.runtimeMatchedTitleSourceValues.length)) + '</li>',
          '<li><strong>Runtime unmatched refs count:</strong> ' + escapeHtml(String(diagnostics.runtimeUnmatchedTitleSourceValues.length)) + '</li>',
          buildDiagnosticListMarkup('Extracted Airbnb payout row ids', diagnostics.extractedRecordIds),
          buildDiagnosticListMarkup('Extracted Airbnb rawReference values', diagnostics.extractedRawReferences),
          buildDiagnosticListMarkup('Extracted Airbnb data.reference values', diagnostics.extractedDataReferences),
          buildDiagnosticListMarkup('Extracted Airbnb data.referenceCode values', diagnostics.extractedReferenceCodes),
          buildDiagnosticListMarkup('Extracted Airbnb data.payoutReference values', diagnostics.extractedPayoutReferences),
          buildDiagnosticListMarkup('Workflow payout batch keys', diagnostics.workflowPayoutBatchKeys),
          buildDiagnosticListMarkup('Workflow payout references', diagnostics.workflowPayoutReferences),
          buildDiagnosticListMarkup('Report payoutBatchMatches payoutReference values', diagnostics.reportMatchedReferences),
          buildDiagnosticListMarkup('Report unmatchedPayoutBatches payoutReference values', diagnostics.reportUnmatchedReferences),
          buildDiagnosticListMarkup('Runtime matched panel title source values', diagnostics.runtimeMatchedTitleSourceValues),
          buildDiagnosticListMarkup('Runtime unmatched panel title source values', diagnostics.runtimeUnmatchedTitleSourceValues),
          buildDiagnosticListMarkup('Runtime matched titles', diagnostics.runtimeMatchedTitles),
          buildDiagnosticListMarkup('Runtime unmatched titles', diagnostics.runtimeUnmatchedTitles),
          '</ul>'
        ].join('');
      }

      function syncRuntimePayoutDiagnosticsPhase(phase) {
        runtimePayoutDiagnosticsSection.setAttribute('data-runtime-phase', phase);
      }

      function renderCompletedRuntimePayoutDiagnostics(state) {
        runtimePayoutDiagnosticsContent.innerHTML = buildRuntimePayoutDiagnosticsMarkup(state);
      }

      function renderRunningRuntimePayoutDiagnostics() {
        runtimePayoutDiagnosticsContent.innerHTML = '<p class="hint">Diagnostika payout dávek se právě načítá z aktuálního runtime běhu…</p>';
      }

      function renderFailedRuntimePayoutDiagnostics() {
        runtimePayoutDiagnosticsContent.innerHTML = '<p class="hint">Diagnostika payout dávek není k dispozici, protože runtime běh selhal.</p>';
      }

      function renderInitialRuntimePayoutDiagnostics() {
        runtimePayoutDiagnosticsContent.innerHTML = '<p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p><p class="hint">Po spuštění zde uvidíte přesné payout reference a titulky z aktuálního runtime běhu.</p>';
      }
` : ''}
${showRuntimePayoutDiagnostics ? '' : `
      function syncRuntimePayoutDiagnosticsPhase() {}

      function renderCompletedRuntimePayoutDiagnostics() {}

      function renderRunningRuntimePayoutDiagnostics() {}

      function renderFailedRuntimePayoutDiagnostics() {}

      function renderInitialRuntimePayoutDiagnostics() {}
`}
      function buildDocumentFieldExtractionDebugLine(file, fieldKey, label) {
        const summary = file && file.documentExtractionSummary;
        const fieldDebug = summary && summary.fieldExtractionDebug && summary.fieldExtractionDebug[fieldKey];

        if (!fieldDebug) {
          return '';
        }

        const candidateValues = Array.isArray(fieldDebug.candidateValues) && fieldDebug.candidateValues.length > 0
          ? fieldDebug.candidateValues.join(' | ')
          : 'žádné';
        const groupedMatches = Array.isArray(fieldDebug.groupedRowMatches) && fieldDebug.groupedRowMatches.length > 0
          ? fieldDebug.groupedRowMatches.join(' || ')
          : 'žádné';
        const lineWindowMatches = Array.isArray(fieldDebug.lineWindowMatches) && fieldDebug.lineWindowMatches.length > 0
          ? fieldDebug.lineWindowMatches.join(' || ')
          : 'žádné';
        const fallbackMatches = Array.isArray(fieldDebug.fullDocumentFallbackMatches) && fieldDebug.fullDocumentFallbackMatches.length > 0
          ? fieldDebug.fullDocumentFallbackMatches.join(' || ')
          : 'žádné';

        return [
          '<br /><span class="hint">Field ' + escapeHtml(label) + ': winner '
            + escapeHtml(String(fieldDebug.winnerRule || 'n/a'))
            + ' / '
            + escapeHtml(String(fieldDebug.winnerValue || 'n/a'))
            + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' candidates: ' + escapeHtml(candidateValues) + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' grouped: ' + escapeHtml(groupedMatches) + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' line-window: ' + escapeHtml(lineWindowMatches) + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' fallback: ' + escapeHtml(fallbackMatches) + '</span>'
        ].join('');
      }

      function buildInvoiceFieldExtractionDebugMarkup(file) {
        if (!file || !file.documentExtractionSummary || file.documentExtractionSummary.documentKind !== 'invoice') {
          return '';
        }

        return [
          buildDocumentFieldExtractionDebugLine(file, 'referenceNumber', 'referenceNumber'),
          buildDocumentFieldExtractionDebugLine(file, 'issueDate', 'issueDate'),
          buildDocumentFieldExtractionDebugLine(file, 'dueDate', 'dueDate'),
          buildDocumentFieldExtractionDebugLine(file, 'taxableDate', 'taxableDate'),
          buildDocumentFieldExtractionDebugLine(file, 'paymentMethod', 'paymentMethod'),
          buildDocumentFieldExtractionDebugLine(file, 'totalAmount', 'totalAmount')
        ].join('');
      }

      function buildRuntimeFileIntakeDiagnosticsMarkup(state) {
        const diagnostics = (state && state.runtimeAudit && state.runtimeAudit.fileIntakeDiagnostics) || [];

        if (diagnostics.length === 0) {
          return '<p class="hint">Browser intake trace zatím není k dispozici.</p>';
        }

        return '<ul class="diagnostic-list">' + diagnostics.map((file) => [
          '<li>',
          '<strong>' + escapeHtml(file.fileName || '') + '</strong>',
          '<br /><span class="hint">MIME: ' + escapeHtml(file.mimeType || 'neuvedeno') + '</span>',
          '<br /><span class="hint">Browser extraction: ' + escapeHtml(String(file.textExtractionStatus || 'not-attempted')) + ' / ' + escapeHtml(String(file.textExtractionMode || 'unknown')) + '</span>',
          '<br /><span class="hint">Extrahovaný text: ' + escapeHtml(buildDebugBooleanLabel(Boolean(file.extractedTextPresent))) + '</span>',
          '<br /><span class="hint">Délka textu: ' + escapeHtml(String(file.textLength || 0)) + '</span>',
          '<br /><span class="hint">Text preview: ' + escapeHtml(buildDebugTextPreviewLabel(file.textPreview)) + '</span>',
          '<br /><span class="hint">Text tail: ' + escapeHtml(buildDebugTextPreviewLabel(file.textTailPreview)) + '</span>',
          '<br /><span class="hint">Capability: ' + escapeHtml(buildCapabilityProfileLabel(file.capabilityProfile)) + ' / ' + escapeHtml(String(file.capabilityProfile || 'unknown')) + ' / confidence=' + escapeHtml(String(file.capabilityConfidence || 'none')) + '</span>',
          '<br /><span class="hint">Transport profile: ' + escapeHtml(buildCapabilityTransportProfileLabel(file.capabilityTransportProfile)) + ' / ' + escapeHtml(String(file.capabilityTransportProfile || 'unknown_document')) + '</span>',
          '<br /><span class="hint">Document hints: ' + escapeHtml((file.capabilityDocumentHints && file.capabilityDocumentHints.length > 0 ? file.capabilityDocumentHints.map(buildDocumentHintLabel).join(', ') : 'žádné')) + '</span>',
          '<br /><span class="hint">Capability evidence: ' + escapeHtml((file.capabilityEvidence && file.capabilityEvidence.length > 0 ? file.capabilityEvidence.join(', ') : 'žádné')) + '</span>',
          '<br /><span class="hint">Ingestion branch: ' + escapeHtml(buildIngestionBranchLabel(file.ingestionBranch)) + ' / ' + escapeHtml(String(file.ingestionBranch || 'unsupported')) + '</span>',
          '<br /><span class="hint">Keyword hits: ' + escapeHtml((file.keywordHits && file.keywordHits.length > 0 ? file.keywordHits.join(', ') : 'žádné')) + '</span>',
          '<br /><span class="hint">Signály: ' + escapeHtml((file.detectedSignals && file.detectedSignals.length > 0 ? file.detectedSignals.join(', ') : 'žádné')) + '</span>',
          '<br /><span class="hint">Rozhodnutí klasifikátoru: ' + escapeHtml(buildDebugClassifierDecisionLabel(file)) + '</span>',
          '<br /><span class="hint">Decision reason: ' + escapeHtml(buildDebugDecisionReasonLabel(file)) + '</span>',
          file.ingestionReason ? '<br /><span class="hint">Branch reason: ' + escapeHtml(file.ingestionReason) + '</span>' : '',
          file.documentExtractionSummary ? '<br /><span class="hint">Document summary: '
            + escapeHtml(String(file.documentExtractionSummary.documentKind || 'other'))
            + ' · ref ' + escapeHtml(String(file.documentExtractionSummary.referenceNumber || 'n/a'))
            + ' · issuer ' + escapeHtml(String(file.documentExtractionSummary.issuerOrCounterparty || 'n/a'))
            + ' · issue ' + escapeHtml(String(file.documentExtractionSummary.issueDate || 'n/a'))
            + (
              file.documentExtractionSummary.documentKind === 'invoice'
                ? ' · due ' + escapeHtml(String(file.documentExtractionSummary.dueDate || 'n/a'))
                : ' · payment ' + escapeHtml(String(file.documentExtractionSummary.paymentDate || 'n/a'))
            )
            + ' · total ' + escapeHtml(
              (typeof file.documentExtractionSummary.totalAmountMinor === 'number' && file.documentExtractionSummary.totalCurrency)
                ? buildAmountDisplay(file.documentExtractionSummary.totalAmountMinor, file.documentExtractionSummary.totalCurrency)
                : 'n/a'
            )
            + ' · confidence ' + escapeHtml(String(file.documentExtractionSummary.confidence || 'none'))
            + ' · missing ' + escapeHtml(
              Array.isArray(file.documentExtractionSummary.missingRequiredFields) && file.documentExtractionSummary.missingRequiredFields.length > 0
                ? file.documentExtractionSummary.missingRequiredFields.join(', ')
                : 'žádné'
            )
            + '</span>' : '',
          file.documentExtractionSummary && file.documentExtractionSummary.customer
            ? '<br /><span class="hint">Document customer: ' + escapeHtml(String(file.documentExtractionSummary.customer)) + '</span>'
            : '',
          file.documentExtractionSummary && file.documentExtractionSummary.dueDate
            ? '<br /><span class="hint">Document dueDate: ' + escapeHtml(String(file.documentExtractionSummary.dueDate)) + '</span>'
            : '',
          file.documentExtractionSummary && file.documentExtractionSummary.taxableDate
            ? '<br /><span class="hint">Document taxableDate: ' + escapeHtml(String(file.documentExtractionSummary.taxableDate)) + '</span>'
            : '',
          file.documentExtractionSummary && file.documentExtractionSummary.paymentMethod
            ? '<br /><span class="hint">Document paymentMethod: ' + escapeHtml(String(file.documentExtractionSummary.paymentMethod)) + '</span>'
            : '',
          file.documentExtractionSummary && file.documentExtractionSummary.ibanHint
            ? '<br /><span class="hint">Document ibanHint: ' + escapeHtml(String(file.documentExtractionSummary.ibanHint)) + '</span>'
            : '',
          file.documentExtractionSummary
            && typeof file.documentExtractionSummary.vatBaseAmountMinor === 'number'
            && file.documentExtractionSummary.vatBaseCurrency
            ? '<br /><span class="hint">Document VAT base: '
              + escapeHtml(buildAmountDisplay(file.documentExtractionSummary.vatBaseAmountMinor, file.documentExtractionSummary.vatBaseCurrency))
              + '</span>'
            : '',
          file.documentExtractionSummary
            && typeof file.documentExtractionSummary.vatAmountMinor === 'number'
            && file.documentExtractionSummary.vatCurrency
            ? '<br /><span class="hint">Document VAT: '
              + escapeHtml(buildAmountDisplay(file.documentExtractionSummary.vatAmountMinor, file.documentExtractionSummary.vatCurrency))
              + '</span>'
            : '',
          buildInvoiceFieldExtractionDebugMarkup(file),
          file.parserExtractedPaymentId ? '<br /><span class="hint">parserExtracted.paymentId: ' + escapeHtml(file.parserExtractedPaymentId) + '</span>' : '',
          file.parserExtractedPayoutDate ? '<br /><span class="hint">parserExtracted.payoutDate: ' + escapeHtml(file.parserExtractedPayoutDate) + '</span>' : '',
          file.parserExtractedPayoutTotal ? '<br /><span class="hint">parserExtracted.payoutTotal: ' + escapeHtml(file.parserExtractedPayoutTotal) + '</span>' : '',
          file.parserExtractedLocalTotal ? '<br /><span class="hint">parserExtracted.localTotal: ' + escapeHtml(file.parserExtractedLocalTotal) + '</span>' : '',
          file.parserExtractedIbanHint ? '<br /><span class="hint">parserExtracted.ibanHint: ' + escapeHtml(file.parserExtractedIbanHint) + '</span>' : '',
          file.parserExtractedExchangeRate ? '<br /><span class="hint">parserExtracted.exchangeRate: ' + escapeHtml(file.parserExtractedExchangeRate) + '</span>' : '',
          file.validatorInputPaymentId ? '<br /><span class="hint">validatorInput.paymentId: ' + escapeHtml(file.validatorInputPaymentId) + '</span>' : '',
          file.validatorInputPayoutDate ? '<br /><span class="hint">validatorInput.payoutDate: ' + escapeHtml(file.validatorInputPayoutDate) + '</span>' : '',
          file.validatorInputPayoutTotal ? '<br /><span class="hint">validatorInput.payoutTotal: ' + escapeHtml(file.validatorInputPayoutTotal) + '</span>' : '',
          file.parsedPaymentId ? '<br /><span class="hint">Parser paymentId: ' + escapeHtml(file.parsedPaymentId) + '</span>' : '',
          file.parsedPayoutDate ? '<br /><span class="hint">Parser payoutDate: ' + escapeHtml(file.parsedPayoutDate) + '</span>' : '',
          file.parsedPayoutTotal ? '<br /><span class="hint">Parser payoutTotal: ' + escapeHtml(file.parsedPayoutTotal) + '</span>' : '',
          file.parsedLocalTotal ? '<br /><span class="hint">Parser localTotal: ' + escapeHtml(file.parsedLocalTotal) + '</span>' : '',
          file.parsedIbanHint ? '<br /><span class="hint">Parser ibanHint: ' + escapeHtml(file.parsedIbanHint) + '</span>' : '',
          file.parsedExchangeRate ? '<br /><span class="hint">Parser exchangeRate: ' + escapeHtml(file.parsedExchangeRate) + '</span>' : '',
          file.requiredFieldsCheck ? '<br /><span class="hint">Required fields check: ' + escapeHtml(file.requiredFieldsCheck) + '</span>' : '',
          Array.isArray(file.missingFields) ? '<br /><span class="hint">Missing fields: ' + escapeHtml(file.missingFields.length > 0 ? file.missingFields.join(', ') : 'žádné') + '</span>' : '',
          '<br /><span class="hint">Routování: ' + escapeHtml(buildFileRouteSourceLabel(file.sourceSystem, file.documentType)) + ' · ' + escapeHtml(String(file.role || 'primary')) + '</span>',
          '<br /><span class="hint">Finální bucket: ' + escapeHtml(buildDebugOutcomeBucketLabel(file)) + ' · ' + escapeHtml(buildFileRouteOutcomeLabel(file)) + '</span>',
          '</li>'
        ].join('')).join('') + '</ul>';
      }

      function syncRuntimeFileIntakeDiagnosticsPhase(phase) {
        runtimeFileIntakeDiagnosticsSection.setAttribute('data-runtime-phase', phase);
        syncRuntimeFileIntakeDiagnosticsVisibility();
      }

      function renderCompletedRuntimeFileIntakeDiagnostics(state) {
        runtimeFileIntakeDiagnosticsContent.innerHTML = buildRuntimeFileIntakeDiagnosticsMarkup(state);
      }

      function renderRunningRuntimeFileIntakeDiagnostics() {
        runtimeFileIntakeDiagnosticsContent.innerHTML = '<p class="hint">Browser intake trace se právě načítá z aktuálního runtime běhu…</p>';
      }

      function renderFailedRuntimeFileIntakeDiagnostics() {
        runtimeFileIntakeDiagnosticsContent.innerHTML = '<p class="hint">Browser intake trace není k dispozici, protože runtime běh selhal.</p>';
      }

      function renderInitialRuntimeFileIntakeDiagnostics() {
        runtimeFileIntakeDiagnosticsContent.innerHTML = '<p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p><p class="hint">Po spuštění zde uvidíte browser intake handoff pro každý soubor a jeho finální render bucket.</p>';
      }

      function syncRuntimePayoutProjectionDebugVisibility() {
        runtimePayoutProjectionDebugSection.hidden = !runtimePayoutProjectionDebugMode;
      }

      function buildRuntimePayoutProjectionDebugMarkup(state, statusLabel) {
        const payoutProjection = getVisiblePayoutProjection(state);
        const buildInfo = (state && state.runtimeBuildInfo) || initialRuntimeState.runtimeBuildInfo || {};
        const reconciliationSnapshot = (state && state.reconciliationSnapshot) || initialRuntimeState.reconciliationSnapshot || {};
        const reviewSections = (state && state.reviewSections) || {};
        const reportSummary = (state && state.reportSummary) || {};
        const reviewSummary = (state && state.reviewSummary) || {};
        const matchedSectionCount = Array.isArray(reviewSections.payoutBatchMatched) ? reviewSections.payoutBatchMatched.length : 0;
        const unmatchedSectionCount = Array.isArray(reviewSections.payoutBatchUnmatched) ? reviewSections.payoutBatchUnmatched.length : 0;
        const airbnbHistogram = reconciliationSnapshot.airbnbUnmatchedHistogram || {};

        const reconciliationDecisionMarkup = Array.isArray(reconciliationSnapshot.payoutBatchDecisions) && reconciliationSnapshot.payoutBatchDecisions.length > 0
          ? '<li><strong>Raw reconciliation batch decisions:</strong><ul>'
            + reconciliationSnapshot.payoutBatchDecisions.map((decision) => {
              const amountLabel = typeof decision.expectedBankAmountMinor === 'number'
                ? buildAmountDisplay(decision.expectedBankAmountMinor, decision.expectedBankCurrency || decision.currency || 'CZK')
                : buildAmountDisplay(decision.expectedTotalMinor || 0, decision.currency || 'CZK');
              const documentAmountLabel = typeof decision.documentTotalMinor === 'number' && decision.documentCurrency
                ? buildAmountDisplay(decision.documentTotalMinor, decision.documentCurrency)
                : buildAmountDisplay(decision.expectedTotalMinor || 0, decision.currency || 'CZK');
              const matchingSourceLabel = decision.matchingAmountSource === 'booking_local_total'
                ? 'booking_local_total'
                : 'batch_total';
              const sameCurrencyAmountsLabel = Array.isArray(decision.sameCurrencyCandidateAmountMinors)
                ? decision.sameCurrencyCandidateAmountMinors
                  .map((amountMinor) => buildAmountDisplay(amountMinor, decision.expectedBankCurrency || decision.currency || 'CZK'))
                  .join(', ')
                : '';

              return '<li><code>' + escapeHtml(String(decision.payoutBatchKey || '')) + '</code>'
                + ' · ' + escapeHtml(String(decision.platform || 'unknown'))
                + ' · document total ' + escapeHtml(documentAmountLabel)
                + ' · bank matching total ' + escapeHtml(amountLabel)
                + ' · matching source ' + escapeHtml(matchingSourceLabel)
                + (decision.selectionMode ? ' · selection mode ' + escapeHtml(String(decision.selectionMode)) : '')
                + ' · exact amount pre-date/evidence ' + escapeHtml(decision.exactAmountMatchExistsBeforeDateEvidence ? 'ano' : 'ne')
                + (sameCurrencyAmountsLabel ? ' · same-currency bank amounts ' + escapeHtml(sameCurrencyAmountsLabel) : '')
                + (typeof decision.nearestAmountDeltaMinor === 'number'
                  ? ' · nearest amount delta ' + escapeHtml(buildAmountDisplay(decision.nearestAmountDeltaMinor, decision.expectedBankCurrency || decision.currency || 'CZK'))
                  : '')
                + ' · component rows ' + escapeHtml(String(decision.componentRowCount || 0))
                + (Array.isArray(decision.componentRowAmountMinors) && decision.componentRowAmountMinors.length > 0
                  ? ' · component row amounts '
                    + escapeHtml(decision.componentRowAmountMinors.map((amountMinor) =>
                      buildAmountDisplay(amountMinor, decision.expectedBankCurrency || decision.currency || 'CZK')
                    ).join(', '))
                  : '')
                + ' · payout date ' + escapeHtml(String(decision.payoutDate || 'n/a'))
                + ' · candidates ' + escapeHtml(String(decision.bankCandidateCountBeforeFiltering || 0))
                + ' -> amount/currency ' + escapeHtml(String(decision.bankCandidateCountAfterAmountCurrency || 0))
                + ' -> date ' + escapeHtml(String(decision.bankCandidateCountAfterDateWindow || 0))
                + ' -> evidence ' + escapeHtml(String(decision.bankCandidateCountAfterEvidenceFiltering || 0))
                + ' · matched ' + escapeHtml(decision.matched ? 'ano' : 'ne')
                + (decision.matchedBankTransactionId ? ' · bank line ' + escapeHtml(String(decision.matchedBankTransactionId)) : '')
                + (decision.noMatchReason ? ' · reason ' + escapeHtml(String(decision.noMatchReason)) : '')
                + '</li>';
            }).join('')
            + '</ul></li>'
          : '';
        const inboundBankTransactionsMarkup = Array.isArray(reconciliationSnapshot.inboundBankTransactions) && reconciliationSnapshot.inboundBankTransactions.length > 0
          ? '<li><strong>Inbound bank transaction snapshot:</strong><ul>'
            + reconciliationSnapshot.inboundBankTransactions.map((transaction) =>
              '<li><code>' + escapeHtml(String(transaction.transactionId || '')) + '</code>'
              + ' · ' + escapeHtml(String(transaction.bookedAt || ''))
              + ' · ' + escapeHtml(buildAmountDisplay(transaction.amountMinor || 0, transaction.currency || 'CZK'))
              + ' · ' + escapeHtml(String(transaction.counterparty || 'bez protiúčtu'))
              + ' · ' + escapeHtml(String(transaction.reference || 'bez reference'))
              + '</li>'
            ).join('')
            + '</ul></li>'
          : '';

        return [
          '<p class="hint">Tento blok čte build marker i finální payout projekci ze stejného state objektu, který používá summary pás i detailní payout sekce.</p>',
          '<ul class="diagnostic-list">',
          '<li><strong>Stav renderu:</strong> ' + escapeHtml(statusLabel) + '</li>',
          '<li><strong>Git commit:</strong> <code>' + escapeHtml(String(buildInfo.gitCommitHash || 'unknown')) + '</code></li>',
          '<li><strong>Build timestamp:</strong> <code>' + escapeHtml(String(buildInfo.buildTimestamp || generatedAt)) + '</code></li>',
          '<li><strong>Runtime module version:</strong> <code>' + escapeHtml(String(buildInfo.runtimeModuleVersion || buildFingerprintVersion)) + '</code></li>',
          '<li><strong>Renderer version:</strong> <code>' + escapeHtml(String(buildInfo.rendererVersion || ${JSON.stringify(WEB_DEMO_RENDERER_MARKER)})) + '</code></li>',
          '<li><strong>Payout projection version:</strong> <code>' + escapeHtml(String(buildInfo.payoutProjectionVersion || ${JSON.stringify(WEB_DEMO_PAYOUT_PROJECTION_MARKER)})) + '</code></li>',
          '<li><strong>Reconciliation source:</strong> <code>' + escapeHtml(String(reconciliationSnapshot.sourceFunction || 'buildBrowserRuntimeUploadStateFromFiles -> batch.reconciliation')) + '</code></li>',
          '<li><strong>Reconciliation object path:</strong> <code>' + escapeHtml(String(reconciliationSnapshot.objectPath || 'state.reconciliationSnapshot')) + '</code></li>',
          '<li><strong>Raw reconciliation matched:</strong> ' + escapeHtml(String(reconciliationSnapshot.matchedCount || 0)) + '</li>',
          '<li><strong>Raw reconciliation unmatched:</strong> ' + escapeHtml(String(reconciliationSnapshot.unmatchedCount || 0)) + '</li>',
          '<li><strong>Airbnb unmatched histogram:</strong> noExactAmount=' + escapeHtml(String(airbnbHistogram.noExactAmount || 0))
            + ' · dateRejected=' + escapeHtml(String(airbnbHistogram.dateRejected || 0))
            + ' · evidenceRejected=' + escapeHtml(String(airbnbHistogram.evidenceRejected || 0))
            + ' · ambiguous=' + escapeHtml(String(airbnbHistogram.ambiguous || 0))
            + ' · other=' + escapeHtml(String(airbnbHistogram.other || 0))
            + '</li>',
          '<li><strong>Projection source:</strong> <code>' + escapeHtml(String(payoutProjection.sourceFunction || 'collectVisiblePayoutProjection')) + '</code></li>',
          '<li><strong>Projection object path:</strong> <code>' + escapeHtml(String(payoutProjection.objectPath || 'state.finalPayoutProjection')) + '</code></li>',
          '<li><strong>Matched payout count:</strong> ' + escapeHtml(String(payoutProjection.matchedCount || 0)) + '</li>',
          '<li><strong>Unmatched payout count:</strong> ' + escapeHtml(String(payoutProjection.unmatchedCount || 0)) + '</li>',
          '<li><strong>Raw reportSummary matched:</strong> ' + escapeHtml(String(reportSummary.payoutBatchMatchCount || 0)) + '</li>',
          '<li><strong>Raw reportSummary unmatched:</strong> ' + escapeHtml(String(reportSummary.unmatchedPayoutBatchCount || 0)) + '</li>',
          '<li><strong>Raw reviewSummary matched:</strong> ' + escapeHtml(String(reviewSummary.payoutBatchMatchCount || 0)) + '</li>',
          '<li><strong>Raw reviewSummary unmatched:</strong> ' + escapeHtml(String(reviewSummary.unmatchedPayoutBatchCount || 0)) + '</li>',
          '<li><strong>Matched review section count:</strong> ' + escapeHtml(String(matchedSectionCount)) + '</li>',
          '<li><strong>Unmatched review section count:</strong> ' + escapeHtml(String(unmatchedSectionCount)) + '</li>',
          buildDiagnosticListMarkup('Raw reconciliation matched payout batch ids', reconciliationSnapshot.matchedPayoutBatchKeys || []),
          buildDiagnosticListMarkup('Raw reconciliation unmatched payout batch ids', reconciliationSnapshot.unmatchedPayoutBatchKeys || []),
          reconciliationDecisionMarkup,
          inboundBankTransactionsMarkup,
          buildDiagnosticListMarkup('Matched payout batch ids', payoutProjection.matchedIds || []),
          buildDiagnosticListMarkup('Unmatched payout batch ids', payoutProjection.unmatchedIds || []),
          '</ul>'
        ].join('');
      }

      function syncRuntimePayoutProjectionDebugPhase(phase) {
        runtimePayoutProjectionDebugSection.setAttribute('data-runtime-phase', phase);
        syncRuntimePayoutProjectionDebugVisibility();
      }

      function renderCompletedRuntimePayoutProjectionDebug(state) {
        runtimePayoutProjectionDebugContent.innerHTML = buildRuntimePayoutProjectionDebugMarkup(state, 'completed');
      }

      function renderRunningRuntimePayoutProjectionDebug() {
        runtimePayoutProjectionDebugContent.innerHTML = buildRuntimePayoutProjectionDebugMarkup(initialRuntimeState, 'running');
      }

      function renderFailedRuntimePayoutProjectionDebug() {
        runtimePayoutProjectionDebugContent.innerHTML = buildRuntimePayoutProjectionDebugMarkup(initialRuntimeState, 'failed');
      }

      function renderInitialRuntimePayoutProjectionDebug() {
        runtimePayoutProjectionDebugContent.innerHTML = buildRuntimePayoutProjectionDebugMarkup(initialRuntimeState, 'placeholder');
      }

      function buildFingerprintMarkup(state) {
        const payoutProjection = getVisiblePayoutProjection(state);
        const payoutBatchMatchedCount = payoutProjection.matchedCount;
        const payoutBatchUnmatchedCount = payoutProjection.unmatchedCount;

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

      function buildCompletedVisibleRuntimeState(state) {
        const fileRoutes = Array.isArray(state.fileRoutes) ? state.fileRoutes : [];
        const hasRoutedFiles = fileRoutes.length > 0;
        const payoutProjection = collectVisiblePayoutProjection(state);

        return {
          ...state,
          runtimeBuildInfo: state.runtimeBuildInfo || initialRuntimeState.runtimeBuildInfo,
          routingSummary: {
            uploadedFileCount: hasRoutedFiles ? fileRoutes.length : Number(state.routingSummary?.uploadedFileCount ?? 0),
            supportedFileCount: hasRoutedFiles ? fileRoutes.filter((file) => file.status === 'supported').length : Number(state.routingSummary?.supportedFileCount ?? 0),
            unsupportedFileCount: hasRoutedFiles ? fileRoutes.filter((file) => file.status === 'unsupported').length : Number(state.routingSummary?.unsupportedFileCount ?? 0),
            errorFileCount: hasRoutedFiles ? fileRoutes.filter((file) => file.status === 'error').length : Number(state.routingSummary?.errorFileCount ?? 0)
          },
          fileRoutes,
          preparedFiles: Array.isArray(state.preparedFiles) ? state.preparedFiles : [],
          extractedRecords: Array.isArray(state.extractedRecords) ? state.extractedRecords : [],
          supportedExpenseLinks: Array.isArray(state.supportedExpenseLinks) ? state.supportedExpenseLinks : [],
          reportSummary: {
            ...(state.reportSummary || {}),
            payoutBatchMatchCount: payoutProjection.matchedCount,
            unmatchedPayoutBatchCount: payoutProjection.unmatchedCount
          },
          reviewSummary: {
            ...(state.reviewSummary || {}),
            payoutBatchMatchCount: payoutProjection.matchedCount,
            unmatchedPayoutBatchCount: payoutProjection.unmatchedCount
          },
          reviewSections: state.reviewSections || {},
          finalPayoutProjection: payoutProjection,
          reportTransactions: (state.reportTransactions || []).map((transaction) => ({
            ...transaction,
            labelCs: buildVisibleTransactionLabel(transaction.transactionId, transaction.source)
          })),
          exportFiles: Array.isArray(state.exportFiles) ? state.exportFiles : []
        };
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
        const visibleState = state && state.finalPayoutProjection
          ? state
          : {
            ...state,
            runtimeBuildInfo: (state && state.runtimeBuildInfo) || initialRuntimeState.runtimeBuildInfo,
            finalPayoutProjection: collectVisiblePayoutProjection(state)
          };
        const payoutProjection = getVisiblePayoutProjection(visibleState);

        preparedFilesSection.setAttribute('data-runtime-phase', phase);
        reviewSummarySection.setAttribute('data-runtime-phase', phase);
        reportPreviewBody.setAttribute('data-runtime-phase', phase);
  matchedPayoutBatchesSection.setAttribute('data-runtime-phase', phase);
  unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', phase);
  reservationSettlementOverviewSection.setAttribute('data-runtime-phase', phase);
  ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', phase);
        unmatchedReservationsSection.setAttribute('data-runtime-phase', phase);
        exportHandoffSection.setAttribute('data-runtime-phase', phase);
        syncRuntimePayoutDiagnosticsPhase(phase);
        syncRuntimeFileIntakeDiagnosticsPhase(phase);
        syncRuntimePayoutProjectionDebugPhase(phase);

        if (runtimeSummaryUploadedFiles) {
          runtimeSummaryUploadedFiles.textContent = String(visibleState.routingSummary?.uploadedFileCount ?? (visibleState.fileRoutes || []).length ?? (visibleState.preparedFiles || []).length);
        }
        if (runtimeSummaryNormalizedTransactions) {
          runtimeSummaryNormalizedTransactions.textContent = String(visibleState.reviewSummary?.normalizedTransactionCount ?? visibleState.reportSummary?.normalizedTransactionCount ?? 0);
        }
        if (runtimeSummaryReviewItems) {
          runtimeSummaryReviewItems.textContent = String(visibleState.reviewSummary?.exceptionCount ?? 0);
        }
        if (runtimeSummaryExportFiles) {
          runtimeSummaryExportFiles.textContent = String((visibleState.exportFiles || []).length);
        }
        if (buildFingerprint) {
          buildFingerprint.innerHTML = buildFingerprintMarkup(visibleState);
        }

        preparedFilesContent.innerHTML = buildPreparedFilesMarkup(visibleState);
        reviewSummaryContent.innerHTML = buildReviewSummaryMarkup(visibleState);
        reportPreviewBody.innerHTML = buildReportRowsMarkup(visibleState);
  matchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup(payoutProjection.matchedItems || []);
  unmatchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup(payoutProjection.unmatchedItems || []);
        reservationSettlementOverviewContent.innerHTML = buildSettlementOverviewMarkup((visibleState.reviewSections && visibleState.reviewSections.reservationSettlementOverview) || []);
        ancillarySettlementOverviewContent.innerHTML = buildSettlementOverviewMarkup((visibleState.reviewSections && visibleState.reviewSections.ancillarySettlementOverview) || []);
        unmatchedReservationsContent.innerHTML = buildUnmatchedReservationDetailsMarkup(visibleState);
        exportHandoffContent.innerHTML = buildExportMarkup(visibleState);
        renderCompletedRuntimePayoutDiagnostics(visibleState);
        renderCompletedRuntimeFileIntakeDiagnostics(visibleState);
        renderCompletedRuntimePayoutProjectionDebug(visibleState);

        if (runtimeOperatorDebugMode) {
          window.__hotelFinanceLastVisibleRuntimeState = visibleState;
          window.__hotelFinanceLastVisiblePayoutProjection = payoutProjection;
        }
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
        syncRuntimePayoutDiagnosticsPhase('running');
        syncRuntimeFileIntakeDiagnosticsPhase('running');
        syncRuntimePayoutProjectionDebugPhase('running');

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
        renderRunningRuntimePayoutDiagnostics();
        renderRunningRuntimeFileIntakeDiagnostics();
        renderRunningRuntimePayoutProjectionDebug();
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
        syncRuntimePayoutDiagnosticsPhase('failed');
        syncRuntimeFileIntakeDiagnosticsPhase('failed');
        syncRuntimePayoutProjectionDebugPhase('failed');

        preparedFilesContent.innerHTML = '<p><strong>Runtime běh selhal.</strong></p><p class="hint">Viditelné sekce nebylo možné aktualizovat, protože sdílený browser runtime skončil chybou.</p>';
        reviewSummaryContent.innerHTML = '<p class="hint">Chyba runtime běhu: ' + message + '</p>';
        reportPreviewBody.innerHTML = '<tr><td colspan="4"><span class="hint">Runtime běh selhal: ' + message + '</span></td></tr>';
  matchedPayoutBatchesContent.innerHTML = '<p class="hint">Spárované payout dávky nejsou k dispozici, protože runtime běh selhal.</p>';
  unmatchedPayoutBatchesContent.innerHTML = '<p class="hint">Nespárované payout dávky nejsou k dispozici, protože runtime běh selhal.</p>';
        reservationSettlementOverviewContent.innerHTML = '<p class="hint">Přehled hlavních rezervací není k dispozici, protože runtime běh selhal.</p>';
        ancillarySettlementOverviewContent.innerHTML = '<p class="hint">Přehled doplňkových položek není k dispozici, protože runtime běh selhal.</p>';
        unmatchedReservationsContent.innerHTML = '<p class="hint">Detail nespárovaných rezervací není k dispozici, protože runtime běh selhal.</p>';
        exportHandoffContent.innerHTML = '<p class="hint">Exportní handoff není k dispozici, protože runtime běh selhal.</p>';
        renderFailedRuntimePayoutDiagnostics();
        renderFailedRuntimeFileIntakeDiagnostics();
        renderFailedRuntimePayoutProjectionDebug();
        if (buildFingerprint) {
          buildFingerprint.innerHTML = 'Build: <strong>' + escapeHtml(buildFingerprintVersion) + '</strong> · Renderer: <strong>' + escapeHtml(${JSON.stringify(WEB_DEMO_RENDERER_MARKER)}) + '</strong> · Payout matched: <strong>chyba</strong> · Payout unmatched: <strong>chyba</strong>';
        }
      }

      function renderInitialVisibleState() {
        preparedFilesSection.setAttribute('data-runtime-phase', 'placeholder');
        reviewSummarySection.setAttribute('data-runtime-phase', 'placeholder');
        reportPreviewBody.setAttribute('data-runtime-phase', 'placeholder');
        matchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'placeholder');
        unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'placeholder');
        reservationSettlementOverviewSection.setAttribute('data-runtime-phase', 'placeholder');
        ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', 'placeholder');
        unmatchedReservationsSection.setAttribute('data-runtime-phase', 'placeholder');
        exportHandoffSection.setAttribute('data-runtime-phase', 'placeholder');
        syncRuntimePayoutDiagnosticsPhase('placeholder');
        syncRuntimeFileIntakeDiagnosticsPhase('placeholder');
        syncRuntimePayoutProjectionDebugPhase('placeholder');

        runtimeStageCopy.innerHTML = 'Stav stránky: <strong>čeká na uploadovaný runtime běh</strong>. Bez vybraných souborů se nezobrazuje žádný předvyplněný payout výsledek.';
        if (runtimeSummaryUploadedFiles) runtimeSummaryUploadedFiles.textContent = '0';
        if (runtimeSummaryNormalizedTransactions) runtimeSummaryNormalizedTransactions.textContent = '0';
        if (runtimeSummaryReviewItems) runtimeSummaryReviewItems.textContent = '0';
        if (runtimeSummaryExportFiles) runtimeSummaryExportFiles.textContent = '0';
        if (buildFingerprint) {
          buildFingerprint.innerHTML = 'Build: <strong>' + escapeHtml(buildFingerprintVersion) + '</strong> · Renderer: <strong>' + escapeHtml(${JSON.stringify(WEB_DEMO_RENDERER_MARKER)}) + '</strong> · Payout matched: <strong>žádný upload</strong> · Payout unmatched: <strong>žádný upload</strong>';
        }

        preparedFilesContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh.</p>';
        reviewSummaryContent.innerHTML = '<p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p><p class="hint">Kontrolní přehled se naplní až po spuštění nad vybranými soubory.</p>';
        reportPreviewBody.innerHTML = '<tr><td colspan="4"><span class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek pro náhled reportu.</span></td></tr>';
        matchedPayoutBatchesContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro spárované payout dávky.</p>';
        unmatchedPayoutBatchesContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro nespárované payout dávky.</p>';
        reservationSettlementOverviewContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro hlavní rezervace.</p>';
        ancillarySettlementOverviewContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro doplňkové položky.</p>';
        unmatchedReservationsContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro nespárované rezervace.</p>';
        exportHandoffContent.innerHTML = '<p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek pro exportní handoff.</p><p class="hint">Exporty vzniknou až ze skutečně spuštěného běhu nad vybranými soubory.</p>';
        renderInitialRuntimePayoutDiagnostics();
        renderInitialRuntimeFileIntakeDiagnostics();
        renderInitialRuntimePayoutProjectionDebug();
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
          runtimeStageCopy.innerHTML = 'Stav stránky: <strong>runtime ještě není připravený</strong>. Viditelné sekce zůstávají v neutrálním stavu bez předvyplněných payout výsledků.';
          renderInitialVisibleState();
          return;
        }

        try {
          const state = await browserRuntime.buildRuntimeState({
            files,
            month: monthInput.value,
            generatedAt
          });
          const visibleState = buildCompletedVisibleRuntimeState(state);
          applyVisibleRuntimeState(visibleState, 'completed');
          runtimeOutput.innerHTML = renderMainRuntimeState(visibleState);
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

function resolveGitCommitHash(): string {
  try {
    const gitMetadataPath = resolve('.git')
    const gitDirectory = resolveGitDirectory(gitMetadataPath)
    const headPath = resolve(gitDirectory, 'HEAD')

    if (!existsSync(headPath)) {
      return 'unknown'
    }

    const headContent = readFileSync(headPath, 'utf8').trim()

    if (!headContent) {
      return 'unknown'
    }

    if (!headContent.startsWith('ref:')) {
      return headContent
    }

    const refName = headContent.replace(/^ref:\s*/, '')
    const refPath = resolve(gitDirectory, refName)

    if (existsSync(refPath)) {
      return readFileSync(refPath, 'utf8').trim()
    }

    const packedRefsPath = resolve(gitDirectory, 'packed-refs')

    if (!existsSync(packedRefsPath)) {
      return 'unknown'
    }

    const packedRefLine = readFileSync(packedRefsPath, 'utf8')
      .split(/\r?\n/)
      .find((line) => !line.startsWith('#') && !line.startsWith('^') && line.endsWith(` ${refName}`))

    return packedRefLine?.split(' ')[0]?.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

function resolveGitDirectory(gitMetadataPath: string): string {
  try {
    const metadataContent = readFileSync(gitMetadataPath, 'utf8').trim()

    if (metadataContent.startsWith('gitdir:')) {
      return resolve(dirname(gitMetadataPath), metadataContent.replace(/^gitdir:\s*/, ''))
    }
  } catch {
    return gitMetadataPath
  }

  return gitMetadataPath
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
