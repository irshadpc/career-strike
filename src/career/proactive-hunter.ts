import { listCompanyRegistry } from '../markets/company-registry.js';
import { type DecisionReadyShortlistEntry, evaluateDecisionReadyOpportunity } from '../matching/shortlist.js';
import type { Db } from '../store/db.js';
import type { CandidateContext } from './context.js';
import { JobQuery, listJobs } from './jobs.js';
import type { CareerMission } from './mission.js';

export interface HunterCandidateMatch {
  employerId: string;
  employerName: string;
  targetRole: string;
  track: 'TRACK_A' | 'TRACK_B';
  careersUrl: string | null;
  supportedAts: string | null;
  entry: DecisionReadyShortlistEntry;
  priorityScore: number;
}

export interface ProactiveHuntResult {
  observedAt: string;
  totalCandidateMatches: number;
  recommendations: HunterCandidateMatch[];
  discoveredEmployersCount: number;
  unresolvedUncertainties: string[];
}

export class ProactiveOpportunityHunter {
  constructor(private readonly db: Db) {}

  /**
   * Proactively evaluates verified openings and registered employer targets matching the candidate's mission.
   * Respects source permissions, prevents CAPTCHA bypass, and avoids guessing vacancies.
   */
  hunt(mission: CareerMission, ctx: CandidateContext): ProactiveHuntResult {
    const now = new Date();
    const observedAt = now.toISOString();
    const uncertainties: string[] = [];

    // 1. Gather all currently verified open jobs
    const openJobs = listJobs(this.db, JobQuery.parse({ status: 'OPEN', disposition: 'none', limit: 200 }), ctx).jobs;

    // 2. Query company registry for relevant employers matching mission sectors or preferred stages
    const allCompanies = listCompanyRegistry(this.db, { limit: 100 });
    const targetRolesLower = mission.targetRoles.map((r) => r.toLowerCase());
    const adjacentRolesLower = mission.adjacentRoles.map((r) => r.toLowerCase());

    const matches: HunterCandidateMatch[] = [];

    for (const job of openJobs) {
      const titleLower = job.title.toLowerCase();
      const isTrackA = targetRolesLower.some((t) => titleLower.includes(t) || t.includes(titleLower));
      const isTrackB = adjacentRolesLower.some((t) => titleLower.includes(t) || t.includes(titleLower));

      if (!isTrackA && !isTrackB) continue;

      const track = isTrackA ? 'TRACK_A' : 'TRACK_B';
      const evaluated = evaluateDecisionReadyOpportunity(this.db, job, ctx, now);

      // We only surface opportunities that do not have critical hard eligibility failures
      if (!evaluated.dimensions.hardEligibility.passed) {
        continue;
      }

      // Check employer details from registry
      const company = allCompanies.find((c) => c.name.toLowerCase() === job.employer.toLowerCase());

      let priorityScore = 10;
      if (track === 'TRACK_A') priorityScore += 20;
      if (evaluated.dimensions.professionalRelevance.tier === 'strong') priorityScore += 30;
      else if (evaluated.dimensions.professionalRelevance.tier === 'possible') priorityScore += 15;
      else if (evaluated.dimensions.professionalRelevance.tier === 'stretch') priorityScore += 5;

      if (evaluated.dimensions.candidatePreferences.remoteFit === 'preferred') priorityScore += 10;
      if (evaluated.dimensions.companyContext.isWatched) priorityScore += 25;
      if (evaluated.dimensions.companyContext.momentumTrend === 'SURGING') priorityScore += 15;

      matches.push({
        employerId: company?.id ?? job.employer,
        employerName: job.employer,
        targetRole: job.title,
        track,
        careersUrl: company?.careersUrl ?? null,
        supportedAts: job.sources[0] ?? null,
        entry: evaluated,
        priorityScore,
      });
    }

    // Sort by priorityScore descending
    matches.sort((a, b) => b.priorityScore - a.priorityScore);

    if (matches.length === 0 && openJobs.length > 0) {
      uncertainties.push(
        'Open jobs observed locally do not match your exact target role keywords. Explore adjacent role families.',
      );
    }

    return {
      observedAt,
      totalCandidateMatches: matches.length,
      recommendations: matches.slice(0, 5),
      discoveredEmployersCount: allCompanies.length,
      unresolvedUncertainties: uncertainties,
    };
  }
}
