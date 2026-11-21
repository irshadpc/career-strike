import type { SourceId } from './types.js';

// Public careers-page hosts for each supported ATS, so users can paste the page they already know.
const HOSTS: readonly [RegExp, SourceId][] = [
  [/^(?:job-)?boards\.greenhouse\.io$/, 'greenhouse'],
  [/^(?:job-)?boards\.eu\.greenhouse\.io$/, 'greenhouse'],
  [/^jobs\.(?:eu\.)?lever\.co$/, 'lever'],
  [/^jobs\.ashbyhq\.com$/, 'ashby'],
  [/^(?:careers|jobs)\.smartrecruiters\.com$/, 'smartrecruiters'],
  [/^www\.adzuna\.(?:com|co\.uk|de|in|sg|ca\.com\.au|nl)$/, 'adzuna'],
  [/^api\.adzuna\.com$/, 'adzuna'],
  [/^remotive\.com$/, 'remotive'],
  [/^www\.arbeitnow\.com$/, 'arbeitnow'],
];

/** Recognise a public board URL such as https://jobs.lever.co/acme/123 → { lever, acme }. */
export function boardFromUrl(
  raw: string,
  practiceOrigin: string | null = null,
): { source: SourceId; board: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  // The owned practice endpoint: http://127.0.0.1:<port>/boards/<name>, only once registered.
  if (practiceOrigin && url.origin === practiceOrigin) {
    const [first, name] = url.pathname.split('/').filter(Boolean);
    return first === 'boards' && name ? { source: 'practice', board: decodeURIComponent(name) } : null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const match = HOSTS.find(([re]) => re.test(url.hostname));
  if (!match) return null;
  // Global keyless feeds expose a single board; accept the site root or any page on it.
  if (match[1] === 'remotive') return { source: 'remotive', board: 'remotive' };
  if (match[1] === 'arbeitnow') return { source: 'arbeitnow', board: 'arbeitnow' };
  if (match[1] === 'adzuna') {
    // https://www.adzuna.com/search?q=... or just accept host; board encoded as country code later
    const seg = url.pathname.split('/').filter(Boolean);
    return { source: 'adzuna', board: seg[0] ?? 'search' };
  }
  const board = url.pathname.split('/').filter(Boolean)[0];
  if (!board) return null;
  // Greenhouse also serves embedded boards as /embed/job_board?for=<board>.
  if (match[1] === 'greenhouse' && board === 'embed') {
    const forBoard = url.searchParams.get('for');
    return forBoard ? { source: 'greenhouse', board: forBoard } : null;
  }
  return { source: match[1], board: decodeURIComponent(board) };
}
