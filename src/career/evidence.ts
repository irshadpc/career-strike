import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';
import { listFacts } from './profile.js';

const url = z.string().url().max(2_000);

export const EvidenceValues = {
  project: z
    .object({
      name: z.string().trim().min(1).max(160),
      summary: z.string().trim().min(1).max(2_000),
      skills: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
      url: url.nullable().default(null),
    })
    .strict(),
  achievement: z
    .object({
      text: z.string().trim().min(1).max(1_000),
      roleFactId: z
        .string()
        .regex(/^fact_[A-Za-z0-9_-]+$/)
        .nullable()
        .default(null),
    })
    .strict(),
  portfolio: z
    .object({
      label: z.string().trim().min(1).max(120),
      url,
    })
    .strict(),
  employment_detail: z
    .object({
      roleFactId: z.string().regex(/^fact_[A-Za-z0-9_-]+$/),
      summary: z.string().trim().min(1).max(2_000),
    })
    .strict(),
} as const;

export type EvidenceKind = keyof typeof EvidenceValues;
export const NewEvidence = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('project'), value: EvidenceValues.project }).strict(),
  z.object({ kind: z.literal('achievement'), value: EvidenceValues.achievement }).strict(),
  z.object({ kind: z.literal('portfolio'), value: EvidenceValues.portfolio }).strict(),
  z.object({ kind: z.literal('employment_detail'), value: EvidenceValues.employment_detail }).strict(),
]);

export interface EvidenceRevision {
  id: number;
  evidenceId: string;
  revision: number;
  change: 'CREATED' | 'UPDATED' | 'CONFIRMED' | 'BACKFILLED';
  value: Record<string, unknown>;
  source: 'user' | 'document';
  confirmed: boolean;
  actor: string;
  at: string;
}

export interface EvidenceConflict {
  evidenceId: string;
  otherId: string;
  kind: EvidenceKind;
  reason: 'DUPLICATE_IDENTITY_WITH_DIFFERENT_DETAILS';
  message: string;
}

