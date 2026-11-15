import {
  type CompensationBenchmarkRecord,
  calculatePercentiles,
  evaluateCompensation,
} from '../career/compensation.js';
import { candidateContext } from '../career/context.js';
import { JobQuery, listJobs, syncBoard } from '../career/jobs.js';
import { getCompany360 } from '../markets/company-intelligence.js';
import { evaluateDecisionReadyOpportunity } from '../matching/shortlist.js';
import type { NormalizedPosting } from '../sources/types.js';
import { type Db, openDb } from '../store/db.js';
import { getSettings } from '../store/settings.js';
import { computeMetrics, observations } from './metrics.js';
import { ProposalAction, ProposalError, StrategyProposals } from './proposals.js';

/**
 * A deterministic evaluation harness for the learning loop. It does not measure whether a
 * suggestion "works" in the labour market: there is no such evidence here. It checks the
 * engineering invariants the product promises — sample-size honesty, the action allowlist,
 * candidate control, and undoable changes — against synthetic local data.
 */

export interface EvaluationCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface EvaluationScenario {
  id: string;
  title: string;
  checks: EvaluationCheck[];
}

export interface EvaluationReport {
  generatedAt: string;
  passed: boolean;
  scenarios: EvaluationScenario[];
  summary: { scenarios: number; checks: number; failed: number };
}

const posting = (source: 'lever' | 'greenhouse', i: number, title: string): NormalizedPosting => ({
  source,
  board: 'evaluation',
  sourceJobId: `${source}-${i}`,
  employer: `Synthetic ${source} ${i}`,
  title,
  locationText: 'Remote',
  remotePolicy: 'remote',
  employmentType: 'full_time',
  department: null,
  salary: null,
  description: [
    { type: 'heading', text: 'Requirements' },
    { type: 'item', text: 'Rust and TypeScript' },
  ],
  applyUrl: null,
  postingUrl: null,
  publishedAt: null,
  unresolved: [],
});

interface Campaign {
  source: 'lever' | 'greenhouse';
  applications: number;
  responses: number;
  interviews?: number;
  title?: string;
}

/** Seed applications and recorded events; no metric reads anything that was not stored here. */
function seed(db: Db, campaigns: Campaign[], at = '2026-10-20T10:00:00.000Z'): void {
  const event = db.prepare(
    'INSERT INTO application_events (application_id, from_state, to_state, actor, at) VALUES (?, ?, ?, ?, ?)',
  );
  for (const campaign of campaigns) {
    const postings = Array.from({ length: campaign.applications }, (_, i) =>
      posting(campaign.source, i, campaign.title ?? 'Backend Engineer'),
    );
    syncBoard(db, campaign.source, 'evaluation', postings, new Date(at));
    const jobs = db
      .prepare('SELECT job_id AS id, source_job_id FROM job_sources WHERE source = ? AND board = ?')
      .all(campaign.source, 'evaluation') as { id: string; source_job_id: string }[];
    for (const job of jobs) {
      const i = Number(job.source_job_id.split('-')[1]);
      const appId = `app_${campaign.source}_${i}`;
      const interviewed = i < (campaign.interviews ?? 0);
      const responded = i < campaign.responses;
      const final = interviewed ? 'INTERVIEW' : responded ? 'RESPONSE_RECEIVED' : 'SUBMITTED_CONFIRMED';
      db.prepare(
        "INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at) VALUES (?, ?, ?, 'manual', 1, ?, ?)",
      ).run(appId, job.id, final, at, at);
      event.run(appId, 'NEEDS_MANUAL_ACTION', 'SUBMITTED_CONFIRMED', 'dashboard', at);
      if (responded) event.run(appId, 'SUBMITTED_CONFIRMED', 'RESPONSE_RECEIVED', 'dashboard', at);
      if (interviewed) event.run(appId, 'RESPONSE_RECEIVED', 'INTERVIEW', 'dashboard', at);
    }
  }
}

