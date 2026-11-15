import { describe, expect, it } from 'vitest';
import {
  calculatePercentiles,
  evaluateCompensation,
  findMatchingBenchmark,
  listCompensationBenchmarks,
  MIN_PERCENTILE_SAMPLE_SIZE,
} from '../../src/career/compensation.js';
import type { PublishedSalary } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';

describe('Compensation & Offer Intelligence Engine', () => {
  it('strictly refuses to manufacture percentiles when sample size is below threshold', () => {
    // Threshold is 5
    expect(MIN_PERCENTILE_SAMPLE_SIZE).toBe(5);

    const smallSample = [120000, 140000, 160000, 180000]; // 4 items
    expect(calculatePercentiles(smallSample)).toBeNull();

    const adequateSample = [100000, 120000, 140000, 160000, 180000]; // 5 items
    const percentiles = calculatePercentiles(adequateSample);
    expect(percentiles).not.toBeNull();
    expect(percentiles?.p25).toBe(120000);
    expect(percentiles?.p50).toBe(140000);
    expect(percentiles?.p75).toBe(160000);
  });

  it('lists verified benchmarks with explicit limitations and source provenance', () => {
    const db = openDb(':memory:');
    const benchmarks = listCompensationBenchmarks(db, { countryCode: 'US' });
    expect(benchmarks.length).toBeGreaterThanOrEqual(1);

    const seniorSwe = benchmarks.find((b) => b.roleFamily === 'Software Engineering' && b.seniority === 'senior');
    expect(seniorSwe).toBeDefined();
    expect(seniorSwe?.currency).toBe('USD');
    expect(seniorSwe?.sourceKind).toBe('EXTERNAL_BENCHMARK');
    expect(seniorSwe?.sampleSize).toBe(42);
    expect(seniorSwe?.limitations).toContain('California');
  });

  it('detects currency mismatches and explicitly refuses to convert without purchasing power parity', () => {
    const db = openDb(':memory:');
    const benchmark = findMatchingBenchmark(db, 'Software Engineering', 'senior', 'US');
    expect(benchmark).not.toBeNull();

    const eurSalary: PublishedSalary = {
      currency: 'EUR',
      min: 90000,
      max: 110000,
      interval: 'year',
      source: 'structured',
    };

    const comparison = evaluateCompensation(eurSalary, benchmark);
    expect(comparison.status).toBe('CURRENCY_MISMATCH');
    expect(comparison.limitations[0]).toContain('Career Strike deliberately does not convert currencies');
    expect(comparison.limitations[0]).toContain('purchasing power');
  });

  it('accurately categorizes compensation against verified interquartile bands', () => {
    const db = openDb(':memory:');
    const benchmark = findMatchingBenchmark(db, 'Software Engineering', 'senior', 'US');
    expect(benchmark).not.toBeNull();

    // High offer (above p75 = 220000)
    const highSalary: PublishedSalary = {
      currency: 'USD',
      min: 220000,
      max: 240000,
      interval: 'year',
      source: 'structured',
    };
    const highComp = evaluateCompensation(highSalary, benchmark);
    expect(highComp.status).toBe('ABOVE_P75');

    // Low offer (below p25 = 175000)
    const lowSalary: PublishedSalary = {
      currency: 'USD',
      min: 140000,
      max: 160000,
      interval: 'year',
      source: 'structured',
    };
    const lowComp = evaluateCompensation(lowSalary, benchmark);
    expect(lowComp.status).toBe('BELOW_P25');

    // Mid offer (between p25 and p75)
    const midSalary: PublishedSalary = {
      currency: 'USD',
      min: 185000,
      max: 205000,
      interval: 'year',
      source: 'structured',
    };
    const midComp = evaluateCompensation(midSalary, benchmark);
    expect(midComp.status).toBe('COMPETITIVE_MID');
  });
});
