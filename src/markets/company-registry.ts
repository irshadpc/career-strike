import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';
import { COUNTRY_CODES, type CountryCode } from './countries.js';
import { EMPLOYER_TARGETS, type EmployerTarget } from './employers.js';

/**
 * A market-wide employer registry. It is built from what this installation has actually seen in
 * public postings, plus the small curated target set and companies the candidate adds by hand.
 *
 * A registry entry is an index, not a vacancy claim. An employer with no local postings is
 * "registry only"; an employer whose local postings were last seen outside the freshness window
 * is "evidence stale". Neither state says anything about whether the employer is hiring.
 */
export type CompanyOrigin = 'OBSERVED_POSTING' | 'CURATED_TARGET' | 'CANDIDATE_ENTRY';
export type RegistrySignal =
  | 'VERIFIED_OPEN_ROLES'
  | 'NO_CURRENT_ROLES_OBSERVED'
  | 'EVIDENCE_STALE'
  | 'REGISTRY_ONLY'
  | 'CANDIDATE_ENTRY_UNVERIFIED';

export interface RegistryRole {
  title: string;
  location: string | null;
  lastSeenAt: string;
  status: 'OPEN' | 'CLOSED' | 'UNVERIFIED';
}

export interface RegistrySource {
  source: string;
  board: string;
  lastSeenAt: string;
}

export interface CompanyRegistryEntry {
  id: string;
  name: string;
  origin: CompanyOrigin;
  officialWebsite: string | null;
  careersUrl: string | null;
  markets: CountryCode[];
  sources: RegistrySource[];
  openRoles: number;
  observedRoles: number;
  lastObservedAt: string;
  firstObservedAt: string;
  signal: RegistrySignal;
  monitored: boolean;
  curatedTargetId: string | null;
  sampleRoles: RegistryRole[];
  explanation: string;
  evidence: string[];
  isWatched?: boolean;
}

