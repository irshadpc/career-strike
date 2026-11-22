import { describe, expect, it } from 'vitest';
import { approveAllFactsWithIds, listFacts, unapproveFacts } from '../../src/career/profile.js';
import { openDb } from '../../src/store/db.js';

describe('batch approval and unapprove undo', () => {
  it('approves specific facts by IDs and allows instant undo', () => {
    const db = openDb(':memory:');
    try {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at)
        VALUES 
          ('f1', 'skill', '{"name":"TypeScript"}', 'document', 0, ?, ?),
          ('f2', 'skill', '{"name":"Go"}', 'document', 0, ?, ?),
          ('f3', 'role', '{"title":"Backend Lead"}', 'document', 0, ?, ?)
      `).run(now, now, now, now, now, now);

      expect(listFacts(db, { approvedOnly: true }).length).toBe(0);

      // Batch approve
      const result = approveAllFactsWithIds(db, 'user', undefined, ['f1', 'f2', 'f3']);
      expect(result.count).toBe(3);
      expect(result.approvedIds).toEqual(['f1', 'f2', 'f3']);
      expect(listFacts(db, { approvedOnly: true }).length).toBe(3);

      // Undo batch approval
      const undone = unapproveFacts(db, result.approvedIds, 'user');
      expect(undone).toBe(3);
      expect(listFacts(db, { approvedOnly: true }).length).toBe(0);
    } finally {
      db.close();
    }
  });
});
