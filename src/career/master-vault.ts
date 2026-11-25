import { randomBytes } from 'node:crypto';
import { skillsIn } from '../matching/skills.js';
import type { Db } from '../store/db.js';
import { getSettings } from '../store/settings.js';
import { lintBullet } from './bullet-linter.js';
import { listEvidence } from './evidence.js';
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

function analyzeBulletMetadata(rawText: string): {
  metrics: string[];
  skills: string[];
  xyzScore: number;
} {
  const lint = lintBullet(rawText);
  const skills = skillsIn(rawText);
  return {
    metrics: lint.metrics,
    skills,
    xyzScore: lint.xyzScore,
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
  const analyzed = analyzeBulletMetadata(bullet.rawText);
  const verifiedMetrics =
    bullet.verifiedMetrics && bullet.verifiedMetrics.length > 0 ? bullet.verifiedMetrics : analyzed.metrics;
  const canonicalSkillIds =
    bullet.canonicalSkillIds && bullet.canonicalSkillIds.length > 0 ? bullet.canonicalSkillIds : analyzed.skills;
  const xyzScore = bullet.xyzScore !== undefined ? bullet.xyzScore : analyzed.xyzScore;
  db.prepare(
    `INSERT INTO master_bullets (id, entry_id, raw_text, verified_metrics_json, canonical_skill_ids_json, scope_level, xyz_score, star_story_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entryId,
    bullet.rawText,
    JSON.stringify(verifiedMetrics),
    JSON.stringify(canonicalSkillIds),
    bullet.scopeLevel ?? 'individual',
    xyzScore,
    bullet.starStoryId ?? null,
    now,
  );
  return {
    id,
    entryId,
    rawText: bullet.rawText,
    verifiedMetrics,
    canonicalSkillIds,
    scopeLevel: bullet.scopeLevel ?? 'individual',
    xyzScore,
    starStoryId: bullet.starStoryId ?? null,
    updatedAt: now,
  };
}

export function updateMasterEntry(
  db: Db,
  id: string,
  patch: Partial<{
    entryType: 'experience' | 'project' | 'education' | 'certification';
    organization: string;
    title: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    sortOrder: number;
  }>,
): MasterEntry | null {
  const existing = listMasterEntries(db).find((e) => e.id === id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = {
    entryType: patch.entryType ?? existing.entryType,
    organization: patch.organization ?? existing.organization,
    title: patch.title ?? existing.title,
    location: patch.location !== undefined ? patch.location : existing.location,
    startDate: patch.startDate !== undefined ? patch.startDate : existing.startDate,
    endDate: patch.endDate !== undefined ? patch.endDate : existing.endDate,
    isCurrent: patch.isCurrent !== undefined ? patch.isCurrent : existing.isCurrent,
    sortOrder: patch.sortOrder ?? existing.sortOrder,
  };
  db.prepare(
    `UPDATE master_entries
     SET entry_type = ?, organization = ?, title = ?, location = ?, start_date = ?, end_date = ?, is_current = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.entryType,
    next.organization,
    next.title,
    next.location,
    next.startDate,
    next.endDate,
    next.isCurrent ? 1 : 0,
    next.sortOrder,
    now,
    id,
  );
  return {
    ...existing,
    ...next,
    updatedAt: now,
  };
}

export function updateMasterBullet(
  db: Db,
  id: string,
  patch: Partial<{
    rawText: string;
    scopeLevel: 'individual' | 'team' | 'org';
    starStoryId: string | null;
  }>,
): MasterBullet | null {
  const row = db
    .prepare(
      `SELECT id, entry_id AS entryId, raw_text AS rawText, verified_metrics_json AS verifiedMetricsJson,
              canonical_skill_ids_json AS canonicalSkillIdsJson, scope_level AS scopeLevel,
              xyz_score AS xyzScore, star_story_id AS starStoryId, updated_at AS updatedAt
       FROM master_bullets WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        entryId: string;
        rawText: string;
        verifiedMetricsJson: string;
        canonicalSkillIdsJson: string;
        scopeLevel: 'individual' | 'team' | 'org';
        xyzScore: number;
        starStoryId: string | null;
        updatedAt: string;
      }
    | undefined;
  if (!row) return null;

  const now = new Date().toISOString();
  const nextText = patch.rawText !== undefined ? patch.rawText : row.rawText;
  const analyzed = patch.rawText !== undefined ? analyzeBulletMetadata(nextText) : null;
  const verifiedMetrics = analyzed ? analyzed.metrics : (JSON.parse(row.verifiedMetricsJson || '[]') as string[]);
  const canonicalSkillIds = analyzed ? analyzed.skills : (JSON.parse(row.canonicalSkillIdsJson || '[]') as string[]);
  const xyzScore = analyzed ? analyzed.xyzScore : row.xyzScore;
  const scopeLevel = patch.scopeLevel ?? row.scopeLevel ?? 'individual';
  const starStoryId = patch.starStoryId !== undefined ? patch.starStoryId : row.starStoryId;

  db.prepare(
    `UPDATE master_bullets
     SET raw_text = ?, verified_metrics_json = ?, canonical_skill_ids_json = ?, scope_level = ?, xyz_score = ?, star_story_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    nextText,
    JSON.stringify(verifiedMetrics),
    JSON.stringify(canonicalSkillIds),
    scopeLevel,
    xyzScore,
    starStoryId,
    now,
    id,
  );

  return {
    id: row.id,
    entryId: row.entryId,
    rawText: nextText,
    verifiedMetrics,
    canonicalSkillIds,
    scopeLevel,
    xyzScore,
    starStoryId,
    updatedAt: now,
  };
}

export function reorderMasterEntries(db: Db, orderedIds: string[]): void {
  const now = new Date().toISOString();
  const stmt = db.prepare('UPDATE master_entries SET sort_order = ?, updated_at = ? WHERE id = ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    orderedIds.forEach((id, idx) => {
      stmt.run(idx, now, id);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function deleteMasterEntry(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM master_entries WHERE id = ?').run(id).changes > 0;
}

export function deleteMasterBullet(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM master_bullets WHERE id = ?').run(id).changes > 0;
}

/** Sync existing profile facts and confirmed evidence into master entries. */
export function syncMasterFromProfile(
  db: Db,
  options: { mergeNew?: boolean } = {},
): { entriesCreated: number; bulletsCreated: number } {
  const existingEntries = listMasterEntries(db);
  if (existingEntries.length > 0 && !options.mergeNew) {
    return { entriesCreated: 0, bulletsCreated: 0 };
  }

  const facts = listFacts(db);
  const evidence = listEvidence(db, { confirmedOnly: true });
  const existingKeys = new Set(
    existingEntries.map((e) => `${e.entryType}|${e.title.trim().toLowerCase()}|${e.organization.trim().toLowerCase()}`),
  );

  const existingBulletTexts = new Set(
    existingEntries.flatMap((e) => e.bullets.map((b) => b.rawText.trim().toLowerCase())),
  );
  const roleFactToEntryId = new Map<string, string>();
  let entriesCreated = 0;
  let bulletsCreated = 0;
  let nextOrder = existingEntries.length;

  for (const fact of facts) {
    if (fact.kind === 'role') {
      const v = fact.value as {
        title: string;
        employer: string | null;
        startYear: number;
        endYear: number | null;
        summary: string | null;
      };
      const org = v.employer ?? 'Independent / Consulting';
      const key = `experience|${v.title.trim().toLowerCase()}|${org.trim().toLowerCase()}`;
      const existingMatch = existingEntries.find(
        (e) => `${e.entryType}|${e.title.trim().toLowerCase()}|${e.organization.trim().toLowerCase()}` === key,
      );
      if (existingMatch) {
        roleFactToEntryId.set(fact.id, existingMatch.id);
        continue;
      }
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const entry = addMasterEntry(db, {
        entryType: 'experience',
        title: v.title,
        organization: org,
        location: null,
        startDate: v.startYear ? `${v.startYear}-01` : null,
        endDate: v.endYear ? `${v.endYear}-12` : null,
        isCurrent: v.endYear === null,
        sortOrder: nextOrder++,
      });
      roleFactToEntryId.set(fact.id, entry.id);
      entriesCreated += 1;
      if (v.summary) {
        for (const line of v.summary.split('\n')) {
          const trimmed = line.replace(/^[•*-]\s*/, '').trim();
          if (trimmed && !existingBulletTexts.has(trimmed.toLowerCase())) {
            addMasterBullet(db, entry.id, { rawText: trimmed });
            existingBulletTexts.add(trimmed.toLowerCase());
            bulletsCreated += 1;
          }
        }
      }
    } else if (fact.kind === 'education') {
      const v = fact.value as { qualification: string; institution: string | null; year: number | null };
      const org = v.institution ?? 'Accredited Institution';
      const key = `education|${v.qualification.trim().toLowerCase()}|${org.trim().toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      addMasterEntry(db, {
        entryType: 'education',
        title: v.qualification,
        organization: org,
        location: null,
        startDate: null,
        endDate: v.year ? `${v.year}` : null,
        isCurrent: false,
        sortOrder: nextOrder++,
      });
      entriesCreated += 1;
    } else if (fact.kind === 'certification') {
      const v = fact.value as { name: string; issuer: string | null; year: number | null };
      const org = v.issuer ?? 'Issuing Body';
      const key = `certification|${v.name.trim().toLowerCase()}|${org.trim().toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      addMasterEntry(db, {
        entryType: 'certification',
        title: v.name,
        organization: org,
        location: null,
        startDate: null,
        endDate: v.year ? `${v.year}` : null,
        isCurrent: false,
        sortOrder: nextOrder++,
      });
      entriesCreated += 1;
    }
  }

  for (const ev of evidence) {
    if (ev.kind === 'project') {
      const title = String(ev.value.name ?? 'Project').trim();
      const org = 'Verified Project';
      const key = `project|${title.toLowerCase()}|${org.toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const entry = addMasterEntry(db, {
        entryType: 'project',
        title,
        organization: org,
        location: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        sortOrder: nextOrder++,
      });
      entriesCreated += 1;
      const summary = typeof ev.value.summary === 'string' ? ev.value.summary.trim() : '';
      if (summary && !existingBulletTexts.has(summary.toLowerCase())) {
        addMasterBullet(db, entry.id, { rawText: summary });
        existingBulletTexts.add(summary.toLowerCase());
        bulletsCreated += 1;
      }
    } else if (ev.kind === 'achievement') {
      const text = typeof ev.value.text === 'string' ? ev.value.text.trim() : '';
      if (!text || existingBulletTexts.has(text.toLowerCase())) continue;
      const linkedRoleId = typeof ev.value.roleFactId === 'string' ? ev.value.roleFactId : null;
      let targetEntryId = linkedRoleId ? roleFactToEntryId.get(linkedRoleId) : undefined;
      if (!targetEntryId) {
        const key = 'project|key achievements|verified highlights';
        const existingHighlights = listMasterEntries(db).find(
          (e) => `${e.entryType}|${e.title.toLowerCase()}|${e.organization.toLowerCase()}` === key,
        );
        if (existingHighlights) {
          targetEntryId = existingHighlights.id;
        } else if (!existingKeys.has(key)) {
          existingKeys.add(key);
          const created = addMasterEntry(db, {
            entryType: 'project',
            title: 'Key Achievements',
            organization: 'Verified Highlights',
            location: null,
            startDate: null,
            endDate: null,
            isCurrent: false,
            sortOrder: nextOrder++,
          });
          entriesCreated += 1;
          targetEntryId = created.id;
        }
      }
      if (targetEntryId) {
        addMasterBullet(db, targetEntryId, { rawText: text });
        existingBulletTexts.add(text.toLowerCase());
        bulletsCreated += 1;
      }
    }
  }

  return { entriesCreated, bulletsCreated };
}

export function listResumeVariants(db: Db, jobApplicationId?: string | null): ResumeVariant[] {
  const rows = (
    jobApplicationId
      ? db
          .prepare(
            `SELECT id, job_application_id AS jobApplicationId, name, template_id AS templateId,
                    page_format AS pageFormat, summary_override AS summaryOverride,
                    included_entries_json AS includedEntriesJson, bullet_overrides_json AS bulletOverridesJson,
                    design_tokens_json AS designTokensJson, created_at AS createdAt, updated_at AS updatedAt
             FROM resume_variants
             WHERE job_application_id = ?
             ORDER BY updated_at DESC, created_at DESC`,
          )
          .all(jobApplicationId)
      : db
          .prepare(
            `SELECT id, job_application_id AS jobApplicationId, name, template_id AS templateId,
                    page_format AS pageFormat, summary_override AS summaryOverride,
                    included_entries_json AS includedEntriesJson, bullet_overrides_json AS bulletOverridesJson,
                    design_tokens_json AS designTokensJson, created_at AS createdAt, updated_at AS updatedAt
             FROM resume_variants
             ORDER BY updated_at DESC, created_at DESC`,
          )
          .all()
  ) as {
    id: string;
    jobApplicationId: string | null;
    name: string;
    templateId: string;
    pageFormat: 'LETTER' | 'A4';
    summaryOverride: string | null;
    includedEntriesJson: string;
    bulletOverridesJson: string;
    designTokensJson: string;
    createdAt: string;
    updatedAt: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    jobApplicationId: r.jobApplicationId,
    name: r.name,
    templateId: r.templateId || 'classic-single-col',
    pageFormat: r.pageFormat === 'A4' ? 'A4' : 'LETTER',
    summaryOverride: r.summaryOverride,
    includedEntries: JSON.parse(r.includedEntriesJson || '[]') as IncludedEntrySelection[],
    bulletOverrides: JSON.parse(r.bulletOverridesJson || '{}') as Record<string, string>,
    designTokens: JSON.parse(r.designTokensJson || '{}') as Record<string, unknown>,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export function deleteResumeVariant(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM resume_variants WHERE id = ?').run(id).changes > 0;
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
    snapshot.atsAuditReport ? JSON.stringify(snapshot.atsAuditReport) : '{}',
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

export interface TailorVariantSuggestion {
  includedEntries: IncludedEntrySelection[];
  summaryOverride: string | null;
  matchedTerms: string[];
  missingMustHaves: string[];
}

const TAILOR_STOPWORDS = new Set([
  'with',
  'that',
  'this',
  'from',
  'have',
  'will',
  'your',
  'youre',
  'their',
  'about',
  'work',
  'team',
  'role',
  'experience',
  'years',
  'strong',
  'ability',
  'skills',
  'build',
  'building',
]);

/** Rank Master Vault entries & bullets against a target JD without fabricating facts. */
export function tailorMasterVariantForJd(
  db: Db,
  input: { jdText: string; targetPages?: 1 | 2 },
): TailorVariantSuggestion {
  const entries = listMasterEntries(db);
  const facts = listFacts(db, { approvedOnly: true });
  const settings = getSettings(db);
  const targetPages = input.targetPages ?? 1;
  const maxBulletsPerRole = targetPages === 1 ? 5 : 8;

  const jdSkills = skillsIn(input.jdText);
  const jdSkillSet = new Set(jdSkills.map((s) => s.toLowerCase()));
  const jdWords = new Set(
    (input.jdText.toLowerCase().match(/[a-z0-9+.#-]{4,}/g) ?? []).filter((w) => !TAILOR_STOPWORDS.has(w)),
  );

  const matchedSet = new Set<string>();
  const approvedSkillNames = facts.filter((f) => f.kind === 'skill').map((f) => String(f.value.name));
  for (const s of approvedSkillNames) {
    if (jdSkillSet.has(s.toLowerCase())) matchedSet.add(s);
  }

  const includedEntries: IncludedEntrySelection[] = [];
  for (const entry of entries) {
    if (entry.entryType === 'education' || entry.entryType === 'certification') {
      includedEntries.push({
        entryId: entry.id,
        includedBulletIds: entry.bullets.map((b) => b.id),
      });
      continue;
    }

    const scoredBullets = entry.bullets.map((b) => {
      const bSkills = b.canonicalSkillIds.length > 0 ? b.canonicalSkillIds : skillsIn(b.rawText);
      let skillHits = 0;
      for (const s of bSkills) {
        if (jdSkillSet.has(s.toLowerCase())) {
          skillHits += 1;
          matchedSet.add(s);
        }
      }
      const lower = b.rawText.toLowerCase();
      let wordHits = 0;
      for (const w of jdWords) {
        if (lower.includes(w)) wordHits += 1;
      }
      const score = skillHits * 25 + Math.min(wordHits, 6) * 6 + b.xyzScore * 0.25 + (entry.isCurrent ? 10 : 0);
      return { id: b.id, score };
    });

    scoredBullets.sort((a, b) => b.score - a.score);
    const chosen =
      scoredBullets.length <= maxBulletsPerRole
        ? scoredBullets.map((b) => b.id)
        : scoredBullets.filter((b, idx) => idx < 2 || (b.score > 15 && idx < maxBulletsPerRole)).map((b) => b.id);

    includedEntries.push({
      entryId: entry.id,
      includedBulletIds: chosen,
    });
  }

  const matchedTerms = [...matchedSet];
  const matchedLower = new Set(matchedTerms.map((t) => t.toLowerCase()));
  const missingMustHaves = jdSkills.filter((s) => !matchedLower.has(s.toLowerCase()));

  const baseSummary =
    typeof settings['identity.summary'] === 'string' && settings['identity.summary'].trim()
      ? settings['identity.summary'].trim()
      : null;
  let summaryOverride: string | null = baseSummary;
  if (baseSummary && matchedTerms.length > 0) {
    const missingFromSummary = matchedTerms.filter((t) => !baseSummary.toLowerCase().includes(t.toLowerCase()));
    summaryOverride =
      missingFromSummary.length > 0
        ? `${baseSummary} Core strengths: ${missingFromSummary.slice(0, 6).join(', ')}.`
        : baseSummary;
  } else if (!baseSummary) {
    const latestRole = entries.find((e) => e.entryType === 'experience');
    if (latestRole || matchedTerms.length > 0) {
      const rolePart = latestRole ? `${latestRole.title} (${latestRole.organization})` : 'Software Engineer';
      const skillsPart = matchedTerms.length > 0 ? ` specializing in ${matchedTerms.slice(0, 6).join(', ')}` : '';
      summaryOverride = `${rolePart}${skillsPart}.`;
    }
  }

  return {
    includedEntries,
    summaryOverride,
    matchedTerms,
    missingMustHaves,
  };
}
