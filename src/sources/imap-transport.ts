import { randomBytes } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import type { Db } from '../store/db.js';

export interface ImapSyncOptions {
  mailbox?: string;
  maxMessages?: number;
  lookbackDays?: number;
}

export interface ImapCandidateRecord {
  id: string;
  messageId: string;
  from: string | null;
  subject: string | null;
  detectedAt: string;
  status: 'pending' | 'accepted' | 'dismissed';
}

export interface ImapSyncResult {
  polled: number;
  newCandidates: number;
  candidates: ImapCandidateRecord[];
  error?: string;
}

const RECRUITER_SUBJECT_REGEX =
  /(?:interview|invitation|screening|next\s*steps|schedule\s*a\s*call|phone\s*screen|chat\s*with|speaking\s*with|application\s*status|offer|technical\s*assessment|recruiter|hiring|job\s*application)/i;

/**
 * Polls the candidate's mailbox over TLS in read-only mode.
 * Evaluates sender domains against the configured allowlist, filters for recruiter
 * communication, and persists pending confirmation cards into SQLite.
 */
export async function pollImapTransport(db: Db, options: ImapSyncOptions = {}): Promise<ImapSyncResult> {
  const row = db.prepare('SELECT * FROM imap_settings WHERE id = 1').get() as
    | {
        host: string;
        port: number;
        username: string;
        password: string | null;
        allowlist_json: string;
        enabled: number;
        last_sync_at: string | null;
      }
    | undefined;

  if (!row || !row.enabled || !row.host || !row.username || !row.password) {
    return { polled: 0, newCandidates: 0, candidates: [] };
  }

  const allowlist: string[] = (() => {
    try {
      const parsed = JSON.parse(row.allowlist_json);
      return Array.isArray(parsed) ? parsed.map((s) => String(s).toLowerCase().trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  })();

  const client = new ImapFlow({
    host: row.host,
    port: row.port || 993,
    secure: row.port === 993 || row.port === undefined || row.port === 0,
    auth: {
      user: row.username,
      pass: row.password,
    },
    logger: false,
    emitLogs: false,
  });

  const mailboxName = options.mailbox ?? 'INBOX';
  const lookbackDays = options.lookbackDays ?? 14;
  const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const maxMessages = options.maxMessages ?? 50;

  const newCandidates: ImapCandidateRecord[] = [];
  let polledCount = 0;

  try {
    await client.connect();
    // Open in strictly READ-ONLY mode so candidate emails are never modified
    const lock = await client.getMailboxLock(mailboxName, { readOnly: true });

    try {
      const messages = client.fetch(
        { since: sinceDate },
        {
          envelope: true,
          uid: true,
        },
      );

      const existingStmt = db.prepare('SELECT 1 FROM imap_candidates WHERE message_id = ?');
      const insertStmt = db.prepare(
        'INSERT INTO imap_candidates (id, message_id, from_addr, subject, detected_at, status) VALUES (?, ?, ?, ?, ?, ?)',
      );

      for await (const msg of messages) {
        polledCount++;
        if (polledCount > maxMessages) break;

        const envelope = msg.envelope;
        if (!envelope) continue;

        const fromAddress = envelope.from?.[0]?.address ?? '';
        const fromDomain = fromAddress.split('@')[1]?.toLowerCase() ?? '';
        const subject = envelope.subject ?? '';
        const dateIso =
          envelope.date instanceof Date
            ? envelope.date.toISOString()
            : envelope.date
              ? new Date(envelope.date).toISOString()
              : new Date().toISOString();
        const messageId = envelope.messageId ?? `uid-${msg.uid}-${dateIso}`;

        // Verify allowlist match if allowlist is defined
        if (allowlist.length > 0) {
          const domainMatched = allowlist.some(
            (allowed) => fromDomain === allowed || fromDomain.endsWith(`.${allowed}`),
          );
          if (!domainMatched) continue;
        }

        // Verify recruiter signal in subject
        if (!RECRUITER_SUBJECT_REGEX.test(subject)) continue;

        // Check deduplication
        if (existingStmt.get(messageId)) continue;

        const id = `cand_${randomBytes(8).toString('base64url')}`;
        const status = 'pending';

        insertStmt.run(id, messageId, fromAddress, subject, dateIso, status);
        newCandidates.push({
          id,
          messageId,
          from: fromAddress,
          subject,
          detectedAt: dateIso,
          status,
        });
      }
    } finally {
      lock.release();
    }

    const nowIso = new Date().toISOString();
    db.prepare('UPDATE imap_settings SET last_sync_at = ? WHERE id = 1').run(nowIso);
    await client.logout();
  } catch (err) {
    return {
      polled: polledCount,
      newCandidates: newCandidates.length,
      candidates: newCandidates,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    polled: polledCount,
    newCandidates: newCandidates.length,
    candidates: newCandidates,
  };
}

/**
 * Advances an application matching a recruiter email confirmation.
 * Matches employer or company domain in from_addr or subject.
 */
export function advanceApplicationFromCandidate(
  db: Db,
  candidate: { from_addr: string | null; subject: string | null },
): { applicationId: string; fromState: string; toState: string } | null {
  const from = (candidate.from_addr ?? '').toLowerCase();
  const subject = (candidate.subject ?? '').toLowerCase();

  // Search active applications in screening/applied stages
  const activeApps = db
    .prepare(
      `SELECT a.id, a.state, j.employer, j.title, j.apply_url, j.posting_url
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE a.state IN ('SUBMITTED_CONFIRMED', 'RESPONSE_RECEIVED', 'SUBMISSION_UNCONFIRMED')
       ORDER BY a.updated_at DESC`,
    )
    .all() as {
    id: string;
    state: string;
    employer: string;
    title: string;
    apply_url: string | null;
    posting_url: string | null;
  }[];

  for (const app of activeApps) {
    const emp = app.employer.toLowerCase();
    const matchEmployer = emp.length > 2 && (from.includes(emp) || subject.includes(emp));
    const urlDomain = (app.apply_url ?? app.posting_url ?? '').toLowerCase();
    const fromDomain = from.split('@')[1] ?? '';
    const matchDomain = fromDomain.length > 3 && urlDomain.includes(fromDomain);

    if (matchEmployer || matchDomain) {
      const fromState = app.state;
      const toState = 'INTERVIEW';
      const now = new Date().toISOString();

      db.transaction(() => {
        db.prepare('UPDATE applications SET state = ?, updated_at = ? WHERE id = ?').run(toState, now, app.id);
        db.prepare('INSERT INTO audit_events (at, actor, action, subject, detail_json) VALUES (?, ?, ?, ?, ?)').run(
          now,
          'imap-sync',
          'application.state_changed',
          app.id,
          JSON.stringify({ from: fromState, to: toState, reason: 'recruiter_email_confirmed' }),
        );
      })();

      return { applicationId: app.id, fromState, toState };
    }
  }

  return null;
}
