import { skillsIn } from '../matching/skills.js';
import type { MasterResumeDocument } from './master-resume.js';

/**
 * Deterministic document readiness. These checks are explainable local heuristics about the
 * candidate's own document: they never simulate a named employer ATS, never rank the candidate
 * and never promise an outcome. A WARN is a prompt to review, not a failure.
 */
export type DocumentCheckStatus = 'PASS' | 'WARN' | 'FAIL';
export type DocumentReadinessState = 'READY_TO_TAILOR' | 'NEEDS_ATTENTION' | 'INCOMPLETE';

export interface DocumentCheck {
  id: string;
  label: string;
  status: DocumentCheckStatus;
  explanation: string;
  fixHref: string | null;
}

export interface DocumentReadinessReport {
  state: DocumentReadinessState;
  score: number;
  passed: number;
  warnings: number;
  failed: number;
  checks: DocumentCheck[];
  summary: string;
  disclaimer: string;
  generatedAt: string;
}

const QUANTIFIED =
  /\b\d+(?:[.,]\d+)?\s*(?:%|percent|x|times|users|customers|clients|people|engineers|services|projects|countries|markets|hours|days|weeks|months)\b/gi;
const PLACEHOLDER = /\[(?:add|your)\b[^\]]*\]/i;
const TABLE_ROW = /^\s*\|.*\|.*\|\s*$/m;

const has = (text: string, section: string): boolean => text.includes(section);

