import { describe, expect, it } from 'vitest';
import {
  computeCompanyMomentum,
  getCompany360,
  listCompanyEvents,
  recordCompanyEvent,
  upsertCompany360,
} from '../../src/markets/company-intelligence.js';
import {
  addCandidateCompany,
  isCompanyWatched,
  listCompanyRegistry,
  listWatchedCompanyIds,
  setCompanyWatch,
} from '../../src/markets/company-registry.js';
import { openDb } from '../../src/store/db.js';

describe('Company Intelligence 360', () => {
  it('returns honest unknown values when no company profile has been recorded', () => {
    const db = openDb(':memory:');
    const comp = addCandidateCompany(db, { name: 'Acme Unknown Inc' });

    const profile = getCompany360(db, comp.id);
    expect(profile).not.toBeNull();
    expect(profile?.name).toBe('Acme Unknown Inc');
    expect(profile?.stage.value).toBe('UNKNOWN');
    expect(profile?.teamSizeRange.value).toBe('UNKNOWN');
    expect(profile?.headcountTrend.value).toBe('UNKNOWN');
    expect(profile?.techStack.value).toEqual([]);
    expect(profile?.fundingSummary.totalRaised).toBeNull();
    expect(profile?.isWatched).toBe(false);
  });

  it('provides verified seed intelligence for curated targets with explicit citations', () => {
    const db = openDb(':memory:');
    // Stripe is in curated registry
    const registry = listCompanyRegistry(db);
    const stripe = registry.find((c) => c.name.toLowerCase() === 'stripe');
    expect(stripe).toBeDefined();

    const profile = getCompany360(db, stripe!.id);
    expect(profile).not.toBeNull();
    expect(profile?.stage.value).toBe('PUBLIC');
    expect(profile?.industry?.value).toBe('Financial Technology');
    expect(profile?.productDomain?.value).toContain('Payment Infrastructure');
    expect(profile?.techStack.value).toContain('Ruby');
    expect(profile?.techStack.confidence).toBe('CONFIRMED_OFFICIAL');
    expect(profile?.fundingSummary.totalRaised).toBe(8700000000);
  });

  it('allows candidate to update 360 profile with candidate provenance and audit trail', () => {
    const db = openDb(':memory:');
    const comp = addCandidateCompany(db, { name: 'Frontier Robotics' });

    const updated = upsertCompany360(db, comp.id, {
      stage: 'SERIES_A',
      industry: 'Robotics & Hardware',
      teamSizeRange: '11_50',
      techStack: ['C++', 'ROS2', 'Python'],
      headquartersCity: 'Pittsburgh',
      headquartersCountry: 'US',
    });

    expect(updated.stage.value).toBe('SERIES_A');
    expect(updated.stage.confidence).toBe('CANDIDATE_REPORTED');
    expect(updated.industry?.value).toBe('Robotics & Hardware');
    expect(updated.teamSizeRange.value).toBe('11_50');
    expect(updated.techStack.value).toEqual(['C++', 'ROS2', 'Python']);
    expect(updated.headquartersCity).toBe('Pittsburgh');

    // Audit event recorded
    const audit = db.prepare('SELECT * FROM audit_events WHERE subject = ?').all(comp.id);
    expect(audit.length).toBeGreaterThan(0);
  });

  it('manages candidate watchlists with alert preferences', () => {
    const db = openDb(':memory:');
    const comp = addCandidateCompany(db, { name: 'Watch Target Corp' });

    expect(isCompanyWatched(db, comp.id)).toBe(false);

    setCompanyWatch(db, comp.id, true, { notifyOnNewRoles: true, notes: 'Follow for backend roles' });
    expect(isCompanyWatched(db, comp.id)).toBe(true);
    expect(listWatchedCompanyIds(db)).toContain(comp.id);

    const profile = getCompany360(db, comp.id);
    expect(profile?.isWatched).toBe(true);
    expect(profile?.watchSettings?.notes).toBe('Follow for backend roles');

    // Remove watch
    setCompanyWatch(db, comp.id, false);
    expect(isCompanyWatched(db, comp.id)).toBe(false);
  });

  it('records and retrieves chronological timeline events', () => {
    const db = openDb(':memory:');
    const comp = addCandidateCompany(db, { name: 'Timeline Corp' });

    recordCompanyEvent(
      db,
      {
        companyId: comp.id,
        kind: 'FUNDING_ANNOUNCEMENT',
        title: 'Announced $15M Series A',
        detail: 'Led by Venture Partner',
        source: 'Official Press',
        eventAt: '2026-05-01T10:00:00.000Z',
      },
      new Date('2026-05-01T10:00:00.000Z'),
    );

    recordCompanyEvent(
      db,
      {
        companyId: comp.id,
        kind: 'ROLE_OPENED',
        title: 'New role observed: Senior Infrastructure Engineer',
        detail: 'Observed on lever/timeline-corp',
        source: 'lever/timeline-corp',
        eventAt: '2026-06-01T10:00:00.000Z',
      },
      new Date('2026-06-01T10:00:00.000Z'),
    );

    const events = listCompanyEvents(db, comp.id);
    expect(events).toHaveLength(2);
    // Most recent eventAt first
    expect(events[0]!.kind).toBe('ROLE_OPENED');
    expect(events[1]!.kind).toBe('FUNDING_ANNOUNCEMENT');
  });

  it('computes honest company momentum without speculative claims', () => {
    const db = openDb(':memory:');
    const comp = addCandidateCompany(db, { name: 'Momentum Tech' });

    const momentum = computeCompanyMomentum(db, comp.id, new Date('2026-11-15T00:00:00.000Z'));
    expect(momentum.trend).toBe('UNKNOWN');
    expect(momentum.metrics.openRoles).toBe(0);

    // Add a funding announcement event
    recordCompanyEvent(
      db,
      {
        companyId: comp.id,
        kind: 'FUNDING_ANNOUNCEMENT',
        title: 'Announced Series B',
        detail: 'Capital raised',
        source: 'Press',
        eventAt: '2026-10-01T00:00:00.000Z',
      },
      new Date('2026-10-01T00:00:00.000Z'),
    );

    const momentumWithFunding = computeCompanyMomentum(db, comp.id, new Date('2026-11-15T00:00:00.000Z'));
    expect(momentumWithFunding.metrics.hasRecentFunding).toBe(true);
    expect(momentumWithFunding.rationale).toContain('capital announcements do not guarantee open vacancies');
  });
});