export const CandidateCompany = z
  .object({
    name: z.string().trim().min(1, 'Enter the company name').max(200),
    officialWebsite: z.string().trim().url().max(2000).nullable().optional(),
    careersUrl: z.string().trim().url().max(2000).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

const STALE_AFTER_DAYS = 14;

/** Stable, spelling-insensitive key used to avoid duplicate registry entries. */
export function normalizeEmployerName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(
      /\b(?:inc|llc|ltd|limited|plc|gmbh|ag|sa|nv|bv|co|corp|corporation|company|technologies|technology|labs|group)\b\.?/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function companyId(key: string): string {
  return `company_${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

interface RegistryRow {
  id: string;
  employer_key: string;
  display_name: string;
  aliases_json: string;
  origin: CompanyOrigin;
  official_website: string | null;
  careers_url: string | null;
  first_observed_at: string;
  last_observed_at: string;
  notes: string | null;
}

interface JobRow {
  employer: string;
  title: string;
  location_text: string | null;
  status: 'OPEN' | 'CLOSED' | 'UNVERIFIED';
  last_seen_at: string;
  market_json: string;
}

interface SourceRow {
  source: string;
  board: string;
  last_seen_at: string;
}

/** Upsert one employer seen on a public board. Called after a job is stored. */
export function indexEmployer(
  db: Db,
  employer: string,
  at = new Date().toISOString(),
  source?: { source: string; board: string },
): string | null {
  const key = normalizeEmployerName(employer);
  if (!key) return null;
  const existing = db.prepare('SELECT * FROM company_registry WHERE employer_key = ?').get(key) as
    | RegistryRow
    | undefined;
  const id = existing?.id ?? companyId(key);
  db.transaction(() => {
    if (existing) {
      db.prepare(
        'UPDATE company_registry SET display_name = ?, last_observed_at = ? WHERE id = ? AND last_observed_at < ?',
      ).run(employer, at, id, at);
    } else {
      db.prepare(
        `INSERT INTO company_registry
           (id, employer_key, display_name, aliases_json, origin, first_observed_at, last_observed_at)
         VALUES (?, ?, ?, '[]', 'OBSERVED_POSTING', ?, ?)`,
      ).run(id, key, employer, at, at);
    }
    if (source) {
      db.prepare(
        `INSERT INTO company_registry_sources (company_id, source, board, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (company_id, source, board) DO UPDATE SET
           last_seen_at = CASE WHEN excluded.last_seen_at > last_seen_at THEN excluded.last_seen_at ELSE last_seen_at END`,
      ).run(id, source.source, source.board, at, at);
    }
  })();
  return id;
}

function curatedForKey(key: string): EmployerTarget | undefined {
  return EMPLOYER_TARGETS.find((target) => normalizeEmployerName(target.employer) === key);
}

/**
 * Index every employer already in the jobs table and every curated target. Idempotent; safe to
 * run at service start and before a registry read.
 */
export function backfillCompanyRegistry(db: Db, now = new Date()): number {
  const at = now.toISOString();
  const observed = db.prepare('SELECT DISTINCT employer FROM jobs').pluck().all() as string[];
  let added = 0;
  db.transaction(() => {
    for (const employer of observed) {
      const key = normalizeEmployerName(employer);
      if (!key) continue;
      const exists = db.prepare('SELECT 1 FROM company_registry WHERE employer_key = ?').get(key);
      if (!exists) added += 1;
      indexEmployer(db, employer, at);
    }
    for (const target of EMPLOYER_TARGETS) {
      const key = normalizeEmployerName(target.employer);
      const id = companyId(key);
      const exists = db.prepare('SELECT 1 FROM company_registry WHERE employer_key = ?').get(key) as
        | RegistryRow
        | undefined;
      if (!exists) {
        db.prepare(
          `INSERT INTO company_registry
             (id, employer_key, display_name, aliases_json, origin, official_website, careers_url, first_observed_at, last_observed_at, notes)
           VALUES (?, ?, ?, '[]', 'CURATED_TARGET', ?, ?, ?, ?, ?)`,
        ).run(
          id,
          key,
          target.employer,
          target.officialWebsite,
          target.careersUrl,
          at,
          at,
          `Curated target reviewed ${target.verifiedAt.slice(0, 10)}; board ${target.source}/${target.board}.`,
        );
        added += 1;
      } else if (exists.origin !== 'CANDIDATE_ENTRY') {
        db.prepare(
          `UPDATE company_registry SET origin = 'CURATED_TARGET', official_website = COALESCE(?, official_website),
             careers_url = COALESCE(?, careers_url), notes = COALESCE(notes, ?) WHERE id = ?`,
        ).run(
          target.officialWebsite,
          target.careersUrl,
          `Curated target reviewed ${target.verifiedAt.slice(0, 10)}; board ${target.source}/${target.board}.`,
          exists.id,
        );
      }
    }
  })();
  return added;
}

export function addCandidateCompany(db: Db, input: z.infer<typeof CandidateCompany>): CompanyRegistryEntry {
  const key = normalizeEmployerName(input.name);
  if (!key) throw new Error('Enter a company name using letters or numbers.');
  const at = new Date().toISOString();
  const id = companyId(key);
  const existing = db.prepare('SELECT * FROM company_registry WHERE employer_key = ?').get(key) as
    | RegistryRow
    | undefined;
  if (existing?.origin === 'CURATED_TARGET') {
    throw new Error('This company is already in the curated registry.');
  }
  db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE company_registry SET display_name = ?, origin = 'CANDIDATE_ENTRY',
           official_website = COALESCE(?, official_website), careers_url = COALESCE(?, careers_url),
           notes = COALESCE(?, notes) WHERE id = ?`,
      ).run(input.name, input.officialWebsite ?? null, input.careersUrl ?? null, input.notes ?? null, id);
    } else {
      db.prepare(
        `INSERT INTO company_registry
           (id, employer_key, display_name, aliases_json, origin, official_website, careers_url, first_observed_at, last_observed_at, notes)
         VALUES (?, ?, ?, '[]', 'CANDIDATE_ENTRY', ?, ?, ?, ?, ?)`,
      ).run(id, key, input.name, input.officialWebsite ?? null, input.careersUrl ?? null, at, at, input.notes ?? null);
    }
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(
      at,
      'dashboard',
      'company.registry.added',
      id,
    );
  })();
  const entry = listCompanyRegistry(db).find((item) => item.id === id);
  if (!entry) throw new Error('The company could not be added.');
  return entry;
}

function daysSince(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - then) / 86_400_000;
}

