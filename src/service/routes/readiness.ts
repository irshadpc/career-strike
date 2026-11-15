import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CustomCollectionInput,
  createCustomCollection,
  getCuratedCollection,
  listCuratedCollections,
} from '../../career/collections.js';
import {
  evaluateCompensation,
  findMatchingBenchmark,
  listCompensationBenchmarks,
  type SeniorityLevel,
} from '../../career/compensation.js';
import { computeCareerMarketPulse } from '../../career/market-pulse.js';
import { evaluateProfileReadiness } from '../../career/readiness-engine.js';
import { getInterviewKnowledgeStudio } from '../../interview/knowledge-studio.js';
import {
  Company360InputSchema,
  type CompanyEventKind,
  companySignals,
  getCompany360,
  listCompanyEvents,
  recordCompanyEvent,
  upsertCompany360,
} from '../../markets/company-intelligence.js';
import {
  addCandidateCompany,
  CandidateCompany,
  listCompanyRegistry,
  registrySummary,
  setCompanyWatch,
} from '../../markets/company-registry.js';
import { COUNTRY_CODES, type CountryCode } from '../../markets/countries.js';
import { marketReadiness } from '../../markets/readiness.js';
import type { PublishedSalary } from '../../sources/types.js';
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

  const requireCandidate = (req: FastifyRequest, reply: FastifyReply): boolean => {
    if (req.principal?.kind !== 'dashboard' && req.principal?.kind !== 'local-client') {
      reply.code(403).send({ error: 'FORBIDDEN', message: 'Candidate authorization required.' });
      return false;
    }
    return true;
  };

  app.post('/api/company-registry', async (req, reply) => {
    if (!requireCandidate(req, reply)) return;
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

  // ---- Company Intelligence 360 ----

  app.get<{ Params: { id: string } }>('/api/company-360/:id', async (req, reply) => {
    const profile = getCompany360(deps.db, req.params.id);
    if (!profile) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { profile };
  });

  app.put<{ Params: { id: string } }>('/api/company-360/:id', async (req, reply) => {
    if (!requireCandidate(req, reply)) return;
    const parsed = Company360InputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      const updated = upsertCompany360(deps.db, req.params.id, parsed.data);
      return { profile: updated };
    } catch (err) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>('/api/company-360/:id/events', async (req) => {
    const limit = Number(req.query.limit ?? 50);
    return { events: listCompanyEvents(deps.db, req.params.id, Number.isFinite(limit) ? limit : 50) };
  });

  app.post<{ Params: { id: string } }>('/api/company-360/:id/events', async (req, reply) => {
    if (!requireCandidate(req, reply)) return;
    const EventSchema = z
      .object({
        kind: z.enum([
          'ROLE_OPENED',
          'ROLE_CLOSED',
          'HIRING_SURGE',
          'HIRING_PAUSE',
          'FUNDING_ANNOUNCEMENT',
          'HEADCOUNT_CHANGE',
          'BOARD_HEALTH_CHANGE',
          'CANDIDATE_NOTE',
        ]),
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().max(2000).default(''),
        source: z.string().trim().max(100).default('candidate_note'),
        sourceUrl: z.string().trim().url().max(2000).nullable().optional(),
        eventAt: z.string().optional(),
      })
      .strict();
    const parsed = EventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    const event = recordCompanyEvent(deps.db, {
      companyId: req.params.id,
      kind: parsed.data.kind as CompanyEventKind,
      title: parsed.data.title,
      detail: parsed.data.detail,
      source: parsed.data.source,
      sourceUrl: parsed.data.sourceUrl,
      eventAt: parsed.data.eventAt,
    });
    return reply.code(201).send({ event });
  });

  app.post<{ Params: { id: string } }>('/api/company-360/:id/watch', async (req, reply) => {
    if (!requireCandidate(req, reply)) return;
    const WatchSchema = z
      .object({
        notifyOnNewRoles: z.boolean().optional(),
        notifyOnHiringSurge: z.boolean().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .strict();
    const parsed = WatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    setCompanyWatch(deps.db, req.params.id, true, {
      notifyOnNewRoles: parsed.data.notifyOnNewRoles,
      notifyOnHiringSurge: parsed.data.notifyOnHiringSurge,
      notes: parsed.data.notes ?? undefined,
    });
    return { ok: true, profile: getCompany360(deps.db, req.params.id) };
  });

  app.delete<{ Params: { id: string } }>('/api/company-360/:id/watch', async (req, reply) => {
    if (!requireCandidate(req, reply)) return;
    setCompanyWatch(deps.db, req.params.id, false);
    return { ok: true, profile: getCompany360(deps.db, req.params.id) };
  });

  // ---- Curated Collections ----

  app.get('/api/collections', async () => {
    return { collections: listCuratedCollections(deps.db) };
  });

  app.get<{ Params: { slugOrId: string } }>('/api/collections/:slugOrId', async (req, reply) => {
    const collection = getCuratedCollection(deps.db, req.params.slugOrId);
    if (!collection) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { collection };
  });

  app.post('/api/collections', async (req, reply) => {
    if (!requireCandidate(req, reply)) return;
    const parsed = CustomCollectionInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    const created = createCustomCollection(deps.db, parsed.data);
    return reply.code(201).send({ collection: created });
  });

  // ---- Compensation Intelligence ----

  app.get<{ Querystring: { roleFamily?: string; countryCode?: string } }>(
    '/api/compensation/benchmarks',
    async (req) => {
      const benchmarks = listCompensationBenchmarks(deps.db, {
        roleFamily: req.query.roleFamily,
        countryCode: req.query.countryCode,
      });
      return { benchmarks };
    },
  );

  app.post('/api/compensation/evaluate', async (req, reply) => {
    const EvalSchema = z
      .object({
        roleFamily: z.string().trim().min(1),
        seniority: z.enum(['junior', 'mid', 'senior', 'staff', 'lead', 'executive']),
        countryCode: z.string().trim().length(2),
        salary: z
          .object({
            currency: z.string(),
            min: z.number().nullable(),
            max: z.number().nullable(),
            interval: z.enum(['year', 'month', 'week', 'day', 'hour']),
            source: z.string().optional(),
          })
          .nullable(),
      })
      .strict();
    const parsed = EvalSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    const benchmark = findMatchingBenchmark(
      deps.db,
      parsed.data.roleFamily,
      parsed.data.seniority as SeniorityLevel,
      parsed.data.countryCode,
    );
    const comparison = evaluateCompensation(parsed.data.salary as PublishedSalary | null, benchmark);
    return { comparison };
  });

  // ---- Career Market Pulse ----

  app.get('/api/market-pulse', async () => {
    return { pulse: computeCareerMarketPulse(deps.db) };
  });

  // ---- Interview Knowledge Studio ----

  app.get('/api/interview/knowledge', async () => {
    return { knowledge: getInterviewKnowledgeStudio() };
  });
}
