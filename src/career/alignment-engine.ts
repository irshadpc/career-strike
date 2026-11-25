import { calculateSemanticScore } from '../matching/embeddings-worker.js';
import { SKILLS, skillsIn } from '../matching/skills.js';
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

const ALIGNMENT_STOPWORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'you',
  'your',
  'our',
  'are',
  'from',
  'into',
  'that',
  'this',
  'have',
  'has',
  'will',
  'can',
  'all',
  'using',
  'use',
  'used',
  'years',
  'year',
  'experience',
  'skills',
  'strong',
  'deep',
  'solid',
  'prior',
  'hands',
  'hands-on',
  'knowledge',
  'ability',
  'building',
  'work',
  'working',
  'proven',
]);

/** Seed curated taxonomy + full canonical SKILLS catalog into SQLite skills_taxonomy table. */
export function seedTaxonomyIfEmpty(db: Db): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM skills_taxonomy').get() as { c: number }).c;
  if (count >= SKILLS.length) return;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO skills_taxonomy (canonical_id, preferred_label, source, category, aliases_text)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const skill of CURATED_SEED_SKILLS) {
      insert.run(skill.canonicalId, skill.preferredLabel, skill.source, skill.category, skill.aliases.join('|'));
    }
    const seededLabels = new Set(CURATED_SEED_SKILLS.map((s) => s.preferredLabel.toLowerCase()));
    for (const s of SKILLS) {
      if (seededLabels.has(s.name.toLowerCase())) continue;
      const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      insert.run(
        `curated:${slug}`,
        s.name,
        'curated',
        'Technical & Domain',
        s.aliases.map((a) => a.toLowerCase()).join('|'),
      );
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

    if (/^(?:[•*\-▪]|(?:\d+[.)]))\s+/.test(line)) {
      const clean = line.replace(/^(?:[•*\-▪]|(?:\d+[.)]))\s+/, '').trim();
      if (clean.length > 1 && clean.length < 180) {
        if (currentCategory === 'must-have') mustHave.push(clean);
        else preferred.push(clean);
      }
    }
  }

  // Fallback: Extract all canonical skills from the full catalog when no list items detected
  if (mustHave.length === 0 && preferred.length === 0) {
    const detected = skillsIn(jdText);
    for (const skill of detected) mustHave.push(skill);
  }

  return { mustHave, preferred };
}

/** Look up synonyms and canonical forms in local skills_taxonomy with boundary-safe matching. */
export function lookupTaxonomyAliases(db: Db, term: string): { canonical: string; aliases: string[] } | null {
  const clean = term.trim().toLowerCase();
  if (!clean) return null;

  const row = db
    .prepare(
      `SELECT preferred_label, aliases_text
       FROM skills_taxonomy
       WHERE LOWER(preferred_label) = ?
          OR ('|' || LOWER(aliases_text) || '|') LIKE '%|' || ? || '|%'
       LIMIT 1`,
    )
    .get(clean, clean) as { preferred_label: string; aliases_text: string } | undefined;

  if (row) {
    return {
      canonical: row.preferred_label,
      aliases: row.aliases_text.split('|').map((a) => a.trim().toLowerCase()),
    };
  }

  // Sentence fallback: check if the requirement mentions any canonical skill from our catalog
  const embeddedSkills = skillsIn(term);
  for (const skill of embeddedSkills) {
    const embeddedRow = db
      .prepare('SELECT preferred_label, aliases_text FROM skills_taxonomy WHERE LOWER(preferred_label) = ? LIMIT 1')
      .get(skill.toLowerCase()) as { preferred_label: string; aliases_text: string } | undefined;
    if (embeddedRow) {
      return {
        canonical: embeddedRow.preferred_label,
        aliases: embeddedRow.aliases_text.split('|').map((a) => a.trim().toLowerCase()),
      };
    }
  }

  return null;
}

/** Three-Tier Local Alignment Evaluation. */
export function evaluateResumeAlignment(db: Db, resumeText: string, jdText: string): AlignmentResult {
  seedTaxonomyIfEmpty(db);
  const { mustHave, preferred } = segmentJobRequirements(jdText);
  const resumeSkills = new Set(skillsIn(resumeText).map((s) => s.toLowerCase()));
  const resumeLines = resumeText
    .split(/[\n.]+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 6);

  const rubric: AlignmentRequirement[] = [];

  const evaluateList = (items: string[], category: 'must-have' | 'preferred') => {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]!;
      const id = `${category}_${idx + 1}`;
      const itemLower = item.toLowerCase();

      // Tier 1: Exact lexical match (whole-word boundary)
      const exactRegex = new RegExp(`(?<![a-z0-9+#.])${escapeRegExp(itemLower)}(?![a-z0-9+#])`, 'i');
      if (exactRegex.test(resumeText)) {
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

      // Tier 2: Taxonomy Synonym & Canonical Skill Lookup
      const tax = lookupTaxonomyAliases(db, item);
      let synonymMatch: string | null = null;
      let aliasMatched: string | null = null;

      if (tax) {
        if (resumeSkills.has(tax.canonical.toLowerCase())) {
          synonymMatch = tax.canonical;
          aliasMatched = tax.canonical;
        } else {
          for (const alias of tax.aliases) {
            const aliasRegex = new RegExp(`(?<![a-z0-9+#.])${escapeRegExp(alias)}(?![a-z0-9+#])`, 'i');
            if (aliasRegex.test(resumeText)) {
              synonymMatch = tax.canonical;
              aliasMatched = alias;
              break;
            }
          }
        }
      }

      if (!synonymMatch) {
        const itemSkills = skillsIn(item);
        const matchedSkill = itemSkills.find((sk) => resumeSkills.has(sk.toLowerCase()));
        if (matchedSkill) {
          synonymMatch = matchedSkill;
          aliasMatched = matchedSkill;
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

      // Tier 3: Contextual Semantic Score against individual resume lines/bullets
      let bestLineScore = 0;
      let bestLineText: string | null = null;
      for (const line of resumeLines) {
        const score = calculateSemanticScore(item, line);
        if (score > bestLineScore) {
          bestLineScore = score;
          bestLineText = line;
        }
      }
      if (bestLineScore >= 0.72 && bestLineText) {
        rubric.push({
          id,
          term: item,
          category,
          status: 'PARTIAL_SEMANTIC',
          matchedResumeText: `${bestLineText.slice(0, 72)} (${Math.round(bestLineScore * 100)}%)`,
          canonicalSkill: item,
          aliasUsed: null,
        });
        continue;
      }

      // Meaningful non-stopword whole-word overlap
      const itemTokens = (itemLower.match(/[a-z0-9+#.-]{3,}/g) ?? []).filter((t) => !ALIGNMENT_STOPWORDS.has(t));
      const matchedTokens = itemTokens.filter((t) =>
        new RegExp(`(?<![a-z0-9+#.])${escapeRegExp(t)}(?![a-z0-9+#])`, 'i').test(resumeText),
      );
      if (
        matchedTokens.length > 0 &&
        (itemTokens.length <= 2 || matchedTokens.length >= 2 || matchedTokens[0]!.length >= 6)
      ) {
        rubric.push({
          id,
          term: item,
          category,
          status: 'PARTIAL_SEMANTIC',
          matchedResumeText: matchedTokens.join(', '),
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
