import { type ApplicationEffortAssessment, evaluateApplicationEffort } from '../career/application-effort.js';
import type { CandidateContext } from '../career/context.js';
import type { JobSummary } from '../career/jobs.js';
import {
  type Company360Profile,
  type CompanyMomentum,
  type CompanyStage,
  getCompany360,
  type HeadcountRange,
  type HiringSignal,
} from '../markets/company-intelligence.js';
import { normalizeEmployerName } from '../markets/company-registry.js';
import type { Db } from '../store/db.js';
import type { Fit, Tier } from './fit.js';

export interface ShortlistDimensions {
  hardEligibility: {
    passed: boolean;
    reasons: string[];
    criticalFailures: string[];
  };
  professionalRelevance: {
    tier: Tier;
    matchedSkills: string[];
    missingSkills: string[];
    transferableSkills: string[];
    seniorityAlignment: 'aligned' | 'stretch' | 'below' | 'unknown';
  };
  candidatePreferences: {
    roleFit: 'preferred' | 'neutral' | 'unfavorable';
    locationFit: 'preferred' | 'neutral' | 'unfavorable';
    remoteFit: 'preferred' | 'neutral' | 'unfavorable';
    salaryFit: 'meets' | 'below' | 'unspecified';
  };
  sourceConfidence: {
    level: 'HIGH' | 'MEDIUM' | 'UNVERIFIED';
    verifiedWithin72h: boolean;
    sourceType: 'official_ats' | 'candidate_entry';
  };
  companyContext: {
    stage: CompanyStage;
    teamSize: HeadcountRange;
    hiringSignal: HiringSignal;
    isWatched: boolean;
    momentumTrend: CompanyMomentum['trend'];
  };
  applicationEffort: {
    level: ApplicationEffortAssessment['level'];
    estimatedMinutes: number | null;
    basis: string;
  };
}

export type NextBestAction = 'APPLY' | 'INVESTIGATE' | 'INVESTIGATE_COMPANY' | 'WATCH' | 'PRACTICE_GAPS' | 'SKIP';

export interface DecisionFactors {
  why: string;
  supportingEvidence: string[];
  missingInformation: string[];
  tradeoffs: string[];
  recommendedNextStep: string;
}

export interface DecisionReadyShortlistEntry {
  job: JobSummary;
  dimensions: ShortlistDimensions;
  recommendationExplanation: string;
  nextBestAction: NextBestAction;
  decisionFactors?: DecisionFactors;
}

