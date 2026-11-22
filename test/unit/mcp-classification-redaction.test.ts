import { describe, expect, it } from 'vitest';
import { getCareerContext, redactRecord } from '../../src/career/career-context.js';
import { openDb } from '../../src/store/db.js';

describe('MCP classification redaction', () => {
  it('strips SECRET and SENSITIVE fields when tier is PUBLIC', () => {
    const entry = {
      id: 'ent_123',
      entry_type: 'experience',
      organization: 'Acme Systems',
      title: 'Principal Systems Architect',
      location: 'San Francisco, CA',
      start_date: '2022-01-01',
      end_date: null,
      is_current: 1,
      sort_order: 1,
      updated_at: '2026-11-20T00:00:00.000Z',
    };

    // When tier is PUBLIC, only PUBLIC columns should remain (none exist on master_entries)
    const publicRedacted = redactRecord('master_entries', entry, 'PUBLIC');
    expect(publicRedacted.organization).toBeUndefined();
    expect(publicRedacted.title).toBeUndefined();
    expect(publicRedacted.id).toBeUndefined(); // id is INTERNAL

    // When tier is INTERNAL, id, is_current, sort_order, updated_at are retained, but SENSITIVE fields are stripped
    const internalRedacted = redactRecord('master_entries', entry, 'INTERNAL');
    expect(internalRedacted.id).toBe('ent_123');
    expect(internalRedacted.is_current).toBe(1);
    expect(internalRedacted.organization).toBeUndefined();
    expect(internalRedacted.title).toBeUndefined();

    // When tier is PERSONAL, SENSITIVE fields (title, organization) are still stripped unless allowSensitive=true
    const personalRedacted = redactRecord('master_entries', entry, 'PERSONAL', false);
    expect(personalRedacted.organization).toBeUndefined();
    expect(personalRedacted.title).toBeUndefined();

    // When allowSensitive is true, SENSITIVE fields are preserved
    const sensitiveRedacted = redactRecord('master_entries', entry, 'PERSONAL', true);
    expect(sensitiveRedacted.organization).toBe('Acme Systems');
    expect(sensitiveRedacted.title).toBe('Principal Systems Architect');
  });

  it('never leaks SECRET columns under any tier or option', () => {
    const session = {
      id_hash: 'secret_hash_value',
      csrf_token: 'secret_csrf_token',
      created_at: '2026-11-20T00:00:00.000Z',
      expires_at: '2026-12-04T00:00:00.000Z',
      last_seen_at: '2026-11-20T00:00:00.000Z',
    };

    const redacted = redactRecord('dashboard_sessions', session, 'PERSONAL', true);
    expect(redacted.id_hash).toBeUndefined();
    expect(redacted.csrf_token).toBeUndefined();
    expect(redacted.created_at).toBe('2026-11-20T00:00:00.000Z');
  });

  it('redacts Master Vault roles, verified skills, and Brag Doc highlights in getCareerContext', () => {
    const db = openDb(':memory:');
    try {
      const now = new Date().toISOString();

      // Seed master entry and bullet
      db.prepare(`
        INSERT INTO master_entries (id, entry_type, organization, title, location, start_date, end_date, is_current, sort_order, updated_at)
        VALUES ('entry_test', 'experience', 'Datadog', 'Staff Distributed Systems Engineer', 'Remote', '2021', null, 1, 1, ?)
      `).run(now);

      db.prepare(`
        INSERT INTO master_bullets (id, entry_id, raw_text, verified_metrics_json, canonical_skill_ids_json, scope_level, xyz_score, star_story_id, updated_at)
        VALUES ('b_test', 'entry_test', 'Architected Kafka clustering', '["10M eps"]', '["kafka"]', 'org', 95, null, ?)
      `).run(now);

      // Seed verified skill
      db.prepare(`
        INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at)
        VALUES ('fact_test', 'skill', '{"name":"Kafka","years":5}', 'user', 1, ?, ?)
      `).run(now, now);

      // Seed brag entry
      db.prepare(`
        INSERT INTO brag_entries (id, scope_tier, competency, title, impact, created_at)
        VALUES ('brag_test', 'org', 'distributed-systems', 'Kafka Reliability Revamp', 'Zero outages in 12 months', ?)
      `).run(now);

      // 1. PUBLIC tier
      const publicContext = getCareerContext(db, 'PUBLIC');
      expect(publicContext.sensitiveIncluded).toBe(false);
      // Skills: value_json is SENSITIVE, so it is stripped in PUBLIC tier
      for (const sk of publicContext.verifiedSkills) {
        expect(sk.value_json).toBeUndefined();
      }
      // Brag: competency, title, impact are PERSONAL, so bragHighlights is empty or stripped
      for (const br of publicContext.bragHighlights) {
        expect(br.title).toBeUndefined();
        expect(br.impact).toBeUndefined();
      }

      // 2. PERSONAL tier without allowSensitive
      const personalContext = getCareerContext(db, 'PERSONAL', { allowSensitive: false });
      expect(personalContext.bragHighlights.length).toBeGreaterThan(0);
      expect(personalContext.bragHighlights[0]?.title).toBe('Kafka Reliability Revamp');
      // But SENSITIVE raw_text in bullets is still stripped
      for (const r of personalContext.roles) {
        const bullets = (r.bullets ?? []) as Record<string, unknown>[];
        for (const b of bullets) {
          expect(b.raw_text).toBeUndefined();
        }
      }

      // 3. Sensitive allowed
      const sensitiveContext = getCareerContext(db, 'PERSONAL', { allowSensitive: true });
      expect(sensitiveContext.sensitiveIncluded).toBe(true);
      expect(sensitiveContext.roles[0]?.title).toBe('Staff Distributed Systems Engineer');
      const bullets = (sensitiveContext.roles[0]?.bullets ?? []) as Record<string, unknown>[];
      expect(bullets[0]?.raw_text).toBe('Architected Kafka clustering');
    } finally {
      db.close();
    }
  });
});
