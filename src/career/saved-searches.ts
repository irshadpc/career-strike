import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';
import type { CandidateContext } from './context.js';
import { JobQuery, listJobs } from './jobs.js';

export const SavedSearchInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    skills: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    countryCodes: z.array(z.string().trim().toUpperCase().min(2).max(10)).max(20).default([]),
    cities: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    workMode: z.enum(['remote', 'hybrid', 'onsite']).nullable().default(null),
    minMatchScore: z.number().min(0).max(1).nullable().default(null),
  })
  .strict();

export type SavedSearch = {
  id: string;
  name: string;
  skills: string[];
  countryCodes: string[];
  cities: string[];
  workMode: 'remote' | 'hybrid' | 'onsite' | null;
  minMatchScore: number | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  name: string;
  skills_json: string;
  country_codes_json: string;
  cities_json: string;
  work_mode: string | null;
  min_match_score: number | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function toSavedSearch(r: Row): SavedSearch {
  return {
    id: r.id,
    name: r.name,
    skills: parseJsonArray(r.skills_json),
    countryCodes: parseJsonArray(r.country_codes_json),
    cities: parseJsonArray(r.cities_json),
    workMode: r.work_mode === 'remote' || r.work_mode === 'hybrid' || r.work_mode === 'onsite' ? r.work_mode : null,
    minMatchScore: typeof r.min_match_score === 'number' ? r.min_match_score : null,
    lastRunAt: r.last_run_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listSavedSearches(db: Db): SavedSearch[] {
  const rows = db.prepare('SELECT * FROM saved_searches ORDER BY updated_at DESC').all() as Row[];
  return rows.map(toSavedSearch);
}

export function createSavedSearch(db: Db, input: z.infer<typeof SavedSearchInput>): SavedSearch {
  const id = `ss_${randomBytes(12).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO saved_searches (id, name, skills_json, country_codes_json, cities_json, work_mode, min_match_score, last_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    input.name,
    JSON.stringify(input.skills),
    JSON.stringify(input.countryCodes),
    JSON.stringify(input.cities),
    input.workMode,
    input.minMatchScore,
    now,
    now,
  );
  return getSavedSearch(db, id)!;
}

export function getSavedSearch(db: Db, id: string): SavedSearch | null {
  const row = db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id) as Row | undefined;
  return row ? toSavedSearch(row) : null;
}

export function deleteSavedSearch(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM saved_searches WHERE id = ?').run(id).changes > 0;
}

export function touchSavedSearchRun(db: Db, id: string, at = new Date().toISOString()): void {
  db.prepare('UPDATE saved_searches SET last_run_at = ?, updated_at = ? WHERE id = ?').run(at, at, id);
}

export interface ShortlistHit {
  searchId: string;
  searchName: string;
  job: ReturnType<typeof listJobs>['jobs'][number];
  matchedSkills: string[];
}

/**
 * "Today's Shortlist" - net-new matching roles since last run (or last 24h for never-run searches).
 */
export function todaysShortlist(
  db: Db,
  ctx: CandidateContext,
  now = Date.now(),
): { searches: SavedSearch[]; hits: ShortlistHit[] } {
  const searches = listSavedSearches(db);
  const hits: ShortlistHit[] = [];
  const seen = new Set<string>();
  for (const s of searches) {
    const since = s.lastRunAt ?? new Date(now - 24 * 60 * 60 * 1000).toISOString();
    for (const country of s.countryCodes.length > 0 ? s.countryCodes : [undefined]) {
      const q = JobQuery.safeParse({
        status: 'active',
        country,
        remote: s.workMode ?? undefined,
        limit: 50,
        sort: 'newest',
      });
      if (!q.success) continue;
      const res = listJobs(db, q.data, ctx);
      for (const job of res.jobs) {
        if (job.firstSeenAt < since) continue;
        if (s.cities.length > 0) {
          const hay = `${job.locationText ?? ''} ${job.normalizedLocation ?? ''}`.toLowerCase();
          if (!s.cities.some((c) => hay.includes(c.toLowerCase()))) continue;
        }
        if (s.skills.length > 0) {
          const allSkills = ((job as { allSkills?: string[] }).allSkills ?? []).map((x) => x.toLowerCase());
          const text = `${job.title} ${job.employer} ${job.locationText ?? ''}`.toLowerCase();
          const matched = s.skills.filter(
            (sk) => allSkills.includes(sk.toLowerCase()) || text.includes(sk.toLowerCase()),
          );
          if (matched.length === 0) continue;
          if (s.minMatchScore != null && matched.length / s.skills.length < s.minMatchScore) continue;
          const key = `${s.id}:${job.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({ searchId: s.id, searchName: s.name, job, matchedSkills: matched });
        } else {
          const key = `${s.id}:${job.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({ searchId: s.id, searchName: s.name, job, matchedSkills: [] });
        }
      }
    }
  }
  hits.sort((a, b) => (a.job.firstSeenAt < b.job.firstSeenAt ? 1 : -1));
  return { searches, hits: hits.slice(0, 30) };
}
