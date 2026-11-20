export interface MasterBullet {
  id: string;
  entryId: string;
  rawText: string;
  verifiedMetrics: string[];
  canonicalSkillIds: string[];
  scopeLevel: 'individual' | 'team' | 'org';
  xyzScore: number;
  starStoryId: string | null;
  updatedAt: string;
}

export interface MasterEntry {
  id: string;
  entryType: 'experience' | 'project' | 'education' | 'certification';
  organization: string;
  title: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  sortOrder: number;
  updatedAt: string;
  bullets: MasterBullet[];
}

export interface BulletLintResult {
  text: string;
  xyzScore: number;
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
  quantifiedRate: number;
  totalCliches: number;
  hasVisualSymmetryTell: boolean;
  feedbackSummary: string;
}

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
  mustHaveScore: number;
  preferredScore: number;
  compositeScore: number;
  isTopFit: boolean;
  rubric: AlignmentRequirement[];
  counterfactualFixes: CounterfactualFix[];
  summary: string;
}
