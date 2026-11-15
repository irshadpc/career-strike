import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';

export const SearchTrack = z.enum(['TRACK_A', 'TRACK_B', 'HYBRID']);
export type SearchTrack = z.infer<typeof SearchTrack>;

export const CareerMissionSchema = z.object({
  title: z.string().trim().min(1).max(140),
  desiredOutcome: z.string().trim().min(1).max(2000),
  targetRoles: z.array(z.string().trim().min(1).max(100)).min(1),
  adjacentRoles: z.array(z.string().trim().min(1).max(100)).default([]),
  trackAParams: z.record(z.string(), z.unknown()).default({}), // Realistic immediate role targets
  trackBParams: z.record(z.string(), z.unknown()).default({}), // Ambitious stretch role targets
  salaryFloor: z.number().nullable().default(null),
  salaryCurrency: z.string().max(10).nullable().default(null),
  targetLocations: z.array(z.string().trim().min(1).max(100)).default([]),
  remotePolicy: z.enum(['remote_only', 'remote_first', 'hybrid', 'onsite', 'any']).default('remote_only'),
  relocationWillingness: z.boolean().default(false),
  workAuthorizations: z.record(z.string(), z.string()).default({}),
  joiningAvailability: z.string().default('unspecified'),
  companyPreferences: z
    .object({
      stages: z.array(z.string()).default([]),
      domains: z.array(z.string()).default([]),
      headcountRange: z.array(z.string()).default([]),
    })
    .default({ stages: [], domains: [], headcountRange: [] }),
  careerGrowthPriorities: z.array(z.string()).default([]),
  nonNegotiables: z.array(z.string()).default([]),
  searchUrgency: z.enum(['high', 'moderate', 'passive']).default('moderate'),
  weeklyEffortHours: z.number().int().min(1).max(80).default(5),
  successCriteria: z.array(z.string()).default([]),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).default('ACTIVE'),
});

export type CareerMissionInput = z.input<typeof CareerMissionSchema>;

export type CareerMission = z.infer<typeof CareerMissionSchema> & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export interface MissionHistoryEntry {
  id: number;
  missionId: string;
  version: number;
  changeSummary: string;
  snapshot: CareerMission;
  actor: string;
  createdAt: string;
}

