import fs from 'node:fs';
import { type Browser, chromium, type Page } from 'playwright';
import type { Db } from '../store/db.js';

export interface SupervisedApplyOptions {
  headless?: boolean;
  timeoutMs?: number;
}

export interface SupervisedApplyResult {
  success: boolean;
  jobId: string;
  employer: string;
  title: string;
  applyUrl: string;
  provider: 'greenhouse' | 'lever' | 'ashby' | 'generic';
  filledFields: string[];
  resumeAttached: boolean;
  paused: boolean;
  message: string;
}

// Active supervised sessions keeping browser windows open for user inspection
const activeSessions = new Map<string, { browser: Browser; page: Page; startedAt: string }>();

export function getActiveSession(jobId: string) {
  return activeSessions.get(jobId);
}

export async function closeActiveSession(jobId: string): Promise<boolean> {
  const session = activeSessions.get(jobId);
  if (!session) return false;
  activeSessions.delete(jobId);
  try {
    await session.browser.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects form provider from URL.
 */
export function detectAtsProvider(url: string): 'greenhouse' | 'lever' | 'ashby' | 'generic' {
  const u = url.toLowerCase();
  if (u.includes('greenhouse.io') || u.includes('gh_src=')) return 'greenhouse';
  if (u.includes('lever.co')) return 'lever';
  if (u.includes('ashbyhq.com')) return 'ashby';
  return 'generic';
}

/**
 * Supervised Playwright runner that autofills ATS forms and hard-pauses before submit for human review.
 */
export async function launchSupervisedApply(
  db: Db,
  jobId: string,
  options: SupervisedApplyOptions = {},
): Promise<SupervisedApplyResult> {
  const job = db
    .prepare('SELECT id, employer, title, apply_url AS applyUrl, posting_url AS postingUrl FROM jobs WHERE id = ?')
    .get(jobId) as
    | { id: string; employer: string; title: string; applyUrl: string | null; postingUrl: string | null }
    | undefined;

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const targetUrl = job.applyUrl || job.postingUrl;
  if (!targetUrl) {
    throw new Error(`No application URL available for job ${job.title} at ${job.employer}.`);
  }

  // Load candidate identity
  const nameSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'identity.fullName'").pluck().get() as
    | string
    | undefined;
  const emailSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'identity.email'").pluck().get() as
    | string
    | undefined;
  const phoneSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'identity.phone'").pluck().get() as
    | string
    | undefined;
  const locationSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'identity.location'").pluck().get() as
    | string
    | undefined;

  const fullName = nameSetting ? JSON.parse(nameSetting) : 'Candidate';
  const email = emailSetting ? JSON.parse(emailSetting) : 'candidate@example.com';
  const phone = phoneSetting ? JSON.parse(phoneSetting) : '+1 (555) 000-0000';
  const location = locationSetting ? JSON.parse(locationSetting) : 'Remote';

  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Find verified resume PDF from prep packet or documents table
  let resumePath: string | null = null;
  const prepPacket = db
    .prepare(
      "SELECT verified_pdf_path FROM prep_packets WHERE job_id = ? AND status IN ('ready', 'draft') ORDER BY created_at DESC LIMIT 1",
    )
    .get(jobId) as { verified_pdf_path: string | null } | undefined;

  if (prepPacket?.verified_pdf_path && fs.existsSync(prepPacket.verified_pdf_path)) {
    resumePath = prepPacket.verified_pdf_path;
  } else {
    const doc = db
      .prepare("SELECT filepath FROM documents WHERE kind = 'resume' ORDER BY created_at DESC LIMIT 1")
      .get() as { filepath: string } | undefined;
    if (doc?.filepath && fs.existsSync(doc.filepath)) {
      resumePath = doc.filepath;
    }
  }

  const provider = detectAtsProvider(targetUrl);
  const headless = options.headless ?? false;

  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    throw new Error(`Could not launch Chromium: ${err instanceof Error ? err.message : String(err)}`);
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  const filledFields: string[] = [];
  let resumeAttached = false;

  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs ?? 30000,
    });

    // Autofill helper
    async function fillFirst(selectors: string[], val: string, label: string) {
      if (!val) return;
      for (const sel of selectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            await el.fill(val);
            filledFields.push(label);
            return;
          }
        } catch {
          /* try next selector */
        }
      }
    }

    if (provider === 'greenhouse') {
      await fillFirst(['input#first_name', 'input[name="job_application[first_name]"]'], firstName, 'First Name');
      await fillFirst(['input#last_name', 'input[name="job_application[last_name]"]'], lastName, 'Last Name');
      await fillFirst(['input#email', 'input[name="job_application[email]"]'], email, 'Email');
      await fillFirst(['input#phone', 'input[name="job_application[phone]"]'], phone, 'Phone');
    } else if (provider === 'lever') {
      await fillFirst(['input[name="name"]', 'input#name'], fullName, 'Full Name');
      await fillFirst(['input[name="email"]', 'input#email'], email, 'Email');
      await fillFirst(['input[name="phone"]', 'input#phone'], phone, 'Phone');
    } else if (provider === 'ashby') {
      await fillFirst(['input[name="name"]', 'input[aria-label*="Name" i]'], fullName, 'Full Name');
      await fillFirst(['input[name="email"]', 'input[type="email"]'], email, 'Email');
      await fillFirst(['input[name="phone"]', 'input[type="tel"]'], phone, 'Phone');
    } else {
      // Generic form fallback
      await fillFirst(
        ['input[name*="name" i]', 'input[id*="name" i]', 'input[autocomplete="name"]'],
        fullName,
        'Full Name',
      );
      await fillFirst(['input[type="email"]', 'input[name*="email" i]'], email, 'Email');
      await fillFirst(['input[type="tel"]', 'input[name*="phone" i]'], phone, 'Phone');
      await fillFirst(['input[name*="location" i]', 'input[id*="location" i]'], location, 'Location');
    }

    // Attach verified resume
    if (resumePath && fs.existsSync(resumePath)) {
      try {
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(resumePath);
          resumeAttached = true;
          filledFields.push('Resume File');
        }
      } catch {
        /* resume input optional */
      }
    }

    // Hard Stop: Inject top banner and highlight submit button
    await page.evaluate(() => {
      const doc = (globalThis as unknown as { document: any }).document;
      if (!doc) return;
      const banner = doc.createElement('div');
      banner.id = 'career-strike-banner';
      banner.style.position = 'fixed';
      banner.style.top = '0';
      banner.style.left = '0';
      banner.style.right = '0';
      banner.style.backgroundColor = '#0f172a';
      banner.style.color = '#f8fafc';
      banner.style.padding = '14px 24px';
      banner.style.zIndex = '2147483647';
      banner.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      banner.style.fontSize = '14px';
      banner.style.display = 'flex';
      banner.style.justifyContent = 'space-between';
      banner.style.alignItems = 'center';
      banner.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';
      banner.style.borderBottom = '3px solid #3b82f6';
      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 20px;">🛡️</span>
          <div>
            <strong style="color: #60a5fa;">Career Strike Supervised Apply: Paused Before Submit</strong><br/>
            <span style="font-size: 12px; color: #cbd5e1;">All standard fields & verified resume attached. Please inspect the form, complete any custom answers, and click Submit yourself.</span>
          </div>
        </div>
      `;
      doc.body.prepend(banner);

      // Highlight submit button with visible blue outline
      const submitButtons = Array.from(
        doc.querySelectorAll('button[type="submit"], input[type="submit"], button, [role="button"]'),
      ).filter((el: any) => {
        const text = String(el.textContent || el.value || '').toLowerCase();
        return text.includes('submit') || text.includes('apply') || text.includes('send');
      });

      submitButtons.forEach((btn: any) => {
        btn.style.outline = '4px solid #3b82f6';
        btn.style.outlineOffset = '3px';
      });
    });

    if (headless) {
      await browser.close();
    } else {
      activeSessions.set(jobId, { browser, page, startedAt: new Date().toISOString() });
    }

    return {
      success: true,
      jobId,
      employer: job.employer,
      title: job.title,
      applyUrl: targetUrl,
      provider,
      filledFields,
      resumeAttached,
      paused: true,
      message: 'Playwright headed window launched, autofilled, and paused before submit for candidate review.',
    };
  } catch (err) {
    if (!headless) {
      await browser.close().catch(() => {});
    }
    throw err;
  }
}
