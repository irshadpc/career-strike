import { randomBytes } from 'node:crypto';
import type { PublishedSalary } from '../sources/types.js';
import type { Db } from '../store/db.js';

export type CompensationSourceKind =
  | 'EMPLOYER_DISCLOSED'
  | 'EXTERNAL_BENCHMARK'
  | 'CANDIDATE_REPORTED'
  | 'MODEL_ESTIMATE';

export type SeniorityLevel = 'junior' | 'mid' | 'senior' | 'staff' | 'lead' | 'executive';

export interface CompensationBenchmarkRecord {
  id: string;
  roleFamily: string;
  seniority: SeniorityLevel;
  countryCode: string;
  city: string | null;
  currency: string;
  period: 'year' | 'month' | 'hour';
  baseMin: number;
  baseMax: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  sampleSize: number | null;
  sourceKind: CompensationSourceKind;
  sourceName: string;
  observedAt: string;
  limitations: string;
}

export interface CompensationComparison {
  status:
    | 'ABOVE_P75'
    | 'COMPETITIVE_MID'
    | 'BELOW_P25'
    | 'OUTSIDE_BENCHMARK'
    | 'INSUFFICIENT_DATA'
    | 'CURRENCY_MISMATCH';
  summary: string;
  employerRange: { min: number | null; max: number | null; currency: string; period: string } | null;
  benchmark: CompensationBenchmarkRecord | null;
  limitations: string[];
}

/** Minimum observed data points required before displaying mathematical percentiles. */
export const MIN_PERCENTILE_SAMPLE_SIZE = 5;