export function evaluateDocumentReadiness(
  document: Pick<MasterResumeDocument, 'content' | 'counts' | 'identity' | 'sourceFacts' | 'sourceEvidence'>,
  confirmedSkills: readonly string[],
  now = new Date(),
): DocumentReadinessReport {
  const checks: DocumentCheck[] = [];
  const name = document.identity.hasName;
  const { counts } = document;

  checks.push({
    id: 'identity',
    label: 'Candidate Identity',
    status: name ? 'PASS' : 'FAIL',
    explanation: name
      ? 'A candidate name is present at the top of the document.'
      : 'Add your full name in Settings so the document identifies you.',
    fixHref: name ? null : '/settings#identity.fullName',
  });

  checks.push({
    id: 'contact',
    label: 'Contact Information',
    status: document.identity.hasEmail ? 'PASS' : 'FAIL',
    explanation: document.identity.hasEmail
      ? 'An email address is included for employer replies.'
      : 'Add an email address in Settings; applications cannot be prepared without one.',
    fixHref: document.identity.hasEmail ? null : '/settings#identity.email',
  });

  checks.push({
    id: 'contact_channels',
    label: 'Additional Contact Channels',
    status: document.identity.hasPhone || document.identity.hasLinkedIn ? 'PASS' : 'WARN',
    explanation:
      document.identity.hasPhone || document.identity.hasLinkedIn
        ? 'A phone number or professional profile link is included.'
        : 'Optional: add a phone number or LinkedIn URL if you want employers to reach you that way.',
    fixHref: document.identity.hasPhone || document.identity.hasLinkedIn ? null : '/settings#candidate.linkedinUrl',
  });

  checks.push({
    id: 'confirmed_experience',
    label: 'Confirmed Experience',
    status: counts.roles > 0 ? 'PASS' : 'FAIL',
    explanation:
      counts.roles > 0
        ? `${counts.roles} approved role${counts.roles === 1 ? '' : 's'} included with dates.`
        : 'Add at least one past role and confirm it in your profile.',
    fixHref: counts.roles > 0 ? null : '/profile',
  });

  checks.push({
    id: 'confirmed_skills',
    label: 'Confirmed Skills',
    status: counts.skills > 0 ? 'PASS' : 'FAIL',
    explanation:
      counts.skills > 0
        ? `${counts.skills} approved skill${counts.skills === 1 ? '' : 's'} included.`
        : 'Add the skills you can substantiate in your profile.',
    fixHref: counts.skills > 0 ? null : '/profile',
  });

  checks.push({
    id: 'evidence_provenance',
    label: 'Evidence Provenance',
    status: document.sourceEvidence > 0 ? 'PASS' : 'WARN',
    explanation:
      document.sourceEvidence > 0
        ? `Built only from ${document.sourceFacts} approved fact${document.sourceFacts === 1 ? '' : 's'} and ${document.sourceEvidence} confirmed evidence item${document.sourceEvidence === 1 ? '' : 's'}.`
        : 'No confirmed project or achievement evidence yet. Add evidence only if it is accurate and yours.',
    fixHref: document.sourceEvidence > 0 ? null : '/profile#evidence',
  });

  const headings = ['PROFESSIONAL SUMMARY', 'CORE SKILLS', 'PROFESSIONAL EXPERIENCE'];
  const missingHeadings = headings.filter((heading) => !has(document.content, heading));
  checks.push({
    id: 'standard_headings',
    label: 'Standard Section Headings',
    status: missingHeadings.length === 0 ? 'PASS' : 'FAIL',
    explanation:
      missingHeadings.length === 0
        ? 'Uses plain section headings: summary, core skills and professional experience.'
        : `Missing section heading${missingHeadings.length === 1 ? '' : 's'}: ${missingHeadings.join(', ')}.`,
    fixHref: missingHeadings.length === 0 ? null : '/profile',
  });

  const placeholder = document.content.match(PLACEHOLDER)?.[0] ?? null;
  checks.push({
    id: 'no_placeholders',
    label: 'No Unresolved Placeholders',
    status: placeholder ? 'FAIL' : 'PASS',
    explanation: placeholder
      ? `Replace the placeholder “${placeholder}” with a real value or remove the line.`
      : 'No placeholder values remain in the document.',
    fixHref: placeholder ? '/profile' : null,
  });

  const hasTabs = document.content.includes('\t');
  const hasTable = TABLE_ROW.test(document.content);
  checks.push({
    id: 'plain_text_layout',
    label: 'Plain-Text Layout',
    status: hasTabs || hasTable ? 'FAIL' : 'PASS',
    explanation:
      hasTabs || hasTable
        ? 'Tabs or table rows can be read inconsistently by text extractors. Use plain lines and single-column lists.'
        : 'The document uses plain lines and bullet lists with no tables or tab-separated columns.',
    fixHref: hasTabs || hasTable ? '/resume' : null,
  });

  const quantified = [...document.content.matchAll(QUANTIFIED)];
  checks.push({
    id: 'quantified_evidence',
    label: 'Quantified Outcomes',
    status: quantified.length > 0 ? 'PASS' : 'WARN',
    explanation:
      quantified.length > 0
        ? `${quantified.length} measurable outcome${quantified.length === 1 ? '' : 's'} found in your confirmed material.`
        : 'No measurable outcome found. Add a real number only where you can substantiate it (for example, scale or time saved).',
    fixHref: quantified.length > 0 ? null : '/profile#evidence',
  });

  const listed = new Set(confirmedSkills.map((skill) => skill.toLowerCase()));
  const unlisted = skillsIn(document.content).filter((skill) => !listed.has(skill.toLowerCase()));
  checks.push({
    id: 'skill_consistency',
    label: 'Skill Statement Consistency',
    status: unlisted.length === 0 ? 'PASS' : 'WARN',
    explanation:
      unlisted.length === 0
        ? 'Skills named in the document also appear in your confirmed profile.'
        : `The document names ${unlisted.slice(0, 5).join(', ')}${unlisted.length > 5 ? ' and others' : ''} outside your confirmed skills. Add them to your profile only if accurate, or remove them.`,
    fixHref: unlisted.length === 0 ? null : '/profile',
  });

  const passed = checks.filter((check) => check.status === 'PASS').length;
  const warnings = checks.filter((check) => check.status === 'WARN').length;
  const failed = checks.filter((check) => check.status === 'FAIL').length;
  const score = Math.round(((passed + warnings * 0.5) / checks.length) * 100);
  const state: DocumentReadinessState =
    failed > 0 ? 'INCOMPLETE' : warnings > 0 ? 'NEEDS_ATTENTION' : 'READY_TO_TAILOR';
  const summary =
    state === 'READY_TO_TAILOR'
      ? 'Your master document is complete and internally consistent. Tailor it for a role when you are ready.'
      : state === 'NEEDS_ATTENTION'
        ? 'Your document is usable. Review the highlighted items before tailoring or submitting it.'
        : 'Fix the required items below before preparing an application.';

  return {
    state,
    score,
    passed,
    warnings,
    failed,
    checks,
    summary,
    disclaimer:
      'This is a local, deterministic checklist of your own document. It is not an ATS certification, does not simulate a named employer system, and cannot guarantee parsing, ranking or an interview.',
    generatedAt: now.toISOString(),
  };
}
