import { type Browser, chromium, type Page } from 'playwright';
import type { ResolvedVariantPayload } from './types.js';

let browser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;
let exportsSinceRecycle = 0;
const MAX_EXPORTS_PER_BROWSER = 50;
const BROWSER_IDLE_MS = 15 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const CDP_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'];

export async function acquireBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      for (const channel of ['chrome', undefined] as const) {
        try {
          browser = await chromium.launch({
            channel,
            args: CDP_ARGS,
            headless: true,
          });
          return browser;
        } catch {
          browser = null;
        }
      }
      browserPromise = null;
      throw new Error('No usable Chromium found (Google Chrome or Playwright Chromium build).');
    })();
  }
  return browserPromise;
}

export async function recycleBrowser(): Promise<void> {
  exportsSinceRecycle = 0;
  if (idleTimer) clearTimeout(idleTimer);
  if (!browser) return;
  const b = browser;
  browser = null;
  browserPromise = null;
  try {
    await b.close();
  } catch {
    /* ignore */
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds semantic, ATS-proof HTML with mandatory ligature kill-switch and single-column flow.
 */
export function buildResumeHtml(payload: ResolvedVariantPayload): string {
  const title = payload.fullName || payload.name || 'Resume';
  const pageFormat = payload.pageFormat === 'A4' ? 'a4' : 'letter';

  const contactPieces = [payload.email, payload.phone, payload.location, ...(payload.links ?? [])].filter(
    (v): v is string => Boolean(v && v.trim()),
  );

  const experience = payload.entries.filter((e) => e.entryType === 'experience');
  const projects = payload.entries.filter((e) => e.entryType === 'project');
  const education = payload.entries.filter((e) => e.entryType === 'education');
  const certifications = payload.entries.filter((e) => e.entryType === 'certification');

  const renderSection = (heading: string, entries: typeof payload.entries) => {
    if (entries.length === 0) return '';
    return `
      <section class="resume-section">
        <h2>${escapeHtml(heading)}</h2>
        ${entries
          .map(
            (e) => `
          <div class="resume-entry">
            <div class="entry-header">
              <span class="entry-title">${escapeHtml(e.title)}</span> · <span class="entry-org">${escapeHtml(e.organization)}</span>
              ${
                e.location || e.startDate || e.endDate || e.isCurrent
                  ? ` <span class="entry-dates">(${[
                      e.location,
                      e.startDate
                        ? e.isCurrent
                          ? `${e.startDate} – Present`
                          : e.endDate
                            ? `${e.startDate} – ${e.endDate}`
                            : e.startDate
                        : e.isCurrent
                          ? 'Present'
                          : (e.endDate ?? null),
                    ]
                      .filter(Boolean)
                      .map((s) => escapeHtml(String(s)))
                      .join(' · ')})</span>`
                  : ''
              }
            </div>
            ${
              e.bullets.length > 0
                ? `<ul>
              ${e.bullets.map((b) => `<li>${escapeHtml(b.text)}</li>`).join('\n')}
            </ul>`
                : ''
            }
          </div>
        `,
          )
          .join('\n')}
      </section>
    `;
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="author" content="${escapeHtml(title)}" />
  <meta name="description" content="Resume for ${escapeHtml(title)}" />
  <title>${escapeHtml(title)}</title>
  <style>
    /* CSS Ligature Kill-Switch & Layout Invariants (ATS Engine Standard) */
    *, *::before, *::after {
      font-variant-ligatures: none !important;
      -webkit-font-variant-ligatures: none !important;
      font-feature-settings: "liga" 0, "clig" 0, "dlig" 0, "hlig" 0, "calt" 0 !important;
      text-rendering: geometricPrecision !important;
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
    }

    .page {
      width: 100%;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.75in;
      background: #ffffff;
    }

    h1 {
      font-size: 18pt;
      font-weight: 700;
      margin: 0 0 4pt 0;
      break-after: avoid !important;
    }

    .contact-line {
      font-size: 9pt;
      color: #374151;
      margin: 0 0 14pt 0;
      break-after: avoid !important;
    }

    .summary {
      margin: 0 0 12pt 0;
      font-size: 9.5pt;
      break-inside: avoid !important;
    }

    .resume-section {
      margin-top: 12pt;
    }

    h2 {
      font-size: 11pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #111827;
      padding-bottom: 2pt;
      margin: 0 0 6pt 0;
      break-after: avoid !important;
    }

    .resume-entry {
      margin-bottom: 8pt;
    }

    .entry-header {
      font-size: 10pt;
      break-after: avoid !important;
      break-inside: avoid !important;
    }

    .entry-title {
      font-weight: 700;
    }

    .entry-org {
      font-weight: 600;
    }

    .entry-dates {
      color: #4b5563;
      font-size: 9pt;
    }

    ul {
      margin: 3pt 0 6pt 0;
      padding-left: 16pt;
    }

    li {
      margin-bottom: 2pt;
      break-inside: avoid !important;
    }

    @page {
      size: ${pageFormat};
      margin: 0.75in;
    }

    @media print {
      body { background: #fff; }
      .page { padding: 0; }
      h1, h2 { break-after: avoid !important; }
      .entry-header { break-after: avoid !important; break-inside: avoid !important; }
      li { break-inside: avoid !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>${escapeHtml(title)}</h1>
    ${contactPieces.length > 0 ? `<div class="contact-line">${contactPieces.map(escapeHtml).join(' · ')}</div>` : ''}
    ${payload.summary ? `<div class="summary"><p>${escapeHtml(payload.summary)}</p></div>` : ''}
    ${
      payload.skills && payload.skills.length > 0
        ? `<section class="resume-section"><h2>Core Skills</h2><p>${payload.skills.map(escapeHtml).join(' · ')}</p></section>`
        : ''
    }
    ${renderSection('Professional Experience', experience)}
    ${renderSection('Projects & Achievements', projects)}
    ${renderSection('Education', education)}
    ${renderSection('Certifications', certifications)}
    ${
      payload.languages && payload.languages.length > 0
        ? `<section class="resume-section"><h2>Languages</h2><p>${payload.languages.map(escapeHtml).join(' · ')}</p></section>`
        : ''
    }
  </div>
</body>
</html>`;
}

/**
 * Exports a resolved resume variant payload into an ATS-proof tagged PDF buffer.
 */
export async function exportVariantPdf(payload: ResolvedVariantPayload): Promise<Buffer> {
  if (exportsSinceRecycle >= MAX_EXPORTS_PER_BROWSER) await recycleBrowser();
  if (idleTimer) clearTimeout(idleTimer);

  const html = buildResumeHtml(payload);
  const b = await acquireBrowser();
  const context = await b.newContext();
  const page: Page = await context.newPage();

  try {
    await page.goto('about:blank');
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate('document.fonts ? document.fonts.ready : Promise.resolve()');

    const bytes = await page.pdf({
      tagged: true,
      outline: true,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });

    exportsSinceRecycle += 1;
    return Buffer.from(bytes);
  } finally {
    await context.close();
    idleTimer = setTimeout(() => void recycleBrowser(), BROWSER_IDLE_MS);
    idleTimer.unref?.();
  }
}