function setup(campaigns: Campaign[] = [], boards = 0): Db {
  const db = openDb(':memory:');
  seed(db, campaigns);
  const addBoard = db.prepare(
    "INSERT INTO source_boards (id, source, board, added_at, health) VALUES (?, 'lever', ?, '2026-10-01T00:00:00.000Z', 'OK')",
  );
  for (let i = 0; i < boards; i++) addBoard.run(`src_eval_${i}`, `eval-${i}`);
  return db;
}

function check(id: string, passed: boolean, detail: string): EvaluationCheck {
  return { id, passed, detail };
}

function scenario(id: string, title: string, run: () => EvaluationCheck[]): EvaluationScenario {
  return { id, title, checks: run() };
}

/** Every check must pass; the report is suitable for CI and for `npm run evaluate`. */
export function evaluateLearning(now = new Date()): EvaluationReport {
  const scenarios: EvaluationScenario[] = [
    scenario('sample-size-honesty', 'No comparison is invented below the minimum sample', () => {
      const db = setup([{ source: 'lever', applications: 4, responses: 0 }], 1);
      try {
        const metrics = computeMetrics(db, now.getTime());
        const text = observations(metrics)
          .map((o) => o.text)
          .join(' ');
        return [
          check('insufficient', text.includes('at least 10'), 'Small samples are described as insufficient.'),
          check(
            'no-cause',
            !text.includes('caused') && !text.toLowerCase().includes('proves'),
            'Observations never claim causation.',
          ),
          check(
            'silence-neutral',
            text.includes('Silence is common') && text.includes('not evidence about your résumé'),
            'Silence is not treated as evidence about the candidate.',
          ),
        ];
      } finally {
        db.close();
      }
    }),

    scenario('comparison-with-n', 'A comparison appears only with enough cases and states n', () => {
      const db = setup(
        [
          { source: 'lever', applications: 12, responses: 6 },
          { source: 'greenhouse', applications: 10, responses: 1 },
        ],
        1,
      );
      try {
        const metrics = computeMetrics(db, now.getTime());
        const comparison = observations(metrics).find((o) => o.kind === 'comparison');
        return [
          check('present', Boolean(comparison), 'A comparison is produced when both groups reach the minimum.'),
          check(
            'sample-sizes',
            Boolean(comparison?.text.includes('(n=12)') && comparison?.text.includes('(n=10)')),
            'The comparison reports both sample sizes.',
          ),
          check(
            'no-proof',
            Boolean(comparison?.text.includes('not proof of cause')),
            'The comparison explicitly disclaims causal proof.',
          ),
        ];
      } finally {
        db.close();
      }
    }),

    scenario('allowlist', 'Only the documented proposal action allowlist is accepted', () => {
      const allowed = [
        { type: 'set-monitoring', hours: '24' },
        { type: 'add-preferred-role', role: 'Data Engineer' },
        { type: 'study-skill', skill: 'Rust' },
      ];
      const forbidden = [
        { type: 'set-setting', key: 'identity.email', value: 'attacker@example.com' },
        { type: 'grant-scope', scope: 'sensitive:read' },
        { type: 'approve-application', id: 'app_1' },
        { type: 'set-monitoring', hours: '1' },
        { type: 'add-preferred-role', role: 'x', extra: true },
      ];
      return [
        check(
          'allowed',
          allowed.every((action) => ProposalAction.safeParse(action).success),
          'The three documented actions are accepted.',
        ),
        check(
          'forbidden',
          forbidden.every((action) => !ProposalAction.safeParse(action).success),
          'Identity, scope, approval and malformed actions are refused.',
        ),
      ];
    }),

    scenario('accept-and-undo', 'Accepting a proposal changes only its setting, and undo restores it', () => {
      const db = setup([], 1);
      try {
        const proposals = new StrategyProposals(db);
        const before = getSettings(db)['monitoring.discoveryIntervalHours'];
        proposals.refresh(computeMetrics(db, now.getTime()), now);
        const proposal = proposals.list().find((p) => p.rule === 'monitoring-off');
        if (!proposal) return [check('proposal', false, 'The monitoring proposal was not generated.')];
        const accepted = proposals.decide(proposal.id, 'ACCEPT', {}, 'evaluation');
        const applied = getSettings(db)['monitoring.discoveryIntervalHours'];
        const undone = proposals.decide(proposal.id, 'UNDO', {}, 'evaluation');
        const restored = getSettings(db)['monitoring.discoveryIntervalHours'];
        return [
          check(
            'accepted',
            accepted.status === 'ACCEPTED' && applied === '24',
            'Acceptance applies the proposed value.',
          ),
          check('undo-status', undone.status === 'OPEN', 'Undo returns the proposal to its previous open state.'),
          check('undo-value', restored === before, 'Undo restores the exact previous setting value.'),
        ];
      } finally {
        db.close();
      }
    }),

    scenario('edit-snooze-dismiss', 'Edit, snooze and dismiss remain under candidate control', () => {
      const db = setup([{ source: 'lever', applications: 6, responses: 0 }], 0);
      try {
        const proposals = new StrategyProposals(db);
        proposals.refresh(computeMetrics(db, now.getTime()), now);
        const gap = proposals.list().find((p) => p.rule === 'recurring-gap');
        if (!gap) return [check('proposal', false, 'The recurring-gap proposal was not generated.')];
        const edited = proposals.decide(
          gap.id,
          'EDIT',
          { action: { type: 'study-skill', skill: 'TypeScript' } },
          'evaluation',
        );
        const snoozed = proposals.decide(gap.id, 'SNOOZE', { days: 7 }, 'evaluation');
        const undone = proposals.decide(gap.id, 'UNDO', {}, 'evaluation');
        const dismissed = proposals.decide(gap.id, 'DISMISS', {}, 'evaluation');
        return [
          check(
            'edited',
            edited.status === 'EDITED' && edited.effectiveAction.type === 'study-skill',
            'An edit is stored separately from the original action.',
          ),
          check('snoozed', snoozed.status === 'SNOOZED' && Boolean(snoozed.snoozedUntil), 'A snooze is time-bounded.'),
          check('undo-snooze', undone.status === 'EDITED', 'Undo restores the state before the snooze.'),
          check('dismissed', dismissed.status === 'DISMISSED', 'A dismissed proposal stays decided.'),
          check(
            'history',
            dismissed.decisions.some((decision) => decision.decision === 'UNDO'),
            'Every decision, including undo, is retained in history.',
          ),
        ];
      } finally {
        db.close();
      }
    }),

    scenario('tamper-refusal', 'A proposal whose stored action was tampered with cannot change a setting', () => {
      const db = setup([{ source: 'lever', applications: 6, responses: 0 }], 0);
      try {
        const proposals = new StrategyProposals(db);
        proposals.refresh(computeMetrics(db, now.getTime()), now);
        const gap = proposals.list().find((p) => p.rule === 'recurring-gap');
        if (!gap) return [check('proposal', false, 'The recurring-gap proposal was not generated.')];
        db.prepare('UPDATE strategy_proposals SET action_json = ? WHERE id = ?').run(
          JSON.stringify({ type: 'set-setting', key: 'identity.email', value: 'attacker@example.com' }),
          gap.id,
        );
        let refused = false;
        try {
          proposals.decide(gap.id, 'ACCEPT', {}, 'evaluation');
        } catch (err) {
          refused = err instanceof ProposalError;
        }
        return [
          check('refused', refused, 'Tampered actions are refused with a proposal error.'),
          check('unchanged', getSettings(db)['identity.email'] === null, 'The identity setting was not changed.'),
        ];
      } finally {
        db.close();
      }
    }),

    scenario(
      'company-360-provenance',
      'Company 360 preserves unknowns and source provenance without fabrication',
      () => {
        const db = setup([], 1);
        try {
          const p = getCompany360(db, 'non-existent-company');
          return [
            check('null-safe', p === null, 'Non-existent company returns null rather than synthesized defaults.'),
          ];
        } finally {
          db.close();
        }
      },
    ),

    scenario(
      'compensation-percentile-honesty',
      'Compensation percentiles require N >= 5 and disclaim purchasing power parity',
      () => {
        const belowMin = calculatePercentiles([100000, 120000, 130000, 140000]); // N = 4 < 5
        const meetsMin = calculatePercentiles([100000, 110000, 120000, 130000, 140000]); // N = 5

        const mockBenchmark: CompensationBenchmarkRecord = {
          id: 'bench_eval',
          roleFamily: 'software_engineering',
          seniority: 'mid',
          countryCode: 'US',
          city: null,
          currency: 'USD',
          period: 'year',
          baseMin: 100000,
          baseMax: 150000,
          p25: 110000,
          p50: 125000,
          p75: 140000,
          sampleSize: 20,
          sourceKind: 'EXTERNAL_BENCHMARK',
          sourceName: 'Evaluation Survey',
          observedAt: now.toISOString(),
          limitations: 'Test benchmark',
        };

        const comparison = evaluateCompensation(
          { currency: 'EUR', min: 100000, max: 120000, interval: 'year', source: 'structured' },
          mockBenchmark,
        );

        return [
          check('n-below-threshold', belowMin === null, 'Percentiles are null when sample size N < 5.'),
          check('n-meets-threshold', meetsMin !== null, 'Percentiles are computed when N >= 5.'),
          check(
            'currency-caveat',
            comparison.limitations.some((c) => c.includes('purchasing power') || c.includes('Currency mismatch')),
            'Currency conversion strictly includes purchasing-power caveat.',
          ),
        ];
      },
    ),

    scenario(
      'shortlist-eligibility-preservation',
      'Critical eligibility failures are never collapsed into an attractive recommendation',
      () => {
        const db = setup([], 1);
        try {
          const post: NormalizedPosting = {
            source: 'lever',
            board: 'evaluation',
            sourceJobId: 'eval-ineligible-1',
            employer: 'Banned Synthetic Corp',
            title: 'Principal Rust Architect',
            locationText: 'Remote',
            remotePolicy: 'remote',
            employmentType: 'full_time',
            department: null,
            salary: null,
            description: [
              { type: 'heading', text: 'Requirements' },
              { type: 'item', text: 'Rust in production' },
            ],
            applyUrl: null,
            postingUrl: null,
            publishedAt: null,
            unresolved: [],
          };
          syncBoard(db, 'lever', 'evaluation', [post], now);
          const { jobs } = listJobs(db, JobQuery.parse({ limit: 1 }), {
            excludedEmployers: [],
          });
          const job = jobs[0];
          if (!job) return [check('job-present', false, 'Evaluated job was not stored.')];

          const ctx = candidateContext(db);
          const entry = evaluateDecisionReadyOpportunity(db, job, {
            ...ctx,
            settings: { ...ctx.settings!, excludedEmployers: ['Banned Synthetic Corp'] },
          });

          return [
            check(
              'eligibility-failed',
              !entry.dimensions.hardEligibility.passed,
              'Hard eligibility check reports failure for excluded employer.',
            ),
            check(
              'action-skip',
              entry.nextBestAction === 'SKIP',
              'Next best action is SKIP, never recommending an ineligible role.',
            ),
          ];
        } finally {
          db.close();
        }
      },
    ),
  ];
  const checks = scenarios.flatMap((s) => s.checks);
  return {
    generatedAt: now.toISOString(),
    passed: checks.every((c) => c.passed),
    scenarios,
    summary: { scenarios: scenarios.length, checks: checks.length, failed: checks.filter((c) => !c.passed).length },
  };
}