function marketCodes(marketJson: string): CountryCode[] {
  try {
    const value = JSON.parse(marketJson) as { location?: { countryCode?: unknown } };
    const code = value.location?.countryCode;
    return typeof code === 'string' && COUNTRY_CODES.includes(code as CountryCode) ? [code as CountryCode] : [];
  } catch {
    return [];
  }
}

export interface RegistryFilters {
  country?: CountryCode;
  query?: string;
  limit?: number;
}

/**
 * Read the registry with locally derived hiring evidence. `backfillCompanyRegistry` is run first so
 * a fresh installation or an older database presents the same complete index.
 */
export function listCompanyRegistry(db: Db, filters: RegistryFilters = {}, now = new Date()): CompanyRegistryEntry[] {
  backfillCompanyRegistry(db, now);
  const rows = db.prepare('SELECT * FROM company_registry ORDER BY display_name COLLATE NOCASE').all() as RegistryRow[];
  const jobs = db
    .prepare('SELECT employer, title, location_text, status, last_seen_at, market_json FROM jobs')
    .all() as JobRow[];
  const sources = db
    .prepare('SELECT company_id, source, board, last_seen_at FROM company_registry_sources')
    .all() as (SourceRow & { company_id: string })[];
  const adopted = new Set(
    (
      db
        .prepare("SELECT source || '/' || board FROM source_boards WHERE health IN ('OK', 'DEGRADED', 'NEVER_RUN')")
        .pluck()
        .all() as string[]
    ).map((value) => value.toLowerCase()),
  );

  const watchedIds = new Set(db.prepare('SELECT company_id FROM company_watches').pluck().all() as string[]);
  const rowById = new Map(rows.map((entry) => [entry.id, entry]));

  const byKey = new Map<string, { jobs: JobRow[]; sources: RegistrySource[] }>();
  for (const job of jobs) {
    const key = normalizeEmployerName(job.employer);
    if (!key) continue;
    const bucket = byKey.get(key) ?? { jobs: [], sources: [] };
    bucket.jobs.push(job);
    byKey.set(key, bucket);
  }
  for (const source of sources) {
    const row = rowById.get(source.company_id);
    if (!row) continue;
    const bucket = byKey.get(row.employer_key) ?? { jobs: [], sources: [] };
    bucket.sources.push({ source: source.source, board: source.board, lastSeenAt: source.last_seen_at });
    byKey.set(row.employer_key, bucket);
  }

  const q = filters.query?.trim().toLowerCase();
  const entries = rows
    .map((row) => {
      const target = curatedForKey(row.employer_key);
      const bucket = byKey.get(row.employer_key) ?? { jobs: [], sources: [] };
      const open = bucket.jobs.filter((job) => job.status === 'OPEN');
      const latest = [...bucket.jobs].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))[0]?.last_seen_at;
      const lastObservedAt = latest ?? row.last_observed_at;
      const markets = new Set<CountryCode>(target?.countries ?? []);
      for (const job of bucket.jobs) for (const code of marketCodes(job.market_json)) markets.add(code);

      let signal: RegistrySignal;
      if (row.origin === 'CANDIDATE_ENTRY' && bucket.jobs.length === 0) signal = 'CANDIDATE_ENTRY_UNVERIFIED';
      else if (bucket.jobs.length === 0) signal = 'REGISTRY_ONLY';
      else if (open.length === 0) signal = 'NO_CURRENT_ROLES_OBSERVED';
      else if (daysSince(latest ?? lastObservedAt, now) > STALE_AFTER_DAYS) signal = 'EVIDENCE_STALE';
      else signal = 'VERIFIED_OPEN_ROLES';

      const monitored = bucket.sources.some((source) => adopted.has(`${source.source}/${source.board}`.toLowerCase()));
      const explanation =
        signal === 'VERIFIED_OPEN_ROLES'
          ? `${open.length} open role${open.length === 1 ? '' : 's'} at this employer were retrieved locally from a public board within the freshness window. This is not a prediction of an interview.`
          : signal === 'EVIDENCE_STALE'
            ? `${open.length} locally held role${open.length === 1 ? '' : 's'} are more than ${STALE_AFTER_DAYS} days old. Refresh the source before relying on them.`
            : signal === 'NO_CURRENT_ROLES_OBSERVED'
              ? 'Postings from this employer were seen before, but none is currently open in this workspace. That is not evidence that the employer has stopped hiring.'
              : signal === 'CANDIDATE_ENTRY_UNVERIFIED'
                ? 'You added this company by hand. No public posting from it has been retrieved yet, so no hiring claim can be made.'
                : 'This employer is in the market registry, but no posting from it has been retrieved in this workspace. No hiring claim can be made.';

      const evidence = [
        `Origin: ${row.origin.replaceAll('_', ' ').toLowerCase()}.`,
        bucket.jobs.length
          ? `Observed ${bucket.jobs.length} posting${bucket.jobs.length === 1 ? '' : 's'} locally; latest ${lastObservedAt.slice(0, 10)}.`
          : 'No posting from this employer has been observed locally.',
        bucket.sources.length
          ? `Public source${bucket.sources.length === 1 ? '' : 's'}: ${bucket.sources.map((source) => `${source.source}/${source.board}`).join(', ')}.`
          : 'No public board is mapped to this registry entry.',
        target
          ? `Curated target reviewed ${target.verifiedAt.slice(0, 10)} from the employer's official careers presence.`
          : 'Registry membership is not employer verification.',
      ];

      return {
        id: row.id,
        name: row.display_name,
        origin: row.origin,
        officialWebsite: row.official_website ?? target?.officialWebsite ?? null,
        careersUrl: row.careers_url ?? target?.careersUrl ?? null,
        markets: [...markets].sort(),
        sources: bucket.sources.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
        openRoles: open.length,
        observedRoles: bucket.jobs.length,
        firstObservedAt: row.first_observed_at,
        lastObservedAt,
        signal,
        monitored,
        curatedTargetId: target?.id ?? null,
        sampleRoles: [...bucket.jobs]
          .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
          .slice(0, 5)
          .map((job) => ({
            title: job.title,
            location: job.location_text,
            lastSeenAt: job.last_seen_at,
            status: job.status,
          })),
        explanation,
        evidence,
        isWatched: watchedIds.has(row.id),
      } satisfies CompanyRegistryEntry;
    })
    .filter((entry) => {
      if (filters.country && !entry.markets.includes(filters.country)) return false;
      if (q && !entry.name.toLowerCase().includes(q)) return false;
      return true;
    });

  return filters.limit ? entries.slice(0, filters.limit) : entries;
}

