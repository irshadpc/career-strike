import { describe, expect, it } from 'vitest';
import { candidateContext } from '../../src/career/context.js';
import { syncBoard } from '../../src/career/jobs.js';
import { saveMission } from '../../src/career/mission.js';
import { ProactiveOpportunityHunter } from '../../src/career/proactive-hunter.js';
import { backfillCompanyRegistry } from '../../src/markets/company-registry.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

const posting = (id: string, title: string, employer: string): NormalizedPosting => ({
  source: 'greenhouse',
  board: 'hunter-test',
  sourceJobId: id,
  employer,
  title,
  locationText: 'Remote, US',
  remotePolicy: 'remote',
  employmentType: 'full_time',
  department: 'Engineering',
  salary: { source: 'structured', currency: 'USD', min: 140000, max: 180000, interval: 'year' },
  description: [
    { type: 'heading', text: 'Requirements' },
    { type: 'item', text: 'Proficiency in TypeScript, Go, and distributed architecture.' },
  ],
  applyUrl: `https://example.com/apply/${id}`,
  postingUrl: `https://example.com/jobs/${id}`,
  publishedAt: '2026-11-10T10:00:00Z',
  unresolved: [],
});

describe('proactive opportunity hunter', () => {
  it('discovers and prioritizes matching opportunities across Track A and Track B', () => {
    const dir = tempDir();
    const db = openDb(`${dir}/test.db`);

    // Ingest test postings
    syncBoard(
      db,
      'greenhouse',
      'hunter-test',
      [
        posting('1', 'Senior Backend Engineer', 'Stripe'),
        posting('2', 'Distributed Systems Architect', 'Cloudflare'),
        posting('3', 'Frontend UI Specialist', 'Figma'),
      ],
      new Date(),
    );

    // Backfill registry from postings
    backfillCompanyRegistry(db);

    const mission = saveMission(db, {
      title: 'Senior Engineering Search',
      desiredOutcome: 'Secure senior backend or distributed systems position.',
      targetRoles: ['Senior Backend Engineer'],
      adjacentRoles: ['Distributed Systems Architect'],
      status: 'ACTIVE',
    });

    const ctx = candidateContext(db);
    const hunter = new ProactiveOpportunityHunter(db);
    const result = hunter.hunt(mission, ctx);

    expect(result.totalCandidateMatches).toBe(2);
    expect(result.recommendations.length).toBe(2);

    const match1 = result.recommendations[0];
    expect(match1?.employerName).toBe('Stripe');
    expect(match1?.track).toBe('TRACK_A');
    expect(match1?.entry.nextBestAction).toBeDefined();

    const match2 = result.recommendations[1];
    expect(match2?.employerName).toBe('Cloudflare');
    expect(match2?.track).toBe('TRACK_B');
  });
});
