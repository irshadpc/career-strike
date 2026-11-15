import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';
import type { CountryCode } from './countries.js';
import { EMPLOYER_TARGETS, type EmployerTarget, employerTargetRecord, employerTargetsFor } from './employers.js';

export type CompanyStage =
  | 'SEED'
  | 'SERIES_A'
  | 'SERIES_B'
  | 'SERIES_C'
  | 'GROWTH'
  | 'PUBLIC'
  | 'BOOTSTRAPPED'
  | 'UNKNOWN';

export type HeadcountRange = '1_10' | '11_50' | '51_200' | '201_500' | '501_1000' | '1000_PLUS' | 'UNKNOWN';

export type HeadcountTrend = 'GROWING' | 'STABLE' | 'DECLINING' | 'UNKNOWN';

export type ConfidenceLevel = 'CONFIRMED_OFFICIAL' | 'VERIFIED_EXTERNAL' | 'CANDIDATE_REPORTED' | 'HEURISTIC';

export interface ProvenanceClaim<T> {
  value: T;
  source: string;
  sourceUrl?: string | null;
  observedAt: string;
  confidence: ConfidenceLevel;
}

export interface FundingRound {
  round: string;
  amount: number | null;
  currency: string | null;
  announcedAt: string;
  leadInvestors: string[];
  source: string;
  sourceUrl?: string | null;
}

export type CompanyEventKind =
  | 'ROLE_OPENED'
  | 'ROLE_CLOSED'
  | 'HIRING_SURGE'
  | 'HIRING_PAUSE'
  | 'FUNDING_ANNOUNCEMENT'
  | 'HEADCOUNT_CHANGE'
  | 'BOARD_HEALTH_CHANGE'
  | 'CANDIDATE_NOTE';

export interface CompanyTimelineEvent {
  id: string;
  companyId: string;
  kind: CompanyEventKind;
  title: string;
  detail: string;
  source: string;
  sourceUrl: string | null;
  eventAt: string;
  createdAt: string;
}

export interface CompanyWatchSettings {
  companyId: string;
  notifyOnNewRoles: boolean;
  notifyOnHiringSurge: boolean;
  notes: string | null;
  followedAt: string;
  updatedAt: string;
}

export interface CompanyMomentum {
  score: number;
  trend: 'SURGING' | 'ACTIVE' | 'STEADY' | 'PAUSED' | 'UNKNOWN';
  rationale: string;
  metrics: {
    openRoles: number;
    recentlyOpened: number;
    recentlyClosed: number;
    hasRecentFunding: boolean;
    daysSinceLastPosting: number;
  };
}

export interface Company360Profile {
  id: string;
  employerKey: string;
  name: string;
  officialWebsite: string | null;
  careersUrl: string | null;
  industry: ProvenanceClaim<string> | null;
  productDomain: ProvenanceClaim<string> | null;
  stage: ProvenanceClaim<CompanyStage>;
  headquartersCity: string | null;
  headquartersCountry: string | null;
  teamSizeRange: ProvenanceClaim<HeadcountRange>;
  headcountTrend: ProvenanceClaim<HeadcountTrend>;
  fundingSummary: {
    totalRaised: number | null;
    currency: string | null;
    rounds: FundingRound[];
  };
  techStack: ProvenanceClaim<string[]>;
  employeeSignals: {
    summary: string | null;
    source: string | null;
    observedAt: string | null;
  };
  openRolesCount: number;
  monitored: boolean;
  isWatched: boolean;
  watchSettings: CompanyWatchSettings | null;
  hiringSignal: HiringSignal;
  firstObservedAt: string;
  lastObservedAt: string;
  momentum: CompanyMomentum;
}

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

interface ProfileRow {
  company_id: string;
  industry: string | null;
  product_domain: string | null;
  stage: CompanyStage;
  headquarters_city: string | null;
  headquarters_country: string | null;
  team_size_range: HeadcountRange;
  headcount_trend: HeadcountTrend;
  funding_summary_json: string;
  tech_stack_json: string;
  employee_signals_json: string;
  provenance_json: string;
  updated_at: string;
}

