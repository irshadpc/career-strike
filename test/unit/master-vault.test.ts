import { describe, expect, it } from 'vitest';
import {
  addMasterBullet,
  addMasterEntry,
  listMasterEntries,
  reorderMasterEntries,
  tailorMasterVariantForJd,
  updateMasterBullet,
  updateMasterEntry,
} from '../../src/career/master-vault.js';
import { addFact } from '../../src/career/profile.js';
import { openDb } from '../../src/store/db.js';
import { setSetting } from '../../src/store/settings.js';

describe('Master Vault CRUD, metadata analysis & 1-click JD tailoring', () => {
  it('auto-computes XYZ scores, metrics, and canonical skills on add/update and supports entry reorder', () => {
    const db = openDb(':memory:');
    const e1 = addMasterEntry(db, {
      entryType: 'experience',
      organization: 'Acme Systems',
      title: 'Senior Engineer',
      location: 'Remote',
      startDate: '2022-01',
      endDate: null,
      isCurrent: true,
      sortOrder: 0,
    });
    const e2 = addMasterEntry(db, {
      entryType: 'experience',
      organization: 'Beta Corp',
      title: 'Software Engineer',
      location: 'NYC',
      startDate: '2019-01',
      endDate: '2021-12',
      isCurrent: false,
      sortOrder: 1,
    });

    const bullet = addMasterBullet(db, e1.id, {
      rawText: 'Engineered TypeScript microservices on Kubernetes reducing p99 latency by 42%.',
    });
    expect(bullet.xyzScore).toBeGreaterThanOrEqual(80);
    expect(bullet.verifiedMetrics).toContain('42%');
    expect(bullet.canonicalSkillIds).toEqual(expect.arrayContaining(['TypeScript', 'Kubernetes']));

    const updatedBullet = updateMasterBullet(db, bullet.id, {
      rawText: 'Responsible for helping out on backend services.',
    });
    expect(updatedBullet?.xyzScore).toBeLessThan(bullet.xyzScore);
    expect(updatedBullet?.verifiedMetrics).toEqual([]);

    const updatedEntry = updateMasterEntry(db, e2.id, { title: 'Platform Engineer', location: 'Berlin' });
    expect(updatedEntry?.title).toBe('Platform Engineer');
    expect(updatedEntry?.location).toBe('Berlin');

    reorderMasterEntries(db, [e2.id, e1.id]);
    const list = listMasterEntries(db);
    expect(list.map((e) => e.id)).toEqual([e2.id, e1.id]);
    db.close();
  });

  it('ranks relevant bullets and composes a non-fabricating summary override for a target JD', () => {
    const db = openDb(':memory:');
    setSetting(db, 'identity.summary', 'Distributed systems engineer focused on reliability.', 'test');
    addFact(db, { kind: 'skill', value: { name: 'TypeScript', years: 5, level: 'expert' } }, 'test');
    addFact(db, { kind: 'skill', value: { name: 'Kubernetes', years: 4, level: 'proficient' } }, 'test');

    const e1 = addMasterEntry(db, {
      entryType: 'experience',
      organization: 'CloudCo',
      title: 'Staff Engineer',
      location: null,
      startDate: '2023-01',
      endDate: null,
      isCurrent: true,
      sortOrder: 0,
    });
    const relevantB = addMasterBullet(db, e1.id, {
      rawText: 'Architected Kubernetes control plane in TypeScript handling 50k RPS.',
    });
    const lessRelevantB = addMasterBullet(db, e1.id, {
      rawText: 'Organized weekly lunch-and-learn sessions for interns.',
    });

    const suggestion = tailorMasterVariantForJd(db, {
      jdText: 'Looking for a Platform Engineer experienced in TypeScript, Kubernetes, and Rust.',
      targetPages: 1,
    });

    expect(suggestion.matchedTerms).toEqual(expect.arrayContaining(['TypeScript', 'Kubernetes']));
    expect(suggestion.missingMustHaves).toContain('Rust');
    expect(suggestion.summaryOverride).toContain('Distributed systems engineer');
    expect(suggestion.summaryOverride).toContain('TypeScript');
    expect(suggestion.includedEntries[0]!.includedBulletIds).toContain(relevantB.id);
    expect(suggestion.includedEntries[0]!.includedBulletIds).toContain(lessRelevantB.id);
    db.close();
  });
});
