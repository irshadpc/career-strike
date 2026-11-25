import { skillsIn } from '../matching/skills.js';
import { parseYear } from './linkedin-export.js';

export interface ResumeRole {
  title: string;
  employer: string | null;
  startYear: number;
  endYear: number | null;
  summary: string | null;
}

export interface ResumeEducation {
  qualification: string;
  institution: string | null;
  year: number | null;
}

export interface ResumeCertification {
  name: string;
  issuer: string | null;
  year: number | null;
}

export interface ResumeLanguage {
  name: string;
  level: 'basic' | 'professional' | 'native';
}

export interface ResumeFacts {
  skills: { name: string }[];
  roles: ResumeRole[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
  languages: ResumeLanguage[];
}

const SECTION_HEADERS = [
  'summary',
  'about',
  'profile',
  'objective',
  'career summary',
  'professional summary',
  'experience',
  'work experience',
  'professional experience',
  'work history',
  'employment',
  'employment history',
  'education',
  'education & certifications',
  'certifications',
  'certificates',
  'licenses & certifications',
  'languages',
  'skills',
  'core skills',
  'technical skills',
  'technical strengths',
  'domains',
  'projects',
  'key projects',
  'verified projects & achievements',
  'achievements',
  'publications',
  'contact',
  'contact information',
];

function isHeader(line: string): boolean {
  const l = line
    .trim()
    .toLowerCase()
    .replace(/[:\-–—]+$/, '')
    .trim();
  return SECTION_HEADERS.includes(l);
}

function sectionLines(text: string, names: string[]): string[] {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      names.includes(
        lines[i]!.trim()
          .toLowerCase()
          .replace(/[:\-–—]+$/, '')
          .trim(),
      )
    ) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (isHeader(line)) break;
    out.push(lines[i]!);
  }
  return out;
}

function parseDateRange(s: string): { start: number | null; end: number | null } {
  const cleaned = s.replace(/[()]/g, '').trim();
  const parts = cleaned.split(/\s*[–—]\s*/);
  if (parts.length >= 2) {
    return { start: parseYear(parts[0]), end: parseYear(parts.slice(1).join('-')) };
  }
  // handle hyphen ranges like "2018 - 2019" or "Jan 2020 - Present"
  const hyphenParts = cleaned.split(/\s+-\s+|(?<=\d{4})-(?=\d{4}|present|current|ongoing)/i);
  if (hyphenParts.length >= 2) {
    return { start: parseYear(hyphenParts[0]), end: parseYear(hyphenParts.slice(1).join('-')) };
  }
  return { start: parseYear(cleaned), end: null };
}

const MONTHS =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|present|current|ongoing)\b/i;

function isLikelyDateRange(line: string): boolean {
  const cleaned = line.trim();
  if (!/\b(19|20)\d{2}\b/.test(cleaned)) return false;
  if (cleaned.length > 64) return false;
  return (
    MONTHS.test(cleaned) ||
    /[–—]/.test(cleaned) ||
    /\s-\s/.test(cleaned) ||
    /\b(19|20)\d{2}\s*-\s*(?:(19|20)\d{2}|present|current|ongoing)\b/i.test(cleaned)
  );
}

