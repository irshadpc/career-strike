import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { type Company360Profile, getCompany360 } from '../markets/company-intelligence.js';
import { listCompanyRegistry } from '../markets/company-registry.js';
import type { Db } from '../store/db.js';
import { candidateContext } from './context.js';
import { JobQuery, type JobSummary, listJobs } from './jobs.js';

export type CollectionRuleKind =
  | 'AI_EMERGING'
  | 'FINTECH_PAYMENTS'
  | 'HIGH_GROWTH'
  | 'INTERNATIONAL_EMPLOYERS'
  | 'REMOTE_FIRST'
  | 'PRODUCT_HIRERS'
  | 'QA_AND_OPERATIONS'
  | 'EARLY_CAREER'
  | 'CUSTOM_FILTER';

export interface CareerCollectionSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  badge: string;
  ruleKind: CollectionRuleKind;
  isCustom: boolean;
  explanation: string;
  companyCount: number;
  openRolesCount: number;
  lastRefreshedAt: string;
}

export interface CareerCollectionDetail extends CareerCollectionSummary {
  companies: Company360Profile[];
  sampleRoles: JobSummary[];
}

interface CollectionRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  rule_kind: CollectionRuleKind;
  rule_filter_json: string;
  badge: string;
  is_custom: number;
  created_at: string;
  updated_at: string;
}

export const SYSTEM_COLLECTIONS: readonly {
  slug: string;
  title: string;
  description: string;
  badge: string;
  ruleKind: CollectionRuleKind;
  explanation: string;
}[] = [
  {
    slug: 'emerging-ai-companies',
    title: 'Emerging AI & Foundation Model Companies',
    description:
      'Companies building, training, or deploying foundation models, machine learning systems, or generative AI infrastructure.',
    badge: 'AI & ML',
    ruleKind: 'AI_EMERGING',
    explanation:
      'Selected based on verified industry or product domain in AI/Machine Learning, or active postings requiring PyTorch, CUDA, LLM, or Foundation Models.',
  },
  {
    slug: 'fintech-and-payments',
    title: 'Fintech & Payment Infrastructure',
    description:
      'Organizations engineering ledger systems, payment rails, banking integrations, and financial software.',
    badge: 'Fintech',
    ruleKind: 'FINTECH_PAYMENTS',
    explanation:
      'Selected based on verified fintech/payments product domain or active postings explicitly in billing, checkout, payments, or ledger infrastructure.',
  },
  {
    slug: 'high-growth-startups',
    title: 'High-Growth & Expanding Startups',
    description:
      'Early- to growth-stage startups (Series A through Growth) with active hiring momentum verified in this workspace.',
    badge: 'High Growth',
    ruleKind: 'HIGH_GROWTH',
    explanation:
      'Selected based on Seed to Growth stage with verified open roles or active hiring momentum observed within the freshness window.',
  },
  {
    slug: 'remote-first-employers',
    title: 'Remote-First & Distributed Workplaces',
    description: 'Employers where the majority of verified postings support remote work arrangements.',
    badge: 'Remote First',
    ruleKind: 'REMOTE_FIRST',
    explanation:
      'Selected based on having verified open roles where at least 50% explicitly designate remote or hybrid-flexible work policies.',
  },
  {
    slug: 'product-management-hirers',
    title: 'Companies Actively Hiring Product Leaders',
    description:
      'Organizations with confirmed, current openings in product management, technical product ownership, or product leadership.',
    badge: 'Product',
    ruleKind: 'PRODUCT_HIRERS',
    explanation:
      'Selected based on verified open postings matching Product Manager, Technical PM, Head of Product, or VP Product.',
  },
  {
    slug: 'qa-and-it-operations',
    title: 'QA, Reliability & IT Operations Hirers',
    description:
      'Companies currently recruiting quality engineers, SDETs, site reliability engineers, and DevOps/IT operators.',
    badge: 'QA & Ops',
    ruleKind: 'QA_AND_OPERATIONS',
    explanation:
      'Selected based on verified open postings matching QA, SDET, Test Engineering, Site Reliability, DevOps, or Infrastructure Operations.',
  },
  {
    slug: 'early-career-opportunities',
    title: 'Early-Career & High-Growth Entry Points',
    description: 'Roles requiring 0–2 years of experience, associate titles, or explicit entry-level requirements.',
    badge: 'Early Career',
    ruleKind: 'EARLY_CAREER',
    explanation:
      'Selected based on explicit posting requirements specifying 2 or fewer years of experience or junior/associate designations.',
  },
  {
    slug: 'international-employers',
    title: 'International & Cross-Border Employers',
    description:
      'Employers with confirmed vacancies in multiple countries or verified global work authorization support.',
    badge: 'Global',
    ruleKind: 'INTERNATIONAL_EMPLOYERS',
    explanation:
      'Selected based on active openings spanning 2 or more distinct country markets or explicit visa sponsorship support.',
  },
];

