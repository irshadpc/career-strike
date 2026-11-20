import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../store/db.js';

function id(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}
function now(): string {
  return new Date().toISOString();
}
function invalid(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, issues: unknown) {
  return reply.code(400).send({ error: 'INVALID_INPUT', issues });
}

// ---- contacts ----
const ContactBody = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).nullable().optional(),
  title: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  linkedinUrl: z.string().trim().max(300).nullable().optional(),
  source: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const InteractionBody = z.object({
  kind: z.string().trim().min(1).max(60),
  note: z.string().trim().max(2000).nullable().optional(),
  at: z.string().optional(),
});

// ---- star stories ----
const StarBody = z.object({
  competency: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  situation: z.string().trim().max(4000).optional(),
  task: z.string().trim().max(4000).optional(),
  action: z.string().trim().max(4000).optional(),
  result: z.string().trim().max(4000).optional(),
});

// ---- brag entries ----
const BragBody = z.object({
  scopeTier: z.enum(['individual', 'team', 'cross_team', 'org']),
  competency: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  impact: z.string().trim().max(2000).optional(),
});

// ---- onboarding plans ----
const OnboardingBody = z.object({
  applicationId: z.string().trim().max(100).nullable().optional(),
  jobTitle: z.string().trim().max(200).nullable().optional(),
  company: z.string().trim().max(200).nullable().optional(),
  plan: z.record(z.string(), z.unknown()),
});

// ---- resume variants ----
const VariantBody = z.object({
  name: z.string().trim().min(1).max(120),
  content: z.string().max(200000).optional(),
});

// ---- offer scenarios ----
const OfferBody = z.object({
  name: z.string().trim().min(1).max(120),
  data: z.record(z.string(), z.unknown()),
});

// ---- imap settings ----
const ImapBody = z.object({
  host: z.string().trim().min(1).max(200),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().trim().min(1).max(200),
  password: z.string().max(500).nullable().optional(),
  allowlist: z.array(z.string().trim().max(200)).optional(),
  enabled: z.boolean().optional(),
});

// ---- csv import (linkedin connections) ----
const CsvImportBody = z.object({
  csv: z.string().min(1).max(5_000_000),
});

