import type { ApplicationQuestion } from '../sources/types.js';

export type EffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ObservedApplicationRequirements {
  requiresResume: boolean;
  requiresCoverLetter: boolean;
  requiresPortfolio: boolean;
  requiresCustomEssays: boolean;
  requiresScreeningQuestions: boolean;
  screeningQuestionCount: number;
  requiresWorkAuthDeclaration: boolean;
  observedQuestions: { key: string; label: string; required: boolean; kind: string }[];
  unobservedFactors: string[];
}

export interface ReadinessCheckItem {
  key: string;
  label: string;
  ready: boolean;
  hint: string;
}

export interface ApplicationEffortAssessment {
  level: EffortLevel;
  observed: ObservedApplicationRequirements;
  estimatedMinutes: number | null;
  estimationBasis: string;
  readinessChecks: ReadinessCheckItem[];
  recommendation: string;
}

const PORTFOLIO_REGEX = /\b(portfolio|github|dribbble|work samples?|design link|code samples?|live project)\b/i;
const ESSAY_REGEX =
  /\b(written response|short essay|cover letter required|tell us why|statement of purpose|custom questions?)\b/i;
const COVER_LETTER_REGEX = /\b(cover letter|letter of motivation|motivational letter)\b/i;
const WORK_AUTH_REGEX = /\b(work authorization|authorized to work|visa sponsorship|citizenship|right to work)\b/i;

export function evaluateApplicationEffort(input: {
  title: string;
  descriptionText: string;
  questions?: ApplicationQuestion[];
  candidateHasMasterResume?: boolean;
  candidateHasCoverLetter?: boolean;
  candidateWorkAuthSet?: boolean;
}): ApplicationEffortAssessment {
  const questions = input.questions ?? [];
  const text = input.descriptionText;

  let requiresCoverLetter = COVER_LETTER_REGEX.test(text);
  let requiresPortfolio = PORTFOLIO_REGEX.test(text);
  let requiresCustomEssays = false;
  let requiresWorkAuthDeclaration = WORK_AUTH_REGEX.test(text);

  const observedQuestions: { key: string; label: string; required: boolean; kind: string }[] = [];

  for (const q of questions) {
    observedQuestions.push({
      key: q.key,
      label: q.label,
      required: q.required,
      kind: q.kind,
    });
    const labelLower = q.label.toLowerCase();
    if (COVER_LETTER_REGEX.test(labelLower)) requiresCoverLetter = true;
    if (PORTFOLIO_REGEX.test(labelLower)) requiresPortfolio = true;
    if (WORK_AUTH_REGEX.test(labelLower)) requiresWorkAuthDeclaration = true;
    if (q.kind === 'long_text' && q.required) requiresCustomEssays = true;
  }

  if (ESSAY_REGEX.test(text)) requiresCustomEssays = true;

  const unobservedFactors: string[] = [];
  if (questions.length === 0) {
    unobservedFactors.push(
      'Employer has not published structured form questions via public API. Requirements derived from job description text.',
    );
  }

  let level: EffortLevel = 'LOW';
  let estimatedMinutes = 10;
  let estimationBasis = 'Standard resume submission with basic contact verification.';

  if (requiresCustomEssays || (requiresPortfolio && requiresCoverLetter)) {
    level = 'HIGH';
    estimatedMinutes = 45;
    estimationBasis =
      'Requires custom written essays, motivation statement, or curated portfolio verification in addition to your resume.';
  } else if (requiresCoverLetter || requiresPortfolio || questions.length >= 3) {
    level = 'MEDIUM';
    estimatedMinutes = 25;
    estimationBasis =
      'Requires tailored cover letter, portfolio link, or employer-specific screening questions beyond standard resume.';
  }

  const readinessChecks: ReadinessCheckItem[] = [
    {
      key: 'resume',
      label: 'Tailored Resume',
      ready: Boolean(input.candidateHasMasterResume),
      hint: input.candidateHasMasterResume
        ? 'Master resume available. Tailor for this role in Resume Studio.'
        : 'Build your master resume in Resume Studio before applying.',
    },
  ];

  if (requiresCoverLetter) {
    readinessChecks.push({
      key: 'cover_letter',
      label: 'Tailored Cover Letter',
      ready: Boolean(input.candidateHasCoverLetter),
      hint: input.candidateHasCoverLetter
        ? 'Draft available for candidate review.'
        : 'Generate a focused, truthful cover letter in Application Studio.',
    });
  }

  if (requiresPortfolio) {
    readinessChecks.push({
      key: 'portfolio',
      label: 'Portfolio / Work Samples',
      ready: false,
      hint: 'Employer specifically requests portfolio or code samples (verify links in Profile).',
    });
  }

  if (requiresWorkAuthDeclaration) {
    readinessChecks.push({
      key: 'work_auth',
      label: 'Work Authorization Record',
      ready: Boolean(input.candidateWorkAuthSet),
      hint: input.candidateWorkAuthSet
        ? 'Work authorization preference saved in Settings.'
        : 'Verify work authorization requirements in Settings.',
    });
  }

  const recommendation =
    level === 'LOW'
      ? 'Quick application: Verify resume fit, review document, and submit directly.'
      : level === 'MEDIUM'
        ? 'Moderate effort: Tailor your supporting letter and confirm screening answers before submitting.'
        : 'Significant effort: Dedicate preparation time for custom responses or portfolio curation before applying.';

  return {
    level,
    observed: {
      requiresResume: true,
      requiresCoverLetter,
      requiresPortfolio,
      requiresCustomEssays,
      requiresScreeningQuestions: questions.length > 0 || observedQuestions.length > 0,
      screeningQuestionCount: questions.length,
      requiresWorkAuthDeclaration,
      observedQuestions,
      unobservedFactors,
    },
    estimatedMinutes,
    estimationBasis: `${estimationBasis} (Note: Time is an empirical heuristic estimate; individual preparation varies).`,
    readinessChecks,
    recommendation,
  };
}
