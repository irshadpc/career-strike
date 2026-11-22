import { describe, expect, it } from 'vitest';
import { runPrepPipeline } from '../../src/service/prep-runner.js';
import { openDb } from '../../src/store/db.js';

describe('prep-runner deterministic background loop', () => {
  it('selects net-new candidates, creates prep packets and blocks ready status if ATS audit fails', async () => {
    const db = openDb(':memory:');
    try {
      const now = new Date().toISOString();

      // Seed 2 open jobs
      db.prepare(`
        INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, remote_policy, employment_type, status, first_seen_at, last_seen_at, description_json, description_text, apply_url)
        VALUES ('job_p1', 'can_p1', 'dup_p1', 'Vercel', 'Senior Frontend Engineer', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'Next.js rendering and Edge runtime', 'https://vercel.com/jobs/1')
      `).run(now, now);

      db.prepare(`
        INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, remote_policy, employment_type, status, first_seen_at, last_seen_at, description_json, description_text, apply_url)
        VALUES ('job_p2', 'can_p2', 'dup_p2', 'Cloudflare', 'Systems Engineer', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'Workers runtime and low-level networking', 'https://cloudflare.com/jobs/2')
      `).run(now, now);

      // Seed a profile fact
      db.prepare(`
        INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at)
        VALUES ('fact_1', 'role', '{"title":"Software Engineer","employer":"Acme","startYear":2021,"endYear":null,"summary":"Built edge services"}', 'user', 1, ?, ?)
      `).run(now, now);

      // 1. Run pipeline with forceAuditFail: true -> Gating test!
      const failRun = await runPrepPipeline(db, { limit: 1, forceAuditFail: true });
      expect(failRun.packetsCreated).toBe(1);
      const failPacket = failRun.packets[0]!;
      expect(failPacket.atsAuditPassed).toBe(0);
      expect(failPacket.status).toBe('draft'); // Blocked from 'ready'

      // Check SQLite persisted row
      const savedFail = db
        .prepare('SELECT status, ats_audit_passed FROM prep_packets WHERE id = ?')
        .get(failPacket.id) as {
        status: string;
        ats_audit_passed: number;
      };
      expect(savedFail.status).toBe('draft');
      expect(savedFail.ats_audit_passed).toBe(0);

      // 2. Run pipeline for the second job with normal audit (or mock)
      const successRun = await runPrepPipeline(db, { limit: 1, forceAuditFail: false });
      expect(successRun.packetsCreated).toBe(1);
      const successPacket = successRun.packets[0]!;
      // Packet is saved in SQLite
      const savedSuccess = db
        .prepare('SELECT status, screening_answers_json, company_brief_md FROM prep_packets WHERE id = ?')
        .get(successPacket.id) as {
        status: string;
        screening_answers_json: string;
        company_brief_md: string;
      };
      expect(savedSuccess.company_brief_md).toContain('Cloudflare');
      const answers = JSON.parse(savedSuccess.screening_answers_json);
      expect(answers.work_authorization).toBeDefined();
      expect(answers.why_this_role).toContain('Cloudflare');

      // 3. Candidates already processed are net-new filtered out
      const rerun = await runPrepPipeline(db, { limit: 5 });
      expect(rerun.packetsCreated).toBe(0);
    } finally {
      db.close();
    }
  });
});
