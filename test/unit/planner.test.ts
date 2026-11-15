import { describe, expect, it } from 'vitest';
import { saveMission } from '../../src/career/mission.js';
import { CareerPlanner } from '../../src/career/planner.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

describe('autonomous career planner', () => {
  it('generates multi-step plan with dependency-ordered steps and approval gates', () => {
    const dir = tempDir();
    const db = openDb(`${dir}/test.db`);

    const mission = saveMission(db, {
      title: 'Principal Architect Journey',
      desiredOutcome: 'Lead enterprise architecture.',
      targetRoles: ['Principal Architect', 'Staff Engineer'],
      adjacentRoles: ['VP Engineering'],
      status: 'ACTIVE',
    });

    const planner = new CareerPlanner(db);
    const plan = planner.generatePlan(mission, {
      settings: {},
      jobs: { open: 12, unverified: 0, unreviewed: 5, shortlisted: 2 },
    });

    expect(plan.id).toMatch(/^plan_/);
    expect(plan.missionId).toBe(mission.id);
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);

    const step1 = plan.steps.find((s) => s.stepOrder === 1);
    expect(step1?.category).toBe('DISCOVERY');
    expect(step1?.permissionTier).toBe('AUTOMATIC');

    const step4 = plan.steps.find((s) => s.category === 'DECISION_REQUEST');
    expect(step4?.requiresApproval).toBe(true);
    expect(step4?.permissionTier).toBe('APPROVAL_REQUIRED');

    // Test status update
    planner.updateStepStatus(step1!.id, 'COMPLETED', { result: { syncedPostings: 12 } });
    const refreshed = planner.getActivePlan(mission.id);
    const updatedStep1 = refreshed?.steps.find((s) => s.id === step1!.id);
    expect(updatedStep1?.status).toBe('COMPLETED');
    expect(updatedStep1?.result).toEqual({ syncedPostings: 12 });
  });
});
