import { classOf, type DataClass } from '../store/classification.js';
import type { Db } from '../store/db.js';

export type ContextTier = 'PUBLIC' | 'INTERNAL' | 'PERSONAL';

const TIER_ORDER: Record<DataClass, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  PERSONAL: 2,
  SENSITIVE: 3,
  SECRET: 4,
};

/**
 * Redacts fields of a record based on their data classification relative to the requested tier.
 * SECRET is never returned under any circumstance.
 * SENSITIVE is stripped unless allowSensitive is explicitly true.
 */
export function redactRecord<T extends Record<string, unknown>>(
  table: string,
  record: T,
  tier: ContextTier,
  allowSensitive = false,
): Partial<T> {
  const maxRank = TIER_ORDER[tier];
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(record)) {
    const cls = classOf(table, key) ?? 'SENSITIVE';
    const rank = TIER_ORDER[cls];

    if (cls === 'SECRET') continue;
    if (cls === 'SENSITIVE') {
      if (allowSensitive) {
        out[key] = val;
      }
      continue;
    }

    if (rank <= maxRank) {
      out[key] = val;
    }
  }

  return out as Partial<T>;
}

export interface CareerContextResult {
  tier: ContextTier;
  sensitiveIncluded: boolean;
  roles: Partial<Record<string, unknown>>[];
  verifiedSkills: Partial<Record<string, unknown>>[];
  bragHighlights: Partial<Record<string, unknown>>[];
}

export function getCareerContext(
  db: Db,
  tier: ContextTier,
  options: { allowSensitive?: boolean } = {},
): CareerContextResult {
  const allowSensitive = Boolean(options.allowSensitive);

  // 1. Master Vault roles (master_entries + master_bullets)
  const entryRows = db.prepare('SELECT * FROM master_entries ORDER BY sort_order ASC, start_date DESC').all() as Record<
    string,
    unknown
  >[];
  const bulletRows = db.prepare('SELECT * FROM master_bullets ORDER BY rowid ASC').all() as Record<string, unknown>[];

  const bulletsByEntry = new Map<string, Record<string, unknown>[]>();
  for (const b of bulletRows) {
    const entryId = String(b.entry_id);
    const list = bulletsByEntry.get(entryId) ?? [];
    const redactedBullet = redactRecord('master_bullets', b, tier, allowSensitive);
    if (Object.keys(redactedBullet).length > 0) {
      list.push(redactedBullet);
    }
    bulletsByEntry.set(entryId, list);
  }

  const roles: Partial<Record<string, unknown>>[] = [];
  for (const e of entryRows) {
    const redactedEntry = redactRecord('master_entries', e, tier, allowSensitive);
    const entryId = String(e.id);
    const bullets = bulletsByEntry.get(entryId) ?? [];
    if (Object.keys(redactedEntry).length > 0 || bullets.length > 0) {
      roles.push({
        ...redactedEntry,
        bullets,
      });
    }
  }

  // 2. Verified skills (profile_facts WHERE kind = 'skill' AND approved = 1)
  const skillRows = db
    .prepare("SELECT * FROM profile_facts WHERE kind = 'skill' AND approved = 1 ORDER BY created_at ASC")
    .all() as Record<string, unknown>[];

  const verifiedSkills: Partial<Record<string, unknown>>[] = [];
  for (const s of skillRows) {
    const redactedSkill = redactRecord('profile_facts', s, tier, allowSensitive);
    if (Object.keys(redactedSkill).length > 0) {
      verifiedSkills.push(redactedSkill);
    }
  }

  // 3. Brag Doc highlights (brag_entries)
  const bragRows = db.prepare('SELECT * FROM brag_entries ORDER BY created_at DESC').all() as Record<string, unknown>[];

  const bragHighlights: Partial<Record<string, unknown>>[] = [];
  for (const br of bragRows) {
    const redactedBrag = redactRecord('brag_entries', br, tier, allowSensitive);
    if (Object.keys(redactedBrag).length > 0) {
      bragHighlights.push(redactedBrag);
    }
  }

  return {
    tier,
    sensitiveIncluded: allowSensitive,
    roles,
    verifiedSkills,
    bragHighlights,
  };
}
