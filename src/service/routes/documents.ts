import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createExport,
  type ExportFormat,
  type ExportKind,
  exportHistory,
  parserReport,
  renderDocx,
  renderPdf,
} from '../../career/document-export.js';
import { evaluateDocumentReadiness } from '../../career/document-readiness.js';
import { buildMasterResume } from '../../career/master-resume.js';
import { listFacts } from '../../career/profile.js';
import type { Db } from '../../store/db.js';

interface ExportQuery {
  format?: string;
}

interface VariantParams {
  id: string;
  variantId: string;
}

interface VariantRow {
  id: string;
  application_id: string;
  kind: ExportKind;
  content: string;
}

const FORMATS = new Set<ExportFormat>(['pdf', 'docx']);

function parseFormat(value: string | undefined): ExportFormat | null {
  return value && FORMATS.has(value as ExportFormat) ? (value as ExportFormat) : null;
}

function ownerAllowed(req: FastifyRequest): boolean {
  return req.principal?.kind !== 'mcp-client';
}

function attachment(reply: FastifyReply, filename: string, mime: string): void {
  reply
    .header('content-disposition', `attachment; filename="${filename}"`)
    .header('cache-control', 'no-store')
    .type(mime);
}

function variantFor(db: Db, params: VariantParams): VariantRow | null {
  return (
    (db
      .prepare('SELECT id, application_id, kind, content FROM document_variants WHERE id = ? AND application_id = ?')
      .get(params.variantId, params.id) as VariantRow | undefined) ?? null
  );
}

function jobTitleFor(db: Db, applicationId: string): string {
  return (
    (db
      .prepare(
        'SELECT j.title || " — " || j.employer FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?',
      )
      .pluck()
      .get(applicationId) as string | null) ?? 'Tailored document'
  );
}

/**
 * The canonical master document, its local readiness report, and local PDF/DOCX exports.
 * Browser-only: an AI assistant must not receive identity or document content through these
 * endpoints. Export logs record hashes, not copies, and every parser report says plainly that it
 * is local parser testing rather than ATS certification.
 */
export function registerDocumentRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get('/api/documents/master', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!ownerAllowed(req)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const master = buildMasterResume(deps.db);
    const skills = listFacts(deps.db, { approvedOnly: true })
      .filter((fact) => fact.kind === 'skill')
      .map((fact) => String(fact.value.name));
    return { master, readiness: evaluateDocumentReadiness(master, skills) };
  });

  app.get<{ Querystring: ExportQuery }>('/api/documents/master/export', async (req, reply) => {
    if (!ownerAllowed(req)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const format = parseFormat(req.query.format);
    if (!format) return reply.code(400).send({ error: 'UNSUPPORTED_FORMAT', message: 'Choose pdf or docx.' });
    const master = buildMasterResume(deps.db);
    const exported = createExport(deps.db, {
      content: master.content,
      title: 'Master Resume',
      kind: 'resume',
      format,
      source: 'MASTER',
    });
    attachment(reply, exported.filename, exported.mime);
    return exported.bytes;
  });

  app.get('/api/documents/master/parser-report', async (req, reply) => {
    if (!ownerAllowed(req)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const master = buildMasterResume(deps.db);
    return {
      reports: (['pdf', 'docx'] as const).map((format) =>
        parserReport(
          master.content,
          format === 'pdf' ? renderPdf('Master Resume', master.content) : renderDocx('Master Resume', master.content),
          format,
        ),
      ),
    };
  });

  app.get<{ Params: VariantParams; Querystring: ExportQuery }>(
    '/api/applications/:id/personalization/:variantId/export',
    async (req, reply) => {
      if (!ownerAllowed(req)) return reply.code(403).send({ error: 'FORBIDDEN' });
      const format = parseFormat(req.query.format);
      if (!format) return reply.code(400).send({ error: 'UNSUPPORTED_FORMAT', message: 'Choose pdf or docx.' });
      const variant = variantFor(deps.db, req.params);
      if (!variant) return reply.code(404).send({ error: 'NOT_FOUND' });
      const title = jobTitleFor(deps.db, req.params.id);
      const exported = createExport(deps.db, {
        content: variant.content,
        title: variant.kind === 'resume' ? `${title} Resume` : `${title} Cover Letter`,
        kind: variant.kind,
        format,
        source: 'VARIANT',
        applicationId: req.params.id,
        variantId: variant.id,
      });
      attachment(reply, exported.filename, exported.mime);
      return exported.bytes;
    },
  );

  app.get<{ Params: VariantParams }>(
    '/api/applications/:id/personalization/:variantId/parser-report',
    async (req, reply) => {
      if (!ownerAllowed(req)) return reply.code(403).send({ error: 'FORBIDDEN' });
      const variant = variantFor(deps.db, req.params);
      if (!variant) return reply.code(404).send({ error: 'NOT_FOUND' });
      const title = variant.kind === 'resume' ? 'Tailored Resume' : 'Tailored Cover Letter';
      return {
        reports: (['pdf', 'docx'] as const).map((format) =>
          parserReport(
            variant.content,
            format === 'pdf' ? renderPdf(title, variant.content) : renderDocx(title, variant.content),
            format,
          ),
        ),
      };
    },
  );

  app.get('/api/documents/exports', async (req, reply) => {
    if (!ownerAllowed(req)) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { exports: exportHistory(deps.db) };
  });
}