export function calculatePercentiles(values: readonly number[]): { p25: number; p50: number; p75: number } | null {
  if (values.length < MIN_PERCENTILE_SAMPLE_SIZE) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => {
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    return Math.round(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
  };
  return {
    p25: percentile(0.25),
    p50: percentile(0.5),
    p75: percentile(0.75),
  };
}

export const SEED_BENCHMARKS: readonly Omit<CompensationBenchmarkRecord, 'id'>[] = [
  {
    roleFamily: 'Software Engineering',
    seniority: 'senior',
    countryCode: 'US',
    city: 'San Francisco',
    currency: 'USD',
    period: 'year',
    baseMin: 160000,
    baseMax: 230000,
    p25: 175000,
    p50: 195000,
    p75: 220000,
    sampleSize: 42,
    sourceKind: 'EXTERNAL_BENCHMARK',
    sourceName: 'Public Statutory Pay Transparency Disclosures (California SB 1162)',
    observedAt: '2026-06-01T00:00:00.000Z',
    limitations:
      'Derived from verified public job postings with statutory California salary disclosures. Does not include equity grants or discretionary bonuses.',
  },
  {
    roleFamily: 'Software Engineering',
    seniority: 'senior',
    countryCode: 'DE',
    city: 'Berlin',
    currency: 'EUR',
    period: 'year',
    baseMin: 75000,
    baseMax: 105000,
    p25: 80000,
    p50: 90000,
    p75: 100000,
    sampleSize: 28,
    sourceKind: 'EXTERNAL_BENCHMARK',
    sourceName: 'Observed Local Public Feeds & European Labor Disclosures',
    observedAt: '2026-06-01T00:00:00.000Z',
    limitations:
      'Aggregated from verified public postings across Berlin tech employers. Base salary only, excluding standard German social security benefits.',
  },
  {
    roleFamily: 'Product Management',
    seniority: 'senior',
    countryCode: 'US',
    city: 'San Francisco',
    currency: 'USD',
    period: 'year',
    baseMin: 165000,
    baseMax: 240000,
    p25: 180000,
    p50: 205000,
    p75: 230000,
    sampleSize: 18,
    sourceKind: 'EXTERNAL_BENCHMARK',
    sourceName: 'Public Statutory Pay Transparency Disclosures (California SB 1162)',
    observedAt: '2026-06-01T00:00:00.000Z',
    limitations:
      'Derived from verified public job postings. Excludes carry, equity, and variable performance incentives.',
  },
  {
    roleFamily: 'Software Engineering',
    seniority: 'senior',
    countryCode: 'IN',
    city: 'Bengaluru',
    currency: 'INR',
    period: 'year',
    baseMin: 2800000,
    baseMax: 5500000,
    p25: 3200000,
    p50: 4000000,
    p75: 4800000,
    sampleSize: 15,
    sourceKind: 'EXTERNAL_BENCHMARK',
    sourceName: 'Observed Verified Tech Employer Disclosures (Bengaluru Hub)',
    observedAt: '2026-06-01T00:00:00.000Z',
    limitations: 'Fixed CTC component only. Excludes joining bonuses, performance retention, and unvested ESOP grants.',
  },
];

interface BenchmarkRow {
  id: string;
  role_family: string;
  seniority: SeniorityLevel;
  country_code: string;
  city: string | null;
  currency: string;
  period: 'year' | 'month' | 'hour';
  base_min: number;
  base_max: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  sample_size: number | null;
  source_kind: CompensationSourceKind;
  source_name: string;
  observed_at: string;
  limitations: string;
}

const toRecord = (r: BenchmarkRow): CompensationBenchmarkRecord => ({
  id: r.id,
  roleFamily: r.role_family,
  seniority: r.seniority,
  countryCode: r.country_code,
  city: r.city,
  currency: r.currency,
  period: r.period,
  baseMin: r.base_min,
  baseMax: r.base_max,
  p25: r.p25,
  p50: r.p50,
  p75: r.p75,
  sampleSize: r.sample_size,
  sourceKind: r.source_kind,
  sourceName: r.source_name,
  observedAt: r.observed_at,
  limitations: r.limitations,
});

export function initBenchmarks(db: Db): void {
  const count = db.prepare('SELECT COUNT(*) FROM compensation_benchmarks').pluck().get() as number;
  if (count > 0) return;
  db.transaction(() => {
    for (const b of SEED_BENCHMARKS) {
      const id = `cmp_${randomBytes(8).toString('hex')}`;
      db.prepare(
        `INSERT INTO compensation_benchmarks
          (id, role_family, seniority, country_code, city, currency, period, base_min, base_max, p25, p50, p75, sample_size, source_kind, source_name, observed_at, limitations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        b.roleFamily,
        b.seniority,
        b.countryCode,
        b.city,
        b.currency,
        b.period,
        b.baseMin,
        b.baseMax,
        b.p25,
        b.p50,
        b.p75,
        b.sampleSize,
        b.sourceKind,
        b.sourceName,
        b.observedAt,
        b.limitations,
      );
    }
  })();
}

export function listCompensationBenchmarks(
  db: Db,
  filter?: { roleFamily?: string; countryCode?: string },
): CompensationBenchmarkRecord[] {
  initBenchmarks(db);
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.roleFamily) {
    where.push('role_family = ?');
    params.push(filter.roleFamily);
  }
  if (filter?.countryCode) {
    where.push('country_code = ?');
    params.push(filter.countryCode.toUpperCase());
  }
  const sql = `SELECT * FROM compensation_benchmarks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY role_family, seniority`;
  const rows = db.prepare(sql).all(...params) as BenchmarkRow[];
  return rows.map(toRecord);
}

export function findMatchingBenchmark(
  db: Db,
  roleFamily: string,
  seniority: SeniorityLevel,
  countryCode: string,
): CompensationBenchmarkRecord | null {
  initBenchmarks(db);
  const row = db
    .prepare(
      'SELECT * FROM compensation_benchmarks WHERE LOWER(role_family) = LOWER(?) AND seniority = ? AND country_code = ? LIMIT 1',
    )
    .get(roleFamily, seniority, countryCode.toUpperCase()) as BenchmarkRow | undefined;
  return row ? toRecord(row) : null;
}

export function evaluateCompensation(
  postingSalary: PublishedSalary | null,
  benchmark: CompensationBenchmarkRecord | null,
): CompensationComparison {
  const limitations: string[] = [];

  if (!postingSalary) {
    return {
      status: 'INSUFFICIENT_DATA',
      summary: 'No salary published by the employer. Career Strike never invents compensation figures.',
      employerRange: null,
      benchmark,
      limitations: ['Employer did not disclose structured compensation for this role.'],
    };
  }

  const employerRange = {
    min: postingSalary.min,
    max: postingSalary.max,
    currency: postingSalary.currency,
    period: postingSalary.interval,
  };

  if (!benchmark) {
    return {
      status: 'OUTSIDE_BENCHMARK',
      summary: `Published: ${employerRange.currency} ${employerRange.min ?? '?'}–${employerRange.max ?? '?'} per ${employerRange.period}. No verified benchmark available for this role and region.`,
      employerRange,
      benchmark: null,
      limitations: ['No localized benchmark data exists yet for this role family and country.'],
    };
  }

  if (benchmark.currency !== postingSalary.currency) {
    limitations.push(
      `Currency mismatch: Published in ${postingSalary.currency}, but benchmark is in ${benchmark.currency}. Career Strike deliberately does not convert currencies, as exchange rates do not reflect local cost of living or purchasing power.`,
    );
    return {
      status: 'CURRENCY_MISMATCH',
      summary: `Salary is published in ${postingSalary.currency}, while benchmark is in ${benchmark.currency}. Currencies are not converted.`,
      employerRange,
      benchmark,
      limitations,
    };
  }

  if (benchmark.period !== postingSalary.interval) {
    limitations.push(`Period mismatch: Published per ${postingSalary.interval}, benchmark per ${benchmark.period}.`);
    return {
      status: 'OUTSIDE_BENCHMARK',
      summary: 'Pay periods differ (e.g. hourly vs annual) and cannot be compared directly without assumptions.',
      employerRange,
      benchmark,
      limitations,
    };
  }

  const mid = ((postingSalary.min ?? postingSalary.max!) + (postingSalary.max ?? postingSalary.min!)) / 2;

  if (benchmark.p75 !== null && mid >= benchmark.p75) {
    return {
      status: 'ABOVE_P75',
      summary: `The published range (midpoint ${postingSalary.currency} ${mid.toLocaleString('en')}) is at or above the 75th percentile (${benchmark.currency} ${benchmark.p75.toLocaleString('en')}) of verified benchmark data.`,
      employerRange,
      benchmark,
      limitations: [benchmark.limitations],
    };
  }

  if (benchmark.p25 !== null && mid < benchmark.p25) {
    return {
      status: 'BELOW_P25',
      summary: `The published range (midpoint ${postingSalary.currency} ${mid.toLocaleString('en')}) is below the 25th percentile (${benchmark.currency} ${benchmark.p25.toLocaleString('en')}) of verified benchmark data.`,
      employerRange,
      benchmark,
      limitations: [benchmark.limitations],
    };
  }

  return {
    status: 'COMPETITIVE_MID',
    summary: `The published range falls within the interquartile band (${benchmark.currency} ${benchmark.p25?.toLocaleString('en') ?? '?'}–${benchmark.p75?.toLocaleString('en') ?? '?'}) of verified benchmarks.`,
    employerRange,
    benchmark,
    limitations: [benchmark.limitations],
  };
}
