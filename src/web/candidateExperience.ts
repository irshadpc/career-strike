import type { Interview, ProfileFact } from './api';

/** Generates RFC-5545 iCalendar content for an interview. */
export function generateInterviewIcsContent(params: {
  interview: Interview;
  employer: string;
  jobTitle: string;
}): string {
  const { interview, employer, jobTitle } = params;
  const dt = new Date(interview.scheduledAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const start = formatUtc(dt);
  const end = formatUtc(new Date(dt.getTime() + 60 * 60 * 1000));
  const now = formatUtc(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Career Strike//Candidate Interview Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:cs-int-${interview.id}@careerstrike.local`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:Interview: ${interview.stage} (${jobTitle} at ${employer})`,
    `DESCRIPTION:Stage: ${interview.stage}\\nCompany: ${employer}\\nRole: ${jobTitle}\\nFormat: ${interview.format}\\n\\nPrep in Career Strike: Open dashboard to review matched STAR stories and requirements.`,
    `LOCATION:${interview.format === 'video' ? 'Video Conference' : interview.format === 'phone' ? 'Phone Call' : employer}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

/** Generates and triggers download of an RFC-5545 .ics iCalendar file for scheduled interviews. */
export function downloadInterviewIcs(params: { interview: Interview; employer: string; jobTitle: string }): void {
  if (typeof document === 'undefined') return;

  const { interview, employer, jobTitle } = params;
  const content = generateInterviewIcsContent({ interview, employer, jobTitle });
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeEmployer = employer.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const safeStage = interview.stage.toLowerCase().replace(/[^a-z0-9]/g, '-');
  a.download = `interview-${safeEmployer}-${safeStage}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export {
  buildOutreachDraft,
  type OutreachKind,
  type OutreachTemplate,
} from '../outreach/templates.js';

/** Matches a prep topic against candidate verified profile facts (skills, roles, achievements). */
export function findMatchingCareerEvidence(
  topicTitle: string,
  facts: ProfileFact[],
): { skills: string[]; roles: string[] } {
  const normalizedTopic = topicTitle.toLowerCase();
  const tokens = normalizedTopic.split(/[\s,/-]+/).filter((t) => t.length > 2);

  const matchedSkills: string[] = [];
  const matchedRoles: string[] = [];

  for (const fact of facts) {
    if (fact.kind === 'skill' && typeof fact.value.name === 'string') {
      const s = fact.value.name;
      const norm = s.toLowerCase();
      if (tokens.some((tok) => norm.includes(tok) || tok.includes(norm))) {
        if (!matchedSkills.includes(s)) matchedSkills.push(s);
      }
    } else if (fact.kind === 'role' && typeof fact.value.title === 'string' && typeof fact.value.company === 'string') {
      const roleStr = `${fact.value.title} at ${fact.value.company}`;
      const norm = roleStr.toLowerCase();
      if (tokens.some((tok) => norm.includes(tok))) {
        if (!matchedRoles.includes(roleStr)) matchedRoles.push(roleStr);
      }
    }
  }

  return {
    skills: matchedSkills.slice(0, 4),
    roles: matchedRoles.slice(0, 2),
  };
}
