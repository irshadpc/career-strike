import { describe, expect, it } from 'vitest';
import { generateOnboardingFromJob, seedHiredModeFromWonJob } from '../../src/career/hired-seed.js';
import { openDb } from '../../src/store/db.js';

describe('hired mode auto-seeding', () => {
  it('generates 30-60-90 plan, stakeholder map, and week-1 questions from job description and interview debrief notes', () => {
    const job = {
      title: 'Principal Distributed Systems Engineer',
      employer: 'Datadog',
      descriptionText: 'Designing scalable microservices, Kafka pipelines, and high availability systems.',
    };
    const interviewNotes = ['Team struggling with Kafka partition rebalances', 'Hiring manager emphasized 1:1 cadence'];

    const plan = generateOnboardingFromJob(job, interviewNotes);
    expect(plan.days30).toContain('Kafka');
    expect(plan.days30).toContain('Assimilate & Map');
    expect(plan.days60).toContain('Contribute & Build Velocity');
    expect(plan.days90).toContain('Own & Elevate');
    expect(plan.stakeholders).toContain('Hiring Manager');
    expect(plan.stakeholders).toContain('Tech Lead');
    expect(plan.questions).toContain('first 90 days');
  });

  it('seeds Hired Mode from an accepted offer and persists into onboarding_plans', () => {
    const db = openDb(':memory:');
    try {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, remote_policy, employment_type, status, first_seen_at, last_seen_at, description_json, description_text)
        VALUES ('job_won_1', 'can_w1', 'dup_w1', 'Figma', 'Staff Systems Engineer', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'Design collaboration infra')
      `).run(now, now);

      db.prepare(`
        INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at)
        VALUES ('app_won_1', 'job_won_1', 'OFFER', 'manual', 1, ?, ?)
      `).run(now, now);

      db.prepare(`
        INSERT INTO interviews (id, application_id, stage, format, scheduled_at, notes, outcome, created_at, updated_at)
        VALUES ('int_1', 'app_won_1', 'system_design', 'video', ?, 'Discussed multi-region replication latency', 'passed', ?, ?)
      `).run(now, now, now);

      const seeded = seedHiredModeFromWonJob(db, 'app_won_1');
      expect(seeded.jobTitle).toBe('Staff Systems Engineer');
      expect(seeded.company).toBe('Figma');
      expect(seeded.plan.days30).toContain('multi-region replication');

      const saved = db.prepare('SELECT * FROM onboarding_plans WHERE id = ?').get(seeded.id) as {
        id: string;
        application_id: string;
        job_title: string;
        plan_json: string;
      };
      expect(saved.application_id).toBe('app_won_1');
      expect(saved.job_title).toBe('Staff Systems Engineer');
    } finally {
      db.close();
    }
  });
});
