import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';
import { getSettings, setSetting } from '../store/settings.js';
import type { Metrics } from './metrics.js';

/**
 * The only changes a strategy proposal can make. Anything else — code, security, consent,
 * identity, approvals, AI access — is outside this list and cannot be proposed or applied.
 */
export const ProposalAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-monitoring'), hours: z.enum(['6', '12', '24']) }).strict(),
  z.object({ type: z.literal('add-preferred-role'), role: z.string().trim().min(1).max(100) }).strict(),
  z.object({ type: z.literal('study-skill'), skill: z.string().trim().min(1).max(80) }).strict(),
]);
export type ProposalAction = z.infer<typeof ProposalAction>;

export type ProposalStatus = 'OPEN' | 'ACCEPTED' | 'DISMISSED' | 'REJECTED' | 'EDITED' | 'SNOOZED';
export type ProposalDecisionKind = 'ACCEPT' | 'REJECT' | 'DISMISS' | 'EDIT' | 'SNOOZE' | 'UNDO';

export interface Proposal {
  id: string;
  rule: string;
  title: string;
  rationale: string;
  action: ProposalAction;
  editedAction: ProposalAction | null;
  effectiveAction: ProposalAction;
  status: ProposalStatus;
  snoozedUntil: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisions: ProposalDecision[];
}

export interface ProposalDecision {
  id: number;
  proposalId: string;
  decision: ProposalDecisionKind;
  previousStatus: ProposalStatus;
  newStatus: ProposalStatus;
  previousAction: ProposalAction | null;
  newAction: ProposalAction | null;
  actor: string;
  at: string;
}

interface Row {
  id: string;
  rule: string;
  title: string;
  rationale: string;
  action_json: string;
  edited_action_json: string | null;
  status: ProposalStatus;
  snoozed_until: string | null;
  created_at: string;
  decided_at: string | null;
}

interface DecisionRow {
  id: number;
  proposal_id: string;
  decision: ProposalDecisionKind;
  previous_status: ProposalStatus;
  new_status: ProposalStatus;
  previous_action_json: string | null;
  new_action_json: string | null;
  setting_reverts_json: string | null;
  actor: string;
  at: string;
}

export interface DecideOptions {
  action?: ProposalAction;
  days?: number;
}

interface SettingRevert {
  key: string;
  previousValue: unknown;
  appliedValue: unknown;
}

export class ProposalError extends Error {}

