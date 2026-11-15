import { describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { computeCareerMarketPulse } from '../../src/career/market-pulse.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';

describe('Career Market Pulse Engine', () => {
  it('computes aggregated market pulse with explicit sampling limitations and zero claims of universality', () => {
    const db = openDb(':memory:');

    const emptyReport = computeCareerMarketPulse(db);
    expect(emptyReport.sampleSummary.totalObservedPostings).toBe(0);
    expect(emptyReport.methodologyAndLimitations.samplingLimitations).toContain('NOT a representative sample');

    const postings: NormalizedPosting[] = [
      {
        source: 'lever',
        board: 'pulse-board',
        sourceJobId: 'p-1',
        employer: 'Pulse Corp',
        title: 'Senior Rust Infrastructure Engineer',
        locationText: 'Remote',
        remotePolicy: 'remote',
        employmentType: 'full_time',
        department: 'Engineering',
        salary: { currency: 'USD', min: 180000, max: 210000, interval: 'year', source: 'structured' },
        description: [
          { type: 'heading', text: 'Requirements' },
          { type: 'item', text: '5+ years with Rust, Kubernetes, and Distributed Systems' },
        ],
        applyUrl: null,
        postingUrl: 'https://example.com/p1',
        publishedAt: new Date().toISOString(),
        unresolved: [],
      },
      {
        source: 'lever',
        board: 'pulse-board',
        sourceJobId: 'p-2',
        employer: 'Pulse Corp',
        title: 'Backend Engineer',
        locationText: 'Berlin, Germany',
        remotePolicy: 'hybrid',
        employmentType: 'full_time',
        department: 'Engineering',
        salary: null,
        description: [
          { type: 'heading', text: 'Requirements' },
          { type: 'item', text: 'Experience with Rust and Docker' },
        ],
        applyUrl: null,
        postingUrl: 'https://example.com/p2',
        publishedAt: new Date().toISOString(),
        unresolved: [],
      },
    ];

    syncBoard(db, 'lever', 'pulse-board', postings);

    const report = computeCareerMarketPulse(db);
    expect(report.sampleSummary.totalObservedPostings).toBe(2);
    expect(report.salaryTransparency.disclosedCount).toBe(1);
    expect(report.salaryTransparency.disclosurePercentage).toBe(50);

    const remoteDist = report.remotePolicyDistribution;
    expect(remoteDist.find((d) => d.key === 'remote')?.count).toBe(1);
    expect(remoteDist.find((d) => d.key === 'hybrid')?.count).toBe(1);

    expect(report.topSkillsDemand.some((s) => s.skill.toLowerCase().includes('rust'))).toBe(true);
    expect(report.hiringVelocity.openedLast14Days).toBe(2);
  });
});