export function registrySummary(entries: readonly CompanyRegistryEntry[]): {
  total: number;
  verifiedOpenRoles: number;
  registryOnly: number;
  stale: number;
  monitored: number;
  watched: number;
} {
  return {
    total: entries.length,
    verifiedOpenRoles: entries.filter((entry) => entry.signal === 'VERIFIED_OPEN_ROLES').length,
    registryOnly: entries.filter(
      (entry) => entry.signal === 'REGISTRY_ONLY' || entry.signal === 'CANDIDATE_ENTRY_UNVERIFIED',
    ).length,
    stale: entries.filter((entry) => entry.signal === 'EVIDENCE_STALE').length,
    monitored: entries.filter((entry) => entry.monitored).length,
    watched: entries.filter((entry) => entry.isWatched).length,
  };
}

export function setCompanyWatch(
  db: Db,
  companyId: string,
  watch: boolean,
  options: { notifyOnNewRoles?: boolean; notifyOnHiringSurge?: boolean; notes?: string } = {},
  now = new Date(),
): boolean {
  const at = now.toISOString();
  if (!watch) {
    const changes = db.prepare('DELETE FROM company_watches WHERE company_id = ?').run(companyId).changes;
    return changes > 0;
  }
  db.prepare(
    `INSERT INTO company_watches (company_id, notify_on_new_roles, notify_on_hiring_surge, notes, followed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (company_id) DO UPDATE SET
       notify_on_new_roles = excluded.notify_on_new_roles,
       notify_on_hiring_surge = excluded.notify_on_hiring_surge,
       notes = excluded.notes,
       updated_at = excluded.updated_at`,
  ).run(
    companyId,
    (options.notifyOnNewRoles ?? true) ? 1 : 0,
    (options.notifyOnHiringSurge ?? false) ? 1 : 0,
    options.notes ?? null,
    at,
    at,
  );
  return true;
}

export function listWatchedCompanyIds(db: Db): string[] {
  return db.prepare('SELECT company_id FROM company_watches ORDER BY followed_at DESC').pluck().all() as string[];
}

export function isCompanyWatched(db: Db, companyId: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM company_watches WHERE company_id = ?').get(companyId));
}
