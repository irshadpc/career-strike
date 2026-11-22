import { calculateSemanticScore } from '../matching/embeddings-worker.js';
import type { Db } from '../store/db.js';

/**
 * Three-Tier Local-First Alignment Engine (blueprint: Section 3).
 *
 * Tier 1: Exact Lexical & Boolean Gate (Must-Have vs. Preferred)
 * Tier 2: Local Skills Taxonomy & Synonym Normalization (ESCO / O*NET / Curated Aliases)
 * Tier 3: Contextual Semantic Alignment
 *
 * Output: Ashby-style Evidence Rubric + Counterfactual Priority Queue (Top 3 marginal lifts).
 */

export interface AlignmentRequirement {
  id: string;
  term: string;
  category: 'must-have' | 'preferred';
  status: 'MEETS_EXACT' | 'MEETS_SYNONYM' | 'PARTIAL_SEMANTIC' | 'GAP';
  matchedResumeText: string | null;
  canonicalSkill: string | null;
  aliasUsed: string | null;
}

export interface CounterfactualFix {
  action: string;
  marginalLiftPercent: number;
  explanation: string;
  targetRequirement: string;
}

export interface AlignmentResult {
  mustHaveScore: number; // 0..100
  preferredScore: number; // 0..100
  compositeScore: number; // 0..100
  isTopFit: boolean; // Satisfies all must-haves
  rubric: AlignmentRequirement[];
  counterfactualFixes: CounterfactualFix[];
  summary: string;
}

interface TaxonomySkill {
  canonicalId: string;
  preferredLabel: string;
  source: 'esco' | 'onet' | 'curated';
  category: string;
  aliases: string[];
}

const CURATED_SEED_SKILLS: readonly TaxonomySkill[] = [
  {
    canonicalId: 'curated:typescript',
    preferredLabel: 'TypeScript',
    source: 'curated',
    category: 'Programming Languages',
    aliases: ['ts', 'typescript'],
  },
  {
    canonicalId: 'curated:javascript',
    preferredLabel: 'JavaScript',
    source: 'curated',
    category: 'Programming Languages',
    aliases: ['js', 'javascript', 'es6', 'ecmascript'],
  },
  {
    canonicalId: 'curated:python',
    preferredLabel: 'Python',
    source: 'curated',
    category: 'Programming Languages',
    aliases: ['py', 'python3', 'python'],
  },
  {
    canonicalId: 'curated:golang',
    preferredLabel: 'Go',
    source: 'curated',
    category: 'Programming Languages',
    aliases: ['golang', 'go lang', 'go'],
  },
  {
    canonicalId: 'curated:rust',
    preferredLabel: 'Rust',
    source: 'curated',
    category: 'Programming Languages',
    aliases: ['rust-lang', 'rust'],
  },
  {
    canonicalId: 'curated:react',
    preferredLabel: 'React',
    source: 'curated',
    category: 'Frontend Frameworks',
    aliases: ['reactjs', 'react.js', 'react'],
  },
  {
    canonicalId: 'curated:nodejs',
    preferredLabel: 'Node.js',
    source: 'curated',
    category: 'Backend Runtimes',
    aliases: ['node', 'nodejs', 'node.js'],
  },
  {
    canonicalId: 'curated:kubernetes',
    preferredLabel: 'Kubernetes',
    source: 'curated',
    category: 'Infrastructure & DevOps',
    aliases: ['k8s', 'kube', 'kubernetes', 'container orchestration'],
  },
  {
    canonicalId: 'curated:docker',
    preferredLabel: 'Docker',
    source: 'curated',
    category: 'Infrastructure & DevOps',
    aliases: ['containerization', 'containers', 'dockerfile', 'docker'],
  },
  {
    canonicalId: 'curated:postgresql',
    preferredLabel: 'PostgreSQL',
    source: 'curated',
    category: 'Databases',
    aliases: ['postgres', 'psql', 'postgresql'],
  },
  {
    canonicalId: 'curated:aws',
    preferredLabel: 'AWS',
    source: 'curated',
    category: 'Cloud Providers',
    aliases: ['amazon web services', 'ec2', 's3', 'lambda', 'aws'],
  },
  {
    canonicalId: 'curated:gcp',
    preferredLabel: 'Google Cloud Platform',
    source: 'curated',
    category: 'Cloud Providers',
    aliases: ['gcp', 'google cloud'],
  },
  {
    canonicalId: 'curated:terraform',
    preferredLabel: 'Terraform',
    source: 'curated',
    category: 'Infrastructure as Code',
    aliases: ['tf', 'iac', 'terraform'],
  },
  {
    canonicalId: 'curated:cicd',
    preferredLabel: 'CI/CD',
    source: 'curated',
    category: 'Infrastructure & DevOps',
    aliases: ['continuous integration', 'continuous delivery', 'github actions', 'gitlab ci', 'ci/cd'],
  },
  {
    canonicalId: 'curated:system-design',
    preferredLabel: 'System Design',
    source: 'curated',
    category: 'Architecture',
    aliases: ['distributed systems', 'high availability', 'microservices', 'system architecture', 'system design'],
  },
  {
    canonicalId: 'curated:sql',
    preferredLabel: 'SQL',
    source: 'curated',
    category: 'Databases',
    aliases: ['relational databases', 'rdbms', 'sql queries', 'sql'],
  },
];

