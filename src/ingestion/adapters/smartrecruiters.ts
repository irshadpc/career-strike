import { z } from 'zod';
import { type FetchImpl, guardedGetJson } from '../../sources/fetch-guard.js';
import { htmlToBlocks } from '../../sources/html.js';
import {
  employmentTypeFrom,
  isoOrNull,
  marketFacts,
  remotePolicyFrom,
  safeHttpUrl,
  unresolvedFacts,
} from '../../sources/normalize.js';
import { type NormalizedPosting, type SourceAdapter, SourceError } from '../../sources/types.js';

/**
 * SmartRecruiters public posting API (official, keyless, read-only).
 * Docs: https://developers.smartrecruiters.com/docs/postings-api
 * Endpoint: GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings?limit=100&offset=0
 *
 * Compliance: public JSON API only, no scraping, polite rate limits (handled by fetch guard), 10s timeout.
 */

const nullableString = z.string().nullish();

const SRLocation = z
  .object({
    city: nullableString,
    region: nullableString,
    country: nullableString,
    remote: z.boolean().nullish(),
    hybrid: z.boolean().nullish(),
  })
  .nullish();

const SRPosting = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  name: z.string().nullish(),
  company: z
    .object({
      identifier: nullableString,
      name: nullableString,
    })
    .nullish(),
  location: SRLocation,
  releasedDate: nullableString,
  department: z.object({ label: nullableString, id: nullableString }).nullish(),
  function: z.object({ label: nullableString, id: nullableString }).nullish(),
  typeOfEmployment: z.object({ label: nullableString, id: nullableString }).nullish(),
  ref: nullableString,
});

const SRResponse = z.object({
  offset: z.number().nullish(),
  limit: z.number().nullish(),
  totalFound: z.number().nullish(),
  content: z.array(SRPosting).nullish(),
});

function parseFeed<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new SourceError('schema', 'SmartRecruiters API returned unexpected JSON.');
  return result.data;
}

function formatLocation(loc: z.infer<typeof SRLocation>): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.region, loc.country ? loc.country.toUpperCase() : null].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

function srRemotePolicy(loc: z.infer<typeof SRLocation>): 'remote' | 'hybrid' | 'onsite' | 'unknown' {
  if (!loc) return 'unknown';
  if (loc.remote === true) return 'remote';
  if (loc.hybrid === true) return 'hybrid';
  if (loc.remote === false && loc.hybrid === false) return 'onsite';
  return remotePolicyFrom(null);
}

function postingUrl(companyId: string, postingId: string): string {
  return `https://jobs.smartrecruiters.com/${encodeURIComponent(companyId)}/${encodeURIComponent(postingId)}`;
}

const MAX_POSTINGS_PER_SYNC = 300;
const PAGE_SIZE = 100;

export function smartrecruiters(fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'smartrecruiters',
    label: 'SmartRecruiters',
    boardUrl: (board) => `https://careers.smartrecruiters.com/${encodeURIComponent(board)}`,
    async list(board, signal) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(board)) {
        throw new SourceError('not_found', 'Board names contain only letters, digits, dot, dash and underscore');
      }
      const postings: NormalizedPosting[] = [];
      let offset = 0;
      let totalFound = Number.POSITIVE_INFINITY;

      while (offset < totalFound && postings.length < MAX_POSTINGS_PER_SYNC) {
        const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings?limit=${PAGE_SIZE}&offset=${offset}`;
        const data = await guardedGetJson(url, { fetchImpl, signal });
        const parsed = parseFeed(SRResponse, data);
        const batch = parsed.content ?? [];
        totalFound = typeof parsed.totalFound === 'number' ? parsed.totalFound : offset + batch.length;
        if (batch.length === 0) break;

        for (const p of batch) {
          if (postings.length >= MAX_POSTINGS_PER_SYNC) break;
          const companyId = p.company?.identifier?.trim() || board;
          const companyName = p.company?.name?.trim() || companyId;
          const remotePolicy = srRemotePolicy(p.location);
          const employmentType = employmentTypeFrom(p.typeOfEmployment?.label ?? p.typeOfEmployment?.id);
          const locationText = formatLocation(p.location);
          const canonical = postingUrl(companyId, p.id);
          const dept = p.department?.label?.trim() || p.function?.label?.trim() || null;
          postings.push({
            source: 'smartrecruiters',
            board,
            sourceJobId: p.id,
            employer: companyName,
            title: p.name?.trim() || 'Untitled posting',
            locationText,
            remotePolicy,
            employmentType,
            department: dept,
            salary: null, // SR public posting list does not reliably expose structured salary.
            description: htmlToBlocks(''),
            applyUrl: safeHttpUrl(canonical),
            postingUrl: safeHttpUrl(canonical),
            publishedAt: isoOrNull(p.releasedDate),
            market: marketFacts(locationText, remotePolicy),
            unresolved: [
              ...unresolvedFacts({ remotePolicy, employmentType, salary: null, locationText }),
              'Description not included in SmartRecruiters public list response; see canonical posting URL.',
            ],
          });
        }

        offset += batch.length;
        if (typeof parsed.limit === 'number' && batch.length < parsed.limit) break;
      }

      return postings;
    },
  };
}
