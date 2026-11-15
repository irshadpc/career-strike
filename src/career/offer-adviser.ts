import type { Db } from '../store/db.js';
import {
  type CompensationComparison,
  evaluateCompensation,
  findMatchingBenchmark,
  type SeniorityLevel,
} from './compensation.js';
import { getActiveMission } from './mission.js';

export interface OfferDetails {
  id: string;
  employer: string;
  roleTitle: string;
  stage?: string;
  location: string;
  countryCode?: string;
  remoteArrangement: 'remote' | 'hybrid' | 'onsite';
  baseSalary: number;
  currency: string;
  variableBonus?: number | null;
  equityEstimateAnnualized?: number | null;
  signingBonus?: number | null;
  benefitsScore?: number; // 1-5
  careerGrowthRating?: number; // 1-5
  roleFamily?: string;
  seniority?: SeniorityLevel;
  notes?: string;
}

export interface OfferEvaluation {
  offer: OfferDetails;
  totalFirstYearCash: number;
  totalAnnualTargetComp: number;
  benchmarkComparison: CompensationComparison;
  missionAlignment: {
    meetsSalaryFloor: boolean;
    remotePreferenceFit: 'preferred' | 'acceptable' | 'unfavorable';
    trackFit: 'TRACK_A' | 'TRACK_B' | 'UNALIGNED';
    growthScore: number;
  };
  strengths: string[];
  tradeoffs: string[];
  negotiationTalkingPoints: string[];
}

export interface MultiOfferComparisonResult {
  offers: OfferEvaluation[];
  topCompOfferId: string | null;
  topGrowthOfferId: string | null;
  recommendedDecision: {
    primaryOfferId: string | null;
    rationales: string[];
    suggestedNextAction: string;
  };
}

