import { describe, expect, it } from 'vitest';
import { lintBullet, lintRoleBullets } from '../../src/career/bullet-linter.js';

describe('Google XYZ & Anti-Slop Bullet Linter', () => {
  it('identifies passive openers and penalizes them', () => {
    const res = lintBullet('Responsible for maintaining Kubernetes infrastructure');
    expect(res.hasPassiveOpener).toBe(true);
    expect(res.passiveOpenerMatch).toMatch(/responsible for/i);
    expect(res.xyzScore).toBeLessThan(50);
    expect(res.recommendation).toContain('Replace passive starter');
  });

  it('rewards quantified achievements following Google XYZ structure', () => {
    const res = lintBullet('Reduced p99 API latency by 42% across 10M daily requests by migrating to Fastify');
    expect(res.hasPassiveOpener).toBe(false);
    expect(res.isQuantified).toBe(true);
    expect(res.metrics).toContain('42%');
    expect(res.xyzScore).toBeGreaterThanOrEqual(80);
    expect(res.metricPrompt).toBeNull();
  });

  it('detects AI clichés and buzzwords', () => {
    const res = lintBullet('Spearheaded cross-functional initiatives to delve into cutting-edge tapestry workflows');
    expect(res.cliches.length).toBeGreaterThanOrEqual(3);
    expect(res.xyzScore).toBeLessThan(40);
  });

  it('detects visual symmetry tells across AI-generated bullets', () => {
    // 3 bullets with artificially identical character count (~70 chars each)
    const bullets = [
      'Designed a distributed microservice architecture for payment processing.', // 73
      'Optimized backend database queries to improve real-time request handling.', // 73
      'Implemented automated continuous deployment pipelines for cloud servers.', // 73
    ];
    const audit = lintRoleBullets(bullets);
    expect(audit.hasVisualSymmetryTell).toBe(true);
    expect(audit.feedbackSummary).toContain('Identical bullet lengths detected');
  });

  it('passes natural human-written bullets with diverse rhythm', () => {
    const bullets = [
      'Built and open-sourced an internal CLI tool adopted by 40+ engineers.',
      'Cut AWS infrastructure spend by $120k annually through proactive instance rightsizing.',
      'Mentored 3 junior developers.',
    ];
    const audit = lintRoleBullets(bullets);
    expect(audit.hasVisualSymmetryTell).toBe(false);
    expect(audit.quantifiedRate).toBeGreaterThan(0.6);
  });

  it('extracts multiple metrics, flags first-person pronouns, and detects duplicate opening verbs', () => {
    const b = lintBullet('I reduced p99 API latency by 42% across 10M daily requests saving $120k annually.');
    expect(b.metrics.length).toBeGreaterThanOrEqual(3);
    expect(b.warnings.some((w) => w.includes('first-person'))).toBe(true);

    const audit = lintRoleBullets([
      'Built distributed cache layer cutting p99 latency by 35%.',
      'Built automated CI/CD pipeline across 20 services.',
    ]);
    expect(audit.duplicateVerbs).toContain('built');
  });
});
