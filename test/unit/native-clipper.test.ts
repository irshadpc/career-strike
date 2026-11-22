import { describe, expect, it } from 'vitest';
import { addManualJob } from '../../src/career/jobs.js';
import { getNativeManifestDirs } from '../../src/cli/native-clipper.js';
import { openDb } from '../../src/store/db.js';

describe('chrome native messaging clipper', () => {
  it('detects native messaging manifest directories for the platform', () => {
    const dirs = getNativeManifestDirs();
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs.some((d) => d.includes('Chrome') || d.includes('chrome'))).toBe(true);
  });

  it('clips roles from LinkedIn, Workday or Naukri into SQLite without CORS friction', () => {
    const db = openDb(':memory:');
    try {
      const id = addManualJob(db, {
        title: 'Lead Platform Architect',
        employer: 'Shopify',
        location: 'Remote, Canada',
        url: 'https://www.linkedin.com/jobs/view/123456789/',
        remotePolicy: 'remote',
        description: 'Lead large scale merchant payment infrastructure.',
      });

      expect(id).toMatch(/^job_[A-Za-z0-9_-]+/);
      const row = db.prepare('SELECT title, employer, remote_policy FROM jobs WHERE id = ?').get(id) as {
        title: string;
        employer: string;
        remote_policy: string;
      };
      expect(row.title).toBe('Lead Platform Architect');
      expect(row.employer).toBe('Shopify');
      expect(row.remote_policy).toBe('remote');
    } finally {
      db.close();
    }
  });
});
