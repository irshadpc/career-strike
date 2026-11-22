import { randomBytes } from 'node:crypto';
import type { Db } from '../store/db.js';

export interface GeneratedOnboardingPlan {
  days30: string;
  days60: string;
  days90: string;
  stakeholders: string;
  questions: string;
}

export interface SeededHiredPlan {
  id: string;
  applicationId: string;
  jobTitle: string;
  company: string;
  plan: GeneratedOnboardingPlan;
  createdAt: string;
}

/**
 * Extracts key domain themes and skills from a job description text.
 */
function extractJobThemes(descriptionText: string): string[] {
  const commonKeywords = [
    'architecture',
    'distributed systems',
    'scalability',
    'security',
    'payments',
    'reliability',
    'observability',
    'microservices',
    'cloud',
    'data pipelines',
    'ci/cd',
    'developer experience',
    'compliance',
    'performance',
    'mentorship',
    'collaboration',
  ];
  const found: string[] = [];
  const textLower = descriptionText.toLowerCase();
  for (const kw of commonKeywords) {
    if (textLower.includes(kw)) {
      found.push(kw);
    }
  }
  return found.slice(0, 5);
}

/**
 * Auto-generates a structured 30-60-90 plan, stakeholder map, and week-1 questions
 * directly from the job description and interview debrief notes.
 */
export function generateOnboardingFromJob(
  job: { title: string; employer: string; descriptionText?: string },
  interviewNotes: string[] = [],
): GeneratedOnboardingPlan {
  const themes = extractJobThemes(job.descriptionText ?? '');
  const themesSummary = themes.length > 0 ? themes.join(', ') : 'core product delivery';

  const notesSummary =
    interviewNotes.length > 0
      ? `\nInterview Debrief Focal Points:\n${interviewNotes.map((n) => `• ${n}`).join('\n')}`
      : '';

  const days30 = [
    `Assimilate & Map the Landscape:`,
    `• Configure local development environment, build tools, and access permissions within week 1.`,
    `• Ship first minor fix/PR to production within the first two weeks to validate deployment pipeline.`,
    `• Complete deep-dive into system architecture, data models, and team domain (${themesSummary}).`,
    `• Conduct 1:1 discovery chats with team members to learn unwritten team norms and pain points.`,
    `• Review production monitoring, alerts, and recent post-mortems for current failure modes.`,
    notesSummary,
  ]
    .filter(Boolean)
    .join('\n');

  const days60 = [
    `Contribute & Build Velocity:`,
    `• Take full technical ownership of your first medium-sized feature or service enhancement.`,
    `• Actively participate in sprint ceremonies, RFC reviews, and peer code reviews.`,
    `• Begin taking part in on-call rotation or production support triage alongside a primary buddy.`,
    `• Identify 1-2 architectural or testing friction points in the codebase and draft a remediation plan.`,
    `• Sync with cross-functional partners (Product/Design) to align on upcoming quarterly deliverables.`,
  ].join('\n');

  const days90 = [
    `Own & Elevate the Team:`,
    `• Lead technical design and implementation for a major quarterly deliverable end-to-end.`,
    `• Implement the system improvement identified during the first 60 days to reduce technical debt.`,
    `• Propose long-term architectural or process enhancements to elevate team development velocity.`,
    `• Conduct 90-day review with your manager; calibrate expectations and outline promotion brag milestones.`,
  ].join('\n');

  const stakeholders = [
    `[ ] Hiring Manager — Weekly 1:1s, priority calibration, and performance feedback.`,
    `[ ] Tech Lead / Principal Engineer — Architecture reviews, design RFCs, engineering best practices.`,
    `[ ] Direct Team Peers — Daily standup, pair programming, PR reviews, knowledge sharing.`,
    `[ ] Product Manager — User requirements, roadmap milestones, feature prioritization.`,
    `[ ] SRE / DevOps Partner — Deployment automations, incident post-mortems, observability standards.`,
    `[ ] Security / Compliance Partner — Auth requirements, audit policies, data privacy standards.`,
  ].join('\n');

  const questions = [
    `1. What does outstanding performance look like for this role in the first 90 days?`,
    `2. What is the single biggest bottleneck slowing down the team's release velocity today?`,
    `3. Which systems or services have the highest operational risk or lack documentation?`,
    `4. Who outside our immediate team will I collaborate with most frequently?`,
    `5. What is the team's expectation around on-call escalations and incident response?`,
  ].join('\n');

  return {
    days30,
    days60,
    days90,
    stakeholders,
    questions,
  };
}

/**
 * Seeds Hired Mode when an offer is marked accepted for a job application.
 */
export function seedHiredModeFromWonJob(db: Db, applicationId: string): SeededHiredPlan {
  const app = db
    .prepare(
      `SELECT a.id, a.job_id, j.title, j.employer, j.description_text
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE a.id = ?`,
    )
    .get(applicationId) as
    | {
        id: string;
        job_id: string;
        title: string;
        employer: string;
        description_text: string | null;
      }
    | undefined;

  if (!app) {
    throw new Error(`Application ${applicationId} not found`);
  }

  // Fetch interview notes for this application
  const interviewRows = db
    .prepare('SELECT stage, notes FROM interviews WHERE application_id = ? AND notes IS NOT NULL')
    .all(applicationId) as { stage: string; notes: string }[];

  const notes = interviewRows.map((r) => `[${r.stage}] ${r.notes.trim()}`);
  const plan = generateOnboardingFromJob(
    {
      title: app.title,
      employer: app.employer,
      descriptionText: app.description_text ?? '',
    },
    notes,
  );

  const planId = `plan_${randomBytes(8).toString('base64url')}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO onboarding_plans (id, application_id, job_title, company, plan_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(planId, app.id, app.title, app.employer, JSON.stringify(plan), now);

  return {
    id: planId,
    applicationId: app.id,
    jobTitle: app.title,
    company: app.employer,
    plan,
    createdAt: now,
  };
}