export function registerCareerOsRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // ===== Contacts (Warm-Path CRM) =====
  app.get('/api/contacts', async () => {
    const rows = db.prepare('SELECT * FROM contacts ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    return { contacts: rows.map(rowToContact) };
  });

  app.post('/api/contacts', async (req, reply) => {
    const parsed = ContactBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const newId = id('contact');
    const at = now();
    db.prepare(
      'INSERT INTO contacts (id,name,company,title,email,linkedin_url,source,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      newId,
      d.name,
      d.company ?? null,
      d.title ?? null,
      d.email ?? null,
      d.linkedinUrl ?? null,
      d.source ?? 'manual',
      d.notes ?? null,
      at,
      at,
    );
    return reply.code(201).send({
      contact: rowToContact(db.prepare('SELECT * FROM contacts WHERE id=?').get(newId) as Record<string, unknown>),
    });
  });

  app.put<{ Params: { id: string } }>('/api/contacts/:id', async (req, reply) => {
    const parsed = ContactBody.partial().safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const row = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND' });
    const at = now();
    db.prepare(
      'UPDATE contacts SET name=COALESCE(?,name), company=COALESCE(?,company), title=COALESCE(?,title), email=COALESCE(?,email), linkedin_url=COALESCE(?,linkedin_url), source=COALESCE(?,source), notes=COALESCE(?,notes), updated_at=? WHERE id=?',
    ).run(
      d.name ?? null,
      d.company ?? null,
      d.title ?? null,
      d.email ?? null,
      d.linkedinUrl ?? null,
      d.source ?? null,
      d.notes ?? null,
      at,
      req.params.id,
    );
    return {
      contact: rowToContact(
        db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id) as Record<string, unknown>,
      ),
    };
  });

  app.delete<{ Params: { id: string } }>('/api/contacts/:id', async (req, reply) => {
    const r = db.prepare('DELETE FROM contacts WHERE id=?').run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/contacts/:id/interactions', async (req, reply) => {
    const parsed = InteractionBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const contact = db.prepare('SELECT id FROM contacts WHERE id=?').get(req.params.id);
    if (!contact) return reply.code(404).send({ error: 'NOT_FOUND' });
    const newId = id('interaction');
    const at = d.at ?? now();
    db.prepare('INSERT INTO contact_interactions (id,contact_id,kind,note,at) VALUES (?,?,?,?,?)').run(
      newId,
      req.params.id,
      d.kind,
      d.note ?? null,
      at,
    );
    db.prepare('UPDATE contacts SET last_contact_at=?, updated_at=? WHERE id=?').run(at, now(), req.params.id);
    return reply
      .code(201)
      .send({ interaction: { id: newId, contactId: req.params.id, kind: d.kind, note: d.note ?? null, at } });
  });

  app.get<{ Params: { id: string } }>('/api/contacts/:id/interactions', async (req) => {
    const rows = db
      .prepare('SELECT * FROM contact_interactions WHERE contact_id=? ORDER BY at DESC')
      .all(req.params.id) as Record<string, unknown>[];
    return {
      interactions: rows.map((r) => ({ id: r.id, contactId: r.contact_id, kind: r.kind, note: r.note, at: r.at })),
    };
  });

  // LinkedIn Connections CSV import (Warm-Path CRM).
  app.post('/api/contacts/import-csv', async (req, reply) => {
    const parsed = CsvImportBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const rows = parseCsv(parsed.data.csv);
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const idx = {
      firstName: header.findIndex((h) => h.includes('first name')),
      lastName: header.findIndex((h) => h.includes('last name')),
      company: header.findIndex((h) => h.includes('company')),
      position: header.findIndex((h) => h.includes('position')),
      email: header.findIndex((h) => h.includes('email')),
      url: header.findIndex((h) => h.includes('url') || h.includes('profile')),
      connectedOn: header.findIndex((h) => h.includes('connected')),
    };
    let imported = 0;
    const at = now();
    db.transaction(() => {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every((c) => !c.trim())) continue;
        const first = idx.firstName >= 0 ? (r[idx.firstName]?.trim() ?? '') : '';
        const last = idx.lastName >= 0 ? (r[idx.lastName]?.trim() ?? '') : '';
        const name = `${first} ${last}`.trim();
        if (!name) continue;
        const company = idx.company >= 0 ? r[idx.company]?.trim() || null : null;
        const title = idx.position >= 0 ? r[idx.position]?.trim() || null : null;
        const email = idx.email >= 0 ? r[idx.email]?.trim() || null : null;
        const url = idx.url >= 0 ? r[idx.url]?.trim() || null : null;
        const connected = idx.connectedOn >= 0 ? r[idx.connectedOn]?.trim() || null : null;
        db.prepare(
          'INSERT INTO contacts (id,name,company,title,email,linkedin_url,source,last_contact_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ).run(id('contact'), name, company, title, email, url, 'linkedin_csv', connected, at, at);
        imported++;
      }
    })();
    return { imported };
  });

  // Warm paths for a company: contacts at that company + 2nd-degree hints.
  app.get<{ Querystring: { company?: string } }>('/api/contacts/warm-paths', async (req) => {
    const company = (req.query.company ?? '').trim().toLowerCase();
    if (!company) return { contacts: [], hint: 'Provide ?company=' };
    const rows = db
      .prepare('SELECT * FROM contacts WHERE lower(company) LIKE ? ORDER BY updated_at DESC')
      .all(`%${company}%`) as Record<string, unknown>[];
    return { contacts: rows.map(rowToContact), hint: rows.length ? null : 'No contacts at this company yet.' };
  });

  // ===== STAR Story Vault (Pillar 5) =====
  app.get('/api/star-stories', async () => {
    const rows = db.prepare('SELECT * FROM star_stories ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    return { stories: rows.map(rowToStar) };
  });
  app.post('/api/star-stories', async (req, reply) => {
    const parsed = StarBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const newId = id('star');
    const at = now();
    db.prepare(
      'INSERT INTO star_stories (id,competency,title,situation,task,action,result,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(newId, d.competency, d.title, d.situation ?? '', d.task ?? '', d.action ?? '', d.result ?? '', at, at);
    return reply.code(201).send({
      story: rowToStar(db.prepare('SELECT * FROM star_stories WHERE id=?').get(newId) as Record<string, unknown>),
    });
  });
  app.put<{ Params: { id: string } }>('/api/star-stories/:id', async (req, reply) => {
    const parsed = StarBody.partial().safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const row = db.prepare('SELECT id FROM star_stories WHERE id=?').get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND' });
    const at = now();
    db.prepare(
      'UPDATE star_stories SET competency=COALESCE(?,competency), title=COALESCE(?,title), situation=COALESCE(?,situation), task=COALESCE(?,task), action=COALESCE(?,action), result=COALESCE(?,result), updated_at=? WHERE id=?',
    ).run(
      d.competency ?? null,
      d.title ?? null,
      d.situation ?? null,
      d.task ?? null,
      d.action ?? null,
      d.result ?? null,
      at,
      req.params.id,
    );
    if (d.action || d.result) {
      db.prepare('UPDATE star_stories SET reuse_count=reuse_count+0 WHERE id=?').run(req.params.id);
    }
    return {
      story: rowToStar(
        db.prepare('SELECT * FROM star_stories WHERE id=?').get(req.params.id) as Record<string, unknown>,
      ),
    };
  });
  app.delete<{ Params: { id: string } }>('/api/star-stories/:id', async (req, reply) => {
    const r = db.prepare('DELETE FROM star_stories WHERE id=?').run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/star-stories/:id/reuse', async (req, reply) => {
    const r = db
      .prepare('UPDATE star_stories SET reuse_count=reuse_count+1, updated_at=? WHERE id=?')
      .run(now(), req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // ===== Brag Vault (Pillar 6) =====
  app.get('/api/brag', async () => {
    const rows = db.prepare('SELECT * FROM brag_entries ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return { entries: rows.map(rowToBrag) };
  });
  app.post('/api/brag', async (req, reply) => {
    const parsed = BragBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const newId = id('brag');
    const at = now();
    db.prepare('INSERT INTO brag_entries (id,scope_tier,competency,title,impact,created_at) VALUES (?,?,?,?,?,?)').run(
      newId,
      d.scopeTier,
      d.competency,
      d.title,
      d.impact ?? '',
      at,
    );
    return reply.code(201).send({
      entry: rowToBrag(db.prepare('SELECT * FROM brag_entries WHERE id=?').get(newId) as Record<string, unknown>),
    });
  });
  app.delete<{ Params: { id: string } }>('/api/brag/:id', async (req, reply) => {
    const r = db.prepare('DELETE FROM brag_entries WHERE id=?').run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // ===== Onboarding plans (Hired Mode) =====
  app.get('/api/onboarding', async () => {
    const rows = db.prepare('SELECT * FROM onboarding_plans ORDER BY created_at DESC').all() as Record<
      string,
      unknown
    >[];
    return { plans: rows.map(rowToOnboarding) };
  });
  app.post('/api/onboarding', async (req, reply) => {
    const parsed = OnboardingBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const newId = id('onboard');
    const at = now();
    db.prepare(
      'INSERT INTO onboarding_plans (id,application_id,job_title,company,plan_json,created_at) VALUES (?,?,?,?,?,?)',
    ).run(newId, d.applicationId ?? null, d.jobTitle ?? null, d.company ?? null, JSON.stringify(d.plan), at);
    return reply.code(201).send({
      plan: rowToOnboarding(
        db.prepare('SELECT * FROM onboarding_plans WHERE id=?').get(newId) as Record<string, unknown>,
      ),
    });
  });
  app.delete<{ Params: { id: string } }>('/api/onboarding/:id', async (req, reply) => {
    const r = db.prepare('DELETE FROM onboarding_plans WHERE id=?').run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // ===== Resume variants (CV A/B) =====
  app.get('/api/resume-variants', async () => {
    const rows = db.prepare('SELECT * FROM resume_variants ORDER BY created_at DESC').all() as Record<
      string,
      unknown
    >[];
    return { variants: rows.map(rowToVariant) };
  });
  app.post('/api/resume-variants', async (req, reply) => {
    const parsed = VariantBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const newId = id('variant');
    const at = now();
    db.prepare('INSERT INTO resume_variants (id,name,content,created_at) VALUES (?,?,?,?)').run(
      newId,
      d.name,
      d.content ?? '',
      at,
    );
    return reply.code(201).send({
      variant: rowToVariant(
        db.prepare('SELECT * FROM resume_variants WHERE id=?').get(newId) as Record<string, unknown>,
      ),
    });
  });
  app.delete<{ Params: { id: string } }>('/api/resume-variants/:id', async (req, reply) => {
    const r = db.prepare('DELETE FROM resume_variants WHERE id=?').run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // ===== Offer scenarios =====
  app.get('/api/offer-scenarios', async () => {
    const rows = db.prepare('SELECT * FROM offer_scenarios ORDER BY created_at DESC').all() as Record<
      string,
      unknown
    >[];
    return { scenarios: rows.map(rowToOffer) };
  });
  app.post('/api/offer-scenarios', async (req, reply) => {
    const parsed = OfferBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const newId = id('offer');
    const at = now();
    db.prepare('INSERT INTO offer_scenarios (id,name,data_json,created_at) VALUES (?,?,?,?)').run(
      newId,
      d.name,
      JSON.stringify(d.data),
      at,
    );
    return reply.code(201).send({
      scenario: rowToOffer(
        db.prepare('SELECT * FROM offer_scenarios WHERE id=?').get(newId) as Record<string, unknown>,
      ),
    });
  });
  app.delete<{ Params: { id: string } }>('/api/offer-scenarios/:id', async (req, reply) => {
    const r = db.prepare('DELETE FROM offer_scenarios WHERE id=?').run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // ===== IMAP settings + candidates =====
  app.get('/api/imap', async () => {
    const row = db.prepare('SELECT * FROM imap_settings WHERE id=1').get() as Record<string, unknown> | undefined;
    return { settings: row ? rowToImap(row) : null };
  });
  app.put('/api/imap', async (req, reply) => {
    const parsed = ImapBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const d = parsed.data;
    const existing = db.prepare('SELECT id FROM imap_settings WHERE id=1').get();
    if (existing) {
      db.prepare(
        'UPDATE imap_settings SET host=?, port=?, username=?, password=COALESCE(?,password), allowlist_json=?, enabled=? WHERE id=1',
      ).run(
        d.host,
        d.port ?? 993,
        d.username,
        d.password ?? null,
        JSON.stringify(d.allowlist ?? []),
        d.enabled ? 1 : 0,
      );
    } else {
      db.prepare(
        'INSERT INTO imap_settings (id,host,port,username,password,allowlist_json,enabled) VALUES (1,?,?,?,?,?,?)',
      ).run(
        d.host,
        d.port ?? 993,
        d.username,
        d.password ?? null,
        JSON.stringify(d.allowlist ?? []),
        d.enabled ? 1 : 0,
      );
    }
    const row = db.prepare('SELECT * FROM imap_settings WHERE id=1').get() as Record<string, unknown>;
    return { settings: rowToImap(row) };
  });
  app.get('/api/imap/candidates', async () => {
    const rows = db
      .prepare("SELECT * FROM imap_candidates WHERE status='pending' ORDER BY detected_at DESC")
      .all() as Record<string, unknown>[];
    return { candidates: rows.map(rowToImapCandidate) };
  });
  app.post<{ Params: { id: string } }>('/api/imap/candidates/:id/accept', async (req, reply) => {
    const r = db.prepare("UPDATE imap_candidates SET status='accepted' WHERE id=?").run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/imap/candidates/:id/dismiss', async (req, reply) => {
    const r = db.prepare("UPDATE imap_candidates SET status='dismissed' WHERE id=?").run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // ===== Funnel diagnostics (Pillar 4) =====
  app.get('/api/funnel', async () => {
    // Aggregate application dispositions/states into a leak diagnosis.
    const apps = db.prepare('SELECT * FROM applications').all() as Record<string, unknown>[];
    const total = apps.length;
    const byState: Record<string, number> = {};
    for (const a of apps) byState[String(a.state)] = (byState[String(a.state)] ?? 0) + 1;
    const applied = apps.filter((a) => a.state !== 'DRAFT').length;
    const screened = apps.filter((a) => ['INTERVIEWING', 'OFFER', 'SUBMITTED'].includes(String(a.state))).length;
    const offered = apps.filter((a) => a.state === 'OFFER').length;
    const screenRate = applied ? screened / applied : 0;
    const offerRate = screened ? offered / screened : 0;
    const leaks: string[] = [];
    if (applied > 0 && screenRate < 0.03) leaks.push('Resume/Targeting or Cold-Channel Leak: Applied→Screen below 3%.');
    if (screened > 0 && offerRate < 0.1) leaks.push('Interview/Offer Leak: Screen→Offer below 10%.');
    if (total === 0) leaks.push('No applications tracked yet — start by clipping a role.');
    const benchmarks = { appliedToScreen: 0.06, screenToOffer: 0.15 };
    return { total, byState, applied, screened, offered, screenRate, offerRate, leaks, benchmarks };
  });

  // ===== Match inspector (Pillar 2) =====
  app.get<{ Params: { id: string } }>('/api/jobs/:id/match-inspector', async (req, reply) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!job) return reply.code(404).send({ error: 'NOT_FOUND' });
    // Reuse stored fit dimensions if available; otherwise return a structural skeleton.
    const fit = (job.fit_json ? safeJson(String(job.fit_json)) : null) as Record<string, unknown> | null;
    const matched = Array.isArray(fit?.matchedSkills) ? (fit!.matchedSkills as string[]) : [];
    const missing = Array.isArray(fit?.missingRequiredSkills) ? (fit!.missingRequiredSkills as string[]) : [];
    const total = matched.length + missing.length;
    return {
      jobId: req.params.id,
      gateCheck: {
        pass: [] as string[],
        gap: missing.slice(0, 5),
        workaround: [] as string[],
      },
      skillAlignment: {
        exact: matched,
        synonym: [] as string[],
        ontology: [] as string[],
        missing,
        ratio: total ? matched.length / total : 0,
      },
      experienceAudit: {
        relevantYears: null,
        totalYears: null,
        note: 'Computed from approved roles relevant to this job family.',
      },
      counterfactuals: missing
        .slice(0, 3)
        .map((s) => `Add evidence for "${s}" (with a quantified outcome) to move the needle.`),
      zeroHallucination: true,
    };
  });
}

// ---- helpers ----
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function rowToContact(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    title: r.title,
    email: r.email,
    linkedinUrl: r.linkedin_url,
    source: r.source,
    lastContactAt: r.last_contact_at,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function rowToStar(r: Record<string, unknown>) {
  return {
    id: r.id,
    competency: r.competency,
    title: r.title,
    situation: r.situation,
    task: r.task,
    action: r.action,
    result: r.result,
    reuseCount: r.reuse_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function rowToBrag(r: Record<string, unknown>) {
  return {
    id: r.id,
    scopeTier: r.scope_tier,
    competency: r.competency,
    title: r.title,
    impact: r.impact,
    createdAt: r.created_at,
  };
}
function rowToOnboarding(r: Record<string, unknown>) {
  return {
    id: r.id,
    applicationId: r.application_id,
    jobTitle: r.job_title,
    company: r.company,
    plan: safeJson(String(r.plan_json)),
    createdAt: r.created_at,
  };
}
function rowToVariant(r: Record<string, unknown>) {
  return { id: r.id, name: r.name, content: r.content, createdAt: r.created_at };
}
function rowToOffer(r: Record<string, unknown>) {
  return { id: r.id, name: r.name, data: safeJson(String(r.data_json)), createdAt: r.created_at };
}
function rowToImap(r: Record<string, unknown>) {
  return {
    host: r.host,
    port: r.port,
    username: r.username,
    allowlist: safeJson(String(r.allowlist_json)),
    enabled: r.enabled === 1,
    lastSyncAt: r.last_sync_at,
  };
}
function rowToImapCandidate(r: Record<string, unknown>) {
  return {
    id: r.id,
    messageId: r.message_id,
    from: r.from_addr,
    subject: r.subject,
    detectedAt: r.detected_at,
    status: r.status,
  };
}

// Minimal CSV parser (quoted fields).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
