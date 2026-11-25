import { type Browser, chromium, type Page } from 'playwright';

/**
 * ATS-Proof PDF Engine (blueprint: "ATS-Proof PDF Generation Rules").
 *
 * Uses a managed local Chromium (Google Chrome, or the bundled Playwright Chromium) so every byte
 * is produced by a real engine with Chromium's accessibility tree — guaranteeing tagged PDF/UA,
 * PDF outline bookmarks, correct text extraction, and native PDF metadata. A singleton process is
 * pooled (lazy), one isolated BrowserContext per export, closed in a finally block, and recycled
 * after 50 exports or 15 minutes idle (blueprint).
 */

let browser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;
let exportsSinceRecycle = 0;
const MAX_EXPORTS_PER_BROWSER = 50;
const BROWSER_IDLE_MS = 15 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const CDP_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'];

async function acquireBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      // Google Chrome first (already on user machines), then the Playwright-managed Chromium.
      for (const [channel, useSystemDefault] of [
        ['chrome', true],
        [undefined, false],
      ] as const) {
        try {
          browser = await chromium.launch({
            channel,
            args: useSystemDefault ? CDP_ARGS : CDP_ARGS,
            headless: true,
          });
          return browser;
        } catch {
          browser = null;
          // continue to next candidate
        }
      }
      browserPromise = null;
      throw new Error('No usable Chromium found (Google Chrome, or the Playwright-managed build).');
    })();
  }
  return browserPromise;
}

/** Render semantic ATS-safe HTML to a tagged, outline-enabled PDF via a fresh, isolated context. */
export async function htmlToAtsPdf(html: string): Promise<Buffer> {
  if (exportsSinceRecycle >= MAX_EXPORTS_PER_BROWSER) await recycleBrowser();
  if (idleTimer) clearTimeout(idleTimer);

  const b = await acquireBrowser();
  const context = await b.newContext();
  const page: Page = await context.newPage();
  try {
    await page.goto('about:blank');
    await page.setContent(html, { waitUntil: 'load' });
    // Chromium snapshots the Blink accessibility tree during printing; ensure fonts are settled first.
    await page.evaluate('document.fonts ? document.fonts.ready : Promise.resolve()');
    await page.waitForLoadState('load');
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

async function recycleBrowser(): Promise<void> {
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

export { recycleBrowser as recyclePdfEngine };
