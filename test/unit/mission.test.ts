import { describe, expect, it } from 'vitest';
import { getActiveMission, listMissionHistory, saveMission } from '../../src/career/mission.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

describe('career mission model', () => {
  it('creates an active mission with default Track A and Track B params', () => {
    const dir = tempDir();
    const db = openDb(`${dir}/test.db`);

    const mission = saveMission(db, {
      title: 'Senior Distributed Systems Engineer',
      desiredOutcome: 'Secure remote staff-level position with high autonomy and competitive equity.',
      targetRoles: ['Senior Backend Engineer', 'Staff Engineer'],
      adjacentRoles: ['Engineering Manager', 'Solutions Architect'],
      trackAParams: { targetSeniority: 'Senior', immediateAvailability: true },
      trackBParams: { targetSeniority: 'Staff', longTermStretch: true },
      salaryFloor: 140000,
      salaryCurrency: 'USD',
      targetLocations: ['Remote', 'United States'],
      remotePolicy: 'remote_only',
      relocationWillingness: false,
      workAuthorizations: { US: 'authorized' },
      joiningAvailability: 'immediate',
      companyPreferences: { stages: ['SERIES_B', 'SERIES_C'], domains: ['Fintech'], headcountRange: ['51_200'] },
      careerGrowthPriorities: ['Architecture leadership'],
      nonNegotiables: ['Zero unpaid overtime'],
      searchUrgency: 'high',
      weeklyEffortHours: 10,
      successCriteria: ['$140k+ base', 'Remote'],
      status: 'ACTIVE',
    });

    expect(mission.id).toMatch(/^mission_/);
    expect(mission.version).toBe(1);
    expect(mission.title).toBe('Senior Distributed Systems Engineer');
    expect(mission.targetRoles).toEqual(['Senior Backend Engineer', 'Staff Engineer']);
    expect(mission.status).toBe('ACTIVE');

    const active = getActiveMission(db);
    expect(active?.id).toBe(mission.id);
  });

  it('increments version and records historical snapshot on mission update', () => {
    const dir = tempDir();
    const db = openDb(`${dir}/test.db`);

    const v1 = saveMission(db, {
      title: 'Initial Strategy',
      desiredOutcome: 'Initial career goal.',
      targetRoles: ['Backend Engineer'],
      status: 'ACTIVE',
    });

    const v2 = saveMission(
      db,
      {
        title: 'Refined Strategy: Tech Lead',
        desiredOutcome: 'Transition into technical team leadership.',
        targetRoles: ['Tech Lead', 'Staff Engineer'],
        status: 'ACTIVE',
      },
      'candidate',
      'Promoted target seniority to Tech Lead',
    );

    expect(v2.version).toBe(2);
    expect(v2.title).toBe('Refined Strategy: Tech Lead');

    const history = listMissionHistory(db, v1.id);
    expect(history.length).toBe(1);
    expect(history[0]?.version).toBe(1);
    expect(history[0]?.snapshot.title).toBe('Initial Strategy');
    expect(history[0]?.changeSummary).toBe('Promoted target seniority to Tech Lead');
  });
});