export function initCollections(db: Db, now = new Date()): void {
  const at = now.toISOString();
  db.transaction(() => {
    for (const sys of SYSTEM_COLLECTIONS) {
      const existing = db.prepare('SELECT id FROM curated_collections WHERE slug = ?').get(sys.slug);
      if (!existing) {
        const id = `col_${sys.slug.replace(/[^a-z0-9]+/g, '_')}`;
        db.prepare(
          `INSERT INTO curated_collections (id, slug, title, description, rule_kind, rule_filter_json, badge, is_custom, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '{}', ?, 0, ?, ?)`,
        ).run(id, sys.slug, sys.title, sys.description, sys.ruleKind, sys.badge, at, at);
      }
    }
  })();
}

const AI_KEYWORDS =
  /\b(ai|artificial intelligence|machine learning|deep learning|llm|generative ai|pytorch|tensorflow|cuda|nlp|cv|transformer)\b/i;
const FINTECH_KEYWORDS =
  /\b(fintech|payments|payment|banking|ledger|billing|checkout|crypto|trading|securities|invoicing)\b/i;
const PRODUCT_KEYWORDS =
  /\b(product manager|product lead|head of product|director of product|vp product|technical product manager)\b/i;
const QA_OPS_KEYWORDS =
  /\b(qa|quality assurance|sdet|test engineer|sre|site reliability|devops|platform engineer|infrastructure engineer|systems administrator)\b/i;
const EARLY_KEYWORDS = /\b(junior|associate|entry level|graduate|intern|internship|early career)\b/i;

function matchesRule(
  ruleKind: CollectionRuleKind,
  filter: Record<string, unknown>,
  company: Company360Profile,
  companyJobs: JobSummary[],
): boolean {
  switch (ruleKind) {
    case 'AI_EMERGING': {
      const industryMatch =
        AI_KEYWORDS.test(company.industry?.value ?? '') || AI_KEYWORDS.test(company.productDomain?.value ?? '');
      const techStackMatch = company.techStack.value.some((t) => AI_KEYWORDS.test(t));
      const jobsMatch = companyJobs.some((j) => AI_KEYWORDS.test(j.title));
      return industryMatch || techStackMatch || jobsMatch;
    }
    case 'FINTECH_PAYMENTS': {
      const industryMatch =
        FINTECH_KEYWORDS.test(company.industry?.value ?? '') ||
        FINTECH_KEYWORDS.test(company.productDomain?.value ?? '');
      const jobsMatch = companyJobs.some((j) => FINTECH_KEYWORDS.test(j.title));
      return industryMatch || jobsMatch;
    }
    case 'HIGH_GROWTH': {
      const isGrowthStage = ['SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'GROWTH'].includes(company.stage.value);
      const isSurgingOrActive = company.momentum.trend === 'SURGING' || company.momentum.trend === 'ACTIVE';
      return (isGrowthStage && company.openRolesCount > 0) || isSurgingOrActive;
    }
    case 'REMOTE_FIRST': {
      if (companyJobs.length === 0) return false;
      const remoteJobs = companyJobs.filter((j) => j.remotePolicy === 'remote' || j.remotePolicy === 'hybrid');
      return remoteJobs.length / companyJobs.length >= 0.5;
    }
    case 'PRODUCT_HIRERS': {
      return companyJobs.some((j) => PRODUCT_KEYWORDS.test(j.title));
    }
    case 'QA_AND_OPERATIONS': {
      return companyJobs.some((j) => QA_OPS_KEYWORDS.test(j.title));
    }
    case 'EARLY_CAREER': {
      return companyJobs.some((j) => EARLY_KEYWORDS.test(j.title));
    }
    case 'INTERNATIONAL_EMPLOYERS': {
      const countries = new Set<string>();
      for (const j of companyJobs) {
        if (j.market?.location.countryCode) countries.add(j.market.location.countryCode);
      }
      return countries.size >= 2;
    }
    case 'CUSTOM_FILTER': {
      const q = typeof filter.query === 'string' ? filter.query.trim().toLowerCase() : null;
      if (q) {
        const matchesCompany =
          company.name.toLowerCase().includes(q) || (company.industry?.value ?? '').toLowerCase().includes(q);
        const matchesJob = companyJobs.some((j) => j.title.toLowerCase().includes(q));
        if (!matchesCompany && !matchesJob) return false;
      }
      if (typeof filter.stage === 'string' && company.stage.value !== filter.stage) return false;
      return true;
    }
    default:
      return false;
  }
}

export function listCuratedCollections(db: Db, now = new Date()): CareerCollectionSummary[] {
  initCollections(db, now);
  const rows = db.prepare('SELECT * FROM curated_collections ORDER BY is_custom ASC, id ASC').all() as CollectionRow[];
  const registry = listCompanyRegistry(db, {}, now);
  const allJobs = listJobs(
    db,
    JobQuery.parse({ status: 'OPEN', limit: 200 }),
    candidateContext(db),
    now.getTime(),
  ).jobs;

  const jobsByEmployer = new Map<string, JobSummary[]>();
  for (const j of allJobs) {
    const key = j.employer.toLowerCase();
    const arr = jobsByEmployer.get(key) ?? [];
    arr.push(j);
    jobsByEmployer.set(key, arr);
  }

  // Compute Company360 once per company instead of re-querying across every collection
  const profileCache = new Map<string, Company360Profile>();
  for (const comp of registry) {
    const p360 = getCompany360(db, comp.id, now);
    if (p360) profileCache.set(comp.id, p360);
  }

  return rows.map((row) => {
    let filter: Record<string, unknown> = {};
    try {
      filter = JSON.parse(row.rule_filter_json);
    } catch {
      filter = {};
    }

    let matchingCompaniesCount = 0;
    let matchingOpenRolesCount = 0;

    for (const comp of registry) {
      const p360 = profileCache.get(comp.id);
      if (!p360) continue;
      const companyJobs = jobsByEmployer.get(comp.name.toLowerCase()) ?? [];
      if (matchesRule(row.rule_kind, filter, p360, companyJobs)) {
        matchingCompaniesCount += 1;
        matchingOpenRolesCount += companyJobs.length;
      }
    }

    const sys = SYSTEM_COLLECTIONS.find((s) => s.slug === row.slug);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      badge: row.badge,
      ruleKind: row.rule_kind,
      isCustom: Boolean(row.is_custom),
      explanation: sys?.explanation ?? 'Candidate-defined custom collection rule.',
      companyCount: matchingCompaniesCount,
      openRolesCount: matchingOpenRolesCount,
      lastRefreshedAt: row.updated_at,
    };
  });
}

