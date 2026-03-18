import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface BuildUploadWebFlowOptions {
  generatedAt?: string
  outputPath?: string
}

export interface UploadWebFlowResult {
  html: string
  generatedAt: string
  outputPath?: string
}

export function buildUploadWebFlow(options: BuildUploadWebFlowOptions = {}): UploadWebFlowResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const html = renderUploadWebFlowHtml(generatedAt)

  if (options.outputPath) {
    const resolved = resolve(options.outputPath)
    mkdirSync(dirname(resolved), { recursive: true })
    writeFileSync(resolved, html, 'utf8')

    return {
      html,
      generatedAt,
      outputPath: resolved
    }
  }

  return {
    html,
    generatedAt
  }
}

export function renderUploadWebFlowHtml(generatedAt: string): string {
  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hotel Finance Control – Nahrání měsíčních souborů</title>
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
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #eaf2ff;
        color: #174ea6;
        font-size: 12px;
        font-weight: 600;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-weight: 700;
      }
      input[type="file"] {
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
      ul {
        padding-left: 20px;
      }
      .hint {
        color: #52627a;
        font-size: 14px;
      }
      .summary {
        background: #f7f9fc;
        border-radius: 14px;
        padding: 16px;
        min-height: 120px;
      }
      .summary.empty {
        color: #6a7891;
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
        <span class="pill">Místní upload</span>
        <h1>Hotel Finance Control – nahrání měsíčních souborů</h1>
        <p>Tato první verze umožňuje nahrát skutečné měsíční soubory přímo v prohlížeči, zkontrolovat jejich přehled a připravit je pro další deterministické zpracování.</p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(generatedAt)}</p>
      </section>

      <section class="card">
        <h2>1. Vyberte soubory za měsíc</h2>
        <div class="grid">
          <div>
            <label for="monthly-files">Soubory k nahrání</label>
            <input id="monthly-files" type="file" multiple />
            <p class="hint">Podporované vstupy v dalších krocích: bankovní výpisy, OTA exporty, Comgate, faktury a účtenky.</p>
          </div>
          <div>
            <label for="month-label">Označení měsíce</label>
            <input id="month-label" type="month" />
            <p class="hint">Např. <code>2026-03</code> pro březen 2026.</p>
          </div>
        </div>
        <p>
          <button id="prepare-upload" type="button">Připravit soubory ke zpracování</button>
        </p>
      </section>

      <section class="card">
        <h2>2. Přehled připravených souborů</h2>
        <div id="upload-summary" class="summary empty">Zatím nebyly vybrány žádné soubory.</div>
      </section>

      <section class="card">
        <h2>Co bude následovat</h2>
        <ul>
          <li>V dalším kroku budou nahrané soubory napojeny do existujícího pipeline <code>monthly-batch</code> a <code>extraction</code>.</li>
          <li>Následně přibude prohlížečová kontrolní obrazovka pro spárované, nespárované a podezřelé položky.</li>
          <li>Tato verze zůstává čistě lokální a bez backendu, aby byl tok souborů snadno auditovatelný.</li>
        </ul>
      </section>
    </main>

    <script>
      const fileInput = document.getElementById('monthly-files');
      const monthInput = document.getElementById('month-label');
      const button = document.getElementById('prepare-upload');
      const summary = document.getElementById('upload-summary');

      function renderSummary() {
        const files = Array.from(fileInput.files || []);
        const month = monthInput.value || 'neuvedeno';

        if (files.length === 0) {
          summary.className = 'summary empty';
          summary.textContent = 'Zatím nebyly vybrány žádné soubory.';
          return;
        }

        summary.className = 'summary';
        summary.innerHTML = [
          '<strong>Měsíc:</strong> ' + escapeHtml(month),
          '<br /><strong>Počet souborů:</strong> ' + files.length,
          '<ul>' + files.map((file) => '<li><strong>' + escapeHtml(file.name) + '</strong> — ' + file.size + ' B</li>').join('') + '</ul>',
          '<p class="hint">Soubory jsou připravené pro další deterministické napojení do importu a extrakce.</p>'
        ].join('');
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      button.addEventListener('click', renderSummary);
      fileInput.addEventListener('change', renderSummary);
      monthInput.addEventListener('change', renderSummary);
    </script>
  </body>
</html>
`
}

export function placeholder() {
  return {
    name: 'upload-web',
    mode: 'local-static',
    buildUploadWebFlow
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}