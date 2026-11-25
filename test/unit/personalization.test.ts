import { describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { addFact } from '../../src/career/profile.js';
import { PersonalizationService } from '../../src/personalization/service.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { setSetting } from '../../src/store/settings.js';

function posting(): NormalizedPosting {
  return {
    source: 'greenhouse',
    board: 'fixture',
    sourceJobId: '1',
    employer: 'Example Labs',
    title: 'Platform Engineer',
    locationText: 'Berlin, Germany',
    remotePolicy: 'hybrid',
    employmentType: 'full_time',
    department: null,
    salary: null,
    description: [
      { type: 'heading', text: 'Requirements' },
      { type: 'item', text: 'TypeScript and Kubernetes' },
      { type: 'item', text: '3 years of experience' },
    ],
    applyUrl: 'https://example.test/apply/1',
    postingUrl: 'https://example.test/jobs/1',
    publishedAt: null,
    unresolved: [],
  };
}

describe('local document personalization', () => {
  it('uses confirmed evidence only and marks a package stale after profile changes', () => {
    const db = openDb(':memory:');
    syncBoard(db, 'greenhouse', 'fixture', [posting()]);
    const jobId = db.prepare('SELECT id FROM jobs').pluck().get() as string;
    const applicationId = 'app_fixture';
    db.prepare(
      "INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at) VALUES (?, ?, 'DRAFTED', 'manual', 1, ?, ?)",
    ).run(applicationId, jobId, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    addFact(db, { kind: 'skill', value: { name: 'TypeScript', years: 4, level: 'proficient' } }, 'test');
    addFact(
      db,
      {
        kind: 'role',
        value: {
          title: 'Software Engineer',
          employer: 'Example Co',
          startYear: 2020,
          endYear: null,
          summary: 'Built dependable developer tooling.',
        },
      },
      'test',
    );

    const service = new PersonalizationService(db);
    const generated = service.generate(applicationId);
    expect(generated.binding.variants).toHaveLength(2);
    expect(generated.coverLetter).toContain('TypeScript');
    expect(service.bindingCurrent(applicationId, generated.binding)).toBe(true);

    const view = service.view(applicationId);
    expect(view.requirements.find((item) => item.requirement === 'TypeScript')).toMatchObject({
      classification: 'STRONG_MATCH',
    });
    expect(view.requirements.find((item) => item.requirement === 'Kubernetes')).toMatchObject({
      classification: 'MISSING',
    });

    addFact(db, { kind: 'skill', value: { name: 'Kubernetes', years: 1, level: 'familiar' } }, 'test');
    expect(service.bindingCurrent(applicationId, generated.binding)).toBe(false);
    expect(service.view(applicationId).stale).toBe(true);
    db.close();
  });

  it('includes candidate header, reverse-chronological roles, education, languages, and preserves valid evidence on edit', () => {
    const db = openDb(':memory:');
    syncBoard(db, 'greenhouse', 'fixture', [posting()]);
    const jobId = db.prepare('SELECT id FROM jobs').pluck().get() as string;
    const applicationId = 'app_rich';
    db.prepare(
      "INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at) VALUES (?, ?, 'DRAFTED', 'manual', 1, ?, ?)",
    ).run(applicationId, jobId, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    setSetting(db, 'identity.fullName', 'Jordan Lee', 'test');
    setSetting(db, 'identity.email', 'jordan@example.com', 'test');
    addFact(db, { kind: 'skill', value: { name: 'TypeScript', years: 5, level: 'expert' } }, 'test');
    addFact(
      db,
      {
        kind: 'role',
        value: {
          title: 'Junior Developer',
          employer: 'OldCo',
          startYear: 2016,
          endYear: 2019,
          summary: 'Maintained internal tools.',
        },
      },
      'test',
    );
    addFact(
      db,
      {
        kind: 'role',
        value: {
          title: 'Staff Platform Engineer',
          employer: 'NewCo',
          startYear: 2022,
          endYear: null,
          summary: 'Orchestrated Kubernetes clusters across 3 regions.',
        },
      },
      'test',
    );
    addFact(
      db,
      { kind: 'education', value: { qualification: 'M.S. Computer Science', institution: 'State U', year: 2016 } },
      'test',
    );
    addFact(db, { kind: 'language', value: { name: 'German', level: 'professional' } }, 'test');

    const service = new PersonalizationService(db);
    const { binding, coverLetter } = service.generate(applicationId);
    const resumeVariant = binding.variants.find((v) => v.kind === 'resume')!;
    const viewBeforeEdit = service.view(applicationId);
    const resumeContent = viewBeforeEdit.variants.find((v) => v.kind === 'resume')!.content;

    expect(resumeContent).toContain('Jordan Lee');
    expect(resumeContent).toContain('jordan@example.com');
    expect(resumeContent).toContain('M.S. Computer Science');
    expect(resumeContent).toContain('German (professional)');
    // Newest role should appear before older role in generated resume
    expect(resumeContent.indexOf('Staff Platform Engineer')).toBeLessThan(resumeContent.indexOf('Junior Developer'));
    expect(coverLetter).toContain('Staff Platform Engineer');
    expect(coverLetter).toContain('Jordan Lee');

    // Editing typos should keep evidence provenance when TypeScript remains present
    service.edit(applicationId, resumeVariant.id, `${resumeContent}\nRefined note.`);
    const viewAfterEdit = service.view(applicationId);
    const editedResume = viewAfterEdit.variants.find((v) => v.kind === 'resume')!;
    expect(editedResume.status).toBe('CANDIDATE_EDITED');
    expect(editedResume.evidence.length).toBeGreaterThan(0);
    db.close();
  });
});
