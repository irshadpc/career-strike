export interface Rate {
  numerator: number;
  n: number;
  rate: number | null;
}

export interface CampaignWeekSummary {
  weekStart: string;
  discovered: number;
  shortlisted: number;
  submitted: number;
  responses: number;
  interviews: number;
}

export interface Proposal {
  id: string;
  rule: string;
  title: string;
  rationale: string;
  status: 'OPEN' | 'ACCEPTED' | 'DISMISSED' | 'REJECTED' | 'EDITED' | 'SNOOZED';
  snoozedUntil: string | null;
  decidedAt: string | null;
  action: { type: string; hours?: string; role?: string; skill?: string };
  editedAction: { type: string; hours?: string; role?: string; skill?: string } | null;
  effectiveAction: { type: string; hours?: string; role?: string; skill?: string };
  decisions: {
    id: number;
    decision: 'ACCEPT' | 'REJECT' | 'DISMISS' | 'EDIT' | 'SNOOZE' | 'UNDO';
    actor: string;
    at: string;
  }[];
}

export interface Strategy {
  minSample: number;
  metrics: {
    totals: {
      found: number;
      shortlisted: number;
      submitted: number;
      responses: number;
      interviews: number;
      offers: number;
      rejections: number;
    };
    responseRate: Rate;
    interviewRate: Rate;
    bySource: {
      source: string;
      found: number;
      closedOrStale: Rate;
      shortlisted: number;
      submitted: number;
      responded: Rate;
      interviewed: Rate;
    }[];
    daysToFirstResponse: { median: number | null; n: number };
    submittedPerWeek: { weekStart: string; count: number }[];
    campaignSummaries: CampaignWeekSummary[];
    recurringGaps: { skill: string; jobs: number }[];
    discoveryHealth: { monitored: number; healthy: number; degraded: number; notFound: number; neverRun: number };
  };
  observations: { kind: string; text: string }[];
  proposals: Proposal[];
  history: { day: string; totals: { submitted: number; responses: number; interviews: number } }[];
}

/** A rate is never shown without its sample size. */
export function showRate(r: Rate): string {
  return r.n === 0 ? 'no data (n=0)' : `${r.numerator} of ${r.n} (${Math.round((r.rate ?? 0) * 100)}%)`;
}