export interface ProfileEvidence {
  id: string;
  kind: EvidenceKind;
  value: Record<string, unknown>;
  source: 'user' | 'document';
  confirmed: boolean;
  revision: number;
  lastConfirmedAt: string | null;
  lastConfirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  kind: EvidenceKind;
  value_json: string;
  source: 'user' | 'document';
  confirmed: number;
  revision: number;
  last_confirmed_at: string | null;
  last_confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

const toEvidence = (row: Row): ProfileEvidence => ({
  id: row.id,
  kind: row.kind,
  value: JSON.parse(row.value_json) as Record<string, unknown>,
  source: row.source,
  confirmed: row.confirmed === 1,
  revision: row.revision,
  lastConfirmedAt: row.last_confirmed_at,
  lastConfirmedBy: row.last_confirmed_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function listEvidence(db: Db, opts: { confirmedOnly?: boolean } = {}): ProfileEvidence[] {
  const rows = db
    .prepare(
      `SELECT * FROM profile_evidence ${opts.confirmedOnly ? 'WHERE confirmed = 1' : ''} ORDER BY kind, created_at`,
    )
    .all() as Row[];
  return rows.map(toEvidence);
}

function insertRevision(
  db: Db,
  evidenceId: string,
  revision: number,
  change: EvidenceRevision['change'],
  value: Record<string, unknown>,
  source: 'user' | 'document',
  confirmed: boolean,
  actor: string,
  at: string,
): void {
  db.prepare(
    `INSERT INTO profile_evidence_revisions
       (evidence_id, revision, change, value_json, source, confirmed, actor, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(evidenceId, revision, change, JSON.stringify(value), source, confirmed ? 1 : 0, actor, at);
}

/** Candidate-entered evidence is confirmed immediately; parsers may only create unconfirmed rows. */
export function addEvidence(db: Db, input: z.infer<typeof NewEvidence>, actor: string): ProfileEvidence {
  const id = `evidence_${randomBytes(9).toString('base64url')}`;
  const at = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO profile_evidence
         (id, kind, value_json, source, confirmed, revision, last_confirmed_at, last_confirmed_by, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 1, 1, ?, ?, ?, ?)`,
    ).run(id, input.kind, JSON.stringify(input.value), at, actor, at, at);
    insertRevision(db, id, 1, 'CREATED', input.value, 'user', true, actor, at);
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(
      at,
      actor,
      'profile.evidence.added',
      `${input.kind}:${id}`,
    );
  })();
  return toEvidence(db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row);
}

export function updateEvidence(
  db: Db,
  id: string,
  value: unknown,
  actor: string,
): ProfileEvidence | 'not_found' | z.ZodError {
  const current = db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row | undefined;
  if (!current) return 'not_found';
  const parsed = EvidenceValues[current.kind].safeParse(value);
  if (!parsed.success) return parsed.error;
  const at = new Date().toISOString();
  const revision = current.revision + 1;
  db.transaction(() => {
    db.prepare(
      `UPDATE profile_evidence
         SET value_json = ?, source = 'user', confirmed = 1, revision = ?, last_confirmed_at = ?, last_confirmed_by = ?, updated_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(parsed.data), revision, at, actor, at, id);
    insertRevision(db, id, revision, 'UPDATED', parsed.data as Record<string, unknown>, 'user', true, actor, at);
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(
      at,
      actor,
      'profile.evidence.updated',
      `${current.kind}:${id}`,
    );
  })();
  return toEvidence(db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row);
}

export function confirmEvidence(db: Db, id: string, actor: string): ProfileEvidence | null {
  const at = new Date().toISOString();
  const current = db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row | undefined;
  if (!current) return null;
  let changed = false;
  db.transaction(() => {
    if (current.confirmed === 1) {
      // Confirmation is itself provenance: record who re-affirmed the exact value and when.
      const revision = current.revision + 1;
      db.prepare(
        'UPDATE profile_evidence SET revision = ?, last_confirmed_at = ?, last_confirmed_by = ?, updated_at = ? WHERE id = ?',
      ).run(revision, at, actor, at, id);
      insertRevision(
        db,
        id,
        revision,
        'CONFIRMED',
        JSON.parse(current.value_json) as Record<string, unknown>,
        current.source,
        true,
        actor,
        at,
      );
      changed = true;
    } else {
      const revision = current.revision + 1;
      changed =
        db
          .prepare(
            `UPDATE profile_evidence
               SET confirmed = 1, revision = ?, last_confirmed_at = ?, last_confirmed_by = ?, updated_at = ?
             WHERE id = ? AND confirmed = 0`,
          )
          .run(revision, at, actor, at, id).changes > 0;
      if (changed)
        insertRevision(
          db,
          id,
          revision,
          'CONFIRMED',
          JSON.parse(current.value_json) as Record<string, unknown>,
          current.source,
          true,
          actor,
          at,
        );
    }
    if (changed)
      db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(
        at,
        actor,
        'profile.evidence.confirmed',
        id,
      );
  })();
  const row = db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row | undefined;
  return row ? toEvidence(row) : null;
}

export function listEvidenceRevisions(db: Db, evidenceId: string): EvidenceRevision[] {
  const rows = db
    .prepare('SELECT * FROM profile_evidence_revisions WHERE evidence_id = ? ORDER BY revision DESC')
    .all(evidenceId) as {
    id: number;
    evidence_id: string;
    revision: number;
    change: EvidenceRevision['change'];
    value_json: string;
    source: 'user' | 'document';
    confirmed: number;
    actor: string;
    at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    evidenceId: row.evidence_id,
    revision: row.revision,
    change: row.change,
    value: JSON.parse(row.value_json) as Record<string, unknown>,
    source: row.source,
    confirmed: row.confirmed === 1,
    actor: row.actor,
    at: row.at,
  }));
}

function identityKey(item: ProfileEvidence): string | null {
  const string = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim().toLowerCase().replace(/\s+/g, ' ') : null;
  if (item.kind === 'project') return string(item.value.name);
  if (item.kind === 'portfolio') return string(item.value.label) ?? string(item.value.url);
  if (item.kind === 'achievement') return string(item.value.text);
  if (item.kind === 'employment_detail') return string(item.value.roleFactId);
  return null;
}

/**
 * Flag evidence that describes the same thing twice with different details. Conflicts are review
 * prompts, not deletions: the candidate decides which version is accurate.
 */
export function evidenceConflicts(items: readonly ProfileEvidence[]): EvidenceConflict[] {
  const byKey = new Map<string, ProfileEvidence[]>();
  for (const item of items) {
    const key = identityKey(item);
    if (!key) continue;
    const composite = `${item.kind}:${key}`;
    byKey.set(composite, [...(byKey.get(composite) ?? []), item]);
  }
  const conflicts: EvidenceConflict[] = [];
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        if (JSON.stringify(a.value) === JSON.stringify(b.value)) continue;
        conflicts.push({
          evidenceId: a.id,
          otherId: b.id,
          kind: a.kind,
          reason: 'DUPLICATE_IDENTITY_WITH_DIFFERENT_DETAILS',
          message:
            'Two evidence items describe the same thing but contain different details. Review both and remove or correct the inaccurate one before preparing an application.',
        });
      }
    }
  }
  return conflicts;
}

export function deleteEvidence(db: Db, id: string, actor: string): boolean {
  const at = new Date().toISOString();
  const removed = db.prepare('DELETE FROM profile_evidence WHERE id = ?').run(id).changes > 0;
  if (removed)
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(
      at,
      actor,
      'profile.evidence.deleted',
      id,
    );
  return removed;
}

/** A stable snapshot of facts eligible for generated claims. It deliberately excludes unconfirmed evidence. */
export function profileFingerprint(db: Db): string {
  const value = {
    facts: listFacts(db, { approvedOnly: true }).map((f) => ({ id: f.id, kind: f.kind, value: f.value })),
    evidence: listEvidence(db, { confirmedOnly: true }).map((e) => ({ id: e.id, kind: e.kind, value: e.value })),
  };
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