export function extractResumeRoles(text: string): ResumeRole[] {
  const lines = sectionLines(text, [
    'experience',
    'work experience',
    'professional experience',
    'work history',
    'employment',
    'employment history',
  ]);
  if (lines.length === 0) return [];
  const roles: ResumeRole[] = [];
  let employer: string | null = null;
  let title: string | null = null;
  let startYear: number | null = null;
  let endYear: number | null = null;
  let pendingStartYear: number | null = null;
  let pendingEndYear: number | null = null;
  let bullets: string[] = [];

  const flush = () => {
    if (title) {
      const sy = startYear ?? pendingStartYear ?? new Date().getUTCFullYear();
      const ey = startYear !== null ? endYear : pendingEndYear;
      roles.push({
        title: title.slice(0, 150),
        employer: employer ? employer.slice(0, 150) : null,
        startYear: sy,
        endYear: ey,
        summary: bullets.length ? bullets.join('\n').slice(0, 2000) : null,
      });
    }
    title = null;
    startYear = null;
    endYear = null;
    pendingStartYear = null;
    pendingEndYear = null;
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      bullets.push(line.replace(/^[•\-*]\s*/, '').trim());
      continue;
    }

    // Master-resume style: "Title — Employer (2020 – Present)"
    const emDashRoleMatch = line.match(/^(.+?)\s+[—–]\s+(.+?)(?:\s*\(([^)]+)\))?$/);
    if (emDashRoleMatch) {
      const left = emDashRoleMatch[1]!.trim();
      const right = emDashRoleMatch[2]!.trim();
      const paren = emDashRoleMatch[3]?.trim() ?? '';
      if (paren && isLikelyDateRange(paren)) {
        flush();
        title = left;
        employer = right;
        const dr = parseDateRange(paren);
        startYear = dr.start;
        endYear = dr.end;
        continue;
      }
      if (isLikelyDateRange(right)) {
        flush();
        title = left;
        const dr = parseDateRange(right);
        startYear = dr.start;
        endYear = dr.end;
        continue;
      }
    }

    // Date range line
    if (isLikelyDateRange(line)) {
      const dr = parseDateRange(line);
      if (dr.start) {
        if (title && startYear === null) {
          startYear = dr.start;
          endYear = dr.end;
        } else if (!title) {
          pendingStartYear = dr.start;
          pendingEndYear = dr.end;
        }
      }
      continue;
    }

    // Employer header line with pipe
    const pipeMatch = line.match(/^(.+?)\s*\|\s*(.+)$/);
    if (pipeMatch) {
      const left = pipeMatch[1]!.trim();
      const right = pipeMatch[2]!.trim();
      const rightIsDate = isLikelyDateRange(right);
      const rightIsLocation =
        /\b(?:remote|hybrid|onsite|usa|uk|india|canada|germany|singapore|australia|uae|japan|london|berlin|san francisco|new york|bangalore|bengaluru|california|seattle|austin|toronto|sydney)\b/i.test(
          right,
        ) && !rightIsDate;
      flush();
      employer = left;
      if (!rightIsDate && !rightIsLocation) {
        title = right;
      } else if (rightIsDate) {
        const dr = parseDateRange(right);
        if (dr.start) {
          pendingStartYear = dr.start;
          pendingEndYear = dr.end;
        }
      }
      continue;
    }

    // "Title at Company"
    const atMatch = line.match(/^(.+?)\s+at\s+([A-Z][^,]{1,80})$/);
    if (atMatch && !line.endsWith('.')) {
      flush();
      title = atMatch[1]!.trim();
      employer = atMatch[2]!.trim();
      continue;
    }

    // Otherwise treat as a title (new role under current employer) or continuation bullet if already in a role with bullets
    if (title && bullets.length > 0 && line.length > 70) {
      bullets.push(line);
      continue;
    }
    flush();
    title = line;
  }
  flush();
  return roles;
}

export function extractResumeEducation(text: string): ResumeEducation[] {
  const lines = sectionLines(text, ['education']);
  const out: ResumeEducation[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('•') || line.startsWith('-')) continue;
    const parts = line.split(/\s*\|\s*/);
    if (parts.length >= 2) {
      const qualification = parts[0]!.trim().slice(0, 150);
      const institution = parts[1]!.trim().slice(0, 150) || null;
      const year = parseYear(parts.slice(2).join(' '));
      if (qualification) out.push({ qualification, institution, year });
    } else {
      const yr = parseYear(line);
      out.push({ qualification: line.slice(0, 150), institution: null, year: yr });
    }
  }
  return out;
}

export function extractResumeCertifications(text: string): ResumeCertification[] {
  const lines = sectionLines(text, ['certifications', 'certificates']);
  const out: ResumeCertification[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('•') || line.startsWith('-')) continue;
    const parts = line.split(/\s*\|\s*/);
    if (parts.length >= 2) {
      out.push({
        name: parts[0]!.trim().slice(0, 150),
        issuer: parts[1]!.trim().slice(0, 150) || null,
        year: parseYear(parts.slice(2).join(' ')),
      });
    } else {
      out.push({ name: line.slice(0, 150), issuer: null, year: parseYear(line) });
    }
  }
  return out;
}

export function extractResumeLanguages(text: string): ResumeLanguage[] {
  const lines = sectionLines(text, ['languages']);
  const out: ResumeLanguage[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('•') || line.startsWith('-')) continue;
    const items = line.split(/,|;/);
    for (const item of items) {
      const m = item.trim().match(/^(.+?)(?:\((.+)\))?$/);
      if (!m) continue;
      const name = m[1]!.trim().slice(0, 60);
      if (!name) continue;
      const levelRaw = (m[2] ?? '').toLowerCase();
      let level: 'basic' | 'professional' | 'native' = 'professional';
      if (levelRaw.includes('native') || levelRaw.includes('bilingual')) level = 'native';
      else if (levelRaw.includes('basic') || levelRaw.includes('elementary') || levelRaw.includes('limited'))
        level = 'basic';
      out.push({ name, level });
    }
  }
  return out;
}

export function extractResumeFacts(text: string): ResumeFacts {
  return {
    skills: skillsIn(text).map((name) => ({ name })),
    roles: extractResumeRoles(text),
    education: extractResumeEducation(text),
    certifications: extractResumeCertifications(text),
    languages: extractResumeLanguages(text),
  };
}
