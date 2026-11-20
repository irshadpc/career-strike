import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateResumeAlignment,
  lookupTaxonomyAliases,
  seedTaxonomyIfEmpty,
  segmentJobRequirements,
} from '../../src/career/alignment-engine.js';
import { type Db, openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

describe('Three-Tier Local Alignment Engine', () => {
  let db: Db;

  beforeEach(() => {
    db = openDb(path.join(tempDir(), 'align-test.db'));
    seedTaxonomyIfEmpty(db);
  });

  afterEach(() => {
    db.close();
  });

  it('seeds and resolves taxonomy aliases for modern tech', () => {
    const k8s = lookupTaxonomyAliases(db, 'k8s');
    expect(k8s).not.toBeNull();
    expect(k8s?.canonical).toBe('Kubernetes');
    expect(k8s?.aliases).toContain('k8s');

    const ts = lookupTaxonomyAliases(db, 'typescript');
    expect(ts?.canonical).toBe('TypeScript');
  });

  it('segments job descriptions into required and preferred blocks', () => {
    const jd = `
      Senior Backend Engineer

      Required Qualifications:
      • 5+ years building distributed backend services
      • Expert in TypeScript and Node.js
      • Hands-on Kubernetes deployment experience

      Preferred Qualifications:
      • Experience with Terraform and AWS
      • Prior fintech payment processing knowledge
    `;

    const { mustHave, preferred } = segmentJobRequirements(jd);
    expect(mustHave.length).toBeGreaterThanOrEqual(2);
    expect(preferred.length).toBeGreaterThanOrEqual(1);
  });

  it('evaluates exact, taxonomy synonym, and counterfactual lifts', () => {
    const jd = `
      Required Qualifications:
      • TypeScript
      • Kubernetes
      • Rust
    `;

    // Candidate has TypeScript (Exact), K8s (Synonym for Kubernetes), but lacks Rust
    const resume = `
      Software Engineer with deep experience in TypeScript, React, and K8s container deployment.
    `;

    const res = evaluateResumeAlignment(db, resume, jd);
    expect(res.rubric.find((r) => r.term === 'TypeScript')?.status).toBe('MEETS_EXACT');
    expect(res.rubric.find((r) => r.term === 'Kubernetes')?.status).toBe('MEETS_SYNONYM');
    expect(res.rubric.find((r) => r.term === 'Rust')?.status).toBe('GAP');

    expect(res.mustHaveScore).toBe(67); // 2 out of 3
    expect(res.isTopFit).toBe(false);
    expect(res.counterfactualFixes.length).toBeGreaterThanOrEqual(1);
    expect(res.counterfactualFixes[0]?.targetRequirement).toBe('Rust');
  });
});
