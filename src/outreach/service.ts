import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';

/**
 * Professional-presence and outreach workflow. Everything here is a local draft: Career Strike
 * never sends email, LinkedIn messages or any other communication. A person must approve the
 * exact text, and only the candidate can record that they sent it themselves.
 */
export type OutreachChannel = 'linkedin' | 'email' | 'other';
export type OutreachPurpose = 'referral' | 'recruiter' | 'follow_up' | 'thank_you' | 'other';
export type OutreachState = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT_MANUALLY' | 'DISMISSED';

export interface ProfessionalContact {
  id: string;
  name: string;
  employer: string | null;
  roleTitle: string | null;
  profileUrl: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachDraft {
  id: string;
  contactId: string;
  contact: ProfessionalContact;
  applicationId: string | null;
  application: { id: string; title: string; employer: string } | null;
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  subject: string | null;
  body: string;
  state: OutreachState;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  decidedBy: string | null;
  events: { from: string | null; to: string; actor: string; note: string | null; at: string }[];
}

export const ContactInput = z
  .object({
    name: z.string().trim().min(1, 'Enter the person’s name').max(160),
    employer: z.string().trim().max(200).nullable().optional(),
    roleTitle: z.string().trim().max(200).nullable().optional(),
    profileUrl: z.string().trim().url().max(2000).nullable().optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const OutreachInput = z
  .object({
    contactId: z.string().regex(/^contact_[A-Za-z0-9_-]+$/),
    applicationId: z
      .string()
      .regex(/^app_[A-Za-z0-9_-]+$/)
      .nullable()
      .optional(),
    channel: z.enum(['linkedin', 'email', 'other']),
    purpose: z.enum(['referral', 'recruiter', 'follow_up', 'thank_you', 'other']),
    subject: z.string().trim().max(300).nullable().optional(),
    body: z.string().trim().min(1, 'Write the message before requesting approval').max(10_000),
  })
  .strict();

const EditInput = OutreachInput.partial().omit({ contactId: true }).strict();

export class OutreachError extends Error {}

interface ContactRow {
  id: string;
  name: string;
  employer: string | null;
  role_title: string | null;
  profile_url: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DraftRow {
  id: string;
  contact_id: string;
  application_id: string | null;
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  subject: string | null;
  body: string;
  state: OutreachState;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  sent_at: string | null;
  decided_by: string | null;
}

const contact = (row: ContactRow): ProfessionalContact => ({
  id: row.id,
  name: row.name,
  employer: row.employer,
  roleTitle: row.role_title,
  profileUrl: row.profile_url,
  email: row.email,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const id = (prefix: string): string => `${prefix}_${randomBytes(9).toString('base64url')}`;

export class OutreachService {
  constructor(private readonly db: Db) {}

  contacts(): ProfessionalContact[] {
    return (
      this.db
        .prepare('SELECT * FROM professional_contacts ORDER BY updated_at DESC, name COLLATE NOCASE')
        .all() as ContactRow[]
    ).map(contact);
  }

  addContact(input: z.infer<typeof ContactInput>, actor: string): ProfessionalContact {
    const at = new Date().toISOString();
    const contactId = id('contact');
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO professional_contacts
             (id, name, employer, role_title, profile_url, email, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          contactId,
          input.name,
          input.employer ?? null,
          input.roleTitle ?? null,
          input.profileUrl ?? null,
          input.email ?? null,
          input.notes ?? null,
          at,
          at,
        );
      this.audit(actor, 'outreach.contact.added', contactId, at);
    })();
    return this.contact(contactId);
  }

  updateContact(contactId: string, input: z.infer<typeof ContactInput>, actor: string): ProfessionalContact {
    this.requireContact(contactId);
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE professional_contacts SET name = ?, employer = ?, role_title = ?, profile_url = ?, email = ?,
             notes = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          input.name,
          input.employer ?? null,
          input.roleTitle ?? null,
          input.profileUrl ?? null,
          input.email ?? null,
          input.notes ?? null,
          at,
          contactId,
        );
      this.audit(actor, 'outreach.contact.updated', contactId, at);
    })();
    return this.contact(contactId);
  }

  deleteContact(contactId: string, actor: string): boolean {
    const at = new Date().toISOString();
    const removed = this.db.prepare('DELETE FROM professional_contacts WHERE id = ?').run(contactId).changes > 0;
    if (removed) this.audit(actor, 'outreach.contact.deleted', contactId, at);
    return removed;
  }

  list(): OutreachDraft[] {
    const rows = this.db
      .prepare('SELECT * FROM outreach_drafts ORDER BY updated_at DESC, created_at DESC')
      .all() as DraftRow[];
    return rows.map((row) => this.toDraft(row));
  }

  get(draftId: string): OutreachDraft | null {
    const row = this.db.prepare('SELECT * FROM outreach_drafts WHERE id = ?').get(draftId) as DraftRow | undefined;
    return row ? this.toDraft(row) : null;
  }

  create(input: z.infer<typeof OutreachInput>, actor: string): OutreachDraft {
    this.requireContact(input.contactId);
    this.requireApplication(input.applicationId ?? null);
    const at = new Date().toISOString();
    const draftId = id('outreach');
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO outreach_drafts
             (id, contact_id, application_id, channel, purpose, subject, body, state, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
        )
        .run(
          draftId,
          input.contactId,
          input.applicationId ?? null,
          input.channel,
          input.purpose,
          input.subject ?? null,
          input.body,
          at,
          at,
        );
      this.event(draftId, null, 'DRAFT', actor, 'Draft created.', at);
      this.audit(actor, 'outreach.draft.created', draftId, at);
    })();
    return this.get(draftId)!;
  }

  update(draftId: string, input: z.infer<typeof EditInput>, actor: string): OutreachDraft {
    const row = this.requireDraft(draftId);
    if (row.state === 'SENT_MANUALLY') {
      throw new OutreachError('A sent outreach message cannot be edited. Create a new draft instead.');
    }
    if (row.state === 'DISMISSED') throw new OutreachError('Restore the draft before editing it.');
    const at = new Date().toISOString();
    const nextState: OutreachState = row.state === 'APPROVED' ? 'DRAFT' : row.state;
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE outreach_drafts SET channel = ?, purpose = ?, subject = ?, body = ?, application_id = ?,
             state = ?, approved_at = CASE WHEN ? = 'DRAFT' THEN NULL ELSE approved_at END,
             updated_at = ? WHERE id = ?`,
        )
        .run(
          input.channel ?? row.channel,
          input.purpose ?? row.purpose,
          input.subject === undefined ? row.subject : input.subject,
          input.body ?? row.body,
          input.applicationId === undefined ? row.application_id : input.applicationId,
          nextState,
          nextState,
          at,
          draftId,
        );
      if (nextState !== row.state) {
        this.event(
          draftId,
          row.state,
          nextState,
          actor,
          'Editing after approval invalidated the approval; request approval again.',
          at,
        );
      } else {
        this.event(draftId, row.state, nextState, actor, 'Draft edited.', at);
      }
      this.audit(actor, 'outreach.draft.updated', draftId, at);
    })();
    return this.get(draftId)!;
  }

  requestApproval(draftId: string, actor: string): OutreachDraft {
    const row = this.requireDraft(draftId);
    if (row.state !== 'DRAFT') throw new OutreachError('Only a draft can be sent for approval.');
    if (!row.body.trim()) throw new OutreachError('Write the message before requesting approval.');
    return this.transition(row, 'PENDING_APPROVAL', actor, 'Approval requested.');
  }

  approve(draftId: string, actor: string): OutreachDraft {
    const row = this.requireDraft(draftId);
    if (row.state !== 'PENDING_APPROVAL') throw new OutreachError('Only a draft awaiting approval can be approved.');
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE outreach_drafts SET state = 'APPROVED', approved_at = ?, decided_by = ?, updated_at = ? WHERE id = ?",
        )
        .run(at, actor, at, draftId);
      this.event(draftId, row.state, 'APPROVED', actor, 'Exact draft approved. Nothing has been sent.', at);
      this.audit(actor, 'outreach.draft.approved', draftId, at);
    })();
    return this.get(draftId)!;
  }

  revokeApproval(draftId: string, actor: string): OutreachDraft {
    const row = this.requireDraft(draftId);
    if (row.state !== 'APPROVED') throw new OutreachError('Only an approved draft can have its approval revoked.');
    return this.transition(row, 'DRAFT', actor, 'Approval revoked. Request approval again before sending.');
  }

  markSent(draftId: string, confirmed: boolean, actor: string): OutreachDraft {
    const row = this.requireDraft(draftId);
    if (row.state !== 'APPROVED') throw new OutreachError('Only an approved draft can be marked as sent.');
    if (!confirmed)
      throw new OutreachError('Confirm that you sent this message yourself; Career Strike never sends it for you.');
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE outreach_drafts SET state = 'SENT_MANUALLY', sent_at = ?, updated_at = ? WHERE id = ?")
        .run(at, at, draftId);
      this.event(draftId, row.state, 'SENT_MANUALLY', actor, 'Candidate confirmed sending this message manually.', at);
      this.audit(actor, 'outreach.draft.sent-manually', draftId, at);
    })();
    return this.get(draftId)!;
  }

  dismiss(draftId: string, actor: string): OutreachDraft {
    const row = this.requireDraft(draftId);
    if (row.state === 'SENT_MANUALLY') throw new OutreachError('A sent message cannot be dismissed.');
    return this.transition(row, 'DISMISSED', actor, 'Draft dismissed.');
  }

  restore(draftId: string, actor: string): OutreachDraft {
    const row = this.requireDraft(draftId);
    if (row.state !== 'DISMISSED') throw new OutreachError('Only a dismissed draft can be restored.');
    return this.transition(row, 'DRAFT', actor, 'Draft restored. Request approval again before sending.');
  }

  summary(): Record<OutreachState, number> {
    const rows = this.db.prepare('SELECT state, COUNT(*) AS n FROM outreach_drafts GROUP BY state').all() as {
      state: OutreachState;
      n: number;
    }[];
    const base: Record<OutreachState, number> = {
      DRAFT: 0,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      SENT_MANUALLY: 0,
      DISMISSED: 0,
    };
    for (const row of rows) base[row.state] = row.n;
    return base;
  }

  /** Deterministic starting points. The candidate must edit and approve every word. */
  template(
    purpose: OutreachPurpose,
    context: { contactName: string; employer: string | null; roleTitle: string | null },
  ): {
    subject: string | null;
    body: string;
  } {
    const greeting = `Hi ${context.contactName.split(/\s+/)[0] ?? context.contactName},`;
    const role = context.roleTitle ?? (context.employer ? `the role at ${context.employer}` : 'the role');
    const templates: Record<OutreachPurpose, { subject: string | null; body: string }> = {
      referral: {
        subject: `Question about ${role}`,
        body: `${greeting}\n\nI am applying for ${role}. Before I submit, would you be open to a short conversation about your experience there? I am not asking you to refer me; I would value your perspective.\n\nThank you for your time.`,
      },
      recruiter: {
        subject: `Interest in ${role}`,
        body: `${greeting}\n\nI saw ${role} and would like to be considered. My background is in the areas the role describes, and I am happy to share specifics if useful.\n\nThank you.`,
      },
      follow_up: {
        subject: `Following up on ${role}`,
        body: `${greeting}\n\nI wanted to follow up on my application for ${role}. I remain interested and can provide any additional information you need.\n\nThank you.`,
      },
      thank_you: {
        subject: `Thank you for the conversation`,
        body: `${greeting}\n\nThank you for taking the time to speak with me about ${role}. I appreciated hearing how the team works and remain interested in the opportunity.\n\nBest regards,`,
      },
      other: {
        subject: null,
        body: `${greeting}\n\n\n\nThank you,`,
      },
    };
    return templates[purpose];
  }

  private transition(row: DraftRow, to: OutreachState, actor: string, note: string): OutreachDraft {
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare('UPDATE outreach_drafts SET state = ?, updated_at = ? WHERE id = ?').run(to, at, row.id);
      this.event(row.id, row.state, to, actor, note, at);
      this.audit(actor, `outreach.draft.${to.toLowerCase()}`, row.id, at);
    })();
    return this.get(row.id)!;
  }

  private event(draftId: string, from: string | null, to: string, actor: string, note: string, at: string): void {
    this.db
      .prepare(
        'INSERT INTO outreach_events (outreach_id, from_state, to_state, actor, note, at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(draftId, from, to, actor, note, at);
  }

  private audit(actor: string, action: string, subject: string, at: string): void {
    this.db
      .prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)')
      .run(at, actor, action, subject);
  }

  private requireContact(contactId: string): ContactRow {
    const row = this.db.prepare('SELECT * FROM professional_contacts WHERE id = ?').get(contactId) as
      | ContactRow
      | undefined;
    if (!row) throw new OutreachError('Choose an existing contact.');
    return row;
  }

  private requireApplication(applicationId: string | null): void {
    if (!applicationId) return;
    const exists = this.db.prepare('SELECT 1 FROM applications WHERE id = ?').get(applicationId);
    if (!exists) throw new OutreachError('The linked application was not found.');
  }

  private requireDraft(draftId: string): DraftRow {
    const row = this.db.prepare('SELECT * FROM outreach_drafts WHERE id = ?').get(draftId) as DraftRow | undefined;
    if (!row) throw new OutreachError('Outreach draft not found.');
    return row;
  }

  private contact(contactId: string): ProfessionalContact {
    return contact(this.requireContact(contactId));
  }

  private toDraft(row: DraftRow): OutreachDraft {
    const contactRow = this.db.prepare('SELECT * FROM professional_contacts WHERE id = ?').get(row.contact_id) as
      | ContactRow
      | undefined;
    if (!contactRow) throw new OutreachError('The contact for this draft no longer exists.');
    const application = row.application_id
      ? (this.db
          .prepare('SELECT a.id, j.title, j.employer FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?')
          .get(row.application_id) as { id: string; title: string; employer: string } | undefined)
      : undefined;
    const events = this.db
      .prepare('SELECT from_state, to_state, actor, note, at FROM outreach_events WHERE outreach_id = ? ORDER BY id')
      .all(row.id) as { from_state: string | null; to_state: string; actor: string; note: string | null; at: string }[];
    return {
      id: row.id,
      contactId: row.contact_id,
      contact: contact(contactRow),
      applicationId: row.application_id,
      application: application ?? null,
      channel: row.channel,
      purpose: row.purpose,
      subject: row.subject,
      body: row.body,
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at,
      sentAt: row.sent_at,
      decidedBy: row.decided_by,
      events: events.map((event) => ({
        from: event.from_state,
        to: event.to_state,
        actor: event.actor,
        note: event.note,
        at: event.at,
      })),
    };
  }
}