/** Seed curated taxonomy into SQLite skills_taxonomy table. */
export function seedTaxonomyIfEmpty(db: Db): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM skills_taxonomy').get() as { c: number }).c;
  if (count > 0) return;

  const insert = db.prepare(
    `INSERT INTO skills_taxonomy (canonical_id, preferred_label, source, category, aliases_text)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const skill of CURATED_SEED_SKILLS) {
      insert.run(skill.canonicalId, skill.preferredLabel, skill.source, skill.category, skill.aliases.join('|'));
    }
  });
  tx();
}

/** Segment JD into must-have vs preferred requirements. */
export function segmentJobRequirements(jdText: string): { mustHave: string[]; preferred: string[] } {
  const lines = jdText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const mustHave: string[] = [];
  const preferred: string[] = [];

  let currentCategory: 'must-have' | 'preferred' = 'must-have';

  for (const line of lines) {
    if (/(?:preferred|nice\s*to\s*have|bonus|plus|good\s*to\s*have|optional)\b/i.test(line)) {
      currentCategory = 'preferred';
      continue;
    }
    if (
      /(?:required|must\s*have|qualifications|requirements|what\s*you(?:'ll)?\s*need|what\s*we(?:'re)?\s*looking\s*for)\b/i.test(
        line,
      )
    ) {
      currentCategory = 'must-have';
      continue;
    }

    if (/^[•*-]\s*/.test(line)) {
      const clean = line.replace(/^[•*-]\s*/, '').trim();
      if (clean.length > 3 && clean.length < 160) {
        if (currentCategory === 'must-have') mustHave.push(clean);
        else preferred.push(clean);
      }
    }
  }

  // Fallback: If no bulleted sections detected, extract common technical terms
  if (mustHave.length === 0 && preferred.length === 0) {
    const commonTerms = [
      'TypeScript',
      'JavaScript',
      'Python',
      'Go',
      'React',
      'Node.js',
      'Kubernetes',
      'Docker',
      'AWS',
      'PostgreSQL',
      'SQL',
      'Terraform',
      'CI/CD',
    ];
    for (const term of commonTerms) {
      const re = new RegExp(`\\b${term}\\b`, 'i');
      if (re.test(jdText)) {
        mustHave.push(term);
      }
    }
  }

  return { mustHave, preferred };
}

/** Look up synonyms and canonical forms in local skills_taxonomy. */
export function lookupTaxonomyAliases(db: Db, term: string): { canonical: string; aliases: string[] } | null {
  const row = db
    .prepare(
      `SELECT preferred_label, aliases_text
       FROM skills_taxonomy
       WHERE LOWER(preferred_label) = LOWER(?) OR aliases_text LIKE '%' || ? || '%'
       LIMIT 1`,
    )
    .get(term.toLowerCase(), term.toLowerCase()) as { preferred_label: string; aliases_text: string } | undefined;

  if (!row) return null;
  return {
    canonical: row.preferred_label,
    aliases: row.aliases_text.split('|').map((a) => a.trim().toLowerCase()),
  };
}

/** Three-Tier Local Alignment Evaluation. */
export function evaluateResumeAlignment(db: Db, resumeText: string, jdText: string): AlignmentResult {
  seedTaxonomyIfEmpty(db);
  const { mustHave, preferred } = segmentJobRequirements(jdText);
  const resumeLower = resumeText.toLowerCase();

  const rubric: AlignmentRequirement[] = [];

  const evaluateList = (items: string[], category: 'must-have' | 'preferred') => {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]!;
      const id = `${category}_${idx + 1}`;
      const itemLower = item.toLowerCase();

      // Tier 1: Exact lexical match
      const exactRegex = new RegExp(`\\b${escapeRegExp(itemLower)}\\b`, 'i');
      if (exactRegex.test(resumeText) || resumeLower.includes(itemLower)) {
        rubric.push({
          id,
          term: item,
          category,
          status: 'MEETS_EXACT',
          matchedResumeText: item,
          canonicalSkill: item,
          aliasUsed: null,
        });
        continue;
      }

      // Tier 2: Taxonomy Synonym Lookup
      const tax = lookupTaxonomyAliases(db, item);
      let synonymMatch: string | null = null;
      let aliasMatched: string | null = null;

      if (tax) {
        for (const alias of tax.aliases) {
          const aliasRegex = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
          if (aliasRegex.test(resumeText) || resumeLower.includes(alias)) {
            synonymMatch = tax.canonical;
            aliasMatched = alias;
            break;
          }
        }
      }

      if (synonymMatch) {
        rubric.push({
          id,
          term: item,
          category,
          status: 'MEETS_SYNONYM',
          matchedResumeText: aliasMatched,
          canonicalSkill: synonymMatch,
          aliasUsed: aliasMatched,
        });
        continue;
      }

      // Tier 3: Contextual Semantic Embeddings & Overlap
      const semanticScore = calculateSemanticScore(item, resumeText);
      if (semanticScore >= 0.8) {
        rubric.push({
          id,
          term: item,
          category,
          status: 'PARTIAL_SEMANTIC',
          matchedResumeText: `Semantic match (${Math.round(semanticScore * 100)}%)`,
          canonicalSkill: item,
          aliasUsed: null,
        });
        continue;
      }

      const itemTokens = itemLower.match(/[a-z0-9+#.-]{3,}/g) ?? [];
      const matchedToken = itemTokens.find((t) => resumeLower.includes(t));
      if (matchedToken) {
        rubric.push({
          id,
          term: item,
          category,
          status: 'PARTIAL_SEMANTIC',
          matchedResumeText: matchedToken,
          canonicalSkill: null,
          aliasUsed: null,
        });
        continue;
      }

      // Gap
      rubric.push({
        id,
        term: item,
        category,
        status: 'GAP',
        matchedResumeText: null,
        canonicalSkill: null,
        aliasUsed: null,
      });
    }
  };

  evaluateList(mustHave, 'must-have');
  evaluateList(preferred, 'preferred');

  const mustHaveReqs = rubric.filter((r) => r.category === 'must-have');
  const preferredReqs = rubric.filter((r) => r.category === 'preferred');

  const mustHavePassed = mustHaveReqs.filter((r) => r.status === 'MEETS_EXACT' || r.status === 'MEETS_SYNONYM').length;
  const preferredPassed = preferredReqs.filter(
    (r) => r.status === 'MEETS_EXACT' || r.status === 'MEETS_SYNONYM',
  ).length;

  const mustHaveScore = mustHaveReqs.length > 0 ? Math.round((mustHavePassed / mustHaveReqs.length) * 100) : 100;
  const preferredScore = preferredReqs.length > 0 ? Math.round((preferredPassed / preferredReqs.length) * 100) : 100;

  // Composite: Must-haves weighted 70%, preferred weighted 30%
  const compositeScore = Math.round(mustHaveScore * 0.7 + preferredScore * 0.3);
  const isTopFit = mustHavePassed === mustHaveReqs.length && mustHaveReqs.length > 0;

  // Counterfactual Priority Queue (Top 3 marginal lifts)
  const gaps = rubric.filter((r) => r.status === 'GAP' || r.status === 'PARTIAL_SEMANTIC');
  const counterfactualFixes: CounterfactualFix[] = [];

  for (const gap of gaps.slice(0, 3)) {
    const weight =
      gap.category === 'must-have' ? (1 / (mustHaveReqs.length || 1)) * 70 : (1 / (preferredReqs.length || 1)) * 30;
    const lift = Math.round(weight);

    if (gap.status === 'PARTIAL_SEMANTIC') {
      counterfactualFixes.push({
        action: `Mirror exact term "${gap.term}"`,
        marginalLiftPercent: lift,
        explanation: `Resume mentions "${gap.matchedResumeText}". Mirroring exact JD phrasing "${gap.term}" lifts score by +${lift}%.`,
        targetRequirement: gap.term,
      });
    } else {
      counterfactualFixes.push({
        action: `Add verified evidence for "${gap.term}"`,
        marginalLiftPercent: lift,
        explanation: `No verified evidence found for ${gap.category} qualification "${gap.term}". Adding an achievement lifts alignment by +${lift}%.`,
        targetRequirement: gap.term,
      });
    }
  }

  let summary = `Must-Have Alignment: ${mustHaveScore}% (${mustHavePassed}/${mustHaveReqs.length}). Preferred: ${preferredScore}%. `;
  if (isTopFit) {
    summary += 'Top Fit: Satisfies 100% of required qualifications. Recruiter Boolean filters will match cleanly.';
  } else if (mustHaveScore >= 75) {
    summary += 'Strong Match: Meets majority of must-haves. Address top counterfactual edits to achieve Top Fit.';
  } else {
    summary += 'Gaps in must-have qualifications detected. Review counterfactual recommendations before applying.';
  }

  return {
    mustHaveScore,
    preferredScore,
    compositeScore,
    isTopFit,
    rubric,
    counterfactualFixes,
    summary,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