export function getCuratedCollection(db: Db, slugOrId: string, now = new Date()): CareerCollectionDetail | null {
  initCollections(db, now);
  const row = db.prepare('SELECT * FROM curated_collections WHERE slug = ? OR id = ?').get(slugOrId, slugOrId) as
    | CollectionRow
    | undefined;
  if (!row) return null;

  let filter: Record<string, unknown> = {};
  try {
    filter = JSON.parse(row.rule_filter_json);
  } catch {
    filter = {};
  }

  const registry = listCompanyRegistry(db, {}, now);
  const allJobs = listJobs(
    db,
    JobQuery.parse({ status: 'OPEN', limit: 200 }),
    candidateContext(db),
    now.getTime(),
  ).jobs;

  const jobsByEmployer = new Map<string, JobSummary[]>();
  for (const j of allJobs) {
    const key = j.employer.toLowerCase();
    const arr = jobsByEmployer.get(key) ?? [];
    arr.push(j);
    jobsByEmployer.set(key, arr);
  }

  const matchedCompanies: Company360Profile[] = [];
  const matchedRoles: JobSummary[] = [];

  for (const comp of registry) {
    const companyJobs = jobsByEmployer.get(comp.name.toLowerCase()) ?? [];
    const p360 = getCompany360(db, comp.id, now);
    if (!p360) continue;
    if (matchesRule(row.rule_kind, filter, p360, companyJobs)) {
      matchedCompanies.push(p360);
      matchedRoles.push(...companyJobs);
    }
  }

  const sys = SYSTEM_COLLECTIONS.find((s) => s.slug === row.slug);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    badge: row.badge,
    ruleKind: row.rule_kind,
    isCustom: Boolean(row.is_custom),
    explanation: sys?.explanation ?? 'Candidate-defined custom collection rule.',
    companyCount: matchedCompanies.length,
    openRolesCount: matchedRoles.length,
    lastRefreshedAt: row.updated_at,
    companies: matchedCompanies,
    sampleRoles: matchedRoles.slice(0, 20),
  };
}

export const CustomCollectionInput = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(100),
    description: z.string().trim().max(300).default(''),
    badge: z.string().trim().max(30).default('Custom'),
    query: z.string().trim().max(100).optional(),
    stage: z
      .enum(['SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'GROWTH', 'PUBLIC', 'BOOTSTRAPPED', 'UNKNOWN'])
      .optional(),
  })
  .strict();

export function createCustomCollection(
  db: Db,
  input: z.infer<typeof CustomCollectionInput>,
  now = new Date(),
): CareerCollectionSummary {
  const at = now.toISOString();
  const slug = `custom-${input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${randomBytes(4).toString('hex')}`;
  const id = `col_${randomBytes(8).toString('hex')}`;
  const filterJson = JSON.stringify({ query: input.query, stage: input.stage });

  db.prepare(
    `INSERT INTO curated_collections (id, slug, title, description, rule_kind, rule_filter_json, badge, is_custom, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'CUSTOM_FILTER', ?, ?, 1, ?, ?)`,
  ).run(id, slug, input.title, input.description, filterJson, input.badge, at, at);

  return {
    id,
    slug,
    title: input.title,
    description: input.description,
    badge: input.badge,
    ruleKind: 'CUSTOM_FILTER',
    isCustom: true,
    explanation:
      `Custom collection filtering by: ${input.query ? `query "${input.query}"` : ''} ${input.stage ? `stage "${input.stage}"` : ''}`.trim(),
    companyCount: 0,
    openRolesCount: 0,
    lastRefreshedAt: at,
  };
}
