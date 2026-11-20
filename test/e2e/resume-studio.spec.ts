import { expect, signIn, test } from './fixtures.js';

test.describe('resume studio and profile readiness', () => {
  test('displays master resume, ATS health checks, and allows side-by-side comparison', async ({ page, cs }) => {
    // 1. Seed candidate facts and a job
    await cs.api('POST', '/api/profile/facts', {
      kind: 'role',
      value: { title: 'Staff Platform Engineer', employer: 'Acme Systems', startYear: 2021, endYear: null },
    });
    await cs.api('POST', '/api/profile/facts', {
      kind: 'skill',
      value: { name: 'Kubernetes', years: 4, level: 'expert' },
    });
    await cs.api('POST', '/api/profile/evidence', {
      kind: 'project',
      value: {
        name: 'Cloud Migration',
        summary: 'Migrated 50 microservices to Kubernetes with zero downtime',
        skills: ['Kubernetes'],
      },
    });

    cs.seed('lever', 'resume-studio-test', [
      {
        title: 'Principal Infrastructure Engineer',
        description: [{ type: 'paragraph', text: 'Experience with Kubernetes required.' }],
      },
    ]);
    const jobs = ((await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] }).jobs;
    expect(jobs.length).toBeGreaterThan(0);

    // Prepare an application for this job
    const appRes = await cs.api('POST', '/api/applications', { jobId: jobs[0]!.id });
    expect(appRes.status).toBe(201);
    const appId = (appRes.body as { application: { id: string } }).application.id;

    // Generate personalized documents for this application
    await cs.api('POST', `/api/applications/${appId}/personalize`);

    // 2. Sign in and verify Resume Studio tab in navigation
    await signIn(page, cs);
    const resumeLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Resume Studio' });
    await expect(resumeLink).toBeVisible();
    await resumeLink.click();

    await expect(page).toHaveURL(`${cs.origin}/resume`);
    await expect(page.getByRole('heading', { level: 1, name: 'Resume Studio' })).toBeVisible();

    // 3. Verify document readiness cards
    await expect(
      page.getByRole('heading', { level: 2, name: 'Document Readiness & Evidence Verification' }),
    ).toBeVisible();
    await expect(page.getByText('Evidence Provenance')).toBeVisible();
    await expect(page.getByText('Standard Section Headings')).toBeVisible();

    // 4. Verify Master Resume Document content
    const masterDoc = page.locator('[aria-label="Master Resume content"]');
    await expect(masterDoc).toBeVisible();
    await expect(masterDoc).toContainText('Staff Platform Engineer — Acme Systems');
    await expect(masterDoc).toContainText('Kubernetes');
    await expect(masterDoc).toContainText('Cloud Migration: Migrated 50 microservices to Kubernetes');

    // 5. Switch to Side-by-Side Job Comparison
    await page.getByRole('button', { name: 'Job Comparison' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Side-by-Side Tailored Document Comparison' }),
    ).toBeVisible();
    await expect(page.getByText('Master Reference (Canonical Facts)')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tailored Resume' })).toBeVisible();

    // 6. Edit tailored document variant and save
    const editor = page.locator('#variant-editor');
    await expect(editor).toBeVisible();
    await editor.fill(
      'TARGET ROLE: Principal Infrastructure Engineer\n\nCUSTOM CANDIDATE NOTE\n\nEXPERIENCE:\nStaff Platform Engineer at Acme Systems.',
    );
    const saveButton = page.getByRole('button', { name: 'Save Document Edit' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await expect(page.getByRole('status')).toContainText('Saved document edit');
    await expect(page.getByText('Candidate Edited')).toBeVisible();
  });

  test('exercises 3-pane studio workspace: lenses, XYZ linter, and 7-check gate', async ({ page, cs }) => {
    // 1. Seed facts
    await cs.api('POST', '/api/profile/facts', {
      kind: 'role',
      value: { title: 'Staff Platform Engineer', employer: 'Acme Systems', startYear: 2021, endYear: null },
    });
    await cs.api('POST', '/api/profile/facts', {
      kind: 'skill',
      value: { name: 'Kubernetes', years: 4, level: 'expert' },
    });

    await signIn(page, cs);
    await page.goto(`${cs.origin}/resume`);

    // Verify 3-pane workspace is mounted
    await expect(page.getByText('Studio Workspace: ATS X-Ray, Recruiter Simulation & Master Vault')).toBeVisible();
    await expect(page.getByText('Master Vault Outliner')).toBeVisible();

    // Verify Lens switching (⌘1 Human Print, ⌘2 ATS X-Ray, ⌘3 7.4s Recruiter Scan, ⌘4 Variant Diff)
    const xrayButton = page.getByRole('button', { name: '⌘2 ATS X-Ray' });
    await expect(xrayButton).toBeVisible();
    await xrayButton.click();
    await expect(page.getByText('/H1')).toBeVisible();
    await expect(page.getByText('/Document')).toBeVisible();

    // Switch to 7.4s Recruiter Scan
    const scanButton = page.getByRole('button', { name: '⌘3 7.4s Recruiter Scan' });
    await expect(scanButton).toBeVisible();
    await scanButton.click();
    await expect(page.getByRole('button', { name: 'Start 7.4s Flash Test' })).toBeVisible();

    // Switch back to Human Print
    await page.getByRole('button', { name: '⌘1 Human Print' }).click();

    // Verify Right Pane tabs: 7-Check Verification, 3-Tier JD Alignment, Impact Scorecard
    await expect(page.getByRole('button', { name: '7-Check Verification' })).toBeVisible();
    await page.getByRole('button', { name: 'Impact Scorecard' }).click();
    await expect(page.getByText('Quantification Rate')).toBeVisible();
    await expect(page.getByText('Clichés / Buzzwords')).toBeVisible();

    // Verify 3-Tier JD Alignment
    await page.getByRole('button', { name: '3-Tier JD Alignment' }).click();
    await expect(page.getByRole('button', { name: 'Run Alignment Analysis' })).toBeVisible();
  });
});
