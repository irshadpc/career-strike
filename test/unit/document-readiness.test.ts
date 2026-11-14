import { describe, expect, it } from 'vitest';
import { evaluateDocumentReadiness } from '../../src/career/document-readiness.js';
import { addEvidence } from '../../src/career/evidence.js';
import { buildMasterResume } from '../../src/career/master-resume.js';
import { addFact, listFacts } from '../../src/career/profile.js';
import { openDb } from '../../src/store/db.js';
import { setSetting } from '../../src/store/settings.js';

function completeProfile() {
  const db = openDb(':memory:');
  setSetting(db, 'identity.fullName', 'Ada Lovelace', 'test');
  setSetting(db, 'identity.email', 'ada@example.com', 'test');
  setSetting(db, 'identity.phone', '+44 20 0000 0000', 'test');
  setSetting(db, 'identity.summary', 'Platform engineer focused on reliable systems.', 'test');
  addFact(
    db,
    {
      kind: 'role',
      value: {
        title: 'Staff Platform Engineer',
        employer: 'Analytical Engines',
        startYear: 2021,
        endYear: null,
        summary: 'Reduced deployment time by 40% across 30 services.',
      },
    },
    'test',
  );
  addFact(db, { kind: 'skill', value: { name: 'Kubernetes', years: 5, level: 'expert' } }, 'test');
  addEvidence(
    db,
    {
      kind: 'project',
      value: {
        name: 'Reliable Migrations',
        summary: 'Migrated 50 services with zero downtime.',
        skills: ['Kubernetes'],
        url: null,
      },
    },
    'test',
  );
  return db;
}

const confirmedSkills = (db: ReturnType<typeof completeProfile>): string[] =>
  listFacts(db, { approvedOnly: true })
    .filter((fact) => fact.kind === 'skill')
    .map((fact) => String(fact.value.name));

describe('canonical master resume', () => {
  it('renders explicit gaps instead of invented content for an empty profile', () => {
    const db = openDb(':memory:');
    const master = buildMasterResume(db);
    expect(master.counts).toMatchObject({ roles: 0, skills: 0, projects: 0 });
    expect(master.identity.hasName).toBe(false);
    expect(master.content).toContain('[Add a role or a short professional summary in your profile]');
    expect(master.content).toContain('[Add skills in your profile]');
    expect(master.content).toContain('[Add experience in your profile]');
    db.close();
  });

  it('is built only from approved facts and confirmed evidence', () => {
    const db = completeProfile();
    // An unapproved parser suggestion must never reach the document.
    db.prepare(
      `INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at)
       VALUES (?, 'skill', ?, 'document', 0, ?, ?)`,
    ).run('fact_unapproved', JSON.stringify({ name: 'Rust', years: null, level: null }), '2026-01-01', '2026-01-01');
    const master = buildMasterResume(db);
    expect(master.content).toContain('ADA LOVELACE');
    expect(master.content).toContain('Staff Platform Engineer — Analytical Engines (2021 – Present)');
    expect(master.content).toContain('Kubernetes (5 years)');
    expect(master.content).toContain('Reliable Migrations: Migrated 50 services with zero downtime.');
    expect(master.content).not.toContain('Rust');
    expect(master.counts.skills).toBe(1);
    db.close();
  });

  it('includes candidate-authored headline and summary without adding claims', () => {
    const db = completeProfile();
    setSetting(db, 'identity.headline', 'Platform Engineer', 'test');
    const master = buildMasterResume(db);
    expect(master.content.split('\n')[1]).toBe('Platform Engineer');
    expect(master.identity.hasHeadline).toBe(true);
    expect(master.identity.hasSummary).toBe(true);
    db.close();
  });
});

describe('document readiness', () => {
  it('reports INCOMPLETE with actionable checks for an empty document', () => {
    const db = openDb(':memory:');
    const master = buildMasterResume(db);
    const report = evaluateDocumentReadiness(master, []);
    expect(report.state).toBe('INCOMPLETE');
    expect(report.failed).toBeGreaterThan(0);
    expect(report.checks.find((check) => check.id === 'identity')?.status).toBe('FAIL');
    expect(report.checks.find((check) => check.id === 'no_placeholders')?.status).toBe('FAIL');
    expect(report.disclaimer).toContain('not an ATS certification');
    db.close();
  });

  it('reports READY_TO_TAILOR for a complete, quantified and consistent document', () => {
    const db = completeProfile();
    const master = buildMasterResume(db);
    const report = evaluateDocumentReadiness(master, confirmedSkills(db));
    expect(report.state).toBe('READY_TO_TAILOR');
    expect(report.failed).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.score).toBe(100);
    db.close();
  });

  it('warns, rather than fabricating a pass, when text names an unconfirmed skill', () => {
    const db = completeProfile();
    const master = buildMasterResume(db);
    const report = evaluateDocumentReadiness(
      { ...master, content: `${master.content}\nAdditional: advanced Rust experience.` },
      confirmedSkills(db),
    );
    expect(report.state).toBe('NEEDS_ATTENTION');
    expect(report.checks.find((check) => check.id === 'skill_consistency')?.status).toBe('WARN');
    expect(report.checks.find((check) => check.id === 'skill_consistency')?.explanation).toContain('Rust');
    db.close();
  });

  it('fails plain-text layout when a table row is present', () => {
    const db = completeProfile();
    const master = buildMasterResume(db);
    const report = evaluateDocumentReadiness(
      { ...master, content: `${master.content}\n| Skill | Years |\n| --- | --- |` },
      confirmedSkills(db),
    );
    expect(report.state).toBe('INCOMPLETE');
    expect(report.checks.find((check) => check.id === 'plain_text_layout')?.status).toBe('FAIL');
    db.close();
  });
});
