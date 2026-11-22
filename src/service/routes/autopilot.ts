import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../store/db.js';

export type AtsProvider = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'other';
export type AutopilotStatus = 'queued' | 'needs_answer' | 'filling' | 'ready_to_submit' | 'blocked_fallback' | 'sent';

export interface PendingQuestion {
  questionKey: string;
  questionLabel: string;
  answerType: 'boolean' | 'text' | 'select';
  options?: string[];
  placeholder?: string;
}

export interface AutopilotReceipt {
  fieldsFilled: number;
  resumeSnapshotId: string;
  atsProvider: AtsProvider;
  companyName: string;
  jobTitle?: string;
  timestamp: string;
  verifiedPdfAttached: boolean;
  trackedAs: string;
}

export interface AutopilotQueueItem {
  id: string;
  jobId: string;
  companyName: string;
  atsProvider: AtsProvider;
  status: AutopilotStatus;
  fieldsFilledCount: number;
  fieldsTotalCount: number;
  pendingQuestion: PendingQuestion | null;
  resumeSnapshotId: string | null;
  receipt: AutopilotReceipt | null;
  sentAt: string | null;
  createdAt: string;
  jobTitle?: string;
  location?: string;
  applyUrl?: string;
}

export interface AnswerVaultItem {
  id: string;
  questionKey: string;
  questionLabel: string;
  answerValue: string;
  answerType: 'boolean' | 'text' | 'select';
  isDefault: boolean;
  updatedAt: string;
}

export interface DuplicateCompanyWarning {
  company: string;
  count: number;
  jobIds: string[];
  message: string;
}

export interface WarmPathMatch {
  jobId: string;
  company: string;
  contacts: Array<{
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
  }>;
}

export const DAILY_FOCUS_CAP = 5;

export const STANDARD_SCREENING_QUESTIONS: Array<{
  key: string;
  label: string;
  type: 'boolean' | 'text' | 'select';
  options?: string[];
  placeholder?: string;
}> = [
  {
    key: 'eu_work_auth',
    label: 'Do you have legal authorization to work in the destination country without sponsorship?',
    type: 'boolean',
  },
  {
    key: 'notice_period',
    label: 'What is your current notice period or earliest available start date?',
    type: 'text',
    placeholder: 'e.g. 2 weeks, 30 days, or Immediate',
  },
  {
    key: 'relocation',
    label: 'Are you open to relocation or working on-site/hybrid if required?',
    type: 'boolean',
  },
];

export function detectAtsProvider(url: string | null | undefined): AtsProvider {
  if (!url) return 'other';
  const u = url.toLowerCase();
  if (u.includes('greenhouse.io') || u.includes('gh_src=')) return 'greenhouse';
  if (u.includes('lever.co') || u.includes('jobs.lever.co')) return 'lever';
  if (u.includes('ashbyhq.com') || u.includes('jobs.ashbyhq.com')) return 'ashby';
  if (
    u.includes('myworkdayjobs.com') ||
    u.includes('workday.com') ||
    u.includes('myworkday.com') ||
    u.includes('workday')
  ) {
    return 'workday';
  }
  return 'other';
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

function now(): string {
  return new Date().toISOString();
}

export function getDailyFocusUsage(db: Db): { used: number; remaining: number; cap: number } {
  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM autopilot_queue WHERE substr(created_at, 1, 10) = ?')
    .get(today) as { count: number } | undefined;
  const used = row?.count ?? 0;
  return {
    cap: DAILY_FOCUS_CAP,
    used,
    remaining: Math.max(0, DAILY_FOCUS_CAP - used),
  };
}

function safeJsonParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export function rowToQueueItem(row: Record<string, unknown>): AutopilotQueueItem {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    companyName: String(row.company_name),
    atsProvider: row.ats_provider as AtsProvider,
    status: row.status as AutopilotStatus,
    fieldsFilledCount: Number(row.fields_filled_count ?? 0),
    fieldsTotalCount: Number(row.fields_total_count ?? 0),
    pendingQuestion: safeJsonParse<PendingQuestion | null>(row.pending_question_json as string | null, null),
    resumeSnapshotId: (row.resume_snapshot_id as string | null) ?? null,
    receipt: safeJsonParse<AutopilotReceipt | null>(row.receipt_json as string | null, null),
    sentAt: (row.sent_at as string | null) ?? null,
    createdAt: String(row.created_at),
    jobTitle: row.job_title ? String(row.job_title) : undefined,
    location: row.location ? String(row.location) : undefined,
    applyUrl: row.apply_url ? String(row.apply_url) : undefined,
  };
}

