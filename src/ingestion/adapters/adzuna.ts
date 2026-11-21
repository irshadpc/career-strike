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
 * Adzuna official developer API (BYOK - Bring Your Own Key).
 * Docs: https://developer.adzuna.com/overview
 * Endpoint: GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id={appId}&app_key={appKey}&what={query}&where={location}&results_per_page=50
 *
 * Compliance: official API only, BYOK credentials stored locally, polite rate limits/timeout via fetch guard.
 * If credentials are missing, the source is marked unconfigured (never fails silently).
 */

export const ADZUNA_COUNTRIES = ['in', 'us', 'gb', 'de', 'sg', 'ca', 'au', 'nl'] as const;
export type AdzunaCountry = (typeof ADZUNA_COUNTRIES)[number];

export interface AdzunaCredentials {
  appId: string;
  appKey: string;
}

export type AdzunaCredentialsProvider = () => AdzunaCredentials | null;

const nullableString = z.string().nullish();
const nullableNumber = z.number().nullish();

const AdzunaJob = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  title: nullableString,
  description: nullableString,
  created: nullableString,
  redirect_url: nullableString,
  adref: nullableString,
  contract_time: nullableString,
  contract_type: nullableString,
  salary_min: nullableNumber,
  salary_max: nullableNumber,
  salary_is_predicted: z.union([z.string(), z.number()]).nullish(),
  company: z.object({ display_name: nullableString }).nullish(),
  location: z
    .object({
      display_name: nullableString,
      area: z.array(z.string()).nullish(),
    })
    .nullish(),
  category: z.object({ label: nullableString, tag: nullableString }).nullish(),
});

const AdzunaResponse = z.object({
  results: z.array(AdzunaJob).nullish(),
  count: z.number().nullish(),
});

function parseFeed<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new SourceError('schema', 'Adzuna API returned unexpected JSON.');
  return result.data;
}

export function parseAdzunaBoard(board: string): { country: AdzunaCountry; what: string; where: string } {
  // Board format: "country" or "country|what" or "country|what|where"
  const parts = board.split('|').map((p) => p.trim());
  const countryRaw = (parts[0] || 'us').toLowerCase();
  const country = (ADZUNA_COUNTRIES as readonly string[]).includes(countryRaw) ? (countryRaw as AdzunaCountry) : null;
  if (!country) {
    throw new SourceError(
      'not_found',
      `Unsupported Adzuna country "${countryRaw}". Supported: ${ADZUNA_COUNTRIES.join(', ')}`,
    );
  }
  return {
    country,
    what: parts[1] || 'software engineer',
    where: parts[2] || '',
  };
}

function locationText(loc: z.infer<typeof AdzunaJob>['location']): string | null {
  const name = loc?.display_name?.trim();
  if (name) return name;
  const area = loc?.area?.filter((a): a is string => typeof a === 'string' && a.trim().length > 0) ?? [];
  return area.length > 0 ? area.slice(-3).join(', ') : null;
}

export function adzuna(getCredentials: AdzunaCredentialsProvider, fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'adzuna',
    label: 'Adzuna',
    boardUrl: (board) => {
      const { country } = parseAdzunaBoard(board);
      const host = country === 'gb' ? 'www.adzuna.co.uk' : country === 'de' ? 'www.adzuna.de' : 'www.adzuna.com';
      return `https://${host}`;
    },
    async list(board, signal) {
      const creds = getCredentials();
      if (!creds?.appId || !creds?.appKey) {
        throw new SourceError(
          'blocked',
          'Adzuna is not configured. Add your ADZUNA_APP_ID and ADZUNA_APP_KEY in Settings -> Connected APIs.',
        );
      }
      const { country, what, where } = parseAdzunaBoard(board);
      const page = 1;
      const qs = new URLSearchParams({
        app_id: creds.appId,
        app_key: creds.appKey,
        results_per_page: '50',
        what,
      });
      if (where) qs.set('where', where);
      // content-type is not a param; Adzuna returns JSON by default.
      const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${page}?${qs.toString()}`;
      const data = await guardedGetJson(url, { fetchImpl, signal });
      const parsed = parseFeed(AdzunaResponse, data);
      return (parsed.results ?? []).map((j): NormalizedPosting => {
        const loc = locationText(j.location);
        // Adzuna does not expose explicit remote flag; infer conservatively.
        const remotePolicy = remotePolicyFrom(/remote/i.test(loc ?? '') ? 'remote' : null);
        const employmentType = employmentTypeFrom(j.contract_time ?? j.contract_type);
        const predicted = j.salary_is_predicted === '1' || j.salary_is_predicted === 1;
        const salary =
          !predicted && (typeof j.salary_min === 'number' || typeof j.salary_max === 'number')
            ? {
                currency:
                  country === 'gb'
                    ? 'GBP'
                    : country === 'de' || country === 'nl'
                      ? 'EUR'
                      : country === 'in'
                        ? 'INR'
                        : country === 'sg'
                          ? 'SGD'
                          : country === 'ca'
                            ? 'CAD'
                            : country === 'au'
                              ? 'AUD'
                              : 'USD',
                min: typeof j.salary_min === 'number' ? Math.round(j.salary_min) : null,
                max: typeof j.salary_max === 'number' ? Math.round(j.salary_max) : null,
                interval: 'year' as const,
                source: 'structured' as const,
              }
            : null;
        const description = htmlToBlocks(j.description ?? '');
        const posting = safeHttpUrl(j.redirect_url) ?? safeHttpUrl(j.adref);
        return {
          source: 'adzuna',
          board,
          sourceJobId: j.id,
          employer: j.company?.display_name?.trim() || 'Unknown employer',
          title: j.title?.trim() || 'Untitled posting',
          locationText: loc,
          remotePolicy,
          employmentType,
          department: j.category?.label ?? null,
          salary,
          description,
          applyUrl: posting,
          postingUrl: posting,
          publishedAt: isoOrNull(j.created),
          market: marketFacts(loc, remotePolicy),
          unresolved: unresolvedFacts({ remotePolicy, employmentType, salary, locationText: loc }),
        };
      });
    },
  };
}