interface MissionRow {
  id: string;
  version: number;
  title: string;
  desired_outcome: string;
  target_roles_json: string;
  adjacent_roles_json: string;
  track_a_params_json: string;
  track_b_params_json: string;
  salary_floor: number | null;
  salary_currency: string | null;
  target_locations_json: string;
  remote_policy: 'remote_only' | 'remote_first' | 'hybrid' | 'onsite' | 'any';
  relocation_willingness: number;
  work_authorization_json: string;
  joining_availability: string;
  company_preferences_json: string;
  career_growth_priorities_json: string;
  non_negotiables_json: string;
  search_urgency: 'high' | 'moderate' | 'passive';
  weekly_effort_hours: number;
  success_criteria_json: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

const parseJsonSafe = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

const toMission = (row: MissionRow): CareerMission => ({
  id: row.id,
  version: row.version,
  title: row.title,
  desiredOutcome: row.desired_outcome,
  targetRoles: parseJsonSafe(row.target_roles_json, []),
  adjacentRoles: parseJsonSafe(row.adjacent_roles_json, []),
  trackAParams: parseJsonSafe(row.track_a_params_json, {}),
  trackBParams: parseJsonSafe(row.track_b_params_json, {}),
  salaryFloor: row.salary_floor,
  salaryCurrency: row.salary_currency,
  targetLocations: parseJsonSafe(row.target_locations_json, []),
  remotePolicy: row.remote_policy,
  relocationWillingness: row.relocation_willingness === 1,
  workAuthorizations: parseJsonSafe(row.work_authorization_json, {}),
  joiningAvailability: row.joining_availability,
  companyPreferences: parseJsonSafe(row.company_preferences_json, { stages: [], domains: [], headcountRange: [] }),
  careerGrowthPriorities: parseJsonSafe(row.career_growth_priorities_json, []),
  nonNegotiables: parseJsonSafe(row.non_negotiables_json, []),
  searchUrgency: row.search_urgency,
  weeklyEffortHours: row.weekly_effort_hours,
  successCriteria: parseJsonSafe(row.success_criteria_json, []),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function getActiveMission(db: Db): CareerMission | null {
  const row = db
    .prepare("SELECT * FROM career_missions WHERE status = 'ACTIVE' ORDER BY updated_at DESC LIMIT 1")
    .get() as MissionRow | undefined;
  return row ? toMission(row) : null;
}

export function getMissionById(db: Db, id: string): CareerMission | null {
  const row = db.prepare('SELECT * FROM career_missions WHERE id = ?').get(id) as MissionRow | undefined;
  return row ? toMission(row) : null;
}

export function saveMission(
  db: Db,
  input: CareerMissionInput,
  actor = 'candidate',
  changeNote = 'Updated career mission parameters',
): CareerMission {
  const parsed = CareerMissionSchema.parse(input);
  const now = new Date().toISOString();
  const existing = getActiveMission(db);

  if (!existing) {
    const id = `mission_${randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO career_missions (
        id, version, title, desired_outcome, target_roles_json, adjacent_roles_json,
        track_a_params_json, track_b_params_json, salary_floor, salary_currency,
        target_locations_json, remote_policy, relocation_willingness, work_authorization_json,
        joining_availability, company_preferences_json, career_growth_priorities_json,
        non_negotiables_json, search_urgency, weekly_effort_hours, success_criteria_json,
        status, created_at, updated_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      parsed.title,
      parsed.desiredOutcome,
      JSON.stringify(parsed.targetRoles),
      JSON.stringify(parsed.adjacentRoles),
      JSON.stringify(parsed.trackAParams),
      JSON.stringify(parsed.trackBParams),
      parsed.salaryFloor,
      parsed.salaryCurrency,
      JSON.stringify(parsed.targetLocations),
      parsed.remotePolicy,
      parsed.relocationWillingness ? 1 : 0,
      JSON.stringify(parsed.workAuthorizations),
      parsed.joiningAvailability,
      JSON.stringify(parsed.companyPreferences),
      JSON.stringify(parsed.careerGrowthPriorities),
      JSON.stringify(parsed.nonNegotiables),
      parsed.searchUrgency,
      parsed.weeklyEffortHours,
      JSON.stringify(parsed.successCriteria),
      parsed.status,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO assistant_activity_ledger (id, category, title, detail, entity_type, entity_id, provenance, created_at)
      VALUES (?, 'OBSERVATION', ?, ?, 'mission', ?, ?, ?)
    `).run(
      `act_${randomBytes(6).toString('hex')}`,
      'Career Mission Initialized',
      `Personal career mission established: ${parsed.title}`,
      id,
      actor,
      now,
    );

    return getActiveMission(db)!;
  }

  const nextVersion = existing.version + 1;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO career_mission_history (mission_id, version, change_summary, snapshot_json, actor, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(existing.id, existing.version, changeNote, JSON.stringify(existing), actor, now);

    db.prepare(`
      UPDATE career_missions SET
        version = ?, title = ?, desired_outcome = ?, target_roles_json = ?, adjacent_roles_json = ?,
        track_a_params_json = ?, track_b_params_json = ?, salary_floor = ?, salary_currency = ?,
        target_locations_json = ?, remote_policy = ?, relocation_willingness = ?, work_authorization_json = ?,
        joining_availability = ?, company_preferences_json = ?, career_growth_priorities_json = ?,
        non_negotiables_json = ?, search_urgency = ?, weekly_effort_hours = ?, success_criteria_json = ?,
        status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      nextVersion,
      parsed.title,
      parsed.desiredOutcome,
      JSON.stringify(parsed.targetRoles),
      JSON.stringify(parsed.adjacentRoles),
      JSON.stringify(parsed.trackAParams),
      JSON.stringify(parsed.trackBParams),
      parsed.salaryFloor,
      parsed.salaryCurrency,
      JSON.stringify(parsed.targetLocations),
      parsed.remotePolicy,
      parsed.relocationWillingness ? 1 : 0,
      JSON.stringify(parsed.workAuthorizations),
      parsed.joiningAvailability,
      JSON.stringify(parsed.companyPreferences),
      JSON.stringify(parsed.careerGrowthPriorities),
      JSON.stringify(parsed.nonNegotiables),
      parsed.searchUrgency,
      parsed.weeklyEffortHours,
      JSON.stringify(parsed.successCriteria),
      parsed.status,
      now,
      existing.id,
    );

    db.prepare(`
      INSERT INTO assistant_activity_ledger (id, category, title, detail, entity_type, entity_id, provenance, created_at)
      VALUES (?, 'STRATEGY_SHIFT', ?, ?, 'mission', ?, ?, ?)
    `).run(
      `act_${randomBytes(6).toString('hex')}`,
      `Career Mission v${nextVersion} Updated`,
      changeNote,
      existing.id,
      actor,
      now,
    );
  })();

  return getActiveMission(db)!;
}

export function listMissionHistory(db: Db, missionId: string): MissionHistoryEntry[] {
  const rows = db
    .prepare('SELECT * FROM career_mission_history WHERE mission_id = ? ORDER BY version DESC')
    .all(missionId) as {
    id: number;
    mission_id: string;
    version: number;
    change_summary: string;
    snapshot_json: string;
    actor: string;
    created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    missionId: r.mission_id,
    version: r.version,
    changeSummary: r.change_summary,
    snapshot: JSON.parse(r.snapshot_json) as CareerMission,
    actor: r.actor,
    createdAt: r.created_at,
  }));
}
