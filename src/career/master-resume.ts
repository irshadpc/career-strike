import type { Db } from '../store/db.js';
import { getSettings } from '../store/settings.js';
import { listEvidence, profileFingerprint } from './evidence.js';
import { listFacts } from './profile.js';

/**
 * The one canonical master document. It is composed only from approved profile facts and
 * confirmed evidence, so every line can be traced back to something the candidate entered or
 * reviewed. Nothing here is generated prose: headings, dates and values are copied from the
 * profile, and missing sections are rendered as explicit gaps rather than invented content.
 */
export interface MasterResumeCounts {
  roles: number;
  skills: number;
  projects: number;
  achievements: number;
  employmentDetails: number;
  education: number;
  certifications: number;
  languages: number;
}

export interface MasterResumeIdentity {
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedIn: boolean;
  hasHeadline: boolean;
  hasSummary: boolean;
  /** Actual values (used by ATS-proof export HTML generation). */
  fullName: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
}

export interface MasterResumeDocument {
  content: string;
  generatedAt: string;
  profileFingerprint: string;
  counts: MasterResumeCounts;
  identity: MasterResumeIdentity;
  sourceFacts: number;
  sourceEvidence: number;
}

interface RoleFact {
  id: string;
  title: string;
  employer: string | null;
  startYear: number;
  endYear: number | null;
  summary: string | null;
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const roleSort = (a: RoleFact, b: RoleFact): number =>
  (b.endYear ?? 9999) - (a.endYear ?? 9999) || b.startYear - a.startYear;

export function buildMasterResume(db: Db, now = new Date()): MasterResumeDocument {
  const settings = getSettings(db);
  const facts = listFacts(db, { approvedOnly: true });
  const evidence = listEvidence(db, { confirmedOnly: true });

  const name = asString(settings['identity.fullName']);
  const email = asString(settings['identity.email']);
  const phone = asString(settings['identity.phone']);
  const country = asString(settings['candidate.country']);
  const headline = asString(settings['identity.headline']);
  const summary = asString(settings['identity.summary']);
  const linkedin = asString(settings['candidate.linkedinUrl']);
  const github = asString(settings['candidate.githubUrl']);
  const portfolio = asString(settings['candidate.portfolioUrl']);
  const extraLinks = Array.isArray(settings['identity.profileLinks'])
    ? (settings['identity.profileLinks'] as unknown[]).filter((v): v is string => typeof v === 'string' && !!v.trim())
    : [];

  const skills = facts
    .filter((f) => f.kind === 'skill')
    .map((f) => ({ name: String(f.value.name), years: (f.value.years as number | null) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const roles: RoleFact[] = facts
    .filter((f) => f.kind === 'role')
    .map((f) => ({
      id: f.id,
      title: String(f.value.title),
      employer: asString(f.value.employer),
      startYear: Number(f.value.startYear),
      endYear: (f.value.endYear as number | null) ?? null,
      summary: asString(f.value.summary),
    }))
    .sort(roleSort);

  const projects = evidence.filter((e) => e.kind === 'project');
  const achievements = evidence.filter((e) => e.kind === 'achievement');
  const employmentDetails = evidence.filter((e) => e.kind === 'employment_detail');
  const portfolios = evidence.filter((e) => e.kind === 'portfolio');
  const education = facts.filter((f) => f.kind === 'education');
  const certifications = facts.filter((f) => f.kind === 'certification');
  const languages = facts.filter((f) => f.kind === 'language');

  const lines: string[] = [];
  lines.push((name ?? '[Your name]').toUpperCase());
  if (headline) lines.push(headline);

  const contact = [email, phone, country, linkedin, github, portfolio, ...extraLinks]
    .filter((v): v is string => !!v)
    .filter((v, i, all) => all.indexOf(v) === i);
  if (contact.length > 0) lines.push(contact.join(' · '));
  lines.push('');

  lines.push('PROFESSIONAL SUMMARY');
  if (summary) {
    lines.push(summary);
  } else if (roles.length > 0) {
    const latest = roles[0]!;
    const role = latest.employer ? `${latest.title} at ${latest.employer}` : latest.title;
    const skillList = skills
      .slice(0, 6)
      .map((s) => s.name)
      .join(', ');
    lines.push(
      skillList
        ? `${role}, with confirmed skills in ${skillList}.`
        : `${role}. Add skills to make this summary more specific.`,
    );
  } else {
    lines.push('[Add a role or a short professional summary in your profile]');
  }
  lines.push('');

  lines.push('CORE SKILLS');
  if (skills.length > 0) {
    lines.push(
      skills
        .map((s) => (s.years === null ? s.name : `${s.name} (${s.years} ${s.years === 1 ? 'year' : 'years'})`))
        .join(' • '),
    );
  } else {
    lines.push('[Add skills in your profile]');
  }
  lines.push('');

  lines.push('PROFESSIONAL EXPERIENCE');
  if (roles.length > 0) {
    for (const role of roles) {
      lines.push(
        `${role.title} — ${role.employer ?? 'Independent'} (${role.startYear} – ${role.endYear ?? 'Present'})`,
      );
      if (role.summary) lines.push(`  ${role.summary}`);
      for (const detail of employmentDetails) {
        if (detail.value.roleFactId === role.id) lines.push(`  ${String(detail.value.summary)}`);
      }
    }
  } else {
    lines.push('[Add experience in your profile]');
  }
  lines.push('');

  if (projects.length > 0 || achievements.length > 0) {
    lines.push('VERIFIED PROJECTS & ACHIEVEMENTS');
    for (const project of projects) {
      const label = asString(project.value.name) ?? 'Project';
      const detail = asString(project.value.summary);
      lines.push(`• ${label}${detail ? `: ${detail}` : ''}`);
    }
    for (const achievement of achievements) {
      lines.push(`• ${String(achievement.value.text)}`);
    }
    lines.push('');
  }

  if (portfolios.length > 0) {
    lines.push('PORTFOLIO');
    for (const item of portfolios) {
      lines.push(`• ${String(item.value.label)}: ${String(item.value.url)}`);
    }
    lines.push('');
  }

  if (education.length > 0 || certifications.length > 0) {
    lines.push('EDUCATION & CERTIFICATIONS');
    for (const item of education) {
      const qualification = String(item.value.qualification);
      const institution = asString(item.value.institution);
      const year = item.value.year === null || item.value.year === undefined ? null : String(item.value.year);
      lines.push(`• ${qualification}${institution ? ` — ${institution}` : ''}${year ? ` (${year})` : ''}`);
    }
    for (const item of certifications) {
      const certification = String(item.value.name);
      const issuer = asString(item.value.issuer);
      const year = item.value.year === null || item.value.year === undefined ? null : String(item.value.year);
      lines.push(`• ${certification}${issuer ? ` — ${issuer}` : ''}${year ? ` (${year})` : ''}`);
    }
    lines.push('');
  }

  if (languages.length > 0) {
    lines.push('LANGUAGES');
    for (const item of languages) {
      lines.push(`• ${String(item.value.name)} (${String(item.value.level)})`);
    }
    lines.push('');
  }

  return {
    content: lines.join('\n').trimEnd(),
    generatedAt: now.toISOString(),
    profileFingerprint: profileFingerprint(db),
    counts: {
      roles: roles.length,
      skills: skills.length,
      projects: projects.length,
      achievements: achievements.length,
      employmentDetails: employmentDetails.length,
      education: education.length,
      certifications: certifications.length,
      languages: languages.length,
    },
    identity: {
      hasName: !!name,
      hasEmail: !!email,
      hasPhone: !!phone,
      hasLinkedIn: !!linkedin,
      hasHeadline: !!headline,
      hasSummary: !!summary,
      fullName: name,
      email,
      phone,
      linkedin,
    },
    sourceFacts: facts.length,
    sourceEvidence: evidence.length,
  };
}
