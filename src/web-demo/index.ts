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
import { applyNodeRuntimeBuildInfoEnv, resolveNodeRuntimeBuildInfo } from '../shared/build-provenance.node'
import { formatAmountMinorCs } from '../shared/money'
import { resolvePreviousMonthKey as resolvePreviousMonthKeyForBrowserFlow } from './month-key'

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
    const [runtimeAssetPath] = await emitBrowserRuntimeAssets(resolved, { generatedAt })
    const runtimeBuildInfo = resolveNodeRuntimeBuildInfo({
      generatedAt,
      runtimeModuleVersion: runtimeAssetPath.replace(/^\.\//, '').replace(/\.js$/, ''),
      rendererVersion: WEB_DEMO_RENDERER_MARKER,
      payoutProjectionVersion: WEB_DEMO_PAYOUT_PROJECTION_MARKER
    })
    applyNodeRuntimeBuildInfoEnv(runtimeBuildInfo)
    const html = renderOperatorWebDemoHtml({
      generatedAt,
      uploadFlowHtml: uploadFlow.html,
      browserRun,
      runtimeAssetPath,
      runtimeBuildInfo,
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
    runtimeBuildInfo: resolveNodeRuntimeBuildInfo({
      generatedAt,
      runtimeModuleVersion: 'browser-runtime',
      rendererVersion: WEB_DEMO_RENDERER_MARKER,
      payoutProjectionVersion: WEB_DEMO_PAYOUT_PROJECTION_MARKER
    }),
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
  runtimeBuildInfo: {
    gitCommitHash: string
    gitCommitShortSha: string
    buildTimestamp: string
    buildBranch: string
    buildSource: string
    runtimeModuleVersion: string
    rendererVersion?: string
    payoutProjectionVersion?: string
  }
  debugMode?: boolean
}): string {
  const buildFingerprintVersion = input.runtimeAssetPath.replace(/^\.\//, '').replace(/\.js$/, '')
  const resolvePreviousMonthKeyFunctionSource = resolvePreviousMonthKeyForBrowserFlow.toString()
  const runtimeBuildInfo = {
    ...input.runtimeBuildInfo,
    runtimeModuleVersion: input.runtimeBuildInfo.runtimeModuleVersion || buildFingerprintVersion,
    rendererVersion: input.runtimeBuildInfo.rendererVersion || WEB_DEMO_RENDERER_MARKER,
    payoutProjectionVersion: input.runtimeBuildInfo.payoutProjectionVersion || WEB_DEMO_PAYOUT_PROJECTION_MARKER
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
    carryoverSourceSnapshot: {
      sourceMonthKey: '',
      payoutBatches: []
    },
    carryoverDebug: {
      sourceMonthKey: '',
      currentMonthKey: '',
      loadedPayoutBatchCount: 0,
      loadedPayoutBatchKeysSample: [],
      matchingInputPayoutBatchCount: 0,
      matchingInputPayoutBatchKeysSample: [],
      matcherCarryoverCandidateExists: false,
      matcherCarryoverRejectedReason: '',
      matchedCount: 0,
      unmatchedCount: 0
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
      expenseMatched: [],
      expenseNeedsReview: [],
      expenseUnmatchedDocuments: [],
      expenseUnmatchedOutflows: [],
      expenseUnmatchedInflows: [],
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
      main.operator-shell {
        width: min(100%, calc(100vw - 64px));
        max-width: none;
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
      .month-field {
        max-width: 17rem;
      }
      .month-input-shell {
        position: relative;
        width: min(100%, 15rem);
        max-width: 100%;
      }
      .month-input-shell input[type="month"] {
        width: 100%;
        min-height: 48px;
        padding-right: 58px;
        box-sizing: border-box;
      }
      .month-input-shell input[type="month"]:focus-visible {
        outline: 3px solid #9bbcff;
        outline-offset: 2px;
      }
      .month-picker-trigger {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 40px;
        min-width: 40px;
        height: 40px;
        padding: 0;
        border-radius: 10px;
        background: #eaf2ff;
        color: #174ea6;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .month-picker-trigger:hover {
        background: #dce9ff;
      }
      .month-picker-trigger:focus-visible {
        outline: 3px solid #9bbcff;
        outline-offset: 2px;
      }
      .month-picker-trigger::before {
        content: "";
        width: 18px;
        height: 18px;
        border: 2px solid currentColor;
        border-radius: 4px;
        box-sizing: border-box;
        background: linear-gradient(to bottom, currentColor 0, currentColor 3px, transparent 3px, transparent 100%);
      }
      .month-input-shell input[type="month"]::-webkit-inner-spin-button {
        display: none;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 16px;
      }
      .expense-detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        align-items: start;
        grid-auto-flow: row;
      }
      @media (min-width: 1320px) {
        .expense-detail-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (max-width: 1080px) {
        body {
          padding: 18px;
        }
        main.operator-shell {
          width: 100%;
        }
        .expense-detail-grid {
          grid-template-columns: 1fr;
        }
      }
      .detail-view[hidden],
      .main-dashboard-view[hidden] {
        display: none;
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
      .detail-summary-block {
        background: #f7f9fc;
        border-radius: 14px;
        padding: 16px;
        margin-bottom: 16px;
      }
      .detail-summary-block ul {
        margin: 0;
      }
      .detail-page-table {
        margin-bottom: 16px;
      }
      .detail-page-actions {
        margin-bottom: 12px;
      }
      .detail-page-actions .secondary-button {
        background: #eaf2ff;
        color: #174ea6;
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
      .expense-item {
        border: 1px solid #e4ebf6;
        border-radius: 12px;
        background: #fbfdff;
        padding: 18px;
        margin-bottom: 14px;
      }
      .expense-item-header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .expense-item-title {
        font-size: 17px;
        line-height: 1.45;
        font-weight: 700;
      }
      .expense-comparison {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
        align-items: start;
      }
      .expense-zone {
        border-radius: 12px;
        background: #f7f9fc;
        border: 1px solid #dce6f5;
        padding: 14px 16px;
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .expense-zone h6 {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .expense-zone ul {
        margin: 0;
        padding-left: 18px;
      }
      .expense-zone li {
        margin-bottom: 6px;
      }
      .expense-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }
      .expense-actions button {
        flex: 0 0 auto;
        padding: 10px 14px;
        font-size: 14px;
      }
      .expense-actions .danger-button {
        background: #fff1f3;
        color: #b42318;
      }
      .manual-match-summary {
        border: 1px solid #dce6f5;
        background: #f8fafc;
      }
      .manual-match-summary[hidden] {
        display: none;
      }
      .manual-match-summary-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .manual-match-summary-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .manual-match-summary-actions .secondary-button,
      .manual-match-group button.secondary-button {
        background: #eaf2ff;
        color: #174ea6;
      }
      .manual-match-summary-actions .danger-button,
      .manual-match-group .danger-button {
        background: #fff1f3;
        color: #b42318;
      }
      .manual-match-note-input {
        width: 100%;
        margin-top: 10px;
      }
      .manual-match-selection {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: #174ea6;
        font-weight: 700;
      }
      .manual-match-selection input {
        width: auto;
        margin: 0;
      }
      .manual-match-groups {
        display: grid;
        gap: 12px;
      }
      .manual-match-group {
        border: 1px solid #dce6f5;
        border-radius: 12px;
        background: #fbfdff;
        padding: 14px 16px;
      }
      .manual-match-group-header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }
      .manual-match-group-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
      }
      .manual-match-group-meta {
        color: #52627a;
      }
      .manual-match-group ul {
        margin: 10px 0 0;
      }
      .manual-audit {
        display: inline-block;
        margin-bottom: 10px;
        padding: 5px 10px;
        border-radius: 999px;
        background: #eef2ff;
        color: #4338ca;
        font-size: 12px;
        font-weight: 700;
      }
      .expense-summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 12px;
      }
      .expense-summary-tile {
        background: #ffffff;
        border: 1px solid #dce6f5;
        border-radius: 12px;
        padding: 14px 16px;
      }
      .expense-summary-tile strong {
        display: block;
        font-size: 26px;
        line-height: 1.1;
        margin-bottom: 6px;
      }
      .expense-summary-tile span {
        display: block;
        color: #52627a;
      }
      .expense-detail-toolbar {
        display: grid;
        gap: 1rem;
        margin: 1rem 0 1.25rem;
        padding: 1rem;
        border: 1px solid #dce6f5;
        border-radius: 14px;
        background: #f8fafc;
      }
      .expense-filter-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .expense-filter-buttons button {
        border-radius: 999px;
        padding: 0.45rem 0.85rem;
      }
      .expense-filter-buttons button.is-active {
        background: #0f766e;
        border-color: #0f766e;
        color: #ffffff;
      }
      .expense-toolbar-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.75rem 1rem;
        align-items: end;
      }
      .expense-toolbar-grid input,
      .expense-toolbar-grid select {
        width: 100%;
      }
      .expense-visible-count {
        margin: 0;
        color: #52627a;
      }
      .status-badge {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .status-badge.confirmed { background: #e7f6ec; color: #0f7a32; }
      .status-badge.weak { background: #fff4dd; color: #946200; }
      .status-badge.review { background: #fff4dd; color: #946200; }
      .status-badge.unmatched { background: #ffe3e8; color: #b42318; }
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
    <main id="app-shell" class="operator-shell">
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
          <div class="month-field">
            <label for="month-label">Označení měsíce</label>
            <div class="month-input-shell">
              <input id="month-label" type="month" />
              <button id="month-picker-trigger-button" type="button" class="secondary-button month-picker-trigger" aria-label="Otevřít výběr měsíce"></button>
            </div>
            <p class="hint">Např. <code>2026-03</code> pro březen 2026.</p>
            <p class="hint">Soubory i ruční rozhodnutí se ukládají zvlášť pro každý měsíc a další upload je do stejného měsíce přidává místo úplného přepsání.</p>
          </div>
        </div>
        <p>
          <button id="prepare-upload" type="button">Spustit přípravu a měsíční workflow</button>
          <button id="clear-month-workspace-button" type="button" class="secondary-button">Vymazat tento měsíc</button>
        </p>
        <div id="runtime-output" class="operator-panel runtime-output">
          <p class="hint">Měsíční workflow zatím neběželo. Výsledek se zobrazí až po výběru skutečných souborů a spuštění uploadu.</p>
        </div>
        <div id="runtime-stage-banner" class="operator-panel">
          <h3>Aktuální testovatelný stav v prohlížeči</h3>
          <p id="runtime-stage-copy" class="hint">Tlačítko spouští stejný browser-only sdílený tok jako v <code>src/upload-web</code>: přípravu souborů, runtime stav, kontrolu, report a exportní handoff. Pracovní stav se ukládá lokálně po měsících bez backendu.</p>
          <div class="summary-grid">
            <div class="metric"><strong id="runtime-summary-uploaded-files">0</strong><br />Nahrané soubory</div>
            <div class="metric"><strong id="runtime-summary-normalized-transactions">0</strong><br />Normalizované transakce</div>
            <div class="metric"><strong id="runtime-summary-review-items">0</strong><br />Položky ke kontrole</div>
            <div class="metric"><strong id="runtime-summary-export-files">0</strong><br />Připravené exporty</div>
          </div>
        </div>
      </section>

      <section id="main-dashboard-view" class="main-dashboard-view">
        <section class="card">
          <h2>Kompaktní přehled měsíčního běhu</h2>
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
            <section id="control-detail-summary-section" class="metric" data-runtime-phase="placeholder">
              <h3>Detail kontrolních sekcí</h3>
              <div id="control-detail-launcher-summary-content">
                <p class="hint">Po spuštění se zde ukážou souhrnné počty pro payout dávky, rezervace a kontrolní sekce.</p>
              </div>
              <p><button id="open-control-detail-button" type="button">Detail kontrolních sekcí</button></p>
              <p class="hint">Otevře interní detail payout a kontrolních bucketů bez dlouhého scrollování na hlavní stránce.</p>
            </section>
            <section id="expense-review-summary-section" class="metric" data-runtime-phase="placeholder">
              <h3>Kontrola výdajů a dokladů</h3>
              <div id="expense-review-summary-content">
                <p class="hint">Po spuštění se zde ukáže přehled bucketů pro doklady a odchozí bankovní platby.</p>
              </div>
              <p><button id="open-expense-review-button" type="button">Kontrola výdajů a dokladů</button></p>
              <p class="hint">Otevře interní detail s porovnáním Doklad / Stav a důkazy / Banka.</p>
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
        <section id="runtime-workspace-merge-debug-section" class="card" data-runtime-phase="placeholder" hidden>
          <h2>Diagnostika merge měsíčního workspace</h2>
          <div id="runtime-workspace-merge-debug-content">
            <p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p>
            <p class="hint">Po spuštění zde uvidíte month key, persisted count, selected count, merged count, visible trace count a render source.</p>
          </div>
        </section>
      </section>

      <section id="control-detail-view" class="card detail-view" hidden>
        <div class="detail-page-actions">
          <button id="back-from-control-detail-button" type="button" class="secondary-button">Zpět na hlavní přehled</button>
        </div>
        <h2>Detail kontrolních sekcí</h2>
        <div id="control-detail-page-summary-content" class="detail-summary-block">
          <p class="hint">Po spuštění se zde zobrazí souhrn počtů pro payout dávky a kontrolní bucket sekce.</p>
        </div>
        <div id="control-manual-match-summary" class="detail-summary-block manual-match-summary" hidden>
          <p class="hint">Ruční spárování se zobrazí po výběru nespárovaných položek.</p>
        </div>
        <section class="detail-panel detail-page-table">
          <h3>Náhled reportu</h3>
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
        <div class="detail-grid">
          <section id="control-manual-matched-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Ručně spárováno</h3>
            <div id="control-manual-matched-content">
              <p class="hint">Po spuštění se zde objeví ruční match groups vytvořené z nespárovaných položek.</p>
            </div>
          </section>
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

      <section id="expense-detail-view" class="card detail-view" hidden>
        <div class="detail-page-actions">
          <button id="back-from-expense-detail-button" type="button" class="secondary-button">Zpět na hlavní přehled</button>
        </div>
        <h2>Kontrola výdajů a dokladů</h2>
        <div id="expense-detail-summary-content" class="detail-summary-block">
          <p class="hint">Po spuštění se zde zobrazí souhrnné počty pro doklady a bankovní pohyby ke kontrole.</p>
        </div>
        <div id="expense-manual-match-summary" class="detail-summary-block manual-match-summary" hidden>
          <p class="hint">Ruční spárování se zobrazí po výběru nespárovaných položek.</p>
        </div>
        <section class="expense-detail-toolbar">
          <div class="expense-filter-buttons" id="expense-detail-filter-buttons">
            <button id="expense-filter-all" type="button">Vše</button>
            <button id="expense-filter-expenseMatched" type="button">Spárované výdaje</button>
            <button id="expense-filter-expenseNeedsReview" type="button">Výdaje ke kontrole</button>
            <button id="expense-filter-expenseUnmatchedDocuments" type="button">Nespárované doklady</button>
            <button id="expense-filter-expenseUnmatchedOutflows" type="button">Nespárované odchozí platby</button>
            <button id="expense-filter-expenseUnmatchedInflows" type="button">Nespárované příchozí platby</button>
            <button id="expense-filter-manualConfirmed" type="button">Ručně potvrzené</button>
            <button id="expense-filter-manualRejected" type="button">Ručně zamítnuté</button>
          </div>
          <div class="expense-toolbar-grid">
            <div>
              <label for="expense-detail-search">Hledat v dokladech a bance</label>
              <input id="expense-detail-search" type="search" placeholder="Lenner, VS, částka, IBAN…" />
            </div>
            <div>
              <label for="expense-detail-sort">Řazení</label>
              <select id="expense-detail-sort">
                <option value="newest">Nejnovější nahoře</option>
                <option value="oldest">Nejstarší nahoře</option>
                <option value="amount-desc">Nejvyšší částka</option>
                <option value="amount-asc">Nejnižší částka</option>
              </select>
            </div>
          </div>
          <p id="expense-detail-visible-count" class="expense-visible-count">Zobrazeno položek: 0</p>
        </section>
        <div id="expense-detail-layout" class="detail-grid expense-detail-grid">
          <section id="expense-matched-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Spárované výdaje</h3>
            <div id="expense-matched-content">
              <p class="hint">Po spuštění se zde zobrazí spárované výdaje.</p>
            </div>
          </section>
          <section id="expense-review-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Výdaje ke kontrole</h3>
            <div id="expense-review-content">
              <p class="hint">Po spuštění se zde zobrazí výdaje ke kontrole.</p>
            </div>
          </section>
          <section id="expense-manual-matched-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Ručně spárováno</h3>
            <div id="expense-manual-matched-content">
              <p class="hint">Po spuštění se zde objeví ruční match groups vytvořené z nespárovaných položek.</p>
            </div>
          </section>
          <section id="expense-unmatched-documents-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Nespárované doklady</h3>
            <div id="expense-unmatched-documents-content">
              <p class="hint">Po spuštění se zde zobrazí nespárované doklady.</p>
            </div>
          </section>
          <section id="expense-unmatched-outflows-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Nespárované odchozí platby</h3>
            <div id="expense-unmatched-outflows-content">
              <p class="hint">Po spuštění se zde zobrazí nespárované odchozí platby.</p>
            </div>
          </section>
          <section id="expense-unmatched-inflows-section" class="detail-panel" data-runtime-phase="placeholder">
            <h3>Nespárované příchozí platby</h3>
            <div id="expense-unmatched-inflows-content">
              <p class="hint">Po spuštění se zde zobrazí nespárované příchozí platby.</p>
            </div>
          </section>
        </div>
      </section>
    </main>
    <script>
      ${renderBrowserRuntimeClientBootstrap(input.runtimeAssetPath)}

  const fileInput = document.getElementById('monthly-files');
  const appShell = document.getElementById('app-shell');
      const monthInput = document.getElementById('month-label');
      const monthPickerTriggerButton = document.getElementById('month-picker-trigger-button');
      const button = document.getElementById('prepare-upload');
      const clearMonthWorkspaceButton = document.getElementById('clear-month-workspace-button');
      const runtimeOutput = document.getElementById('runtime-output');
  const runtimeStageCopy = document.getElementById('runtime-stage-copy');
  const buildFingerprint = document.getElementById('build-fingerprint');
  const runtimeSummaryUploadedFiles = document.getElementById('runtime-summary-uploaded-files');
  const runtimeSummaryNormalizedTransactions = document.getElementById('runtime-summary-normalized-transactions');
  const runtimeSummaryReviewItems = document.getElementById('runtime-summary-review-items');
  const runtimeSummaryExportFiles = document.getElementById('runtime-summary-export-files');
  const mainDashboardView = document.getElementById('main-dashboard-view');
  const controlDetailView = document.getElementById('control-detail-view');
  const expenseDetailView = document.getElementById('expense-detail-view');
  const preparedFilesSection = document.getElementById('prepared-files-section');
  const preparedFilesContent = document.getElementById('prepared-files-content');
  const reviewSummarySection = document.getElementById('review-summary-section');
  const reviewSummaryContent = document.getElementById('review-summary-content');
  const controlDetailSummarySection = document.getElementById('control-detail-summary-section');
  const controlDetailLauncherSummaryContent = document.getElementById('control-detail-launcher-summary-content');
  const controlDetailPageSummaryContent = document.getElementById('control-detail-page-summary-content');
  const controlManualMatchSummary = document.getElementById('control-manual-match-summary');
  const controlManualMatchedSection = document.getElementById('control-manual-matched-section');
  const controlManualMatchedContent = document.getElementById('control-manual-matched-content');
  const openControlDetailButton = document.getElementById('open-control-detail-button');
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
  const expenseMatchedSection = document.getElementById('expense-matched-section');
  const expenseMatchedContent = document.getElementById('expense-matched-content');
  const expenseReviewSection = document.getElementById('expense-review-section');
  const expenseReviewContent = document.getElementById('expense-review-content');
  const expenseUnmatchedDocumentsSection = document.getElementById('expense-unmatched-documents-section');
  const expenseUnmatchedDocumentsContent = document.getElementById('expense-unmatched-documents-content');
  const expenseUnmatchedOutflowsSection = document.getElementById('expense-unmatched-outflows-section');
  const expenseUnmatchedOutflowsContent = document.getElementById('expense-unmatched-outflows-content');
  const expenseUnmatchedInflowsSection = document.getElementById('expense-unmatched-inflows-section');
  const expenseUnmatchedInflowsContent = document.getElementById('expense-unmatched-inflows-content');
  const expenseManualMatchSummary = document.getElementById('expense-manual-match-summary');
  const expenseManualMatchedSection = document.getElementById('expense-manual-matched-section');
  const expenseManualMatchedContent = document.getElementById('expense-manual-matched-content');
  const expenseReviewSummarySection = document.getElementById('expense-review-summary-section');
  const expenseReviewSummaryContent = document.getElementById('expense-review-summary-content');
  const expenseDetailSummaryContent = document.getElementById('expense-detail-summary-content');
  const expenseDetailSearchInput = document.getElementById('expense-detail-search');
  const expenseDetailSortSelect = document.getElementById('expense-detail-sort');
  const expenseDetailVisibleCount = document.getElementById('expense-detail-visible-count');
  const openExpenseReviewButton = document.getElementById('open-expense-review-button');
  const backFromControlDetailButton = document.getElementById('back-from-control-detail-button');
  const backFromExpenseDetailButton = document.getElementById('back-from-expense-detail-button');
  const exportHandoffSection = document.getElementById('export-handoff-section');
  const exportHandoffContent = document.getElementById('export-handoff-content');${runtimePayoutDiagnosticsBindings}${runtimeFileIntakeDiagnosticsBindings}
  const runtimePayoutProjectionDebugSection = document.getElementById('runtime-payout-projection-debug-section');
  const runtimePayoutProjectionDebugContent = document.getElementById('runtime-payout-projection-debug-content');
  const runtimeWorkspaceMergeDebugSection = document.getElementById('runtime-workspace-merge-debug-section');
  const runtimeWorkspaceMergeDebugContent = document.getElementById('runtime-workspace-merge-debug-content');
      const generatedAt = ${JSON.stringify(input.generatedAt)};
  const buildFingerprintVersion = ${JSON.stringify(buildFingerprintVersion)};
  const initialRuntimeState = ${JSON.stringify(initialRuntimeState)};
      let browserRuntime;
      const debugModeFromQuery = new URLSearchParams(window.location.search).get('debug') === '1';
      const debugModeFromHash = /(^#debug(?:=1)?$|[?&#]debug(?:=1)?(?:$|[&#]))/i.test(String(window.location.hash || ''));
      const runtimeOperatorDebugMode = Boolean(initialRuntimeState.debugMode || debugModeFromQuery || debugModeFromHash);
      const runtimeFileIntakeDebugMode = runtimeOperatorDebugMode;
      const runtimePayoutProjectionDebugMode = runtimeOperatorDebugMode;
      let currentExpenseReviewState = initialRuntimeState;
      let currentExpenseReviewOverrides = [];
      let currentManualMatchGroups = [];
      let currentSelectedManualMatchItemIds = [];
      let currentManualMatchDraftNote = '';
      let currentManualMatchConfirmMode = false;
      let currentExportVisibleState = initialRuntimeState;
      let currentExportPreset = 'complete';
      let currentExpenseDetailFilter = 'all';
      let currentExpenseDetailSearch = '';
      let currentExpenseDetailSort = 'newest';
      let currentVisibleRuntimePhase = 'placeholder';
      let expenseDetailControlsWired = false;
      let currentWorkspaceMonth = '';
      let currentClearedWorkspaceMonth = '';
      let currentWorkspaceFiles = [];
      let currentPendingSelectedFiles = [];
      let currentPendingSelectedFileNames = [];
      let currentPendingSelectedMonthKey = '';
      let currentFileSelectionEventToken = 0;
      let currentExplicitSelectionResetMarker = 'none';
      let currentSelectionInvariantWarning = 'none';
      let currentSelectionInvariantGuardApplied = 'no';
      const expenseReviewOverrideStoragePrefix = 'hotel-finance-control:expense-review-overrides:';
      const monthlyWorkspaceStorageKey = 'hotel-finance-control:monthly-browser-workspaces:v1';
      const monthlyWorkspaceDeletionMarkerPrefix = 'hotel-finance-control:monthly-browser-workspace-cleared:v1:';
      const monthlyWorkspaceIndexedDbName = 'hotel-finance-control';
      const monthlyWorkspaceIndexedDbStoreName = 'monthly-browser-workspaces';
      let currentWorkspaceRenderDebug = buildWorkspaceRenderDebugState({});
      let currentWorkspacePersistencePromise = Promise.resolve({
        status: 'not-applicable',
        backendName: 'none',
        storageKeyUsed: monthlyWorkspaceStorageKey,
        saveCompletedBeforeRerunInputAssembly: 'not-applicable',
        saveAttempted: false,
        errorMessage: ''
      });
      let currentWorkspacePersistenceState = {
        status: 'not-applicable',
        backendName: 'none',
        storageKeyUsed: '',
        saveCompletedBeforeRerunInputAssembly: 'not-applicable',
        saveAttempted: false,
        errorMessage: ''
      };
      let monthlyWorkspacePersistenceBackendPromise;
      let currentWorkspaceViewRequestToken = 0;
      let currentLaterMonthCarryoverResolutionState = buildLaterMonthCarryoverResolutionState();

      function getExpenseReviewOverrideStorage() {
        try {
          return window && window.localStorage ? window.localStorage : undefined;
        } catch {
          return undefined;
        }
      }

      function normalizeWorkspaceMonths(months) {
        return Array.from(new Set((Array.isArray(months) ? months : [])
          .map((month) => String(month || ''))
          .filter(Boolean)))
          .sort();
      }

      function loadMonthlyWorkspaceStore() {
        const storage = getExpenseReviewOverrideStorage();

        if (!storage) {
          return { lastUsedMonth: '', workspaceMonths: [], workspaces: {} };
        }

        try {
          const rawValue = storage.getItem(monthlyWorkspaceStorageKey);

          if (!rawValue) {
            return { lastUsedMonth: '', workspaceMonths: [], workspaces: {} };
          }

          const parsed = JSON.parse(rawValue);
          const legacyWorkspaces = parsed && typeof parsed.workspaces === 'object' && parsed.workspaces
            ? parsed.workspaces
            : {};
          const workspaceMonths = normalizeWorkspaceMonths(
            Array.isArray(parsed && parsed.workspaceMonths)
              ? parsed.workspaceMonths
              : Object.keys(legacyWorkspaces)
          );

          return {
            lastUsedMonth: parsed && typeof parsed.lastUsedMonth === 'string' ? parsed.lastUsedMonth : '',
            workspaceMonths,
            workspaces: legacyWorkspaces
          };
        } catch {
          return { lastUsedMonth: '', workspaceMonths: [], workspaces: {} };
        }
      }

      function saveMonthlyWorkspaceStore(store, options) {
        const storage = getExpenseReviewOverrideStorage();
        const includeWorkspaces = Boolean(options && options.includeWorkspaces);
        const workspaceMonths = normalizeWorkspaceMonths(
          store && Array.isArray(store.workspaceMonths)
            ? store.workspaceMonths
            : Object.keys(store && typeof store.workspaces === 'object' && store.workspaces ? store.workspaces : {})
        );

        if (!storage) {
          return;
        }

        try {
          const payload = {
            lastUsedMonth: typeof store && typeof store.lastUsedMonth === 'string' ? store.lastUsedMonth : '',
            workspaceMonths
          };

          if (includeWorkspaces) {
            payload.workspaces = store && typeof store.workspaces === 'object' && store.workspaces ? store.workspaces : {};
          }

          storage.setItem(monthlyWorkspaceStorageKey, JSON.stringify(payload));
        } catch {
          // Browser workspace persistence is best-effort only.
        }
      }

      function pickFallbackWorkspaceMonth(workspaces) {
        const months = normalizeWorkspaceMonths(Array.isArray(workspaces) ? workspaces : Object.keys(workspaces || {}));
        return months.length > 0 ? months[months.length - 1] : '';
      }

      function getLegacyMonthWorkspaceFromStore(store, month) {
        const normalizedMonth = String(month || '');

        return normalizedMonth && store && store.workspaces && store.workspaces[normalizedMonth]
          ? store.workspaces[normalizedMonth]
          : undefined;
      }

      function buildWorkspacePersistenceStorageKey(backendName, month) {
        const normalizedBackend = String(backendName || 'none');
        const normalizedMonth = String(month || '');

        if (normalizedBackend === 'indexedDb') {
          return 'indexeddb://' + monthlyWorkspaceIndexedDbName + '/' + monthlyWorkspaceIndexedDbStoreName + '/' + normalizedMonth;
        }

        if (normalizedBackend === 'legacyLocalStorage') {
          return monthlyWorkspaceStorageKey + '::' + normalizedMonth;
        }

        if (normalizedBackend === 'none') {
          return monthlyWorkspaceStorageKey;
        }

        return normalizedBackend + '://' + normalizedMonth;
      }

      function buildWorkspaceDeletionMarkerStorageKey(month) {
        return monthlyWorkspaceDeletionMarkerPrefix + String(month || '');
      }

      function getWorkspaceDeletionMarker(month) {
        const normalizedMonth = String(month || '');
        const storage = getExpenseReviewOverrideStorage();

        if (!normalizedMonth || !storage || typeof storage.getItem !== 'function') {
          return '';
        }

        try {
          return String(storage.getItem(buildWorkspaceDeletionMarkerStorageKey(normalizedMonth)) || '');
        } catch {
          return '';
        }
      }

      function setWorkspaceDeletionMarker(month, clearedAt) {
        const normalizedMonth = String(month || '');
        const normalizedClearedAt = String(clearedAt || '');
        const storage = getExpenseReviewOverrideStorage();

        if (!normalizedMonth || !normalizedClearedAt || !storage || typeof storage.setItem !== 'function') {
          return;
        }

        try {
          storage.setItem(buildWorkspaceDeletionMarkerStorageKey(normalizedMonth), normalizedClearedAt);
        } catch {
          // Browser workspace persistence is best-effort only.
        }
      }

      function clearWorkspaceDeletionMarker(month) {
        const normalizedMonth = String(month || '');
        const storage = getExpenseReviewOverrideStorage();

        if (!normalizedMonth || !storage || typeof storage.removeItem !== 'function') {
          return;
        }

        try {
          storage.removeItem(buildWorkspaceDeletionMarkerStorageKey(normalizedMonth));
        } catch {
          // Browser workspace persistence is best-effort only.
        }
      }

      function runIndexedDbRequest(request) {
        return new Promise((resolve, reject) => {
          if (!request) {
            resolve(undefined);
            return;
          }

          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = () => {
            reject(request.error || new Error('IndexedDB request failed.'));
          };
        });
      }

      function openMonthlyWorkspaceIndexedDb() {
        if (monthlyWorkspacePersistenceBackendPromise) {
          return monthlyWorkspacePersistenceBackendPromise;
        }

        monthlyWorkspacePersistenceBackendPromise = new Promise((resolve) => {
          const injectedBackend = window && window.__hotelFinanceMonthlyWorkspacePersistence;

          if (injectedBackend
            && typeof injectedBackend.loadWorkspace === 'function'
            && typeof injectedBackend.saveWorkspace === 'function'
            && typeof injectedBackend.deleteWorkspace === 'function'
            && typeof injectedBackend.listMonths === 'function') {
            resolve({
              backendName: String(injectedBackend.backendName || 'indexedDb'),
              async loadWorkspace(month) {
                return injectedBackend.loadWorkspace(String(month || ''));
              },
              async saveWorkspace(workspace) {
                return injectedBackend.saveWorkspace(workspace);
              },
              async deleteWorkspace(month) {
                return injectedBackend.deleteWorkspace(String(month || ''));
              },
              async listMonths() {
                return injectedBackend.listMonths();
              }
            });
            return;
          }

          if (!(window && window.indexedDB && typeof window.indexedDB.open === 'function')) {
            resolve(undefined);
            return;
          }

          try {
            const request = window.indexedDB.open(monthlyWorkspaceIndexedDbName, 1);

            request.onupgradeneeded = () => {
              const database = request.result;

              if (!database.objectStoreNames.contains(monthlyWorkspaceIndexedDbStoreName)) {
                database.createObjectStore(monthlyWorkspaceIndexedDbStoreName, { keyPath: 'month' });
              }
            };

            request.onsuccess = () => {
              const database = request.result;

              resolve({
                backendName: 'indexedDb',
                async loadWorkspace(month) {
                  const normalizedMonth = String(month || '');

                  if (!normalizedMonth) {
                    return undefined;
                  }

                  return new Promise((innerResolve, innerReject) => {
                    try {
                      const transaction = database.transaction(monthlyWorkspaceIndexedDbStoreName, 'readonly');
                      const store = transaction.objectStore(monthlyWorkspaceIndexedDbStoreName);
                      const readRequest = store.get(normalizedMonth);

                      readRequest.onsuccess = () => {
                        const result = readRequest.result;
                        innerResolve(result && result.workspace ? result.workspace : result);
                      };
                      readRequest.onerror = () => {
                        innerReject(readRequest.error || new Error('IndexedDB workspace load failed.'));
                      };
                    } catch (error) {
                      innerReject(error);
                    }
                  });
                },
                async saveWorkspace(workspace) {
                  return new Promise((innerResolve, innerReject) => {
                    try {
                      const transaction = database.transaction(monthlyWorkspaceIndexedDbStoreName, 'readwrite');
                      const store = transaction.objectStore(monthlyWorkspaceIndexedDbStoreName);
                      store.put({
                        month: String(workspace && workspace.month || ''),
                        workspace
                      });
                      transaction.oncomplete = () => {
                        innerResolve(undefined);
                      };
                      transaction.onerror = () => {
                        innerReject(transaction.error || new Error('IndexedDB workspace save failed.'));
                      };
                    } catch (error) {
                      innerReject(error);
                    }
                  });
                },
                async deleteWorkspace(month) {
                  const normalizedMonth = String(month || '');

                  if (!normalizedMonth) {
                    return false;
                  }

                  return new Promise((innerResolve, innerReject) => {
                    try {
                      const transaction = database.transaction(monthlyWorkspaceIndexedDbStoreName, 'readwrite');
                      const store = transaction.objectStore(monthlyWorkspaceIndexedDbStoreName);
                      const deleteRequest = store.delete(normalizedMonth);

                      deleteRequest.onsuccess = () => {
                        innerResolve(true);
                      };
                      deleteRequest.onerror = () => {
                        innerReject(deleteRequest.error || new Error('IndexedDB workspace delete failed.'));
                      };
                    } catch (error) {
                      innerReject(error);
                    }
                  });
                },
                async listMonths() {
                  return new Promise((innerResolve, innerReject) => {
                    try {
                      const transaction = database.transaction(monthlyWorkspaceIndexedDbStoreName, 'readonly');
                      const store = transaction.objectStore(monthlyWorkspaceIndexedDbStoreName);

                      if (typeof store.getAllKeys === 'function') {
                        const keysRequest = store.getAllKeys();

                        keysRequest.onsuccess = () => {
                          innerResolve(normalizeWorkspaceMonths(keysRequest.result || []));
                        };
                        keysRequest.onerror = () => {
                          innerReject(keysRequest.error || new Error('IndexedDB workspace month listing failed.'));
                        };
                        return;
                      }

                      const months = [];
                      const cursorRequest = store.openCursor();

                      cursorRequest.onsuccess = () => {
                        const cursor = cursorRequest.result;

                        if (!cursor) {
                          innerResolve(normalizeWorkspaceMonths(months));
                          return;
                        }

                        months.push(String(cursor.key || ''));
                        cursor.continue();
                      };
                      cursorRequest.onerror = () => {
                        innerReject(cursorRequest.error || new Error('IndexedDB workspace cursor failed.'));
                      };
                    } catch (error) {
                      innerReject(error);
                    }
                  });
                }
              });
            };

            request.onerror = () => {
              resolve(undefined);
            };
          } catch {
            resolve(undefined);
          }
        });

        return monthlyWorkspacePersistenceBackendPromise;
      }

      function buildWorkspacePersistenceState(input) {
        return {
          status: String(input && input.status || 'not-applicable'),
          backendName: String(input && input.backendName || 'none'),
          storageKeyUsed: String(input && input.storageKeyUsed || monthlyWorkspaceStorageKey),
          saveCompletedBeforeRerunInputAssembly: String(input && input.saveCompletedBeforeRerunInputAssembly || 'not-applicable'),
          saveAttempted: Boolean(input && input.saveAttempted),
          errorMessage: String(input && input.errorMessage || '')
        };
      }

      async function awaitCurrentWorkspacePersistence() {
        try {
          const result = await currentWorkspacePersistencePromise;
          currentWorkspacePersistenceState = buildWorkspacePersistenceState(result);
          return currentWorkspacePersistenceState;
        } catch (error) {
          currentWorkspacePersistenceState = buildWorkspacePersistenceState({
            status: 'failed',
            backendName: currentWorkspacePersistenceState.backendName || 'none',
            storageKeyUsed: currentWorkspacePersistenceState.storageKeyUsed || monthlyWorkspaceStorageKey,
            saveCompletedBeforeRerunInputAssembly: 'no',
            saveAttempted: true,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          return currentWorkspacePersistenceState;
        }
      }

      function buildWorkspaceFileId(record) {
        return [
          String(record && record.fileName || ''),
          String(record && record.mimeType || ''),
          String(record && record.encoding || ''),
          String(record && record.contentHash || '')
        ].join('::');
      }

      function buildWorkspaceRenderDebugState(input) {
        return {
          explicitClearResetMarker: String(input && input.explicitClearResetMarker || 'none'),
          invariantWarning: String(input && input.invariantWarning || 'none'),
          invariantGuardApplied: String(input && input.invariantGuardApplied || 'no'),
          fileSelectionEventToken: Number(input && input.fileSelectionEventToken || 0),
          incomingBrowserFileListNames: Array.isArray(input && input.incomingBrowserFileListNames)
            ? input.incomingBrowserFileListNames.slice(0, 20).map((item) => String(item || ''))
            : [],
          incomingBrowserFileListCount: Number(input && input.incomingBrowserFileListCount || 0),
          previousPendingSelectedFileNames: Array.isArray(input && input.previousPendingSelectedFileNames)
            ? input.previousPendingSelectedFileNames.slice(0, 20).map((item) => String(item || ''))
            : [],
          previousPendingSelectedFileCount: Number(input && input.previousPendingSelectedFileCount || 0),
          nextPendingSelectedFileNames: Array.isArray(input && input.nextPendingSelectedFileNames)
            ? input.nextPendingSelectedFileNames.slice(0, 20).map((item) => String(item || ''))
            : [],
          nextPendingSelectedFileCount: Number(input && input.nextPendingSelectedFileCount || 0),
          appendVsReplaceDecision: String(input && input.appendVsReplaceDecision || 'not-applicable'),
          dedupeKeyUsed: String(input && input.dedupeKeyUsed || 'not-applicable'),
          visiblePendingFileNamesBeforeRun: Array.isArray(input && input.visiblePendingFileNamesBeforeRun)
            ? input.visiblePendingFileNamesBeforeRun.slice(0, 20).map((item) => String(item || ''))
            : [],
          visiblePendingFileCountBeforeRun: Number(input && input.visiblePendingFileCountBeforeRun || 0),
          selectedFileNamesHandedIntoRunAction: Array.isArray(input && input.selectedFileNamesHandedIntoRunAction)
            ? input.selectedFileNamesHandedIntoRunAction.slice(0, 20).map((item) => String(item || ''))
            : [],
          selectedFileCountHandedIntoRunAction: Number(input && input.selectedFileCountHandedIntoRunAction || 0),
          requestToken: Number(input && input.requestToken || 0),
          restoreToken: Number(input && input.restoreToken || 0),
          restoreSource: String(input && input.restoreSource || 'not-applicable'),
          currentMonthKey: String(input && input.currentMonthKey || ''),
          selectedFileNames: Array.isArray(input && input.selectedFileNames)
            ? input.selectedFileNames.slice(0, 20).map((item) => String(item || ''))
            : [],
          persistedWorkspaceFileCountBeforeRerun: Number(input && input.persistedWorkspaceFileCountBeforeRerun || 0),
          persistedWorkspaceFileNamesBeforeRerun: Array.isArray(input && input.persistedWorkspaceFileNamesBeforeRerun)
            ? input.persistedWorkspaceFileNamesBeforeRerun.slice(0, 20).map((item) => String(item || ''))
            : [],
          selectedBatchFileCount: Number(input && input.selectedBatchFileCount || 0),
          mergedFileCountUsedForRerun: Number(input && input.mergedFileCountUsedForRerun || 0),
          mergedFileNamesUsedForRerun: Array.isArray(input && input.mergedFileNamesUsedForRerun)
            ? input.mergedFileNamesUsedForRerun.slice(0, 20).map((item) => String(item || ''))
            : [],
          visibleTraceFileCount: Number(input && input.visibleTraceFileCount || 0),
          visibleTraceFileNamesAfterRender: Array.isArray(input && input.visibleTraceFileNamesAfterRender)
            ? input.visibleTraceFileNamesAfterRender.slice(0, 20).map((item) => String(item || ''))
            : [],
          renderSource: String(input && input.renderSource || 'selectedFiles'),
          workspacePersistenceBackend: String(input && input.workspacePersistenceBackend || 'none'),
          storageKeyUsed: String(input && input.storageKeyUsed || monthlyWorkspaceStorageKey),
          saveCompletedBeforeRerunInputAssembly: String(input && input.saveCompletedBeforeRerunInputAssembly || 'not-applicable'),
          lastSaveStatus: String(input && input.lastSaveStatus || 'not-applicable'),
          carryoverPreviousMonthKeyResolved: String(input && input.carryoverPreviousMonthKeyResolved || ''),
          carryoverPreviousMonthWorkspaceFound: String(input && input.carryoverPreviousMonthWorkspaceFound || 'ne'),
          carryoverPreviousMonthMatchedPayoutBatchCount: Number(input && input.carryoverPreviousMonthMatchedPayoutBatchCount || 0),
          carryoverPreviousMonthUnmatchedPayoutBatchCount: Number(input && input.carryoverPreviousMonthUnmatchedPayoutBatchCount || 0),
          carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: Array.isArray(input && input.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample)
            ? input.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.slice(0, 5).map((item) => String(item || ''))
            : [],
          carryoverPreviousMonthUnmatchedOnly: String(input && input.carryoverPreviousMonthUnmatchedOnly || 'no'),
          carryoverSourceMonth: String(input && input.carryoverSourceMonth || ''),
          carryoverCurrentMonth: String(input && input.carryoverCurrentMonth || ''),
          carryoverLoadedPayoutBatchCount: Number(input && input.carryoverLoadedPayoutBatchCount || 0),
          carryoverLoadedPayoutBatchIdsSample: Array.isArray(input && input.carryoverLoadedPayoutBatchIdsSample)
            ? input.carryoverLoadedPayoutBatchIdsSample.slice(0, 5).map((item) => String(item || ''))
            : [],
          carryoverMatchingInputPayoutBatchCount: Number(input && input.carryoverMatchingInputPayoutBatchCount || 0),
          carryoverMatchingInputPayoutBatchIdsSample: Array.isArray(input && input.carryoverMatchingInputPayoutBatchIdsSample)
            ? input.carryoverMatchingInputPayoutBatchIdsSample.slice(0, 5).map((item) => String(item || ''))
            : [],
          carryoverMatcherCandidateExisted: String(input && input.carryoverMatcherCandidateExisted || 'ne'),
          carryoverMatcherRejectedReason: String(input && input.carryoverMatcherRejectedReason || ''),
          carryoverSourceClearMarker: String(input && input.carryoverSourceClearMarker || ''),
          carryoverMatchedCount: Number(input && input.carryoverMatchedCount || 0),
          carryoverUnmatchedCount: Number(input && input.carryoverUnmatchedCount || 0),
          mergedFileSample: Array.isArray(input && input.mergedFileSample)
            ? input.mergedFileSample.slice(0, 5).map((item) => String(item || ''))
            : [],
          checkpointLog: Array.isArray(input && input.checkpointLog)
            ? input.checkpointLog.slice(-20).map((entry) => ({
              phase: String(entry && entry.phase || 'unknown'),
              requestToken: Number(entry && entry.requestToken || 0),
              restoreToken: Number(entry && entry.restoreToken || 0),
              restoreSource: String(entry && entry.restoreSource || 'not-applicable'),
              currentMonthKey: String(entry && entry.currentMonthKey || ''),
              workspacePersistenceBackend: String(entry && entry.workspacePersistenceBackend || 'none'),
              storageKeyUsed: String(entry && entry.storageKeyUsed || monthlyWorkspaceStorageKey),
              saveCompletedBeforeRerunInputAssembly: String(entry && entry.saveCompletedBeforeRerunInputAssembly || 'not-applicable'),
              carryoverPreviousMonthKeyResolved: String(entry && entry.carryoverPreviousMonthKeyResolved || ''),
              carryoverPreviousMonthWorkspaceFound: String(entry && entry.carryoverPreviousMonthWorkspaceFound || 'ne'),
              carryoverPreviousMonthMatchedPayoutBatchCount: Number(entry && entry.carryoverPreviousMonthMatchedPayoutBatchCount || 0),
              carryoverPreviousMonthUnmatchedPayoutBatchCount: Number(entry && entry.carryoverPreviousMonthUnmatchedPayoutBatchCount || 0),
              carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: Array.isArray(entry && entry.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample) ? entry.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.slice(0, 5).map((item) => String(item || '')) : [],
              carryoverPreviousMonthUnmatchedOnly: String(entry && entry.carryoverPreviousMonthUnmatchedOnly || 'no'),
              carryoverSourceMonth: String(entry && entry.carryoverSourceMonth || ''),
              carryoverCurrentMonth: String(entry && entry.carryoverCurrentMonth || ''),
              carryoverLoadedPayoutBatchCount: Number(entry && entry.carryoverLoadedPayoutBatchCount || 0),
              carryoverLoadedPayoutBatchIdsSample: Array.isArray(entry && entry.carryoverLoadedPayoutBatchIdsSample) ? entry.carryoverLoadedPayoutBatchIdsSample.slice(0, 5).map((item) => String(item || '')) : [],
              carryoverMatchingInputPayoutBatchCount: Number(entry && entry.carryoverMatchingInputPayoutBatchCount || 0),
              carryoverMatchingInputPayoutBatchIdsSample: Array.isArray(entry && entry.carryoverMatchingInputPayoutBatchIdsSample) ? entry.carryoverMatchingInputPayoutBatchIdsSample.slice(0, 5).map((item) => String(item || '')) : [],
              carryoverMatcherCandidateExisted: String(entry && entry.carryoverMatcherCandidateExisted || 'ne'),
              carryoverMatcherRejectedReason: String(entry && entry.carryoverMatcherRejectedReason || ''),
              carryoverSourceClearMarker: String(entry && entry.carryoverSourceClearMarker || ''),
              carryoverMatchedCount: Number(entry && entry.carryoverMatchedCount || 0),
              carryoverUnmatchedCount: Number(entry && entry.carryoverUnmatchedCount || 0),
              selectedFileNames: Array.isArray(entry && entry.selectedFileNames) ? entry.selectedFileNames.slice(0, 20).map((item) => String(item || '')) : [],
              selectedBatchFileCount: Number(entry && entry.selectedBatchFileCount || 0),
              persistedWorkspaceFileNamesBeforeRerun: Array.isArray(entry && entry.persistedWorkspaceFileNamesBeforeRerun) ? entry.persistedWorkspaceFileNamesBeforeRerun.slice(0, 20).map((item) => String(item || '')) : [],
              persistedWorkspaceFileCountBeforeRerun: Number(entry && entry.persistedWorkspaceFileCountBeforeRerun || 0),
              mergedFileNamesUsedForRerun: Array.isArray(entry && entry.mergedFileNamesUsedForRerun) ? entry.mergedFileNamesUsedForRerun.slice(0, 20).map((item) => String(item || '')) : [],
              mergedFileCountUsedForRerun: Number(entry && entry.mergedFileCountUsedForRerun || 0),
              visibleTraceFileNamesAfterRender: Array.isArray(entry && entry.visibleTraceFileNamesAfterRender) ? entry.visibleTraceFileNamesAfterRender.slice(0, 20).map((item) => String(item || '')) : [],
              visibleTraceFileCount: Number(entry && entry.visibleTraceFileCount || 0),
              renderSource: String(entry && entry.renderSource || 'selectedFiles'),
              explicitClearResetMarker: String(entry && entry.explicitClearResetMarker || 'none'),
              invariantWarning: String(entry && entry.invariantWarning || 'none'),
              invariantGuardApplied: String(entry && entry.invariantGuardApplied || 'no'),
              fileSelectionEventToken: Number(entry && entry.fileSelectionEventToken || 0),
              incomingBrowserFileListNames: Array.isArray(entry && entry.incomingBrowserFileListNames) ? entry.incomingBrowserFileListNames.slice(0, 20).map((item) => String(item || '')) : [],
              incomingBrowserFileListCount: Number(entry && entry.incomingBrowserFileListCount || 0),
              previousPendingSelectedFileNames: Array.isArray(entry && entry.previousPendingSelectedFileNames) ? entry.previousPendingSelectedFileNames.slice(0, 20).map((item) => String(item || '')) : [],
              previousPendingSelectedFileCount: Number(entry && entry.previousPendingSelectedFileCount || 0),
              nextPendingSelectedFileNames: Array.isArray(entry && entry.nextPendingSelectedFileNames) ? entry.nextPendingSelectedFileNames.slice(0, 20).map((item) => String(item || '')) : [],
              nextPendingSelectedFileCount: Number(entry && entry.nextPendingSelectedFileCount || 0),
              appendVsReplaceDecision: String(entry && entry.appendVsReplaceDecision || 'not-applicable'),
              dedupeKeyUsed: String(entry && entry.dedupeKeyUsed || 'not-applicable'),
              visiblePendingFileNamesBeforeRun: Array.isArray(entry && entry.visiblePendingFileNamesBeforeRun) ? entry.visiblePendingFileNamesBeforeRun.slice(0, 20).map((item) => String(item || '')) : [],
              visiblePendingFileCountBeforeRun: Number(entry && entry.visiblePendingFileCountBeforeRun || 0),
              selectedFileNamesHandedIntoRunAction: Array.isArray(entry && entry.selectedFileNamesHandedIntoRunAction) ? entry.selectedFileNamesHandedIntoRunAction.slice(0, 20).map((item) => String(item || '')) : [],
              selectedFileCountHandedIntoRunAction: Number(entry && entry.selectedFileCountHandedIntoRunAction || 0)
            }))
            : []
        };
      }

      function setWorkspaceRenderDebugState(input) {
        currentWorkspaceRenderDebug = buildWorkspaceRenderDebugState(input);
      }

      function buildWorkspaceDebugNameList(items) {
        return (Array.isArray(items) ? items : [])
          .map((item) => String(item || ''))
          .filter(Boolean)
          .slice(0, 20);
      }

      function buildWorkspaceRenderSourceMarker(renderSource) {
        if (renderSource === 'persistedWorkspace') {
          return 'persisted workspace only';
        }

        if (renderSource === 'mergedWorkspace') {
          return 'persisted + selected merge';
        }

        return 'selectedFiles only';
      }

      ${resolvePreviousMonthKeyFunctionSource}

      function buildPreviousMonthCarryoverSourceFromWorkspace(workspace, currentMonthKey) {
        const previousMonthKey = resolvePreviousMonthKey(currentMonthKey);
        const runtimeState = workspace && workspace.runtimeState;
        const sourceSnapshot = runtimeState && runtimeState.carryoverSourceSnapshot;
        const reconciliationSnapshot = runtimeState && runtimeState.reconciliationSnapshot;
        const payoutBatchDecisions = Array.isArray(reconciliationSnapshot && reconciliationSnapshot.payoutBatchDecisions)
          ? reconciliationSnapshot.payoutBatchDecisions
          : [];
        const comgateDecisionKeySet = new Set(
          payoutBatchDecisions
            .filter((decision) => decision && decision.platform === 'comgate')
            .map((decision) => String(decision.payoutBatchKey || ''))
            .filter(Boolean)
        );
        const previousMonthMatchedComgateBatchKeys = Array.isArray(reconciliationSnapshot && reconciliationSnapshot.matchedPayoutBatchKeys)
          ? reconciliationSnapshot.matchedPayoutBatchKeys
            .map((item) => String(item || ''))
            .filter((key) => key && (comgateDecisionKeySet.size === 0 || comgateDecisionKeySet.has(key)))
          : payoutBatchDecisions
            .filter((decision) => decision && decision.platform === 'comgate' && decision.matched)
            .map((decision) => String(decision.payoutBatchKey || ''))
            .filter(Boolean);
        const previousMonthUnmatchedComgateBatchKeys = Array.isArray(reconciliationSnapshot && reconciliationSnapshot.unmatchedPayoutBatchKeys)
          ? reconciliationSnapshot.unmatchedPayoutBatchKeys
            .map((item) => String(item || ''))
            .filter((key) => key && (comgateDecisionKeySet.size === 0 || comgateDecisionKeySet.has(key)))
          : payoutBatchDecisions
            .filter((decision) => decision && decision.platform === 'comgate' && !decision.matched)
            .map((decision) => String(decision.payoutBatchKey || ''))
            .filter(Boolean);
        const previousMonthUnmatchedComgateBatchKeySet = new Set(previousMonthUnmatchedComgateBatchKeys);

        if (!previousMonthKey || !sourceSnapshot) {
          const fallbackPayoutBatches = Array.isArray(reconciliationSnapshot && reconciliationSnapshot.payoutBatchDecisions)
            ? reconciliationSnapshot.payoutBatchDecisions
              .filter((decision) => decision && decision.platform === 'comgate' && !decision.matched)
              .filter((decision) => previousMonthUnmatchedComgateBatchKeySet.size === 0 || previousMonthUnmatchedComgateBatchKeySet.has(String(decision.payoutBatchKey || '')))
              .map((decision) => ({
                payoutBatchKey: String(decision.payoutBatchKey || ''),
                platform: 'comgate',
                payoutReference: String(decision.payoutReference || ''),
                payoutDate: String(decision.payoutDate || ''),
                bankRoutingTarget: 'rb_bank_inflow',
                rowIds: [],
                expectedTotalMinor: Number(decision.expectedBankAmountMinor || decision.expectedTotalMinor || 0),
                grossTotalMinor: typeof decision.grossTotalMinor === 'number' ? decision.grossTotalMinor : undefined,
                feeTotalMinor: typeof decision.feeTotalMinor === 'number' ? decision.feeTotalMinor : undefined,
                netSettlementTotalMinor: typeof decision.netSettlementTotalMinor === 'number' ? decision.netSettlementTotalMinor : undefined,
                currency: String(decision.expectedBankCurrency || decision.currency || 'CZK')
              }))
              .filter((batch) => batch.payoutBatchKey && batch.payoutReference && batch.payoutDate)
            : [];

          return fallbackPayoutBatches.length > 0
            ? {
              sourceMonthKey: previousMonthKey,
              payoutBatches: fallbackPayoutBatches
            }
            : undefined;
        }

        const payoutBatches = Array.isArray(sourceSnapshot.payoutBatches)
          ? sourceSnapshot.payoutBatches
            .filter((batch) => batch && batch.platform === 'comgate' && batch.bankRoutingTarget === 'rb_bank_inflow')
            .filter((batch) => previousMonthUnmatchedComgateBatchKeySet.size === 0 || previousMonthUnmatchedComgateBatchKeySet.has(String(batch.payoutBatchKey || '')))
            .map((batch) => ({
              payoutBatchKey: String(batch.payoutBatchKey || ''),
              platform: 'comgate',
              payoutReference: String(batch.payoutReference || ''),
              payoutDate: String(batch.payoutDate || ''),
              bankRoutingTarget: 'rb_bank_inflow',
              rowIds: Array.isArray(batch.rowIds) ? batch.rowIds.map((item) => String(item || '')) : [],
              expectedTotalMinor: Number(batch.expectedTotalMinor || 0),
              grossTotalMinor: typeof batch.grossTotalMinor === 'number' ? batch.grossTotalMinor : undefined,
              feeTotalMinor: typeof batch.feeTotalMinor === 'number' ? batch.feeTotalMinor : undefined,
              netSettlementTotalMinor: typeof batch.netSettlementTotalMinor === 'number' ? batch.netSettlementTotalMinor : undefined,
              currency: String(batch.currency || 'CZK'),
              payoutSupplementPaymentId: typeof batch.payoutSupplementPaymentId === 'string' ? batch.payoutSupplementPaymentId : undefined,
              payoutSupplementPayoutDate: typeof batch.payoutSupplementPayoutDate === 'string' ? batch.payoutSupplementPayoutDate : undefined,
              payoutSupplementPayoutTotalAmountMinor: typeof batch.payoutSupplementPayoutTotalAmountMinor === 'number' ? batch.payoutSupplementPayoutTotalAmountMinor : undefined,
              payoutSupplementPayoutTotalCurrency: typeof batch.payoutSupplementPayoutTotalCurrency === 'string' ? batch.payoutSupplementPayoutTotalCurrency : undefined,
              payoutSupplementLocalAmountMinor: typeof batch.payoutSupplementLocalAmountMinor === 'number' ? batch.payoutSupplementLocalAmountMinor : undefined,
              payoutSupplementLocalCurrency: typeof batch.payoutSupplementLocalCurrency === 'string' ? batch.payoutSupplementLocalCurrency : undefined,
              payoutSupplementIbanSuffix: typeof batch.payoutSupplementIbanSuffix === 'string' ? batch.payoutSupplementIbanSuffix : undefined,
              payoutSupplementExchangeRate: typeof batch.payoutSupplementExchangeRate === 'string' ? batch.payoutSupplementExchangeRate : undefined,
              payoutSupplementReferenceHints: Array.isArray(batch.payoutSupplementReferenceHints) ? batch.payoutSupplementReferenceHints.map((item) => String(item || '')) : undefined,
              payoutSupplementSourceDocumentIds: Array.isArray(batch.payoutSupplementSourceDocumentIds) ? batch.payoutSupplementSourceDocumentIds.map((item) => String(item || '')) : undefined,
              payoutSupplementReservationIds: Array.isArray(batch.payoutSupplementReservationIds) ? batch.payoutSupplementReservationIds.map((item) => String(item || '')) : undefined
            }))
            .filter((batch) => batch.payoutBatchKey && batch.payoutReference && batch.payoutDate)
          : [];

        if (payoutBatches.length === 0) {
          const fallbackPayoutBatches = Array.isArray(reconciliationSnapshot && reconciliationSnapshot.payoutBatchDecisions)
            ? reconciliationSnapshot.payoutBatchDecisions
              .filter((decision) => decision && decision.platform === 'comgate' && !decision.matched)
              .filter((decision) => previousMonthUnmatchedComgateBatchKeySet.size === 0 || previousMonthUnmatchedComgateBatchKeySet.has(String(decision.payoutBatchKey || '')))
              .map((decision) => ({
                payoutBatchKey: String(decision.payoutBatchKey || ''),
                platform: 'comgate',
                payoutReference: String(decision.payoutReference || ''),
                payoutDate: String(decision.payoutDate || ''),
                bankRoutingTarget: 'rb_bank_inflow',
                rowIds: [],
                expectedTotalMinor: Number(decision.expectedBankAmountMinor || decision.expectedTotalMinor || 0),
                grossTotalMinor: typeof decision.grossTotalMinor === 'number' ? decision.grossTotalMinor : undefined,
                feeTotalMinor: typeof decision.feeTotalMinor === 'number' ? decision.feeTotalMinor : undefined,
                netSettlementTotalMinor: typeof decision.netSettlementTotalMinor === 'number' ? decision.netSettlementTotalMinor : undefined,
                currency: String(decision.expectedBankCurrency || decision.currency || 'CZK')
              }))
              .filter((batch) => batch.payoutBatchKey && batch.payoutReference && batch.payoutDate)
            : [];

          return fallbackPayoutBatches.length > 0
            ? {
              sourceMonthKey: String(sourceSnapshot.sourceMonthKey || previousMonthKey),
              payoutBatches: fallbackPayoutBatches
            }
            : undefined;
        }

        return payoutBatches.length > 0
          ? {
            sourceMonthKey: String(sourceSnapshot.sourceMonthKey || previousMonthKey),
            payoutBatches
          }
          : undefined;
      }

      function inspectPreviousMonthCarryoverWorkspace(workspace, currentMonthKey) {
        const previousMonthKey = resolvePreviousMonthKey(currentMonthKey);
        const runtimeState = workspace && workspace.runtimeState;
        const reconciliationSnapshot = runtimeState && runtimeState.reconciliationSnapshot;
        const payoutBatchDecisions = Array.isArray(reconciliationSnapshot && reconciliationSnapshot.payoutBatchDecisions)
          ? reconciliationSnapshot.payoutBatchDecisions
          : [];
        const comgateDecisionKeySet = new Set(
          payoutBatchDecisions
            .filter((decision) => decision && decision.platform === 'comgate')
            .map((decision) => String(decision.payoutBatchKey || ''))
            .filter(Boolean)
        );
        const matchedPayoutBatchKeys = Array.isArray(reconciliationSnapshot && reconciliationSnapshot.matchedPayoutBatchKeys)
          ? reconciliationSnapshot.matchedPayoutBatchKeys
            .map((item) => String(item || ''))
            .filter((key) => key && (comgateDecisionKeySet.size === 0 || comgateDecisionKeySet.has(key)))
          : payoutBatchDecisions
            .filter((decision) => decision && decision.platform === 'comgate' && decision.matched)
            .map((decision) => String(decision.payoutBatchKey || ''))
            .filter(Boolean);
        const source = buildPreviousMonthCarryoverSourceFromWorkspace(workspace, currentMonthKey);
        const unmatchedPayoutBatches = source && Array.isArray(source.payoutBatches)
          ? source.payoutBatches.slice()
          : [];

        return {
          previousMonthKey,
          previousMonthWorkspaceFound: workspace && runtimeState ? 'ano' : 'ne',
          previousMonthMatchedPayoutBatchCount: matchedPayoutBatchKeys.length,
          previousMonthUnmatchedPayoutBatchCount: unmatchedPayoutBatches.length,
          previousMonthUnmatchedPayoutBatchIdsSample: unmatchedPayoutBatches.map((item) => item.payoutBatchKey).slice(0, 5),
          previousMonthUnmatchedOnly: 'yes',
          source,
          clearMarker: !workspace && previousMonthKey && previousMonthKey === currentClearedWorkspaceMonth
            ? 'explicit-clear:' + previousMonthKey
            : ''
        };
      }

      function buildVisibleTraceFileNamesFromState(state) {
        const fileRoutes = Array.isArray(state && state.fileRoutes) ? state.fileRoutes : [];

        if (fileRoutes.length > 0) {
          return buildWorkspaceDebugNameList(fileRoutes.map((item) => String(item && item.fileName || '')));
        }

        const preparedFiles = Array.isArray(state && state.preparedFiles) ? state.preparedFiles : [];
        return buildWorkspaceDebugNameList(preparedFiles.map((item) => String(item && item.fileName || '')));
      }

      function appendWorkspaceRenderDebugCheckpoint(input) {
        const nextState = buildWorkspaceRenderDebugState({
          ...currentWorkspaceRenderDebug,
          ...input
        });
        const checkpoint = {
          phase: String(input && input.phase || 'unknown'),
          requestToken: nextState.requestToken,
          restoreToken: nextState.restoreToken,
          restoreSource: nextState.restoreSource,
          currentMonthKey: nextState.currentMonthKey,
          workspacePersistenceBackend: nextState.workspacePersistenceBackend,
          storageKeyUsed: nextState.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: nextState.saveCompletedBeforeRerunInputAssembly,
          carryoverPreviousMonthKeyResolved: nextState.carryoverPreviousMonthKeyResolved,
          carryoverPreviousMonthWorkspaceFound: nextState.carryoverPreviousMonthWorkspaceFound,
          carryoverPreviousMonthMatchedPayoutBatchCount: nextState.carryoverPreviousMonthMatchedPayoutBatchCount,
          carryoverPreviousMonthUnmatchedPayoutBatchCount: nextState.carryoverPreviousMonthUnmatchedPayoutBatchCount,
          carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: nextState.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.slice(),
          carryoverPreviousMonthUnmatchedOnly: nextState.carryoverPreviousMonthUnmatchedOnly,
          carryoverSourceMonth: nextState.carryoverSourceMonth,
          carryoverCurrentMonth: nextState.carryoverCurrentMonth,
          carryoverLoadedPayoutBatchCount: nextState.carryoverLoadedPayoutBatchCount,
          carryoverLoadedPayoutBatchIdsSample: nextState.carryoverLoadedPayoutBatchIdsSample.slice(),
          carryoverMatchingInputPayoutBatchCount: nextState.carryoverMatchingInputPayoutBatchCount,
          carryoverMatchingInputPayoutBatchIdsSample: nextState.carryoverMatchingInputPayoutBatchIdsSample.slice(),
          carryoverMatcherCandidateExisted: nextState.carryoverMatcherCandidateExisted,
          carryoverMatcherRejectedReason: nextState.carryoverMatcherRejectedReason,
          carryoverSourceClearMarker: nextState.carryoverSourceClearMarker,
          carryoverMatchedCount: nextState.carryoverMatchedCount,
          carryoverUnmatchedCount: nextState.carryoverUnmatchedCount,
          selectedFileNames: nextState.selectedFileNames.slice(),
          selectedBatchFileCount: nextState.selectedBatchFileCount,
          persistedWorkspaceFileNamesBeforeRerun: nextState.persistedWorkspaceFileNamesBeforeRerun.slice(),
          persistedWorkspaceFileCountBeforeRerun: nextState.persistedWorkspaceFileCountBeforeRerun,
          mergedFileNamesUsedForRerun: nextState.mergedFileNamesUsedForRerun.slice(),
          mergedFileCountUsedForRerun: nextState.mergedFileCountUsedForRerun,
          visibleTraceFileNamesAfterRender: nextState.visibleTraceFileNamesAfterRender.slice(),
          visibleTraceFileCount: nextState.visibleTraceFileCount,
          renderSource: nextState.renderSource,
          explicitClearResetMarker: nextState.explicitClearResetMarker,
          invariantWarning: nextState.invariantWarning,
          invariantGuardApplied: nextState.invariantGuardApplied,
          fileSelectionEventToken: nextState.fileSelectionEventToken,
          incomingBrowserFileListNames: nextState.incomingBrowserFileListNames.slice(),
          incomingBrowserFileListCount: nextState.incomingBrowserFileListCount,
          previousPendingSelectedFileNames: nextState.previousPendingSelectedFileNames.slice(),
          previousPendingSelectedFileCount: nextState.previousPendingSelectedFileCount,
          nextPendingSelectedFileNames: nextState.nextPendingSelectedFileNames.slice(),
          nextPendingSelectedFileCount: nextState.nextPendingSelectedFileCount,
          appendVsReplaceDecision: nextState.appendVsReplaceDecision,
          dedupeKeyUsed: nextState.dedupeKeyUsed,
          visiblePendingFileNamesBeforeRun: nextState.visiblePendingFileNamesBeforeRun.slice(),
          visiblePendingFileCountBeforeRun: nextState.visiblePendingFileCountBeforeRun,
          selectedFileNamesHandedIntoRunAction: nextState.selectedFileNamesHandedIntoRunAction.slice(),
          selectedFileCountHandedIntoRunAction: nextState.selectedFileCountHandedIntoRunAction
        };

        nextState.checkpointLog = currentWorkspaceRenderDebug.checkpointLog.concat([checkpoint]).slice(-20);
        setWorkspaceRenderDebugState(nextState);

        if (runtimeOperatorDebugMode) {
          window.__hotelFinanceLastWorkspaceRenderDebug = currentWorkspaceRenderDebug;
        }

        return currentWorkspaceRenderDebug;
      }

      function hashStringContent(value) {
        const normalized = String(value || '');
        let hash = 2166136261;

        for (let index = 0; index < normalized.length; index += 1) {
          hash ^= normalized.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(16).padStart(8, '0');
      }

      function hashByteArray(bytes) {
        const normalized = bytes instanceof Uint8Array ? bytes : new Uint8Array(0);
        let hash = 2166136261;

        for (let index = 0; index < normalized.length; index += 1) {
          hash ^= normalized[index];
          hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(16).padStart(8, '0');
      }

      function encodeBytesToBase64(bytes) {
        let binary = '';

        for (let index = 0; index < bytes.length; index += 1) {
          binary += String.fromCharCode(bytes[index]);
        }

        return window && typeof window.btoa === 'function'
          ? window.btoa(binary)
          : '';
      }

      function decodeBase64ToArrayBuffer(value) {
        if (!(window && typeof window.atob === 'function')) {
          return new Uint8Array(0).buffer;
        }

        const binary = window.atob(String(value || ''));
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        return bytes.buffer;
      }

      function detectBinaryWorkspaceFile(fileName, mimeType) {
        const normalizedName = String(fileName || '').toLowerCase();
        const normalizedType = String(mimeType || '').toLowerCase();

        return normalizedType.includes('pdf')
          || normalizedType.includes('spreadsheet')
          || normalizedType.includes('excel')
          || normalizedType.includes('officedocument')
          || normalizedType.includes('octet-stream')
          || /\.(pdf|xlsx|xls)$/i.test(normalizedName);
      }

      async function yieldBrowserWorkflowTurn() {
        await new Promise((resolve) => {
          if (window && typeof window.setTimeout === 'function') {
            window.setTimeout(resolve, 0);
            return;
          }

          if (typeof setTimeout === 'function') {
            setTimeout(resolve, 0);
            return;
          }

          resolve();
        });
      }

      function buildFailedWorkspaceFileRecord(fileName, mimeType, uploadedAt, errorMessage) {
        const normalizedErrorMessage = String(errorMessage || 'Nepodařilo se přečíst vybraný soubor v browser workspace.');
        const contentHash = hashStringContent(fileName + '::' + mimeType + '::failed::' + normalizedErrorMessage);

        return {
          id: buildWorkspaceFileId({
            fileName,
            mimeType,
            encoding: 'failed',
            contentHash
          }),
          fileName,
          mimeType,
          encoding: 'failed',
          errorMessage: normalizedErrorMessage,
          contentHash,
          uploadedAt
        };
      }

      async function serializeSelectedFileForWorkspace(file) {
        const fileName = String(file && file.name || 'uploaded-file');
        const mimeType = String(file && file.type || '');
        const uploadedAt = new Date().toISOString();

        try {
          if (detectBinaryWorkspaceFile(fileName, mimeType) && file && typeof file.arrayBuffer === 'function') {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const contentBase64 = encodeBytesToBase64(bytes);
            const contentHash = hashByteArray(bytes);

            return {
              id: buildWorkspaceFileId({
                fileName,
                mimeType,
                encoding: 'base64',
                contentHash
              }),
              fileName,
              mimeType,
              encoding: 'base64',
              contentBase64,
              contentHash,
              uploadedAt
            };
          }

          const textContent = file && typeof file.text === 'function'
            ? await file.text()
            : '';
          const contentHash = hashStringContent(textContent);

          return {
            id: buildWorkspaceFileId({
              fileName,
              mimeType,
              encoding: 'text',
              contentHash
            }),
            fileName,
            mimeType,
            encoding: 'text',
            textContent,
            contentHash,
            uploadedAt
          };
        } catch (error) {
          return buildFailedWorkspaceFileRecord(
            fileName,
            mimeType,
            uploadedAt,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      async function serializeSelectedFilesForWorkspace(files, onProgress) {
        const serialized = [];

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const record = await serializeSelectedFileForWorkspace(file);
          serialized.push(record);

          if (typeof onProgress === 'function') {
            onProgress({
              stage: 'serializing-workspace-files',
              totalFiles: files.length,
              completedFiles: index + 1,
              currentFileName: String(file && file.name || record && record.fileName || ''),
              currentFileStatus: record && record.encoding === 'failed' ? 'error' : 'supported'
            });
          }

          if (index + 1 < files.length) {
            await yieldBrowserWorkflowTurn();
          }
        }

        return serialized;
      }

      function mergeWorkspaceFiles(existingFiles, incomingFiles) {
        const merged = [];
        const seenIds = new Set();

        (Array.isArray(existingFiles) ? existingFiles : []).forEach((file) => {
          const normalizedId = String(file && file.id || '');

          if (!normalizedId || seenIds.has(normalizedId)) {
            return;
          }

          seenIds.add(normalizedId);
          merged.push(file);
        });

        (Array.isArray(incomingFiles) ? incomingFiles : []).forEach((file) => {
          const normalizedId = String(file && file.id || '');

          if (!normalizedId) {
            return;
          }

          const existingIndex = merged.findIndex((item) => String(item && item.id || '') === normalizedId);

          if (existingIndex >= 0) {
            merged.splice(existingIndex, 1, file);
            return;
          }

          merged.push(file);
        });

        return merged;
      }

      function buildRunningWorkflowFilesFromWorkspaceRecords(records) {
        return (Array.isArray(records) ? records : [])
          .filter((record) => record && record.fileName)
          .map((record) => ({
            name: String(record.fileName),
            type: String(record.mimeType || '')
          }));
      }

      function buildWorkspaceDebugSampleFromWorkspaceRecords(records) {
        return (Array.isArray(records) ? records : [])
          .filter((record) => record && record.fileName)
          .slice(0, 5)
          .map((record) => String(record.fileName || ''));
      }

      function buildWorkspaceDebugSampleFromRuntimeFiles(files) {
        return (Array.isArray(files) ? files : [])
          .filter((file) => file && file.name)
          .slice(0, 5)
          .map((file) => String(file.name || ''));
      }

      function buildWorkspaceDebugNamesFromRuntimeFiles(files) {
        return buildWorkspaceDebugNameList((Array.isArray(files) ? files : []).map((file) => String(file && file.name || '')));
      }

      function buildWorkspaceDebugNamesFromWorkspaceRecords(records) {
        return buildWorkspaceDebugNameList((Array.isArray(records) ? records : []).map((record) => String(record && record.fileName || '')));
      }

      function buildWorkspaceSelectionDedupeKey(files) {
        return buildWorkspaceDebugNameList((Array.isArray(files) ? files : []).map((file) => {
          return String(file && file.name || '') + '::' + String(file && file.type || '');
        })).join(' | ') || 'not-applicable';
      }

      function buildWorkspaceSelectionFileKey(file) {
        return [
          String(file && file.name || ''),
          String(file && file.type || ''),
          String(file && file.size || ''),
          String(file && file.lastModified || '')
        ].join('::');
      }

      function mergePendingSelectedFiles(existingFiles, incomingFiles) {
        const merged = [];
        const seenKeys = new Set();

        (Array.isArray(existingFiles) ? existingFiles : []).forEach((file) => {
          const key = buildWorkspaceSelectionFileKey(file);

          if (!key || seenKeys.has(key)) {
            return;
          }

          seenKeys.add(key);
          merged.push(file);
        });

        (Array.isArray(incomingFiles) ? incomingFiles : []).forEach((file) => {
          const key = buildWorkspaceSelectionFileKey(file);

          if (!key || seenKeys.has(key)) {
            return;
          }

          seenKeys.add(key);
          merged.push(file);
        });

        return merged;
      }

      function resetPendingSelectedFiles(marker, monthKey) {
        currentPendingSelectedFiles = [];
        currentPendingSelectedFileNames = [];
        currentPendingSelectedMonthKey = String(monthKey || '');
        currentExplicitSelectionResetMarker = String(marker || 'none');
        currentSelectionInvariantWarning = 'none';
        currentSelectionInvariantGuardApplied = 'no';
      }

      function buildSameMonthSelectionInvariantWarning(normalizedMonth, previousNames, incomingNames, visibleNames) {
        const priorVisibleSet = Array.isArray(visibleNames) ? visibleNames : [];
        const priorPendingSet = Array.isArray(previousNames) ? previousNames : [];
        const incomingSet = Array.isArray(incomingNames) ? incomingNames : [];
        const referenceSet = priorPendingSet.length > 0 ? priorPendingSet : priorVisibleSet;

        if (!normalizedMonth || currentExplicitSelectionResetMarker !== 'none' || referenceSet.length === 0 || incomingSet.length === 0) {
          return '';
        }

        const missingNames = referenceSet.filter((name) => !incomingSet.includes(name));

        if (missingNames.length === 0) {
          return '';
        }

        return 'same-month selection shrink detected for ' + normalizedMonth + ': missing ' + missingNames.join(', ');
      }

      function resolveSelectionAppendVsReplaceDecision(previousNames, nextNames) {
        const previous = Array.isArray(previousNames) ? previousNames : [];
        const next = Array.isArray(nextNames) ? nextNames : [];

        if (previous.length === 0 && next.length > 0) {
          return 'initial-select';
        }

        if (previous.length > 0 && previous.every((name) => next.includes(name)) && next.length > previous.length) {
          return 'append';
        }

        if (previous.length > 0 && next.length > 0 && !previous.every((name) => next.includes(name))) {
          return 'replace';
        }

        if (previous.length > 0 && next.length === previous.length && previous.every((name, index) => name === next[index])) {
          return 'no-change';
        }

        return 'dedupe-or-other';
      }

      function handleSelectedFilesInputChange() {
        const eventToken = ++currentFileSelectionEventToken;
        const normalizedMonth = String(monthInput && monthInput.value || currentWorkspaceMonth || '');
        const incomingFiles = Array.from(fileInput.files || []);
        const incomingNames = buildWorkspaceDebugNamesFromRuntimeFiles(incomingFiles);
        const previousPendingFiles = normalizedMonth && currentPendingSelectedMonthKey === normalizedMonth
          ? currentPendingSelectedFiles.slice()
          : [];
        const previousPendingNames = buildWorkspaceDebugNamesFromRuntimeFiles(previousPendingFiles);
        const visibleSameMonthNames = normalizedMonth && currentWorkspaceMonth === normalizedMonth
          ? buildWorkspaceDebugNamesFromWorkspaceRecords(currentWorkspaceFiles)
          : [];
        const invariantWarning = buildSameMonthSelectionInvariantWarning(normalizedMonth, previousPendingNames, incomingNames, visibleSameMonthNames);
        const shouldPreserveUnion = Boolean(invariantWarning) && previousPendingFiles.length > 0;
        const nextPendingFiles = shouldPreserveUnion
          ? mergePendingSelectedFiles(previousPendingFiles, incomingFiles)
          : incomingFiles.slice();
        const nextPendingNames = buildWorkspaceDebugNamesFromRuntimeFiles(nextPendingFiles);
        const dedupeKeyUsed = buildWorkspaceSelectionDedupeKey(incomingFiles);
        const appendVsReplaceDecision = resolveSelectionAppendVsReplaceDecision(previousPendingNames, nextPendingNames);
        const explicitClearResetMarker = currentExplicitSelectionResetMarker;
        const invariantGuardApplied = shouldPreserveUnion ? 'union-preserved' : 'no';

        currentPendingSelectedFiles = nextPendingFiles.slice();
        currentPendingSelectedFileNames = nextPendingNames.slice();
        currentPendingSelectedMonthKey = normalizedMonth;
        currentSelectionInvariantWarning = invariantWarning || 'none';
        currentSelectionInvariantGuardApplied = invariantGuardApplied;

        if (invariantWarning && runtimeOperatorDebugMode && typeof console !== 'undefined' && console && typeof console.warn === 'function') {
          console.warn('[hotel-finance-control] ' + invariantWarning);
        }

        appendWorkspaceRenderDebugCheckpoint({
          phase: 'on-file-input-change',
          explicitClearResetMarker,
          invariantWarning: invariantWarning || 'none',
          invariantGuardApplied,
          fileSelectionEventToken: eventToken,
          incomingBrowserFileListNames: incomingNames,
          incomingBrowserFileListCount: incomingFiles.length,
          previousPendingSelectedFileNames: previousPendingNames,
          previousPendingSelectedFileCount: previousPendingNames.length,
          nextPendingSelectedFileNames: nextPendingNames,
          nextPendingSelectedFileCount: nextPendingNames.length,
          appendVsReplaceDecision,
          dedupeKeyUsed,
          visiblePendingFileNamesBeforeRun: nextPendingNames,
          visiblePendingFileCountBeforeRun: nextPendingNames.length,
          selectedFileNamesHandedIntoRunAction: currentWorkspaceRenderDebug.selectedFileNamesHandedIntoRunAction,
          selectedFileCountHandedIntoRunAction: currentWorkspaceRenderDebug.selectedFileCountHandedIntoRunAction,
          currentMonthKey: normalizedMonth,
          workspacePersistenceBackend: currentWorkspaceRenderDebug.workspacePersistenceBackend,
          storageKeyUsed: currentWorkspaceRenderDebug.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: currentWorkspaceRenderDebug.saveCompletedBeforeRerunInputAssembly,
          renderSource: 'selectedFiles'
        });

        appendWorkspaceRenderDebugCheckpoint({
          phase: 'before-visible-pending-render',
          explicitClearResetMarker,
          invariantWarning: invariantWarning || 'none',
          invariantGuardApplied,
          fileSelectionEventToken: eventToken,
          incomingBrowserFileListNames: incomingNames,
          incomingBrowserFileListCount: incomingFiles.length,
          previousPendingSelectedFileNames: previousPendingNames,
          previousPendingSelectedFileCount: previousPendingNames.length,
          nextPendingSelectedFileNames: nextPendingNames,
          nextPendingSelectedFileCount: nextPendingNames.length,
          appendVsReplaceDecision,
          dedupeKeyUsed,
          visiblePendingFileNamesBeforeRun: nextPendingNames,
          visiblePendingFileCountBeforeRun: nextPendingNames.length,
          currentMonthKey: normalizedMonth,
          workspacePersistenceBackend: currentWorkspaceRenderDebug.workspacePersistenceBackend,
          storageKeyUsed: currentWorkspaceRenderDebug.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: currentWorkspaceRenderDebug.saveCompletedBeforeRerunInputAssembly,
          renderSource: 'selectedFiles'
        });

        currentExplicitSelectionResetMarker = 'none';

        renderCompletedRuntimeWorkspaceMergeDebug(currentWorkspaceRenderDebug);
      }

      function buildRunningWorkflowFilesFromMonthWorkspace(existingFiles, selectedFiles) {
        const merged = [];
        const seenKeys = new Set();

        buildRunningWorkflowFilesFromWorkspaceRecords(existingFiles).forEach((file) => {
          const key = String(file.name || '') + '::' + String(file.type || '');

          if (!key || seenKeys.has(key)) {
            return;
          }

          seenKeys.add(key);
          merged.push(file);
        });

        (Array.isArray(selectedFiles) ? selectedFiles : []).forEach((file) => {
          const normalizedName = String(file && file.name || 'uploaded-file');
          const normalizedType = String(file && file.type || '');
          const key = normalizedName + '::' + normalizedType;

          if (!normalizedName || seenKeys.has(key)) {
            return;
          }

          seenKeys.add(key);
          merged.push({
            name: normalizedName,
            type: normalizedType
          });
        });

        return merged;
      }

      function buildVisibleTraceFileCountFromState(state) {
        const fileRoutes = Array.isArray(state && state.fileRoutes) ? state.fileRoutes : [];
        const preparedFiles = Array.isArray(state && state.preparedFiles) ? state.preparedFiles : [];

        return fileRoutes.length > 0 ? fileRoutes.length : preparedFiles.length;
      }

      function buildRuntimeFileFromWorkspaceRecord(record) {
        const fileName = String(record && record.fileName || 'uploaded-file');
        const mimeType = String(record && record.mimeType || '');

        if (record && record.encoding === 'failed') {
          return {
            name: fileName,
            type: mimeType,
            text: async () => {
              throw new Error(String(record && record.errorMessage || 'Soubor nebylo možné načíst z browser workspace.'));
            },
            arrayBuffer: async () => {
              throw new Error(String(record && record.errorMessage || 'Soubor nebylo možné načíst z browser workspace.'));
            }
          };
        }

        if (record && record.encoding === 'base64') {
          return {
            name: fileName,
            type: mimeType,
            text: async () => {
              const buffer = decodeBase64ToArrayBuffer(record.contentBase64 || '');
              const decoder = typeof TextDecoder === 'function' ? new TextDecoder() : undefined;

              return decoder ? decoder.decode(buffer) : '';
            },
            arrayBuffer: async () => decodeBase64ToArrayBuffer(record.contentBase64 || '')
          };
        }

        return {
          name: fileName,
          type: mimeType,
          text: async () => String(record && record.textContent || ''),
          arrayBuffer: async () => {
            const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : undefined;
            return encoder ? encoder.encode(String(record && record.textContent || '')).buffer : new Uint8Array(0).buffer;
          }
        };
      }

      function buildRunningWorkflowProgressText(progress) {
        const stage = String(progress && progress.stage || '');
        const totalFiles = Number(progress && progress.totalFiles || 0);
        const completedFiles = Number(progress && progress.completedFiles || 0);
        const currentFileName = String(progress && progress.currentFileName || '');

        if (stage === 'serializing-workspace-files') {
          return 'Ukládám vybrané soubory do browser workspace: ' + completedFiles + ' z ' + totalFiles + (currentFileName ? ' · ' + currentFileName : '');
        }

        if (stage === 'preparing-selected-files') {
          return 'Načítám a předávám vybrané soubory do sdíleného runtime: ' + completedFiles + ' z ' + totalFiles + (currentFileName ? ' · ' + currentFileName : '');
        }

        if (stage === 'classifying-files') {
          return 'Klasifikuji uploadované soubory pro měsíční běh: ' + completedFiles + ' z ' + totalFiles + (currentFileName ? ' · ' + currentFileName : '');
        }

        if (stage === 'parsing-files') {
          return 'Spouštím parsery a izolované intake výsledky po souborech: ' + completedFiles + ' z ' + totalFiles + (currentFileName ? ' · ' + currentFileName : '');
        }

        if (stage === 'finalizing') {
          return 'Skládám finální měsíční runtime stav, kontrolní sekce a exportní handoff…';
        }

        return 'Probíhá příprava skutečně vybraných souborů pro sdílený runtime běh.';
      }

      function renderRunningWorkflowProgress(files, progress) {
        const fileNames = files.length === 0
          ? '<li>Žádné soubory.</li>'
          : files.map((file) => '<li><strong>' + escapeHtml(file.name) + '</strong></li>').join('');
        const progressText = buildRunningWorkflowProgressText(progress);

        preparedFilesContent.innerHTML = '<p class="hint">' + escapeHtml(progressText) + '</p><ul>' + fileNames + '</ul>';
        runtimeOutput.innerHTML = '<p class="hint">' + escapeHtml(progressText) + '</p>';
      }

      function sanitizeExpenseReviewOverridesForStorage(overrides) {
        return (Array.isArray(overrides) ? overrides : [])
          .filter((override) =>
            override
            && typeof override.reviewItemId === 'string'
            && override.reviewItemId
            && (override.decision === 'confirmed' || override.decision === 'rejected')
          )
          .map((override) => ({
            reviewItemId: String(override.reviewItemId),
            decision: override.decision === 'confirmed' ? 'confirmed' : 'rejected',
            decidedAt: override.decidedAt ? String(override.decidedAt) : undefined
          }));
      }

      function sanitizeManualMatchGroupsForStorage(groups) {
        return (Array.isArray(groups) ? groups : [])
          .filter((group) =>
            group
            && typeof group.id === 'string'
            && group.id
            && typeof group.monthKey === 'string'
            && group.monthKey
            && Array.isArray(group.selectedReviewItemIds)
            && group.selectedReviewItemIds.length > 0
            && typeof group.createdAt === 'string'
            && group.createdAt
          )
          .map((group) => ({
            id: String(group.id),
            monthKey: String(group.monthKey),
            selectedReviewItemIds: Array.from(new Set(group.selectedReviewItemIds.map((itemId) => String(itemId || '')).filter(Boolean))),
            createdAt: String(group.createdAt),
            updatedAt: typeof group.updatedAt === 'string' && group.updatedAt ? String(group.updatedAt) : undefined,
            note: typeof group.note === 'string' && group.note.trim() ? group.note.trim() : null
          }));
      }

      function sanitizeManualMatchSelectionIds(ids) {
        return Array.from(new Set((Array.isArray(ids) ? ids : []).map((itemId) => String(itemId || '')).filter(Boolean)));
      }

      function cloneWorkspaceRuntimeState(sourceState) {
        if (!sourceState) {
          return undefined;
        }

        try {
          const serializedState = JSON.stringify(sourceState);
          return serializedState ? JSON.parse(serializedState) : undefined;
        } catch {
          return undefined;
        }
      }

      function queueCurrentMonthWorkspacePersistence() {
        const normalizedMonth = String(currentWorkspaceMonth || monthInput && monthInput.value || '');
        const persistenceRequestToken = currentWorkspaceViewRequestToken;

        if (normalizedMonth && normalizedMonth === currentClearedWorkspaceMonth) {
          currentWorkspacePersistenceState = buildWorkspacePersistenceState({
            status: 'not-applicable',
            backendName: 'none',
            storageKeyUsed: monthlyWorkspaceStorageKey,
            saveCompletedBeforeRerunInputAssembly: 'not-applicable',
            saveAttempted: false,
            errorMessage: ''
          });
          currentWorkspacePersistencePromise = Promise.resolve(currentWorkspacePersistenceState);
          window.__hotelFinanceLastWorkspacePersistencePromise = currentWorkspacePersistencePromise;
          return currentWorkspacePersistencePromise;
        }

        if (!normalizedMonth) {
          currentWorkspacePersistenceState = buildWorkspacePersistenceState({
            status: 'not-applicable',
            backendName: 'none',
            storageKeyUsed: monthlyWorkspaceStorageKey,
            saveCompletedBeforeRerunInputAssembly: 'not-applicable',
            saveAttempted: false,
            errorMessage: ''
          });
          currentWorkspacePersistencePromise = Promise.resolve(currentWorkspacePersistenceState);
          window.__hotelFinanceLastWorkspacePersistencePromise = currentWorkspacePersistencePromise;
          return currentWorkspacePersistencePromise;
        }

        const workspaceSnapshot = {
          month: normalizedMonth,
          savedAt: new Date().toISOString(),
          files: Array.isArray(currentWorkspaceFiles) ? currentWorkspaceFiles.slice() : [],
          runtimeState: cloneWorkspaceRuntimeState(currentExpenseReviewState),
          expenseReviewOverrides: sanitizeExpenseReviewOverridesForStorage(currentExpenseReviewOverrides),
          manualMatchGroups: sanitizeManualMatchGroupsForStorage(currentManualMatchGroups)
        };

        appendWorkspaceRenderDebugCheckpoint({
          phase: 'before-save',
          requestToken: currentWorkspaceViewRequestToken,
          currentMonthKey: normalizedMonth,
          selectedFileNames: currentWorkspaceRenderDebug.selectedFileNames,
          selectedBatchFileCount: currentWorkspaceRenderDebug.selectedBatchFileCount,
          persistedWorkspaceFileNamesBeforeRerun: currentWorkspaceRenderDebug.persistedWorkspaceFileNamesBeforeRerun,
          persistedWorkspaceFileCountBeforeRerun: currentWorkspaceRenderDebug.persistedWorkspaceFileCountBeforeRerun,
          mergedFileNamesUsedForRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(workspaceSnapshot.files),
          mergedFileCountUsedForRerun: Array.isArray(workspaceSnapshot.files) ? workspaceSnapshot.files.length : 0,
          visibleTraceFileNamesAfterRender: currentWorkspaceRenderDebug.visibleTraceFileNamesAfterRender,
          visibleTraceFileCount: currentWorkspaceRenderDebug.visibleTraceFileCount,
          renderSource: currentWorkspaceRenderDebug.renderSource,
          workspacePersistenceBackend: currentWorkspaceRenderDebug.workspacePersistenceBackend,
          storageKeyUsed: currentWorkspaceRenderDebug.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: currentWorkspaceRenderDebug.saveCompletedBeforeRerunInputAssembly,
          mergedFileSample: buildWorkspaceDebugSampleFromWorkspaceRecords(workspaceSnapshot.files)
        });

        currentWorkspacePersistencePromise = (async () => {
          const backend = await openMonthlyWorkspaceIndexedDb();
          const metadataStore = loadMonthlyWorkspaceStore();
          const backendName = backend ? String(backend.backendName || 'indexedDb') : 'legacyLocalStorage';
          const storageKeyUsed = buildWorkspacePersistenceStorageKey(backendName, normalizedMonth);
          const deletionMarker = getWorkspaceDeletionMarker(normalizedMonth);

          if (persistenceRequestToken !== currentWorkspaceViewRequestToken || normalizedMonth === currentClearedWorkspaceMonth) {
            currentWorkspacePersistenceState = buildWorkspacePersistenceState({
              status: 'not-applicable',
              backendName,
              storageKeyUsed,
              saveCompletedBeforeRerunInputAssembly: 'not-applicable',
              saveAttempted: false,
              errorMessage: ''
            });
            return currentWorkspacePersistenceState;
          }

          if (deletionMarker) {
            currentWorkspacePersistenceState = buildWorkspacePersistenceState({
              status: 'not-applicable',
              backendName,
              storageKeyUsed,
              saveCompletedBeforeRerunInputAssembly: 'not-applicable',
              saveAttempted: false,
              errorMessage: ''
            });
            return currentWorkspacePersistenceState;
          }

          if (backend) {
            await backend.saveWorkspace(workspaceSnapshot);
            if (getWorkspaceDeletionMarker(normalizedMonth)) {
              await backend.deleteWorkspace(normalizedMonth);
              currentWorkspacePersistenceState = buildWorkspacePersistenceState({
                status: 'not-applicable',
                backendName,
                storageKeyUsed,
                saveCompletedBeforeRerunInputAssembly: 'not-applicable',
                saveAttempted: false,
                errorMessage: ''
              });
              return currentWorkspacePersistenceState;
            }
            const availableMonths = normalizeWorkspaceMonths((metadataStore.workspaceMonths || []).concat([normalizedMonth]));
            saveMonthlyWorkspaceStore({
              lastUsedMonth: normalizedMonth,
              workspaceMonths: availableMonths,
              workspaces: metadataStore.workspaces
            }, { includeWorkspaces: false });
          } else {
            metadataStore.lastUsedMonth = normalizedMonth;
            metadataStore.workspaceMonths = normalizeWorkspaceMonths((metadataStore.workspaceMonths || []).concat([normalizedMonth]));
            metadataStore.workspaces[normalizedMonth] = workspaceSnapshot;
            if (getWorkspaceDeletionMarker(normalizedMonth)) {
              delete metadataStore.workspaces[normalizedMonth];
              currentWorkspacePersistenceState = buildWorkspacePersistenceState({
                status: 'not-applicable',
                backendName,
                storageKeyUsed,
                saveCompletedBeforeRerunInputAssembly: 'not-applicable',
                saveAttempted: false,
                errorMessage: ''
              });
              saveMonthlyWorkspaceStore(metadataStore, { includeWorkspaces: true });
              return currentWorkspacePersistenceState;
            }
            saveMonthlyWorkspaceStore(metadataStore, { includeWorkspaces: true });
          }

          currentWorkspacePersistenceState = buildWorkspacePersistenceState({
            status: 'saved',
            backendName,
            storageKeyUsed,
            saveCompletedBeforeRerunInputAssembly: 'yes',
            saveAttempted: true,
            errorMessage: ''
          });

          const completedWorkspaceRenderDebug = appendWorkspaceRenderDebugCheckpoint({
            phase: 'after-save',
            workspacePersistenceBackend: backendName,
            storageKeyUsed,
            saveCompletedBeforeRerunInputAssembly: 'yes',
            lastSaveStatus: 'saved',
            currentMonthKey: normalizedMonth,
            requestToken: currentWorkspaceViewRequestToken,
            mergedFileNamesUsedForRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(workspaceSnapshot.files),
            mergedFileCountUsedForRerun: Array.isArray(workspaceSnapshot.files) ? workspaceSnapshot.files.length : 0,
            mergedFileSample: buildWorkspaceDebugSampleFromWorkspaceRecords(workspaceSnapshot.files)
          });

          if (currentVisibleRuntimePhase === 'completed') {
            renderCompletedRuntimeWorkspaceMergeDebug(completedWorkspaceRenderDebug);
          }

          if (runtimeOperatorDebugMode) {
            window.__hotelFinanceLastWorkspaceRenderDebug = completedWorkspaceRenderDebug;
          }

          return currentWorkspacePersistenceState;
        })().catch((error) => {
          const backendName = currentWorkspacePersistenceState.backendName || 'indexedDb';
          const failedState = buildWorkspacePersistenceState({
            status: 'failed',
            backendName,
            storageKeyUsed: buildWorkspacePersistenceStorageKey(backendName, normalizedMonth),
            saveCompletedBeforeRerunInputAssembly: 'no',
            saveAttempted: true,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          currentWorkspacePersistenceState = failedState;

          const failedWorkspaceRenderDebug = appendWorkspaceRenderDebugCheckpoint({
            phase: 'after-save-failed',
            workspacePersistenceBackend: failedState.backendName,
            storageKeyUsed: failedState.storageKeyUsed,
            saveCompletedBeforeRerunInputAssembly: failedState.saveCompletedBeforeRerunInputAssembly,
            lastSaveStatus: failedState.errorMessage
              ? 'failed: ' + failedState.errorMessage
              : 'failed',
            currentMonthKey: normalizedMonth,
            requestToken: currentWorkspaceViewRequestToken,
            mergedFileNamesUsedForRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(workspaceSnapshot.files),
            mergedFileCountUsedForRerun: Array.isArray(workspaceSnapshot.files) ? workspaceSnapshot.files.length : 0,
            mergedFileSample: buildWorkspaceDebugSampleFromWorkspaceRecords(workspaceSnapshot.files)
          });

          if (currentVisibleRuntimePhase === 'completed') {
            renderCompletedRuntimeWorkspaceMergeDebug(failedWorkspaceRenderDebug);
          }

          if (runtimeOperatorDebugMode) {
            window.__hotelFinanceLastWorkspaceRenderDebug = failedWorkspaceRenderDebug;
          }

          return failedState;
        });

        window.__hotelFinanceLastWorkspacePersistencePromise = currentWorkspacePersistencePromise;

        return currentWorkspacePersistencePromise;
      }

      async function loadMonthWorkspace(month, options) {
        const normalizedMonth = String(month || '');
        const store = loadMonthlyWorkspaceStore();
        const backend = await openMonthlyWorkspaceIndexedDb();
        const deletionMarker = getWorkspaceDeletionMarker(normalizedMonth);
        let workspace;
        let backendName = 'none';
        let storageKeyUsed = buildWorkspacePersistenceStorageKey('none', normalizedMonth);
        let migratedFromLegacy = false;

        if (!normalizedMonth) {
          return {
            workspace: undefined,
            loadState: buildWorkspacePersistenceState({
              status: 'not-applicable',
              backendName,
              storageKeyUsed,
              saveCompletedBeforeRerunInputAssembly: currentWorkspacePersistenceState.saveCompletedBeforeRerunInputAssembly || 'not-applicable',
              saveAttempted: currentWorkspacePersistenceState.saveAttempted,
              errorMessage: ''
            })
          };
        }

        if (backend) {
          workspace = await backend.loadWorkspace(normalizedMonth);
          if (workspace) {
            backendName = String(backend.backendName || 'indexedDb');
            storageKeyUsed = buildWorkspacePersistenceStorageKey(backendName, normalizedMonth);
          }
        }

        if (workspace && deletionMarker) {
          workspace = undefined;
        }

        if (!workspace) {
          const legacyWorkspace = getLegacyMonthWorkspaceFromStore(store, normalizedMonth);

          if (legacyWorkspace) {
            if (!deletionMarker) {
              workspace = legacyWorkspace;
              backendName = 'legacyLocalStorage';
              storageKeyUsed = buildWorkspacePersistenceStorageKey(backendName, normalizedMonth);
            }

            if (workspace && backend) {
              await backend.saveWorkspace(legacyWorkspace);
              saveMonthlyWorkspaceStore({
                lastUsedMonth: store.lastUsedMonth,
                workspaceMonths: normalizeWorkspaceMonths((store.workspaceMonths || []).concat(Object.keys(store.workspaces || {}))),
                workspaces: {}
              }, { includeWorkspaces: false });
              backendName = String(backend.backendName || 'indexedDb');
              storageKeyUsed = buildWorkspacePersistenceStorageKey(backendName, normalizedMonth);
              migratedFromLegacy = true;
            }
          }
        }

        const loadState = buildWorkspacePersistenceState({
          status: workspace ? 'loaded' : 'missing',
          backendName,
          storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: currentWorkspacePersistenceState.status === 'saved'
            ? 'yes'
            : currentWorkspacePersistenceState.status === 'failed'
              ? 'no'
              : 'not-applicable',
          saveAttempted: currentWorkspacePersistenceState.saveAttempted,
          errorMessage: migratedFromLegacy ? 'migrated-from-legacy-localstorage' : ''
        });

        if (!(options && options.silent)) {
          currentWorkspacePersistenceState = loadState;
        }
        return { workspace, loadState };
      }

      function buildLaterMonthCarryoverResolutionState(input) {
        const resolvedPayoutBatches = Array.isArray(input && input.resolvedPayoutBatches)
          ? input.resolvedPayoutBatches
            .map((item) => ({
              payoutBatchKey: String(item && item.payoutBatchKey || ''),
              laterMonthKey: String(item && item.laterMonthKey || ''),
              matchedItemTitle: String(item && item.matchedItemTitle || ''),
              matchedItemDetail: String(item && item.matchedItemDetail || '')
            }))
            .filter((item) => item.payoutBatchKey && item.laterMonthKey)
          : [];

        return {
          sourceMonthKey: String(input && input.sourceMonthKey || ''),
          resolvedPayoutBatches
        };
      }

      function extractPayoutBatchKeyFromReviewItemId(reviewItemId, prefix) {
        const normalizedId = String(reviewItemId || '');
        const normalizedPrefix = String(prefix || '');

        return normalizedPrefix && normalizedId.startsWith(normalizedPrefix)
          ? normalizedId.slice(normalizedPrefix.length)
          : '';
      }

      function collectMatchedCarryoverPayoutBatchesFromLaterMonthRuntimeState(runtimeState, sourceMonthKey, laterMonthKey) {
        const payoutBatchDecisions = Array.isArray(runtimeState && runtimeState.reconciliationSnapshot && runtimeState.reconciliationSnapshot.payoutBatchDecisions)
          ? runtimeState.reconciliationSnapshot.payoutBatchDecisions
          : [];
        const matchedReviewItems = Array.isArray(runtimeState && runtimeState.reviewSections && runtimeState.reviewSections.payoutBatchMatched)
          ? runtimeState.reviewSections.payoutBatchMatched
          : [];
        const matchedReviewItemByBatchKey = new Map(
          matchedReviewItems
            .map((item) => [extractPayoutBatchKeyFromReviewItemId(item && item.id, 'payout-batch:'), item])
            .filter((entry) => entry[0])
        );

        return payoutBatchDecisions
          .filter((decision) => decision && decision.matched && decision.fromPreviousMonth && String(decision.sourceMonthKey || '') === sourceMonthKey)
          .map((decision) => {
            const payoutBatchKey = String(decision && decision.payoutBatchKey || '');
            const matchedItem = matchedReviewItemByBatchKey.get(payoutBatchKey);

            return payoutBatchKey
              ? {
                payoutBatchKey,
                laterMonthKey,
                matchedItemTitle: String(matchedItem && matchedItem.title || ''),
                matchedItemDetail: String(matchedItem && matchedItem.detail || '')
              }
              : undefined;
          })
          .filter((item) => Boolean(item));
      }

      async function loadLaterMonthCarryoverResolutionState(currentMonthKey) {
        const normalizedMonth = String(currentMonthKey || '');

        if (!normalizedMonth) {
          return buildLaterMonthCarryoverResolutionState();
        }

        const store = loadMonthlyWorkspaceStore();
        const laterMonthKeys = normalizeWorkspaceMonths(
          Array.isArray(store && store.workspaceMonths)
            ? store.workspaceMonths
            : Object.keys(store && store.workspaces ? store.workspaces : {})
        ).filter((monthKey) => String(monthKey || '') > normalizedMonth);

        if (laterMonthKeys.length === 0) {
          return buildLaterMonthCarryoverResolutionState({
            sourceMonthKey: normalizedMonth,
            resolvedPayoutBatches: []
          });
        }

        const resolvedByBatchKey = {};

        for (const laterMonthKey of laterMonthKeys) {
          const loadedWorkspace = await loadMonthWorkspace(laterMonthKey, { silent: true });
          const workspace = loadedWorkspace && loadedWorkspace.workspace
            ? loadedWorkspace.workspace
            : getLegacyMonthWorkspaceFromStore(loadMonthlyWorkspaceStore(), laterMonthKey);
          const runtimeState = workspace && workspace.runtimeState;
          const resolvedPayoutBatches = collectMatchedCarryoverPayoutBatchesFromLaterMonthRuntimeState(
            runtimeState,
            normalizedMonth,
            laterMonthKey
          );

          for (const resolvedBatch of resolvedPayoutBatches) {
            if (!resolvedBatch || resolvedByBatchKey[resolvedBatch.payoutBatchKey]) {
              continue;
            }

            resolvedByBatchKey[resolvedBatch.payoutBatchKey] = resolvedBatch;
          }
        }

        return buildLaterMonthCarryoverResolutionState({
          sourceMonthKey: normalizedMonth,
          resolvedPayoutBatches: Object.keys(resolvedByBatchKey).map((payoutBatchKey) => resolvedByBatchKey[payoutBatchKey])
        });
      }

      async function clearMonthWorkspace(month) {
        const normalizedMonth = String(month || '');

        if (!normalizedMonth) {
          return false;
        }

        setWorkspaceDeletionMarker(normalizedMonth, new Date().toISOString());

        const store = loadMonthlyWorkspaceStore();

        let deleted = false;
        const backend = await openMonthlyWorkspaceIndexedDb();

        if (backend) {
          deleted = Boolean(await backend.deleteWorkspace(normalizedMonth));
        }

        if (store.workspaces && store.workspaces[normalizedMonth]) {
          delete store.workspaces[normalizedMonth];
          deleted = true;
        }

        const remainingMonths = normalizeWorkspaceMonths((store.workspaceMonths || []).filter((monthKey) => monthKey !== normalizedMonth));

        saveMonthlyWorkspaceStore({
          lastUsedMonth: store.lastUsedMonth === normalizedMonth
            ? pickFallbackWorkspaceMonth(remainingMonths)
            : store.lastUsedMonth,
          workspaceMonths: remainingMonths,
          workspaces: {}
        }, { includeWorkspaces: false });

        return deleted;
      }

      async function restoreWorkspaceForMonth(month, options) {
        const requestToken = ++currentWorkspaceViewRequestToken;
        const normalizedMonth = String(month || '');
        currentClearedWorkspaceMonth = normalizedMonth === currentClearedWorkspaceMonth ? '' : currentClearedWorkspaceMonth;
        const loadedWorkspace = await loadMonthWorkspace(normalizedMonth);
        const workspace = loadedWorkspace && loadedWorkspace.workspace;
        const loadState = loadedWorkspace && loadedWorkspace.loadState
          ? loadedWorkspace.loadState
          : buildWorkspacePersistenceState({
            status: 'missing',
            backendName: 'none',
            storageKeyUsed: buildWorkspacePersistenceStorageKey('none', normalizedMonth),
            saveCompletedBeforeRerunInputAssembly: 'not-applicable',
            saveAttempted: false,
            errorMessage: ''
          });

        if (requestToken !== currentWorkspaceViewRequestToken) {
          currentPendingSelectedFiles = [];
          currentPendingSelectedFileNames = [];
          currentPendingSelectedMonthKey = normalizedMonth;
          currentExplicitSelectionResetMarker = 'none';
          currentSelectionInvariantWarning = 'none';
          currentSelectionInvariantGuardApplied = 'no';
          return false;
        }

        currentLaterMonthCarryoverResolutionState = workspace && workspace.runtimeState && shouldLoadLaterMonthCarryoverResolution(workspace.runtimeState, normalizedMonth)
          ? await loadLaterMonthCarryoverResolutionState(normalizedMonth)
          : buildLaterMonthCarryoverResolutionState({ sourceMonthKey: normalizedMonth });

        appendWorkspaceRenderDebugCheckpoint({
          phase: workspace && workspace.runtimeState ? 'restore-loaded' : 'restore-missing',
          requestToken,
          restoreToken: requestToken,
          restoreSource: workspace && workspace.runtimeState ? 'persisted-workspace' : 'missing-workspace',
          currentMonthKey: normalizedMonth,
          workspacePersistenceBackend: loadState.backendName,
          storageKeyUsed: loadState.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: loadState.saveCompletedBeforeRerunInputAssembly,
          selectedFileNames: currentWorkspaceRenderDebug.selectedFileNames,
          selectedBatchFileCount: currentWorkspaceRenderDebug.selectedBatchFileCount,
          persistedWorkspaceFileNamesBeforeRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(workspace && workspace.files),
          persistedWorkspaceFileCountBeforeRerun: Array.isArray(workspace && workspace.files) ? workspace.files.length : 0,
          mergedFileNamesUsedForRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(workspace && workspace.files),
          mergedFileCountUsedForRerun: Array.isArray(workspace && workspace.files) ? workspace.files.length : 0,
          visibleTraceFileNamesAfterRender: currentWorkspaceRenderDebug.visibleTraceFileNamesAfterRender,
          visibleTraceFileCount: currentWorkspaceRenderDebug.visibleTraceFileCount,
          renderSource: workspace && workspace.runtimeState ? 'persistedWorkspace' : 'selectedFiles',
          mergedFileSample: buildWorkspaceDebugSampleFromWorkspaceRecords(workspace && workspace.files)
        });

        currentWorkspaceMonth = normalizedMonth;

        if (monthInput) {
          monthInput.value = normalizedMonth;
        }

        if (!workspace || !workspace.runtimeState) {
          setWorkspaceRenderDebugState({
            requestToken,
            restoreToken: requestToken,
            restoreSource: 'missing-workspace',
            currentMonthKey: normalizedMonth,
            selectedFileNames: [],
            persistedWorkspaceFileCountBeforeRerun: 0,
            persistedWorkspaceFileNamesBeforeRerun: [],
            selectedBatchFileCount: 0,
            mergedFileCountUsedForRerun: 0,
            mergedFileNamesUsedForRerun: [],
            visibleTraceFileCount: 0,
            visibleTraceFileNamesAfterRender: [],
            renderSource: 'persistedWorkspace',
            workspacePersistenceBackend: loadState.backendName,
            storageKeyUsed: loadState.storageKeyUsed,
            saveCompletedBeforeRerunInputAssembly: loadState.saveCompletedBeforeRerunInputAssembly,
            lastSaveStatus: loadState.status,
            mergedFileSample: []
          });
          currentWorkspaceFiles = [];
          currentExpenseReviewOverrides = [];
          currentManualMatchGroups = [];
          currentSelectedManualMatchItemIds = [];
          currentManualMatchDraftNote = '';
          currentManualMatchConfirmMode = false;
          renderInitialVisibleState();
          runtimeOutput.innerHTML = normalizedMonth
            ? '<p class="hint">Pro měsíc <strong>' + escapeHtml(normalizedMonth) + '</strong> zatím není uložený žádný browser workspace.</p>'
            : '<p class="hint">Měsíční workflow zatím neběželo. Výsledek se zobrazí až po výběru skutečných souborů a spuštění uploadu.</p>';
          runtimeStageCopy.innerHTML = normalizedMonth
            ? 'Stav stránky: <strong>vybraný měsíc zatím nemá uložený workspace</strong>. Další upload do tohoto měsíce založí nový pracovní stav.'
            : 'Stav stránky: <strong>čeká na uploadovaný runtime běh</strong>. Bez vybraných souborů se nezobrazuje žádný předvyplněný payout výsledek.';
          return false;
        }

        currentWorkspaceFiles = Array.isArray(workspace.files) ? workspace.files.slice() : [];
        currentExpenseReviewOverrides = sanitizeExpenseReviewOverridesForStorage(workspace.expenseReviewOverrides);
        currentManualMatchGroups = sanitizeManualMatchGroupsForStorage(workspace.manualMatchGroups);
        currentSelectedManualMatchItemIds = [];
        currentManualMatchDraftNote = '';
        currentManualMatchConfirmMode = false;
        setWorkspaceRenderDebugState({
          requestToken,
          restoreToken: requestToken,
          restoreSource: 'persisted-workspace',
          currentMonthKey: normalizedMonth,
          selectedFileNames: [],
          persistedWorkspaceFileCountBeforeRerun: currentWorkspaceFiles.length,
          persistedWorkspaceFileNamesBeforeRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(currentWorkspaceFiles),
          selectedBatchFileCount: 0,
          mergedFileCountUsedForRerun: currentWorkspaceFiles.length,
          mergedFileNamesUsedForRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(currentWorkspaceFiles),
          visibleTraceFileCount: currentWorkspaceFiles.length,
          visibleTraceFileNamesAfterRender: buildWorkspaceDebugNamesFromWorkspaceRecords(currentWorkspaceFiles),
          renderSource: 'persistedWorkspace',
          workspacePersistenceBackend: loadState.backendName,
          storageKeyUsed: loadState.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: loadState.saveCompletedBeforeRerunInputAssembly,
          lastSaveStatus: loadState.status,
          carryoverPreviousMonthKeyResolved: String(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.sourceMonthKey || resolvePreviousMonthKey(normalizedMonth)),
          carryoverPreviousMonthWorkspaceFound: String(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.sourceMonthKey ? 'ano' : 'ne'),
          carryoverPreviousMonthMatchedPayoutBatchCount: 0,
          carryoverPreviousMonthUnmatchedPayoutBatchCount: Number(workspace.runtimeState && workspace.runtimeState.carryoverSourceSnapshot && workspace.runtimeState.carryoverSourceSnapshot.payoutBatches && workspace.runtimeState.carryoverSourceSnapshot.payoutBatches.length || 0),
          carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: Array.isArray(workspace.runtimeState && workspace.runtimeState.carryoverSourceSnapshot && workspace.runtimeState.carryoverSourceSnapshot.payoutBatches)
            ? workspace.runtimeState.carryoverSourceSnapshot.payoutBatches.map((item) => item.payoutBatchKey).slice(0, 5)
            : [],
          carryoverPreviousMonthUnmatchedOnly: 'no',
          carryoverSourceMonth: String(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.sourceMonthKey || ''),
          carryoverCurrentMonth: String(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.currentMonthKey || normalizedMonth),
          carryoverLoadedPayoutBatchCount: Number(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.loadedPayoutBatchCount || 0),
          carryoverLoadedPayoutBatchIdsSample: Array.isArray(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.loadedPayoutBatchKeysSample)
            ? workspace.runtimeState.carryoverDebug.loadedPayoutBatchKeysSample.slice(0, 5)
            : [],
          carryoverMatchingInputPayoutBatchCount: Number(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.matchingInputPayoutBatchCount || 0),
          carryoverMatchingInputPayoutBatchIdsSample: Array.isArray(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.matchingInputPayoutBatchKeysSample)
            ? workspace.runtimeState.carryoverDebug.matchingInputPayoutBatchKeysSample.slice(0, 5)
            : [],
          carryoverMatcherCandidateExisted: workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.matcherCarryoverCandidateExists ? 'ano' : 'ne',
          carryoverMatcherRejectedReason: String(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.matcherCarryoverRejectedReason || ''),
          carryoverSourceClearMarker: '',
          carryoverMatchedCount: Number(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.matchedCount || 0),
          carryoverUnmatchedCount: Number(workspace.runtimeState && workspace.runtimeState.carryoverDebug && workspace.runtimeState.carryoverDebug.unmatchedCount || 0),
          mergedFileSample: buildWorkspaceDebugSampleFromWorkspaceRecords(currentWorkspaceFiles)
        });
        const visibleState = buildCompletedVisibleRuntimeState(workspace.runtimeState);
        applyVisibleRuntimeState(visibleState, 'completed');
        appendWorkspaceRenderDebugCheckpoint({
          phase: 'after-render-overwrite',
          requestToken,
          restoreToken: requestToken,
          restoreSource: 'persisted-workspace',
          currentMonthKey: normalizedMonth,
          workspacePersistenceBackend: loadState.backendName,
          storageKeyUsed: loadState.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: loadState.saveCompletedBeforeRerunInputAssembly,
          selectedFileNames: [],
          selectedBatchFileCount: 0,
          persistedWorkspaceFileNamesBeforeRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(currentWorkspaceFiles),
          persistedWorkspaceFileCountBeforeRerun: currentWorkspaceFiles.length,
          mergedFileNamesUsedForRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(currentWorkspaceFiles),
          mergedFileCountUsedForRerun: currentWorkspaceFiles.length,
          visibleTraceFileNamesAfterRender: buildVisibleTraceFileNamesFromState(visibleState),
          visibleTraceFileCount: buildVisibleTraceFileCountFromState(visibleState),
          renderSource: 'persistedWorkspace',
          carryoverPreviousMonthKeyResolved: String(visibleState.carryoverDebug && visibleState.carryoverDebug.sourceMonthKey || resolvePreviousMonthKey(normalizedMonth)),
          carryoverPreviousMonthWorkspaceFound: String(visibleState.carryoverDebug && visibleState.carryoverDebug.sourceMonthKey ? 'ano' : 'ne'),
          carryoverPreviousMonthMatchedPayoutBatchCount: 0,
          carryoverPreviousMonthUnmatchedPayoutBatchCount: Number(workspace.runtimeState && workspace.runtimeState.carryoverSourceSnapshot && workspace.runtimeState.carryoverSourceSnapshot.payoutBatches && workspace.runtimeState.carryoverSourceSnapshot.payoutBatches.length || 0),
          carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: Array.isArray(workspace.runtimeState && workspace.runtimeState.carryoverSourceSnapshot && workspace.runtimeState.carryoverSourceSnapshot.payoutBatches)
            ? workspace.runtimeState.carryoverSourceSnapshot.payoutBatches.map((item) => item.payoutBatchKey).slice(0, 5)
            : [],
          carryoverPreviousMonthUnmatchedOnly: 'no',
          carryoverSourceMonth: String(visibleState.carryoverDebug && visibleState.carryoverDebug.sourceMonthKey || ''),
          carryoverCurrentMonth: String(visibleState.carryoverDebug && visibleState.carryoverDebug.currentMonthKey || normalizedMonth),
          carryoverLoadedPayoutBatchCount: Number(visibleState.carryoverDebug && visibleState.carryoverDebug.loadedPayoutBatchCount || 0),
          carryoverLoadedPayoutBatchIdsSample: Array.isArray(visibleState.carryoverDebug && visibleState.carryoverDebug.loadedPayoutBatchKeysSample)
            ? visibleState.carryoverDebug.loadedPayoutBatchKeysSample.slice(0, 5)
            : [],
          carryoverMatchingInputPayoutBatchCount: Number(visibleState.carryoverDebug && visibleState.carryoverDebug.matchingInputPayoutBatchCount || 0),
          carryoverMatchingInputPayoutBatchIdsSample: Array.isArray(visibleState.carryoverDebug && visibleState.carryoverDebug.matchingInputPayoutBatchKeysSample)
            ? visibleState.carryoverDebug.matchingInputPayoutBatchKeysSample.slice(0, 5)
            : [],
          carryoverMatcherCandidateExisted: visibleState.carryoverDebug && visibleState.carryoverDebug.matcherCarryoverCandidateExists ? 'ano' : 'ne',
          carryoverMatcherRejectedReason: String(visibleState.carryoverDebug && visibleState.carryoverDebug.matcherCarryoverRejectedReason || ''),
          carryoverSourceClearMarker: '',
          carryoverMatchedCount: Number(visibleState.carryoverDebug && visibleState.carryoverDebug.matchedCount || 0),
          carryoverUnmatchedCount: Number(visibleState.carryoverDebug && visibleState.carryoverDebug.unmatchedCount || 0),
          mergedFileSample: buildWorkspaceDebugSampleFromWorkspaceRecords(currentWorkspaceFiles)
        });
        runtimeOutput.innerHTML = [
          '<h3>Výsledek spuštěného browser workflow</h3>',
          '<p><strong>Obnovený měsíc:</strong> ' + escapeHtml(normalizedMonth) + '</p>',
          '<p><strong>Run ID:</strong> <code>' + escapeHtml(String(visibleState.runId || 'bez runtime běhu')) + '</code></p>',
          '<p class="hint">Stránka obnovila uložený browser workspace pro tento měsíc včetně souborů a ručních rozhodnutí ve výdajích.</p>'
        ].join('');
        runtimeStageCopy.innerHTML = 'Stav stránky: <strong>obnovený uložený workspace měsíce</strong>. Další upload do stejného měsíce doplní existující soubory místo úplného přepsání.';

        const store = loadMonthlyWorkspaceStore();
        saveMonthlyWorkspaceStore({
          lastUsedMonth: normalizedMonth,
          workspaceMonths: normalizeWorkspaceMonths((store.workspaceMonths || []).concat([normalizedMonth])),
          workspaces: store.workspaces
        }, { includeWorkspaces: false });

        if (!(options && options.preserveCurrentView)) {
          showOperatorView(resolveOperatorViewFromHash());
        }

        return true;
      }

      function buildExpenseReviewOverrideScopeKey(state) {
        const normalizedState = state || {};
        const runId = String(normalizedState.runId || '');
        const reviewItems = normalizedState.reviewSections && Array.isArray(normalizedState.reviewSections.expenseNeedsReview)
          ? normalizedState.reviewSections.expenseNeedsReview
          : [];
        const reviewItemIds = reviewItems
          .map((item) => String(item && item.id || ''))
          .filter(Boolean)
          .sort();

        if (!runId) {
          return '';
        }

        return runId + '::' + reviewItemIds.join('|');
      }

      function buildExpenseReviewOverrideStorageKey(state) {
        const scopeKey = buildExpenseReviewOverrideScopeKey(state);
        return scopeKey ? expenseReviewOverrideStoragePrefix + scopeKey : '';
      }

      function loadExpenseReviewOverridesFromStorage(state) {
        const storage = getExpenseReviewOverrideStorage();
        const storageKey = buildExpenseReviewOverrideStorageKey(state);

        if (!storage || !storageKey) {
          return [];
        }

        try {
          const rawValue = storage.getItem(storageKey);

          if (!rawValue) {
            return [];
          }

          const parsed = JSON.parse(rawValue);

          if (!Array.isArray(parsed)) {
            return [];
          }

          return parsed
            .filter((item) =>
              item
              && typeof item.reviewItemId === 'string'
              && item.reviewItemId
              && (item.decision === 'confirmed' || item.decision === 'rejected')
            )
            .map((item) => ({
              reviewItemId: String(item.reviewItemId),
              decision: item.decision === 'confirmed' ? 'confirmed' : 'rejected',
              decidedAt: typeof item.decidedAt === 'string' && item.decidedAt ? item.decidedAt : undefined
            }));
        } catch {
          return [];
        }
      }

      function persistExpenseReviewOverrides(state) {
        const storage = getExpenseReviewOverrideStorage();
        const storageKey = buildExpenseReviewOverrideStorageKey(state);

        if (!storage || !storageKey) {
          return;
        }

        try {
          if (!Array.isArray(currentExpenseReviewOverrides) || currentExpenseReviewOverrides.length === 0) {
            storage.removeItem(storageKey);
            return;
          }

          storage.setItem(storageKey, JSON.stringify(currentExpenseReviewOverrides.map((override) => ({
            reviewItemId: String(override.reviewItemId || ''),
            decision: override.decision === 'confirmed' ? 'confirmed' : 'rejected',
            decidedAt: override.decidedAt ? String(override.decidedAt) : undefined
          }))));
        } catch {
          // Browser persistence is best-effort only; the UI still works for the current render pass.
        }
      }

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

      function buildLaterMonthResolvedPayoutReviewItem(unmatchedItem, resolution) {
        const payoutBatchKey = String(
          resolution && resolution.payoutBatchKey
          || extractPayoutBatchKeyFromReviewItemId(unmatchedItem && unmatchedItem.id, 'payout-batch-unmatched:')
        );
        const laterMonthKey = String(resolution && resolution.laterMonthKey || '');
        const matchedItemTitle = String(resolution && resolution.matchedItemTitle || unmatchedItem && unmatchedItem.title || '');
        const matchedItemDetail = String(resolution && resolution.matchedItemDetail || '');
        const resolvedExplanation = laterMonthKey
          ? 'Payout dávka byla uzavřena v následujícím měsíci ' + laterMonthKey + ' přes carryover bankovní důkaz.'
          : 'Payout dávka byla uzavřena v následujícím měsíci přes carryover bankovní důkaz.';
        const evidenceSummary = Array.isArray(unmatchedItem && unmatchedItem.evidenceSummary)
          ? unmatchedItem.evidenceSummary.slice()
          : [];

        evidenceSummary.push({
          label: 'provenience',
          value: laterMonthKey
            ? 'uzavřeno bankou v měsíci ' + laterMonthKey
            : 'uzavřeno bankou v následujícím měsíci'
        });

        return {
          ...unmatchedItem,
          id: 'payout-batch-resolved-later:' + payoutBatchKey,
          kind: 'matched',
          title: matchedItemTitle,
          detail: matchedItemDetail
            ? matchedItemDetail + ' ' + resolvedExplanation
            : resolvedExplanation,
          matchStrength: 'potvrzená shoda',
          evidenceSummary,
          operatorExplanation: resolvedExplanation,
          operatorCheckHint: laterMonthKey
            ? 'Zkontrolujte bankovní důkaz v měsíci ' + laterMonthKey + '.'
            : 'Zkontrolujte bankovní důkaz v následujícím měsíci.'
        };
      }

      function applyLaterMonthCarryoverResolutionProjection(reviewSections, currentMonthKey) {
        const normalizedMonth = String(currentMonthKey || '');
        const resolutionState = currentLaterMonthCarryoverResolutionState;
        const resolvedPayoutBatches = Array.isArray(resolutionState && resolutionState.resolvedPayoutBatches)
          ? resolutionState.resolvedPayoutBatches
          : [];

        if (!normalizedMonth || String(resolutionState && resolutionState.sourceMonthKey || '') !== normalizedMonth || resolvedPayoutBatches.length === 0) {
          return reviewSections || {};
        }

        const resolvedByBatchKey = new Map(
          resolvedPayoutBatches
            .map((item) => [String(item && item.payoutBatchKey || ''), item])
            .filter((entry) => entry[0])
        );
        const matchedItems = Array.isArray(reviewSections && reviewSections.payoutBatchMatched)
          ? reviewSections.payoutBatchMatched.slice()
          : [];
        const unmatchedItems = Array.isArray(reviewSections && reviewSections.payoutBatchUnmatched)
          ? reviewSections.payoutBatchUnmatched
          : [];
        const matchedBatchKeys = new Set(
          matchedItems
            .map((item) => extractPayoutBatchKeyFromReviewItemId(item && item.id, 'payout-batch:'))
            .filter(Boolean)
        );
        const projectedUnmatchedItems = [];

        for (const unmatchedItem of unmatchedItems) {
          const payoutBatchKey = extractPayoutBatchKeyFromReviewItemId(unmatchedItem && unmatchedItem.id, 'payout-batch-unmatched:');
          const resolution = payoutBatchKey ? resolvedByBatchKey.get(payoutBatchKey) : undefined;

          if (!resolution) {
            projectedUnmatchedItems.push(unmatchedItem);
            continue;
          }

          if (!matchedBatchKeys.has(payoutBatchKey)) {
            matchedItems.push(buildLaterMonthResolvedPayoutReviewItem(unmatchedItem, resolution));
            matchedBatchKeys.add(payoutBatchKey);
          }
        }

        return {
          ...(reviewSections || {}),
          payoutBatchMatched: matchedItems,
          payoutBatchUnmatched: projectedUnmatchedItems
        };
      }

      function shouldLoadLaterMonthCarryoverResolution(runtimeState, currentMonthKey) {
        const normalizedMonth = String(currentMonthKey || '');
        const carryoverSourcePayoutBatches = Array.isArray(runtimeState && runtimeState.carryoverSourceSnapshot && runtimeState.carryoverSourceSnapshot.payoutBatches)
          ? runtimeState.carryoverSourceSnapshot.payoutBatches
          : [];
        const unmatchedPayoutBatchKeys = Array.isArray(runtimeState && runtimeState.reconciliationSnapshot && runtimeState.reconciliationSnapshot.unmatchedPayoutBatchKeys)
          ? runtimeState.reconciliationSnapshot.unmatchedPayoutBatchKeys
            .map((item) => String(item || ''))
            .filter((key) => key.startsWith('comgate-batch:'))
          : [];

        return Boolean(normalizedMonth && (carryoverSourcePayoutBatches.length > 0 || unmatchedPayoutBatchKeys.length > 0));
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
        const rejectedCandidates = Array.isArray(fieldDebug.rejectedCandidates) && fieldDebug.rejectedCandidates.length > 0
          ? fieldDebug.rejectedCandidates.join(' || ')
          : 'žádné';

        return [
          '<br /><span class="hint">Field ' + escapeHtml(label) + ': winner '
            + escapeHtml(String(fieldDebug.winnerRule || 'n/a'))
            + ' / '
            + escapeHtml(String(fieldDebug.winnerValue || 'n/a'))
            + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' candidates: ' + escapeHtml(candidateValues) + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' rejected: ' + escapeHtml(rejectedCandidates) + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' grouped: ' + escapeHtml(groupedMatches) + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' line-window: ' + escapeHtml(lineWindowMatches) + '</span>',
          '<br /><span class="hint">Field ' + escapeHtml(label) + ' fallback: ' + escapeHtml(fallbackMatches) + '</span>'
        ].join('');
      }

      function buildGroupedBlockDebugMarkup(file, summaryKey, label) {
        const summary = file && file.documentExtractionSummary;
        const groupedBlocks = summary && Array.isArray(summary[summaryKey]) ? summary[summaryKey] : [];

        if (!groupedBlocks || groupedBlocks.length === 0) {
          return '';
        }

        return groupedBlocks.map(function (block, index) {
          return [
            '<br /><span class="hint">' + escapeHtml(label) + ' candidate #' + escapeHtml(String(index + 1)) + ': '
              + escapeHtml(String(block.blockTypeCandidate || 'unknown'))
              + ' / score=' + escapeHtml(String(block.score || 0))
              + ' / ' + escapeHtml(block.accepted ? 'accepted' : 'rejected')
              + (block.rejectionReason ? ' / ' + escapeHtml(String(block.rejectionReason)) : '')
              + '</span>',
            '<br /><span class="hint">' + escapeHtml(label) + ' labels: '
              + escapeHtml(Array.isArray(block.labels) && block.labels.length > 0 ? block.labels.join(' | ') : 'žádné')
              + '</span>',
            '<br /><span class="hint">' + escapeHtml(label) + ' values: '
              + escapeHtml(Array.isArray(block.values) && block.values.length > 0 ? block.values.join(' | ') : 'žádné')
              + '</span>'
          ].join('');
        }).join('');
      }

      function buildInvoiceFieldExtractionDebugMarkup(file) {
        if (!file || !file.documentExtractionSummary || file.documentExtractionSummary.documentKind !== 'invoice') {
          return '';
        }

        return [
          buildInvoiceRawBlockDebugMarkup(file),
          buildGroupedBlockDebugMarkup(file, 'groupedHeaderBlockDebug', 'Grouped header block'),
          buildGroupedBlockDebugMarkup(file, 'groupedTotalsBlockDebug', 'Grouped totals block'),
          buildInvoiceQrDebugMarkup(file),
          buildDocumentFieldExtractionDebugLine(file, 'referenceNumber', 'referenceNumber'),
          buildDocumentFieldExtractionDebugLine(file, 'issueDate', 'issueDate'),
          buildDocumentFieldExtractionDebugLine(file, 'dueDate', 'dueDate'),
          buildDocumentFieldExtractionDebugLine(file, 'taxableDate', 'taxableDate'),
          buildDocumentFieldExtractionDebugLine(file, 'paymentMethod', 'paymentMethod'),
          buildDocumentFieldExtractionDebugLine(file, 'totalAmount', 'totalAmount')
        ].join('');
      }

      function buildInvoiceQrDebugMarkup(file) {
        const summary = file && file.documentExtractionSummary;

        if (!summary || summary.documentKind !== 'invoice') {
          return '';
        }

        const parsedQrFields = summary.qrParsedFields || {};
        const parsedQrEntries = [
          parsedQrFields.account ? 'account=' + parsedQrFields.account : '',
          parsedQrFields.ibanHint ? 'ibanHint=' + parsedQrFields.ibanHint : '',
          typeof parsedQrFields.amountMinor === 'number' ? 'amountMinor=' + String(parsedQrFields.amountMinor) : '',
          parsedQrFields.currency ? 'currency=' + parsedQrFields.currency : '',
          parsedQrFields.variableSymbol ? 'variableSymbol=' + parsedQrFields.variableSymbol : '',
          parsedQrFields.constantSymbol ? 'constantSymbol=' + parsedQrFields.constantSymbol : '',
          parsedQrFields.specificSymbol ? 'specificSymbol=' + parsedQrFields.specificSymbol : '',
          parsedQrFields.recipientName ? 'recipientName=' + parsedQrFields.recipientName : '',
          parsedQrFields.message ? 'message=' + parsedQrFields.message : '',
          parsedQrFields.dueDate ? 'dueDate=' + parsedQrFields.dueDate : '',
          parsedQrFields.referenceNumber ? 'referenceNumber=' + parsedQrFields.referenceNumber : ''
        ].filter(Boolean);
        const fieldProvenance = summary.fieldProvenance || {};
        const provenanceEntries = Object.keys(fieldProvenance)
          .sort()
          .map(function (fieldKey) {
            return fieldKey + '=' + String(fieldProvenance[fieldKey]);
          });

        return [
          '<br /><span class="hint">QR detected: ' + escapeHtml(summary.qrDetected ? 'yes' : 'no') + '</span>',
          summary.qrRawPayload
            ? '<br /><span class="hint">QR raw payload: ' + escapeHtml(String(summary.qrRawPayload)) + '</span>'
            : '',
          '<br /><span class="hint">QR parsed fields: '
            + escapeHtml(parsedQrEntries.length > 0 ? parsedQrEntries.join(' | ') : 'žádné')
            + '</span>',
          '<br /><span class="hint">QR recovered fields: '
            + escapeHtml(Array.isArray(summary.qrRecoveredFields) && summary.qrRecoveredFields.length > 0 ? summary.qrRecoveredFields.join(', ') : 'žádné')
            + '</span>',
          '<br /><span class="hint">QR confirmed fields: '
            + escapeHtml(Array.isArray(summary.qrConfirmedFields) && summary.qrConfirmedFields.length > 0 ? summary.qrConfirmedFields.join(', ') : 'žádné')
            + '</span>',
          '<br /><span class="hint">Final field provenance: '
            + escapeHtml(provenanceEntries.length > 0 ? provenanceEntries.join(' | ') : 'žádné')
            + '</span>'
        ].join('');
      }

      function buildDocumentOcrDebugMarkup(file) {
        const summary = file && file.documentExtractionSummary;

        if (!summary) {
          return '';
        }

        const parsedOcrFields = summary.ocrParsedFields || {};
        const parsedOcrEntries = Object.keys(parsedOcrFields)
          .sort()
          .map(function (fieldKey) {
            return fieldKey + '=' + String(parsedOcrFields[fieldKey]);
          });

        return [
          '<br /><span class="hint">OCR detected: ' + escapeHtml(summary.ocrDetected ? 'yes' : 'no') + '</span>',
          summary.ocrRawPayload
            ? '<br /><span class="hint">OCR raw payload: ' + escapeHtml(String(summary.ocrRawPayload)) + '</span>'
            : '',
          '<br /><span class="hint">OCR parsed fields: '
            + escapeHtml(parsedOcrEntries.length > 0 ? parsedOcrEntries.join(' | ') : 'žádné')
            + '</span>',
          '<br /><span class="hint">OCR recovered fields: '
            + escapeHtml(Array.isArray(summary.ocrRecoveredFields) && summary.ocrRecoveredFields.length > 0 ? summary.ocrRecoveredFields.join(', ') : 'žádné')
            + '</span>',
          '<br /><span class="hint">OCR confirmed fields: '
            + escapeHtml(Array.isArray(summary.ocrConfirmedFields) && summary.ocrConfirmedFields.length > 0 ? summary.ocrConfirmedFields.join(', ') : 'žádné')
            + '</span>'
        ].join('');
      }

      function buildDocumentExtractionStagesMarkup(file) {
        const summary = file && file.documentExtractionSummary;

        if (!summary) {
          return '';
        }

        const stageEntries = Array.isArray(summary.extractionStages)
          ? summary.extractionStages.map(function (stage) {
              var notes = Array.isArray(stage.notes) && stage.notes.length > 0 ? ' (' + stage.notes.join(' / ') + ')' : '';
              return stage.stage + '=' + stage.outcome + notes;
            })
          : [];
        const confidenceEntries = summary.fieldConfidence
          ? Object.keys(summary.fieldConfidence).sort().map(function (fieldKey) {
              return fieldKey + '=' + String(summary.fieldConfidence[fieldKey]);
            })
          : [];

        return [
          summary.finalStatus
            ? '<br /><span class="hint">Final status: ' + escapeHtml(String(summary.finalStatus)) + '</span>'
            : '',
          '<br /><span class="hint">Field confidence: '
            + escapeHtml(confidenceEntries.length > 0 ? confidenceEntries.join(' | ') : 'žádné')
            + '</span>',
          '<br /><span class="hint">Extraction stages: '
            + escapeHtml(stageEntries.length > 0 ? stageEntries.join(' | ') : 'žádné')
            + '</span>'
        ].join('');
      }

      function buildAirbnbHeaderDiagnosticsMarkup(file) {
        const diagnostics = file && file.airbnbHeaderDiagnostics;

        if (!diagnostics) {
          return '';
        }

        const mappedHeaders = diagnostics.mappedCanonicalHeaders || {};

        return [
          '<br /><span class="hint">Airbnb parser variant: ' + escapeHtml(String(diagnostics.parserVariant || 'unknown')) + '</span>',
          '<br /><span class="hint">Airbnb detected header row: ' + escapeHtml(String(diagnostics.rawHeaderRow || 'n/a')) + '</span>',
          '<br /><span class="hint">Airbnb normalized headers: ' + escapeHtml(Array.isArray(diagnostics.normalizedHeaders) && diagnostics.normalizedHeaders.length > 0 ? diagnostics.normalizedHeaders.join(' | ') : 'žádné') + '</span>',
          '<br /><span class="hint">Airbnb normalized header map: ' + escapeHtml(Array.isArray(diagnostics.normalizedHeaderMap) && diagnostics.normalizedHeaderMap.length > 0 ? diagnostics.normalizedHeaderMap.join(' | ') : 'žádné') + '</span>',
          '<br /><span class="hint">Airbnb required canonical headers: ' + escapeHtml(Array.isArray(diagnostics.requiredCanonicalHeaders) && diagnostics.requiredCanonicalHeaders.length > 0 ? diagnostics.requiredCanonicalHeaders.join(', ') : 'žádné') + '</span>',
          '<br /><span class="hint">Airbnb mapped payoutDate: ' + escapeHtml(String(mappedHeaders.payoutDate || 'n/a')) + '</span>',
          '<br /><span class="hint">Airbnb mapped payoutReference: ' + escapeHtml(String(mappedHeaders.payoutReference || 'n/a')) + '</span>',
          '<br /><span class="hint">Airbnb mapped reservationId: ' + escapeHtml(String(mappedHeaders.reservationId || 'n/a')) + '</span>',
          '<br /><span class="hint">Airbnb mapped listingId: ' + escapeHtml(String(mappedHeaders.listingId || 'n/a')) + '</span>',
          '<br /><span class="hint">Airbnb candidate source headers: ' + escapeHtml(Array.isArray(diagnostics.candidateSourceHeaders) && diagnostics.candidateSourceHeaders.length > 0 ? diagnostics.candidateSourceHeaders.join(' | ') : 'žádné') + '</span>',
          '<br /><span class="hint">Airbnb missing canonical headers: ' + escapeHtml(Array.isArray(diagnostics.missingCanonicalHeaders) && diagnostics.missingCanonicalHeaders.length > 0 ? diagnostics.missingCanonicalHeaders.join(', ') : 'žádné') + '</span>'
        ].join('');
      }

      function buildComgateHeaderDiagnosticsMarkup(file) {
        const diagnostics = file && file.comgateHeaderDiagnostics;

        if (!diagnostics) {
          return '';
        }

        return [
          '<br /><span class="hint">Comgate detected file kind: ' + escapeHtml(String(diagnostics.detectedFileKind || 'unknown')) + '</span>',
          '<br /><span class="hint">Comgate parser variant: ' + escapeHtml(String(diagnostics.parserVariant || 'unknown')) + '</span>',
          '<br /><span class="hint">Comgate detected delimiter: ' + escapeHtml(String(diagnostics.detectedDelimiter || 'n/a')) + '</span>',
          '<br /><span class="hint">Comgate detected header row: ' + escapeHtml(String(diagnostics.rawHeaderRow || 'n/a')) + '</span>',
          '<br /><span class="hint">Comgate raw headers: ' + escapeHtml(Array.isArray(diagnostics.rawHeaders) && diagnostics.rawHeaders.length > 0 ? diagnostics.rawHeaders.join(' | ') : 'žádné') + '</span>',
          '<br /><span class="hint">Comgate canonical headers: ' + escapeHtml(Array.isArray(diagnostics.canonicalHeaders) && diagnostics.canonicalHeaders.length > 0 ? diagnostics.canonicalHeaders.join(' | ') : 'žádné') + '</span>',
          '<br /><span class="hint">Comgate normalized header map: ' + escapeHtml(Array.isArray(diagnostics.normalizedHeaderMap) && diagnostics.normalizedHeaderMap.length > 0 ? diagnostics.normalizedHeaderMap.join(' | ') : 'žádné') + '</span>',
          '<br /><span class="hint">Comgate required canonical headers: ' + escapeHtml(Array.isArray(diagnostics.requiredCanonicalHeaders) && diagnostics.requiredCanonicalHeaders.length > 0 ? diagnostics.requiredCanonicalHeaders.join(', ') : 'žádné') + '</span>',
          '<br /><span class="hint">Comgate missing canonical headers: ' + escapeHtml(Array.isArray(diagnostics.missingCanonicalHeaders) && diagnostics.missingCanonicalHeaders.length > 0 ? diagnostics.missingCanonicalHeaders.join(', ') : 'žádné') + '</span>',
          typeof diagnostics.componentRowCount === 'number'
            ? '<br /><span class="hint">Comgate extracted component rows: ' + escapeHtml(String(diagnostics.componentRowCount)) + '</span>'
            : '',
          '<br /><span class="hint">Comgate explicit settlement total: ' + escapeHtml(buildDebugBooleanLabel(Boolean(diagnostics.containsExplicitSettlementTotal))) + '</span>',
          typeof diagnostics.explicitSettlementTotalMinor === 'number'
            ? '<br /><span class="hint">Comgate extracted settlement total: ' + escapeHtml(buildAmountDisplay(diagnostics.explicitSettlementTotalMinor, 'CZK')) + '</span>'
            : ''
        ].join('');
      }

      function buildInvoiceRawBlockDebugMarkup(file) {
        const summary = file && file.documentExtractionSummary;
        const rawBlocks = summary && Array.isArray(summary.rawBlockDiscoveryDebug) ? summary.rawBlockDiscoveryDebug : [];

        if (!rawBlocks || rawBlocks.length === 0) {
          return '';
        }

        return rawBlocks.map(function (block) {
          return [
            '<br /><span class="hint">Raw block #' + escapeHtml(String(block.blockIndex)) + ': '
              + escapeHtml(String(block.blockTypeGuess || 'other'))
              + ' / ' + escapeHtml(String(block.promotionDecision || 'not-promoted'))
              + (block.promotedTo ? ' / ' + escapeHtml(String(block.promotedTo)) : '')
              + '</span>',
            '<br /><span class="hint">Raw block lines: '
              + escapeHtml(Array.isArray(block.rawLines) && block.rawLines.length > 0 ? block.rawLines.join(' | ') : 'žádné')
              + '</span>',
            '<br /><span class="hint">Raw block normalized: '
              + escapeHtml(Array.isArray(block.normalizedLines) && block.normalizedLines.length > 0 ? block.normalizedLines.join(' | ') : 'žádné')
              + '</span>'
          ].join('');
        }).join('');
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
          file.documentExtractionSummary && file.documentExtractionSummary.referenceNumber
            ? '<br /><span class="hint">Final referenceNumber: ' + escapeHtml(String(file.documentExtractionSummary.referenceNumber)) + '</span>'
            : '',
          file.documentExtractionSummary && file.documentExtractionSummary.issueDate
            ? '<br /><span class="hint">Final issueDate: ' + escapeHtml(String(file.documentExtractionSummary.issueDate)) + '</span>'
            : '',
          file.documentExtractionSummary
            && Array.isArray(file.documentExtractionSummary.groupedHeaderLabels)
            && file.documentExtractionSummary.groupedHeaderLabels.length > 0
            ? '<br /><span class="hint">Grouped header labels: ' + escapeHtml(file.documentExtractionSummary.groupedHeaderLabels.join(' | ')) + '</span>'
            : '',
          file.documentExtractionSummary
            && Array.isArray(file.documentExtractionSummary.groupedHeaderValues)
            && file.documentExtractionSummary.groupedHeaderValues.length > 0
            ? '<br /><span class="hint">Grouped header values: ' + escapeHtml(file.documentExtractionSummary.groupedHeaderValues.join(' | ')) + '</span>'
            : '',
          file.documentExtractionSummary
            && Array.isArray(file.documentExtractionSummary.groupedTotalsLabels)
            && file.documentExtractionSummary.groupedTotalsLabels.length > 0
            ? '<br /><span class="hint">Grouped totals labels: ' + escapeHtml(file.documentExtractionSummary.groupedTotalsLabels.join(' | ')) + '</span>'
            : '',
          file.documentExtractionSummary
            && Array.isArray(file.documentExtractionSummary.groupedTotalsValues)
            && file.documentExtractionSummary.groupedTotalsValues.length > 0
            ? '<br /><span class="hint">Grouped totals values: ' + escapeHtml(file.documentExtractionSummary.groupedTotalsValues.join(' | ')) + '</span>'
            : '',
          file.documentExtractionSummary && file.documentExtractionSummary.dueDate
            ? '<br /><span class="hint">Document dueDate: ' + escapeHtml(String(file.documentExtractionSummary.dueDate)) + '</span>'
            : '',
          file.documentExtractionSummary && file.documentExtractionSummary.taxableDate
            ? '<br /><span class="hint">Document taxableDate: ' + escapeHtml(String(file.documentExtractionSummary.taxableDate)) + '</span>'
            : '',
          file.documentExtractionSummary
            && typeof file.documentExtractionSummary.totalAmountMinor === 'number'
            && file.documentExtractionSummary.totalCurrency
            ? '<br /><span class="hint">Final totalAmount: '
              + escapeHtml(buildAmountDisplay(file.documentExtractionSummary.totalAmountMinor, file.documentExtractionSummary.totalCurrency))
              + '</span>'
            : '',
          file.documentExtractionSummary
            && typeof file.documentExtractionSummary.totalAmountMinor === 'number'
            ? '<br /><span class="hint">Final totalAmountMinor: ' + escapeHtml(String(file.documentExtractionSummary.totalAmountMinor)) + '</span>'
            : '',
          file.documentExtractionSummary && file.documentExtractionSummary.totalCurrency
            ? '<br /><span class="hint">Final totalCurrency: ' + escapeHtml(String(file.documentExtractionSummary.totalCurrency)) + '</span>'
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
          buildDocumentOcrDebugMarkup(file),
          buildDocumentExtractionStagesMarkup(file),
          buildAirbnbHeaderDiagnosticsMarkup(file),
          buildComgateHeaderDiagnosticsMarkup(file),
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
          Array.isArray(file.presentFields) ? '<br /><span class="hint">Present fields: ' + escapeHtml(file.presentFields.length > 0 ? file.presentFields.join(', ') : 'žádné') + '</span>' : '',
          file.noExtractReason ? '<br /><span class="hint">No extract reason: ' + escapeHtml(file.noExtractReason) + '</span>' : '',
          file.parsedSupplierOrCounterparty ? '<br /><span class="hint">Parsed supplier: ' + escapeHtml(file.parsedSupplierOrCounterparty) + '</span>' : '',
          file.parsedReferenceNumber ? '<br /><span class="hint">Parsed referenceNumber: ' + escapeHtml(file.parsedReferenceNumber) + '</span>' : '',
          file.parsedSettlementDirection ? '<br /><span class="hint">Parsed settlementDirection: ' + escapeHtml(file.parsedSettlementDirection) + '</span>' : '',
          typeof file.parsedAmountMinor === 'number' && file.parsedAmountCurrency
            ? '<br /><span class="hint">Parsed amount: ' + escapeHtml(buildAmountDisplay(file.parsedAmountMinor, file.parsedAmountCurrency)) + '</span>'
            : '',
          file.parsedDateCandidate ? '<br /><span class="hint">Parsed date candidate: ' + escapeHtml(file.parsedDateCandidate) + '</span>' : '',
          file.parsedTargetBankAccountHint ? '<br /><span class="hint">Parsed targetBankAccountHint: ' + escapeHtml(file.parsedTargetBankAccountHint) + '</span>' : '',
          buildComgatePipelineDiagnosticsMarkup(file),
          '<br /><span class="hint">Routování: ' + escapeHtml(buildFileRouteSourceLabel(file.sourceSystem, file.documentType)) + ' · ' + escapeHtml(String(file.role || 'primary')) + '</span>',
          '<br /><span class="hint">Finální bucket: ' + escapeHtml(buildDebugOutcomeBucketLabel(file)) + ' · ' + escapeHtml(buildFileRouteOutcomeLabel(file)) + '</span>',
          '</li>'
        ].join('')).join('') + '</ul>';
      }

      function buildComgatePipelineDiagnosticsMarkup(file) {
        const diagnostics = file && file.comgatePipelineDiagnostics;

        if (!diagnostics) {
          return '';
        }

        const variantLabel = Array.isArray(diagnostics.parserVariants) && diagnostics.parserVariants.length > 0
          ? diagnostics.parserVariants.join(', ')
          : 'unknown';
        const extractedKinds = Array.isArray(diagnostics.extractedPaymentPurposeBreakdown) && diagnostics.extractedPaymentPurposeBreakdown.length > 0
          ? diagnostics.extractedPaymentPurposeBreakdown.map((item) => String(item.kind) + ' (' + String(item.count) + ')').join(', ')
          : 'žádné';
        const normalizedKinds = Array.isArray(diagnostics.normalizedKindBreakdown) && diagnostics.normalizedKindBreakdown.length > 0
          ? diagnostics.normalizedKindBreakdown.map((item) => String(item.kind) + ' (' + String(item.count) + ')').join(', ')
          : 'žádné';
        const batchSummaries = Array.isArray(diagnostics.payoutBatchSummaries) && diagnostics.payoutBatchSummaries.length > 0
          ? diagnostics.payoutBatchSummaries.map((item) => [
            escapeHtml(String(item.payoutReference || item.payoutBatchKey || 'n/a')),
            escapeHtml(buildAmountDisplay(Number(item.expectedBankAmountMinor || 0), String(item.currency || 'CZK'))),
            'before=' + escapeHtml(String(item.bankCandidateCountBeforeFiltering || 0)),
            'amount=' + escapeHtml(String(item.bankCandidateCountAfterAmountCurrency || 0)),
            'date=' + escapeHtml(String(item.bankCandidateCountAfterDateWindow || 0)),
            'evidence=' + escapeHtml(String(item.bankCandidateCountAfterEvidenceFiltering || 0)),
            item.matched ? 'matched' : escapeHtml(String(item.noMatchReason || 'unmatched'))
          ].join(' · ')).join(' | ')
          : 'žádné';
        const currentPortalBatchTotalsPreview = Array.isArray(diagnostics.currentPortalBatchTotalsPreview) && diagnostics.currentPortalBatchTotalsPreview.length > 0
          ? diagnostics.currentPortalBatchTotalsPreview.map((item) => [
            escapeHtml(String(item.payoutBatchKey || 'n/a')),
            'gross=' + escapeHtml(buildAmountDisplay(Number(item.grossTotalMinor || 0), String(item.currency || 'CZK'))),
            'fee=' + escapeHtml(buildAmountDisplay(Number(item.feeTotalMinor || 0), String(item.currency || 'CZK'))),
            'net=' + escapeHtml(buildAmountDisplay(Number(item.netSettlementTotalMinor || 0), String(item.currency || 'CZK')))
          ].join(' · ')).join(' | ')
          : 'žádné';

        return [
          '<br /><span class="hint">Comgate parser variants: ' + escapeHtml(variantLabel) + '</span>',
          '<br /><span class="hint">Comgate extracted records: ' + escapeHtml(String(diagnostics.extractedRecordCount || 0)) + '</span>',
          '<br /><span class="hint">Comgate extracted kinds: ' + escapeHtml(extractedKinds) + '</span>',
          '<br /><span class="hint">Comgate normalized transactions: ' + escapeHtml(String(diagnostics.normalizedTransactionCount || 0)) + '</span>',
          '<br /><span class="hint">Comgate normalized kinds: ' + escapeHtml(normalizedKinds) + '</span>',
          typeof diagnostics.currentPortalRawRowCount === 'number' ? '<br /><span class="hint">Comgate current-portal raw rows: ' + escapeHtml(String(diagnostics.currentPortalRawRowCount)) + '</span>' : '',
          typeof diagnostics.currentPortalPayoutBatchCount === 'number' ? '<br /><span class="hint">Comgate current-portal payout batches: ' + escapeHtml(String(diagnostics.currentPortalPayoutBatchCount)) + '</span>' : '',
          Array.isArray(diagnostics.currentPortalBatchTotalsPreview) ? '<br /><span class="hint">Comgate current-portal batch totals: ' + currentPortalBatchTotalsPreview + '</span>' : '',
          '<br /><span class="hint">Comgate matching input rows: ' + escapeHtml(String(diagnostics.matchingInputPayoutRowCount || 0)) + '</span>',
          '<br /><span class="hint">Comgate payout batches: ' + escapeHtml(String(diagnostics.payoutBatchCount || 0)) + ' · decisions ' + escapeHtml(String(diagnostics.matchingDecisionCount || 0)) + '</span>',
          '<br /><span class="hint">Comgate loss boundary: ' + escapeHtml(String(diagnostics.lossBoundary || 'no-loss')) + ' / ' + escapeHtml(String(diagnostics.lossStage || 'not-applicable')) + '</span>',
          '<br /><span class="hint">Comgate matching candidates: ' + batchSummaries + '</span>'
        ].join('');
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

      function syncRuntimeWorkspaceMergeDebugVisibility() {
        runtimeWorkspaceMergeDebugSection.hidden = !runtimeOperatorDebugMode;
      }

      function buildRuntimeWorkspaceMergeDebugMarkup(debugState) {
        const state = buildWorkspaceRenderDebugState(debugState);
        const incomingFileListNamesMarkup = state.incomingBrowserFileListNames.length === 0
          ? 'žádné'
          : state.incomingBrowserFileListNames.map((item) => escapeHtml(item)).join(', ');
        const previousPendingFileNamesMarkup = state.previousPendingSelectedFileNames.length === 0
          ? 'žádné'
          : state.previousPendingSelectedFileNames.map((item) => escapeHtml(item)).join(', ');
        const nextPendingFileNamesMarkup = state.nextPendingSelectedFileNames.length === 0
          ? 'žádné'
          : state.nextPendingSelectedFileNames.map((item) => escapeHtml(item)).join(', ');
        const visiblePendingFileNamesMarkup = state.visiblePendingFileNamesBeforeRun.length === 0
          ? 'žádné'
          : state.visiblePendingFileNamesBeforeRun.map((item) => escapeHtml(item)).join(', ');
        const selectedFileNamesHandedIntoRunMarkup = state.selectedFileNamesHandedIntoRunAction.length === 0
          ? 'žádné'
          : state.selectedFileNamesHandedIntoRunAction.map((item) => escapeHtml(item)).join(', ');
        const mergedFileSampleMarkup = state.mergedFileSample.length === 0
          ? 'žádné'
          : state.mergedFileSample.map((item) => escapeHtml(item)).join(', ');
        const carryoverLoadedPayoutBatchIdsSampleMarkup = state.carryoverLoadedPayoutBatchIdsSample.length === 0
          ? 'žádné'
          : state.carryoverLoadedPayoutBatchIdsSample.map((item) => escapeHtml(item)).join(', ');
        const selectedFileNamesMarkup = state.selectedFileNames.length === 0
          ? 'žádné'
          : state.selectedFileNames.map((item) => escapeHtml(item)).join(', ');
        const persistedFileNamesMarkup = state.persistedWorkspaceFileNamesBeforeRerun.length === 0
          ? 'žádné'
          : state.persistedWorkspaceFileNamesBeforeRerun.map((item) => escapeHtml(item)).join(', ');
        const mergedFileNamesMarkup = state.mergedFileNamesUsedForRerun.length === 0
          ? 'žádné'
          : state.mergedFileNamesUsedForRerun.map((item) => escapeHtml(item)).join(', ');
        const visibleTraceFileNamesMarkup = state.visibleTraceFileNamesAfterRender.length === 0
          ? 'žádné'
          : state.visibleTraceFileNamesAfterRender.map((item) => escapeHtml(item)).join(', ');
        const checkpointLogMarkup = state.checkpointLog.length === 0
          ? '<li><strong>Žádné checkpointy.</strong></li>'
          : state.checkpointLog.map((checkpoint) => {
            const checkpointSelectedNames = checkpoint.selectedFileNames.length === 0
              ? 'žádné'
              : checkpoint.selectedFileNames.map((item) => escapeHtml(item)).join(', ');
            const checkpointPersistedNames = checkpoint.persistedWorkspaceFileNamesBeforeRerun.length === 0
              ? 'žádné'
              : checkpoint.persistedWorkspaceFileNamesBeforeRerun.map((item) => escapeHtml(item)).join(', ');
            const checkpointMergedNames = checkpoint.mergedFileNamesUsedForRerun.length === 0
              ? 'žádné'
              : checkpoint.mergedFileNamesUsedForRerun.map((item) => escapeHtml(item)).join(', ');
            const checkpointVisibleNames = checkpoint.visibleTraceFileNamesAfterRender.length === 0
              ? 'žádné'
              : checkpoint.visibleTraceFileNamesAfterRender.map((item) => escapeHtml(item)).join(', ');

            return [
              '<li>',
              '<strong>Checkpoint:</strong> ' + escapeHtml(checkpoint.phase),
              ' · <strong>request token:</strong> ' + escapeHtml(String(checkpoint.requestToken)),
              ' · <strong>restore token:</strong> ' + escapeHtml(String(checkpoint.restoreToken || 0)),
              ' · <strong>restore source:</strong> ' + escapeHtml(checkpoint.restoreSource || 'not-applicable'),
              '<br /><strong>Month key:</strong> ' + escapeHtml(checkpoint.currentMonthKey || 'neuvedeno'),
              '<br /><strong>Previous month key resolved for carryover:</strong> ' + escapeHtml(checkpoint.carryoverPreviousMonthKeyResolved || 'žádný'),
              '<br /><strong>Previous month workspace found:</strong> ' + escapeHtml(checkpoint.carryoverPreviousMonthWorkspaceFound || 'ne'),
              '<br /><strong>Previous month matched Comgate payout batch count:</strong> ' + escapeHtml(String(checkpoint.carryoverPreviousMonthMatchedPayoutBatchCount || 0)),
              '<br /><strong>Previous month unmatched Comgate payout batch count:</strong> ' + escapeHtml(String(checkpoint.carryoverPreviousMonthUnmatchedPayoutBatchCount || 0)),
              '<br /><strong>Previous month unmatched Comgate payout batch IDs sample:</strong> ' + (checkpoint.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.length === 0 ? 'žádné' : checkpoint.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.map((item) => escapeHtml(item)).join(', ')),
              '<br /><strong>Previous month unmatched-only carryover filter:</strong> ' + escapeHtml(checkpoint.carryoverPreviousMonthUnmatchedOnly || 'no'),
              '<br /><strong>Storage backend:</strong> ' + escapeHtml(checkpoint.workspacePersistenceBackend || 'none'),
              '<br /><strong>Storage key:</strong> ' + escapeHtml(checkpoint.storageKeyUsed || monthlyWorkspaceStorageKey),
              '<br /><strong>Selection event token:</strong> ' + escapeHtml(String(checkpoint.fileSelectionEventToken || 0)),
              '<br /><strong>Explicit clear/reset marker:</strong> ' + escapeHtml(checkpoint.explicitClearResetMarker || 'none'),
              '<br /><strong>Invariant warning:</strong> ' + escapeHtml(checkpoint.invariantWarning || 'none'),
              '<br /><strong>Invariant guard applied:</strong> ' + escapeHtml(checkpoint.invariantGuardApplied || 'no'),
              '<br /><strong>Incoming FileList:</strong> ' + (checkpoint.incomingBrowserFileListNames.length === 0 ? 'žádné' : checkpoint.incomingBrowserFileListNames.map((item) => escapeHtml(item)).join(', ')) + ' (' + escapeHtml(String(checkpoint.incomingBrowserFileListCount || 0)) + ')',
              '<br /><strong>Previous pending:</strong> ' + (checkpoint.previousPendingSelectedFileNames.length === 0 ? 'žádné' : checkpoint.previousPendingSelectedFileNames.map((item) => escapeHtml(item)).join(', ')) + ' (' + escapeHtml(String(checkpoint.previousPendingSelectedFileCount || 0)) + ')',
              '<br /><strong>Next pending:</strong> ' + (checkpoint.nextPendingSelectedFileNames.length === 0 ? 'žádné' : checkpoint.nextPendingSelectedFileNames.map((item) => escapeHtml(item)).join(', ')) + ' (' + escapeHtml(String(checkpoint.nextPendingSelectedFileCount || 0)) + ')',
              '<br /><strong>Append vs replace:</strong> ' + escapeHtml(checkpoint.appendVsReplaceDecision || 'not-applicable'),
              '<br /><strong>Dedupe key:</strong> ' + escapeHtml(checkpoint.dedupeKeyUsed || 'not-applicable'),
              '<br /><strong>Visible pending before run:</strong> ' + (checkpoint.visiblePendingFileNamesBeforeRun.length === 0 ? 'žádné' : checkpoint.visiblePendingFileNamesBeforeRun.map((item) => escapeHtml(item)).join(', ')) + ' (' + escapeHtml(String(checkpoint.visiblePendingFileCountBeforeRun || 0)) + ')',
              '<br /><strong>Selected files handed into run:</strong> ' + (checkpoint.selectedFileNamesHandedIntoRunAction.length === 0 ? 'žádné' : checkpoint.selectedFileNamesHandedIntoRunAction.map((item) => escapeHtml(item)).join(', ')) + ' (' + escapeHtml(String(checkpoint.selectedFileCountHandedIntoRunAction || 0)) + ')',
              '<br /><strong>Selected files:</strong> ' + checkpointSelectedNames + ' (' + escapeHtml(String(checkpoint.selectedBatchFileCount)) + ')',
              '<br /><strong>Persisted files before rerun:</strong> ' + checkpointPersistedNames + ' (' + escapeHtml(String(checkpoint.persistedWorkspaceFileCountBeforeRerun)) + ')',
              '<br /><strong>Merged files used for rerun:</strong> ' + checkpointMergedNames + ' (' + escapeHtml(String(checkpoint.mergedFileCountUsedForRerun)) + ')',
              '<br /><strong>Visible trace after render:</strong> ' + checkpointVisibleNames + ' (' + escapeHtml(String(checkpoint.visibleTraceFileCount)) + ')',
              '<br /><strong>Carryover loaded into current month runtime:</strong> ' + escapeHtml(String(checkpoint.carryoverLoadedPayoutBatchCount || 0)),
              '<br /><strong>Carryover IDs loaded into runtime:</strong> ' + (checkpoint.carryoverLoadedPayoutBatchIdsSample.length === 0 ? 'žádné' : checkpoint.carryoverLoadedPayoutBatchIdsSample.map((item) => escapeHtml(item)).join(', ')),
              '<br /><strong>Carryover handed into matching input:</strong> ' + escapeHtml(String(checkpoint.carryoverMatchingInputPayoutBatchCount || 0)),
              '<br /><strong>Carryover IDs handed into matching:</strong> ' + (checkpoint.carryoverMatchingInputPayoutBatchIdsSample.length === 0 ? 'žádné' : checkpoint.carryoverMatchingInputPayoutBatchIdsSample.map((item) => escapeHtml(item)).join(', ')),
              '<br /><strong>Carryover candidate existed in matcher:</strong> ' + escapeHtml(checkpoint.carryoverMatcherCandidateExisted || 'ne'),
              '<br /><strong>Carryover rejected reason:</strong> ' + escapeHtml(checkpoint.carryoverMatcherRejectedReason || 'žádný'),
              '<br /><strong>Carryover missing clear marker:</strong> ' + escapeHtml(checkpoint.carryoverSourceClearMarker || 'žádný'),
              '<br /><strong>Save-before-rerun:</strong> ' + escapeHtml(checkpoint.saveCompletedBeforeRerunInputAssembly || 'not-applicable'),
              '<br /><strong>Render source marker:</strong> ' + escapeHtml(buildWorkspaceRenderSourceMarker(checkpoint.renderSource)),
              '</li>'
            ].join('');
          }).join('');

        return [
          '<p class="hint">Tento blok ukazuje, z jakého zdroje právě stránka bere viditelný trace souborů pro měsíc.</p>',
          '<ul class="diagnostic-list">',
          '<li><strong>Request/run token:</strong> ' + escapeHtml(String(state.requestToken || 0)) + '</li>',
          '<li><strong>Restore token:</strong> ' + escapeHtml(String(state.restoreToken || 0)) + '</li>',
          '<li><strong>Restore source:</strong> ' + escapeHtml(state.restoreSource || 'not-applicable') + '</li>',
          '<li><strong>File input change event token:</strong> ' + escapeHtml(String(state.fileSelectionEventToken || 0)) + '</li>',
          '<li><strong>Explicit clear/reset marker:</strong> ' + escapeHtml(state.explicitClearResetMarker || 'none') + '</li>',
          '<li><strong>Invariant warning:</strong> ' + escapeHtml(state.invariantWarning || 'none') + '</li>',
          '<li><strong>Invariant guard applied:</strong> ' + escapeHtml(state.invariantGuardApplied || 'no') + '</li>',
          '<li><strong>Incoming browser FileList names:</strong> ' + incomingFileListNamesMarkup + '</li>',
          '<li><strong>Incoming browser FileList count:</strong> ' + escapeHtml(String(state.incomingBrowserFileListCount || 0)) + '</li>',
          '<li><strong>Previous pending selected file names:</strong> ' + previousPendingFileNamesMarkup + '</li>',
          '<li><strong>Previous pending selected count:</strong> ' + escapeHtml(String(state.previousPendingSelectedFileCount || 0)) + '</li>',
          '<li><strong>Next pending selected file names after reducer/handler:</strong> ' + nextPendingFileNamesMarkup + '</li>',
          '<li><strong>Next pending selected count:</strong> ' + escapeHtml(String(state.nextPendingSelectedFileCount || 0)) + '</li>',
          '<li><strong>Append vs replace decision:</strong> ' + escapeHtml(state.appendVsReplaceDecision || 'not-applicable') + '</li>',
          '<li><strong>Dedupe key used:</strong> ' + escapeHtml(state.dedupeKeyUsed || 'not-applicable') + '</li>',
          '<li><strong>Visible pending file names before run:</strong> ' + visiblePendingFileNamesMarkup + '</li>',
          '<li><strong>Visible pending count before run:</strong> ' + escapeHtml(String(state.visiblePendingFileCountBeforeRun || 0)) + '</li>',
          '<li><strong>Selected file names handed into run action:</strong> ' + selectedFileNamesHandedIntoRunMarkup + '</li>',
          '<li><strong>Selected file count handed into run action:</strong> ' + escapeHtml(String(state.selectedFileCountHandedIntoRunAction || 0)) + '</li>',
          '<li><strong>Current month key:</strong> ' + escapeHtml(state.currentMonthKey || 'neuvedeno') + '</li>',
          '<li><strong>Previous month key resolved for carryover:</strong> ' + escapeHtml(state.carryoverPreviousMonthKeyResolved || 'žádný') + '</li>',
          '<li><strong>Previous month workspace found:</strong> ' + escapeHtml(state.carryoverPreviousMonthWorkspaceFound || 'ne') + '</li>',
          '<li><strong>Previous month matched Comgate payout batch count:</strong> ' + escapeHtml(String(state.carryoverPreviousMonthMatchedPayoutBatchCount || 0)) + '</li>',
          '<li><strong>Previous month unmatched Comgate payout batch count:</strong> ' + escapeHtml(String(state.carryoverPreviousMonthUnmatchedPayoutBatchCount || 0)) + '</li>',
          '<li><strong>Previous month unmatched Comgate payout batch IDs sample:</strong> ' + (state.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.length === 0 ? 'žádné' : state.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample.map((item) => escapeHtml(item)).join(', ')) + '</li>',
          '<li><strong>Previous month unmatched-only carryover filter:</strong> ' + escapeHtml(state.carryoverPreviousMonthUnmatchedOnly || 'no') + '</li>',
          '<li><strong>Selected file names:</strong> ' + selectedFileNamesMarkup + '</li>',
          '<li><strong>Persisted workspace file count before rerun:</strong> ' + escapeHtml(String(state.persistedWorkspaceFileCountBeforeRerun)) + '</li>',
          '<li><strong>Persisted workspace file names before rerun:</strong> ' + persistedFileNamesMarkup + '</li>',
          '<li><strong>Newly selected batch file count:</strong> ' + escapeHtml(String(state.selectedBatchFileCount)) + '</li>',
          '<li><strong>Merged file count used for rerun:</strong> ' + escapeHtml(String(state.mergedFileCountUsedForRerun)) + '</li>',
          '<li><strong>Merged file names used for rerun:</strong> ' + mergedFileNamesMarkup + '</li>',
          '<li><strong>Visible trace file count:</strong> ' + escapeHtml(String(state.visibleTraceFileCount)) + '</li>',
          '<li><strong>Visible trace file names after render:</strong> ' + visibleTraceFileNamesMarkup + '</li>',
          '<li><strong>Render source:</strong> ' + escapeHtml(state.renderSource || 'selectedFiles') + '</li>',
          '<li><strong>Render source marker:</strong> ' + escapeHtml(buildWorkspaceRenderSourceMarker(state.renderSource || 'selectedFiles')) + '</li>',
          '<li><strong>Workspace storage backend:</strong> ' + escapeHtml(state.workspacePersistenceBackend || 'none') + '</li>',
          '<li><strong>Storage key used for month workspace load/save:</strong> ' + escapeHtml(state.storageKeyUsed || monthlyWorkspaceStorageKey) + '</li>',
          '<li><strong>Save happened before rerun input assembly:</strong> ' + escapeHtml(state.saveCompletedBeforeRerunInputAssembly || 'not-applicable') + '</li>',
          '<li><strong>Last save status:</strong> ' + escapeHtml(state.lastSaveStatus || 'not-applicable') + '</li>',
          '<li><strong>Carryover source month:</strong> ' + escapeHtml(state.carryoverSourceMonth || 'žádný') + '</li>',
          '<li><strong>Carryover current month:</strong> ' + escapeHtml(state.carryoverCurrentMonth || 'žádný') + '</li>',
          '<li><strong>Loaded carryover payout batch count:</strong> ' + escapeHtml(String(state.carryoverLoadedPayoutBatchCount || 0)) + '</li>',
          '<li><strong>Carryover batch IDs sample:</strong> ' + carryoverLoadedPayoutBatchIdsSampleMarkup + '</li>',
          '<li><strong>Carryover batch count handed into matching input:</strong> ' + escapeHtml(String(state.carryoverMatchingInputPayoutBatchCount || 0)) + '</li>',
          '<li><strong>Carryover batch IDs sample handed into matching:</strong> ' + (state.carryoverMatchingInputPayoutBatchIdsSample.length === 0 ? 'žádné' : state.carryoverMatchingInputPayoutBatchIdsSample.map((item) => escapeHtml(item)).join(', ')) + '</li>',
          '<li><strong>Carryover candidate existed in matcher:</strong> ' + escapeHtml(state.carryoverMatcherCandidateExisted || 'ne') + '</li>',
          '<li><strong>Carryover rejected reason:</strong> ' + escapeHtml(state.carryoverMatcherRejectedReason || 'žádný') + '</li>',
          '<li><strong>Carryover missing clear marker:</strong> ' + escapeHtml(state.carryoverSourceClearMarker || 'žádný') + '</li>',
          '<li><strong>Carryover matched count:</strong> ' + escapeHtml(String(state.carryoverMatchedCount || 0)) + '</li>',
          '<li><strong>Carryover unmatched count:</strong> ' + escapeHtml(String(state.carryoverUnmatchedCount || 0)) + '</li>',
          '<li><strong>Merged file sample:</strong> ' + mergedFileSampleMarkup + '</li>',
          '<li><strong>Checkpoint log:</strong><ol>' + checkpointLogMarkup + '</ol></li>',
          '</ul>'
        ].join('');
      }

      function syncRuntimeWorkspaceMergeDebugPhase(phase) {
        runtimeWorkspaceMergeDebugSection.setAttribute('data-runtime-phase', phase);
        syncRuntimeWorkspaceMergeDebugVisibility();
      }

      function renderCompletedRuntimeWorkspaceMergeDebug(debugState) {
        runtimeWorkspaceMergeDebugContent.innerHTML = buildRuntimeWorkspaceMergeDebugMarkup(debugState);
      }

      function renderRunningRuntimeWorkspaceMergeDebug(debugState) {
        runtimeWorkspaceMergeDebugContent.innerHTML = buildRuntimeWorkspaceMergeDebugMarkup(debugState);
      }

      function renderFailedRuntimeWorkspaceMergeDebug(debugState) {
        runtimeWorkspaceMergeDebugContent.innerHTML = buildRuntimeWorkspaceMergeDebugMarkup(debugState) + '<p class="hint">Poslední běh selhal, proto zůstává vidět poslední známý merge snapshot.</p>';
      }

      function renderInitialRuntimeWorkspaceMergeDebug() {
        runtimeWorkspaceMergeDebugContent.innerHTML = '<p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek.</p><p class="hint">Po spuštění zde uvidíte month key, persisted count, selected count, merged count, visible trace count a render source.</p>';
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
                + ' · candidate existed ' + escapeHtml(decision.sameMonthExactAmountCandidateExists ? 'ano' : 'ne')
                + ' · rejected only by date gate ' + escapeHtml(decision.rejectedOnlyByDateGate ? 'ano' : 'ne')
                + ' · applied Comgate same-month lag rule ' + escapeHtml(decision.appliedComgateSameMonthLagRule ? 'ano' : 'ne')
                + ' · would reject on strict date gate ' + escapeHtml(decision.wouldRejectOnStrictDateGate ? 'ano' : 'ne')
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
          '<li><strong>Git short SHA:</strong> <code>' + escapeHtml(String(buildInfo.gitCommitShortSha || 'unknown')) + '</code></li>',
          '<li><strong>Build timestamp:</strong> <code>' + escapeHtml(String(buildInfo.buildTimestamp || generatedAt)) + '</code></li>',
          '<li><strong>Build branch:</strong> <code>' + escapeHtml(String(buildInfo.buildBranch || 'unknown')) + '</code></li>',
          '<li><strong>Build source:</strong> <code>' + escapeHtml(String(buildInfo.buildSource || 'runtime')) + '</code></li>',
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

      function buildUnmatchedReservationDetailsMarkup(state, pageKey, bucketKey) {
        const items = (state.reviewSections && state.reviewSections.unmatchedReservationSettlements) || [];

        if (items.length === 0) {
          return '<p class="hint">Žádné položky v této sekci.</p>';
        }

        return '<ul>' + items.map((item) =>
          '<li>'
          + '<strong>' + escapeHtml(item.title) + '</strong>'
          + buildManualMatchSelectionControlMarkup(pageKey || 'control', bucketKey || 'unmatchedReservationSettlements', item)
          + buildReviewAuditMarkup(item) + '<br /><span class="hint">' + escapeHtml(item.detail) + '</span></li>'
        ).join('') + '</ul>';
      }

      function buildReviewAuditMarkup(item) {
        const evidence = Array.isArray(item && item.evidenceSummary) && item.evidenceSummary.length > 0
          ? item.evidenceSummary.map((entry) => String(entry.label || '') + ': ' + String(entry.value || '')).join(' · ')
          : '';

        return [
          item && item.matchStrength
            ? '<br /><span class="hint"><strong>Stav:</strong> ' + escapeHtml(String(item.matchStrength)) + '</span>'
            : '',
          item && item.operatorExplanation
            ? '<br /><span class="hint"><strong>Vyhodnocení:</strong> ' + escapeHtml(String(item.operatorExplanation)) + '</span>'
            : '',
          evidence
            ? '<br /><span class="hint"><strong>Důkazy:</strong> ' + escapeHtml(evidence) + '</span>'
            : '',
          item && item.documentBankRelation
            ? '<br /><span class="hint"><strong>Doklad ↔ banka:</strong> ' + escapeHtml(String(item.documentBankRelation)) + '</span>'
            : '',
          item && item.operatorCheckHint
            ? '<br /><span class="hint"><strong>Ruční kontrola:</strong> ' + escapeHtml(String(item.operatorCheckHint)) + '</span>'
          : ''
        ].join('');
      }

      function isSelectableManualMatchBucket(bucketKey) {
        return bucketKey === 'payoutBatchUnmatched'
          || bucketKey === 'unmatchedReservationSettlements'
          || bucketKey === 'expenseUnmatchedDocuments'
          || bucketKey === 'expenseUnmatchedOutflows'
          || bucketKey === 'expenseUnmatchedInflows';
      }

      function buildManualMatchSelectionElementId(pageKey, bucketKey, reviewItemId) {
        return 'manual-match-select-' + String(pageKey || 'page') + '-' + String(bucketKey || 'bucket') + '-' + encodeURIComponent(String(reviewItemId || '')).replace(/%/g, '_');
      }

      function buildManualMatchActionElementId(pageKey, action, groupOrItemId) {
        return 'manual-match-' + String(pageKey || 'page') + '-' + String(action || 'action') + '-' + encodeURIComponent(String(groupOrItemId || 'global')).replace(/%/g, '_');
      }

      function buildManualMatchSelectionControlMarkup(pageKey, bucketKey, item) {
        const reviewItemId = String(item && item.id || '');

        if (!isSelectableManualMatchBucket(bucketKey) || !reviewItemId) {
          return '';
        }

        return '<label class="manual-match-selection">'
          + '<input id="' + escapeHtml(buildManualMatchSelectionElementId(pageKey, bucketKey, reviewItemId)) + '" type="checkbox"'
          + (currentSelectedManualMatchItemIds.includes(reviewItemId) ? ' checked' : '')
          + ' />'
          + '<span>Vybrat pro ruční spárování</span>'
          + '</label>';
      }

      function parseManualMatchAmountEntry(value) {
        const match = String(value || '').match(/(-?[\d\s.]+,\d{2})\s*(Kč|CZK|EUR|€)/i);

        if (!match) {
          return undefined;
        }

        const amountText = String(match[1] || '').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
        const parsed = Number(amountText);

        if (!Number.isFinite(parsed)) {
          return undefined;
        }

        return {
          amountMinor: Math.round(parsed * 100),
          currency: /EUR|€/i.test(String(match[2] || '')) ? 'EUR' : 'CZK'
        };
      }

      function getManualMatchItemAmount(item) {
        const evidence = Array.isArray(item && item.evidenceSummary) ? item.evidenceSummary : [];
        const amountEvidence = evidence.find((entry) => entry && entry.label === 'částka' && entry.value);

        if (amountEvidence) {
          return parseManualMatchAmountEntry(amountEvidence.value);
        }

        const comparison = item && item.expenseComparison ? item.expenseComparison : {};
        const comparisonAmount = comparison.document && comparison.document.amount
          ? parseManualMatchAmountEntry(comparison.document.amount)
          : comparison.bank && comparison.bank.amount
            ? parseManualMatchAmountEntry(comparison.bank.amount)
            : undefined;

        if (comparisonAmount) {
          return comparisonAmount;
        }

        return parseManualMatchAmountEntry((item && item.detail) || '') || parseManualMatchAmountEntry((item && item.title) || '');
      }

      function buildManualMatchSelectionSummary(items) {
        const normalizedItems = Array.isArray(items) ? items : [];
        const parsedAmounts = normalizedItems.map((item) => getManualMatchItemAmount(item)).filter(Boolean);

        if (normalizedItems.length === 0) {
          return {
            selectedCount: 0,
            totalLabel: '',
            totalComputable: false
          };
        }

        if (parsedAmounts.length !== normalizedItems.length) {
          return {
            selectedCount: normalizedItems.length,
            totalLabel: '',
            totalComputable: false
          };
        }

        const currencies = Array.from(new Set(parsedAmounts.map((entry) => entry.currency)));

        if (currencies.length !== 1) {
          return {
            selectedCount: normalizedItems.length,
            totalLabel: '',
            totalComputable: false
          };
        }

        return {
          selectedCount: normalizedItems.length,
          totalLabel: formatAmountMinorCs(parsedAmounts.reduce((sum, entry) => sum + entry.amountMinor, 0), currencies[0]),
          totalComputable: true
        };
      }

      function buildManualMatchItemLookup(sections) {
        const lookup = new Map();
        const normalizedSections = sections || {};

        [
          'payoutBatchUnmatched',
          'unmatchedReservationSettlements',
          'expenseUnmatchedDocuments',
          'expenseUnmatchedOutflows',
          'expenseUnmatchedInflows'
        ].forEach((bucketKey) => {
          const items = Array.isArray(normalizedSections[bucketKey]) ? normalizedSections[bucketKey] : [];

          items.forEach((item) => {
            if (item && item.id) {
              lookup.set(String(item.id), item);
            }
          });
        });

        return lookup;
      }

      function buildEffectiveManualMatchProjection(sections, groups, monthKey) {
        const normalizedSections = {
          ...((sections && typeof sections === 'object') ? sections : {}),
          payoutBatchUnmatched: Array.isArray(sections && sections.payoutBatchUnmatched) ? sections.payoutBatchUnmatched.slice() : [],
          unmatchedReservationSettlements: Array.isArray(sections && sections.unmatchedReservationSettlements) ? sections.unmatchedReservationSettlements.slice() : [],
          expenseUnmatchedDocuments: Array.isArray(sections && sections.expenseUnmatchedDocuments) ? sections.expenseUnmatchedDocuments.slice() : [],
          expenseUnmatchedOutflows: Array.isArray(sections && sections.expenseUnmatchedOutflows) ? sections.expenseUnmatchedOutflows.slice() : [],
          expenseUnmatchedInflows: Array.isArray(sections && sections.expenseUnmatchedInflows) ? sections.expenseUnmatchedInflows.slice() : []
        };
        const itemLookup = buildManualMatchItemLookup(normalizedSections);
        const assignedReviewItemIds = new Set();
        const projectedGroups = sanitizeManualMatchGroupsForStorage(groups)
          .filter((group) => String(group.monthKey || '') === String(monthKey || ''))
          .map((group) => {
            const items = group.selectedReviewItemIds
              .map((itemId) => {
                const normalizedItemId = String(itemId || '');

                if (!normalizedItemId || assignedReviewItemIds.has(normalizedItemId)) {
                  return undefined;
                }

                const item = itemLookup.get(normalizedItemId);

                if (!item) {
                  return undefined;
                }

                assignedReviewItemIds.add(normalizedItemId);
                return item;
              })
              .filter(Boolean);

            return {
              ...group,
              items,
              selectionSummary: buildManualMatchSelectionSummary(items)
            };
          })
          .filter((group) => group.items.length > 0);
        const hiddenReviewItemIds = new Set(projectedGroups.flatMap((group) => group.items.map((item) => String(item.id || ''))));

        return {
          reviewSections: {
            ...normalizedSections,
            payoutBatchUnmatched: normalizedSections.payoutBatchUnmatched.filter((item) => !hiddenReviewItemIds.has(String(item && item.id || ''))),
            unmatchedReservationSettlements: normalizedSections.unmatchedReservationSettlements.filter((item) => !hiddenReviewItemIds.has(String(item && item.id || ''))),
            expenseUnmatchedDocuments: normalizedSections.expenseUnmatchedDocuments.filter((item) => !hiddenReviewItemIds.has(String(item && item.id || ''))),
            expenseUnmatchedOutflows: normalizedSections.expenseUnmatchedOutflows.filter((item) => !hiddenReviewItemIds.has(String(item && item.id || ''))),
            expenseUnmatchedInflows: normalizedSections.expenseUnmatchedInflows.filter((item) => !hiddenReviewItemIds.has(String(item && item.id || '')))
          },
          groups: projectedGroups,
          hiddenReviewItemIds
        };
      }

      function syncManualMatchGroupsForCurrentSections(groups, sections, monthKey) {
        const normalizedGroups = sanitizeManualMatchGroupsForStorage(groups);
        const normalizedMonthKey = String(monthKey || '');

        if (!normalizedMonthKey) {
          return {
            groups: normalizedGroups,
            changed: normalizedGroups.length !== (Array.isArray(groups) ? groups.length : 0)
          };
        }

        const itemLookup = buildManualMatchItemLookup(sections);
        const assignedReviewItemIds = new Set();
        let changed = normalizedGroups.length !== (Array.isArray(groups) ? groups.length : 0);
        const syncedGroups = normalizedGroups.flatMap((group) => {
          const groupMonthKey = String(group && group.monthKey || '');

          if (groupMonthKey !== normalizedMonthKey) {
            return [group];
          }

          const nextSelectedReviewItemIds = [];

          (Array.isArray(group && group.selectedReviewItemIds) ? group.selectedReviewItemIds : []).forEach((itemId) => {
            const normalizedItemId = String(itemId || '');

            if (!normalizedItemId || !itemLookup.has(normalizedItemId) || assignedReviewItemIds.has(normalizedItemId)) {
              changed = true;
              return;
            }

            assignedReviewItemIds.add(normalizedItemId);
            nextSelectedReviewItemIds.push(normalizedItemId);
          });

          if (nextSelectedReviewItemIds.length === 0) {
            changed = true;
            return [];
          }

          if (
            nextSelectedReviewItemIds.length !== group.selectedReviewItemIds.length
            || nextSelectedReviewItemIds.some((itemId, index) => itemId !== group.selectedReviewItemIds[index])
          ) {
            changed = true;

            return [{
              ...group,
              selectedReviewItemIds: nextSelectedReviewItemIds
            }];
          }

          return [group];
        });

        return {
          groups: changed ? syncedGroups : normalizedGroups,
          changed
        };
      }

      function collectSelectedManualMatchItems(sections, options) {
        const itemLookup = buildManualMatchItemLookup(sections);
        const nextSelectedIds = currentSelectedManualMatchItemIds.filter((itemId) => itemLookup.has(String(itemId || '')));
        const allowStateSync = !options || options.allowStateSync !== false;

        if (allowStateSync && nextSelectedIds.length !== currentSelectedManualMatchItemIds.length) {
          currentSelectedManualMatchItemIds = nextSelectedIds;
        }

        if (allowStateSync && currentSelectedManualMatchItemIds.length === 0) {
          currentManualMatchConfirmMode = false;
        }

        return nextSelectedIds.map((itemId) => itemLookup.get(String(itemId || ''))).filter(Boolean);
      }

      function toggleManualMatchSelection(reviewItemId) {
        const normalizedReviewItemId = String(reviewItemId || '');

        if (!normalizedReviewItemId) {
          return;
        }

        if (currentSelectedManualMatchItemIds.includes(normalizedReviewItemId)) {
          currentSelectedManualMatchItemIds = currentSelectedManualMatchItemIds.filter((itemId) => itemId !== normalizedReviewItemId);
        } else {
          currentSelectedManualMatchItemIds = sanitizeManualMatchSelectionIds(currentSelectedManualMatchItemIds.concat([normalizedReviewItemId]));
        }

        if (currentSelectedManualMatchItemIds.length === 0) {
          currentManualMatchConfirmMode = false;
          currentManualMatchDraftNote = '';
        }

        applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
      }

      function clearManualMatchSelection() {
        currentSelectedManualMatchItemIds = [];
        currentManualMatchDraftNote = '';
        currentManualMatchConfirmMode = false;
        applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
      }

      function createManualMatchGroupFromSelection(monthKey, sections) {
        const normalizedMonthKey = String(monthKey || currentWorkspaceMonth || monthInput && monthInput.value || '');
        const selectedItems = collectSelectedManualMatchItems(sections);

        if (!normalizedMonthKey || selectedItems.length === 0) {
          return;
        }

        currentManualMatchGroups.push({
          id: 'manual-match-group:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 8),
          monthKey: normalizedMonthKey,
          selectedReviewItemIds: selectedItems.map((item) => String(item.id || '')),
          createdAt: new Date().toISOString(),
          note: currentManualMatchDraftNote ? String(currentManualMatchDraftNote).trim() : null
        });
        currentManualMatchGroups = sanitizeManualMatchGroupsForStorage(currentManualMatchGroups);
        currentSelectedManualMatchItemIds = [];
        currentManualMatchDraftNote = '';
        currentManualMatchConfirmMode = false;
        applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
      }

      function extendManualMatchGroupFromSelection(groupId, monthKey, sections) {
        const normalizedGroupId = String(groupId || '');
        const normalizedMonthKey = String(monthKey || currentWorkspaceMonth || monthInput && monthInput.value || '');
        const sanitizedGroups = sanitizeManualMatchGroupsForStorage(currentManualMatchGroups);
        const targetGroupIndex = sanitizedGroups.findIndex((group) =>
          String(group && group.id || '') === normalizedGroupId
          && String(group && group.monthKey || '') === normalizedMonthKey
        );

        if (!normalizedGroupId || !normalizedMonthKey || targetGroupIndex < 0) {
          currentSelectedManualMatchItemIds = [];
          currentManualMatchDraftNote = '';
          currentManualMatchConfirmMode = false;
          applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
          return;
        }

        const selectedItems = collectSelectedManualMatchItems(sections);
        const targetGroup = sanitizedGroups[targetGroupIndex];
        const targetReviewItemIds = new Set((targetGroup && targetGroup.selectedReviewItemIds) || []);
        const reviewItemIdsAssignedElsewhere = new Set(
          sanitizedGroups
            .filter((group, index) => index !== targetGroupIndex && String(group && group.monthKey || '') === normalizedMonthKey)
            .flatMap((group) => Array.isArray(group && group.selectedReviewItemIds) ? group.selectedReviewItemIds : [])
            .map((itemId) => String(itemId || ''))
            .filter(Boolean)
        );
        const nextSelectedReviewItemIds = ((targetGroup && targetGroup.selectedReviewItemIds) || []).slice();

        selectedItems.forEach((item) => {
          const reviewItemId = String(item && item.id || '');

          if (!reviewItemId || targetReviewItemIds.has(reviewItemId) || reviewItemIdsAssignedElsewhere.has(reviewItemId)) {
            return;
          }

          targetReviewItemIds.add(reviewItemId);
          nextSelectedReviewItemIds.push(reviewItemId);
        });

        currentSelectedManualMatchItemIds = [];
        currentManualMatchDraftNote = '';
        currentManualMatchConfirmMode = false;

        if (nextSelectedReviewItemIds.length === ((targetGroup && targetGroup.selectedReviewItemIds) || []).length) {
          applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
          return;
        }

        currentManualMatchGroups = sanitizedGroups.map((group, index) =>
          index === targetGroupIndex
            ? {
                ...group,
                selectedReviewItemIds: nextSelectedReviewItemIds,
                updatedAt: new Date().toISOString()
              }
            : group
        );
        currentManualMatchGroups = sanitizeManualMatchGroupsForStorage(currentManualMatchGroups);
        applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
      }

      function removeManualMatchGroup(groupId) {
        const normalizedGroupId = String(groupId || '');

        if (!normalizedGroupId) {
          return;
        }

        currentManualMatchGroups = sanitizeManualMatchGroupsForStorage(currentManualMatchGroups).filter((group) => String(group.id || '') !== normalizedGroupId);
        applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
      }

      function buildExpenseReviewSectionMarkup(items, emptyLabel, bucketKey) {
        if (!items || items.length === 0) {
          return '<p class="hint">' + escapeHtml(emptyLabel) + '</p>';
        }

        return items.map((item) => buildExpenseReviewItemMarkup(item, bucketKey)).join('');
      }

      function buildExpenseReviewItemMarkup(item, bucketKey) {
        const comparison = item && item.expenseComparison ? item.expenseComparison : {};
        const comparisonVariant = comparison && comparison.variant === 'bank-bank' ? 'bank-bank' : 'document-bank';
        const leftLabel = comparison && comparison.leftLabel ? comparison.leftLabel : (comparisonVariant === 'bank-bank' ? 'Odchozí účet' : 'Doklad');
        const rightLabel = comparison && comparison.rightLabel ? comparison.rightLabel : (comparisonVariant === 'bank-bank' ? 'Příchozí účet' : 'Banka');
        const matchStrength = String((item && item.matchStrength) || 'neuvedeno');
        const badgeClass = mapMatchStrengthToBadgeClass(item && item.matchStrength);
        const manualAuditMarkup = item && item.manualDecisionLabel
          ? '<div class="manual-audit">' + escapeHtml(String(item.manualDecisionLabel)) + '</div>'
          : '';
        const reviewItemId = String((item && item.id) || '');
        const sourceReviewItemId = String((item && item.manualSourceReviewItemId) || reviewItemId);
        const actionsMarkup = bucketKey === 'expenseNeedsReview' && reviewItemId
          ? '<div class="expense-actions">'
            + '<button id="' + escapeHtml(buildExpenseActionElementId('confirm', reviewItemId)) + '" type="button">Potvrdit shodu</button>'
            + '<button id="' + escapeHtml(buildExpenseActionElementId('reject', reviewItemId)) + '" type="button" class="danger-button">Není to shoda</button>'
            + '</div>'
          : item && item.manualDecision === 'confirmed' && reviewItemId && sourceReviewItemId
            ? '<div class="expense-actions">'
              + '<button id="' + escapeHtml(buildExpenseActionElementId('undo-confirm', reviewItemId)) + '" type="button">Zrušit ruční potvrzení</button>'
              + '</div>'
            : item && item.manualDecision === 'rejected' && reviewItemId && sourceReviewItemId
              ? '<div class="expense-actions">'
                + '<button id="' + escapeHtml(buildExpenseActionElementId('undo-reject', reviewItemId)) + '" type="button">Zrušit zamítnutí</button>'
                + '</div>'
              : '';

        return [
          '<article class="expense-item">',
          buildManualMatchSelectionControlMarkup('expense', bucketKey, item),
          '<div class="expense-item-header">',
          '<div class="expense-item-title">' + escapeHtml(String((item && item.title) || 'Výdaj')) + '</div>',
          '<span class="status-badge ' + escapeHtml(badgeClass) + '">' + escapeHtml(matchStrength) + '</span>',
          '</div>',
          '<div class="expense-comparison">',
          buildExpenseReviewSideMarkup(leftLabel, comparison.document, comparisonVariant === 'document-bank' ? 'document' : 'bank'),
          '<div class="expense-zone expense-status">',
          '<h6>Stav a důkazy</h6>',
          manualAuditMarkup,
          item && item.operatorExplanation
            ? '<div class="hint"><strong>Vyhodnocení:</strong> ' + escapeHtml(String(item.operatorExplanation)) + '</div>'
            : '',
          buildExpenseEvidenceMarkup(item),
          item && item.documentBankRelation
            ? '<div class="hint"><strong>Doklad ↔ banka:</strong> ' + escapeHtml(String(item.documentBankRelation)) + '</div>'
            : '',
          item && item.operatorCheckHint
            ? '<div class="hint"><strong>Ruční kontrola:</strong> ' + escapeHtml(String(item.operatorCheckHint)) + '</div>'
            : '',
          actionsMarkup,
          '</div>',
          buildExpenseReviewSideMarkup(rightLabel, comparison.bank, 'bank'),
          '</div>',
          '</article>'
        ].join('');
      }

      function buildExpenseReviewSideMarkup(title, side, sideMode) {
        const isDocument = sideMode === 'document';
        const fields = isDocument
          ? [
              ['Dodavatel', side && side.supplierOrCounterparty],
              ['Číslo faktury / reference', side && side.reference],
              ['Datum vystavení', side && side.issueDate],
              ['Datum splatnosti', side && side.dueDate],
              ['Částka k párování', side && side.amount],
              ['Celkem na faktuře', side && side.summaryTotal],
              ['Měna', side && side.currency],
              ['IBAN hint', side && side.ibanHint]
            ]
          : [
              ['Datum pohybu', side && side.bookedAt],
              ['Částka', side && side.amount],
              ['Měna', side && side.currency],
              ['Protistrana / název účtu', side && side.supplierOrCounterparty],
              ['Reference / zpráva / VS', side && side.reference],
              ['Bankovní účet', side && side.bankAccount]
            ];
        const visibleFields = fields.filter((entry) => Boolean(entry[1]));

        return '<div class="expense-zone"><h6>' + escapeHtml(title) + '</h6>'
          + (visibleFields.length === 0
            ? '<p class="hint">' + escapeHtml(isDocument ? 'Zatím bez načteného dokladu.' : 'Zatím bez kandidátního bankovního pohybu.') + '</p>'
            : '<ul>' + visibleFields.map((entry) =>
              '<li><strong>' + escapeHtml(String(entry[0])) + ':</strong> ' + escapeHtml(String(entry[1])) + '</li>'
            ).join('') + '</ul>')
          + '</div>';
      }

      function buildExpenseEvidenceMarkup(item) {
        const evidence = Array.isArray(item && item.evidenceSummary) ? item.evidenceSummary : [];

        if (evidence.length === 0) {
          return '<p class="hint">Bez doplňujících důkazů.</p>';
        }

        return '<ul>' + evidence.map((entry) =>
          '<li><strong>' + escapeHtml(String(entry.label || '')) + ':</strong> ' + escapeHtml(String(entry.value || '')) + '</li>'
        ).join('') + '</ul>';
      }

      function buildExpenseReviewBuckets(sections) {
        const normalizedSections = sections || {};

        return [
          {
            key: 'expenseMatched',
            title: 'Spárované výdaje',
            items: Array.isArray(normalizedSections.expenseMatched) ? normalizedSections.expenseMatched : [],
            emptyLabel: 'Žádné spárované výdaje.'
          },
          {
            key: 'expenseNeedsReview',
            title: 'Výdaje ke kontrole',
            items: Array.isArray(normalizedSections.expenseNeedsReview) ? normalizedSections.expenseNeedsReview : [],
            emptyLabel: 'Žádné výdaje ke kontrole.'
          },
          {
            key: 'expenseUnmatchedDocuments',
            title: 'Nespárované doklady',
            items: Array.isArray(normalizedSections.expenseUnmatchedDocuments) ? normalizedSections.expenseUnmatchedDocuments : [],
            emptyLabel: 'Žádné nespárované doklady.'
          },
          {
            key: 'expenseUnmatchedOutflows',
            title: 'Nespárované odchozí platby',
            items: Array.isArray(normalizedSections.expenseUnmatchedOutflows) ? normalizedSections.expenseUnmatchedOutflows : [],
            emptyLabel: 'Žádné nespárované odchozí platby.'
          },
          {
            key: 'expenseUnmatchedInflows',
            title: 'Nespárované příchozí platby',
            items: Array.isArray(normalizedSections.expenseUnmatchedInflows) ? normalizedSections.expenseUnmatchedInflows : [],
            emptyLabel: 'Žádné nespárované příchozí platby.'
          }
        ];
      }

      function normalizeExpenseSearchValue(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
      }

      function parseExpenseAmountMinor(value) {
        const normalized = String(value || '').replace(/\s+/g, '').replace(/[Kk][Čč]|CZK|EUR|€/g, '');

        if (!normalized) {
          return Number.NEGATIVE_INFINITY;
        }

        const decimal = normalized.replace(/\./g, '').replace(',', '.');
        const parsed = Number(decimal);
        return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NEGATIVE_INFINITY;
      }

      function parseExpenseComparableTimestamp(value) {
        const normalized = String(value || '').trim();

        if (!normalized) {
          return Number.NEGATIVE_INFINITY;
        }

        const direct = Date.parse(normalized);
        if (Number.isFinite(direct)) {
          return direct;
        }

        const european = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
        if (european) {
          const day = european[1];
          const month = european[2];
          const year = european[3];
          const hour = european[4] || '00';
          const minute = european[5] || '00';
          const second = european[6] || '00';
          return Date.parse(year + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':' + second + 'Z');
        }

        return Number.NEGATIVE_INFINITY;
      }

      function buildExpenseSearchIndex(item) {
        const comparison = item && item.expenseComparison ? item.expenseComparison : {};
        const documentSide = comparison.document || {};
        const bankSide = comparison.bank || {};
        const evidence = Array.isArray(item && item.evidenceSummary)
          ? item.evidenceSummary.map((entry) => String(entry && entry.value || ''))
          : [];

        return normalizeExpenseSearchValue([
          item && item.title,
          item && item.detail,
          documentSide.supplierOrCounterparty,
          documentSide.reference,
          documentSide.amount,
          documentSide.currency,
          documentSide.ibanHint,
          documentSide.issueDate,
          documentSide.dueDate,
          bankSide.supplierOrCounterparty,
          bankSide.reference,
          bankSide.amount,
          bankSide.currency,
          bankSide.bankAccount,
          bankSide.bookedAt,
          Array.isArray(item && item.sourceDocumentIds) ? item.sourceDocumentIds.join(' ') : '',
          Array.isArray(item && item.transactionIds) ? item.transactionIds.join(' ') : '',
          evidence.join(' ')
        ].filter(Boolean).join(' '));
      }

      function matchesExpenseFilter(bucketKey, item) {
        if (currentExpenseDetailFilter === 'all') {
          return true;
        }

        if (currentExpenseDetailFilter === 'manualConfirmed') {
          return item && item.manualDecision === 'confirmed';
        }

        if (currentExpenseDetailFilter === 'manualRejected') {
          return item && item.manualDecision === 'rejected';
        }

        return bucketKey === currentExpenseDetailFilter;
      }

      function matchesExpenseSearch(item) {
        const normalizedNeedle = normalizeExpenseSearchValue(currentExpenseDetailSearch);

        if (!normalizedNeedle) {
          return true;
        }

        return buildExpenseSearchIndex(item).includes(normalizedNeedle);
      }

      function compareExpenseItems(left, right) {
        const leftDocument = left && left.expenseComparison && left.expenseComparison.document ? left.expenseComparison.document : {};
        const rightDocument = right && right.expenseComparison && right.expenseComparison.document ? right.expenseComparison.document : {};
        const leftBank = left && left.expenseComparison && left.expenseComparison.bank ? left.expenseComparison.bank : {};
        const rightBank = right && right.expenseComparison && right.expenseComparison.bank ? right.expenseComparison.bank : {};
        const leftDate = parseExpenseComparableTimestamp(leftBank.bookedAt || leftDocument.dueDate || leftDocument.issueDate);
        const rightDate = parseExpenseComparableTimestamp(rightBank.bookedAt || rightDocument.dueDate || rightDocument.issueDate);
        const leftAmount = parseExpenseAmountMinor(leftDocument.amount || leftBank.amount);
        const rightAmount = parseExpenseAmountMinor(rightDocument.amount || rightBank.amount);
        const leftTitle = String(left && left.title || '');
        const rightTitle = String(right && right.title || '');

        if (currentExpenseDetailSort === 'oldest') {
          return leftDate - rightDate || leftAmount - rightAmount || leftTitle.localeCompare(rightTitle, 'cs');
        }

        if (currentExpenseDetailSort === 'amount-desc') {
          return rightAmount - leftAmount || rightDate - leftDate || leftTitle.localeCompare(rightTitle, 'cs');
        }

        if (currentExpenseDetailSort === 'amount-asc') {
          return leftAmount - rightAmount || rightDate - leftDate || leftTitle.localeCompare(rightTitle, 'cs');
        }

        return rightDate - leftDate || rightAmount - leftAmount || leftTitle.localeCompare(rightTitle, 'cs');
      }

      function buildVisibleExpenseReviewBuckets(buckets) {
        const normalizedBuckets = Array.isArray(buckets) ? buckets : [];
        const nextBuckets = normalizedBuckets.map((bucket) => {
          const filteredItems = (Array.isArray(bucket.items) ? bucket.items : [])
            .filter((item) => matchesExpenseFilter(bucket.key, item))
            .filter((item) => matchesExpenseSearch(item))
            .slice()
            .sort(compareExpenseItems);

          return {
            ...bucket,
            visibleItems: filteredItems
          };
        });

        return {
          buckets: nextBuckets,
          visibleCount: nextBuckets.reduce((sum, bucket) => sum + bucket.visibleItems.length, 0)
        };
      }

      function cloneExpenseReviewItem(item) {
        return {
          ...item,
          transactionIds: Array.isArray(item && item.transactionIds) ? item.transactionIds.slice() : [],
          sourceDocumentIds: Array.isArray(item && item.sourceDocumentIds) ? item.sourceDocumentIds.slice() : [],
          evidenceSummary: Array.isArray(item && item.evidenceSummary)
            ? item.evidenceSummary.map((entry) => ({ ...entry }))
            : [],
          expenseComparison: item && item.expenseComparison
            ? {
                variant: item.expenseComparison.variant,
                leftLabel: item.expenseComparison.leftLabel,
                rightLabel: item.expenseComparison.rightLabel,
                document: { ...((item.expenseComparison && item.expenseComparison.document) || {}) },
                ...(
                  item.expenseComparison && item.expenseComparison.bank
                    ? { bank: { ...item.expenseComparison.bank } }
                    : {}
                )
              }
            : undefined
        };
      }

      function extractExpenseDocumentTransactionIds(item) {
        const transactionIds = Array.isArray(item && item.transactionIds) ? item.transactionIds : [];

        return transactionIds.length > 1 ? transactionIds.slice(0, -1) : [];
      }

      function extractExpenseBankTransactionId(item) {
        const transactionIds = Array.isArray(item && item.transactionIds) ? item.transactionIds : [];
        return transactionIds.length > 0 ? transactionIds[transactionIds.length - 1] : undefined;
      }

      function maybeExpenseEvidence(label, value) {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized ? { label, value: normalized } : undefined;
      }

      function buildManualConfirmedExpenseItem(item, override) {
        const manualItem = cloneExpenseReviewItem(item);

        manualItem.id = 'expense-manual-confirmed:' + String(item && item.id || '');
        manualItem.domain = 'expense';
        manualItem.kind = 'expense-matched';
        manualItem.matchStrength = 'potvrzená shoda';
        manualItem.detail = 'Operátor ručně potvrdil vazbu dokladu na odchozí bankovní platbu.';
        manualItem.operatorExplanation = 'Operátor ručně potvrdil navrženou vazbu doklad ↔ banka.';
        manualItem.operatorCheckHint = 'Ruční potvrzení je uložené pro tento měsíc; další kontrola je nutná jen při sporu.';
        manualItem.documentBankRelation = 'Ručně potvrzená vazba mezi dokladem a odchozí bankovní platbou.';
        manualItem.manualDecision = 'confirmed';
        manualItem.manualDecisionLabel = 'Ručně potvrzená shoda';
        manualItem.manualDecisionAt = override && override.decidedAt ? override.decidedAt : undefined;
        manualItem.manualSourceReviewItemId = item && item.id ? String(item.id) : undefined;

        return manualItem;
      }

      function buildManualRejectedExpenseDocumentItem(item, override) {
        const documentSide = item && item.expenseComparison && item.expenseComparison.document
          ? { ...item.expenseComparison.document }
          : {};
        const documentReference = documentSide.reference;
        const provenance = Array.isArray(item && item.evidenceSummary)
          ? item.evidenceSummary.find((entry) => entry && entry.label === 'provenience')
          : undefined;

        return {
          id: 'expense-manual-rejected-document:' + String(item && item.id || ''),
          domain: 'expense',
          kind: 'expense-unmatched-document',
          title: documentReference
            ? 'Nespárovaný doklad ' + String(documentReference)
            : String((item && item.title) || 'Nespárovaný doklad'),
          detail: 'Operátor ručně odmítl navrženou vazbu dokladu na bankovní odtok.',
          transactionIds: extractExpenseDocumentTransactionIds(item),
          sourceDocumentIds: Array.isArray(item && item.sourceDocumentIds) ? item.sourceDocumentIds.slice() : [],
          matchStrength: 'nespárováno',
          evidenceSummary: [
            maybeExpenseEvidence('částka', documentSide.amount),
            maybeExpenseEvidence('datum', documentSide.dueDate || documentSide.issueDate),
            maybeExpenseEvidence('reference', documentReference || 'chybí'),
            maybeExpenseEvidence('IBAN', documentSide.ibanHint || 'chybí'),
            maybeExpenseEvidence('protistrana / dodavatel', documentSide.supplierOrCounterparty || 'bez bankovního kandidáta'),
            maybeExpenseEvidence('provenience', provenance && provenance.value)
          ].filter(Boolean),
          operatorExplanation: 'Operátor označil navržený bankovní kandidát jako neshodu; doklad zůstává bez potvrzené platby.',
          operatorCheckHint: 'Tato dvojice se v tomto měsíci znovu nenavrhuje. Zkontrolujte jiný bankovní odtok nebo chybějící doklad.',
          documentBankRelation: 'Doklad zůstává bez potvrzené bankovní vazby; navržená shoda byla ručně odmítnuta.',
          expenseComparison: {
            document: documentSide
          },
          manualDecision: 'rejected',
          manualDecisionLabel: 'Ručně zamítnuto',
          manualDecisionAt: override && override.decidedAt ? override.decidedAt : undefined,
          manualSourceReviewItemId: item && item.id ? String(item.id) : undefined
        };
      }

      function buildManualRejectedExpenseOutflowItem(item, override) {
        const bankSide = item && item.expenseComparison && item.expenseComparison.bank
          ? { ...item.expenseComparison.bank }
          : undefined;
        const bankTransactionId = extractExpenseBankTransactionId(item);

        return {
          id: 'expense-manual-rejected-outflow:' + String(item && item.id || ''),
          domain: 'expense',
          kind: 'expense-unmatched-outflow',
          title: bankSide && bankSide.amount
            ? 'Nespárovaná odchozí platba ' + String(bankSide.amount)
            : 'Nespárovaná odchozí platba',
          detail: 'Operátor ručně odmítl navrženou vazbu odchozí bankovní platby na doklad.',
          transactionIds: bankTransactionId ? [bankTransactionId] : [],
          sourceDocumentIds: [],
          matchStrength: 'nespárováno',
          evidenceSummary: [
            maybeExpenseEvidence('částka', bankSide && bankSide.amount),
            maybeExpenseEvidence('datum', bankSide && bankSide.bookedAt),
            maybeExpenseEvidence('zpráva banky', bankSide && bankSide.reference ? bankSide.reference : 'chybí'),
            maybeExpenseEvidence('reference', bankSide && bankSide.reference ? bankSide.reference : 'chybí'),
            maybeExpenseEvidence(
              'protistrana / účet',
              [bankSide && bankSide.supplierOrCounterparty, bankSide && bankSide.bankAccount].filter(Boolean).join(' · ')
            ),
            maybeExpenseEvidence('dokument', 'chybí')
          ].filter(Boolean),
          operatorExplanation: 'Odchozí bankovní platba zůstává bez potvrzeného dokladu; navržená shoda byla ručně odmítnuta.',
          operatorCheckHint: 'Tato dvojice se v tomto měsíci znovu nenavrhuje. Dohledejte jiný doklad nebo ponechte platbu bez vazby.',
          documentBankRelation: 'Odchozí bankovní platba zůstává bez potvrzeného dokladu; navržená shoda byla ručně odmítnuta.',
          expenseComparison: bankSide
            ? {
                document: {},
                bank: bankSide
              }
            : { document: {} },
          manualDecision: 'rejected',
          manualDecisionLabel: 'Ručně zamítnuto',
          manualDecisionAt: override && override.decidedAt ? override.decidedAt : undefined,
          manualSourceReviewItemId: item && item.id ? String(item.id) : undefined
        };
      }

      function buildEffectiveExpenseReviewSections(sections, overrides) {
        const baseSections = {
          expenseMatched: Array.isArray(sections && sections.expenseMatched) ? sections.expenseMatched.map((item) => cloneExpenseReviewItem(item)) : [],
          expenseNeedsReview: Array.isArray(sections && sections.expenseNeedsReview) ? sections.expenseNeedsReview.map((item) => cloneExpenseReviewItem(item)) : [],
          expenseUnmatchedDocuments: Array.isArray(sections && sections.expenseUnmatchedDocuments) ? sections.expenseUnmatchedDocuments.map((item) => cloneExpenseReviewItem(item)) : [],
          expenseUnmatchedOutflows: Array.isArray(sections && sections.expenseUnmatchedOutflows) ? sections.expenseUnmatchedOutflows.map((item) => cloneExpenseReviewItem(item)) : [],
          expenseUnmatchedInflows: Array.isArray(sections && sections.expenseUnmatchedInflows) ? sections.expenseUnmatchedInflows.map((item) => cloneExpenseReviewItem(item)) : []
        };
        const overrideByReviewItemId = new Map();

        (Array.isArray(overrides) ? overrides : []).forEach((override) => {
          if (override && override.reviewItemId) {
            overrideByReviewItemId.set(String(override.reviewItemId), override);
          }
        });

        const reviewItemsById = new Map(
          baseSections.expenseNeedsReview.map((item) => [String(item.id), item])
        );
        const confirmedOverrides = [];
        const rejectedDocumentOverrides = [];
        const rejectedOutflowOverrides = [];

        overrideByReviewItemId.forEach((override, reviewItemId) => {
          const reviewItem = reviewItemsById.get(reviewItemId);

          if (!reviewItem) {
            return;
          }

          if (override.decision === 'confirmed') {
            confirmedOverrides.push(buildManualConfirmedExpenseItem(reviewItem, override));
            return;
          }

          rejectedDocumentOverrides.push(buildManualRejectedExpenseDocumentItem(reviewItem, override));
          rejectedOutflowOverrides.push(buildManualRejectedExpenseOutflowItem(reviewItem, override));
        });

        return {
          expenseMatched: baseSections.expenseMatched.concat(confirmedOverrides),
          expenseNeedsReview: baseSections.expenseNeedsReview.filter((item) => !overrideByReviewItemId.has(String(item.id))),
          expenseUnmatchedDocuments: baseSections.expenseUnmatchedDocuments.concat(rejectedDocumentOverrides),
          expenseUnmatchedOutflows: baseSections.expenseUnmatchedOutflows.concat(rejectedOutflowOverrides),
          expenseUnmatchedInflows: baseSections.expenseUnmatchedInflows
        };
      }

      function buildExpenseActionElementId(action, reviewItemId) {
        return 'expense-review-' + String(action || 'action') + '-' + encodeURIComponent(String(reviewItemId || '')).replace(/%/g, '_');
      }

      function upsertExpenseReviewOverride(reviewItemId, decision) {
        const normalizedReviewItemId = String(reviewItemId || '');

        if (!normalizedReviewItemId) {
          return;
        }

        const nextOverride = {
          reviewItemId: normalizedReviewItemId,
          decision: decision === 'confirmed' ? 'confirmed' : 'rejected',
          decidedAt: new Date().toISOString()
        };
        const existingIndex = currentExpenseReviewOverrides.findIndex((override) => String(override.reviewItemId) === normalizedReviewItemId);

        if (existingIndex >= 0) {
          currentExpenseReviewOverrides.splice(existingIndex, 1, nextOverride);
        } else {
          currentExpenseReviewOverrides.push(nextOverride);
        }

        applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
        showOperatorView('expense-detail');
      }

      function removeExpenseReviewOverride(reviewItemId) {
        const normalizedReviewItemId = String(reviewItemId || '');

        if (!normalizedReviewItemId) {
          return;
        }

        currentExpenseReviewOverrides = currentExpenseReviewOverrides.filter((override) =>
          String(override && override.reviewItemId || '') !== normalizedReviewItemId
        );
        applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
        showOperatorView('expense-detail');
      }

      function wireExpenseReviewActionButtons(bucketKey, items) {
        (Array.isArray(items) ? items : []).forEach((item) => {
          const reviewItemId = String((item && item.id) || '');
          const sourceReviewItemId = String((item && item.manualSourceReviewItemId) || reviewItemId);

          if (!reviewItemId) {
            return;
          }

          const confirmButton = document.getElementById(buildExpenseActionElementId('confirm', reviewItemId));
          const rejectButton = document.getElementById(buildExpenseActionElementId('reject', reviewItemId));

          if (confirmButton && typeof confirmButton.addEventListener === 'function') {
            confirmButton.addEventListener('click', () => {
              upsertExpenseReviewOverride(reviewItemId, 'confirmed');
            });
          }

          if (rejectButton && typeof rejectButton.addEventListener === 'function') {
            rejectButton.addEventListener('click', () => {
              upsertExpenseReviewOverride(reviewItemId, 'rejected');
            });
          }

          const undoConfirmButton = document.getElementById(buildExpenseActionElementId('undo-confirm', reviewItemId));
          const undoRejectButton = document.getElementById(buildExpenseActionElementId('undo-reject', reviewItemId));

          if (bucketKey === 'expenseMatched' && undoConfirmButton && typeof undoConfirmButton.addEventListener === 'function') {
            undoConfirmButton.addEventListener('click', () => {
              removeExpenseReviewOverride(sourceReviewItemId);
            });
          }

          if ((bucketKey === 'expenseUnmatchedDocuments' || bucketKey === 'expenseUnmatchedOutflows')
            && undoRejectButton
            && typeof undoRejectButton.addEventListener === 'function') {
            undoRejectButton.addEventListener('click', () => {
              removeExpenseReviewOverride(sourceReviewItemId);
            });
          }
        });
      }

      function buildExpenseSummaryTilesMarkup(buckets) {
        return '<div class="expense-summary-grid">' + buckets.map((bucket) =>
          '<article class="expense-summary-tile" data-expense-bucket-key="' + escapeHtml(bucket.key) + '" data-expense-count="' + escapeHtml(String(bucket.items.length)) + '">'
          + '<strong>' + escapeHtml(String(bucket.items.length)) + '</strong>'
          + '<span>' + escapeHtml(bucket.title) + '</span>'
          + '</article>'
        ).join('') + '</div>';
      }

      function buildExpenseReviewSummaryMarkup(buckets, phase) {
        const normalizedBuckets = Array.isArray(buckets) ? buckets : [];

        if (phase === 'running') {
          return '<p class="hint">Přehled bucketů pro výdaje se právě načítá ze stejného runtime běhu…</p>'
            + '<p class="hint">Detailní kontrola dokladů a banky se otevře v interním detailu, jakmile bude běh hotový.</p>';
        }

        if (phase === 'failed') {
          return '<p class="hint">Kontrola výdajů a dokladů není k dispozici, protože runtime běh selhal.</p>';
        }

        const totalCount = normalizedBuckets.reduce((sum, bucket) => sum + bucket.items.length, 0);

        if (phase === 'placeholder' || totalCount === 0) {
          return '<p class="hint">Po spuštění se zde ukáže přehled bucketů pro doklady a odchozí bankovní platby.</p>'
            + '<p class="hint">Samotná detailní kontrola se otevírá v interním detailu, aby hlavní stránka zůstala přehledná.</p>';
        }

        return [
          '<p class="hint">Počty v kartě níže vycházejí ze stejných bucketů, které jsou vykreslené v detailu Kontrola výdajů a dokladů.</p>',
          buildExpenseSummaryTilesMarkup(normalizedBuckets)
        ].join('');
      }

      function buildExpenseDetailSummaryMarkup(state, buckets) {
        const normalizedState = state || initialRuntimeState;
        const normalizedBuckets = Array.isArray(buckets) ? buckets : [];

        return [
          '<p><strong>Měsíc:</strong> ' + escapeHtml(normalizedState.monthLabel || 'neuvedeno') + '</p>',
          '<p><strong>Run ID:</strong> <code>' + escapeHtml(normalizedState.runId || 'bez runtime běhu') + '</code></p>',
          '<p class="hint">Souhrnné počty musí odpovídat přesně viditelným bucketům níže.</p>',
          buildExpenseSummaryTilesMarkup(normalizedBuckets)
        ].join('');
      }

      function syncExpenseDetailControls() {
        const filterButtons = [
          ['all', 'expense-filter-all'],
          ['expenseMatched', 'expense-filter-expenseMatched'],
          ['expenseNeedsReview', 'expense-filter-expenseNeedsReview'],
          ['expenseUnmatchedDocuments', 'expense-filter-expenseUnmatchedDocuments'],
          ['expenseUnmatchedOutflows', 'expense-filter-expenseUnmatchedOutflows'],
          ['expenseUnmatchedInflows', 'expense-filter-expenseUnmatchedInflows'],
          ['manualConfirmed', 'expense-filter-manualConfirmed'],
          ['manualRejected', 'expense-filter-manualRejected']
        ];

        filterButtons.forEach(([filterKey, elementId]) => {
          const button = document.getElementById(elementId);

          if (!button) {
            return;
          }

          button.className = filterKey === currentExpenseDetailFilter ? 'is-active' : '';
        });

        if (expenseDetailSearchInput) {
          expenseDetailSearchInput.value = currentExpenseDetailSearch;
        }

        if (expenseDetailSortSelect) {
          expenseDetailSortSelect.value = currentExpenseDetailSort;
        }
      }

      function wireExpenseDetailControls() {
        if (expenseDetailControlsWired) {
          syncExpenseDetailControls();
          return;
        }

        const filterButtons = [
          ['all', 'expense-filter-all'],
          ['expenseMatched', 'expense-filter-expenseMatched'],
          ['expenseNeedsReview', 'expense-filter-expenseNeedsReview'],
          ['expenseUnmatchedDocuments', 'expense-filter-expenseUnmatchedDocuments'],
          ['expenseUnmatchedOutflows', 'expense-filter-expenseUnmatchedOutflows'],
          ['expenseUnmatchedInflows', 'expense-filter-expenseUnmatchedInflows'],
          ['manualConfirmed', 'expense-filter-manualConfirmed'],
          ['manualRejected', 'expense-filter-manualRejected']
        ];

        filterButtons.forEach(([filterKey, elementId]) => {
          const button = document.getElementById(elementId);

          if (!button || typeof button.addEventListener !== 'function') {
            return;
          }

          button.addEventListener('click', () => {
            currentExpenseDetailFilter = filterKey;
            applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
            showOperatorView('expense-detail');
          });
        });

        if (expenseDetailSearchInput && typeof expenseDetailSearchInput.addEventListener === 'function') {
          expenseDetailSearchInput.addEventListener('input', () => {
            currentExpenseDetailSearch = String(expenseDetailSearchInput.value || '');
            applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
            showOperatorView('expense-detail');
          });
        }

        if (expenseDetailSortSelect && typeof expenseDetailSortSelect.addEventListener === 'function') {
          expenseDetailSortSelect.addEventListener('change', () => {
            currentExpenseDetailSort = String(expenseDetailSortSelect.value || 'newest');
            applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
            showOperatorView('expense-detail');
          });
        }

        expenseDetailControlsWired = true;
        syncExpenseDetailControls();
      }

      function buildControlDetailSummaryMarkup(state, phase) {
        const normalizedState = state || initialRuntimeState;
        const payoutProjection = getVisiblePayoutProjection(normalizedState);
        const sections = normalizedState.reviewSections || {};
        const manualMatchGroups = Array.isArray(normalizedState && normalizedState.manualMatchGroups) ? normalizedState.manualMatchGroups : [];

        if (phase === 'running') {
          return '<p class="hint">Detail kontrolních sekcí se právě připravuje ze stejného runtime běhu…</p>';
        }

        if (phase === 'failed') {
          return '<p class="hint">Detail kontrolních sekcí není k dispozici, protože runtime běh selhal.</p>';
        }

        if (phase === 'placeholder') {
          return '<p class="hint">Po spuštění se zde ukážou souhrnné počty pro payout dávky, rezervace a kontrolní bucket sekce.</p>';
        }

        return [
          '<p class="hint">Souhrnné počty musí přesně sedět na detailní bucket sekce v interním přehledu.</p>',
          '<ul>',
          '<li><strong>Spárované payout dávky:</strong> ' + escapeHtml(String((payoutProjection.matchedItems || []).length)) + '</li>',
          '<li><strong>Nespárované payout dávky:</strong> ' + escapeHtml(String((payoutProjection.unmatchedItems || []).length)) + '</li>',
          '<li><strong>Hlavní ubytovací rezervace:</strong> ' + escapeHtml(String(((sections && sections.reservationSettlementOverview) || []).length)) + '</li>',
          '<li><strong>Doplňkové položky:</strong> ' + escapeHtml(String(((sections && sections.ancillarySettlementOverview) || []).length)) + '</li>',
          '<li><strong>Nespárované rezervace k úhradě:</strong> ' + escapeHtml(String(((sections && sections.unmatchedReservationSettlements) || []).length)) + '</li>',
          '<li><strong>Ručně spárované skupiny:</strong> ' + escapeHtml(String(manualMatchGroups.length)) + '</li>',
          '</ul>'
        ].join('');
      }

      function buildManualMatchSummaryMarkup(pageKey, state) {
        const normalizedState = state || initialRuntimeState;
        const selectedItems = collectSelectedManualMatchItems(normalizedState.reviewSections, { allowStateSync: false });

        if (selectedItems.length === 0) {
          return '<p class="hint">Vyberte checkboxem nespárované položky, které mají tvořit jednu ruční match group.</p>';
        }

        const selectionSummary = buildManualMatchSelectionSummary(selectedItems);
        const totalMarkup = selectionSummary.totalComputable
          ? '<p><strong>Součet:</strong> ' + escapeHtml(selectionSummary.totalLabel) + '</p>'
          : '<p class="hint">Součet vybraných položek nejde bezpečně spočítat z aktuálně viditelných dat.</p>';

        if (!currentManualMatchConfirmMode) {
          return [
            '<div class="manual-match-summary-row">',
            '<div>',
            '<p><strong>Vybráno položek:</strong> ' + escapeHtml(String(selectionSummary.selectedCount)) + '</p>',
            totalMarkup,
            '</div>',
            '<div class="manual-match-summary-actions">',
            '<button id="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'review', 'selection')) + '" type="button">Ručně spárovat</button>',
            '<button id="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'clear-selection', 'selection')) + '" type="button" class="secondary-button">Zrušit výběr</button>',
            '</div>',
            '</div>'
          ].join('');
        }

        return [
          '<p><strong>Potvrzení ručního spárování</strong></p>',
          '<p><strong>Položek:</strong> ' + escapeHtml(String(selectionSummary.selectedCount)) + '</p>',
          totalMarkup,
          '<label for="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'note', 'selection')) + '">Krátká poznámka</label>',
          '<input id="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'note', 'selection')) + '" class="manual-match-note-input" type="text" maxlength="160" placeholder="Např. Jedna ruční vazba pro stejný celek" value="' + escapeHtml(currentManualMatchDraftNote || '') + '" />',
          '<div class="manual-match-summary-actions">',
          '<button id="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'confirm-create', 'selection')) + '" type="button">Potvrdit vytvoření group</button>',
          '<button id="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'back', 'selection')) + '" type="button" class="secondary-button">Zpět</button>',
          '<button id="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'clear-selection', 'selection')) + '" type="button" class="danger-button">Zrušit výběr</button>',
          '</div>'
        ].join('');
      }

      function buildManualMatchGroupMarkup(pageKey, groups, sections) {
        const normalizedGroups = Array.isArray(groups) ? groups : [];
        const selectionSummary = buildManualMatchSelectionSummary(collectSelectedManualMatchItems(sections, { allowStateSync: false }));
        const hasAppendSelection = selectionSummary.selectedCount > 0;

        if (normalizedGroups.length === 0) {
          return '<p class="hint">Zatím nebyla vytvořená žádná ruční match group pro tento měsíc.</p>';
        }

        return '<div class="manual-match-groups">' + normalizedGroups.map((group) => {
          const groupSummary = group.selectionSummary || buildManualMatchSelectionSummary(group.items || []);
          const totalMarkup = groupSummary.totalComputable
            ? '<span class="manual-match-group-meta"> · součet ' + escapeHtml(groupSummary.totalLabel) + '</span>'
            : '';

          return [
            '<article class="manual-match-group">',
            '<div class="manual-match-group-header">',
            '<div>',
            '<strong>Group ' + escapeHtml(String(group.id || 'bez-id')) + '</strong>',
            '<div class="manual-match-group-meta">Položek ' + escapeHtml(String((group.items || []).length)) + totalMarkup + '</div>',
            '<div class="manual-match-group-meta">Vytvořeno ' + escapeHtml(String(group.createdAt || 'neuvedeno')) + '</div>',
            group.updatedAt ? '<div class="manual-match-group-meta">Naposledy rozšířeno ' + escapeHtml(String(group.updatedAt)) + '</div>' : '',
            group.note ? '<div class="manual-match-group-meta">Poznámka: ' + escapeHtml(String(group.note)) + '</div>' : '',
            '</div>',
            '<div class="manual-match-group-actions">',
            hasAppendSelection
              ? '<button id="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'append-to-group', group.id)) + '" type="button">Přidat vybrané do této skupiny</button>'
              : '',
            '<button id="' + escapeHtml(buildManualMatchActionElementId(pageKey, 'remove-group', group.id)) + '" type="button" class="secondary-button">Zrušit ruční spárování</button>',
            '</div>',
            '</div>',
            '<ul>' + (Array.isArray(group.items) ? group.items : []).map((item) =>
              '<li><strong>' + escapeHtml(String(item && item.title || 'Položka')) + '</strong><br /><span class="hint">' + escapeHtml(String(item && item.detail || '')) + '</span></li>'
            ).join('') + '</ul>',
            '</article>'
          ].join('');
        }).join('') + '</div>';
      }

      function wireManualMatchSelectionControls(pageKey, buckets) {
        (Array.isArray(buckets) ? buckets : []).forEach((bucket) => {
          const bucketKey = String(bucket && bucket.key || '');
          const items = Array.isArray(bucket && bucket.items) ? bucket.items : [];

          items.forEach((item) => {
            const reviewItemId = String(item && item.id || '');

            if (!reviewItemId || !isSelectableManualMatchBucket(bucketKey)) {
              return;
            }

            const element = document.getElementById(buildManualMatchSelectionElementId(pageKey, bucketKey, reviewItemId));

            if (!element || typeof element.addEventListener !== 'function') {
              return;
            }

            element.checked = currentSelectedManualMatchItemIds.includes(reviewItemId);
            element.addEventListener('change', () => {
              toggleManualMatchSelection(reviewItemId);
            });
          });
        });
      }

      function wireManualMatchSummaryControls(pageKey, state) {
        const reviewButton = document.getElementById(buildManualMatchActionElementId(pageKey, 'review', 'selection'));
        const clearSelectionButton = document.getElementById(buildManualMatchActionElementId(pageKey, 'clear-selection', 'selection'));
        const backButton = document.getElementById(buildManualMatchActionElementId(pageKey, 'back', 'selection'));
        const confirmButton = document.getElementById(buildManualMatchActionElementId(pageKey, 'confirm-create', 'selection'));
        const noteInput = document.getElementById(buildManualMatchActionElementId(pageKey, 'note', 'selection'));
        const groups = Array.isArray(state && state.manualMatchGroups) ? state.manualMatchGroups : [];

        if (reviewButton && typeof reviewButton.addEventListener === 'function') {
          reviewButton.addEventListener('click', () => {
            currentManualMatchConfirmMode = true;
            applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
            showOperatorView(pageKey === 'control' ? 'control-detail' : 'expense-detail');
          });
        }

        if (clearSelectionButton && typeof clearSelectionButton.addEventListener === 'function') {
          clearSelectionButton.addEventListener('click', () => {
            clearManualMatchSelection();
            showOperatorView(pageKey === 'control' ? 'control-detail' : 'expense-detail');
          });
        }

        if (backButton && typeof backButton.addEventListener === 'function') {
          backButton.addEventListener('click', () => {
            currentManualMatchConfirmMode = false;
            applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
            showOperatorView(pageKey === 'control' ? 'control-detail' : 'expense-detail');
          });
        }

        if (noteInput) {
          noteInput.value = currentManualMatchDraftNote;
          if (typeof noteInput.addEventListener === 'function') {
            noteInput.addEventListener('input', () => {
              currentManualMatchDraftNote = String(noteInput.value || '');
            });
          }
        }

        if (confirmButton && typeof confirmButton.addEventListener === 'function') {
          confirmButton.addEventListener('click', () => {
            createManualMatchGroupFromSelection(String(state && state.monthLabel || currentWorkspaceMonth || ''), state && state.reviewSections);
            showOperatorView(pageKey === 'control' ? 'control-detail' : 'expense-detail');
          });
        }

        groups.forEach((group) => {
          const appendButton = document.getElementById(buildManualMatchActionElementId(pageKey, 'append-to-group', group.id));
          const removeButton = document.getElementById(buildManualMatchActionElementId(pageKey, 'remove-group', group.id));

          if (appendButton && typeof appendButton.addEventListener === 'function') {
            appendButton.addEventListener('click', () => {
              extendManualMatchGroupFromSelection(
                group.id,
                String(state && state.monthLabel || currentWorkspaceMonth || ''),
                currentExpenseReviewState && currentExpenseReviewState.reviewSections
              );
              showOperatorView(pageKey === 'control' ? 'control-detail' : 'expense-detail');
            });
          }

          if (!removeButton || typeof removeButton.addEventListener !== 'function') {
            return;
          }

          removeButton.addEventListener('click', () => {
            removeManualMatchGroup(group.id);
            showOperatorView(pageKey === 'control' ? 'control-detail' : 'expense-detail');
          });
        });
      }

      function showOperatorView(view) {
        const normalizedView = view === 'control-detail' || view === 'expense-detail'
          ? view
          : 'main-overview';
        const showMainOverview = normalizedView === 'main-overview';
        const showExpenseDetail = normalizedView === 'expense-detail';

        mainDashboardView.hidden = !showMainOverview;
        controlDetailView.hidden = normalizedView !== 'control-detail';
        expenseDetailView.hidden = !showExpenseDetail;
        if (appShell) {
          if (appShell.classList && typeof appShell.classList.toggle === 'function') {
            appShell.classList.toggle('operator-shell', true);
          } else {
            appShell.className = 'operator-shell';
          }
        }

        if (window && window.location) {
          window.location.hash = normalizedView === 'main-overview'
            ? ''
            : normalizedView === 'control-detail'
              ? '#detail-kontrolnich-sekci'
              : '#kontrola-vydaju-a-dokladu';
        }
      }

      function mapMatchStrengthToBadgeClass(matchStrength) {
        if (matchStrength === 'potvrzená shoda') {
          return 'confirmed';
        }

        if (matchStrength === 'slabší shoda') {
          return 'weak';
        }

        if (matchStrength === 'vyžaduje kontrolu') {
          return 'review';
        }

        return 'unmatched';
      }

      function buildSettlementOverviewMarkup(items) {
        if (!items || items.length === 0) {
          return '<p class="hint">Žádné položky v této sekci.</p>';
        }

        return '<ul>' + items.map((item) =>
          '<li><strong>' + escapeHtml(item.title) + '</strong>' + buildReviewAuditMarkup(item) + '<br /><span class="hint">' + escapeHtml(item.detail) + '</span></li>'
        ).join('') + '</ul>';
      }

      function buildPayoutBatchDetailMarkup(items, pageKey, bucketKey) {
        if (!items || items.length === 0) {
          return '<p class="hint">Žádné položky v této sekci.</p>';
        }

        return '<ul>' + items.map((item) =>
          '<li>'
          + '<strong>' + escapeHtml(item.title) + '</strong>'
          + buildManualMatchSelectionControlMarkup(pageKey || 'control', bucketKey || 'payoutBatchUnmatched', item)
          + buildReviewAuditMarkup(item) + '<br /><span class="hint">' + escapeHtml(item.detail) + '</span></li>'
        ).join('') + '</ul>';
      }

      function buildExportMarkup(state) {
        const exports = state.exportFiles.length === 0
          ? '<li>Žádné exporty.</li>'
          : state.exportFiles.map((file) => '<li><strong>' + escapeHtml(file.labelCs) + '</strong> — <code>' + escapeHtml(file.fileName) + '</code></li>').join('');
        const normalizedMonth = String(state.monthLabel || '');

        return [
          '<p class="hint">Exportní handoff je po spuštění přepsaný skutečným runtime výsledkem.</p>',
          '<div class="input-grid">',
          '<div>',
          '<label for="workspace-export-preset">Výběr Excel exportu pro aktuální měsíc</label>',
          '<select id="workspace-export-preset">',
          '<option value="complete"' + (currentExportPreset === 'complete' ? ' selected' : '') + '>Kompletní export</option>',
          '<option value="review-needed"' + (currentExportPreset === 'review-needed' ? ' selected' : '') + '>Jen ke kontrole / chybějící</option>',
          '<option value="matched-only"' + (currentExportPreset === 'matched-only' ? ' selected' : '') + '>Jen spárované</option>',
          '</select>',
          '<p class="hint">Excel vždy vychází z právě obnoveného workspace pro měsíc <strong>' + escapeHtml(normalizedMonth || 'neuvedeno') + '</strong>.</p>',
          '</div>',
          '<div>',
          '<label>&nbsp;</label>',
          '<button id="download-workspace-excel-button" type="button">Stáhnout Excel export</button>',
          '<p class="hint">Listy Souhrn, Payout a rezervace, Výdaje a doklady používají stejný workspace state jako přehled a detailní stránky.</p>',
          '</div>',
          '</div>',
          '<ul>' + exports + '</ul>',
          '<p class="hint">Run ID: <code>' + escapeHtml(state.runId) + '</code></p>'
        ].join('');
      }

      function triggerWorkspaceExcelDownload() {
        if (!currentExportVisibleState || !currentExportVisibleState.runId) {
          runtimeOutput.innerHTML = '<p class="hint">Nejprve spusťte nebo obnovte měsíc, ze kterého se má Excel vytvořit.</p>';
          return;
        }

        if (typeof window.__hotelFinanceBuildWorkspaceExcelExport !== 'function') {
          runtimeOutput.innerHTML = '<p class="hint">Browser Excel export ještě není připravený. Zkuste akci za okamžik znovu.</p>';
          return;
        }

        const artifact = window.__hotelFinanceBuildWorkspaceExcelExport({
          state: currentExportVisibleState,
          preset: currentExportPreset
        });

        window.__hotelFinanceLastExcelExport = artifact;

        if (typeof document.createElement === 'function') {
          const anchor = document.createElement('a');

          if (anchor) {
            anchor.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + artifact.base64Content;
            anchor.download = artifact.fileName;
            anchor.rel = 'noopener';

            if (typeof anchor.click === 'function') {
              anchor.click();
            }
          }
        }
      }

      function wireExportControls() {
        const exportPresetSelect = document.getElementById('workspace-export-preset');
        const downloadWorkspaceExcelButton = document.getElementById('download-workspace-excel-button');

        if (exportPresetSelect && typeof exportPresetSelect.addEventListener === 'function') {
          exportPresetSelect.value = currentExportPreset;
          exportPresetSelect.addEventListener('change', () => {
            currentExportPreset = String(exportPresetSelect.value || 'complete');
          });
        }

        if (downloadWorkspaceExcelButton && typeof downloadWorkspaceExcelButton.addEventListener === 'function') {
          downloadWorkspaceExcelButton.addEventListener('click', () => {
            triggerWorkspaceExcelDownload();
          });
        }
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
          carryoverSourceSnapshot: state.carryoverSourceSnapshot || initialRuntimeState.carryoverSourceSnapshot,
          carryoverDebug: {
            sourceMonthKey: String(state.carryoverDebug?.sourceMonthKey || ''),
            currentMonthKey: String(state.carryoverDebug?.currentMonthKey || state.monthLabel || ''),
            loadedPayoutBatchCount: Number(state.carryoverDebug?.loadedPayoutBatchCount || 0),
            loadedPayoutBatchKeysSample: Array.isArray(state.carryoverDebug?.loadedPayoutBatchKeysSample)
              ? state.carryoverDebug.loadedPayoutBatchKeysSample.slice(0, 5)
              : [],
            matchingInputPayoutBatchCount: Number(state.carryoverDebug?.matchingInputPayoutBatchCount || 0),
            matchingInputPayoutBatchKeysSample: Array.isArray(state.carryoverDebug?.matchingInputPayoutBatchKeysSample)
              ? state.carryoverDebug.matchingInputPayoutBatchKeysSample.slice(0, 5)
              : [],
            matcherCarryoverCandidateExists: Boolean(state.carryoverDebug?.matcherCarryoverCandidateExists),
            matcherCarryoverRejectedReason: String(state.carryoverDebug?.matcherCarryoverRejectedReason || ''),
            matchedCount: Number(state.carryoverDebug?.matchedCount || 0),
            unmatchedCount: Number(state.carryoverDebug?.unmatchedCount || 0)
          },
          manualMatchGroups: [],
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
        currentVisibleRuntimePhase = phase;

        const baseVisibleState = state && state.finalPayoutProjection
          ? state
          : {
            ...state,
            runtimeBuildInfo: (state && state.runtimeBuildInfo) || initialRuntimeState.runtimeBuildInfo,
            finalPayoutProjection: collectVisiblePayoutProjection(state)
          };
        const effectiveExpenseSections = buildEffectiveExpenseReviewSections(
          baseVisibleState && baseVisibleState.reviewSections,
          currentExpenseReviewOverrides
        );
        const expenseResolvedState = {
          ...baseVisibleState,
          reviewSections: {
            ...((baseVisibleState && baseVisibleState.reviewSections) || {}),
            ...effectiveExpenseSections
          }
        };
        const payoutResolutionAdjustedSections = applyLaterMonthCarryoverResolutionProjection(
          expenseResolvedState.reviewSections,
          currentWorkspaceMonth || expenseResolvedState.monthLabel || ''
        );
        const payoutResolutionState = {
          ...expenseResolvedState,
          reviewSections: {
            ...payoutResolutionAdjustedSections
          }
        };
        const syncedManualMatchGroups = syncManualMatchGroupsForCurrentSections(
          currentManualMatchGroups,
          payoutResolutionState.reviewSections,
          currentWorkspaceMonth || payoutResolutionState.monthLabel || ''
        );

        if (syncedManualMatchGroups.changed) {
          currentManualMatchGroups = syncedManualMatchGroups.groups;
        }

        collectSelectedManualMatchItems(payoutResolutionState.reviewSections);
        const manualMatchProjection = buildEffectiveManualMatchProjection(
          payoutResolutionState.reviewSections,
          syncedManualMatchGroups.groups,
          currentWorkspaceMonth || payoutResolutionState.monthLabel || ''
        );
        const adjustedPayoutProjection = collectVisiblePayoutProjection({
          reviewSections: manualMatchProjection.reviewSections
        });
        const hiddenManualMatchItemCount = manualMatchProjection.hiddenReviewItemIds ? manualMatchProjection.hiddenReviewItemIds.size : 0;
        const visibleState = {
          ...payoutResolutionState,
          reportSummary: {
            ...((payoutResolutionState && payoutResolutionState.reportSummary) || {}),
            payoutBatchMatchCount: adjustedPayoutProjection.matchedCount,
            unmatchedPayoutBatchCount: adjustedPayoutProjection.unmatchedCount
          },
          reviewSummary: {
            ...((payoutResolutionState && payoutResolutionState.reviewSummary) || {}),
            exceptionCount: Math.max(0, Number((payoutResolutionState && payoutResolutionState.reviewSummary && payoutResolutionState.reviewSummary.exceptionCount) || 0) - hiddenManualMatchItemCount),
            payoutBatchMatchCount: adjustedPayoutProjection.matchedCount,
            unmatchedPayoutBatchCount: adjustedPayoutProjection.unmatchedCount
          },
          reviewSections: {
            ...(manualMatchProjection.reviewSections || {})
          },
          manualMatchGroups: manualMatchProjection.groups,
          finalPayoutProjection: adjustedPayoutProjection
        };
        const payoutProjection = getVisiblePayoutProjection(visibleState);
        const expenseReviewBuckets = buildExpenseReviewBuckets(visibleState.reviewSections);
        const visibleExpenseBucketResult = buildVisibleExpenseReviewBuckets(expenseReviewBuckets);
        const visibleExpenseBuckets = visibleExpenseBucketResult.buckets;
        const expenseBucketMap = visibleExpenseBuckets.reduce((map, bucket) => {
          map[bucket.key] = bucket;
          return map;
        }, {});

        preparedFilesSection.setAttribute('data-runtime-phase', phase);
        reviewSummarySection.setAttribute('data-runtime-phase', phase);
        controlDetailSummarySection.setAttribute('data-runtime-phase', phase);
        reportPreviewBody.setAttribute('data-runtime-phase', phase);
  matchedPayoutBatchesSection.setAttribute('data-runtime-phase', phase);
  unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', phase);
  reservationSettlementOverviewSection.setAttribute('data-runtime-phase', phase);
  ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', phase);
        expenseReviewSummarySection.setAttribute('data-runtime-phase', phase);
  expenseMatchedSection.setAttribute('data-runtime-phase', phase);
  expenseReviewSection.setAttribute('data-runtime-phase', phase);
  expenseUnmatchedDocumentsSection.setAttribute('data-runtime-phase', phase);
  expenseUnmatchedOutflowsSection.setAttribute('data-runtime-phase', phase);
  expenseUnmatchedInflowsSection.setAttribute('data-runtime-phase', phase);
        unmatchedReservationsSection.setAttribute('data-runtime-phase', phase);
        exportHandoffSection.setAttribute('data-runtime-phase', phase);
        syncRuntimePayoutDiagnosticsPhase(phase);
        syncRuntimeFileIntakeDiagnosticsPhase(phase);
        syncRuntimePayoutProjectionDebugPhase(phase);
        syncRuntimeWorkspaceMergeDebugPhase(phase);

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
        controlDetailLauncherSummaryContent.innerHTML = buildControlDetailSummaryMarkup(visibleState, phase);
        controlDetailPageSummaryContent.innerHTML = buildControlDetailSummaryMarkup(visibleState, phase);
          controlManualMatchSummary.hidden = false;
          controlManualMatchSummary.innerHTML = buildManualMatchSummaryMarkup('control', visibleState);
        reportPreviewBody.innerHTML = buildReportRowsMarkup(visibleState);
        controlManualMatchedContent.innerHTML = buildManualMatchGroupMarkup('control', visibleState.manualMatchGroups || [], visibleState.reviewSections);
        matchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup(payoutProjection.matchedItems || [], 'control', 'matched');
        unmatchedPayoutBatchesContent.innerHTML = buildPayoutBatchDetailMarkup(payoutProjection.unmatchedItems || [], 'control', 'payoutBatchUnmatched');
        reservationSettlementOverviewContent.innerHTML = buildSettlementOverviewMarkup((visibleState.reviewSections && visibleState.reviewSections.reservationSettlementOverview) || []);
        ancillarySettlementOverviewContent.innerHTML = buildSettlementOverviewMarkup((visibleState.reviewSections && visibleState.reviewSections.ancillarySettlementOverview) || []);
        expenseReviewSummaryContent.innerHTML = buildExpenseReviewSummaryMarkup(expenseReviewBuckets, phase);
        expenseDetailSummaryContent.innerHTML = buildExpenseDetailSummaryMarkup(visibleState, expenseReviewBuckets);
          expenseManualMatchSummary.hidden = false;
          expenseManualMatchSummary.innerHTML = buildManualMatchSummaryMarkup('expense', visibleState);
          expenseManualMatchedContent.innerHTML = buildManualMatchGroupMarkup('expense', visibleState.manualMatchGroups || [], visibleState.reviewSections);
        if (expenseDetailVisibleCount) {
          expenseDetailVisibleCount.textContent = 'Zobrazeno položek: ' + String(visibleExpenseBucketResult.visibleCount);
        }
        syncExpenseDetailControls();
        expenseMatchedContent.innerHTML = buildExpenseReviewSectionMarkup((expenseBucketMap.expenseMatched && expenseBucketMap.expenseMatched.visibleItems) || [], 'Žádné spárované výdaje.', 'expenseMatched');
        expenseReviewContent.innerHTML = buildExpenseReviewSectionMarkup((expenseBucketMap.expenseNeedsReview && expenseBucketMap.expenseNeedsReview.visibleItems) || [], 'Žádné výdaje ke kontrole.', 'expenseNeedsReview');
        expenseUnmatchedDocumentsContent.innerHTML = buildExpenseReviewSectionMarkup((expenseBucketMap.expenseUnmatchedDocuments && expenseBucketMap.expenseUnmatchedDocuments.visibleItems) || [], 'Žádné nespárované doklady.', 'expenseUnmatchedDocuments');
        expenseUnmatchedOutflowsContent.innerHTML = buildExpenseReviewSectionMarkup((expenseBucketMap.expenseUnmatchedOutflows && expenseBucketMap.expenseUnmatchedOutflows.visibleItems) || [], 'Žádné nespárované odchozí platby.', 'expenseUnmatchedOutflows');
        expenseUnmatchedInflowsContent.innerHTML = buildExpenseReviewSectionMarkup((expenseBucketMap.expenseUnmatchedInflows && expenseBucketMap.expenseUnmatchedInflows.visibleItems) || [], 'Žádné nespárované příchozí platby.', 'expenseUnmatchedInflows');
        wireExpenseReviewActionButtons('expenseMatched', (expenseBucketMap.expenseMatched && expenseBucketMap.expenseMatched.visibleItems) || []);
        wireExpenseReviewActionButtons('expenseNeedsReview', (expenseBucketMap.expenseNeedsReview && expenseBucketMap.expenseNeedsReview.visibleItems) || []);
        wireExpenseReviewActionButtons('expenseUnmatchedDocuments', (expenseBucketMap.expenseUnmatchedDocuments && expenseBucketMap.expenseUnmatchedDocuments.visibleItems) || []);
        wireExpenseReviewActionButtons('expenseUnmatchedOutflows', (expenseBucketMap.expenseUnmatchedOutflows && expenseBucketMap.expenseUnmatchedOutflows.visibleItems) || []);
        wireExpenseReviewActionButtons('expenseUnmatchedInflows', (expenseBucketMap.expenseUnmatchedInflows && expenseBucketMap.expenseUnmatchedInflows.visibleItems) || []);
        wireManualMatchSelectionControls('control', [
          { key: 'payoutBatchUnmatched', items: payoutProjection.unmatchedItems || [] },
          { key: 'unmatchedReservationSettlements', items: (visibleState.reviewSections && visibleState.reviewSections.unmatchedReservationSettlements) || [] }
        ]);
        wireManualMatchSelectionControls('expense', [
          { key: 'expenseUnmatchedDocuments', items: (expenseBucketMap.expenseUnmatchedDocuments && expenseBucketMap.expenseUnmatchedDocuments.visibleItems) || [] },
          { key: 'expenseUnmatchedOutflows', items: (expenseBucketMap.expenseUnmatchedOutflows && expenseBucketMap.expenseUnmatchedOutflows.visibleItems) || [] },
          { key: 'expenseUnmatchedInflows', items: (expenseBucketMap.expenseUnmatchedInflows && expenseBucketMap.expenseUnmatchedInflows.visibleItems) || [] }
        ]);
        wireManualMatchSummaryControls('control', visibleState);
        wireManualMatchSummaryControls('expense', visibleState);
        unmatchedReservationsContent.innerHTML = buildUnmatchedReservationDetailsMarkup(visibleState, 'control', 'unmatchedReservationSettlements');
        exportHandoffContent.innerHTML = buildExportMarkup(visibleState);
        wireExportControls();
        wireExpenseDetailControls();
        renderCompletedRuntimePayoutDiagnostics(visibleState);
        renderCompletedRuntimeFileIntakeDiagnostics(visibleState);
        renderCompletedRuntimePayoutProjectionDebug(visibleState);
        const completedWorkspaceRenderDebug = buildWorkspaceRenderDebugState({
          requestToken: currentWorkspaceRenderDebug.requestToken,
          restoreToken: currentWorkspaceRenderDebug.restoreToken,
          restoreSource: currentWorkspaceRenderDebug.restoreSource,
          currentMonthKey: currentWorkspaceMonth || visibleState.monthLabel || '',
          explicitClearResetMarker: currentWorkspaceRenderDebug.explicitClearResetMarker,
          invariantWarning: currentWorkspaceRenderDebug.invariantWarning,
          invariantGuardApplied: currentWorkspaceRenderDebug.invariantGuardApplied,
          fileSelectionEventToken: currentWorkspaceRenderDebug.fileSelectionEventToken,
          incomingBrowserFileListNames: currentWorkspaceRenderDebug.incomingBrowserFileListNames,
          incomingBrowserFileListCount: currentWorkspaceRenderDebug.incomingBrowserFileListCount,
          previousPendingSelectedFileNames: currentWorkspaceRenderDebug.previousPendingSelectedFileNames,
          previousPendingSelectedFileCount: currentWorkspaceRenderDebug.previousPendingSelectedFileCount,
          nextPendingSelectedFileNames: currentWorkspaceRenderDebug.nextPendingSelectedFileNames,
          nextPendingSelectedFileCount: currentWorkspaceRenderDebug.nextPendingSelectedFileCount,
          appendVsReplaceDecision: currentWorkspaceRenderDebug.appendVsReplaceDecision,
          dedupeKeyUsed: currentWorkspaceRenderDebug.dedupeKeyUsed,
          visiblePendingFileNamesBeforeRun: currentWorkspaceRenderDebug.visiblePendingFileNamesBeforeRun,
          visiblePendingFileCountBeforeRun: currentWorkspaceRenderDebug.visiblePendingFileCountBeforeRun,
          selectedFileNamesHandedIntoRunAction: currentWorkspaceRenderDebug.selectedFileNamesHandedIntoRunAction,
          selectedFileCountHandedIntoRunAction: currentWorkspaceRenderDebug.selectedFileCountHandedIntoRunAction,
          selectedFileNames: currentWorkspaceRenderDebug.selectedFileNames,
          persistedWorkspaceFileCountBeforeRerun: currentWorkspaceRenderDebug.persistedWorkspaceFileCountBeforeRerun,
          persistedWorkspaceFileNamesBeforeRerun: currentWorkspaceRenderDebug.persistedWorkspaceFileNamesBeforeRerun,
          selectedBatchFileCount: currentWorkspaceRenderDebug.selectedBatchFileCount,
          mergedFileCountUsedForRerun: currentWorkspaceRenderDebug.mergedFileCountUsedForRerun || (Array.isArray(currentWorkspaceFiles) ? currentWorkspaceFiles.length : 0),
          mergedFileNamesUsedForRerun: currentWorkspaceRenderDebug.mergedFileNamesUsedForRerun.length > 0
            ? currentWorkspaceRenderDebug.mergedFileNamesUsedForRerun
            : buildWorkspaceDebugNamesFromWorkspaceRecords(currentWorkspaceFiles),
          visibleTraceFileCount: buildVisibleTraceFileCountFromState(visibleState),
          visibleTraceFileNamesAfterRender: buildVisibleTraceFileNamesFromState(visibleState),
          renderSource: currentWorkspaceRenderDebug.renderSource || 'mergedWorkspace',
          workspacePersistenceBackend: currentWorkspacePersistenceState.backendName,
          storageKeyUsed: currentWorkspacePersistenceState.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: currentWorkspaceRenderDebug.saveCompletedBeforeRerunInputAssembly,
          lastSaveStatus: currentWorkspacePersistenceState.status || currentWorkspaceRenderDebug.lastSaveStatus,
          carryoverPreviousMonthKeyResolved: currentWorkspaceRenderDebug.carryoverPreviousMonthKeyResolved,
          carryoverPreviousMonthWorkspaceFound: currentWorkspaceRenderDebug.carryoverPreviousMonthWorkspaceFound,
          carryoverPreviousMonthMatchedPayoutBatchCount: currentWorkspaceRenderDebug.carryoverPreviousMonthMatchedPayoutBatchCount,
          carryoverPreviousMonthUnmatchedPayoutBatchCount: currentWorkspaceRenderDebug.carryoverPreviousMonthUnmatchedPayoutBatchCount,
          carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: currentWorkspaceRenderDebug.carryoverPreviousMonthUnmatchedPayoutBatchIdsSample,
          carryoverPreviousMonthUnmatchedOnly: currentWorkspaceRenderDebug.carryoverPreviousMonthUnmatchedOnly,
          carryoverSourceMonth: visibleState.carryoverDebug && visibleState.carryoverDebug.sourceMonthKey,
          carryoverCurrentMonth: visibleState.carryoverDebug && visibleState.carryoverDebug.currentMonthKey,
          carryoverLoadedPayoutBatchCount: Number(visibleState.carryoverDebug && visibleState.carryoverDebug.loadedPayoutBatchCount || 0),
          carryoverLoadedPayoutBatchIdsSample: Array.isArray(visibleState.carryoverDebug && visibleState.carryoverDebug.loadedPayoutBatchKeysSample)
            ? visibleState.carryoverDebug.loadedPayoutBatchKeysSample.slice(0, 5)
            : [],
          carryoverMatchingInputPayoutBatchCount: Number(visibleState.carryoverDebug && visibleState.carryoverDebug.matchingInputPayoutBatchCount || 0),
          carryoverMatchingInputPayoutBatchIdsSample: Array.isArray(visibleState.carryoverDebug && visibleState.carryoverDebug.matchingInputPayoutBatchKeysSample)
            ? visibleState.carryoverDebug.matchingInputPayoutBatchKeysSample.slice(0, 5)
            : [],
          carryoverMatcherCandidateExisted: visibleState.carryoverDebug && visibleState.carryoverDebug.matcherCarryoverCandidateExists ? 'ano' : 'ne',
          carryoverMatcherRejectedReason: String(visibleState.carryoverDebug && visibleState.carryoverDebug.matcherCarryoverRejectedReason || ''),
          carryoverSourceClearMarker: currentWorkspaceRenderDebug.carryoverSourceClearMarker,
          carryoverMatchedCount: Number(visibleState.carryoverDebug && visibleState.carryoverDebug.matchedCount || 0),
          carryoverUnmatchedCount: Number(visibleState.carryoverDebug && visibleState.carryoverDebug.unmatchedCount || 0),
          mergedFileSample: buildWorkspaceDebugSampleFromWorkspaceRecords(currentWorkspaceFiles),
          checkpointLog: currentWorkspaceRenderDebug.checkpointLog
        });
        const completedWorkspaceRenderDebugWithCheckpoint = appendWorkspaceRenderDebugCheckpoint({
          ...completedWorkspaceRenderDebug,
          phase: 'after-render'
        });
        renderCompletedRuntimeWorkspaceMergeDebug(completedWorkspaceRenderDebugWithCheckpoint);
        currentExpenseReviewState = baseVisibleState;
        currentExportVisibleState = visibleState;
        if (phase === 'completed' && currentWorkspaceMonth) {
          void queueCurrentMonthWorkspacePersistence();
        }

        if (runtimeOperatorDebugMode) {
          window.__hotelFinanceLastVisibleRuntimeState = visibleState;
          window.__hotelFinanceLastVisiblePayoutProjection = payoutProjection;
          window.__hotelFinanceLastWorkspaceRenderDebug = completedWorkspaceRenderDebugWithCheckpoint;
          window.__hotelFinanceExpenseReviewOverrides = currentExpenseReviewOverrides.slice();
          window.__hotelFinanceExpenseReviewOverrideStorageKey = buildExpenseReviewOverrideStorageKey(baseVisibleState);
          window.__hotelFinanceManualMatchDebug = {
            setSelectedReviewItemIds(ids) {
              currentSelectedManualMatchItemIds = sanitizeManualMatchSelectionIds(ids);
              currentManualMatchConfirmMode = false;
              currentManualMatchDraftNote = '';
              applyVisibleRuntimeState(currentExpenseReviewState, currentVisibleRuntimePhase);
            },
            extendGroup(groupId) {
              extendManualMatchGroupFromSelection(
                groupId,
                String(currentWorkspaceMonth || baseVisibleState.monthLabel || ''),
                currentExpenseReviewState && currentExpenseReviewState.reviewSections
              );
            }
          };
          window.__hotelFinanceMonthlyWorkspaceState = {
            month: currentWorkspaceMonth,
            fileCount: Array.isArray(currentWorkspaceFiles) ? currentWorkspaceFiles.length : 0
          };
        }
      }

      function renderRunningState(files) {
        preparedFilesSection.setAttribute('data-runtime-phase', 'running');
        reviewSummarySection.setAttribute('data-runtime-phase', 'running');
        controlDetailSummarySection.setAttribute('data-runtime-phase', 'running');
        reportPreviewBody.setAttribute('data-runtime-phase', 'running');
  matchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'running');
  unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'running');
  reservationSettlementOverviewSection.setAttribute('data-runtime-phase', 'running');
  ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', 'running');
        expenseReviewSummarySection.setAttribute('data-runtime-phase', 'running');
  expenseMatchedSection.setAttribute('data-runtime-phase', 'running');
  expenseReviewSection.setAttribute('data-runtime-phase', 'running');
  expenseUnmatchedDocumentsSection.setAttribute('data-runtime-phase', 'running');
  expenseUnmatchedOutflowsSection.setAttribute('data-runtime-phase', 'running');
  expenseUnmatchedInflowsSection.setAttribute('data-runtime-phase', 'running');
        unmatchedReservationsSection.setAttribute('data-runtime-phase', 'running');
        exportHandoffSection.setAttribute('data-runtime-phase', 'running');
        syncRuntimePayoutDiagnosticsPhase('running');
        syncRuntimeFileIntakeDiagnosticsPhase('running');
        syncRuntimePayoutProjectionDebugPhase('running');
        syncRuntimeWorkspaceMergeDebugPhase('running');

        if (runtimeSummaryUploadedFiles) {
          runtimeSummaryUploadedFiles.textContent = String(files.length);
        }
        if (buildFingerprint) {
          buildFingerprint.innerHTML = 'Build: <strong>' + escapeHtml(buildFingerprintVersion) + '</strong> · Renderer: <strong>' + escapeHtml(${JSON.stringify(WEB_DEMO_RENDERER_MARKER)}) + '</strong> · Payout matched: <strong>načítám…</strong> · Payout unmatched: <strong>načítám…</strong>';
        }

        renderRunningWorkflowProgress(files, {
          stage: 'serializing-workspace-files',
          totalFiles: files.length,
          completedFiles: 0
        });
        reviewSummaryContent.innerHTML = '<p class="hint">Kontrolní přehled se teď počítá ze sdíleného browser runtime běhu…</p>';
        controlDetailLauncherSummaryContent.innerHTML = buildControlDetailSummaryMarkup(undefined, 'running');
        controlDetailPageSummaryContent.innerHTML = buildControlDetailSummaryMarkup(undefined, 'running');
        controlManualMatchSummary.hidden = false;
        controlManualMatchSummary.innerHTML = '<p class="hint">Ruční spárování bude dostupné po dokončení běhu.</p>';
        controlManualMatchedContent.innerHTML = '<p class="hint">Ručně spárované groups se načtou po dokončení běhu.</p>';
        reportPreviewBody.innerHTML = '<tr><td colspan="4"><span class="hint">Report preview se právě nahrazuje runtime výsledkem…</span></td></tr>';
  matchedPayoutBatchesContent.innerHTML = '<p class="hint">Spárované payout dávky se právě načítají ze sdíleného runtime běhu…</p>';
  unmatchedPayoutBatchesContent.innerHTML = '<p class="hint">Nespárované payout dávky se právě načítají ze sdíleného runtime běhu…</p>';
        reservationSettlementOverviewContent.innerHTML = '<p class="hint">Přehled hlavních rezervací se právě načítá ze sdíleného runtime běhu…</p>';
        ancillarySettlementOverviewContent.innerHTML = '<p class="hint">Přehled doplňkových položek se právě načítá ze sdíleného runtime běhu…</p>';
        expenseReviewSummaryContent.innerHTML = buildExpenseReviewSummaryMarkup(undefined, 'running');
        expenseDetailSummaryContent.innerHTML = '<p class="hint">Detail výdajů se právě připravuje ze stejného runtime běhu…</p>';
        expenseManualMatchSummary.hidden = false;
        expenseManualMatchSummary.innerHTML = '<p class="hint">Ruční spárování bude dostupné po dokončení běhu.</p>';
        expenseManualMatchedContent.innerHTML = '<p class="hint">Ručně spárované groups se načtou po dokončení běhu.</p>';
        if (expenseDetailVisibleCount) {
          expenseDetailVisibleCount.textContent = 'Zobrazeno položek: 0';
        }
        syncExpenseDetailControls();
        expenseMatchedContent.innerHTML = '<p class="hint">Spárované výdaje se právě načítají ze sdíleného runtime běhu…</p>';
        expenseReviewContent.innerHTML = '<p class="hint">Výdaje ke kontrole se právě načítají ze sdíleného runtime běhu…</p>';
        expenseUnmatchedDocumentsContent.innerHTML = '<p class="hint">Nespárované doklady se právě načítají ze sdíleného runtime běhu…</p>';
        expenseUnmatchedOutflowsContent.innerHTML = '<p class="hint">Nespárované odchozí platby se právě načítají ze sdíleného runtime běhu…</p>';
        expenseUnmatchedInflowsContent.innerHTML = '<p class="hint">Nespárované příchozí platby se právě načítají ze sdíleného runtime běhu…</p>';
        unmatchedReservationsContent.innerHTML = '<p class="hint">Detail nespárovaných rezervací se právě načítá ze sdíleného runtime běhu…</p>';
        exportHandoffContent.innerHTML = '<p class="hint">Exportní handoff se právě připravuje ze stejného runtime výsledku…</p>';
        renderRunningRuntimePayoutDiagnostics();
        renderRunningRuntimeFileIntakeDiagnostics();
        renderRunningRuntimePayoutProjectionDebug();
        renderRunningRuntimeWorkspaceMergeDebug(currentWorkspaceRenderDebug);
        currentLaterMonthCarryoverResolutionState = buildLaterMonthCarryoverResolutionState();
        currentExportVisibleState = initialRuntimeState;
      }

      function renderFailedState(error) {
        const message = escapeHtml(error instanceof Error ? error.message : String(error));

        preparedFilesSection.setAttribute('data-runtime-phase', 'failed');
        reviewSummarySection.setAttribute('data-runtime-phase', 'failed');
        controlDetailSummarySection.setAttribute('data-runtime-phase', 'failed');
        reportPreviewBody.setAttribute('data-runtime-phase', 'failed');
  matchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'failed');
  unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'failed');
  reservationSettlementOverviewSection.setAttribute('data-runtime-phase', 'failed');
  ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', 'failed');
        expenseReviewSummarySection.setAttribute('data-runtime-phase', 'failed');
  expenseMatchedSection.setAttribute('data-runtime-phase', 'failed');
  expenseReviewSection.setAttribute('data-runtime-phase', 'failed');
  expenseUnmatchedDocumentsSection.setAttribute('data-runtime-phase', 'failed');
  expenseUnmatchedOutflowsSection.setAttribute('data-runtime-phase', 'failed');
  expenseUnmatchedInflowsSection.setAttribute('data-runtime-phase', 'failed');
        unmatchedReservationsSection.setAttribute('data-runtime-phase', 'failed');
        exportHandoffSection.setAttribute('data-runtime-phase', 'failed');
        syncRuntimePayoutDiagnosticsPhase('failed');
        syncRuntimeFileIntakeDiagnosticsPhase('failed');
        syncRuntimePayoutProjectionDebugPhase('failed');
        syncRuntimeWorkspaceMergeDebugPhase('failed');

        preparedFilesContent.innerHTML = '<p><strong>Runtime běh selhal.</strong></p><p class="hint">Viditelné sekce nebylo možné aktualizovat, protože sdílený browser runtime skončil chybou.</p>';
        reviewSummaryContent.innerHTML = '<p class="hint">Chyba runtime běhu: ' + message + '</p>';
        controlDetailLauncherSummaryContent.innerHTML = buildControlDetailSummaryMarkup(undefined, 'failed');
        controlDetailPageSummaryContent.innerHTML = buildControlDetailSummaryMarkup(undefined, 'failed');
        controlManualMatchSummary.hidden = false;
        controlManualMatchSummary.innerHTML = '<p class="hint">Ruční spárování není k dispozici, protože runtime běh selhal.</p>';
        controlManualMatchedContent.innerHTML = '<p class="hint">Ručně spárované groups nejsou k dispozici, protože runtime běh selhal.</p>';
        reportPreviewBody.innerHTML = '<tr><td colspan="4"><span class="hint">Runtime běh selhal: ' + message + '</span></td></tr>';
  matchedPayoutBatchesContent.innerHTML = '<p class="hint">Spárované payout dávky nejsou k dispozici, protože runtime běh selhal.</p>';
  unmatchedPayoutBatchesContent.innerHTML = '<p class="hint">Nespárované payout dávky nejsou k dispozici, protože runtime běh selhal.</p>';
        reservationSettlementOverviewContent.innerHTML = '<p class="hint">Přehled hlavních rezervací není k dispozici, protože runtime běh selhal.</p>';
        ancillarySettlementOverviewContent.innerHTML = '<p class="hint">Přehled doplňkových položek není k dispozici, protože runtime běh selhal.</p>';
        expenseReviewSummaryContent.innerHTML = buildExpenseReviewSummaryMarkup(undefined, 'failed');
        expenseDetailSummaryContent.innerHTML = '<p class="hint">Detail výdajů není k dispozici, protože runtime běh selhal.</p>';
        expenseManualMatchSummary.hidden = false;
        expenseManualMatchSummary.innerHTML = '<p class="hint">Ruční spárování není k dispozici, protože runtime běh selhal.</p>';
        expenseManualMatchedContent.innerHTML = '<p class="hint">Ručně spárované groups nejsou k dispozici, protože runtime běh selhal.</p>';
        if (expenseDetailVisibleCount) {
          expenseDetailVisibleCount.textContent = 'Zobrazeno položek: 0';
        }
        syncExpenseDetailControls();
        expenseMatchedContent.innerHTML = '<p class="hint">Spárované výdaje nejsou k dispozici, protože runtime běh selhal.</p>';
        expenseReviewContent.innerHTML = '<p class="hint">Výdaje ke kontrole nejsou k dispozici, protože runtime běh selhal.</p>';
        expenseUnmatchedDocumentsContent.innerHTML = '<p class="hint">Nespárované doklady nejsou k dispozici, protože runtime běh selhal.</p>';
        expenseUnmatchedOutflowsContent.innerHTML = '<p class="hint">Nespárované odchozí platby nejsou k dispozici, protože runtime běh selhal.</p>';
        expenseUnmatchedInflowsContent.innerHTML = '<p class="hint">Nespárované příchozí platby nejsou k dispozici, protože runtime běh selhal.</p>';
        unmatchedReservationsContent.innerHTML = '<p class="hint">Detail nespárovaných rezervací není k dispozici, protože runtime běh selhal.</p>';
        exportHandoffContent.innerHTML = '<p class="hint">Exportní handoff není k dispozici, protože runtime běh selhal.</p>';
        renderFailedRuntimePayoutDiagnostics();
        renderFailedRuntimeFileIntakeDiagnostics();
        renderFailedRuntimePayoutProjectionDebug();
        renderFailedRuntimeWorkspaceMergeDebug(currentWorkspaceRenderDebug);
        currentExportVisibleState = initialRuntimeState;
        if (buildFingerprint) {
          buildFingerprint.innerHTML = 'Build: <strong>' + escapeHtml(buildFingerprintVersion) + '</strong> · Renderer: <strong>' + escapeHtml(${JSON.stringify(WEB_DEMO_RENDERER_MARKER)}) + '</strong> · Payout matched: <strong>chyba</strong> · Payout unmatched: <strong>chyba</strong>';
        }
      }

      function renderInitialVisibleState() {
        preparedFilesSection.setAttribute('data-runtime-phase', 'placeholder');
        reviewSummarySection.setAttribute('data-runtime-phase', 'placeholder');
        controlDetailSummarySection.setAttribute('data-runtime-phase', 'placeholder');
        reportPreviewBody.setAttribute('data-runtime-phase', 'placeholder');
        matchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'placeholder');
        unmatchedPayoutBatchesSection.setAttribute('data-runtime-phase', 'placeholder');
        reservationSettlementOverviewSection.setAttribute('data-runtime-phase', 'placeholder');
        ancillarySettlementOverviewSection.setAttribute('data-runtime-phase', 'placeholder');
        expenseReviewSummarySection.setAttribute('data-runtime-phase', 'placeholder');
        expenseMatchedSection.setAttribute('data-runtime-phase', 'placeholder');
        expenseReviewSection.setAttribute('data-runtime-phase', 'placeholder');
        expenseUnmatchedDocumentsSection.setAttribute('data-runtime-phase', 'placeholder');
        expenseUnmatchedOutflowsSection.setAttribute('data-runtime-phase', 'placeholder');
        expenseUnmatchedInflowsSection.setAttribute('data-runtime-phase', 'placeholder');
        unmatchedReservationsSection.setAttribute('data-runtime-phase', 'placeholder');
        exportHandoffSection.setAttribute('data-runtime-phase', 'placeholder');
        syncRuntimePayoutDiagnosticsPhase('placeholder');
        syncRuntimeFileIntakeDiagnosticsPhase('placeholder');
        syncRuntimePayoutProjectionDebugPhase('placeholder');
        syncRuntimeWorkspaceMergeDebugPhase('placeholder');

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
        controlDetailLauncherSummaryContent.innerHTML = buildControlDetailSummaryMarkup(undefined, 'placeholder');
        controlDetailPageSummaryContent.innerHTML = buildControlDetailSummaryMarkup(undefined, 'placeholder');
        controlManualMatchSummary.hidden = false;
        controlManualMatchSummary.innerHTML = '<p class="hint">Vyberte checkboxem nespárované položky, které mají tvořit jednu ruční match group.</p>';
        controlManualMatchedContent.innerHTML = '<p class="hint">Po spuštění se zde objeví ruční match groups vytvořené z nespárovaných položek.</p>';
        reportPreviewBody.innerHTML = '<tr><td colspan="4"><span class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek pro náhled reportu.</span></td></tr>';
        matchedPayoutBatchesContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro spárované payout dávky.</p>';
        unmatchedPayoutBatchesContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro nespárované payout dávky.</p>';
        reservationSettlementOverviewContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro hlavní rezervace.</p>';
        ancillarySettlementOverviewContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro doplňkové položky.</p>';
        expenseReviewSummaryContent.innerHTML = buildExpenseReviewSummaryMarkup(undefined, 'placeholder');
        expenseDetailSummaryContent.innerHTML = '<p class="hint">Po spuštění se zde zobrazí souhrnné počty pro doklady a odchozí bankovní platby.</p>';
        expenseManualMatchSummary.hidden = false;
        expenseManualMatchSummary.innerHTML = '<p class="hint">Vyberte checkboxem nespárované položky, které mají tvořit jednu ruční match group.</p>';
        expenseManualMatchedContent.innerHTML = '<p class="hint">Po spuštění se zde objeví ruční match groups vytvořené z nespárovaných položek.</p>';
        if (expenseDetailVisibleCount) {
          expenseDetailVisibleCount.textContent = 'Zobrazeno položek: 0';
        }
        syncExpenseDetailControls();
        expenseMatchedContent.innerHTML = '<p class="hint">Po spuštění se zde zobrazí spárované výdaje.</p>';
        expenseReviewContent.innerHTML = '<p class="hint">Po spuštění se zde zobrazí výdaje ke kontrole.</p>';
        expenseUnmatchedDocumentsContent.innerHTML = '<p class="hint">Po spuštění se zde zobrazí nespárované doklady.</p>';
        expenseUnmatchedOutflowsContent.innerHTML = '<p class="hint">Po spuštění se zde zobrazí nespárované odchozí platby.</p>';
        expenseUnmatchedInflowsContent.innerHTML = '<p class="hint">Po spuštění se zde zobrazí nespárované příchozí platby.</p>';
        unmatchedReservationsContent.innerHTML = '<p class="hint">Zatím nebyl spuštěn žádný uploadovaný runtime běh pro nespárované rezervace.</p>';
        exportHandoffContent.innerHTML = '<p class="hint">Zatím není k dispozici žádný uploadovaný runtime výsledek pro exportní handoff.</p><p class="hint">Exporty vzniknou až ze skutečně spuštěného běhu nad vybranými soubory.</p>';
        renderInitialRuntimePayoutDiagnostics();
        renderInitialRuntimeFileIntakeDiagnostics();
        renderInitialRuntimePayoutProjectionDebug();
        setWorkspaceRenderDebugState({});
        renderInitialRuntimeWorkspaceMergeDebug();
        currentExpenseReviewState = initialRuntimeState;
        currentExportVisibleState = initialRuntimeState;
        currentExpenseReviewOverrides = [];
        currentManualMatchGroups = [];
        currentSelectedManualMatchItemIds = [];
        currentManualMatchDraftNote = '';
        currentManualMatchConfirmMode = false;
        currentVisibleRuntimePhase = 'placeholder';
      }

      async function startMainWorkflow() {
        const requestToken = ++currentWorkspaceViewRequestToken;
        const normalizedMonth = String(monthInput && monthInput.value || '');
        currentClearedWorkspaceMonth = normalizedMonth === currentClearedWorkspaceMonth ? '' : currentClearedWorkspaceMonth;
        if (normalizedMonth) {
          clearWorkspaceDeletionMarker(normalizedMonth);
        }
        const files = normalizedMonth && currentPendingSelectedMonthKey === normalizedMonth && currentPendingSelectedFiles.length > 0
          ? currentPendingSelectedFiles.slice()
          : Array.from(fileInput.files || []);
        const selectedFileNames = buildWorkspaceDebugNamesFromRuntimeFiles(files);
        appendWorkspaceRenderDebugCheckpoint({
          phase: 'run-action-handoff',
          requestToken,
          explicitClearResetMarker: currentExplicitSelectionResetMarker,
          invariantWarning: currentSelectionInvariantWarning,
          invariantGuardApplied: currentSelectionInvariantGuardApplied,
          fileSelectionEventToken: currentFileSelectionEventToken,
          incomingBrowserFileListNames: currentWorkspaceRenderDebug.incomingBrowserFileListNames,
          incomingBrowserFileListCount: currentWorkspaceRenderDebug.incomingBrowserFileListCount,
          previousPendingSelectedFileNames: currentWorkspaceRenderDebug.previousPendingSelectedFileNames,
          previousPendingSelectedFileCount: currentWorkspaceRenderDebug.previousPendingSelectedFileCount,
          nextPendingSelectedFileNames: currentWorkspaceRenderDebug.nextPendingSelectedFileNames,
          nextPendingSelectedFileCount: currentWorkspaceRenderDebug.nextPendingSelectedFileCount,
          appendVsReplaceDecision: currentWorkspaceRenderDebug.appendVsReplaceDecision,
          dedupeKeyUsed: currentWorkspaceRenderDebug.dedupeKeyUsed,
          visiblePendingFileNamesBeforeRun: currentPendingSelectedFileNames.slice(),
          visiblePendingFileCountBeforeRun: currentPendingSelectedFileNames.length,
          selectedFileNamesHandedIntoRunAction: selectedFileNames,
          selectedFileCountHandedIntoRunAction: files.length,
          currentMonthKey: normalizedMonth,
          renderSource: 'selectedFiles',
          workspacePersistenceBackend: currentWorkspaceRenderDebug.workspacePersistenceBackend,
          storageKeyUsed: currentWorkspaceRenderDebug.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: currentWorkspaceRenderDebug.saveCompletedBeforeRerunInputAssembly
        });
        const persistenceStateBeforeRerun = await awaitCurrentWorkspacePersistence();

        if (requestToken !== currentWorkspaceViewRequestToken) {
          return;
        }

        const loadedWorkspace = await loadMonthWorkspace(normalizedMonth);

        if (requestToken !== currentWorkspaceViewRequestToken) {
          return;
        }

        const existingWorkspace = loadedWorkspace && loadedWorkspace.workspace;
        const loadState = loadedWorkspace && loadedWorkspace.loadState
          ? loadedWorkspace.loadState
          : persistenceStateBeforeRerun;
        const previousMonthKey = resolvePreviousMonthKey(normalizedMonth);
        const previousMonthLoadedWorkspace = previousMonthKey
          ? await loadMonthWorkspace(previousMonthKey, { silent: true })
          : undefined;
        const restoredPreviousMonthWorkspace = previousMonthKey && currentWorkspaceMonth === previousMonthKey && currentExpenseReviewState
          ? {
            month: previousMonthKey,
            files: Array.isArray(currentWorkspaceFiles) ? currentWorkspaceFiles.slice() : [],
            runtimeState: currentExpenseReviewState
          }
          : undefined;
        const previousMonthDirectWorkspace = previousMonthLoadedWorkspace && previousMonthLoadedWorkspace.workspace
          ? previousMonthLoadedWorkspace.workspace
          : previousMonthKey
            ? getLegacyMonthWorkspaceFromStore(loadMonthlyWorkspaceStore(), previousMonthKey)
            : undefined;
        const carryoverWorkspaceInspection = inspectPreviousMonthCarryoverWorkspace(
          restoredPreviousMonthWorkspace || previousMonthDirectWorkspace,
          normalizedMonth
        );
        const previousMonthCarryoverSource = carryoverWorkspaceInspection.source;
        const persistedWorkspaceFileNames = buildWorkspaceDebugNamesFromWorkspaceRecords(existingWorkspace && existingWorkspace.files);
        runtimeOutput.innerHTML = '<p class="hint">Spouštím browser/local workflow nad právě zvolenými soubory…</p>';

        if (files.length === 0) {
          if (existingWorkspace && existingWorkspace.runtimeState) {
            await restoreWorkspaceForMonth(normalizedMonth, { preserveCurrentView: false });
            return;
          }

          runtimeOutput.innerHTML = '<p class="hint">Nejprve vyberte alespoň jeden soubor nebo se vraťte k měsíci, který už má uložený workspace.</p>';
          return;
        }

        runtimeStageCopy.innerHTML = 'Stav stránky: <strong>běh právě probíhá</strong>. Původní ukázkový snapshot se teď nahrazuje skutečným výsledkem vybraných souborů.';
        const runningWorkspacePreviewFiles = buildRunningWorkflowFilesFromMonthWorkspace(existingWorkspace && existingWorkspace.files, files);
        appendWorkspaceRenderDebugCheckpoint({
          phase: 'before-merge',
          requestToken,
          currentMonthKey: normalizedMonth,
          selectedFileNames,
          persistedWorkspaceFileCountBeforeRerun: Array.isArray(existingWorkspace && existingWorkspace.files) ? existingWorkspace.files.length : 0,
          persistedWorkspaceFileNamesBeforeRerun: persistedWorkspaceFileNames,
          selectedBatchFileCount: files.length,
          mergedFileCountUsedForRerun: runningWorkspacePreviewFiles.length,
          mergedFileNamesUsedForRerun: buildWorkspaceDebugNamesFromRuntimeFiles(runningWorkspacePreviewFiles),
          visibleTraceFileCount: runningWorkspacePreviewFiles.length,
          visibleTraceFileNamesAfterRender: buildWorkspaceDebugNamesFromRuntimeFiles(runningWorkspacePreviewFiles),
          renderSource: Array.isArray(existingWorkspace && existingWorkspace.files) && existingWorkspace.files.length > 0 ? 'mergedWorkspace' : 'selectedFiles',
          workspacePersistenceBackend: loadState.backendName,
          storageKeyUsed: loadState.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: loadState.saveCompletedBeforeRerunInputAssembly,
          lastSaveStatus: currentWorkspacePersistenceState.status,
          carryoverPreviousMonthKeyResolved: carryoverWorkspaceInspection.previousMonthKey,
          carryoverPreviousMonthWorkspaceFound: carryoverWorkspaceInspection.previousMonthWorkspaceFound,
          carryoverPreviousMonthMatchedPayoutBatchCount: carryoverWorkspaceInspection.previousMonthMatchedPayoutBatchCount,
          carryoverPreviousMonthUnmatchedPayoutBatchCount: carryoverWorkspaceInspection.previousMonthUnmatchedPayoutBatchCount,
          carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: carryoverWorkspaceInspection.previousMonthUnmatchedPayoutBatchIdsSample,
          carryoverPreviousMonthUnmatchedOnly: carryoverWorkspaceInspection.previousMonthUnmatchedOnly,
          carryoverSourceMonth: previousMonthCarryoverSource && previousMonthCarryoverSource.sourceMonthKey,
          carryoverCurrentMonth: normalizedMonth,
          carryoverLoadedPayoutBatchCount: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.length : 0,
          carryoverLoadedPayoutBatchIdsSample: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.map((item) => item.payoutBatchKey).slice(0, 5) : [],
          carryoverMatchingInputPayoutBatchCount: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.length : 0,
          carryoverMatchingInputPayoutBatchIdsSample: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.map((item) => item.payoutBatchKey).slice(0, 5) : [],
          carryoverMatcherCandidateExisted: 'ne',
          carryoverMatcherRejectedReason: '',
          carryoverSourceClearMarker: carryoverWorkspaceInspection.clearMarker,
          carryoverMatchedCount: 0,
          carryoverUnmatchedCount: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.length : 0,
          mergedFileSample: buildWorkspaceDebugSampleFromRuntimeFiles(runningWorkspacePreviewFiles)
        });
        renderRunningState(runningWorkspacePreviewFiles);

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
          const serializedFiles = await serializeSelectedFilesForWorkspace(files, (progress) => {
            renderRunningWorkflowProgress(runningWorkspacePreviewFiles, progress);
          });

          if (requestToken !== currentWorkspaceViewRequestToken) {
            return;
          }

          const mergedWorkspaceFiles = mergeWorkspaceFiles(existingWorkspace && existingWorkspace.files, serializedFiles);
          const mergedRunningWorkflowFiles = buildRunningWorkflowFilesFromWorkspaceRecords(mergedWorkspaceFiles);
          appendWorkspaceRenderDebugCheckpoint({
            phase: 'after-merge',
            requestToken,
            currentMonthKey: normalizedMonth,
            selectedFileNames,
            persistedWorkspaceFileCountBeforeRerun: Array.isArray(existingWorkspace && existingWorkspace.files) ? existingWorkspace.files.length : 0,
            persistedWorkspaceFileNamesBeforeRerun: persistedWorkspaceFileNames,
            selectedBatchFileCount: files.length,
            mergedFileCountUsedForRerun: mergedWorkspaceFiles.length,
            mergedFileNamesUsedForRerun: buildWorkspaceDebugNamesFromWorkspaceRecords(mergedWorkspaceFiles),
            visibleTraceFileCount: mergedRunningWorkflowFiles.length,
            visibleTraceFileNamesAfterRender: buildWorkspaceDebugNamesFromRuntimeFiles(mergedRunningWorkflowFiles),
            renderSource: Array.isArray(existingWorkspace && existingWorkspace.files) && existingWorkspace.files.length > 0 ? 'mergedWorkspace' : 'selectedFiles',
            workspacePersistenceBackend: loadState.backendName,
            storageKeyUsed: loadState.storageKeyUsed,
            saveCompletedBeforeRerunInputAssembly: loadState.saveCompletedBeforeRerunInputAssembly,
            lastSaveStatus: currentWorkspacePersistenceState.status,
            carryoverPreviousMonthKeyResolved: carryoverWorkspaceInspection.previousMonthKey,
            carryoverPreviousMonthWorkspaceFound: carryoverWorkspaceInspection.previousMonthWorkspaceFound,
            carryoverPreviousMonthMatchedPayoutBatchCount: carryoverWorkspaceInspection.previousMonthMatchedPayoutBatchCount,
            carryoverPreviousMonthUnmatchedPayoutBatchCount: carryoverWorkspaceInspection.previousMonthUnmatchedPayoutBatchCount,
            carryoverPreviousMonthUnmatchedPayoutBatchIdsSample: carryoverWorkspaceInspection.previousMonthUnmatchedPayoutBatchIdsSample,
            carryoverPreviousMonthUnmatchedOnly: carryoverWorkspaceInspection.previousMonthUnmatchedOnly,
            carryoverSourceMonth: previousMonthCarryoverSource && previousMonthCarryoverSource.sourceMonthKey,
            carryoverCurrentMonth: normalizedMonth,
            carryoverLoadedPayoutBatchCount: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.length : 0,
            carryoverLoadedPayoutBatchIdsSample: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.map((item) => item.payoutBatchKey).slice(0, 5) : [],
            carryoverMatchingInputPayoutBatchCount: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.length : 0,
            carryoverMatchingInputPayoutBatchIdsSample: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.map((item) => item.payoutBatchKey).slice(0, 5) : [],
            carryoverMatcherCandidateExisted: 'ne',
            carryoverMatcherRejectedReason: '',
            carryoverSourceClearMarker: carryoverWorkspaceInspection.clearMarker,
            carryoverMatchedCount: 0,
            carryoverUnmatchedCount: previousMonthCarryoverSource ? previousMonthCarryoverSource.payoutBatches.length : 0,
            mergedFileSample: buildWorkspaceDebugSampleFromWorkspaceRecords(mergedWorkspaceFiles)
          });
          renderRunningRuntimeWorkspaceMergeDebug(currentWorkspaceRenderDebug);
          const state = await browserRuntime.buildRuntimeState({
            files: mergedWorkspaceFiles.map((record) => buildRuntimeFileFromWorkspaceRecord(record)),
            month: normalizedMonth,
            generatedAt,
            previousMonthCarryoverSource,
            onProgress(progress) {
              renderRunningWorkflowProgress(mergedRunningWorkflowFiles, progress);
            }
          });

          if (requestToken !== currentWorkspaceViewRequestToken) {
            return;
          }

          currentLaterMonthCarryoverResolutionState = shouldLoadLaterMonthCarryoverResolution(state, normalizedMonth)
            ? await loadLaterMonthCarryoverResolutionState(normalizedMonth)
            : buildLaterMonthCarryoverResolutionState({ sourceMonthKey: normalizedMonth });

          const visibleState = buildCompletedVisibleRuntimeState(state);
          currentWorkspaceMonth = normalizedMonth;
          currentWorkspaceFiles = mergedWorkspaceFiles;
          currentExpenseReviewOverrides = sanitizeExpenseReviewOverridesForStorage(existingWorkspace && existingWorkspace.expenseReviewOverrides);
          currentManualMatchGroups = sanitizeManualMatchGroupsForStorage(existingWorkspace && existingWorkspace.manualMatchGroups);
          currentSelectedManualMatchItemIds = [];
          currentManualMatchDraftNote = '';
          currentManualMatchConfirmMode = false;
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

      function resolveOperatorViewFromHash() {
        const hash = String((window && window.location && window.location.hash) || '');

        if (hash === '#detail-kontrolnich-sekci') {
          return 'control-detail';
        }

        if (hash === '#kontrola-vydaju-a-dokladu') {
          return 'expense-detail';
        }

        return 'main-overview';
      }

      function openMonthPicker() {
        if (!monthInput) {
          return;
        }

        if (typeof monthInput.showPicker === 'function') {
          try {
            monthInput.showPicker();
            return;
          } catch {
          }
        }

        if (typeof monthInput.focus === 'function') {
          monthInput.focus();
        }

        if (typeof monthInput.click === 'function') {
          monthInput.click();
        }
      }

      button.addEventListener('click', () => {
        void startMainWorkflow();
      });
      monthPickerTriggerButton.addEventListener('click', () => {
        openMonthPicker();
      });
      fileInput.addEventListener('change', () => {
        handleSelectedFilesInputChange();
      });
      monthInput.addEventListener('change', () => {
        const normalizedMonth = String(monthInput && monthInput.value || '');

        if (normalizedMonth !== currentPendingSelectedMonthKey) {
          resetPendingSelectedFiles('month-change-reset', normalizedMonth);
        }

        if (!normalizedMonth) {
          renderInitialVisibleState();
          runtimeOutput.innerHTML = '<p class="hint">Měsíční workflow zatím neběželo. Výsledek se zobrazí až po výběru skutečných souborů a spuštění uploadu.</p>';
          return;
        }

        window.__hotelFinanceLastWorkspaceRestorePromise = restoreWorkspaceForMonth(normalizedMonth, { preserveCurrentView: false });
      });
      clearMonthWorkspaceButton.addEventListener('click', () => {
        window.__hotelFinanceLastWorkspaceClearPromise = (async () => {
        await awaitCurrentWorkspacePersistence();
        currentWorkspaceViewRequestToken += 1;
        const normalizedMonth = String(monthInput && monthInput.value || '');

        if (!normalizedMonth) {
          runtimeOutput.innerHTML = '<p class="hint">Nejprve vyberte měsíc, který chcete vymazat.</p>';
          return;
        }

        const confirmationMessage = 'Opravdu chcete smazat uložený workspace pro měsíc ' + normalizedMonth + '?';
        if (typeof window.confirm === 'function' && !window.confirm(confirmationMessage)) {
          return;
        }

        if (!(await clearMonthWorkspace(normalizedMonth))) {
          runtimeOutput.innerHTML = '<p class="hint">Pro měsíc <strong>' + escapeHtml(normalizedMonth) + '</strong> zatím není uložený žádný workspace k vymazání.</p>';
          return;
        }

        currentClearedWorkspaceMonth = normalizedMonth;
        currentWorkspaceMonth = normalizedMonth;
        currentWorkspaceFiles = [];
        const previousPendingSelectedFileNames = currentPendingSelectedFileNames.slice();
        const previousPendingSelectedFileCount = previousPendingSelectedFileNames.length;
        resetPendingSelectedFiles('explicit-clear', normalizedMonth);
        currentExpenseReviewOverrides = [];
        currentManualMatchGroups = [];
        currentSelectedManualMatchItemIds = [];
        currentManualMatchDraftNote = '';
        currentManualMatchConfirmMode = false;
        renderInitialVisibleState();
        appendWorkspaceRenderDebugCheckpoint({
          phase: 'explicit-clear-reset',
          requestToken: currentWorkspaceViewRequestToken,
          currentMonthKey: normalizedMonth,
          explicitClearResetMarker: currentExplicitSelectionResetMarker,
          invariantWarning: currentSelectionInvariantWarning,
          invariantGuardApplied: currentSelectionInvariantGuardApplied,
          previousPendingSelectedFileNames,
          previousPendingSelectedFileCount,
          nextPendingSelectedFileNames: [],
          nextPendingSelectedFileCount: 0,
          visiblePendingFileNamesBeforeRun: [],
          visiblePendingFileCountBeforeRun: 0,
          selectedFileNamesHandedIntoRunAction: [],
          selectedFileCountHandedIntoRunAction: 0,
          renderSource: 'persistedWorkspace',
          workspacePersistenceBackend: currentWorkspaceRenderDebug.workspacePersistenceBackend,
          storageKeyUsed: currentWorkspaceRenderDebug.storageKeyUsed,
          saveCompletedBeforeRerunInputAssembly: currentWorkspaceRenderDebug.saveCompletedBeforeRerunInputAssembly
        });
        await clearMonthWorkspace(normalizedMonth);
        renderCompletedRuntimeWorkspaceMergeDebug(currentWorkspaceRenderDebug);
        runtimeOutput.innerHTML = '<p class="hint">Workspace pro měsíc <strong>' + escapeHtml(normalizedMonth) + '</strong> byl vymazán. Ostatní měsíce zůstaly beze změny.</p>';
        showOperatorView('main-overview');
        })();
      });
      openControlDetailButton.addEventListener('click', () => {
        showOperatorView('control-detail');
      });
      openExpenseReviewButton.addEventListener('click', () => {
        showOperatorView('expense-detail');
      });
      backFromControlDetailButton.addEventListener('click', () => {
        showOperatorView('main-overview');
      });
      backFromExpenseDetailButton.addEventListener('click', () => {
        showOperatorView('main-overview');
      });

      renderInitialVisibleState();
      showOperatorView(resolveOperatorViewFromHash());
      const initialWorkspaceStore = loadMonthlyWorkspaceStore();

      if (initialWorkspaceStore.lastUsedMonth) {
        monthInput.value = initialWorkspaceStore.lastUsedMonth;
        window.__hotelFinanceInitialWorkspaceRestorePromise = restoreWorkspaceForMonth(initialWorkspaceStore.lastUsedMonth, { preserveCurrentView: true });
      } else {
        window.__hotelFinanceInitialWorkspaceRestorePromise = Promise.resolve(false);
      }
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