export function evaluateDecisionReadyOpportunity(
  db: Db,
  job: JobSummary,
  ctx: CandidateContext,
  now = new Date(),
): DecisionReadyShortlistEntry {
  const settings = ctx.settings;
  const fit: Fit | undefined = job.fitDetail;

  // 1. Hard Eligibility Dimension
  const criticalFailures: string[] = [];
  const eligibilityReasons: string[] = [];

  if (job.status === 'CLOSED') {
    criticalFailures.push('The posting has closed.');
  }

  if (settings?.excludedEmployers?.some((e: string) => e.toLowerCase() === job.employer.toLowerCase())) {
    criticalFailures.push('You excluded this employer in Settings.');
  }

  const eligibilityFactor = fit?.factors.find((f) => f.id === 'eligibility');
  if (eligibilityFactor?.verdict === 'gap') {
    criticalFailures.push(eligibilityFactor.detail);
  } else if (eligibilityFactor?.verdict === 'meets') {
    eligibilityReasons.push('Meets work location eligibility.');
  }

  const workAuthFactor = fit?.factors.find((f) => f.id === 'workAuthorization');
  if (workAuthFactor?.verdict === 'gap') {
    criticalFailures.push(workAuthFactor.detail);
  } else if (workAuthFactor?.verdict === 'meets') {
    eligibilityReasons.push('Meets work authorization requirements.');
  }

  const hardEligibilityPassed = criticalFailures.length === 0;

  // 2. Professional Relevance Dimension
  const expFactor = fit?.factors.find((f) => f.id === 'experience');
  const seniorityAlignment: ShortlistDimensions['professionalRelevance']['seniorityAlignment'] =
    expFactor?.verdict === 'meets'
      ? 'aligned'
      : expFactor?.verdict === 'gap'
        ? 'below'
        : expFactor?.verdict === 'partial'
          ? 'stretch'
          : 'unknown';

  const professionalRelevance: ShortlistDimensions['professionalRelevance'] = {
    tier: fit?.tier ?? 'unknown',
    matchedSkills: fit?.matchedSkills ?? [],
    missingSkills: fit?.missingRequiredSkills ?? [],
    transferableSkills: fit?.transferableSkills ?? [],
    seniorityAlignment,
  };

  // 3. Candidate Preferences Dimension
  const roleFactor = fit?.factors.find((f) => f.id === 'role');
  const roleFit = roleFactor?.verdict === 'meets' ? 'preferred' : 'neutral';

  const arrangementFactor = fit?.factors.find((f) => f.id === 'arrangement');
  const remoteFit =
    arrangementFactor?.verdict === 'meets'
      ? 'preferred'
      : arrangementFactor?.verdict === 'gap'
        ? 'unfavorable'
        : 'neutral';

  const salaryFactor = fit?.factors.find((f) => f.id === 'salary');
  const salaryFit =
    salaryFactor?.verdict === 'meets' || salaryFactor?.verdict === 'partial'
      ? 'meets'
      : salaryFactor?.verdict === 'gap'
        ? 'below'
        : 'unspecified';

  const marketFactor = fit?.factors.find((f) => f.id === 'market');
  const locationFit =
    marketFactor?.verdict === 'meets' ? 'preferred' : marketFactor?.verdict === 'gap' ? 'unfavorable' : 'neutral';

  const candidatePreferences: ShortlistDimensions['candidatePreferences'] = {
    roleFit,
    locationFit,
    remoteFit,
    salaryFit,
  };

  // 4. Source Confidence Dimension
  const verifiedWithin72h = job.status === 'OPEN';
  const isCandidateEntry = job.status === 'UNVERIFIED' || job.sources.includes('manual');
  const sourceConfidence: ShortlistDimensions['sourceConfidence'] = {
    level: verifiedWithin72h ? 'HIGH' : isCandidateEntry ? 'UNVERIFIED' : 'MEDIUM',
    verifiedWithin72h,
    sourceType: isCandidateEntry ? 'candidate_entry' : 'official_ats',
  };

  // 5. Company Context Dimension
  const companyKey = normalizeEmployerName(job.employer);
  const companyRow = db.prepare('SELECT id FROM company_registry WHERE employer_key = ?').get(companyKey) as
    | { id: string }
    | undefined;

  const company360: Company360Profile | null = companyRow ? getCompany360(db, companyRow.id, now) : null;

  const companyContext: ShortlistDimensions['companyContext'] = {
    stage: company360?.stage.value ?? 'UNKNOWN',
    teamSize: company360?.teamSizeRange.value ?? 'UNKNOWN',
    hiringSignal: company360?.hiringSignal ?? (job.status === 'OPEN' ? 'VERIFIED_OPEN_ROLES' : 'NOT_YET_OBSERVED'),
    isWatched: Boolean(company360?.isWatched),
    momentumTrend: company360?.momentum.trend ?? 'UNKNOWN',
  };

  // 6. Application Effort Dimension
  const effortAssessment = evaluateApplicationEffort({
    title: job.title,
    descriptionText: '', // Will evaluate basic title if descriptionText is in row
    candidateHasMasterResume: true,
    candidateWorkAuthSet: Boolean(settings?.workAuthorizations),
  });

  const applicationEffort: ShortlistDimensions['applicationEffort'] = {
    level: effortAssessment.level,
    estimatedMinutes: effortAssessment.estimatedMinutes,
    basis: effortAssessment.estimationBasis,
  };

  // Recommendation & Next Best Action Synthesis
  let recommendationExplanation = '';
  let nextBestAction: NextBestAction = 'INVESTIGATE';

  const supportingEvidence: string[] = [];
  const missingInformation: string[] = [];
  const tradeoffs: string[] = [];
  let why = '';
  let recommendedNextStep = '';

  if (!hardEligibilityPassed) {
    nextBestAction = 'SKIP';
    why = 'Critical statutory or candidate eligibility blocker identified.';
    recommendationExplanation = `Ineligible: ${criticalFailures.join(' ')}`;
    tradeoffs.push(...criticalFailures);
    recommendedNextStep = 'Skip this role or mark Not for me to keep your discovery feed focused.';
  } else if (fit?.tier === 'strong') {
    nextBestAction = 'APPLY';
    why = 'High professional relevance with verified skills meeting stated requirements.';
    recommendationExplanation = `Strong fit: Your verified skills meet employer requirements and no critical eligibility gaps were observed.`;
    supportingEvidence.push(...eligibilityReasons);
    if (professionalRelevance.matchedSkills.length > 0) {
      supportingEvidence.push(`Confirmed skills: ${professionalRelevance.matchedSkills.join(', ')}`);
    }
    recommendedNextStep = 'Prepare tailored application package and review screening questions.';
  } else if (companyContext.isWatched) {
    nextBestAction = 'APPLY';
    why = `Watched employer: You are actively monitoring ${job.employer}.`;
    recommendationExplanation = `Watched company: You are following ${job.employer}, and this role aligns with your target preferences.`;
    supportingEvidence.push(`Employer is on your personal watchlist with alert settings enabled.`);
    recommendedNextStep = 'Inspect company 360 intelligence and prepare tailored application package.';
  } else if (professionalRelevance.missingSkills.length > 0) {
    nextBestAction = 'INVESTIGATE';
    why = `Promising opportunity with addressable skill or seniority stretch.`;
    recommendationExplanation = `Possible fit with skills gaps: Missing ${professionalRelevance.missingSkills.join(', ')}. Review interview prep topics before applying.`;
    tradeoffs.push(`Requires skills: ${professionalRelevance.missingSkills.join(', ')}`);
    recommendedNextStep = 'Investigate company tech stack and practice gap topics in Prep.';
  } else {
    nextBestAction = 'INVESTIGATE';
    why = 'Matches your preferred role family and work arrangement.';
    recommendationExplanation = `Worth exploring: Matches your target role and work arrangement. Inspect company 360 intelligence to decide.`;
    recommendedNextStep = 'Inspect company 360 profile and verify team stage.';
  }

  if (!job.salary) {
    missingInformation.push('Employer did not disclose compensation range in posting.');
  }

  const decisionFactors: DecisionFactors = {
    why,
    supportingEvidence,
    missingInformation,
    tradeoffs,
    recommendedNextStep,
  };

  return {
    job,
    dimensions: {
      hardEligibility: {
        passed: hardEligibilityPassed,
        reasons: eligibilityReasons,
        criticalFailures,
      },
      professionalRelevance,
      candidatePreferences,
      sourceConfidence,
      companyContext,
      applicationEffort,
    },
    recommendationExplanation,
    nextBestAction,
    decisionFactors,
  };
}