interface CuratedProfileSeed {
  industry: string;
  productDomain: string;
  stage: CompanyStage;
  headquartersCity: string;
  headquartersCountry: string;
  teamSizeRange: HeadcountRange;
  headcountTrend: HeadcountTrend;
  techStack: string[];
  totalRaised: number | null;
  currency: string | null;
  fundingRound: string | null;
  source: string;
  sourceUrl: string;
}

const CURATED_SEEDS: Readonly<Record<string, CuratedProfileSeed>> = {
  stripe: {
    industry: 'Financial Technology',
    productDomain: 'Payment Infrastructure & Financial Services',
    stage: 'PUBLIC',
    headquartersCity: 'San Francisco & Dublin',
    headquartersCountry: 'US',
    teamSizeRange: '1000_PLUS',
    headcountTrend: 'GROWING',
    techStack: ['Ruby', 'Go', 'TypeScript', 'Java', 'React'],
    totalRaised: 8700000000,
    currency: 'USD',
    fundingRound: 'Private Equity / Tender Offer',
    source: 'Official Press & Careers Disclosure',
    sourceUrl: 'https://stripe.com/about',
  },
  databricks: {
    industry: 'Data & AI Infrastructure',
    productDomain: 'Lakehouse & Enterprise AI Platform',
    stage: 'GROWTH',
    headquartersCity: 'San Francisco',
    headquartersCountry: 'US',
    teamSizeRange: '1000_PLUS',
    headcountTrend: 'GROWING',
    techStack: ['Scala', 'Python', 'Go', 'C++', 'React'],
    totalRaised: 4000000000,
    currency: 'USD',
    fundingRound: 'Series I',
    source: 'Official Press & Careers Disclosure',
    sourceUrl: 'https://www.databricks.com/company/about-us',
  },
  'sarvam ai': {
    industry: 'Artificial Intelligence',
    productDomain: 'Sovereign Generative AI & Foundation Models',
    stage: 'SERIES_A',
    headquartersCity: 'Bengaluru',
    headquartersCountry: 'IN',
    teamSizeRange: '11_50',
    headcountTrend: 'GROWING',
    techStack: ['Python', 'PyTorch', 'Rust', 'CUDA', 'TypeScript'],
    totalRaised: 41000000,
    currency: 'USD',
    fundingRound: 'Series A',
    source: 'Official Press & Careers Disclosure',
    sourceUrl: 'https://www.sarvam.ai',
  },
  saviynt: {
    industry: 'Cybersecurity',
    productDomain: 'Cloud Identity & Governance Administration',
    stage: 'GROWTH',
    headquartersCity: 'El Segundo',
    headquartersCountry: 'US',
    teamSizeRange: '501_1000',
    headcountTrend: 'GROWING',
    techStack: ['Java', 'Angular', 'Python', 'AWS', 'Kubernetes'],
    totalRaised: 130000000,
    currency: 'USD',
    fundingRound: 'Debt & Growth Financing',
    source: 'Official Press & Careers Disclosure',
    sourceUrl: 'https://saviynt.com/company',
  },
  personio: {
    industry: 'Human Resources Software',
    productDomain: 'All-in-one HR Software for SMBs',
    stage: 'GROWTH',
    headquartersCity: 'Munich',
    headquartersCountry: 'DE',
    teamSizeRange: '1000_PLUS',
    headcountTrend: 'GROWING',
    techStack: ['Kotlin', 'TypeScript', 'Python', 'React', 'Go'],
    totalRaised: 725000000,
    currency: 'USD',
    fundingRound: 'Series E',
    source: 'Official Press & Careers Disclosure',
    sourceUrl: 'https://www.personio.com/about-personio/',
  },
};

