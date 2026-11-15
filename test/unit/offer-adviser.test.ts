import { describe, expect, it } from 'vitest';
import { saveMission } from '../../src/career/mission.js';
import { compareOffers, type OfferDetails } from '../../src/career/offer-adviser.js';
import { buildOutreachDraft } from '../../src/outreach/templates.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

describe('offer adviser & multi-offer decision engine', () => {
  it('handles empty offers gracefully', () => {
    const dir = tempDir();
    const db = openDb(`${dir}/test.db`);
    const result = compareOffers(db, []);
    expect(result.offers).toHaveLength(0);
    expect(result.topCompOfferId).toBeNull();
  });

  it('evaluates competing offers across cash, equity, remote policy, and career growth', () => {
    const dir = tempDir();
    const db = openDb(`${dir}/test.db`);

    // Setup active mission with $140,000 salary floor
    saveMission(db, {
      title: 'Senior Engineering Mission',
      desiredOutcome: 'High-growth platform engineering role with strong compensation.',
      targetRoles: ['Senior Software Engineer', 'Senior Infrastructure Engineer'],
      adjacentRoles: ['Staff Engineer', 'Engineering Manager'],
      salaryFloor: 140000,
      salaryCurrency: 'USD',
      remotePolicy: 'remote_only',
      targetLocations: ['Remote, US'],
      status: 'ACTIVE',
    });

    const offerA: OfferDetails = {
      id: 'offer-acme',
      employer: 'Acme Cloud',
      roleTitle: 'Senior Infrastructure Engineer',
      location: 'US',
      remoteArrangement: 'remote',
      baseSalary: 155000,
      currency: 'USD',
      signingBonus: 15000,
      variableBonus: 10000,
      equityEstimateAnnualized: 10000,
      careerGrowthRating: 3,
    };

    const offerB: OfferDetails = {
      id: 'offer-beta',
      employer: 'Beta AI',
      roleTitle: 'Staff Engineer',
      location: 'US',
      remoteArrangement: 'hybrid',
      baseSalary: 185000,
      currency: 'USD',
      signingBonus: 0,
      variableBonus: 20000,
      equityEstimateAnnualized: 35000,
      careerGrowthRating: 5,
    };

    const result = compareOffers(db, [offerA, offerB]);

    expect(result.offers).toHaveLength(2);

    const evalA = result.offers.find((o) => o.offer.id === 'offer-acme')!;
    const evalB = result.offers.find((o) => o.offer.id === 'offer-beta')!;

    // Total first year cash
    // Offer A: 155k + 15k signing + 10k bonus = 180k
    expect(evalA.totalFirstYearCash).toBe(180000);
    // Offer B: 185k + 0 + 20k bonus = 205k
    expect(evalB.totalFirstYearCash).toBe(205000);

    // Total target annual comp
    // Offer A: 155k + 10k bonus + 10k equity = 175k
    expect(evalA.totalAnnualTargetComp).toBe(175000);
    // Offer B: 185k + 20k bonus + 35k equity = 240k
    expect(evalB.totalAnnualTargetComp).toBe(240000);

    // Both meet salary floor
    expect(evalA.missionAlignment.meetsSalaryFloor).toBe(true);
    expect(evalB.missionAlignment.meetsSalaryFloor).toBe(true);

    // Remote preference
    expect(evalA.missionAlignment.remotePreferenceFit).toBe('preferred');
    expect(evalB.missionAlignment.remotePreferenceFit).toBe('unfavorable');

    // Track fit
    expect(evalA.missionAlignment.trackFit).toBe('TRACK_A');
    expect(evalB.missionAlignment.trackFit).toBe('TRACK_B');

    // Top comp should be Offer B
    expect(result.topCompOfferId).toBe('offer-beta');
    // Top growth should be Offer B (rating 5 vs 3)
    expect(result.topGrowthOfferId).toBe('offer-beta');

    // Negotiation points generated for hybrid arrangement
    expect(evalB.negotiationTalkingPoints.some((p) => p.includes('hybrid'))).toBe(true);
  });

  it('generates relationship and negotiation outreach drafts correctly', () => {
    // Referral request draft
    const referral = buildOutreachDraft({
      kind: 'referral_request',
      employer: 'Stripe',
      title: 'Staff Software Engineer',
      contactName: 'Samir',
      candidateName: 'Jordan Chen',
    });
    expect(referral.subject).toContain('Staff Software Engineer at Stripe');
    expect(referral.body).toContain('Dear Samir,');
    expect(referral.body).toContain('internal referral');

    // Recruiter response draft
    const recruiter = buildOutreachDraft({
      kind: 'recruiter_response',
      employer: 'Datadog',
      title: 'Senior Systems Engineer',
      contactName: 'Sarah',
      candidateName: 'Jordan Chen',
    });
    expect(recruiter.subject).toContain('Re: Senior Systems Engineer opportunity at Datadog');
    expect(recruiter.body).toContain('available this week');

    // Offer correspondence draft
    const offerMsg = buildOutreachDraft({
      kind: 'offer_correspondence',
      employer: 'Cloudflare',
      title: 'Staff Platform Engineer',
      contactName: 'Elena',
      candidateName: 'Jordan Chen',
    });
    expect(offerMsg.subject).toContain('Offer Discussion & Clarification');
    expect(offerMsg.body).toContain('flexibility on the base salary component');
  });
});
