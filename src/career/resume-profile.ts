/** Best-effort extraction of identity fields from résumé text. Local only; results are suggestions. */
export interface ResumeProfile {
  fullName?: string;
  headline?: string;
  summary?: string;
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
  'projects',
  'contact',
  'contact information',
  'technical strengths',
  'domains',
  'professional experience',
  'work experience',
];

function isHeader(line: string): boolean {
  const l = line
    .trim()
    .toLowerCase()
    .replace(/[:\-–—]+$/, '')
    .trim();
  return SECTION_HEADERS.includes(l);
}

function sectionText(text: string, names: string[]): string | undefined {
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
  if (start < 0) return undefined;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (isHeader(line)) break;
    out.push(line);
  }
  const joined = out.join(' ').replace(/\s+/g, ' ').trim();
  return joined ? joined : undefined;
}

export function extractResumeProfile(text: string): ResumeProfile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const result: ResumeProfile = {};

  if (lines.length > 0) {
    const first = lines[0]!;
    const m = first.match(/^(.{2,60}?)\s*[-–—|]\s*(.{2,80})$/);
    if (m && !isHeader(first) && !first.includes('@')) {
      const left = m[1]!.trim();
      const right = m[2]!.trim();
      if (left.length <= 60 && !/\d{3,}/.test(left)) result.fullName = left.slice(0, 150);
      if (right.length <= 120 && !/^skills?:/i.test(right)) result.headline = right.slice(0, 150);
    } else if (
      first.length > 0 &&
      first.length <= 80 &&
      !isHeader(first) &&
      !first.includes('@') &&
      !/^https?:/i.test(first) &&
      !/\d{3,}/.test(first)
    ) {
      result.fullName = first.slice(0, 150);
    }
  }

  if (!result.headline) {
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      const line = lines[i]!;
      if (isHeader(line)) continue;
      if (line.includes('@') || /^https?:/i.test(line)) continue;
      if (/^skills?:/i.test(line)) continue;
      if (line.length > 0 && line.length <= 120) {
        result.headline = line.slice(0, 150);
        break;
      }
    }
  }

  const summary = sectionText(text, ['summary', 'about', 'profile', 'objective', 'about me', 'professional summary']);
  if (summary) result.summary = summary.slice(0, 2000);

  return result;
}
