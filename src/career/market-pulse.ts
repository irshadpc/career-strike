import type { Db } from '../store/db.js';

export interface MarketPulseSkillCount {
  skill: string;
  count: number;
  percentage: number;
}

export interface MarketPulseDistributionItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface CareerMarketPulseReport {
  generatedAt: string;
  sampleSummary: {
    totalObservedPostings: number;
    activeOpenPostings: number;
    monitoredEmployers: number;
  };
  remotePolicyDistribution: MarketPulseDistributionItem[];
  topSkillsDemand: MarketPulseSkillCount[];
  topJobTitles: { title: string; count: number }[];
  countryDistribution: MarketPulseDistributionItem[];
  salaryTransparency: {
    disclosedCount: number;
    undisclosedCount: number;
    disclosurePercentage: number;
  };
  hiringVelocity: {
    openedLast14Days: number;
    closedLast14Days: number;
    netChange: number;
  };
  methodologyAndLimitations: {
    sourcePopulation: string;
    collectionMethod: string;
    timeWindow: string;
    samplingLimitations: string;
  };
}

interface RawJobRow {
  id: string;
  employer: string;
  title: string;
  remote_policy: string;
  status: string;
  salary_json: string | null;
  requirements_json: string;
  first_seen_at: string;
  last_seen_at: string;
  closed_at: string | null;
  market_json: string;
}

export function computeCareerMarketPulse(db: Db, now = new Date()): CareerMarketPulseReport {
  const at = now.toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  const rows = db
    .prepare(
      'SELECT id, employer, title, remote_policy, status, salary_json, requirements_json, first_seen_at, last_seen_at, closed_at, market_json FROM jobs',
    )
    .all() as RawJobRow[];

  const monitoredEmployers = (db.prepare('SELECT COUNT(DISTINCT employer) FROM jobs').pluck().get() as number) ?? 0;

  const total = rows.length;
  const active = rows.filter((r) => r.status === 'OPEN').length;

  // Remote distribution
  const remoteCounts: Record<string, number> = { remote: 0, hybrid: 0, onsite: 0, unknown: 0 };
  for (const r of rows) {
    const key = r.remote_policy in remoteCounts ? r.remote_policy : 'unknown';
    remoteCounts[key] = (remoteCounts[key] ?? 0) + 1;
  }
  const remoteLabels: Record<string, string> = {
    remote: 'Remote',
    hybrid: 'Hybrid',
    onsite: 'On-site',
    unknown: 'Not Specified',
  };
  const remoteDistribution: MarketPulseDistributionItem[] = Object.entries(remoteCounts).map(([key, count]) => ({
    key,
    label: remoteLabels[key] ?? key,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  // Skills aggregation
  const skillFreq = new Map<string, number>();
  for (const r of rows) {
    try {
      const req = JSON.parse(r.requirements_json) as { skills?: { skill?: string }[] };
      if (Array.isArray(req.skills)) {
        for (const item of req.skills) {
          if (item.skill) {
            const normSkill = item.skill.trim();
            skillFreq.set(normSkill, (skillFreq.get(normSkill) ?? 0) + 1);
          }
        }
      }
    } catch {
      // Ignored
    }
  }

  const topSkillsDemand: MarketPulseSkillCount[] = [...skillFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({
      skill,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

  // Titles aggregation
  const titleFreq = new Map<string, number>();
  for (const r of rows) {
    titleFreq.set(r.title, (titleFreq.get(r.title) ?? 0) + 1);
  }
  const topJobTitles = [...titleFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([title, count]) => ({ title, count }));

  // Country distribution
  const countryFreq = new Map<string, number>();
  for (const r of rows) {
    try {
      const m = JSON.parse(r.market_json) as { location?: { countryCode?: string } };
      const code = m.location?.countryCode ?? 'GLOBAL_OR_UNSPECIFIED';
      countryFreq.set(code, (countryFreq.get(code) ?? 0) + 1);
    } catch {
      countryFreq.set('GLOBAL_OR_UNSPECIFIED', (countryFreq.get('GLOBAL_OR_UNSPECIFIED') ?? 0) + 1);
    }
  }

  const countryDistribution: MarketPulseDistributionItem[] = [...countryFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, count]) => ({
      key,
      label: key === 'GLOBAL_OR_UNSPECIFIED' ? 'Global / Unspecified' : key,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

  // Salary disclosure
  const disclosed = rows.filter((r) => r.salary_json !== null).length;
  const salaryTransparency = {
    disclosedCount: disclosed,
    undisclosedCount: total - disclosed,
    disclosurePercentage: total > 0 ? Math.round((disclosed / total) * 100) : 0,
  };

  // Hiring velocity
  const openedLast14Days = rows.filter((r) => r.first_seen_at >= fourteenDaysAgo).length;
  const closedLast14Days = rows.filter((r) => r.closed_at && r.closed_at >= fourteenDaysAgo).length;

  return {
    generatedAt: at,
    sampleSummary: {
      totalObservedPostings: total,
      activeOpenPostings: active,
      monitoredEmployers,
    },
    remotePolicyDistribution: remoteDistribution,
    topSkillsDemand,
    topJobTitles,
    countryDistribution,
    salaryTransparency,
    hiringVelocity: {
      openedLast14Days,
      closedLast14Days,
      netChange: openedLast14Days - closedLast14Days,
    },
    methodologyAndLimitations: {
      sourcePopulation: `Locally held sample of ${total} public job postings across ${monitoredEmployers} distinct employers retrieved into this workspace.`,
      collectionMethod:
        'Direct automated retrieval from public Greenhouse, Lever, and Ashby employer career endpoints.',
      timeWindow: 'Cumulative observations recorded up to the current generation timestamp.',
      samplingLimitations:
        'This pulse report reflects only opportunities actively monitored in your Career Strike workspace. It is NOT a representative sample of the total global or national labor market, and posting volume fluctuations must not be interpreted as macroeconomic trends.',
    },
  };
}