export function compareOffers(db: Db, offers: OfferDetails[]): MultiOfferComparisonResult {
  if (offers.length === 0) {
    return {
      offers: [],
      topCompOfferId: null,
      topGrowthOfferId: null,
      recommendedDecision: {
        primaryOfferId: null,
        rationales: ['No offers provided for comparison.'],
        suggestedNextAction: 'Enter offer details to generate comparison and negotiation points.',
      },
    };
  }

  const activeMission = getActiveMission(db);
  const salaryFloor = activeMission?.salaryFloor ?? 0;
  const missionRemote = activeMission?.remotePolicy ?? 'remote_only';

  const evaluatedOffers: OfferEvaluation[] = offers.map((offer) => {
    const totalFirstYearCash = offer.baseSalary + (offer.signingBonus ?? 0) + (offer.variableBonus ?? 0);
    const totalAnnualTargetComp = offer.baseSalary + (offer.variableBonus ?? 0) + (offer.equityEstimateAnnualized ?? 0);

    // Benchmark comparison
    const country = offer.countryCode ?? (offer.location.length === 2 ? offer.location.toUpperCase() : 'US');
    const benchmark = findMatchingBenchmark(
      db,
      offer.roleFamily ?? offer.roleTitle,
      offer.seniority ?? 'senior',
      country,
    );
    const benchmarkComparison = evaluateCompensation(
      {
        source: 'structured',
        currency: offer.currency,
        min: offer.baseSalary,
        max: offer.baseSalary,
        interval: 'year',
      },
      benchmark,
    );

    // Mission alignment
    const meetsSalaryFloor = offer.baseSalary >= salaryFloor;
    const remotePreferenceFit: OfferEvaluation['missionAlignment']['remotePreferenceFit'] =
      offer.remoteArrangement === 'remote'
        ? 'preferred'
        : offer.remoteArrangement === 'hybrid' && (missionRemote === 'hybrid' || missionRemote === 'any')
          ? 'acceptable'
          : offer.remoteArrangement === 'onsite' && missionRemote === 'onsite'
            ? 'preferred'
            : 'unfavorable';

    // Track fit
    const titleLower = offer.roleTitle.toLowerCase();
    const isTrackA = activeMission?.targetRoles.some((r) => titleLower.includes(r.toLowerCase())) ?? true;
    const isTrackB = activeMission?.adjacentRoles.some((r) => titleLower.includes(r.toLowerCase())) ?? false;
    const trackFit: OfferEvaluation['missionAlignment']['trackFit'] = isTrackA
      ? 'TRACK_A'
      : isTrackB
        ? 'TRACK_B'
        : 'UNALIGNED';

    const growthScore = offer.careerGrowthRating ?? 3;

    const strengths: string[] = [];
    const tradeoffs: string[] = [];
    const negotiationTalkingPoints: string[] = [];

    if (meetsSalaryFloor) {
      strengths.push(`Base salary ($${offer.baseSalary.toLocaleString()}) meets your mission floor.`);
    } else {
      tradeoffs.push(`Base salary is below your mission floor of $${salaryFloor.toLocaleString()}.`);
    }

    if (offer.signingBonus && offer.signingBonus > 0) {
      strengths.push(`Includes $${offer.signingBonus.toLocaleString()} upfront signing incentive.`);
    }

    if (offer.equityEstimateAnnualized && offer.equityEstimateAnnualized > 0) {
      strengths.push(`Documented annualized equity component of ~$${offer.equityEstimateAnnualized.toLocaleString()}.`);
    }

    if (remotePreferenceFit === 'unfavorable') {
      tradeoffs.push(
        `Work arrangement (${offer.remoteArrangement}) diverges from preferred policy (${missionRemote}).`,
      );
    }

    // Negotiation points based on benchmark
    const bench = benchmarkComparison.benchmark;
    if (bench?.p50 && offer.baseSalary < bench.p50) {
      negotiationTalkingPoints.push(
        `Base compensation ($${offer.baseSalary.toLocaleString()}) is below market median ($${bench.p50.toLocaleString()}). Request adjustment towards $${bench.p50.toLocaleString()} citing verified accomplishments.`,
      );
    } else if (bench?.p75 && offer.baseSalary >= bench.p75) {
      strengths.push(`Top-tier compensation above P75 market benchmark ($${bench.p75.toLocaleString()}).`);
    }

    if (!offer.signingBonus && offer.baseSalary < (bench?.p50 ?? Infinity)) {
      negotiationTalkingPoints.push(
        'If the base salary band is constrained, request a one-time signing bonus to bridge the first-year gap.',
      );
    }

    if (offer.remoteArrangement !== 'remote' && missionRemote === 'remote_only') {
      negotiationTalkingPoints.push(
        'Request explicit hybrid flexibility or scheduled remote days in the written offer letter.',
      );
    }

    return {
      offer,
      totalFirstYearCash,
      totalAnnualTargetComp,
      benchmarkComparison,
      missionAlignment: {
        meetsSalaryFloor,
        remotePreferenceFit,
        trackFit,
        growthScore,
      },
      strengths,
      tradeoffs,
      negotiationTalkingPoints,
    };
  });

  // Determine top comp and growth
  let topComp = evaluatedOffers[0]!;
  let topGrowth = evaluatedOffers[0]!;

  for (const ev of evaluatedOffers) {
    if (ev.totalAnnualTargetComp > topComp.totalAnnualTargetComp) topComp = ev;
    if (ev.missionAlignment.growthScore > topGrowth.missionAlignment.growthScore) topGrowth = ev;
  }

  // Recommended decision
  const rationales: string[] = [];
  let primaryOfferId = topComp.offer.id;

  if (topComp.offer.id === topGrowth.offer.id) {
    rationales.push(
      `${topComp.offer.employer} provides both highest annual target compensation ($${topComp.totalAnnualTargetComp.toLocaleString()}) and top career growth alignment.`,
    );
  } else {
    rationales.push(
      `${topComp.offer.employer} leads on annual target compensation ($${topComp.totalAnnualTargetComp.toLocaleString()}).`,
    );
    rationales.push(`${topGrowth.offer.employer} offers highest career growth velocity and scope expansion.`);
    // If growth priority is high, favor growth if comp meets floor
    if (topGrowth.missionAlignment.meetsSalaryFloor) {
      primaryOfferId = topGrowth.offer.id;
      rationales.push(
        `Selected ${topGrowth.offer.employer} as primary recommendation because it meets your compensation floor while maximizing long-term career growth.`,
      );
    }
  }

  return {
    offers: evaluatedOffers,
    topCompOfferId: topComp.offer.id,
    topGrowthOfferId: topGrowth.offer.id,
    recommendedDecision: {
      primaryOfferId,
      rationales,
      suggestedNextAction: 'Review negotiation talking points and request clarifications before signing.',
    },
  };
}
