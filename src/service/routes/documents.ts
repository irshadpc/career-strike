import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { evaluateDocumentReadiness } from '../../career/document-readiness.js';
import { buildMasterResume } from '../../career/master-resume.js';
import { listFacts } from '../../career/profile.js';
import type { Db } from '../../store/db.js';

/**
 * The canonical master document and its local readiness report. Browser-only: an AI assistant
 * must not receive identity or document content through this endpoint.
 */
export function registerDocumentRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get('/api/documents/master', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    const master = buildMasterResume(deps.db);
    const skills = listFacts(deps.db, { approvedOnly: true })
      .filter((fact) => fact.kind === 'skill')
      .map((fact) => String(fact.value.name));
    return { master, readiness: evaluateDocumentReadiness(master, skills) };
  });
}
