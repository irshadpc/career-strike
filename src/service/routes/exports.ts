import type { FastifyInstance } from 'fastify';
import { buildMasterHtml } from '../../career/ats-html.js';
import { buildMasterDocx } from '../../career/docx-export.js';
import { expectedFields, verifyExport } from '../../career/export-verify.js';
import { buildMasterResume } from '../../career/master-resume.js';
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
}
