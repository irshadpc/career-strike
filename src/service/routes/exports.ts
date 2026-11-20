import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { evaluateResumeAlignment } from '../../career/alignment-engine.js';
import { buildMasterHtml } from '../../career/ats-html.js';
import { lintBullet, lintRoleBullets } from '../../career/bullet-linter.js';
import { buildMasterDocx } from '../../career/docx-export.js';
import { expectedFields, verifyExport } from '../../career/export-verify.js';
import { buildMasterResume } from '../../career/master-resume.js';
import {
  addMasterBullet,
  addMasterEntry,
  deleteMasterBullet,
  deleteMasterEntry,
  listMasterEntries,
  recordResumeSnapshot,
  resolveResumeVariant,
  saveResumeVariant,
  syncMasterFromProfile,
} from '../../career/master-vault.js';
import { htmlToAtsPdf } from '../../career/pdf-export.js';
import type { Db } from '../../store/db.js';

export function registerExportRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/exports/master-resume', async () => {
    const master = buildMasterResume(db);
    return { master, expectedFields: expectedFields(master) };
  });

  app.post('/api/exports/master-resume/pdf', async (_req, reply) => {
    const master = buildMasterResume(db);
    const html = buildMasterHtml(master);
    const bytes = await htmlToAtsPdf(html);
    const verification = await verifyExport({
      format: 'pdf',
      bytes,
      expected: { text: master.content, fields: expectedFields(master) },
    });
    return reply.send({
      filename: `master-resume-${new Date().toISOString().slice(0, 10)}.pdf`,
      pdf: bytes.toString('base64'),
      verification,
    });
  });

  app.post('/api/exports/master-resume/docx', async (_req, reply) => {
    const master = buildMasterResume(db);
    const bytes = await buildMasterDocx(master);
    const verification = await verifyExport({
      format: 'docx',
      bytes,
      expected: { text: master.content, fields: expectedFields(master) },
    });
    return reply.send({
      filename: `master-resume-${new Date().toISOString().slice(0, 10)}.docx`,
      docx: bytes.toString('base64'),
      verification,
    });
  });

  // Master Vault APIs
  app.get('/api/studio/master', async () => {
    syncMasterFromProfile(db);
    const entries = listMasterEntries(db);
    return { entries };
  });

  app.post('/api/studio/master/entries', async (req, reply) => {
    const schema = z.object({
      entryType: z.enum(['experience', 'project', 'education', 'certification']),
      organization: z.string().trim().min(1),
      title: z.string().trim().min(1),
      location: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      isCurrent: z.boolean().optional(),
      sortOrder: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    const entry = addMasterEntry(db, {
      ...parsed.data,
      location: parsed.data.location ?? null,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      isCurrent: Boolean(parsed.data.isCurrent),
      sortOrder: parsed.data.sortOrder ?? 0,
    });
    return reply.code(201).send({ entry });
  });

  app.delete<{ Params: { id: string } }>('/api/studio/master/entries/:id', async (req, reply) => {
    const deleted = deleteMasterEntry(db, req.params.id);
    if (!deleted) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/studio/master/entries/:id/bullets', async (req, reply) => {
    const schema = z.object({
      rawText: z.string().trim().min(1),
      verifiedMetrics: z.array(z.string()).optional(),
      canonicalSkillIds: z.array(z.string()).optional(),
      scopeLevel: z.enum(['individual', 'team', 'org']).optional(),
      xyzScore: z.number().optional(),
      starStoryId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    const bullet = addMasterBullet(db, req.params.id, parsed.data);
    return reply.code(201).send({ bullet });
  });

  app.delete<{ Params: { id: string } }>('/api/studio/master/bullets/:id', async (req, reply) => {
    const deleted = deleteMasterBullet(db, req.params.id);
    if (!deleted) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // Variant resolution & saving
  app.get<{ Params: { id: string } }>('/api/studio/variants/:id', async (req, reply) => {
    const resolved = resolveResumeVariant(db, req.params.id);
    if (!resolved) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { variant: resolved };
  });

  app.post('/api/studio/variants', async (req, reply) => {
    const schema = z.object({
      id: z.string().optional(),
      jobApplicationId: z.string().nullable().optional(),
      name: z.string().trim().min(1),
      templateId: z.string().optional(),
      pageFormat: z.enum(['LETTER', 'A4']).optional(),
      summaryOverride: z.string().nullable().optional(),
      includedEntries: z.array(
        z.object({
          entryId: z.string(),
          includedBulletIds: z.array(z.string()),
        }),
      ),
      bulletOverrides: z.record(z.string(), z.string()).optional(),
      designTokens: z.record(z.string(), z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    const variant = saveResumeVariant(db, parsed.data);
    return reply.code(200).send({ variant });
  });

  // Bullet Linter API
  app.post('/api/studio/lint-bullet', async (req, reply) => {
    const schema = z.object({
      text: z.string().optional(),
      bullets: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    if (parsed.data.text) {
      return { lint: lintBullet(parsed.data.text) };
    }
    if (parsed.data.bullets) {
      return { audit: lintRoleBullets(parsed.data.bullets) };
    }
    return reply.code(400).send({ error: 'Provide text or bullets' });
  });

  // 3-Tier Alignment API
  app.post('/api/studio/align', async (req, reply) => {
    const schema = z.object({
      resumeText: z.string().min(1),
      jdText: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const result = evaluateResumeAlignment(db, parsed.data.resumeText, parsed.data.jdText);
    return { alignment: result };
  });

  // Snapshot API
  app.post('/api/studio/snapshot', async (req, reply) => {
    const schema = z.object({
      variantId: z.string(),
      jobApplicationId: z.string().nullable().optional(),
      format: z.enum(['pdf', 'docx']),
      filePath: z.string(),
      fileSizeBytes: z.number(),
      sha256: z.string(),
      resolvedPayload: z.any(),
      atsAuditReport: z.record(z.string(), z.any()),
      jdAlignment: z.record(z.string(), z.any()).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const snapshot = recordResumeSnapshot(db, parsed.data);
    return reply.code(201).send({ snapshot });
  });
}
