/**
 * Google XYZ & Anti-Slop Bullet Linter (blueprint: Section 3).
 *
 * Evaluates resume achievement bullets against:
 *   1. Duty vs. Impact Opener: Flags passive openers (Responsible for, Assisted with, Worked on, Helped)
 *   2. Quantification & Scale: Detects numbers (%, $, latency, headcount, volume, frequency) and prompts
 *   3. Anti-Slop & Cliché Audit: Highlights AI buzzwords (delve, spearheaded, leveraged, synergy, etc.)
 *   4. Visual Rhythm & Symmetry: Detects identical character-length bullets (classic LLM visual tell)
 */

export interface BulletLintResult {
  text: string;
  xyzScore: number; // 0..100
  isQuantified: boolean;
  metrics: string[];
  hasPassiveOpener: boolean;
  passiveOpenerMatch: string | null;
  cliches: string[];
  recommendation: string | null;
  metricPrompt: string | null;
}

export interface RoleBulletAudit {
  bullets: BulletLintResult[];
  averageXyzScore: number;
  quantifiedRate: number; // 0..1
  totalCliches: number;
  hasVisualSymmetryTell: boolean; // Flagged when all bullets have near-identical length
  feedbackSummary: string;
}

const PASSIVE_OPENERS: readonly RegExp[] = [
  /^responsible for\b/i,
  /^assisted with\b/i,
  /^worked on\b/i,
  /^helped (?:to\b)?/i,
  /^participated in\b/i,
  /^duties included\b/i,
  /^supported the\b/i,
  /^involved in\b/i,
];

const METRIC_PATTERNS: readonly RegExp[] = [
  /\b\d+(?:\.\d+)?%/, // Percentages (15%, 2.5%)
  /\$\s*\d+(?:,\d{3})*(?:\.\d+)?(?:\s*[kKmMbB])?\b/, // Currency ($500k, $1.2M)
  /\b\d+\s*(?:ms|milliseconds?|seconds?|mins?|minutes?|hours?|days?|weeks?|months?)\b/i, // Latency / Time
  /\b\d+(?:,\d{3})*(?:\+)?\s*(?:users?|customers?|clients?|engineers?|developers?|direct reports?|people|members?)\b/i, // Headcount / Users
  /\b(?:reduced|increased|accelerated|decreased|cut|boosted|scaled)\s+(?:by\s+)?\d+/i, // Relative changes
  /\b\d+(?:[kKmMbB]|\s*million|\s*billion|\s*thousand)\b/i, // Magnitude scale
  /\b\d+(?:x|X|\s*times)\b/, // Multipliers (3x, 10x)
];

const AI_CLICHES: readonly [RegExp, string][] = [
  [/\bdelve\b/i, 'delve (AI marker)'],
  [/\bspearheaded\b/i, 'spearheaded (overused cliché; use led/directed/built)'],
  [/\bleveraged\b/i, 'leveraged (overused; use used/applied/deployed)'],
  [/\bmeticulous(?:ly)?\b/i, 'meticulous (vague adjective)'],
  [/\bshowcase(?:d|s)?\b/i, 'showcase (passive framing)'],
  [/\bsynerg(?:y|ies|istic)\b/i, 'synergy (corporate filler)'],
  [/\btapestry\b/i, 'tapestry (classic LLM florid vocabulary)'],
  [/\bcutting[\s-]edge\b/i, 'cutting-edge (buzzword; name the specific tech)'],
  [/\bresults[\s-]driven\b/i, 'results-driven (empty buzzword; show numbers instead)'],
  [/\bpassionate about\b/i, 'passionate about (hollow sentiment; demonstrate with craft)'],
  [/\bproven track record\b/i, 'proven track record (generic; prove it with metrics)'],
  [/\bcross[\s-]functional\b/i, 'cross-functional (overused; name the actual teams: design, product, sales)'],
];

