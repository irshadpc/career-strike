import { z } from 'zod';

export const candidateProfileSchema = z.object({
  fullName: z.string().trim().optional(),
  headline: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  linkedinUrl: z.string().trim().url().or(z.literal('')).optional(),
  githubUrl: z.string().trim().url().or(z.literal('')).optional(),
  portfolioUrl: z.string().trim().url().or(z.literal('')).optional(),
  preferredRoles: z.array(z.string()).default([]),
  remotePref: z.string().default('remote_only'),
  targetCountries: z.array(z.string()).default([]),
  authSituation: z.enum(['unknown', 'sponsor', 'existing']).default('unknown'),
});

export type CandidateProfileFormValues = z.infer<typeof candidateProfileSchema>;

export const evidenceSchema = z
  .object({
    kind: z.enum(['project', 'achievement', 'portfolio', 'employment_detail']),
    name: z.string().trim().optional(),
    detail: z.string().trim().optional(),
    skills: z.string().trim().optional(),
    url: z.union([z.string().trim().url(), z.literal('')]).optional(),
    roleFactId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'project' && !value.name) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Enter the project name.' });
    }
    if (value.kind === 'portfolio' && !value.name) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Enter a label for this link.' });
    }
    if (value.kind === 'project' && !value.detail) {
      ctx.addIssue({ code: 'custom', path: ['detail'], message: 'Describe the project and your contribution.' });
    }
    if (value.kind === 'achievement' && !value.detail) {
      ctx.addIssue({ code: 'custom', path: ['detail'], message: 'Enter the achievement.' });
    }
    if (value.kind === 'employment_detail' && !value.detail) {
      ctx.addIssue({ code: 'custom', path: ['detail'], message: 'Enter the employment detail.' });
    }
    if (value.kind === 'portfolio' && !value.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Enter the portfolio or GitHub URL.' });
    }
  });

export type EvidenceFormValues = z.infer<typeof evidenceSchema>;

export const suggestSkillsSchema = z.object({
  text: z.string().trim().min(1, 'Please paste résumé text first'),
});

export type SuggestSkillsFormValues = z.infer<typeof suggestSkillsSchema>;
