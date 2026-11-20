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
  'experience',
  'work experience',
  'professional experience',
  'employment',
  'education',
  'certifications',
  'certificates',
  'languages',
  'skills',
  'core skills',
  'technical skills',
  'technical strengths',
  'domains',
  'projects',
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
  const parts = s.split(/[–—]/);
  if (parts.length >= 2) {
    return { start: parseYear(parts[0]), end: parseYear(parts.slice(1).join('-')) };
  }
  // handle hyphen ranges like "2018 - 2019"
  const hyphenParts = s.split(/\s-\s/);
  if (hyphenParts.length >= 2) {
    return { start: parseYear(hyphenParts[0]), end: parseYear(hyphenParts.slice(1).join('-')) };
  }
  return { start: parseYear(s), end: null };
}

const MONTHS = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|present|current|ongoing/i;

export function extractResumeRoles(text: string): ResumeRole[] {
  const lines = sectionLines(text, ['experience', 'work experience', 'professional experience', 'employment']);
  if (lines.length === 0) return [];
  const roles: ResumeRole[] = [];
  let employer: string | null = null;
  let title: string | null = null;
  let startYear: number | null = null;
  let endYear: number | null = null;
  let bullets: string[] = [];

  const flush = () => {
    if (title) {
      const sy = startYear ?? new Date().getUTCFullYear();
      roles.push({
        title: title.slice(0, 150),
        employer: employer ? employer.slice(0, 150) : null,
        startYear: sy,
        endYear: endYear,
        summary: bullets.length ? bullets.join(' ').slice(0, 2000) : null,
      });
    }
    title = null;
    startYear = null;
    endYear = null;
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      bullets.push(line.replace(/^[•\-*]\s*/, '').trim());
      continue;
    }
    // Date range line (check first)
    const isDateLine =
      MONTHS.test(line) &&
      /\d{4}/.test(line) &&
      (/[–—]/.test(line) || /\s-\s/.test(line) || /present|current|ongoing/i.test(line));
    if (isDateLine) {
      const dr = parseDateRange(line);
      if (dr.start) {
        if (title && startYear === null) {
          startYear = dr.start;
          endYear = dr.end;
        }
      }
      continue;
    }
    // Employer header line with pipe
    const pipeMatch = line.match(/^(.+?)\s*\|\s*(.+)$/);
    if (pipeMatch) {
      const left = pipeMatch[1]!.trim();
      const right = pipeMatch[2]!.trim();
      const rightIsDate = MONTHS.test(right) && /\d{4}/.test(right);
      const rightIsLocation =
        /india|usa|uk|remote|kerala|ernakulam|eranakulam|california|london/i.test(right) && !MONTHS.test(right);
      flush();
      employer = left;
      if (!rightIsDate && !rightIsLocation) {
        // right is a title
        title = right;
      } else {
        // try parse date from right
        const dr = parseDateRange(right);
        if (dr.start && title && startYear === null) {
          startYear = dr.start;
          endYear = dr.end;
        }
      }
      continue;
    }
    // Otherwise treat as a title (new role under current employer)
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
