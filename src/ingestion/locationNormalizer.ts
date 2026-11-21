import { COUNTRY_REGISTRY, type CountryCode, isCountryCode, normaliseLocation } from '../markets/countries.js';
import type { RemotePolicy } from '../sources/types.js';
import type { Db } from '../store/db.js';

/**
 * Deterministic location normalisation for every ingested job (resume-studio audit Step 3).
 *
 * Runs before a job row is written so the dashboard can filter by ISO country code and work mode
 * instead of by free-form location text. Raw text is preserved in `location_text`; this module
 * derives `country_code`, `country_codes_json`, `work_mode` and `normalized_location` from it.
 *
 * Rules:
 *   - `work_mode` comes from explicit tokens (remote, wfh, distributed, hybrid, in-office, onsite).
 *   - Multi-location strings ("London, UK; Bengaluru, India") yield every detected country; the
 *     first detected country is stored as the primary `country_code`.
 *   - US state abbreviations (", CA", ", NY") map to US.
 *   - Remote postings with no country (or worldwide/anywhere/global) map to GLOBAL.
 */

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export interface NormalizedJobLocation {
  /** Primary ISO 3166-1 alpha-2 country, or GLOBAL for worldwide remote roles. */
  countryCode: CountryCode | null;
  /** Every country detected across a multi-location string. */
  countryCodes: CountryCode[];
  workMode: WorkMode;
  /** Canonical "City, Country" (or country / "Remote (Global)") form shown in the UI. */
  normalizedLocation: string | null;
  /** The location string exactly as the employer published it. */
  rawLocation: string | null;
}

const WORK_MODE_TOKENS: readonly [RegExp, WorkMode][] = [
  [/\b(?:remote|wfh|work\s*from\s*home|work-from-home|distributed|anywhere|worldwide|global)\b/i, 'remote'],
  [/\b(?:hybrid)\b/i, 'hybrid'],
  [/\b(?:on[\s-]?site|in[\s-]?office|in[\s-]?person|office)\b/i, 'onsite'],
];

/** US state abbreviations as they appear in ATS locations (", CA", "NY,", "(Remote - TX)"). */
const US_STATES: readonly string[] = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
];

const US_STATE_PATTERN = new RegExp(`(?:^|[\\s,(])(?:${US_STATES.join('|')})(?=[\\s,)]|$)`);

/** Cities and spellings this normalizer must recognise even when the registry lacks the alias. */
const CITY_COUNTRY_HINTS: readonly [RegExp, CountryCode][] = [
  [
    /\b(?:bengaluru|bangalore|\bblr\b|mumbai|hyderabad|pune|delhi|n(?:cr|oida)|gurugram|gurgaon|chennai|kochi|coimbatore|india)\b/i,
    'IN',
  ],
  [
    /\b(?:san\s*francisco|new\s*york|nyc|seattle|austin|boston|chicago|los\s*angeles|denver|atlanta|miami|united\s*states|usa|u\.s\.a|\bus\b)\b/i,
    'US',
  ],
  [
    /\b(?:london|manchester|edinburgh|bristol|birmingham|glasgow|leeds|united\s*kingdom|england|scotland|\buk\b)\b/i,
    'GB',
  ],
  [/\b(?:berlin|munich|m(?:u|ü)nchen|hamburg|frankfurt|cologne|k(?:o|ö)ln|germany)\b/i, 'DE'],
  [/\bsingapore\b/i, 'SG'],
  [/\b(?:amsterdam|rotterdam|utrecht|eindhoven|netherlands)\b/i, 'NL'],
  [/\b(?:dublin|cork|galway|ireland)\b/i, 'IE'],
  [/\b(?:paris|lyon|toulouse|france)\b/i, 'FR'],
  [/\b(?:toronto|vancouver|montreal|ottawa|calgary|canada)\b/i, 'CA'],
  [/\b(?:sydney|melbourne|brisbane|perth|australia)\b/i, 'AU'],
  [/\b(?:dubai|abu\s*dhabi|sharjah|united\s*arab\s*emirates|uae)\b/i, 'AE'],
  [/\b(?:tokyo|osaka|japan)\b/i, 'JP'],
];

const REMOTE_WORLDWIDE =
  /\b(?:worldwide|anywhere|global|all\s+countries|remote\s*-\s*(?:worldwide|global|anywhere))\b/i;