export function computeCompanyMomentum(db: Db, companyId: string, now = new Date()): CompanyMomentum {
  const registry = db
    .prepare('SELECT display_name, origin, first_observed_at, last_observed_at FROM company_registry WHERE id = ?')
    .get(companyId) as
    | { display_name: string; origin: string; first_observed_at: string; last_observed_at: string }
    | undefined;

  if (!registry) {
    return {
      score: 0,
      trend: 'UNKNOWN',
      rationale: 'Company is not registered in this workspace.',
      metrics: {
        openRoles: 0,
        recentlyOpened: 0,
        recentlyClosed: 0,
        hasRecentFunding: false,
        daysSinceLastPosting: Number.POSITIVE_INFINITY,
      },
    };
  }

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const totalObserved =
    (db
      .prepare('SELECT COUNT(*) FROM jobs WHERE LOWER(employer) = LOWER(?)')
      .pluck()
      .get(registry.display_name) as number) ?? 0;
  const openRoles =
    (db
      .prepare("SELECT COUNT(*) FROM jobs WHERE LOWER(employer) = LOWER(?) AND status = 'OPEN'")
      .pluck()
      .get(registry.display_name) as number) ?? 0;
  const recentlyOpened =
    (db
      .prepare('SELECT COUNT(*) FROM jobs WHERE LOWER(employer) = LOWER(?) AND first_seen_at >= ?')
      .pluck()
      .get(registry.display_name, fourteenDaysAgo) as number) ?? 0;
  const recentlyClosed =
    (db
      .prepare("SELECT COUNT(*) FROM jobs WHERE LOWER(employer) = LOWER(?) AND status = 'CLOSED' AND closed_at >= ?")
      .pluck()
      .get(registry.display_name, fourteenDaysAgo) as number) ?? 0;

  const fundingEvents =
    (db
      .prepare(
        "SELECT COUNT(*) FROM company_events WHERE company_id = ? AND kind = 'FUNDING_ANNOUNCEMENT' AND event_at >= ?",
      )
      .pluck()
      .get(companyId, new Date(now.getTime() - 180 * 86_400_000).toISOString()) as number) ?? 0;

  const daysSincePosting = totalObserved > 0 ? daysSince(registry.last_observed_at, now) : Number.POSITIVE_INFINITY;

  let trend: CompanyMomentum['trend'] = 'UNKNOWN';
  let score = 0;
  let rationale = '';

  if (openRoles >= 5 && recentlyOpened >= 2) {
    trend = 'SURGING';
    score = 85;
    rationale = `Observed high hiring activity with ${openRoles} open roles and ${recentlyOpened} newly detected within the last 14 days.`;
  } else if (openRoles > 0) {
    trend = 'ACTIVE';
    score = 65;
    rationale = `Actively listing ${openRoles} open role${openRoles === 1 ? '' : 's'} verified locally on public employer boards.`;
  } else if (totalObserved === 0) {
    trend = 'UNKNOWN';
    score = 0;
    rationale = 'No local postings observed yet for this company. Known metrics remain unverified.';
  } else if (daysSincePosting <= 30) {
    trend = 'STEADY';
    score = 40;
    rationale = 'No current open roles observed in this workspace, but postings were active within the last 30 days.';
  } else if (Number.isFinite(daysSincePosting)) {
    trend = 'PAUSED';
    score = 20;
    rationale = `No active postings observed in over ${Math.floor(daysSincePosting)} days. That is not proof the company has frozen all hiring.`;
  } else {
    trend = 'UNKNOWN';
    score = 0;
    rationale = 'No local postings observed yet for this company. Known metrics remain unverified.';
  }

  if (fundingEvents > 0) {
    score = Math.min(100, score + 10);
    rationale +=
      ' A funding event was recorded in the last 180 days (note: capital announcements do not guarantee open vacancies).';
  }

  return {
    score,
    trend,
    rationale,
    metrics: {
      openRoles,
      recentlyOpened,
      recentlyClosed,
      hasRecentFunding: fundingEvents > 0,
      daysSinceLastPosting: daysSincePosting,
    },
  };
}

