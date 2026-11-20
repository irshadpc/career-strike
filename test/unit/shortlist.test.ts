import { describe, expect, it } from 'vitest';
import type { CandidateContext } from '../../src/career/context.js';
import type { JobSummary } from '../../src/career/jobs.js';
import { addCandidateCompany, setCompanyWatch } from '../../src/markets/company-registry.js';
import { evaluateDecisionReadyOpportunity } from '../../src/matching/shortlist.js';
import { openDb } from '../../src/store/db.js';

describe('Decision-Ready Opportunity Shortlist Engine', () => {
  const baseJob: JobSummary = {
    id: 'job_test_1',
    employer: 'Acme Systems',
    title: 'Senior Distributed Systems Engineer',
    locationText: 'San Francisco, CA',
    remotePolicy: 'remote',
    employmentType: 'full_time',
    salary: null,
    status: 'OPEN',
    firstSeenAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    sources: ['lever'],
    duplicateOf: null,
    disposition: 'none',
    employerExcluded: false,
    countryCode: 'US',
    countryCodes: ['US'],
    workMode: 'remote',
    normalizedLocation: 'San Francisco, United States',
    market: {
      location: { countryCode: 'US', city: 'San Francisco', originalText: 'San Francisco, CA' },
      remoteEligibility: 'country_restricted',
      remoteEligibleCountries: ['US'],
      visaSponsorship: 'unknown',
      workAuthorization: 'unknown',
      relocationAssistance: 'unknown',
    },
    sourceCapabilities: [],
  };

  const sampleContext: CandidateContext = {
    profile: {
      skills: [
        { name: 'Go', years: 5, level: 'expert', factId: 'f1' },
        { name: 'Kubernetes', years: 4, level: 'advanced', factId: 'f2' },
        { name: 'Distributed Systems', years: 5, level: 'expert', factId: 'f3' },
      ],
      roles: [{ title: 'Backend Engineer', employer: 'Prior Corp', startYear: 2020, endYear: null, factId: 'f4' }],
      totalYears: 5,
    },
    settings: {
      preferredRoles: ['Distributed Systems Engineer'],
      preferredCountries: ['US'],
      preferredCities: ['San Francisco'],
      remotePreference: 'remote_only',
      employmentTypes: ['full_time'],
      country: 'US',
      eligibleCountries: ['US'],
      workAuthorizations: { US: 'authorised' },
      joiningAvailability: 'immediate',
      salaryExpectation: null,
      excludedEmployers: [],
    },
    excludedEmployers: [],
  };

  it('never collapses critical hard eligibility failures into an attractive recommendation', () => {
    const db = openDb(':memory:');
    const closedJob: JobSummary = {
      ...baseJob,
      status: 'CLOSED',
    };

    const evaluated = evaluateDecisionReadyOpportunity(db, closedJob, sampleContext);
    expect(evaluated.dimensions.hardEligibility.passed).toBe(false);
    expect(evaluated.dimensions.hardEligibility.criticalFailures).toContain('The posting has closed.');
    expect(evaluated.nextBestAction).toBe('SKIP');
    expect(evaluated.recommendationExplanation).toContain('Ineligible');
  });

  it('preserves excluded employer constraint regardless of candidate skills', () => {
    const db = openDb(':memory:');
    const ctxWithExcluded: CandidateContext = {
      ...sampleContext,
      settings: {
        ...sampleContext.settings!,
        excludedEmployers: ['Acme Systems'],
      },
    };

    const evaluated = evaluateDecisionReadyOpportunity(db, baseJob, ctxWithExcluded);
    expect(evaluated.dimensions.hardEligibility.passed).toBe(false);
    expect(evaluated.dimensions.hardEligibility.criticalFailures).toContain('You excluded this employer in Settings.');
    expect(evaluated.nextBestAction).toBe('SKIP');
  });

  it('prioritizes watched companies and surfaces rich company context', () => {
    const db = openDb(':memory:');
    const comp = addCandidateCompany(db, { name: 'Acme Systems' });
    setCompanyWatch(db, comp.id, true, { notes: 'Priority startup' });

    const evaluated = evaluateDecisionReadyOpportunity(db, baseJob, sampleContext);
    expect(evaluated.dimensions.companyContext.isWatched).toBe(true);
    expect(evaluated.dimensions.hardEligibility.passed).toBe(true);
    expect(evaluated.nextBestAction).toBe('APPLY');
    expect(evaluated.recommendationExplanation).toContain('Watched company');
  });
});
