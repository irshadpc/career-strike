import { describe, expect, it } from 'vitest';
import { evaluateApplicationEffort } from '../../src/career/application-effort.js';

describe('Application Effort & Readiness Assessment', () => {
  it('identifies low effort roles with standard resume requirements', () => {
    const assessment = evaluateApplicationEffort({
      title: 'Backend Engineer',
      descriptionText: 'We are looking for a backend engineer with TypeScript and Node.js experience.',
      candidateHasMasterResume: true,
    });

    expect(assessment.level).toBe('LOW');
    expect(assessment.estimatedMinutes).toBe(10);
    expect(assessment.observed.requiresResume).toBe(true);
    expect(assessment.observed.requiresCoverLetter).toBe(false);
    expect(assessment.observed.requiresPortfolio).toBe(false);
    expect(assessment.readinessChecks.find((c) => c.key === 'resume')?.ready).toBe(true);
  });

  it('detects medium effort when cover letter or portfolio is mentioned', () => {
    const assessment = evaluateApplicationEffort({
      title: 'Frontend Engineer',
      descriptionText: 'Please submit your CV and a link to your GitHub or design portfolio.',
      candidateHasMasterResume: true,
    });

    expect(assessment.level).toBe('MEDIUM');
    expect(assessment.observed.requiresPortfolio).toBe(true);
    expect(assessment.readinessChecks.some((c) => c.key === 'portfolio')).toBe(true);
  });

  it('detects high effort when custom essays or complex questions are required', () => {
    const assessment = evaluateApplicationEffort({
      title: 'Staff Product Manager',
      descriptionText: 'Requires a statement of purpose and detailed cover letter.',
      questions: [
        {
          key: 'q1',
          label: 'Why do you want to join our team? Tell us why in a written response.',
          required: true,
          kind: 'long_text',
          options: [],
          voluntary: false,
        },
      ],
      candidateHasMasterResume: true,
    });

    expect(assessment.level).toBe('HIGH');
    expect(assessment.estimatedMinutes).toBe(45);
    expect(assessment.observed.requiresCustomEssays).toBe(true);
    expect(assessment.estimationBasis).toContain('heuristic estimate');
  });
});
