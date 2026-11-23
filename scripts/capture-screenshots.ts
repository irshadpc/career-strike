import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { syncBoard } from '../src/career/jobs.js';
import type { NormalizedPosting } from '../src/sources/types.js';
import { openDb } from '../src/store/db.js';

const CLI = path.resolve('dist/cli/index.js');
const SCREENSHOT_DIR = path.resolve('docs/assets/screenshots');
const SYNTHETIC_PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n'),
  Buffer.from('synthetic resume candidate Jordan Vance'),
]);

class TestServer {
  port = 0;
  token = '';
  private proc: ChildProcess | null = null;

  constructor(readonly home: string) {}

  static async start(): Promise<TestServer> {
    const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cs-screenshots-')), 'data');
    const srv = new TestServer(home);
    await srv.startProcess();
    return srv;
  }

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      NODE_ENV: 'test',
      PLAYWRIGHT_TEST: '1',
      CAREER_STRIKE_HOME: this.home,
      CAREER_STRIKE_SECRET_STORE: 'file',
      CAREER_STRIKE_RELEASES_URL: 'http://127.0.0.1:9/releases',
    };
  }

  private async startProcess(): Promise<void> {
    const proc = spawn(process.execPath, [CLI, 'serve', '--port', '0'], {
      env: this.env(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const listening = new Promise<void>((resolve, reject) => {
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        if (text.includes('ERROR') || text.includes('error')) console.log('[SERVER LOG]', text);
        if (/listening on http:\/\/127\.0\.0\.1:\d+/.test(output)) resolve();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        console.error('[SERVER STDERR]', chunk.toString());
      });
      proc.once('exit', (code) => reject(new Error(`service exited (${code}): ${output}`)));
    });
    await listening;
    this.proc = proc;
    const runtime = JSON.parse(fs.readFileSync(path.join(this.home, 'service.json'), 'utf8')) as {
      port: number;
      token: string;
    };
    this.port = runtime.port;
    this.token = runtime.token;
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    if (proc.exitCode === null) {
      proc.kill('SIGTERM');
      await once(proc, 'exit');
    }
  }

  async launchUrl(): Promise<string> {
    const res = await fetch(`${this.origin}/api/session/launch-token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}` },
    });
    const { token } = (await res.json()) as { token: string };
    return `${this.origin}/auth/launch?t=${token}`;
  }

  async api(method: string, url: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${this.origin}${url}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  seed(source: 'greenhouse' | 'lever' | 'ashby', board: string, postings: Partial<NormalizedPosting>[]): void {
    const db = openDb(path.join(this.home, 'career-strike.db'));
    try {
      syncBoard(
        db,
        source,
        board,
        postings.map((p, i) => ({
          source,
          board,
          sourceJobId: `${board}-${i + 1}`,
          employer: p.employer ?? 'Tech Innovations',
          title: p.title ?? `Software Engineer ${i + 1}`,
          locationText: p.locationText ?? 'Remote - US / Global',
          remotePolicy: p.remotePolicy ?? 'remote',
          employmentType: p.employmentType ?? 'full_time',
          department: p.department ?? 'Engineering',
          salary: p.salary ?? null,
          description: p.description ?? [
            { type: 'heading', text: 'About the role' },
            { type: 'paragraph', text: 'We build high-performance systems.' },
          ],
          applyUrl: p.applyUrl ?? `https://careers.example.com/${board}/${i + 1}`,
          postingUrl: p.postingUrl ?? `https://careers.example.com/${board}/${i + 1}`,
          publishedAt: new Date(Date.now() - i * 3600000 * 12).toISOString(),
          unresolved: [],
          ...p,
        })),
        new Date(),
      );
    } finally {
      db.close();
    }
  }
}

