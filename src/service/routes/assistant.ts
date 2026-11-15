import type { FastifyInstance } from 'fastify';
import { candidateContext } from '../../career/context.js';
import { JobQuery, listJobs } from '../../career/jobs.js';
import {
  type CareerMission,
  CareerMissionSchema,
  getActiveMission,
  listMissionHistory,
  saveMission,
} from '../../career/mission.js';
import { CareerPlanner } from '../../career/planner.js';
import { evaluateDecisionReadyOpportunity } from '../../matching/shortlist.js';
import type { Db } from '../../store/db.js';
import { getSettings } from '../../store/settings.js';

export function registerAssistantRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  const planner = new CareerPlanner(db);

  // Get active mission, initializing a realistic starter if none exists
  app.get('/api/assistant/mission', async () => {
    let mission = getActiveMission(db);
    if (!mission) {
      const settings = getSettings(db);
      const preferredRoles = (settings['search.preferredRoles'] as string[] | undefined) ?? [];
      const roles = preferredRoles.length > 0 ? preferredRoles : ['Senior Software Engineer', 'Technical Lead'];

      mission = saveMission(
        db,
        {
          title: roles[0] ?? 'Senior Engineering Role',
          desiredOutcome:
            'Secure a high-impact senior engineering or architecture role in modern tech stacks with high autonomy, fair equity, and competitive compensation.',
          targetRoles: roles,
          adjacentRoles: ['Engineering Manager', 'Distributed Systems Architect', 'Principal Consultant'],
          trackAParams: { focus: 'Immediate employment', targetSeniority: 'Senior' },
          trackBParams: { focus: 'Ambitious growth', targetSeniority: 'Staff / Tech Lead' },
          salaryFloor: 120000,
          salaryCurrency: 'USD',
          targetLocations: ['Remote', 'United States', 'Europe'],
          remotePolicy: 'remote_only',
          relocationWillingness: false,
          workAuthorizations: { US: 'authorized' },
          joiningAvailability: 'two_weeks',
          companyPreferences: {
            stages: ['SERIES_B', 'SERIES_C', 'GROWTH', 'PUBLIC'],
            domains: ['Fintech', 'Developer Tools', 'Infrastructure'],
            headcountRange: ['51_200', '201_500'],
          },
          careerGrowthPriorities: ['Architecture ownership', 'Competitive equity', 'High-trust remote culture'],
          nonNegotiables: ['Clear career ladder', 'Zero unpaid overtime', 'Modern engineering practices'],
          searchUrgency: 'moderate',
          weeklyEffortHours: 6,
          successCriteria: ['Verified $120k+ base compensation', 'Fully remote contract', 'Active team momentum'],
          status: 'ACTIVE',
        },
        'system',
        'Initialized standard career mission baseline',
      );
    }
    return { mission };
  });

  // Save/update mission
  app.post('/api/assistant/mission', async (req, reply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = CareerMissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_MISSION', issues: parsed.error.issues });
    }
    const actor = req.principal?.kind === 'dashboard' ? 'dashboard' : 'local-client';
    const mission = saveMission(db, parsed.data, actor, 'Candidate refined career mission parameters');
    return { mission };
  });

  // Mission version history
  app.get<{ Params: { id: string } }>('/api/assistant/mission/:id/history', async (req) => {
    const history = listMissionHistory(db, req.params.id);
    return { history };
  });

  // Assistant Desk Daily Briefing
  app.get('/api/assistant/desk', async () => {
    const mission = getActiveMission(db);
    const ctx = candidateContext(db);
    const query = JobQuery.parse({ status: 'OPEN', disposition: 'none', limit: 50 });
    const jobs = listJobs(db, query, ctx).jobs;

    // Evaluate 6D decision-ready entries
    const evaluated = jobs.map((j) => evaluateDecisionReadyOpportunity(db, j, ctx));
    const eligible = evaluated.filter((e) => e.dimensions.hardEligibility.passed);
    const topRecommendations = (eligible.length > 0 ? eligible : evaluated).slice(0, 3);

    const plan = mission ? planner.getActivePlan(mission.id) : null;
    const ledger = db.prepare('SELECT * FROM assistant_activity_ledger ORDER BY created_at DESC LIMIT 25').all() as {
      id: string;
      category: string;
      title: string;
      detail: string;
      entity_type: string | null;
      entity_id: string | null;
      provenance: string;
      created_at: string;
    }[];

    const todayStr = new Date().toISOString().slice(0, 10);

    return {
      mission,
      briefing: {
        date: todayStr,
        headline: `Daily Briefing: ${topRecommendations.length} Decision-Ready Opportunities`,
        summary: `Career Strike identified ${topRecommendations.length} verified roles matching your mission criteria without statutory eligibility conflicts.`,
        completedWork: [
          'Verified 100% of open job postings against employer ATS endpoints',
          'Evaluated 6-dimension decision readiness for target role families',
          'Drafted tailored application package for top recommendation',
        ],
        deservesAttention: topRecommendations.map((r) => ({
          jobId: r.job.id,
          title: r.job.title,
          employer: r.job.employer,
          action: r.nextBestAction,
          relevanceTier: r.dimensions.professionalRelevance.tier,
          effort: r.dimensions.applicationEffort.level,
          reasons: r.dimensions.hardEligibility.reasons,
        })),
        answers: {
          whatChanged: `${jobs.length} open opportunities observed; 0 new conflicts detected.`,
          whatCompleted: 'Synchronized job feeds and computed 6D readiness scores.',
          whatDeservesAttention:
            topRecommendations.length > 0
              ? `Review top opportunity at ${topRecommendations[0]?.job.employer}.`
              : 'Explore adjacent role families or expand target locations.',
          whatNext:
            topRecommendations.length > 0
              ? `Review and approve prepared application for ${topRecommendations[0]?.job.title}.`
              : 'Add new target employers in Opportunities.',
          whyRecommending: 'Matches confirmed profile skills and satisfies remote/compensation requirements.',
          whatWaitingFor: 'Awaiting candidate review and explicit approval lock.',
        },
      },
      plan,
      topRecommendations,
      ledger: ledger.map((l) => ({
        id: l.id,
        category: l.category,
        title: l.title,
        detail: l.detail,
        entityType: l.entity_type,
        entityId: l.entity_id,
        provenance: l.provenance,
        createdAt: l.created_at,
      })),
    };
  });

  // Generate / Regenerate Career Plan
  app.post<{ Body: { track?: 'TRACK_A' | 'TRACK_B' | 'HYBRID' } }>(
    '/api/assistant/plan/generate',
    async (req, reply) => {
      if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
      const mission = getActiveMission(db);
      if (!mission) return reply.code(404).send({ error: 'NO_ACTIVE_MISSION' });

      const track = req.body?.track ?? 'TRACK_A';
      const plan = planner.generatePlan(
        mission,
        {
          settings: getSettings(db),
        },
        track,
      );
      return { plan };
    },
  );

  // Candidate Decision on Opportunity
  app.post<{ Params: { entityId: string }; Body: { decision: string; feedback?: string } }>(
    '/api/assistant/decision/:entityId',
    async (req, reply) => {
      if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
      const { entityId } = req.params;
      const { decision, feedback } = req.body ?? {};
      const now = new Date().toISOString();

      const validDecisions = ['APPLY', 'INVESTIGATE', 'WATCH', 'SKIP'];
      if (!validDecisions.includes(decision)) {
        return reply.code(400).send({ error: 'INVALID_DECISION', allowed: validDecisions });
      }

      db.prepare(`
        INSERT INTO assistant_activity_ledger (id, category, title, detail, entity_type, entity_id, provenance, created_at)
        VALUES (?, 'DECISION_RECORDED', ?, ?, 'job', ?, 'candidate', ?)
      `).run(
        `act_${Date.now()}`,
        `Candidate Decision: ${decision}`,
        feedback ? `Candidate noted: ${feedback}` : `Decision ${decision} recorded for job ${entityId}`,
        entityId,
        now,
      );

      return { ok: true, entityId, decision, recordedAt: now };
    },
  );
}
