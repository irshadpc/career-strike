import { z } from 'zod';
import { type FetchImpl, guardedGetJson } from './fetch-guard.js';
import { htmlToBlocks } from './html.js';
import {
  employmentTypeFrom,
  isoOrNull,
  marketFacts,
  remotePolicyFrom,
  safeHttpUrl,
  unresolvedFacts,
} from './normalize.js';
import type { NormalizedPosting, SourceAdapter } from './types.js';
import { SourceError } from './types.js';

/** Parse a source's JSON with a schema, raising a typed SourceError on mismatch. */
function parseFeed<T>(schema: z.ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new SourceError('schema', `${source} feed returned unexpected JSON.`);
  return result.data;
}

/**
 * Keyless global remote-job feeds (resume-studio audit Step 2, "Global Keyless Feeds").
 * Neither feed needs an API key; both publish structured JSON that maps cleanly onto a posting.
 */

const nullableString = z.string().nullish();

const RemotiveResponse = z.object({
  jobs: z
    .array(
      z.object({
        id: z.string(),
        url: nullableString,
        title: nullableString,
        company_name: nullableString,
        category: nullableString,
        job_type: nullableString,
        candidate_required_location: nullableString,
        salary: nullableString,
        description: nullableString,
        publication_date: nullableString,
      }),
    )
    .nullish(),
});

/** Remotive — global remote tech roles. The "board" is the single public feed. */
export function remotive(fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'remotive',
    label: 'Remotive',
    boardUrl: () => 'https://remotive.com/remote-jobs',
    async list(board, signal) {
      if (board && board !== 'remotive')
        throw new SourceError('not_found', 'Remotive publishes one global feed; monitor the board named "remotive".');
      const data = await guardedGetJson('https://remotive.com/api/remote-jobs', { fetchImpl, signal });
      const parsed = parseFeed(RemotiveResponse, data, 'Remotive');
      return (parsed.jobs ?? []).map((j): NormalizedPosting => {
        const remotePolicy = 'remote';
        const employmentType = employmentTypeFrom(j.job_type);
        const locationText = j.candidate_required_location?.trim() || null;
        return {
          source: 'remotive',
          board,
          sourceJobId: j.id,
          employer: j.company_name?.trim() || 'Remotive',
          title: j.title?.trim() || 'Untitled remote role',
          locationText,
          remotePolicy,
          employmentType,
          department: j.category ?? null,
          // Remotive publishes salary only as free text; storing it as structured would fabricate facts.
          salary: null,
          description: htmlToBlocks(j.description ?? ''),
          applyUrl: safeHttpUrl(j.url),
          postingUrl: safeHttpUrl(j.url),
          publishedAt: isoOrNull(j.publication_date),
          market: marketFacts(locationText, remotePolicy),
          unresolved: unresolvedFacts({ remotePolicy, employmentType, salary: null, locationText }),
        };
      });
    },
  };
}

const ArbeitnowResponse = z.object({
  data: z
    .array(
      z.object({
        slug: nullableString,
        company_name: nullableString,
        title: nullableString,
        description: nullableString,
        remote: z.boolean().nullish(),
        url: nullableString,
        job_types: z.array(z.string()).nullish(),
        location: nullableString,
        created_at: z.number().nullish(),
      }),
    )
    .nullish(),
});

/** Arbeitnow — EU / Germany / remote roles. The "board" is the single public feed. */
export function arbeitnow(fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'arbeitnow',
    label: 'Arbeitnow',
    boardUrl: () => 'https://www.arbeitnow.com',
    async list(board, signal) {
      if (board && board !== 'arbeitnow')
        throw new SourceError('not_found', 'Arbeitnow publishes one public feed; monitor the board named "arbeitnow".');
      const data = await guardedGetJson('https://www.arbeitnow.com/api/job-board-api', { fetchImpl, signal });
      const parsed = parseFeed(ArbeitnowResponse, data, 'Arbeitnow');
      return (parsed.data ?? []).map((j): NormalizedPosting => {
        const remotePolicy = j.remote === true ? 'remote' : remotePolicyFrom(j.location);
        const employmentType = employmentTypeFrom((j.job_types ?? []).join(' '));
        const locationText = j.location?.trim() || null;
        return {
          source: 'arbeitnow',
          board,
          sourceJobId: j.slug ?? `${j.company_name ?? 'arbeitnow'}-${j.title ?? ''}`.trim(),
          employer: j.company_name?.trim() || 'Arbeitnow',
          title: j.title?.trim() || 'Untitled posting',
          locationText,
          remotePolicy,
          employmentType,
          department: null,
          salary: null, // Arbeitnow publishes no structured salary fields.
          description: htmlToBlocks(j.description ?? ''),
          applyUrl: safeHttpUrl(j.url),
          postingUrl: safeHttpUrl(j.url),
          publishedAt: isoOrNull(j.created_at),
          market: marketFacts(locationText, remotePolicy),
          unresolved: unresolvedFacts({ remotePolicy, employmentType, salary: null, locationText }),
        };
      });
    },
  };
}