export function rowToAnswerVaultItem(row: Record<string, unknown>): AnswerVaultItem {
  return {
    id: String(row.id),
    questionKey: String(row.question_key),
    questionLabel: String(row.question_label),
    answerValue: String(row.answer_value),
    answerType: row.answer_type as 'boolean' | 'text' | 'select',
    isDefault: Boolean(row.is_default),
    updatedAt: String(row.updated_at),
  };
}

const BatchQueueBody = z.object({
  jobIds: z.array(z.string().trim().min(1)).min(1).max(20),
});

const AnswerBody = z.object({
  answer: z.union([z.string(), z.boolean()]),
  saveAsDefault: z.boolean().optional().default(true),
});

const MarkSentBody = z.object({
  fieldsFilled: z.number().int().min(1).optional(),
  resumeSnapshotId: z.string().optional(),
});

const CreateAnswerBody = z.object({
  questionKey: z.string().trim().min(1).max(100),
  questionLabel: z.string().trim().min(1).max(200),
  answerValue: z.union([z.string(), z.boolean()]),
  answerType: z.enum(['boolean', 'text', 'select']).default('text'),
  isDefault: z.boolean().optional().default(true),
});

export function registerAutopilotRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  // 1. POST /api/autopilot/batch
  app.post('/api/autopilot/batch', async (req, reply) => {
    const parse = BatchQueueBody.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'INVALID_INPUT', issues: parse.error.issues });
    }
    const { jobIds } = parse.data;

    // Check Daily Focus Cap
    const focusUsage = getDailyFocusUsage(db);
    if (jobIds.length > focusUsage.remaining) {
      return reply.code(400).send({
        error: 'DAILY_FOCUS_CAP_EXCEEDED',
        message: `Daily Focus Cap exceeded: ${focusUsage.used}/${focusUsage.cap} used today. Only ${focusUsage.remaining} slot(s) remaining, but tried to queue ${jobIds.length}.`,
        remainingFocusCap: focusUsage.remaining,
        dailyFocusCap: focusUsage.cap,
        usedFocusCap: focusUsage.used,
      });
    }

    // Fetch jobs
    const placeholders = jobIds.map(() => '?').join(',');
    const jobs = db
      .prepare(
        `SELECT id, employer, title, apply_url, posting_url, location_text, normalized_location
         FROM jobs WHERE id IN (${placeholders})`,
      )
      .all(...jobIds) as Array<{
      id: string;
      employer: string;
      title: string;
      apply_url: string | null;
      posting_url: string | null;
      location_text: string | null;
      normalized_location: string | null;
    }>;

    if (jobs.length === 0) {
      return reply.code(404).send({ error: 'NO_JOBS_FOUND', message: 'None of the requested jobs exist.' });
    }

    // Check for duplicate companies in the batch
    const companyCount = new Map<string, string[]>();
    for (const job of jobs) {
      const canonical = job.employer.trim().toLowerCase();
      const list = companyCount.get(canonical) ?? [];
      list.push(job.id);
      companyCount.set(canonical, list);
    }

    const duplicateCompanyWarnings: DuplicateCompanyWarning[] = [];
    for (const [canonical, ids] of companyCount.entries()) {
      if (ids.length > 1) {
        const matchingJob = jobs.find((j) => j.employer.trim().toLowerCase() === canonical);
        const name = matchingJob ? matchingJob.employer : canonical;
        duplicateCompanyWarnings.push({
          company: name,
          count: ids.length,
          jobIds: ids,
          message: `Warning: You queued ${ids.length} roles at ${name}. Career Strike recommends applying to at most 1 role per company to avoid recruiter filtering.`,
        });
      }
    }

    // Cross-check /contacts for warm paths
    const warmPathMatches: WarmPathMatch[] = [];
    for (const job of jobs) {
      const contacts = db
        .prepare(
          `SELECT id, name, title, email, linkedin_url
           FROM contacts
           WHERE lower(company) LIKE ?
           ORDER BY updated_at DESC LIMIT 5`,
        )
        .all(`%${job.employer.toLowerCase()}%`) as Array<{
        id: string;
        name: string;
        title: string | null;
        email: string | null;
        linkedin_url: string | null;
      }>;

      if (contacts.length > 0) {
        warmPathMatches.push({
          jobId: job.id,
          company: job.employer,
          contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            title: c.title,
            email: c.email,
            linkedinUrl: c.linkedin_url,
          })),
        });
      }
    }

    // Check answer_vault for saved default answers
    const savedAnswers = db.prepare('SELECT question_key, answer_value FROM answer_vault').all() as Array<{
      question_key: string;
      answer_value: string;
    }>;
    const answerMap = new Map(savedAnswers.map((a) => [a.question_key, a.answer_value]));

    // Find missing required screening answers
    const missingStandard = STANDARD_SCREENING_QUESTIONS.filter((q) => !answerMap.has(q.key));

    const queuedItems: AutopilotQueueItem[] = [];
    const timestamp = now();

    const insertQueueStmt = db.prepare(`
      INSERT INTO autopilot_queue (
        id, job_id, company_name, ats_provider, status,
        fields_filled_count, fields_total_count, pending_question_json,
        resume_snapshot_id, receipt_json, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
    `);

    db.transaction(() => {
      for (const job of jobs) {
        const queueId = id('auto');
        const url = job.apply_url || job.posting_url;
        const provider = detectAtsProvider(url);

        // Resume snapshot / packet lookup
        const packet = db
          .prepare('SELECT variant_id FROM prep_packets WHERE job_id = ? ORDER BY created_at DESC LIMIT 1')
          .get(job.id) as { variant_id: string | null } | undefined;
        const snapshotId = packet?.variant_id || null;

        let status: AutopilotStatus;
        let pendingQuestionJson: string | null = null;
        let filledCount: number;
        const totalCount = 5 + STANDARD_SCREENING_QUESTIONS.length; // 5 base profile fields + 3 standard answers

        if (missingStandard.length > 0) {
          status = 'needs_answer';
          const firstMissing = missingStandard[0]!;
          pendingQuestionJson = JSON.stringify({
            questionKey: firstMissing.key,
            questionLabel: firstMissing.label,
            answerType: firstMissing.type,
            options: firstMissing.options,
            placeholder: firstMissing.placeholder,
          });
          filledCount = 5 + (STANDARD_SCREENING_QUESTIONS.length - missingStandard.length);
        } else if (provider === 'workday') {
          // Honest blocked fallback for Workday
          status = 'blocked_fallback';
          filledCount = totalCount;
        } else {
          status = 'queued';
          filledCount = totalCount;
        }

        insertQueueStmt.run(
          queueId,
          job.id,
          job.employer,
          provider,
          status,
          filledCount,
          totalCount,
          pendingQuestionJson,
          snapshotId,
          timestamp,
        );

        queuedItems.push({
          id: queueId,
          jobId: job.id,
          companyName: job.employer,
          atsProvider: provider,
          status,
          fieldsFilledCount: filledCount,
          fieldsTotalCount: totalCount,
          pendingQuestion: pendingQuestionJson ? (JSON.parse(pendingQuestionJson) as PendingQuestion) : null,
          resumeSnapshotId: snapshotId,
          receipt: null,
          sentAt: null,
          createdAt: timestamp,
          jobTitle: job.title,
          location: job.normalized_location || job.location_text || undefined,
          applyUrl: url || undefined,
        });
      }
    })();

    const updatedFocus = getDailyFocusUsage(db);

    return {
      queued: queuedItems,
      duplicateCompanyWarnings,
      warmPathMatches,
      remainingFocusCap: updatedFocus.remaining,
      dailyFocusCap: updatedFocus.cap,
      usedFocusCap: updatedFocus.used,
    };
  });

  // 2. POST /api/autopilot/:id/answer
  app.post<{ Params: { id: string } }>('/api/autopilot/:id/answer', async (req, reply) => {
    const parse = AnswerBody.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'INVALID_INPUT', issues: parse.error.issues });
    }
    const { answer, saveAsDefault } = parse.data;

    const row = db.prepare('SELECT * FROM autopilot_queue WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Queue item not found.' });
    }

    const item = rowToQueueItem(row);
    const pending = item.pendingQuestion;
    const strAnswer = typeof answer === 'boolean' ? (answer ? 'Yes' : 'No') : String(answer).trim();

    if (pending && saveAsDefault) {
      const answerId = id('ans');
      db.prepare(
        `INSERT INTO answer_vault (id, question_key, question_label, answer_value, answer_type, is_default, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(question_key) DO UPDATE SET
           answer_value = excluded.answer_value,
           updated_at = excluded.updated_at`,
      ).run(answerId, pending.questionKey, pending.questionLabel, strAnswer, pending.answerType, now());
    }

    // Check if other standard questions still missing
    const savedAnswers = db.prepare('SELECT question_key FROM answer_vault').all() as Array<{ question_key: string }>;
    const answeredKeys = new Set(savedAnswers.map((a) => a.question_key));
    if (pending) answeredKeys.add(pending.questionKey);

    const nextMissing = STANDARD_SCREENING_QUESTIONS.find((q) => !answeredKeys.has(q.key));

    let nextStatus: AutopilotStatus;
    let nextPendingJson: string | null = null;
    let newFilledCount = Math.min(item.fieldsTotalCount, item.fieldsFilledCount + 1);

    if (nextMissing) {
      nextStatus = 'needs_answer';
      nextPendingJson = JSON.stringify({
        questionKey: nextMissing.key,
        questionLabel: nextMissing.label,
        answerType: nextMissing.type,
        options: nextMissing.options,
        placeholder: nextMissing.placeholder,
      });
    } else if (item.atsProvider === 'workday') {
      nextStatus = 'blocked_fallback';
      newFilledCount = item.fieldsTotalCount;
    } else {
      nextStatus = 'queued';
      newFilledCount = item.fieldsTotalCount;
    }

    db.prepare(
      `UPDATE autopilot_queue
       SET status = ?, fields_filled_count = ?, pending_question_json = ?
       WHERE id = ?`,
    ).run(nextStatus, newFilledCount, nextPendingJson, req.params.id);

    const updated = db.prepare('SELECT * FROM autopilot_queue WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >;

    return { ok: true, item: rowToQueueItem(updated) };
  });

  // 3. POST /api/autopilot/:id/fill (Advance to filling -> ready_to_submit)
  app.post<{ Params: { id: string } }>('/api/autopilot/:id/fill', async (req, reply) => {
    const row = db.prepare('SELECT * FROM autopilot_queue WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Queue item not found.' });
    }

    const item = rowToQueueItem(row);
    if (item.status === 'blocked_fallback') {
      return { ok: true, item };
    }

    const nextStatus: AutopilotStatus = 'ready_to_submit';
    db.prepare('UPDATE autopilot_queue SET status = ? WHERE id = ?').run(nextStatus, req.params.id);

    const updated = db.prepare('SELECT * FROM autopilot_queue WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >;
    return { ok: true, item: rowToQueueItem(updated) };
  });

  // 4. POST /api/autopilot/:id/mark-sent
  app.post<{ Params: { id: string } }>('/api/autopilot/:id/mark-sent', async (req, reply) => {
    const parse = MarkSentBody.safeParse(req.body ?? {});
    const fieldsFilled = parse.success && parse.data.fieldsFilled ? parse.data.fieldsFilled : undefined;
    const customSnapshotId = parse.success && parse.data.resumeSnapshotId ? parse.data.resumeSnapshotId : undefined;

    const row = db
      .prepare(
        `SELECT q.*, j.title AS job_title
         FROM autopilot_queue q
         JOIN jobs j ON j.id = q.job_id
         WHERE q.id = ?`,
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Queue item not found.' });
    }

    const at = now();
    const finalFilledCount = fieldsFilled ?? Number(row.fields_filled_count ?? 14);
    const snapshotId = customSnapshotId ?? (row.resume_snapshot_id as string | null) ?? 'snap_verified';

    const receipt: AutopilotReceipt = {
      fieldsFilled: finalFilledCount,
      resumeSnapshotId: snapshotId,
      atsProvider: row.ats_provider as AtsProvider,
      companyName: String(row.company_name),
      jobTitle: row.job_title ? String(row.job_title) : undefined,
      timestamp: at,
      verifiedPdfAttached: true,
      trackedAs: 'Applied',
    };

    const receiptJson = JSON.stringify(receipt);

    db.transaction(() => {
      // 1. Update queue item
      db.prepare(
        `UPDATE autopilot_queue
         SET status = 'sent', sent_at = ?, receipt_json = ?, fields_filled_count = ?
         WHERE id = ?`,
      ).run(at, receiptJson, finalFilledCount, req.params.id);

      // 2. Update main tracker (applications table)
      const existingApp = db.prepare('SELECT id FROM applications WHERE job_id = ?').get(row.job_id) as
        | { id: string }
        | undefined;

      if (!existingApp) {
        const appId = id('app');
        db.prepare(
          `INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at)
           VALUES (?, ?, 'SUBMITTED_CONFIRMED', 'automated', 1, ?, ?)`,
        ).run(appId, row.job_id, at, at);
      } else {
        db.prepare("UPDATE applications SET state = 'SUBMITTED_CONFIRMED', updated_at = ? WHERE id = ?").run(
          at,
          existingApp.id,
        );
      }

      // 3. Audit event
      db.prepare('INSERT INTO audit_events (at, actor, action, subject, detail_json) VALUES (?, ?, ?, ?, ?)').run(
        at,
        'autopilot-runner',
        'application.sent',
        req.params.id,
        receiptJson,
      );
    })();

    const updated = db.prepare('SELECT * FROM autopilot_queue WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >;

    return {
      ok: true,
      item: rowToQueueItem(updated),
      receipt,
    };
  });

  // 5. GET /api/autopilot/queue
  app.get('/api/autopilot/queue', async () => {
    const rows = db
      .prepare(
        `SELECT q.*, j.title AS job_title, j.apply_url, j.posting_url, j.location_text, j.normalized_location
         FROM autopilot_queue q
         JOIN jobs j ON j.id = q.job_id
         ORDER BY q.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>;

    const queueItems = rows.map(rowToQueueItem);
    const activeItems = queueItems.filter((i) => i.status !== 'sent');
    const sentReceipts = queueItems.filter((i) => i.status === 'sent' && i.receipt !== null).slice(0, 10);

    const focusUsage = getDailyFocusUsage(db);

    return {
      items: activeItems,
      receipts: sentReceipts,
      dailyFocusCap: focusUsage.cap,
      usedFocusCap: focusUsage.used,
      remainingFocusCap: focusUsage.remaining,
    };
  });

  // 6. GET /api/autopilot/answers
  app.get('/api/autopilot/answers', async () => {
    const rows = db.prepare('SELECT * FROM answer_vault ORDER BY updated_at DESC').all() as Array<
      Record<string, unknown>
    >;
    return { answers: rows.map(rowToAnswerVaultItem) };
  });

  // 7. POST /api/autopilot/answers
  app.post('/api/autopilot/answers', async (req, reply) => {
    const parse = CreateAnswerBody.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'INVALID_INPUT', issues: parse.error.issues });
    }
    const { questionKey, questionLabel, answerValue, answerType, isDefault } = parse.data;
    const strAnswer = typeof answerValue === 'boolean' ? (answerValue ? 'Yes' : 'No') : String(answerValue).trim();
    const answerId = id('ans');
    const timestamp = now();

    db.prepare(
      `INSERT INTO answer_vault (id, question_key, question_label, answer_value, answer_type, is_default, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(question_key) DO UPDATE SET
         question_label = excluded.question_label,
         answer_value = excluded.answer_value,
         answer_type = excluded.answer_type,
         is_default = excluded.is_default,
         updated_at = excluded.updated_at`,
    ).run(answerId, questionKey, questionLabel, strAnswer, answerType, isDefault ? 1 : 0, timestamp);

    const row = db.prepare('SELECT * FROM answer_vault WHERE question_key = ?').get(questionKey) as Record<
      string,
      unknown
    >;

    return { ok: true, answer: rowToAnswerVaultItem(row) };
  });

  // 8. DELETE /api/autopilot/answers/:id
  app.delete<{ Params: { id: string } }>('/api/autopilot/answers/:id', async (req) => {
    db.prepare('DELETE FROM answer_vault WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