export function lintBullet(text: string): BulletLintResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      text: '',
      xyzScore: 0,
      isQuantified: false,
      metrics: [],
      hasPassiveOpener: false,
      passiveOpenerMatch: null,
      cliches: [],
      recommendation: null,
      metricPrompt: null,
    };
  }

  // 1. Passive Opener check
  let hasPassiveOpener = false;
  let passiveOpenerMatch: string | null = null;
  for (const re of PASSIVE_OPENERS) {
    const m = trimmed.match(re);
    if (m) {
      hasPassiveOpener = true;
      passiveOpenerMatch = m[0];
      break;
    }
  }

  // 2. Metrics check
  const metrics: string[] = [];
  for (const re of METRIC_PATTERNS) {
    const m = trimmed.match(re);
    if (m && !metrics.includes(m[0])) {
      metrics.push(m[0]);
    }
  }
  const isQuantified = metrics.length > 0;

  // 3. Cliché check
  const cliches: string[] = [];
  for (const [re, label] of AI_CLICHES) {
    if (re.test(trimmed)) {
      cliches.push(label);
    }
  }

  // Calculate XYZ score (0..100)
  let score = 50; // Baseline
  if (isQuantified) score += 30;
  if (!hasPassiveOpener) score += 20;
  else score -= 25;
  score -= cliches.length * 15;
  const xyzScore = Math.max(0, Math.min(100, score));

  // Determine prompt / recommendation
  let metricPrompt: string | null = null;
  if (!isQuantified) {
    metricPrompt =
      'How was this measured? Prompt: What was the scale (users, latency, revenue, % time saved, team size)?';
  }

  let recommendation: string | null = null;
  if (hasPassiveOpener) {
    recommendation = `Replace passive starter "${passiveOpenerMatch}" with an active verb (e.g., Designed, Shipped, Automated, Spearheaded → Led).`;
  } else if (!isQuantified) {
    recommendation = 'Add a concrete measurement (e.g., "...reducing latency by 45%", "...across 12 engineers").';
  } else if (cliches.length > 0) {
    recommendation = `Remove buzzwords: ${cliches.join(', ')}.`;
  }

  return {
    text: trimmed,
    xyzScore,
    isQuantified,
    metrics,
    hasPassiveOpener,
    passiveOpenerMatch,
    cliches,
    recommendation,
    metricPrompt,
  };
}

export function lintRoleBullets(bullets: string[]): RoleBulletAudit {
  const validBullets = bullets.map((b) => b.trim()).filter(Boolean);
  if (validBullets.length === 0) {
    return {
      bullets: [],
      averageXyzScore: 0,
      quantifiedRate: 0,
      totalCliches: 0,
      hasVisualSymmetryTell: false,
      feedbackSummary: 'No bullets found for this role.',
    };
  }

  const results = validBullets.map(lintBullet);
  const totalScore = results.reduce((acc, r) => acc + r.xyzScore, 0);
  const quantifiedCount = results.filter((r) => r.isQuantified).length;
  const totalCliches = results.reduce((acc, r) => acc + r.cliches.length, 0);

  // Check visual symmetry tell (LLM output signature: every bullet has near-identical character length)
  let hasVisualSymmetryTell = false;
  if (results.length >= 3) {
    const lengths = results.map((r) => r.text.length);
    const minLen = Math.min(...lengths);
    const maxLen = Math.max(...lengths);
    // If variance is within 15 chars across 3+ bullets, that's an artificial symmetry tell
    if (maxLen - minLen <= 15) {
      hasVisualSymmetryTell = true;
    }
  }

  const avgScore = Math.round(totalScore / results.length);
  const quantifiedRate = Number((quantifiedCount / results.length).toFixed(2));

  let summary = `XYZ Impact: ${avgScore}/100. `;
  if (quantifiedRate < 0.5) {
    summary += `Only ${Math.round(quantifiedRate * 100)}% of bullets include metrics (aim for ≥60%). `;
  } else {
    summary += `${Math.round(quantifiedRate * 100)}% quantified. `;
  }
  if (hasVisualSymmetryTell) {
    summary += 'Warning: Identical bullet lengths detected (common visual tell of unedited AI text). ';
  }
  if (totalCliches > 0) {
    summary += `${totalCliches} cliché/AI buzzword(s) found.`;
  }

  return {
    bullets: results,
    averageXyzScore: avgScore,
    quantifiedRate,
    totalCliches,
    hasVisualSymmetryTell,
    feedbackSummary: summary.trim(),
  };
}