async function seedCandidateData(srv: TestServer): Promise<string[]> {
  // 1. Settings / Identity
  const identitySettings: [string, string][] = [
    ['identity.fullName', 'Jordan Vance'],
    ['identity.headline', 'Staff Systems Architect · Distributed Systems & Cloud Infrastructure'],
    [
      'identity.about',
      'Staff systems architect with 11+ years leading core infrastructure platforms, multi-region event streaming, and zero-trust developer environments. Proven track record scaling core storage engines and real-time pipelines to millions of transactions.',
    ],
    ['identity.email', 'jordan.vance@example.com'],
    ['identity.phone', '+1 (555) 019-2834'],
    ['identity.location', 'San Francisco, CA (Open to Remote / Relocation)'],
    ['identity.github', 'https://github.com/jordanvance-example'],
    ['identity.linkedin', 'https://www.linkedin.com/in/jordan-vance-example'],
    ['identity.portfolio', 'https://jordanvance.example.com'],
    ['mobility.remote', 'true'],
    ['mobility.relocation', 'true'],
    ['mobility.targetCountries', '["US","DE","SG","GB","NL"]'],
  ];

  for (const [key, value] of identitySettings) {
    await srv.api('PUT', `/api/settings/${key}`, { value });
  }

  // 2. Profile Facts
  const roles = [
    { title: 'Staff Systems Architect', employer: 'Syntropy Cloud', startYear: 2021, endYear: null },
    { title: 'Senior Distributed Systems Engineer', employer: 'Vertex Data Systems', startYear: 2018, endYear: 2021 },
    { title: 'Backend Infrastructure Engineer', employer: 'Acuity Systems', startYear: 2014, endYear: 2018 },
  ];
  for (const r of roles) {
    await srv.api('POST', '/api/profile/facts', { kind: 'role', value: r });
  }

  const skills = [
    { name: 'Distributed Systems', years: 10, level: 'expert' },
    { name: 'Kubernetes', years: 6, level: 'expert' },
    { name: 'Go', years: 8, level: 'expert' },
    { name: 'Rust', years: 4, level: 'advanced' },
    { name: 'Kafka', years: 7, level: 'expert' },
    { name: 'PostgreSQL', years: 10, level: 'expert' },
    { name: 'SQLite', years: 8, level: 'expert' },
    { name: 'gRPC', years: 6, level: 'expert' },
    { name: 'Cloud Architecture', years: 8, level: 'expert' },
  ];
  for (const s of skills) {
    await srv.api('POST', '/api/profile/facts', { kind: 'skill', value: s });
  }

  const evidence = [
    {
      name: 'Global Event Streaming Fabric',
      summary:
        'Architected multi-region Kafka event streaming fabric processing 250k events/sec with p99 latency < 12ms and zero data loss.',
      skills: ['Distributed Systems', 'Kafka', 'Go'],
    },
    {
      name: 'Zero-Trust Service Mesh',
      summary:
        'Designed and deployed Kubernetes mTLS service mesh across 45 clusters reducing blast radius and securing internal RPC traffic.',
      skills: ['Kubernetes', 'gRPC', 'Rust'],
    },
  ];
  for (const e of evidence) {
    await srv.api('POST', '/api/profile/evidence', { kind: 'project', value: e });
  }

  // 3. Document upload
  await fetch(`${srv.origin}/api/documents`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${srv.token}`,
      'content-type': 'application/pdf',
      'x-cs-filename': 'Jordan-Vance-Resume.pdf',
      'x-cs-document-kind': 'resume',
    },
    body: SYNTHETIC_PDF,
  });

  // 4. Seed Jobs
  srv.seed('ashby', 'datadog', [
    {
      employer: 'Datadog',
      title: 'Staff Distributed Systems Engineer',
      locationText: 'Remote - Global',
      remotePolicy: 'remote',
      department: 'Infrastructure & Core Storage',
      salary: { currency: 'USD', min: 220000, max: 275000, interval: 'year', source: 'structured' },
      applyUrl: 'https://jobs.ashbyhq.com/datadog/staff-systems',
      postingUrl: 'https://jobs.ashbyhq.com/datadog/staff-systems',
      description: [
        { type: 'heading', text: 'The Role' },
        {
          type: 'paragraph',
          text: 'We are seeking a Staff Distributed Systems Engineer to scale our telemetry storage engine and high-throughput ingestion pipelines.',
        },
        { type: 'heading', text: 'Requirements' },
        { type: 'item', text: 'Deep expertise in Distributed Systems, Go, and low-latency storage engines.' },
        { type: 'item', text: 'Experience running multi-cluster Kubernetes and Kafka topologies.' },
      ],
    },
  ]);

  srv.seed('greenhouse', 'stripe', [
    {
      employer: 'Stripe',
      title: 'Principal Platform Architect',
      locationText: 'Remote - US / Canada',
      remotePolicy: 'remote',
      department: 'Platform Foundations',
      salary: { currency: 'USD', min: 240000, max: 290000, interval: 'year', source: 'structured' },
      applyUrl: 'https://boards.greenhouse.io/stripe/jobs/platform-architect',
      postingUrl: 'https://boards.greenhouse.io/stripe/jobs/platform-architect',
      description: [
        { type: 'heading', text: 'Role Overview' },
        {
          type: 'paragraph',
          text: 'Lead the architecture of our core developer execution environment and global service mesh.',
        },
        { type: 'heading', text: 'Qualifications' },
        { type: 'item', text: '10+ years architecting mission-critical cloud infrastructure.' },
        { type: 'item', text: 'Experience with Kubernetes, zero-trust network boundaries, and Go/Rust.' },
      ],
    },
  ]);

  srv.seed('lever', 'figma', [
    {
      employer: 'Figma',
      title: 'Senior Cloud Infrastructure Engineer',
      locationText: 'San Francisco, CA / Remote',
      remotePolicy: 'hybrid',
      department: 'Core Infrastructure',
      salary: { currency: 'USD', min: 210000, max: 250000, interval: 'year', source: 'structured' },
      applyUrl: 'https://jobs.lever.co/figma/cloud-infra',
      postingUrl: 'https://jobs.lever.co/figma/cloud-infra',
      description: [
        { type: 'heading', text: 'About the Opportunity' },
        {
          type: 'paragraph',
          text: 'Scale Figma multiplayer state synchronization infrastructure and observability stack.',
        },
        { type: 'heading', text: 'What We Value' },
        { type: 'item', text: 'Track record in Kubernetes, Terraform, and cloud reliability engineering.' },
      ],
    },
  ]);

  srv.seed('lever', 'vercel', [
    {
      employer: 'Vercel',
      title: 'Lead Reliability Engineer',
      locationText: 'Remote - Worldwide',
      remotePolicy: 'remote',
      department: 'Edge Infrastructure',
      salary: { currency: 'USD', min: 215000, max: 260000, interval: 'year', source: 'structured' },
      applyUrl: 'https://jobs.lever.co/vercel/lead-sre',
      postingUrl: 'https://jobs.lever.co/vercel/lead-sre',
      description: [
        { type: 'heading', text: 'What you will do' },
        { type: 'paragraph', text: 'Ensure global edge routing reliability and zero-downtime serverless delivery.' },
      ],
    },
  ]);

  srv.seed('ashby', 'canva', [
    {
      employer: 'Canva',
      title: 'Staff Data Platform Engineer',
      locationText: 'Remote - Singapore / Sydney',
      remotePolicy: 'remote',
      department: 'Data Platform',
      salary: { currency: 'AUD', min: 230000, max: 270000, interval: 'year', source: 'structured' },
      applyUrl: 'https://jobs.ashbyhq.com/canva/staff-data-platform',
      postingUrl: 'https://jobs.ashbyhq.com/canva/staff-data-platform',
      description: [
        { type: 'heading', text: 'Mission' },
        { type: 'paragraph', text: 'Architect petabyte-scale distributed data stream processing engines.' },
      ],
    },
  ]);

  srv.seed('lever', 'enterprise', [
    {
      employer: 'Enterprise Cloud Global',
      title: 'Principal Cloud Engineer',
      locationText: 'San Francisco, CA (Hybrid)',
      remotePolicy: 'hybrid',
      department: 'Cloud Systems',
      salary: { currency: 'USD', min: 210000, max: 240000, interval: 'year', source: 'structured' },
      applyUrl: 'https://enterprise.wd1.myworkdayjobs.com/careers/job/Principal-Cloud-Engineer',
      postingUrl: 'https://enterprise.wd1.myworkdayjobs.com/careers/job/Principal-Cloud-Engineer',
      description: [
        { type: 'heading', text: 'Overview' },
        { type: 'paragraph', text: 'Lead enterprise cloud transformations and migration initiatives.' },
      ],
    },
  ]);

  // Get job IDs
  const jobsRes = await srv.api('GET', '/api/jobs');
  const jobsBody = jobsRes.body as { jobs?: { id: string; employer: string }[] };
  const jobsList = jobsBody?.jobs ?? [];
  const jobMap = new Map(jobsList.map((j) => [j.employer, j.id]));
  const workdayJobId = jobMap.get('Enterprise Cloud Global')!;

  // 5. Populate Master Vault in SQLite for Resume Studio
  const dbStudio = openDb(path.join(srv.home, 'career-strike.db'));
  try {
    dbStudio
      .prepare(`
      INSERT OR REPLACE INTO master_entries (id, entry_type, organization, title, location, start_date, end_date, is_current, sort_order)
      VALUES
        ('entry_1', 'experience', 'Syntropy Cloud', 'Staff Systems Architect', 'San Francisco, CA / Remote', '2021-03', NULL, 1, 1),
        ('entry_2', 'experience', 'Vertex Data Systems', 'Senior Distributed Systems Engineer', 'Seattle, WA', '2018-05', '2021-02', 0, 2),
        ('entry_3', 'experience', 'Acuity Systems', 'Backend Infrastructure Engineer', 'San Francisco, CA', '2014-06', '2018-04', 0, 3)
    `)
      .run();

    dbStudio
      .prepare(`
      INSERT OR REPLACE INTO master_bullets (id, entry_id, raw_text, verified_metrics_json, canonical_skill_ids_json, scope_level, xyz_score)
      VALUES
        ('b_1', 'entry_1', 'Architected multi-region Kafka streaming fabric processing 250k events/sec with sub-12ms p99 latency.', '["250k events/sec","<12ms p99"]', '["Distributed Systems","Kafka","Go"]', 'org', 96),
        ('b_2', 'entry_1', 'Standardized zero-trust mTLS infrastructure across 45 production Kubernetes clusters, achieving 99.999% RPC uptime.', '["45 clusters","99.999% uptime"]', '["Kubernetes","Rust","gRPC"]', 'org', 94),
        ('b_3', 'entry_2', 'Redesigned core partitioned storage tier, cutting query tail latency by 68% and saving $420,000 annually in infrastructure spend.', '["68% reduction","$420k/yr saved"]', '["PostgreSQL","Go"]', 'team', 95),
        ('b_4', 'entry_3', 'Built automated cluster provisioning pipelines reducing deployment lead time from 4 days to 18 minutes.', '["4 days to 18 min"]', '["Cloud Architecture","Kubernetes"]', 'team', 91)
    `)
      .run();

    // 6. Answer Vault
    const nowIso = new Date().toISOString();
    dbStudio
      .prepare(`
      INSERT OR REPLACE INTO answer_vault (id, question_key, question_label, answer_value, answer_type, is_default, updated_at)
      VALUES
        ('ans_1', 'eu_work_auth', 'Are you legally authorized to work in the EU?', 'Yes, hold EU Blue Card with permanent residency status', 'text', 1, ?),
        ('ans_2', 'us_work_auth', 'Are you legally authorized to work in the United States?', 'Yes, authorized to work for any employer without sponsorship', 'text', 1, ?),
        ('ans_3', 'notice_period', 'What is your current notice period?', '30 days standard notice period', 'text', 1, ?),
        ('ans_4', 'relocation', 'Are you open to relocation or remote?', 'Open to full remote, or relocation to Germany or Singapore', 'text', 1, ?)
    `)
      .run(nowIso, nowIso, nowIso, nowIso);

    // 7. Applications in various pipeline stages for Kanban
    const stripeJob = jobMap.get('Stripe')!;
    const figmaJob = jobMap.get('Figma')!;
    const datadogJob = jobMap.get('Datadog')!;
    const vercelJob = jobMap.get('Vercel')!;
    const canvaJob = jobMap.get('Canva')!;

    dbStudio
      .prepare(`
      INSERT OR REPLACE INTO applications (id, job_id, state, mode, current_version, created_at, updated_at)
      VALUES
        ('app_stripe', ?, 'READY_FOR_REVIEW', 'assisted', 1, datetime('now', '-2 days'), datetime('now', '-1 hour')),
        ('app_figma', ?, 'DRAFTED', 'assisted', 1, datetime('now', '-3 days'), datetime('now', '-4 hours')),
        ('app_datadog', ?, 'APPROVED', 'assisted', 1, datetime('now', '-1 day'), datetime('now', '-2 hours')),
        ('app_vercel', ?, 'SUBMITTED_CONFIRMED', 'automated', 1, datetime('now', '-4 days'), datetime('now', '-1 day')),
        ('app_canva', ?, 'INTERVIEW', 'assisted', 1, datetime('now', '-7 days'), datetime('now', '-3 days'))
    `)
      .run(stripeJob, figmaJob, datadogJob, vercelJob, canvaJob);

    // 8. Autopilot Queue Items & Receipts
    const receiptCanva = JSON.stringify({
      fieldsFilled: 14,
      resumeSnapshotId: 'snap_canva_v1',
      atsProvider: 'ashby',
      companyName: 'Canva',
      jobTitle: 'Staff Data Platform Engineer',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      verifiedPdfAttached: true,
      trackedAs: 'Applied',
    });

    const receiptVercel = JSON.stringify({
      fieldsFilled: 12,
      resumeSnapshotId: 'snap_vercel_v1',
      atsProvider: 'lever',
      companyName: 'Vercel',
      jobTitle: 'Lead Reliability Engineer',
      timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
      verifiedPdfAttached: true,
      trackedAs: 'Applied',
    });

    const pendingFigmaQuestion = JSON.stringify({
      questionKey: 'earliest_start_date',
      questionLabel: 'What is your earliest available start date?',
      answerType: 'select',
      options: ['Immediately', '2 weeks notice', '30 days notice', 'More than 30 days'],
      placeholder: 'Select start availability',
    });

    dbStudio
      .prepare(`
      INSERT OR REPLACE INTO autopilot_queue (
        id, job_id, company_name, ats_provider, status,
        fields_filled_count, fields_total_count, pending_question_json,
        resume_snapshot_id, receipt_json, sent_at, created_at
      ) VALUES
        ('aq_ready', ?, 'Datadog', 'ashby', 'ready_to_submit', 8, 8, NULL, 'snap_datadog_verified', NULL, NULL, datetime('now', '-30 minutes')),
        ('aq_fill', ?, 'Stripe', 'greenhouse', 'filling', 6, 8, NULL, 'snap_stripe_draft', NULL, NULL, datetime('now', '-15 minutes')),
        ('aq_need', ?, 'Figma', 'lever', 'needs_answer', 5, 8, ?, NULL, NULL, NULL, datetime('now', '-45 minutes')),
        ('aq_workday', ?, 'Enterprise Cloud Global', 'workday', 'blocked_fallback', 8, 8, NULL, NULL, NULL, NULL, datetime('now', '-1 hour')),
        ('aq_sent_1', ?, 'Canva', 'ashby', 'sent', 14, 14, NULL, 'snap_canva_v1', ?, datetime('now', '-2 hours'), datetime('now', '-3 hours')),
        ('aq_sent_2', ?, 'Vercel', 'lever', 'sent', 12, 12, NULL, 'snap_vercel_v1', ?, datetime('now', '-5 hours'), datetime('now', '-6 hours'))
    `)
      .run(
        datadogJob,
        stripeJob,
        figmaJob,
        pendingFigmaQuestion,
        workdayJobId,
        canvaJob,
        receiptCanva,
        vercelJob,
        receiptVercel,
      );
  } finally {
    dbStudio.close();
  }

  return jobsList.map((j) => j.id);
}

async function captureAll(): Promise<void> {
  console.log('Starting TestServer for screenshot generation...');
  const srv = await TestServer.start();
  try {
    await seedCandidateData(srv);
    console.log('Seeded realistic candidate profile, jobs, applications, and autopilot data.');

    const browser = await chromium.launch({ headless: true });

    // Helper to open an authenticated page
    const openAuthedPage = async (width: number, height: number): Promise<{ context: any; page: Page }> => {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        colorScheme: 'light',
      });
      const page = await context.newPage();
      const freshAuthUrl = await srv.launchUrl();
      await page.goto(freshAuthUrl);
      return { context, page };
    };

    // Ensure output directory exists
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // 1. Candidate Profile Desktop (1280 x 900)
    console.log('Capturing candidate-profile-desktop.png...');
    {
      const { context, page } = await openAuthedPage(1280, 900);
      await page.goto(`${srv.origin}/profile`);
      await page.waitForSelector('.workspace-hero', { timeout: 10000 });
      // Give animations and font rendering a moment to settle
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'candidate-profile-desktop.png'),
        fullPage: false,
      });
      await context.close();
    }

    // 2. Candidate Profile Mobile (375 x 812)
    console.log('Capturing candidate-profile-mobile.png...');
    {
      const { context, page } = await openAuthedPage(375, 812);
      await page.goto(`${srv.origin}/profile`);
      await page.waitForSelector('.workspace-hero', { timeout: 10000 });
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'candidate-profile-mobile.png'),
        fullPage: false,
      });
      await context.close();
    }

    // 3. Job Discovery Desktop (1280 x 900)
    console.log('Capturing job-discovery-desktop.png...');
    {
      const { context, page } = await openAuthedPage(1280, 900);
      await page.goto(`${srv.origin}/opportunities`);
      await page.waitForSelector('main', { timeout: 10000 });
      await page.waitForTimeout(800);

      // Select first two job checkboxes to trigger the floating batch Autopilot bar!
      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      if (count >= 2) {
        await checkboxes.nth(0).check();
        await checkboxes.nth(1).check();
        await page.waitForTimeout(400);
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'job-discovery-desktop.png'),
        fullPage: false,
      });
      await context.close();
    }

    // 4. Autopilot Queue Desktop (1280 x 900) [NEW!]
    console.log('Capturing autopilot-queue-desktop.png...');
    {
      const { context, page } = await openAuthedPage(1280, 900);
      await page.goto(`${srv.origin}/autopilot`);
      await page.waitForSelector('main', { timeout: 10000 });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'autopilot-queue-desktop.png'),
        fullPage: false,
      });
      await context.close();
    }

    // 5. Resume Studio Desktop (1280 x 900)
    console.log('Capturing resume-studio-desktop.png...');
    {
      const { context, page } = await openAuthedPage(1280, 900);
      await page.goto(`${srv.origin}/resume`);
      await page.waitForSelector('main', { timeout: 10000 });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'resume-studio-desktop.png'),
        fullPage: false,
      });
      await context.close();
    }

    // 6. Applications Kanban Desktop (1280 x 900)
    console.log('Capturing applications-desktop.png...');
    {
      const { context, page } = await openAuthedPage(1280, 900);
      await page.goto(`${srv.origin}/applications`);
      await page.waitForSelector('main', { timeout: 10000 });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'applications-desktop.png'),
        fullPage: false,
      });
      await context.close();
    }

    // 7. Market Explorer Desktop (1280 x 900)
    console.log('Capturing market-explorer-desktop.png...');
    {
      const { context, page } = await openAuthedPage(1280, 900);
      await page.goto(`${srv.origin}/markets`);
      await page.waitForSelector('.market-table', { timeout: 10000 });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'market-explorer-desktop.png'),
        fullPage: false,
      });
      await context.close();
    }

    await browser.close();
    console.log('All screenshots captured successfully in docs/assets/screenshots/!');
  } finally {
    await srv.stop();
  }
}

captureAll().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
