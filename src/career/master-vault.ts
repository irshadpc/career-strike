import { randomBytes } from 'node:crypto';
import type { Db } from '../store/db.js';
import { listFacts } from './profile.js';

export interface MasterBullet {
  id: string;
  entryId: string;
  rawText: string;
  verifiedMetrics: string[];
  canonicalSkillIds: string[];
  scopeLevel: 'individual' | 'team' | 'org';
  xyzScore: number;
  starStoryId: string | null;
  updatedAt: string;
}

export interface MasterEntry {
  id: string;
  entryType: 'experience' | 'project' | 'education' | 'certification';
  organization: string;
  title: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  sortOrder: number;
  updatedAt: string;
  bullets: MasterBullet[];
}

export interface IncludedEntrySelection {
  entryId: string;
  includedBulletIds: string[];
}

export interface ResumeVariant {
  id: string;
  jobApplicationId: string | null;
  name: string;
  templateId: string;
  pageFormat: 'LETTER' | 'A4';
  summaryOverride: string | null;
  includedEntries: IncludedEntrySelection[];
  bulletOverrides: Record<string, string>;
  designTokens: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedResumeContent {
  variantId: string;
  name: string;
  templateId: string;
  pageFormat: 'LETTER' | 'A4';
  summary: string | null;
  entries: {
    id: string;
    entryType: string;
    organization: string;
    title: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    bullets: {
      id: string;
      text: string;
      isTailored: boolean;
      verifiedMetrics: string[];
      canonicalSkillIds: string[];
      scopeLevel: string;
      xyzScore: number;
    }[];
  }[];
}

export interface ResumeSnapshot {
  id: string;
  variantId: string;
  jobApplicationId: string | null;
  format: 'pdf' | 'docx';
  filePath: string;
  fileSizeBytes: number;
  sha256: string;
  resolvedPayload: ResolvedResumeContent;
  atsAuditReport: Record<string, unknown>;
  jdAlignment: Record<string, unknown> | null;
  createdAt: string;
}

const idGen = (prefix: string) => `${prefix}_${randomBytes(8).toString('hex')}`;

export function listMasterEntries(db: Db): MasterEntry[] {
  const entries = db
    .prepare(
      `SELECT id, entry_type AS entryType, organization, title, location, start_date AS startDate,
              end_date AS endDate, is_current AS isCurrent, sort_order AS sortOrder, updated_at AS updatedAt
       FROM master_entries
       ORDER BY sort_order ASC, start_date DESC`,
    )
    .all() as (Omit<MasterEntry, 'bullets' | 'isCurrent'> & { isCurrent: number })[];

  const bulletsByEntry = new Map<string, MasterBullet[]>();
  const bullets = db
    .prepare(
      `SELECT id, entry_id AS entryId, raw_text AS rawText, verified_metrics_json AS verifiedMetricsJson,
              canonical_skill_ids_json AS canonicalSkillIdsJson, scope_level AS scopeLevel,
              xyz_score AS xyzScore, star_story_id AS starStoryId, updated_at AS updatedAt
       FROM master_bullets
       ORDER BY rowid ASC`,
    )
    .all() as {
    id: string;
    entryId: string;
    rawText: string;
    verifiedMetricsJson: string;
    canonicalSkillIdsJson: string;
    scopeLevel: 'individual' | 'team' | 'org';
    xyzScore: number;
    starStoryId: string | null;
    updatedAt: string;
  }[];

  for (const b of bullets) {
    const list = bulletsByEntry.get(b.entryId) ?? [];
    list.push({
      id: b.id,
      entryId: b.entryId,
      rawText: b.rawText,
      verifiedMetrics: JSON.parse(b.verifiedMetricsJson || '[]'),
      canonicalSkillIds: JSON.parse(b.canonicalSkillIdsJson || '[]'),
      scopeLevel: b.scopeLevel ?? 'individual',
      xyzScore: b.xyzScore,
      starStoryId: b.starStoryId,
      updatedAt: b.updatedAt,
    });
    bulletsByEntry.set(b.entryId, list);
  }

  return entries.map((e) => ({
    ...e,
    isCurrent: Boolean(e.isCurrent),
    bullets: bulletsByEntry.get(e.id) ?? [],
  }));
}

export function addMasterEntry(
  db: Db,
  entry: Omit<MasterEntry, 'id' | 'updatedAt' | 'bullets'> & { id?: string },
): MasterEntry {
  const id = entry.id ?? idGen('mentry');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO master_entries (id, entry_type, organization, title, location, start_date, end_date, is_current, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entry.entryType,
    entry.organization,
    entry.title,
    entry.location ?? null,
    entry.startDate ?? null,
    entry.endDate ?? null,
    entry.isCurrent ? 1 : 0,
    entry.sortOrder ?? 0,
    now,
  );
  return {
    id,
    entryType: entry.entryType,
    organization: entry.organization,
    title: entry.title,
    location: entry.location ?? null,
    startDate: entry.startDate ?? null,
    endDate: entry.endDate ?? null,
    isCurrent: Boolean(entry.isCurrent),
    sortOrder: entry.sortOrder ?? 0,
    updatedAt: now,
    bullets: [],
  };
}

export function addMasterBullet(
  db: Db,
  entryId: string,
  bullet: {
    id?: string;
    rawText: string;
    verifiedMetrics?: string[];
    canonicalSkillIds?: string[];
    scopeLevel?: 'individual' | 'team' | 'org';
    xyzScore?: number;
    starStoryId?: string | null;
  },
): MasterBullet {
  const id = bullet.id ?? idGen('mbullet');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO master_bullets (id, entry_id, raw_text, verified_metrics_json, canonical_skill_ids_json, scope_level, xyz_score, star_story_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entryId,
    bullet.rawText,
    JSON.stringify(bullet.verifiedMetrics ?? []),
    JSON.stringify(bullet.canonicalSkillIds ?? []),
    bullet.scopeLevel ?? 'individual',
    bullet.xyzScore ?? 0,
    bullet.starStoryId ?? null,
    now,
  );
  return {
    id,
    entryId,
    rawText: bullet.rawText,
    verifiedMetrics: bullet.verifiedMetrics ?? [],
    canonicalSkillIds: bullet.canonicalSkillIds ?? [],
    scopeLevel: bullet.scopeLevel ?? 'individual',
    xyzScore: bullet.xyzScore ?? 0,
    starStoryId: bullet.starStoryId ?? null,
    updatedAt: now,
  };
}

export function deleteMasterEntry(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM master_entries WHERE id = ?').run(id).changes > 0;
}

export function deleteMasterBullet(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM master_bullets WHERE id = ?').run(id).changes > 0;
}

/** Sync existing profile facts into master entries so the Vault is pre-populated. */
export function syncMasterFromProfile(db: Db): { entriesCreated: number; bulletsCreated: number } {
  const facts = listFacts(db);
  const existingCount = (db.prepare('SELECT COUNT(*) AS c FROM master_entries').get() as { c: number }).c;
  if (existingCount > 0) return { entriesCreated: 0, bulletsCreated: 0 };

  let entriesCreated = 0;
  let bulletsCreated = 0;

  for (const fact of facts) {
    if (fact.kind === 'role') {
      const v = fact.value as {
        title: string;
        employer: string | null;
        startYear: number;
        endYear: number | null;
        summary: string | null;
      };
      const entry = addMasterEntry(db, {
        entryType: 'experience',
        title: v.title,
        organization: v.employer ?? 'Independent / Consulting',
        location: null,
        startDate: v.startYear ? `${v.startYear}-01` : null,
        endDate: v.endYear ? `${v.endYear}-12` : null,
        isCurrent: v.endYear === null,
        sortOrder: entriesCreated,
      });
      entriesCreated += 1;
      if (v.summary) {
        for (const line of v.summary.split('\n')) {
          const trimmed = line.replace(/^[•*-]\s*/, '').trim();
          if (trimmed) {
            addMasterBullet(db, entry.id, { rawText: trimmed });
            bulletsCreated += 1;
          }
        }
      }
    } else if (fact.kind === 'education') {
      const v = fact.value as { qualification: string; institution: string | null; year: number | null };
      addMasterEntry(db, {
        entryType: 'education',
        title: v.qualification,
        organization: v.institution ?? 'Accredited Institution',
        location: null,
        startDate: null,
        endDate: v.year ? `${v.year}` : null,
        isCurrent: false,
        sortOrder: entriesCreated,
      });
      entriesCreated += 1;
    } else if (fact.kind === 'certification') {
      const v = fact.value as { name: string; issuer: string | null; year: number | null };
      addMasterEntry(db, {
        entryType: 'certification',
        title: v.name,
        organization: v.issuer ?? 'Issuing Body',
        location: null,
        startDate: null,
        endDate: v.year ? `${v.year}` : null,
        isCurrent: false,
        sortOrder: entriesCreated,
      });
      entriesCreated += 1;
    }
  }

  return { entriesCreated, bulletsCreated };
}

/** Save or update a copy-on-write variant overlay. */
export function saveResumeVariant(
  db: Db,
  variant: {
    id?: string;
    jobApplicationId?: string | null;
    name: string;
    templateId?: string;
    pageFormat?: 'LETTER' | 'A4';
    summaryOverride?: string | null;
    includedEntries: IncludedEntrySelection[];
    bulletOverrides?: Record<string, string>;
    designTokens?: Record<string, unknown>;
  },
): ResumeVariant {
  const id = variant.id ?? idGen('rvar');
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id, created_at FROM resume_variants WHERE id = ?').get(id) as
    | { id: string; created_at: string }
    | undefined;

  const createdAt = existing?.created_at ?? now;

  db.prepare(
    `INSERT INTO resume_variants (
       id, job_application_id, name, template_id, page_format, summary_override,
       included_entries_json, bullet_overrides_json, design_tokens_json, updated_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       job_application_id = excluded.job_application_id,
       name = excluded.name,
       template_id = excluded.template_id,
       page_format = excluded.page_format,
       summary_override = excluded.summary_override,
       included_entries_json = excluded.included_entries_json,
       bullet_overrides_json = excluded.bullet_overrides_json,
       design_tokens_json = excluded.design_tokens_json,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    variant.jobApplicationId ?? null,
    variant.name,
    variant.templateId ?? 'classic-single-col',
    variant.pageFormat ?? 'LETTER',
    variant.summaryOverride ?? null,
    JSON.stringify(variant.includedEntries),
    JSON.stringify(variant.bulletOverrides ?? {}),
    JSON.stringify(variant.designTokens ?? {}),
    now,
    createdAt,
  );

  return {
    id,
    jobApplicationId: variant.jobApplicationId ?? null,
    name: variant.name,
    templateId: variant.templateId ?? 'classic-single-col',
    pageFormat: variant.pageFormat ?? 'LETTER',
    summaryOverride: variant.summaryOverride ?? null,
    includedEntries: variant.includedEntries,
    bulletOverrides: variant.bulletOverrides ?? {},
    designTokens: variant.designTokens ?? {},
    createdAt,
    updatedAt: now,
  };
}

/** Resolve copy-on-write variant inheritance against the live Master Vault. */
export function resolveResumeVariant(db: Db, variantId: string): ResolvedResumeContent | null {
  const row = db
    .prepare(
      `SELECT id, job_application_id AS jobApplicationId, name, template_id AS templateId,
              page_format AS pageFormat, summary_override AS summaryOverride,
              included_entries_json AS includedEntriesJson, bullet_overrides_json AS bulletOverridesJson
       FROM resume_variants WHERE id = ?`,
    )
    .get(variantId) as
    | {
        id: string;
        jobApplicationId: string | null;
        name: string;
        templateId: string;
        pageFormat: 'LETTER' | 'A4';
        summaryOverride: string | null;
        includedEntriesJson: string;
        bulletOverridesJson: string;
      }
    | undefined;

  if (!row) return null;

  const masterEntries = listMasterEntries(db);
  const entryMap = new Map(masterEntries.map((e) => [e.id, e]));

  const included = JSON.parse(row.includedEntriesJson || '[]') as IncludedEntrySelection[];
  const overrides = JSON.parse(row.bulletOverridesJson || '{}') as Record<string, string>;

  const resolvedEntries: ResolvedResumeContent['entries'] = [];

  for (const inc of included) {
    const master = entryMap.get(inc.entryId);
    if (!master) continue;

    const bulletMap = new Map(master.bullets.map((b) => [b.id, b]));
    const resolvedBullets = [];

    for (const bId of inc.includedBulletIds) {
      const masterBullet = bulletMap.get(bId);
      if (!masterBullet) continue;
      const isTailored = Boolean(overrides[bId]);
      resolvedBullets.push({
        id: masterBullet.id,
        text: isTailored ? overrides[bId]! : masterBullet.rawText,
        isTailored,
        verifiedMetrics: masterBullet.verifiedMetrics,
        canonicalSkillIds: masterBullet.canonicalSkillIds,
        scopeLevel: masterBullet.scopeLevel,
        xyzScore: masterBullet.xyzScore,
      });
    }

    resolvedEntries.push({
      id: master.id,
      entryType: master.entryType,
      organization: master.organization,
      title: master.title,
      location: master.location,
      startDate: master.startDate,
      endDate: master.endDate,
      isCurrent: master.isCurrent,
      bullets: resolvedBullets,
    });
  }

  return {
    variantId: row.id,
    name: row.name,
    templateId: row.templateId,
    pageFormat: row.pageFormat,
    summary: row.summaryOverride,
    entries: resolvedEntries,
  };
}

/** Record an immutable snapshot upon export for audit and A/B conversion tracking. */
export function recordResumeSnapshot(
  db: Db,
  snapshot: {
    variantId: string;
    jobApplicationId?: string | null;
    format: 'pdf' | 'docx';
    filePath: string;
    fileSizeBytes: number;
    sha256: string;
    resolvedPayload: ResolvedResumeContent;
    atsAuditReport: Record<string, unknown>;
    jdAlignment?: Record<string, unknown> | null;
  },
): ResumeSnapshot {
  const id = idGen('rsnap');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO resume_snapshots (
       id, variant_id, job_application_id, format, file_path, file_size_bytes,
       sha256, resolved_payload_json, ats_audit_report_json, jd_alignment_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    snapshot.variantId,
    snapshot.jobApplicationId ?? null,
    snapshot.format,
    snapshot.filePath,
    snapshot.fileSizeBytes,
    snapshot.sha256,
    JSON.stringify(snapshot.resolvedPayload),
    JSON.stringify(snapshot.atsAuditReport),
    snapshot.jdAlignment ? JSON.stringify(snapshot.jdAlignment) : null,
    now,
  );

  return {
    id,
    variantId: snapshot.variantId,
    jobApplicationId: snapshot.jobApplicationId ?? null,
    format: snapshot.format,
    filePath: snapshot.filePath,
    fileSizeBytes: snapshot.fileSizeBytes,
    sha256: snapshot.sha256,
    resolvedPayload: snapshot.resolvedPayload,
    atsAuditReport: snapshot.atsAuditReport,
    jdAlignment: snapshot.jdAlignment ?? null,
    createdAt: now,
  };
}