const splitPattern = /\s*[;|/]\s*|\s+\band\b\s+|\s*,\s*(?=[A-Z])/;

function detectWorkMode(text: string, remotePolicy?: RemotePolicy): WorkMode {
  for (const [re, mode] of WORK_MODE_TOKENS) if (re.test(text)) return mode;
  if (remotePolicy && remotePolicy !== 'unknown') return remotePolicy;
  return 'unknown';
}

function countriesIn(text: string): CountryCode[] {
  const found: CountryCode[] = [];
  const push = (code: string): void => {
    if (isCountryCode(code) && !found.includes(code)) found.push(code);
  };
  // US state abbreviations: ", CA" / "NY," / "(TX)" — only as standalone 2-letter tokens.
  if (US_STATE_PATTERN.test(text)) push('US');
  for (const [re, code] of CITY_COUNTRY_HINTS) if (re.test(text)) push(code);
  const parsed = normaliseLocation(text);
  if (parsed.countryCode) push(parsed.countryCode);
  return found;
}

/** Canonical display form: "City, Country" where the registry knows the city; else the country name. */
function canonicalForm(text: string, codes: CountryCode[]): string | null {
  if (codes.length === 0) return text.trim() || null;
  const parsed = normaliseLocation(text);
  if (parsed.city && parsed.countryCode) {
    const country = COUNTRY_REGISTRY[parsed.countryCode];
    return `${parsed.city}, ${country?.name ?? parsed.countryCode}`;
  }
  const primary = codes[0]!;
  return COUNTRY_REGISTRY[primary]?.name ?? primary;
}

export function normalizeIngestedLocation(
  rawLocation: string | null | undefined,
  remotePolicy?: RemotePolicy,
): NormalizedJobLocation {
  const raw = rawLocation?.trim() ? rawLocation.trim() : null;
  const workMode = detectWorkMode(raw ?? '', remotePolicy);

  if (!raw) {
    const fallbackGlobal = workMode === 'remote';
    return {
      countryCode: fallbackGlobal ? 'GLOBAL' : null,
      countryCodes: fallbackGlobal ? ['GLOBAL'] : [],
      workMode,
      normalizedLocation: fallbackGlobal ? 'Remote (Global)' : null,
      rawLocation: null,
    };
  }

  // Remote postings scoped to no specific country are worldwide.
  const isWorldwideRemote = REMOTE_WORLDWIDE.test(raw) || (workMode === 'remote' && countriesIn(raw).length === 0);
  if (isWorldwideRemote) {
    return {
      countryCode: 'GLOBAL',
      countryCodes: ['GLOBAL'],
      workMode: 'remote',
      normalizedLocation: 'Remote (Global)',
      rawLocation: raw,
    };
  }

  // Multi-location strings: "London, UK; Bengaluru, India" / "NYC / Amsterdam" / "India and UK".
  const parts = raw.split(splitPattern).filter((part) => part.trim().length > 1);
  const codes: CountryCode[] = [];
  for (const part of parts.length > 1 ? parts : [raw]) {
    for (const code of countriesIn(part)) if (!codes.includes(code)) codes.push(code);
  }
  if (codes.length === 0) {
    return { countryCode: null, countryCodes: [], workMode, normalizedLocation: raw, rawLocation: raw };
  }

  return {
    countryCode: codes[0]!,
    countryCodes: codes,
    workMode,
    normalizedLocation: canonicalForm(raw, codes),
    rawLocation: raw,
  };
}

/**
 * One-time (idempotent) backfill for jobs ingested before the location columns existed. Called at
 * service startup after migrations; rows that already have a country_code are left untouched.
 */
export function backfillJobLocations(db: Db): number {
  const rows = db
    .prepare('SELECT id, location_text, remote_policy, country_code FROM jobs WHERE country_code IS NULL')
    .all() as { id: string; location_text: string | null; remote_policy: string; country_code: string | null }[];
  const update = db.prepare(
    'UPDATE jobs SET country_code = ?, country_codes_json = ?, work_mode = ?, normalized_location = ? WHERE id = ?',
  );
  let updated = 0;
  for (const row of rows) {
    const norm = normalizeIngestedLocation(row.location_text, row.remote_policy as RemotePolicy);
    update.run(norm.countryCode, JSON.stringify(norm.countryCodes), norm.workMode, norm.normalizedLocation, row.id);
    updated += 1;
  }
  return updated;
}
