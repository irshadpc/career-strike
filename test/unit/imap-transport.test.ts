import { describe, expect, it } from 'vitest';
import { advanceApplicationFromCandidate, pollImapTransport } from '../../src/sources/imap-transport.js';
import { openDb } from '../../src/store/db.js';

describe('imap transport', () => {
  it('returns empty result when imap sync is not enabled or credentials are missing', async () => {
    const db = openDb(':memory:');
    try {
      const res = await pollImapTransport(db);
      expect(res.polled).toBe(0);
      expect(res.newCandidates).toBe(0);
      expect(res.candidates).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('advances matching application to INTERVIEW on recruiter email confirmation', () => {
    const db = openDb(':memory:');
    try {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, remote_policy, employment_type, status, first_seen_at, last_seen_at, description_json, description_text)
        VALUES ('job_test_1', 'can_1', 'dup_1', 'Acme Corp', 'Staff Engineer', 'remote', 'full_time', 'OPEN', ?, ?, '[]', 'Payments infra')
      `).run(now, now);

      db.prepare(`
        INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at)
        VALUES ('app_test_1', 'job_test_1', 'SUBMITTED_CONFIRMED', 'manual', 1, ?, ?)
      `).run(now, now);

      const candidate = {
        from_addr: 'recruiter@example.com',
        subject: 'Invitation to interview for Acme Corp Staff Engineer role',
      };

      const result = advanceApplicationFromCandidate(db, candidate);
      expect(result).not.toBeNull();
      expect(result?.applicationId).toBe('app_test_1');
      expect(result?.fromState).toBe('SUBMITTED_CONFIRMED');
      expect(result?.toState).toBe('INTERVIEW');

      const updated = db.prepare('SELECT state FROM applications WHERE id = ?').get('app_test_1') as { state: string };
      expect(updated.state).toBe('INTERVIEW');
    } finally {
      db.close();
    }
  });
});
