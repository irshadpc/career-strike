import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import { candidateContext } from '../../career/context.js';
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  SavedSearchInput,
  todaysShortlist,
  touchSavedSearchRun,
} from '../../career/saved-searches.js';
import type { Db } from '../../store/db.js';

function invalid(reply: FastifyReply, issues: z.core.$ZodIssue[]): FastifyReply {
  return reply.code(400).send({ error: 'INVALID_INPUT', issues });
}

export function registerSavedSearchRoutes(app: FastifyInstance, deps: { db: Db }): void {
  const { db } = deps;

  app.get('/api/saved-searches', async () => ({ searches: listSavedSearches(db) }));

  app.post('/api/saved-searches', async (req, reply) => {
    const parsed = SavedSearchInput.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    return reply.code(201).send({ search: createSavedSearch(db, parsed.data) });
  });

  app.delete<{ Params: { id: string } }>('/api/saved-searches/:id', async (req, reply) => {
    if (!deleteSavedSearch(db, req.params.id)) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/saved-searches/:id/run', async (req, reply) => {
    const id = req.params.id;
    const searches = listSavedSearches(db);
    if (!searches.some((s) => s.id === id)) return reply.code(404).send({ error: 'NOT_FOUND' });
    touchSavedSearchRun(db, id);
    return { ok: true };
  });

  app.get('/api/home/todays-shortlist', async () => {
    const ctx = candidateContext(db);
    return todaysShortlist(db, ctx);
  });

  app.post('/api/home/todays-shortlist/mark-seen', async () => {
    const now = new Date().toISOString();
    const searches = listSavedSearches(db);
    for (const s of searches) touchSavedSearchRun(db, s.id, now);
    return { ok: true, at: now };
  });
}
