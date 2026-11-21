import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  backfillJobSkills,
  extractSkills,
  listSkillFacets,
  syncJobSkills,
} from '../../src/ingestion/skillExtractor.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

describe('Skill Extractor & Normalizer', () => {
  it('extracts canonical skills and handles aliases', () => {
    const text = 'Looking for a Senior Backend Engineer with experience in K8s, TS, Postgres, and ReactJS.';
    const skills = extractSkills('Senior Engineer', text);
    const slugs = skills.map((s) => s.slug);

    expect(slugs).toContain('kubernetes');
    expect(slugs).toContain('typescript');
    expect(slugs).toContain('postgresql');
    expect(slugs).toContain('react');

    const labels = skills.map((s) => s.label);
    expect(labels).toContain('Kubernetes');
    expect(labels).toContain('TypeScript');
    expect(labels).toContain('PostgreSQL');
    expect(labels).toContain('React');
  });

  it('correctly handles symbols like C++, C#, .NET, and Node.js', () => {
    const title = 'C++ & C# Systems Architect (.NET & Node.js)';
    const description = 'Build high performance distributed systems using C++, C#, .NET, and Node.js with CI/CD.';
    const skills = extractSkills(title, description);
    const slugs = skills.map((s) => s.slug);

    expect(slugs).toContain('cpp');
    expect(slugs).toContain('csharp');
    expect(slugs).toContain('nodejs');
    expect(slugs).toContain('ci_cd');
    expect(slugs).toContain('system_design');
  });

  it('avoids false positives for short words like Go, Java, and React', () => {
    // English verb "go" should not trigger Golang
    const nonTechText = 'We are looking for a good communicator to go through requirements and help us go live.';
    const nonTechSkills = extractSkills('Operations Lead', nonTechText);
    expect(nonTechSkills.map((s) => s.slug)).not.toContain('golang');

    // Legitimate Golang mentions should match
    const golangText = 'Experience building microservices with Python, Go, and Docker.';
    const golangSkills = extractSkills('Backend Engineer', golangText);
    expect(golangSkills.map((s) => s.slug)).toContain('golang');

    const directGolang = 'Proficient with Golang and gRPC.';
    const directGolangSkills = extractSkills('Go Developer', directGolang);
    expect(directGolangSkills.map((s) => s.slug)).toContain('golang');

    // "JavaScript" should not trigger "Java"
    const jsOnly = 'Experience with JavaScript, HTML, and CSS.';
    const jsSkills = extractSkills('Frontend Developer', jsOnly);
    expect(jsSkills.map((s) => s.slug)).toContain('javascript');
    expect(jsSkills.map((s) => s.slug)).not.toContain('java');

    // "Reactive" should not trigger "React"
    const reactiveText = 'Design reactive event loops in an asynchronous environment.';
    const reactiveSkills = extractSkills('Engineer', reactiveText);
    expect(reactiveSkills.map((s) => s.slug)).not.toContain('react');
  });

  it('extracts product, fintech, security and auth skills', () => {
    const text =
      'Manage product roadmap, payments gateway (Stripe), passkeys auth (FIDO2/WebAuthn), and SOC 2 security compliance.';
    const skills = extractSkills('Lead Product Manager', text);
    const slugs = skills.map((s) => s.slug);

    expect(slugs).toContain('product_management');
    expect(slugs).toContain('payments');
    expect(slugs).toContain('passkey');
    expect(slugs).toContain('security');
  });

  it('persists extracted skills and computes live facets with filters', () => {
    const db = openDb(path.join(tempDir(), 'skill-test.db'));
    try {
      // Seed two test jobs
      db.prepare(`
        INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, location_text, remote_policy, employment_type,
          description_json, description_text, status, first_seen_at, last_seen_at, country_code, country_codes_json, work_mode)
        VALUES ('job_1', 'can_1', 'dup_1', 'Acme', 'Staff TS Engineer', 'San Francisco, CA', 'remote', 'full_time',
          '[]', 'Required: TypeScript, React, and Kubernetes.', 'OPEN', '2026-01-01', '2026-01-01', 'US', '["US"]', 'remote')
      `).run();

      db.prepare(`
        INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, location_text, remote_policy, employment_type,
          description_json, description_text, status, first_seen_at, last_seen_at, country_code, country_codes_json, work_mode)
        VALUES ('job_2', 'can_2', 'dup_2', 'Beta Corp', 'Python Developer', 'London, UK', 'onsite', 'full_time',
          '[]', 'Required: Python, PostgreSQL, and Kubernetes.', 'OPEN', '2026-01-01', '2026-01-01', 'GB', '["GB"]', 'onsite')
      `).run();

      // Sync skills for job_1 and job_2
      syncJobSkills(db, 'job_1', 'Staff TS Engineer', 'Required: TypeScript, React, and Kubernetes.');
      syncJobSkills(db, 'job_2', 'Python Developer', 'Required: Python, PostgreSQL, and Kubernetes.');

      // Check all facets
      const allFacets = listSkillFacets(db);
      expect(allFacets.length).toBeGreaterThanOrEqual(4);

      const k8sFacet = allFacets.find((f) => f.slug === 'kubernetes');
      expect(k8sFacet).toBeDefined();
      expect(k8sFacet?.count).toBe(2); // In both job_1 and job_2

      const tsFacet = allFacets.find((f) => f.slug === 'typescript');
      expect(tsFacet?.count).toBe(1); // Only in job_1

      // Filter by US country
      const usFacets = listSkillFacets(db, { country: 'US' });
      const usK8s = usFacets.find((f) => f.slug === 'kubernetes');
      expect(usK8s?.count).toBe(1);

      const usPython = usFacets.find((f) => f.slug === 'python');
      expect(usPython).toBeUndefined(); // Python is in GB job

      // Test backfill functionality on unindexed job
      db.prepare(`
        INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, location_text, remote_policy, employment_type,
          description_json, description_text, status, first_seen_at, last_seen_at, country_code, country_codes_json, work_mode)
        VALUES ('job_3', 'can_3', 'dup_3', 'Gamma Ltd', 'Go & Docker Lead', 'Berlin, Germany', 'hybrid', 'full_time',
          '[]', 'Required: Golang and Docker containers.', 'OPEN', '2026-01-01', '2026-01-01', 'DE', '["DE"]', 'hybrid')
      `).run();

      const backfillResult = backfillJobSkills(db);
      expect(backfillResult.backfilledCount).toBe(1);

      const job3Skills = db.prepare('SELECT skill_slug FROM job_skills WHERE job_id = ?').all('job_3') as {
        skill_slug: string;
      }[];
      const job3Slugs = job3Skills.map((s) => s.skill_slug);
      expect(job3Slugs).toContain('golang');
      expect(job3Slugs).toContain('docker');
    } finally {
      db.close();
    }
  });
});
