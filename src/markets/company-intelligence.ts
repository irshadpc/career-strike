import type { Db } from '../store/db.js';
import type { CountryCode } from './countries.js';
import { EMPLOYER_TARGETS, type EmployerTarget, employerTargetRecord, employerTargetsFor } from './employers.js';

/**
 * Company intelligence is derived only from evidence held by this installation: the curated
 * target record, the adopted board's health, and postings actually retrieved into the local jobs
 * table. It never infers hiring from an employer's size, funding, news or a third-party estimate.
 */
export type HiringSignal =
  | 'VERIFIED_OPEN_ROLES'
  | 'NO_OPEN_ROLES_OBSERVED'
  | 'EVIDENCE_STALE'
  | 'BOARD_UNAVAILABLE'
  | 'NOT_YET_OBSERVED';

export interface CompanyRoleSignal {
  title: string;
  location: string | null;
  lastSeenAt: string;
}

export interface CompanySignal {
  id: string;
  employer: string;
  officialWebsite: string;
  careersUrl: string;
  countries: readonly CountryCode[];
  source: EmployerTarget['source'];
  board: string;
  boardUrl: string;
  signal: HiringSignal;
  openRoles: number;
  lastSuccessfulRetrievalAt: string | null;
  lastVerifiedAt: string | null;
  sampleRoles: CompanyRoleSignal[];
  explanation: string;
  evidence: string[];
}

interface JobRow {
  title: string;
  location_text: string | null;
  last_seen_at: string;
}

const STALE_AFTER_DAYS = 14;

function daysSince(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - then) / 86_400_000;
}

function companySignal(db: Db, target: EmployerTarget, now: Date): CompanySignal {
  const record = employerTargetRecord(db, target);
  const countryPlaceholders = target.countries.map(() => '?').join(', ');
  const scope = `LOWER(employer) = LOWER(?) AND status = 'OPEN'
    AND json_extract(market_json, '$.location.countryCode') IN (${countryPlaceholders})`;
  const params = [target.employer, ...target.countries];
  const jobs = db
    .prepare(
      `SELECT title, location_text, last_seen_at
       FROM jobs
       WHERE ${scope}
       ORDER BY COALESCE(published_at, last_seen_at) DESC
       LIMIT 5`,
    )
    .all(...params) as JobRow[];
  const openRoles =
    (db
      .prepare(`SELECT COUNT(*) FROM jobs WHERE ${scope}`)
      .pluck()
      .get(...params) as number) ?? 0;
  const newestSeen = jobs[0]?.last_seen_at ?? null;
  const stale = newestSeen ? daysSince(newestSeen, now) > STALE_AFTER_DAYS : false;
  const marketLabel = target.countries.join(', ');

  let signal: HiringSignal;
  if (record.monitoringState === 'NOT_ADOPTED') signal = 'NOT_YET_OBSERVED';
  else if (record.monitoringState === 'NOT_FOUND' || record.monitoringState === 'DEGRADED')
    signal = 'BOARD_UNAVAILABLE';
  else if (openRoles === 0) signal = 'NO_OPEN_ROLES_OBSERVED';
  else if (stale) signal = 'EVIDENCE_STALE';
  else signal = 'VERIFIED_OPEN_ROLES';

  const explanation =
    signal === 'VERIFIED_OPEN_ROLES'
      ? `${openRoles} open role${openRoles === 1 ? '' : 's'} with an explicit ${marketLabel} location were retrieved locally from this employer's public board within the freshness window.`
      : signal === 'NO_OPEN_ROLES_OBSERVED'
        ? `The board was retrieved successfully, but it currently shows no open roles with an explicit ${marketLabel} location in this workspace. That is not evidence that the employer has stopped hiring.`
        : signal === 'EVIDENCE_STALE'
          ? `The local copy of ${openRoles} open role${openRoles === 1 ? '' : 's'} for ${marketLabel} is more than ${STALE_AFTER_DAYS} days old. Refresh the board before relying on it.`
          : signal === 'BOARD_UNAVAILABLE'
            ? 'The last local retrieval of this board did not succeed. No current hiring claim can be made.'
            : 'This board has not been retrieved in this workspace yet. No hiring claim can be made.';

  const evidence = [
    `Curated target verified ${target.verifiedAt.slice(0, 10)} from the employer's official careers presence and public board.`,
    record.lastSuccessfulRetrievalAt
      ? `Last successful local retrieval: ${record.lastSuccessfulRetrievalAt}.`
      : 'No successful local retrieval recorded.',
    signal === 'VERIFIED_OPEN_ROLES' || signal === 'EVIDENCE_STALE'
      ? `Postings are matched by the exact employer name recorded on the curated target.`
      : 'Open-role count is therefore not treated as a vacancy claim.',
  ];

  return {
    id: target.id,
    employer: target.employer,
    officialWebsite: target.officialWebsite,
    careersUrl: target.careersUrl,
    countries: target.countries,
    source: target.source,
    board: target.board,
    boardUrl: target.boardUrl,
    signal,
    openRoles,
    lastSuccessfulRetrievalAt: record.lastSuccessfulRetrievalAt,
    lastVerifiedAt: record.lastVerificationAt,
    sampleRoles: jobs.map((job) => ({
      title: job.title,
      location: job.location_text,
      lastSeenAt: job.last_seen_at,
    })),
    explanation,
    evidence,
  };
}

export function companySignals(db: Db, country?: CountryCode, now = new Date()): CompanySignal[] {
  const targets = country ? employerTargetsFor(country) : EMPLOYER_TARGETS;
  return targets.map((target) => companySignal(db, target, now));
}

/** All curated companies, de-duplicated by target id. Used by the dashboard company panel. */
export function allCompanySignals(db: Db, now = new Date()): CompanySignal[] {
  return companySignals(db, undefined, now);
}
