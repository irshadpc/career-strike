import { randomBytes } from 'node:crypto';
import type { Db } from '../store/db.js';
import type { CareerMission } from './mission.js';
import { type CareerState, nextActions } from './next-actions.js';

export type PlanCategory =
  | 'DISCOVERY'
  | 'RESEARCH'
  | 'EVALUATION'
  | 'PREPARATION'
  | 'DECISION_REQUEST'
  | 'STRATEGY_REVIEW';

export type PermissionTier = 'AUTOMATIC' | 'CONFIRMATION_REQUIRED' | 'APPROVAL_REQUIRED';

export type StepStatus = 'PENDING' | 'RUNNING' | 'BLOCKED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface PlanStepSpec {
  objective: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: PlanCategory;
  permissionTier: PermissionTier;
  dependencies: string[];
  estimatedMinutes: number;
  requiresApproval: boolean;
  evidenceRequirements?: string[];
  recoveryInstructions?: string;
}

export interface CareerPlanStep {
  id: string;
  planId: string;
  stepOrder: number;
  objective: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: PlanCategory;
  permissionTier: PermissionTier;
  dependencies: string[];
  estimatedMinutes: number | null;
  status: StepStatus;
  taskId: string | null;
  requiresApproval: boolean;
  approvalState: 'NONE' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED';
  evidenceRequirements: string[];
  recoveryInstructions: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CareerPlanWithSteps {
  id: string;
  missionId: string;
  title: string;
  track: 'TRACK_A' | 'TRACK_B' | 'HYBRID';
  summary: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  steps: CareerPlanStep[];
  createdAt: string;
  updatedAt: string;
}

interface StepRow {
  id: string;
  plan_id: string;
  step_order: number;
  objective: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: PlanCategory;
  permission_tier: PermissionTier;
  dependencies_json: string;
  estimated_minutes: number | null;
  status: StepStatus;
  task_id: string | null;
  requires_approval: number;
  approval_state: 'NONE' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED';
  evidence_requirements_json: string;
  recovery_instructions: string | null;
  result_json: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const toStep = (row: StepRow): CareerPlanStep => ({
  id: row.id,
  planId: row.plan_id,
  stepOrder: row.step_order,
  objective: row.objective,
  reason: row.reason,
  priority: row.priority,
  category: row.category,
  permissionTier: row.permission_tier,
  dependencies: JSON.parse(row.dependencies_json || '[]'),
  estimatedMinutes: row.estimated_minutes,
  status: row.status,
  taskId: row.task_id,
  requiresApproval: row.requires_approval === 1,
  approvalState: row.approval_state,
  evidenceRequirements: JSON.parse(row.evidence_requirements_json || '[]'),
  recoveryInstructions: row.recovery_instructions,
  result: row.result_json ? JSON.parse(row.result_json) : null,
  error: row.error,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class CareerPlanner {
  constructor(private readonly db: Db) {}

  generatePlan(
    mission: CareerMission,
    state: CareerState,
    track: 'TRACK_A' | 'TRACK_B' | 'HYBRID' = 'TRACK_A',
  ): CareerPlanWithSteps {
    const planId = `plan_${randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    // Re-use deterministic next-action rules to detect blockers or high-priority needs
    const actions = nextActions(state);
    const stepSpecs: PlanStepSpec[] = [];

    // Step 1: Sources and Verification
    const failingBoards = state.boards?.filter((b) => b.health !== 'OK') ?? [];
    if (failingBoards.length > 0) {
      stepSpecs.push({
        objective: 'Diagnose degraded employer job boards',
        reason: `${failingBoards.length} monitored boards reported connection or format errors.`,
        priority: 'HIGH',
        category: 'DISCOVERY',
        permissionTier: 'AUTOMATIC',
        dependencies: [],
        estimatedMinutes: 3,
        requiresApproval: false,
        recoveryInstructions: 'Retry board polling with exponential backoff or inspect URL updates.',
      });
    } else {
      stepSpecs.push({
        objective: 'Synchronize verified employer career feeds',
        reason: 'Ensure candidate explores live vacancies observed within 72 hours.',
        priority: 'HIGH',
        category: 'DISCOVERY',
        permissionTier: 'AUTOMATIC',
        dependencies: [],
        estimatedMinutes: 2,
        requiresApproval: false,
      });
    }

    // Step 2: Multi-dimensional Opportunity Evaluation
    const targetRoles =
      track === 'TRACK_B' && mission.adjacentRoles.length > 0 ? mission.adjacentRoles : mission.targetRoles;

    stepSpecs.push({
      objective: `Evaluate 6D decision shortlists for ${targetRoles.slice(0, 2).join(' & ')}`,
      reason: `Apply multi-dimensional evaluation (Eligibility, Relevance, Preferences, Confidence, Context, Effort) to rank ${track} opportunities.`,
      priority: 'HIGH',
      category: 'EVALUATION',
      permissionTier: 'AUTOMATIC',
      dependencies: ['step_1'],
      estimatedMinutes: 5,
      requiresApproval: false,
      evidenceRequirements: ['Verified job posting', 'Confirmed candidate skills and roles'],
    });

    // Step 3: Application Rehearsal & Concierge Preparation
    stepSpecs.push({
      objective: 'Prepare tailored application package and factual screening answers',
      reason:
        'Draft tailored resume variant and verify evidence citations against quoted requirements without hallucination.',
      priority: 'HIGH',
      category: 'PREPARATION',
      permissionTier: 'AUTOMATIC',
      dependencies: ['step_2'],
      estimatedMinutes: 10,
      requiresApproval: false,
      evidenceRequirements: ['Signed profile facts', 'Quoted employer requirements'],
    });

    // Step 4: Decision Request & Review
    stepSpecs.push({
      objective: 'Present Daily Briefing and request candidate decision',
      reason:
        'Candidate remains the sole principal authority. No submission occurs without explicit candidate sign-off.',
      priority: 'HIGH',
      category: 'DECISION_REQUEST',
      permissionTier: 'APPROVAL_REQUIRED',
      dependencies: ['step_3'],
      estimatedMinutes: 5,
      requiresApproval: true,
      recoveryInstructions: 'If candidate declines or skips, record feedback into the learning loop and archive plan.',
    });

    // Strategy Review if profile gaps or unconfirmed submissions exist
    const profileAction = actions.find((a) => a.rule.startsWith('profile.'));
    if (profileAction) {
      stepSpecs.push({
        objective: profileAction.title,
        reason: profileAction.reason,
        priority: 'HIGH',
        category: 'STRATEGY_REVIEW',
        permissionTier: 'CONFIRMATION_REQUIRED',
        dependencies: [],
        estimatedMinutes: 5,
        requiresApproval: true,
      });
    }

    // Strategy Review if prior applications are awaiting confirmation or follow-up
    if (state.applications && state.applications.awaitingConfirmation > 0) {
      stepSpecs.push({
        objective: 'Confirm submission outcomes for pending applications',
        reason: `${state.applications.awaitingConfirmation} applications require external submission verification.`,
        priority: 'MEDIUM',
        category: 'STRATEGY_REVIEW',
        permissionTier: 'CONFIRMATION_REQUIRED',
        dependencies: [],
        estimatedMinutes: 2,
        requiresApproval: false,
      });
    }

    this.db.transaction(() => {
      // Archive prior active plans for this mission
      this.db
        .prepare(
          "UPDATE career_plans SET status = 'CANCELLED', updated_at = ? WHERE mission_id = ? AND status = 'ACTIVE'",
        )
        .run(now, mission.id);

      this.db
        .prepare(`
          INSERT INTO career_plans (id, mission_id, title, track, summary, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `)
        .run(
          planId,
          mission.id,
          `Autonomous Career Plan: ${mission.title}`,
          track,
          `Goal-driven execution plan for ${track === 'TRACK_A' ? 'immediate opportunity' : 'ambitious career growth'}.`,
          now,
          now,
        );

      stepSpecs.forEach((s, idx) => {
        const stepId = `step_${planId}_${idx + 1}`;
        this.db
          .prepare(`
            INSERT INTO career_plan_steps (
              id, plan_id, step_order, objective, reason, priority, category,
              permission_tier, dependencies_json, estimated_minutes, status,
              requires_approval, approval_state, evidence_requirements_json,
              recovery_instructions, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 'NONE', ?, ?, ?, ?)
          `)
          .run(
            stepId,
            planId,
            idx + 1,
            s.objective,
            s.reason,
            s.priority,
            s.category,
            s.permissionTier,
            JSON.stringify(s.dependencies),
            s.estimatedMinutes,
            s.requiresApproval ? 1 : 0,
            JSON.stringify(s.evidenceRequirements ?? []),
            s.recoveryInstructions ?? null,
            now,
            now,
          );
      });

      this.db
        .prepare(`
          INSERT INTO assistant_activity_ledger (id, category, title, detail, entity_type, entity_id, provenance, created_at)
          VALUES (?, 'OBSERVATION', ?, ?, 'plan', ?, 'planner', ?)
        `)
        .run(
          `act_${randomBytes(6).toString('hex')}`,
          'Career Execution Plan Formulated',
          `Autonomous planner generated ${stepSpecs.length}-step plan for ${track}: "${mission.title}"`,
          planId,
          now,
        );
    })();

    return this.getActivePlan(mission.id)!;
  }

  getActivePlan(missionId: string): CareerPlanWithSteps | null {
    const plan = this.db
      .prepare("SELECT * FROM career_plans WHERE mission_id = ? AND status = 'ACTIVE' LIMIT 1")
      .get(missionId) as
      | {
          id: string;
          mission_id: string;
          title: string;
          track: 'TRACK_A' | 'TRACK_B' | 'HYBRID';
          summary: string;
          status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!plan) return null;

    const steps = this.db
      .prepare('SELECT * FROM career_plan_steps WHERE plan_id = ? ORDER BY step_order ASC')
      .all(plan.id) as StepRow[];

    return {
      id: plan.id,
      missionId: plan.mission_id,
      title: plan.title,
      track: plan.track,
      summary: plan.summary,
      status: plan.status,
      steps: steps.map(toStep),
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
    };
  }

  updateStepStatus(
    stepId: string,
    status: StepStatus,
    outcome: { result?: Record<string, unknown>; error?: string } = {},
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        UPDATE career_plan_steps SET
          status = ?,
          result_json = ?,
          error = ?,
          completed_at = CASE WHEN ? IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN ? ELSE completed_at END,
          started_at = CASE WHEN ? = 'RUNNING' AND started_at IS NULL THEN ? ELSE started_at END,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        status,
        outcome.result ? JSON.stringify(outcome.result) : null,
        outcome.error ?? null,
        status,
        now,
        status,
        now,
        now,
        stepId,
      );
  }
}
