import { describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { allCompanySignals, companySignals } from '../../src/markets/company-intelligence.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';

const at = '2026-11-01T00:00:00.000Z';

function posting(sourceJobId: string): NormalizedPosting {
  return {
    source: 'greenhouse',
    board: 'stripe',
    sourceJobId,
    employer: 'Stripe',
    title: 'Senior Platform Engineer',
    locationText: 'Singapore',
    remotePolicy: 'hybrid',
    employmentType: 'full_time',
    department: 'Engineering',
    salary: null,
    description: [{ type: 'paragraph', text: 'Build reliable payment systems.' }],
    applyUrl: 'https://boards.greenhouse.io/stripe/jobs/1',
    postingUrl: 'https://boards.greenhouse.io/stripe/jobs/1',
    publishedAt: at,
    unresolved: [],
  };
}

function adopt(db: ReturnType<typeof openDb>, health = 'OK'): void {
  db.prepare(
    `INSERT INTO source_boards (id, source, board, added_at, health, last_success_at, last_error, consecutive_failures)
     VALUES ('board_stripe', 'greenhouse', 'stripe', ?, ?, ?, NULL, 0)`,
  ).run(at, health, health === 'OK' ? at : null);
}

const stripe = (db: ReturnType<typeof openDb>, now = new Date('2026-11-02T00:00:00.000Z')) =>
  companySignals(db, 'SG', now).find((company) => company.employer === 'Stripe')!;

describe('company hiring signals', () => {
  it('makes no hiring claim before the board is adopted', () => {
    const db = openDb(':memory:');
    const signal = stripe(db);
    expect(signal.signal).toBe('NOT_YET_OBSERVED');
    expect(signal.openRoles).toBe(0);
    expect(signal.explanation).toContain('No hiring claim');
    db.close();
  });

  it('reports verified open roles only from postings retrieved locally', () => {
    const db = openDb(':memory:');
    adopt(db);
    syncBoard(db, 'greenhouse', 'stripe', [posting('1')], new Date(at));
    const signal = stripe(db);
    expect(signal.signal).toBe('VERIFIED_OPEN_ROLES');
    expect(signal.openRoles).toBe(1);
    expect(signal.sampleRoles[0]?.title).toBe('Senior Platform Engineer');
    expect(signal.sampleRoles[0]?.location).toBe('Singapore');
    expect(signal.evidence.join(' ')).toContain('official careers presence');
    db.close();
  });

  it('marks locally held postings as stale after the freshness window', () => {
    const db = openDb(':memory:');
    adopt(db);
    syncBoard(db, 'greenhouse', 'stripe', [posting('1')], new Date(at));
    const signal = stripe(db, new Date('2026-12-01T00:00:00.000Z'));
    expect(signal.signal).toBe('EVIDENCE_STALE');
    expect(signal.explanation).toContain('more than 14 days old');
    db.close();
  });

  it('distinguishes a healthy board with no open roles from an unavailable board', () => {
    const db = openDb(':memory:');
    adopt(db);
    syncBoard(db, 'greenhouse', 'stripe', [], new Date(at));
    expect(stripe(db).signal).toBe('NO_OPEN_ROLES_OBSERVED');

    db.prepare("UPDATE source_boards SET health = 'DEGRADED' WHERE source = 'greenhouse' AND board = 'stripe'").run();
    expect(stripe(db).signal).toBe('BOARD_UNAVAILABLE');
    db.close();
  });

  it('returns every curated company when no country filter is supplied', () => {
    const db = openDb(':memory:');
    const all = allCompanySignals(db);
    expect(all.length).toBeGreaterThan(20);
    expect(new Set(all.map((company) => company.id)).size).toBe(all.length);
    db.close();
  });
});
