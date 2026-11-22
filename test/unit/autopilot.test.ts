import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  DAILY_FOCUS_CAP,
  detectAtsProvider,
  getDailyFocusUsage,
  registerAutopilotRoutes,
} from '../../src/service/routes/autopilot.js';
import { openDb } from '../../src/store/db.js';

describe('Autopilot Queue & Reusable Answer Vault', () => {
  it('detects ATS providers accurately from URLs', () => {
    expect(detectAtsProvider('https://boards.greenhouse.io/figma/jobs/123')).toBe('greenhouse');
    expect(detectAtsProvider('https://jobs.lever.co/netflix/456')).toBe('lever');
    expect(detectAtsProvider('https://jobs.ashbyhq.com/linear/789')).toBe('ashby');
    expect(detectAtsProvider('https://wd5.myworkdayjobs.com/en-US/target/job/101')).toBe('workday');
    expect(detectAtsProvider('https://company.com/careers/apply')).toBe('other');
  });

  it('enforces duplicate-company warnings, reuses answer_vault across jobs, and generates receipts on mark-sent', async () => {
    const db = openDb(':memory:');
    const app = Fastify();
    registerAutopilotRoutes(app, { db });

    const now = new Date().toISOString();

    // 1. Seed jobs (two at Stripe, one at Linear on Ashby, one at Workday)
    db.prepare(`
      INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, remote_policy, employment_type, status, first_seen_at, last_seen_at, description_json, description_text, apply_url)
      VALUES
        ('job_stripe_1', 'can_s1', 'dup_s1', 'Stripe', 'Frontend Platform Engineer', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'React and Design Systems', 'https://boards.greenhouse.io/stripe/jobs/1'),
        ('job_stripe_2', 'can_s2', 'dup_s2', 'Stripe', 'Backend Payments Engineer', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'APIs and Distributed Systems', 'https://boards.greenhouse.io/stripe/jobs/2'),
        ('job_linear', 'can_l1', 'dup_l1', 'Linear', 'Staff Product Engineer', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'Sync engines and native clients', 'https://jobs.ashbyhq.com/linear/3'),
        ('job_workday', 'can_w1', 'dup_w1', 'BigCorp', 'Senior Cloud Engineer', 'onsite', 'full_time', 'OPEN', ?, ?, '[]', 'Enterprise IT', 'https://myworkdayjobs.com/bigcorp/4')
    `).run(now, now, now, now, now, now, now, now);

    // Seed a contact at Stripe for warm-path check
    db.prepare(`
      INSERT INTO contacts (id, name, company, title, email, linkedin_url, source, created_at, updated_at)
      VALUES ('c_stripe_1', 'Sarah Lin', 'Stripe', 'Staff Engineer', 'sarah@example.com', 'https://linkedin.com/in/sarahlin', 'referral', ?, ?)
    `).run(now, now);

    // 2. Batch Queue: Queue both Stripe jobs -> Should trigger duplicate company warning and warm path match
    const batchRes = await app.inject({
      method: 'POST',
      url: '/api/autopilot/batch',
      payload: { jobIds: ['job_stripe_1', 'job_stripe_2'] },
    });

    expect(batchRes.statusCode).toBe(200);
    const batchBody = batchRes.json();
    expect(batchBody.queued).toHaveLength(2);

    // Duplicate company warning verified
    expect(batchBody.duplicateCompanyWarnings).toHaveLength(1);
    expect(batchBody.duplicateCompanyWarnings[0]).toMatchObject({
      company: 'Stripe',
      count: 2,
    });
    expect(batchBody.duplicateCompanyWarnings[0].message).toContain('Warning: You queued 2 roles at Stripe');

    // Warm path match verified
    expect(batchBody.warmPathMatches).toHaveLength(2);
    expect(batchBody.warmPathMatches[0].contacts[0]).toMatchObject({
      name: 'Sarah Lin',
      email: 'sarah@example.com',
    });

    // Since answer_vault is empty, first job needs an answer
    const item1 = batchBody.queued[0];
    expect(item1.status).toBe('needs_answer');
    expect(item1.pendingQuestion).not.toBeNull();
    expect(item1.pendingQuestion.questionKey).toBe('eu_work_auth');

    // 3. Answer questions and verify persistence into answer_vault
    const ans1 = await app.inject({
      method: 'POST',
      url: `/api/autopilot/${item1.id}/answer`,
      payload: { answer: false, saveAsDefault: true },
    });
    expect(ans1.statusCode).toBe(200);
    // Next standard question is notice_period
    expect(ans1.json().item.pendingQuestion.questionKey).toBe('notice_period');

    const ans2 = await app.inject({
      method: 'POST',
      url: `/api/autopilot/${item1.id}/answer`,
      payload: { answer: '30 days', saveAsDefault: true },
    });
    expect(ans2.json().item.pendingQuestion.questionKey).toBe('relocation');

    const ans3 = await app.inject({
      method: 'POST',
      url: `/api/autopilot/${item1.id}/answer`,
      payload: { answer: true, saveAsDefault: true },
    });
    expect(ans3.json().item.status).toBe('queued');
    expect(ans3.json().item.pendingQuestion).toBeNull();

    // Verify answer_vault persisted 3 answers
    const answersRes = await app.inject({ method: 'GET', url: '/api/autopilot/answers' });
    expect(answersRes.json().answers).toHaveLength(3);
    const keys = answersRes
      .json()
      .answers.map((a: { questionKey: string }) => a.questionKey)
      .sort();
    expect(keys).toEqual(['eu_work_auth', 'notice_period', 'relocation']);

    // 4. Queue third job (Linear) -> answer_vault reuse test!
    // Since all 3 standard answers are now saved in answer_vault, job_linear goes straight to 'queued'!
    const linearBatch = await app.inject({
      method: 'POST',
      url: '/api/autopilot/batch',
      payload: { jobIds: ['job_linear'] },
    });
    expect(linearBatch.statusCode).toBe(200);
    const linearItem = linearBatch.json().queued[0];
    expect(linearItem.status).toBe('queued');
    expect(linearItem.pendingQuestion).toBeNull();
    expect(linearItem.atsProvider).toBe('ashby');

    // 5. Queue Workday job -> Honest blocked fallback test!
    const workdayBatch = await app.inject({
      method: 'POST',
      url: '/api/autopilot/batch',
      payload: { jobIds: ['job_workday'] },
    });
    expect(workdayBatch.statusCode).toBe(200);
    const workdayItem = workdayBatch.json().queued[0];
    expect(workdayItem.status).toBe('blocked_fallback');
    expect(workdayItem.atsProvider).toBe('workday');

    // 6. Mark item1 sent -> Receipt generation & tracker update test!
    const markSentRes = await app.inject({
      method: 'POST',
      url: `/api/autopilot/${item1.id}/mark-sent`,
      payload: { fieldsFilled: 14, resumeSnapshotId: 'snap_v1' },
    });
    expect(markSentRes.statusCode).toBe(200);
    const sentData = markSentRes.json();
    expect(sentData.ok).toBe(true);
    expect(sentData.receipt).toMatchObject({
      fieldsFilled: 14,
      resumeSnapshotId: 'snap_v1',
      atsProvider: 'greenhouse',
      companyName: 'Stripe',
      trackedAs: 'Applied',
      verifiedPdfAttached: true,
    });
    expect(sentData.receipt.timestamp).toBeDefined();

    // Verify SQLite applications table was updated to SUBMITTED_CONFIRMED
    const appRow = db.prepare('SELECT state FROM applications WHERE job_id = ?').get('job_stripe_1') as {
      state: string;
    };
    expect(appRow).toBeDefined();
    expect(appRow.state).toBe('SUBMITTED_CONFIRMED');

    // 7. GET /api/autopilot/queue returns active items and sent receipts
    const queueGet = await app.inject({ method: 'GET', url: '/api/autopilot/queue' });
    expect(queueGet.statusCode).toBe(200);
    const queueBody = queueGet.json();
    expect(queueBody.receipts).toHaveLength(1);
    expect(queueBody.receipts[0].companyName).toBe('Stripe');
    expect(queueBody.dailyFocusCap).toBe(DAILY_FOCUS_CAP);
    expect(queueBody.usedFocusCap).toBe(4); // 4 jobs queued today
    expect(queueBody.remainingFocusCap).toBe(1); // 5 - 4 = 1

    // 8. Daily Focus Cap enforcement test:
    // Adding 2 more jobs when only 1 slot remains should fail with 400 DAILY_FOCUS_CAP_EXCEEDED
    db.prepare(`
      INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, remote_policy, employment_type, status, first_seen_at, last_seen_at, description_json, description_text, apply_url)
      VALUES
        ('job_cap_1', 'can_c1', 'dup_c1', 'CapCo', 'DevOps', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'k8s', 'https://cap.co/1'),
        ('job_cap_2', 'can_c2', 'dup_c2', 'CapCo2', 'SRE', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'k8s', 'https://cap.co/2')
    `).run(now, now, now, now);

    const capExceededRes = await app.inject({
      method: 'POST',
      url: '/api/autopilot/batch',
      payload: { jobIds: ['job_cap_1', 'job_cap_2'] },
    });
    expect(capExceededRes.statusCode).toBe(400);
    expect(capExceededRes.json().error).toBe('DAILY_FOCUS_CAP_EXCEEDED');
    expect(capExceededRes.json().remainingFocusCap).toBe(1);
  });
});
