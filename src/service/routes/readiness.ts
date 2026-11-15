import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { evaluateProfileReadiness } from '../../career/readiness-engine.js';
import { companySignals } from '../../markets/company-intelligence.js';
import {
  addCandidateCompany,
  CandidateCompany,
  listCompanyRegistry,
  registrySummary,
} from '../../markets/company-registry.js';
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

  app.get<{ Querystring: { country?: string; q?: string; limit?: string } }>(
    '/api/company-registry',
    async (req, reply) => {
      if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
      const requested = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : null;
      if (requested && !COUNTRY_CODES.includes(requested as CountryCode)) {
        return reply.code(400).send({ error: 'UNKNOWN_COUNTRY' });
      }
      const limit = Number(req.query.limit ?? 200);
      const companies = listCompanyRegistry(deps.db, {
        ...(requested ? { country: requested as CountryCode } : {}),
        ...(typeof req.query.q === 'string' ? { query: req.query.q.slice(0, 120) } : {}),
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 200,
      });
      return { companies, summary: registrySummary(companies) };
    },
  );

  app.post('/api/company-registry', async (req, reply) => {
    if (req.principal?.kind !== 'dashboard') {
      return reply.code(403).send({
        error: 'REQUIRES_DASHBOARD',
        message: 'Add companies to your registry in the Career Strike dashboard.',
      });
    }
    const parsed = CandidateCompany.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      return reply.code(201).send({ company: addCandidateCompany(deps.db, parsed.data) });
    } catch (err) {
      return reply
        .code(409)
        .send({ error: 'COMPANY_EXISTS', message: err instanceof Error ? err.message : String(err) });
    }
  });
}