const toAction = (json: string | null): ProposalAction | null => {
  if (!json) return null;
  try {
    const parsed = ProposalAction.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export class StrategyProposals {
  constructor(private readonly db: Db) {}

  /** Derive proposals from metrics and settings. Each idea is proposed once; decided ideas stay decided. */
  refresh(m: Metrics, now = new Date()): void {
    // A snooze is a postponement, not a rejection. Expired snoozes become available again.
    this.db
      .prepare(
        "UPDATE strategy_proposals SET status = 'OPEN', snoozed_until = NULL WHERE status = 'SNOOZED' AND snoozed_until <= ?",
      )
      .run(now.toISOString());

    const settings = getSettings(this.db);
    const candidates: { rule: string; title: string; rationale: string; action: ProposalAction }[] = [];
    const boards = this.db.prepare('SELECT COUNT(*) FROM source_boards').pluck().get() as number;
    if (settings['monitoring.discoveryIntervalHours'] === '0' && boards > 0) {
      candidates.push({
        rule: 'monitoring-off',
        title: 'Check your job boards automatically once a day',
        rationale: `You monitor ${boards} job board${boards === 1 ? '' : 's'} but only fetch them by hand, so new postings and closures can be missed.`,
        action: { type: 'set-monitoring', hours: '24' },
      });
    }
    for (const gap of m.recurringGaps.filter((g) => g.jobs >= 3)) {
      candidates.push({
        rule: 'recurring-gap',
        title: `Plan to learn ${gap.skill}`,
        rationale: `${gap.skill} is listed as required in ${gap.jobs} jobs you shortlisted or applied to, and it is not in your profile.`,
        action: { type: 'study-skill', skill: gap.skill },
      });
    }
    // A title family that keeps getting interviews but is not among the preferred roles.
    const interviewTitles = this.db
      .prepare(
        `SELECT j.title FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE EXISTS (SELECT 1 FROM application_events e WHERE e.application_id = a.id AND e.to_state IN ('INTERVIEW', 'OFFER'))`,
      )
      .pluck()
      .all() as string[];
    const preferred = ((settings['search.preferredRoles'] as string[]) ?? []).map((r) => r.toLowerCase());
    const counts = new Map<string, number>();
    for (const t of interviewTitles) {
      const family = t
        .replace(/\b(senior|sr\.?|junior|jr\.?|staff|principal|lead|ii|iii)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    for (const [family, n] of counts) {
      if (n >= 2 && !preferred.some((p) => family.toLowerCase().includes(p))) {
        candidates.push({
          rule: 'interviewing-role',
          title: `Add “${family}” to your preferred roles`,
          rationale: `${n} applications for ${family} roles reached interviews, but it is not one of your preferred roles.`,
          action: { type: 'add-preferred-role', role: family },
        });
      }
    }
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO strategy_proposals (id, rule, fingerprint, title, rationale, action_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)",
    );
    const at = now.toISOString();
    for (const c of candidates) {
      const fingerprint = createHash('sha256')
        .update(`${c.rule}:${JSON.stringify(c.action)}`)
        .digest('hex');
      insert.run(
        `prop_${randomBytes(9).toString('base64url')}`,
        c.rule,
        fingerprint,
        c.title,
        c.rationale,
        JSON.stringify(c.action),
        at,
      );
    }
  }

  list(): Proposal[] {
    const rows = this.db
      .prepare('SELECT * FROM strategy_proposals ORDER BY created_at DESC, rowid DESC')
      .all() as Row[];
    return rows.map((row) => this.toProposal(row));
  }

  decisions(proposalId: string): ProposalDecision[] {
    return (
      this.db
        .prepare('SELECT * FROM strategy_proposal_decisions WHERE proposal_id = ? ORDER BY id DESC')
        .all(proposalId) as DecisionRow[]
    ).map((row) => ({
      id: row.id,
      proposalId: row.proposal_id,
      decision: row.decision,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      previousAction: toAction(row.previous_action_json),
      newAction: toAction(row.new_action_json),
      actor: row.actor,
      at: row.at,
    }));
  }

  /**
   * Apply a candidate decision. Acceptance is the only path that changes a setting, and it is
   * re-validated against the allowlist here. Undo restores the previous setting values recorded
   * with that acceptance.
   */
  decide(id: string, decision: ProposalDecisionKind, opts: DecideOptions = {}, actor = 'dashboard'): Proposal {
    const row = this.db.prepare('SELECT * FROM strategy_proposals WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new ProposalError('Proposal not found.');
    if (decision === 'UNDO') return this.undo(row, actor);

    const openish: ProposalStatus[] = ['OPEN', 'EDITED', 'SNOOZED'];
    if (!openish.includes(row.status)) throw new ProposalError('This proposal has already been decided.');

    const original = toAction(row.action_json);
    if (!original) throw new ProposalError('This proposal asks for a change Career Strike does not allow.');
    const effective = toAction(row.edited_action_json) ?? original;
    const at = new Date().toISOString();
    let reverts: SettingRevert[] = [];

    if (decision === 'EDIT') {
      const parsed = ProposalAction.safeParse(opts.action);
      if (!parsed.success) throw new ProposalError('That edit is not a change Career Strike allows.');
      this.record(
        row,
        decision,
        'EDITED',
        row.edited_action_json ?? row.action_json,
        JSON.stringify(parsed.data),
        [],
        actor,
        at,
      );
      this.db
        .prepare(
          "UPDATE strategy_proposals SET edited_action_json = ?, status = 'EDITED', snoozed_until = NULL, decided_at = ? WHERE id = ?",
        )
        .run(JSON.stringify(parsed.data), at, id);
      return this.get(id)!;
    }

    if (decision === 'SNOOZE') {
      const days = Math.min(Math.max(Math.floor(opts.days ?? 7), 1), 90);
      const until = new Date(Date.now() + days * 86_400_000).toISOString();
      this.record(row, decision, 'SNOOZED', row.edited_action_json ?? row.action_json, null, [], actor, at);
      this.db
        .prepare("UPDATE strategy_proposals SET status = 'SNOOZED', snoozed_until = ?, decided_at = ? WHERE id = ?")
        .run(until, at, id);
      return this.get(id)!;
    }

    if (decision === 'ACCEPT') {
      reverts = this.apply(effective);
      this.record(row, decision, 'ACCEPTED', row.edited_action_json ?? row.action_json, null, reverts, actor, at);
      this.db
        .prepare("UPDATE strategy_proposals SET status = 'ACCEPTED', snoozed_until = NULL, decided_at = ? WHERE id = ?")
        .run(at, id);
      return this.get(id)!;
    }

    if (decision === 'REJECT') {
      this.db
        .prepare("UPDATE strategy_proposals SET status = 'REJECTED', snoozed_until = NULL, decided_at = ? WHERE id = ?")
        .run(at, id);
      this.record(row, decision, 'REJECTED', row.edited_action_json ?? row.action_json, null, [], actor, at);
      return this.get(id)!;
    }

    this.db
      .prepare("UPDATE strategy_proposals SET status = 'DISMISSED', snoozed_until = NULL, decided_at = ? WHERE id = ?")
      .run(at, id);
    this.record(row, decision, 'DISMISSED', row.edited_action_json ?? row.action_json, null, [], actor, at);
    return this.get(id)!;
  }

  snapshot(m: Metrics): void {
    this.db
      .prepare('INSERT OR REPLACE INTO strategy_snapshots (day, metrics_json) VALUES (?, ?)')
      .run(
        m.generatedAt.slice(0, 10),
        JSON.stringify({ totals: m.totals, responseRate: m.responseRate, discoveryHealth: m.discoveryHealth }),
      );
  }

  history(): {
    day: string;
    totals: Metrics['totals'];
    responseRate: Metrics['responseRate'];
    discoveryHealth: Metrics['discoveryHealth'] | null;
  }[] {
    return (
      this.db.prepare('SELECT * FROM strategy_snapshots ORDER BY day DESC LIMIT 60').all() as {
        day: string;
        metrics_json: string;
      }[]
    ).map((r) => {
      const metrics = JSON.parse(r.metrics_json) as {
        totals: Metrics['totals'];
        responseRate: Metrics['responseRate'];
        discoveryHealth?: Metrics['discoveryHealth'];
      };
      return {
        day: r.day,
        totals: metrics.totals,
        responseRate: metrics.responseRate,
        discoveryHealth: metrics.discoveryHealth ?? null,
      };
    });
  }

  private undo(row: Row, actor: string): Proposal {
    const last = this.db
      .prepare('SELECT * FROM strategy_proposal_decisions WHERE proposal_id = ? ORDER BY id DESC LIMIT 1')
      .get(row.id) as DecisionRow | undefined;
    if (!last) throw new ProposalError('There is no decision to undo.');
    if (last.decision === 'UNDO') throw new ProposalError('The last decision has already been undone.');
    const at = new Date().toISOString();
    const reverts = last.setting_reverts_json ? (JSON.parse(last.setting_reverts_json) as SettingRevert[]) : [];
    this.db.transaction(() => {
      for (const revert of reverts) {
        setSetting(this.db, revert.key, revert.previousValue, 'strategy-undo');
      }
      this.db
        .prepare(
          `UPDATE strategy_proposals SET status = ?, edited_action_json = ?, snoozed_until = NULL, decided_at = ? WHERE id = ?`,
        )
        .run(
          last.previous_status,
          last.previous_action_json === row.action_json ? null : last.previous_action_json,
          at,
          row.id,
        );
      this.db
        .prepare(
          `INSERT INTO strategy_proposal_decisions
             (proposal_id, decision, previous_status, new_status, previous_action_json, new_action_json, setting_reverts_json, actor, at)
           VALUES (?, 'UNDO', ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          row.id,
          row.status,
          last.previous_status,
          row.edited_action_json ?? row.action_json,
          last.previous_action_json,
          actor,
          at,
        );
      this.db
        .prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)')
        .run(at, actor, 'strategy.undo', row.id);
    })();
    return this.get(row.id)!;
  }

  private apply(action: ProposalAction): SettingRevert[] {
    const reverts: SettingRevert[] = [];
    if (action.type === 'set-monitoring') {
      const before = getSettings(this.db)['monitoring.discoveryIntervalHours'];
      reverts.push({ key: 'monitoring.discoveryIntervalHours', previousValue: before, appliedValue: action.hours });
      setSetting(this.db, 'monitoring.discoveryIntervalHours', action.hours, 'strategy-proposal');
    }
    if (action.type === 'add-preferred-role') {
      const roles = (getSettings(this.db)['search.preferredRoles'] as string[]) ?? [];
      if (!roles.includes(action.role)) {
        reverts.push({ key: 'search.preferredRoles', previousValue: roles, appliedValue: [...roles, action.role] });
        setSetting(this.db, 'search.preferredRoles', [...roles, action.role], 'strategy-proposal');
      }
    }
    // study-skill changes no setting: it becomes part of the learning history.
    return reverts;
  }

  private record(
    row: Row,
    decision: ProposalDecisionKind,
    newStatus: ProposalStatus,
    previousActionJson: string,
    newActionJson: string | null,
    reverts: SettingRevert[],
    actor: string,
    at: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO strategy_proposal_decisions
           (proposal_id, decision, previous_status, new_status, previous_action_json, new_action_json, setting_reverts_json, actor, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        decision,
        row.status,
        newStatus,
        previousActionJson,
        newActionJson,
        reverts.length ? JSON.stringify(reverts) : null,
        actor,
        at,
      );
    this.db
      .prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)')
      .run(at, actor, `strategy.${decision.toLowerCase()}`, row.id);
  }

  private get(id: string): Proposal | null {
    const row = this.db.prepare('SELECT * FROM strategy_proposals WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toProposal(row) : null;
  }

  private toProposal(row: Row): Proposal {
    const action = ProposalAction.parse(JSON.parse(row.action_json));
    const editedAction = toAction(row.edited_action_json);
    return {
      id: row.id,
      rule: row.rule,
      title: row.title,
      rationale: row.rationale,
      action,
      editedAction,
      effectiveAction: editedAction ?? action,
      status: row.status,
      snoozedUntil: row.snoozed_until,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      decisions: this.decisions(row.id),
    };
  }
}
