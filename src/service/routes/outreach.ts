import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ContactInput,
  OutreachError,
  OutreachInput,
  type OutreachPurpose,
  type OutreachService,
} from '../../outreach/service.js';

const EditInput = OutreachInput.partial().omit({ contactId: true }).strict();
const MarkSent = z.object({ confirmed: z.literal(true) }).strict();

function actorOf(req: FastifyRequest): string {
  return req.principal?.kind === 'dashboard' ? 'dashboard' : 'local-client';
}

function fail(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof OutreachError) return reply.code(409).send({ error: 'OUTREACH_STATE', message: err.message });
  if (err instanceof z.ZodError) return reply.code(400).send({ error: 'INVALID_INPUT', issues: err.issues });
  throw err;
}

export function registerOutreachRoutes(app: FastifyInstance, deps: { outreach: OutreachService }): void {
  const { outreach } = deps;

  app.get('/api/outreach', async (req, reply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    return { contacts: outreach.contacts(), drafts: outreach.list(), summary: outreach.summary() };
  });

  app.get<{ Querystring: { purpose?: string; contactId?: string } }>('/api/outreach/template', async (req, reply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    const purpose = (req.query.purpose ?? 'other') as OutreachPurpose;
    if (!['referral', 'recruiter', 'follow_up', 'thank_you', 'other'].includes(purpose)) {
      return reply.code(400).send({ error: 'UNKNOWN_PURPOSE' });
    }
    const contact = outreach.contacts().find((item) => item.id === req.query.contactId);
    if (!contact) return reply.code(404).send({ error: 'NOT_FOUND' });
    return {
      template: outreach.template(purpose, {
        contactName: contact.name,
        employer: contact.employer,
        roleTitle: contact.roleTitle,
      }),
    };
  });

  app.post('/api/outreach/contacts', async (req, reply) => {
    const parsed = ContactInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      return reply.code(201).send({ contact: outreach.addContact(parsed.data, actorOf(req)) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.put<{ Params: { id: string } }>('/api/outreach/contacts/:id', async (req, reply) => {
    const parsed = ContactInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      return { contact: outreach.updateContact(req.params.id, parsed.data, actorOf(req)) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/outreach/contacts/:id', async (req, reply) => {
    if (!outreach.deleteContact(req.params.id, actorOf(req))) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post('/api/outreach', async (req, reply) => {
    const parsed = OutreachInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      return reply.code(201).send({ draft: outreach.create(parsed.data, actorOf(req)) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.put<{ Params: { id: string } }>('/api/outreach/:id', async (req, reply) => {
    const parsed = EditInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      return { draft: outreach.update(req.params.id, parsed.data, actorOf(req)) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/outreach/:id/request-approval', async (req, reply) => {
    try {
      return { draft: outreach.requestApproval(req.params.id, actorOf(req)) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/outreach/:id/approve', async (req, reply) => {
    if (req.principal?.kind !== 'dashboard') {
      return reply.code(403).send({
        error: 'APPROVAL_REQUIRES_DASHBOARD',
        message: 'Outreach messages can only be approved in the Career Strike dashboard.',
      });
    }
    try {
      return { draft: outreach.approve(req.params.id, 'dashboard') };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/outreach/:id/revoke', async (req, reply) => {
    try {
      return { draft: outreach.revokeApproval(req.params.id, actorOf(req)) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/outreach/:id/mark-sent', async (req, reply) => {
    if (req.principal?.kind !== 'dashboard') {
      return reply.code(403).send({ error: 'REQUIRES_DASHBOARD' });
    }
    const parsed = MarkSent.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'CONFIRMATION_REQUIRED',
        message: 'Confirm that you sent this message yourself. Career Strike never sends it for you.',
      });
    }
    try {
      return { draft: outreach.markSent(req.params.id, true, 'dashboard') };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/outreach/:id/dismiss', async (req, reply) => {
    try {
      return { draft: outreach.dismiss(req.params.id, actorOf(req)) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/outreach/:id/restore', async (req, reply) => {
    try {
      return { draft: outreach.restore(req.params.id, actorOf(req)) };
    } catch (err) {
      return fail(reply, err);
    }
  });
}
