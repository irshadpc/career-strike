import { describe, expect, it } from 'vitest';
import { buildApplicationRehearsal } from '../../src/applications/rehearsal.js';
import { ApplicationService } from '../../src/applications/service.js';
import { syncBoard } from '../../src/career/jobs.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { setSetting } from '../../src/store/settings.js';
import { DocumentVault } from '../../src/vault/documents.js';
import { FileSecretStore } from '../../src/vault/secrets.js';
import { tempDir } from '../helpers.js';

function createMockPosting(id: string): NormalizedPosting {
  return {
    source: 'greenhouse',
    board: 'synthetic',
    sourceJobId: id,
    employer: 'Synthetic Systems',
    title: 'Staff Infrastructure Engineer',
    locationText: 'Remote, US',
    remotePolicy: 'remote',
    employmentType: 'full_time',
    department: 'Platform',
    salary: { source: 'structured', currency: 'USD', min: 180000, max: 220000, interval: 'year' },
    description: [
      { type: 'heading', text: 'Requirements' },
      { type: 'item', text: '5+ years experience with Kubernetes and TypeScript.' },
    ],
    applyUrl: `https://boards.greenhouse.io/syntheticsystems/jobs/${id}`,
    postingUrl: `https://syntheticsystems.com/careers/${id}`,
    publishedAt: '2026-11-10T10:00:00Z',
    unresolved: [],
  };
}

describe('application concierge & rehearsal workbench', () => {
  it('builds pre-flight checklist, flags missing items, and rehearses screening fields', async () => {
    const dir = tempDir();
    const db = openDb(`${dir}/test.db`);
    const secrets = new FileSecretStore(`${dir}/secrets`);
    const vault = new DocumentVault(db, `${dir}/vault`);

    // 1. Setup candidate settings
    setSetting(db, 'identity.fullName', 'Alex Chen', 'test');
    setSetting(db, 'identity.email', 'alex@example.com', 'test');
    setSetting(db, 'identity.phone', '+1 555 0199', 'test');
    setSetting(db, 'candidate.workAuthorizations', { US: 'authorised' }, 'test');

    // 2. Setup candidate profile facts
    db.prepare(
      `INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at)
       VALUES (?, 'skill', ?, 'user', 1, datetime('now'), datetime('now'))`,
    ).run('skill-1', JSON.stringify({ name: 'Kubernetes', years: 6 }));

    db.prepare(
      `INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at)
       VALUES (?, 'skill', ?, 'user', 1, datetime('now'), datetime('now'))`,
    ).run('skill-2', JSON.stringify({ name: 'TypeScript', years: 5 }));

    // 3. Sync job posting
    syncBoard(db, 'greenhouse', 'synthetic', [createMockPosting('infra-101')]);
    const jobRow = db.prepare('SELECT id FROM jobs WHERE canonical_key LIKE ?').get('%infra-101%') as { id: string };
    expect(jobRow).toBeDefined();

    // 4. Create application service and application
    const appService = new ApplicationService(
      db,
      secrets,
      vault,
      async () => [
        { key: 'full_name', label: 'Full Name', required: true, kind: 'text', options: [], voluntary: false },
        { key: 'email', label: 'Email Address', required: true, kind: 'text', options: [], voluntary: false },
        { key: 'resume', label: 'Résumé', required: true, kind: 'file', options: [], voluntary: false },
        {
          key: 'sponsorship_needed',
          label: 'Do you require sponsorship?',
          required: true,
          kind: 'text',
          options: [],
          voluntary: false,
        },
      ],
      undefined,
      () => 'manual',
    );

    const appId = await appService.create(jobRow.id, 'alex');
    expect(appId).toBeTruthy();

    // 5. Build rehearsal BEFORE attaching resume
    const rehearsalInitial = await buildApplicationRehearsal(db, appService, appId);
    expect(rehearsalInitial).not.toBeNull();
    expect(rehearsalInitial!.employer).toBe('Synthetic Systems');
    expect(rehearsalInitial!.jobTitle).toBe('Staff Infrastructure Engineer');
    expect(rehearsalInitial!.applyUrl).toBe('https://boards.greenhouse.io/syntheticsystems/jobs/infra-101');

    // Without attached resume, checklist should flag documents
    const resumeCheck = rehearsalInitial!.checklist.find((c) => c.id === 'chk-resume');
    expect(resumeCheck?.status).toBe('FAIL');
    expect(rehearsalInitial!.readinessSummary.overallStatus).toBe('BLOCKED');

    // Rehearsal items should flag empty sponsorship question
    const sponsorshipItem = rehearsalInitial!.rehearsalItems.find((i) => i.fieldKey === 'sponsorship_needed');
    expect(sponsorshipItem?.status).toBe('ATTENTION_NEEDED');

    // Policy notice is reaffirmed
    expect(rehearsalInitial!.policyNotice.statement).toContain('never mass-submit');

    // 6. Now attach resume document to application and update sponsorship field
    const doc = vault.save(
      {
        kind: 'resume',
        filename: 'alex-chen-resume.pdf',
        mime: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4 synthetic resume content'),
      },
      'alex',
    );

    await appService.update(
      appId,
      {
        resumeDocumentId: doc.id,
        fields: [{ key: 'sponsorship_needed', value: 'No, authorized to work in the US.' }],
      },
      'alex',
    );

    // 7. Re-evaluate rehearsal
    const rehearsalUpdated = await buildApplicationRehearsal(db, appService, appId);
    expect(rehearsalUpdated!.checklist.find((c) => c.id === 'chk-resume')?.status).toBe('PASS');
    expect(rehearsalUpdated!.checklist.find((c) => c.id === 'chk-identity')?.status).toBe('PASS');
    expect(rehearsalUpdated!.checklist.find((c) => c.id === 'chk-work-auth')?.status).toBe('PASS');
    expect(rehearsalUpdated!.readinessSummary.failingCount).toBe(0);

    const updatedSponsorship = rehearsalUpdated!.rehearsalItems.find((i) => i.fieldKey === 'sponsorship_needed');
    expect(updatedSponsorship?.status).toBe('READY');
    expect(updatedSponsorship?.draftValue).toBe('No, authorized to work in the US.');
  });
});