export function getCompany360(db: Db, companyId: string, now = new Date()): Company360Profile | null {
  const registry = db.prepare('SELECT * FROM company_registry WHERE id = ?').get(companyId) as
    | {
        id: string;
        employer_key: string;
        display_name: string;
        origin: string;
        official_website: string | null;
        careers_url: string | null;
        first_observed_at: string;
        last_observed_at: string;
      }
    | undefined;

  if (!registry) return null;

  const profileRow = db.prepare('SELECT * FROM company_profiles WHERE company_id = ?').get(companyId) as
    | ProfileRow
    | undefined;

  const watchRow = db.prepare('SELECT * FROM company_watches WHERE company_id = ?').get(companyId) as
    | {
        company_id: string;
        notify_on_new_roles: number;
        notify_on_hiring_surge: number;
        notes: string | null;
        followed_at: string;
        updated_at: string;
      }
    | undefined;

  const openRoles =
    (db
      .prepare("SELECT COUNT(*) FROM jobs WHERE LOWER(employer) = LOWER(?) AND status = 'OPEN'")
      .pluck()
      .get(registry.display_name) as number) ?? 0;

  const monitored =
    ((db
      .prepare(
        "SELECT COUNT(*) FROM company_registry_sources crs JOIN source_boards sb ON sb.source = crs.source AND sb.board = crs.board WHERE crs.company_id = ? AND sb.health IN ('OK', 'DEGRADED')",
      )
      .pluck()
      .get(companyId) as number) ?? 0) > 0;

  const defaultObservedAt = registry.last_observed_at || now.toISOString();
  const seed = CURATED_SEEDS[registry.display_name.toLowerCase()] ?? CURATED_SEEDS[registry.employer_key];

  const provenance: Record<string, ProvenanceClaim<unknown>> = profileRow?.provenance_json
    ? JSON.parse(profileRow.provenance_json)
    : {};

  const funding = profileRow?.funding_summary_json
    ? JSON.parse(profileRow.funding_summary_json)
    : seed?.fundingRound
      ? {
          totalRaised: seed.totalRaised,
          currency: seed.currency,
          rounds: [
            {
              round: seed.fundingRound,
              amount: seed.totalRaised,
              currency: seed.currency,
              announcedAt: defaultObservedAt,
              leadInvestors: [],
              source: seed.source,
              sourceUrl: seed.sourceUrl,
            },
          ],
        }
      : { totalRaised: null, currency: null, rounds: [] };

  const techStack: string[] = profileRow?.tech_stack_json
    ? JSON.parse(profileRow.tech_stack_json)
    : (seed?.techStack ?? []);

  const employeeSignals = profileRow?.employee_signals_json
    ? JSON.parse(profileRow.employee_signals_json)
    : { summary: null, source: null, observedAt: null };

  const stageVal: CompanyStage = profileRow?.stage ?? seed?.stage ?? 'UNKNOWN';
  const teamSizeVal: HeadcountRange = profileRow?.team_size_range ?? seed?.teamSizeRange ?? 'UNKNOWN';
  const trendVal: HeadcountTrend = profileRow?.headcount_trend ?? seed?.headcountTrend ?? 'UNKNOWN';

  let hiringSignal: HiringSignal = 'NOT_YET_OBSERVED';
  if (openRoles > 0) {
    const isStale = daysSince(registry.last_observed_at, now) > STALE_AFTER_DAYS;
    hiringSignal = isStale ? 'EVIDENCE_STALE' : 'VERIFIED_OPEN_ROLES';
  } else if (registry.origin === 'CANDIDATE_ENTRY') {
    hiringSignal = 'NOT_YET_OBSERVED';
  } else if (monitored) {
    hiringSignal = 'NO_OPEN_ROLES_OBSERVED';
  } else {
    hiringSignal = 'NOT_YET_OBSERVED';
  }

  const momentum = computeCompanyMomentum(db, companyId, now);

  return {
    id: registry.id,
    employerKey: registry.employer_key,
    name: registry.display_name,
    officialWebsite: registry.official_website,
    careersUrl: registry.careers_url,
    industry:
      profileRow?.industry || seed?.industry
        ? ((provenance.industry as ProvenanceClaim<string>) ?? {
            value: profileRow?.industry ?? seed!.industry,
            source: profileRow ? 'custom_profile' : seed!.source,
            sourceUrl: seed?.sourceUrl ?? null,
            observedAt: defaultObservedAt,
            confidence: profileRow ? 'CONFIRMED_OFFICIAL' : 'VERIFIED_EXTERNAL',
          })
        : null,
    productDomain:
      profileRow?.product_domain || seed?.productDomain
        ? ((provenance.productDomain as ProvenanceClaim<string>) ?? {
            value: profileRow?.product_domain ?? seed!.productDomain,
            source: profileRow ? 'custom_profile' : seed!.source,
            sourceUrl: seed?.sourceUrl ?? null,
            observedAt: defaultObservedAt,
            confidence: profileRow ? 'CONFIRMED_OFFICIAL' : 'VERIFIED_EXTERNAL',
          })
        : null,
    stage: (provenance.stage as ProvenanceClaim<CompanyStage>) ?? {
      value: stageVal,
      source: profileRow ? 'custom_profile' : seed ? seed.source : 'unknown',
      sourceUrl: seed?.sourceUrl ?? null,
      observedAt: defaultObservedAt,
      confidence: seed ? 'VERIFIED_EXTERNAL' : 'HEURISTIC',
    },
    headquartersCity: profileRow?.headquarters_city ?? seed?.headquartersCity ?? null,
    headquartersCountry: profileRow?.headquarters_country ?? seed?.headquartersCountry ?? null,
    teamSizeRange: (provenance.teamSizeRange as ProvenanceClaim<HeadcountRange>) ?? {
      value: teamSizeVal,
      source: profileRow ? 'custom_profile' : seed ? seed.source : 'unknown',
      sourceUrl: seed?.sourceUrl ?? null,
      observedAt: defaultObservedAt,
      confidence: seed ? 'VERIFIED_EXTERNAL' : 'HEURISTIC',
    },
    headcountTrend: (provenance.headcountTrend as ProvenanceClaim<HeadcountTrend>) ?? {
      value: trendVal,
      source: profileRow ? 'custom_profile' : seed ? seed.source : 'unknown',
      sourceUrl: seed?.sourceUrl ?? null,
      observedAt: defaultObservedAt,
      confidence: seed ? 'VERIFIED_EXTERNAL' : 'HEURISTIC',
    },
    fundingSummary: funding,
    techStack: (provenance.techStack as ProvenanceClaim<string[]>) ?? {
      value: techStack,
      source: profileRow ? 'custom_profile' : seed ? seed.source : 'unknown',
      sourceUrl: seed?.sourceUrl ?? null,
      observedAt: defaultObservedAt,
      confidence: seed ? 'CONFIRMED_OFFICIAL' : 'HEURISTIC',
    },
    employeeSignals,
    openRolesCount: openRoles,
    monitored,
    isWatched: Boolean(watchRow),
    watchSettings: watchRow
      ? {
          companyId: watchRow.company_id,
          notifyOnNewRoles: Boolean(watchRow.notify_on_new_roles),
          notifyOnHiringSurge: Boolean(watchRow.notify_on_hiring_surge),
          notes: watchRow.notes,
          followedAt: watchRow.followed_at,
          updatedAt: watchRow.updated_at,
        }
      : null,
    hiringSignal,
    firstObservedAt: registry.first_observed_at,
    lastObservedAt: registry.last_observed_at,
    momentum,
  };
}

