import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { evaluateProfileReadiness } from '../../career/readiness-engine.js';
import { companySignals } from '../../markets/company-intelligence.js';
import { COUNTRY_CODES, type CountryCode } from '../../markets/countries.js';
import { marketReadiness } from '../../markets/readiness.js';
import type { Db } from '../../store/db.js';

/**
 * Readiness and health signals for the configured markets and candidate profile.
 * Read-only local evidence for the dashboard; AI assistants have their own projection.
 */
export function registerReadinessRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get('/api/readiness', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    return { markets: marketReadiness(deps.db) };
  });

  app.get('/api/profile/readiness', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    return { readiness: evaluateProfileReadiness(deps.db) };
  });

  app.get<{ Querystring: { country?: string } }>('/api/companies', async (req, reply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    const requested = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : null;
    if (requested && !COUNTRY_CODES.includes(requested as CountryCode)) {
      return reply.code(400).send({ error: 'UNKNOWN_COUNTRY' });
    }
    return { companies: companySignals(deps.db, (requested as CountryCode | null) ?? undefined) };
  });
}
