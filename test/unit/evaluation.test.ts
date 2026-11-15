import { describe, expect, it } from 'vitest';
import { evaluateLearning } from '../../src/learning/evaluation.js';

describe('learning evaluation harness', () => {
  it('passes every synthetic invariant and reports its own coverage', () => {
    const report = evaluateLearning(new Date('2026-11-15T12:00:00.000Z'));
    expect(report.passed).toBe(true);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.checks).toBe(18);
    expect(report.scenarios.map((scenario) => scenario.id)).toEqual([
      'sample-size-honesty',
      'comparison-with-n',
      'allowlist',
      'accept-and-undo',
      'edit-snooze-dismiss',
      'tamper-refusal',
    ]);
    for (const scenario of report.scenarios) {
      expect(
        scenario.checks.every((check) => check.passed),
        scenario.id,
      ).toBe(true);
    }
  });
});