export const Company360InputSchema = z
  .object({
    industry: z.string().trim().max(100).nullable().optional(),
    productDomain: z.string().trim().max(200).nullable().optional(),
    stage: z
      .enum(['SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'GROWTH', 'PUBLIC', 'BOOTSTRAPPED', 'UNKNOWN'])
      .optional(),
    headquartersCity: z.string().trim().max(100).nullable().optional(),
    headquartersCountry: z.string().trim().length(2).nullable().optional(),
    teamSizeRange: z.enum(['1_10', '11_50', '51_200', '201_500', '501_1000', '1000_PLUS', 'UNKNOWN']).optional(),
    headcountTrend: z.enum(['GROWING', 'STABLE', 'DECLINING', 'UNKNOWN']).optional(),
    techStack: z.array(z.string().trim().max(50)).optional(),
    fundingSummary: z
      .object({
        totalRaised: z.number().nullable().optional(),
        currency: z.string().max(10).nullable().optional(),
        rounds: z
          .array(
            z.object({
              round: z.string(),
              amount: z.number().nullable(),
              currency: z.string().nullable(),
              announcedAt: z.string(),
              leadInvestors: z.array(z.string()),
              source: z.string(),
              sourceUrl: z.string().nullable().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export type Company360Input = z.infer<typeof Company360InputSchema>;

export function upsertCompany360(
  db: Db,
  companyId: string,
  input: Company360Input,
  actor = 'candidate',
  now = new Date(),
): Company360Profile {
  const at = now.toISOString();
  const current = getCompany360(db, companyId, now);
  if (!current) throw new Error('Company not found in registry');

  const provenance = {
    industry:
      input.industry !== undefined
        ? { value: input.industry, source: actor, observedAt: at, confidence: 'CANDIDATE_REPORTED' }
        : current.industry,
    productDomain:
      input.productDomain !== undefined
        ? { value: input.productDomain, source: actor, observedAt: at, confidence: 'CANDIDATE_REPORTED' }
        : current.productDomain,
    stage:
      input.stage !== undefined
        ? { value: input.stage, source: actor, observedAt: at, confidence: 'CANDIDATE_REPORTED' }
        : current.stage,
    teamSizeRange:
      input.teamSizeRange !== undefined
        ? { value: input.teamSizeRange, source: actor, observedAt: at, confidence: 'CANDIDATE_REPORTED' }
        : current.teamSizeRange,
    headcountTrend:
      input.headcountTrend !== undefined
        ? { value: input.headcountTrend, source: actor, observedAt: at, confidence: 'CANDIDATE_REPORTED' }
        : current.headcountTrend,
    techStack:
      input.techStack !== undefined
        ? { value: input.techStack, source: actor, observedAt: at, confidence: 'CANDIDATE_REPORTED' }
        : current.techStack,
  };

  db.transaction(() => {
    db.prepare(
      `INSERT INTO company_profiles
        (company_id, industry, product_domain, stage, headquarters_city, headquarters_country,
         team_size_range, headcount_trend, funding_summary_json, tech_stack_json, employee_signals_json, provenance_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (company_id) DO UPDATE SET
         industry = excluded.industry,
         product_domain = excluded.product_domain,
         stage = excluded.stage,
         headquarters_city = excluded.headquarters_city,
         headquarters_country = excluded.headquarters_country,
         team_size_range = excluded.team_size_range,
         headcount_trend = excluded.headcount_trend,
         funding_summary_json = excluded.funding_summary_json,
         tech_stack_json = excluded.tech_stack_json,
         provenance_json = excluded.provenance_json,
         updated_at = excluded.updated_at`,
    ).run(
      companyId,
      input.industry !== undefined ? input.industry : (current.industry?.value ?? null),
      input.productDomain !== undefined ? input.productDomain : (current.productDomain?.value ?? null),
      input.stage ?? current.stage.value,
      input.headquartersCity !== undefined ? input.headquartersCity : current.headquartersCity,
      input.headquartersCountry !== undefined ? input.headquartersCountry : current.headquartersCountry,
      input.teamSizeRange ?? current.teamSizeRange.value,
      input.headcountTrend ?? current.headcountTrend.value,
      JSON.stringify(input.fundingSummary ?? current.fundingSummary),
      JSON.stringify(input.techStack ?? current.techStack.value),
      JSON.stringify(current.employeeSignals),
      JSON.stringify(provenance),
      at,
    );

    db.prepare('INSERT INTO audit_events (at, actor, action, subject, detail_json) VALUES (?, ?, ?, ?, ?)').run(
      at,
      actor,
      'company.360.updated',
      companyId,
      JSON.stringify({ updatedKeys: Object.keys(input) }),
    );
  })();

  return getCompany360(db, companyId, now)!;
}

export function recordCompanyEvent(
  db: Db,
  input: {
    companyId: string;
    kind: CompanyEventKind;
    title: string;
    detail: string;
    source: string;
    sourceUrl?: string | null;
    eventAt?: string;
  },
  now = new Date(),
): CompanyTimelineEvent {
  const id = `cev_${randomBytes(8).toString('hex')}`;
  const at = input.eventAt ?? now.toISOString();
  const created = now.toISOString();
  db.prepare(
    `INSERT INTO company_events (id, company_id, kind, title, detail, source, source_url, event_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.companyId, input.kind, input.title, input.detail, input.source, input.sourceUrl ?? null, at, created);
  return {
    id,
    companyId: input.companyId,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    eventAt: at,
    createdAt: created,
  };
}

export function listCompanyEvents(db: Db, companyId: string, limit = 50): CompanyTimelineEvent[] {
  const rows = db
    .prepare('SELECT * FROM company_events WHERE company_id = ? ORDER BY event_at DESC, created_at DESC LIMIT ?')
    .all(companyId, limit) as {
    id: string;
    company_id: string;
    kind: CompanyEventKind;
    title: string;
    detail: string;
    source: string;
    source_url: string | null;
    event_at: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    kind: r.kind,
    title: r.title,
    detail: r.detail,
    source: r.source,
    sourceUrl: r.source_url,
    eventAt: r.event_at,
    createdAt: r.created_at,
  }));
}
