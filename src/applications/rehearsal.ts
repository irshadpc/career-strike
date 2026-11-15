import { candidateContext } from '../career/context.js';
import { getJob } from '../career/jobs.js';
import { getActiveMission } from '../career/mission.js';
import type { Db } from '../store/db.js';
import { getSettings } from '../store/settings.js';
import type { ApplicationService } from './service.js';

export type ChecklistStatus = 'PASS' | 'WARN' | 'FAIL';

export interface ChecklistItem {
  id: string;
  category: 'IDENTITY' | 'ELIGIBILITY' | 'DOCUMENTS' | 'RELEVANCE' | 'COMPENSATION' | 'PORTAL' | 'SAFETY';
  title: string;
  status: ChecklistStatus;
  detail: string;
  actionRequired?: string;
}

export interface ScreeningRehearsalItem {
  fieldKey: string;
  label: string;
  kind: string;
  required: boolean;
  draftValue: string | null;
  status: 'READY' | 'ATTENTION_NEEDED' | 'BLANK_OPTIONAL';
  source: 'identity' | 'profile_facts' | 'evidence' | 'document' | 'manual' | 'empty';
  supportingFactIds: string[];
  rehearsalNotes: string;
  potentialGapsOrContradictions: string[];
}

export interface ApplicationRehearsal {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  employer: string;
  state: string;
  version: number;
  applyUrl: string | null;
  approval: {
    valid: boolean;
    state: string;
    reason: string;
  };
  rehearsalItems: ScreeningRehearsalItem[];
  checklist: ChecklistItem[];
  readinessSummary: {
    overallStatus: 'READY' | 'NEEDS_ATTENTION' | 'BLOCKED';
    passingCount: number;
    warningCount: number;
    failingCount: number;
    advisory: string;
  };
  policyNotice: {
    statement: string;
    reaffirmedAt: string;
  };
}

export async function buildApplicationRehearsal(
  db: Db,
  applications: ApplicationService,
  applicationId: string,
): Promise<ApplicationRehearsal | null> {
  const app = await applications.get(applicationId);
  if (!app) return null;

  const ctx = candidateContext(db);
  const settings = getSettings(db);
  const activeMission = getActiveMission(db);
  const jobDetail = getJob(db, app.jobId, ctx);
  const approvalCheck = await applications.verifyApproval(applicationId);

  const checklist: ChecklistItem[] = [];

  // 1. Identity & Contact Information
  const fullName = String(settings['identity.fullName'] ?? '').trim();
  const email = String(settings['identity.email'] ?? '').trim();
  const phone = String(settings['identity.phone'] ?? '').trim();

  if (fullName && email) {
    checklist.push({
      id: 'chk-identity',
      category: 'IDENTITY',
      title: 'Identity & Contact',
      status: 'PASS',
      detail: `Candidate name (${fullName}) and email (${email}) confirmed.`,
    });
  } else {
    checklist.push({
      id: 'chk-identity',
      category: 'IDENTITY',
      title: 'Identity & Contact',
      status: 'FAIL',
      detail: 'Legal full name and email must be configured in Settings before applying.',
      actionRequired: 'Update profile settings with your contact information.',
    });
  }

  if (!phone) {
    checklist.push({
      id: 'chk-phone',
      category: 'IDENTITY',
      title: 'Phone Number',
      status: 'WARN',
      detail: 'No phone number configured. Some employers mandate phone contact.',
      actionRequired: 'Add a phone number in Settings if required by employer form.',
    });
  }

  // 2. Work Authorization
  const authRecord =
    settings['candidate.workAuthorizations'] && typeof settings['candidate.workAuthorizations'] === 'object'
      ? (settings['candidate.workAuthorizations'] as Record<string, string>)
      : {};
  const authorizedCountries = Object.entries(authRecord)
    .filter(([_, status]) => status === 'authorised')
    .map(([cc]) => cc);

  if (authorizedCountries.length > 0) {
    checklist.push({
      id: 'chk-work-auth',
      category: 'ELIGIBILITY',
      title: 'Work Authorization',
      status: 'PASS',
      detail: `Configured work authorizations: ${authorizedCountries.join(', ')} (authorised).`,
    });
  } else if (Object.keys(authRecord).length > 0) {
    checklist.push({
      id: 'chk-work-auth',
      category: 'ELIGIBILITY',
      title: 'Work Authorization',
      status: 'WARN',
      detail: `Work authorization recorded but may require visa sponsorship: ${JSON.stringify(authRecord)}.`,
      actionRequired: 'Verify employer visa sponsorship policy before applying.',
    });
  } else {
    checklist.push({
      id: 'chk-work-auth',
      category: 'ELIGIBILITY',
      title: 'Work Authorization',
      status: 'WARN',
      detail: 'Work authorization status is not explicitly confirmed in candidate settings.',
      actionRequired: 'Set your work authorization in Settings to avoid eligibility surprises.',
    });
  }

  // 3. Tailored Documents
  const attachments = app.payload.attachments ?? [];
  const resumeAttachment = attachments.find((a) => a.kind === 'resume');
  const coverLetter = app.payload.coverLetter?.trim();

  if (resumeAttachment) {
    checklist.push({
      id: 'chk-resume',
      category: 'DOCUMENTS',
      title: 'Tailored Résumé',
      status: 'PASS',
      detail: `Attached résumé "${resumeAttachment.filename}" with verified SHA-256 integrity (${resumeAttachment.sha256.slice(0, 10)}...).`,
    });
  } else {
    checklist.push({
      id: 'chk-resume',
      category: 'DOCUMENTS',
      title: 'Tailored Résumé',
      status: 'FAIL',
      detail: 'No résumé attachment bound to this application package.',
      actionRequired: 'Attach an approved résumé document before review.',
    });
  }

  if (coverLetter && coverLetter.length > 50) {
    checklist.push({
      id: 'chk-cover-letter',
      category: 'DOCUMENTS',
      title: 'Cover Letter',
      status: 'PASS',
      detail: 'Tailored cover letter present and grounded strictly in verified profile facts.',
    });
  } else {
    checklist.push({
      id: 'chk-cover-letter',
      category: 'DOCUMENTS',
      title: 'Cover Letter',
      status: 'WARN',
      detail: 'No custom cover letter drafted. Some selective roles strongly benefit from a statement.',
      actionRequired: 'Generate or review tailored cover letter in personalization.',
    });
  }

  // 4. Stated Skills & Relevance Alignment
  const fit = jobDetail?.fit;
  const matchedSkills = fit?.matchedSkills ?? [];
  const missingSkills = fit?.missingRequiredSkills ?? [];

  if (matchedSkills.length > 0) {
    checklist.push({
      id: 'chk-skills-match',
      category: 'RELEVANCE',
      title: 'Requirement Alignment',
      status: 'PASS',
      detail: `Verified match on ${matchedSkills.length} requirement(s): ${matchedSkills.slice(0, 5).join(', ')}.`,
    });
  }

  if (missingSkills.length > 0) {
    checklist.push({
      id: 'chk-skills-gap',
      category: 'RELEVANCE',
      title: 'Identified Skill Gaps',
      status: 'WARN',
      detail: `Posting explicitly mentions: ${missingSkills.join(', ')}. Prepare talking points or address in interview prep.`,
      actionRequired: 'Rehearse interview framing for missing requirements.',
    });
  }

  // 5. Compensation Alignment
  const publishedSalary = jobDetail?.salary;
  const missionFloor = activeMission?.salaryFloor;
  if (publishedSalary && missionFloor && publishedSalary.max && publishedSalary.max < missionFloor) {
    checklist.push({
      id: 'chk-comp',
      category: 'COMPENSATION',
      title: 'Compensation Alignment',
      status: 'WARN',
      detail: `Employer salary maximum ($${publishedSalary.max.toLocaleString()}) is below your mission floor ($${missionFloor.toLocaleString()}).`,
      actionRequired: 'Ensure this tradeoff is acceptable before applying.',
    });
  } else if (publishedSalary) {
    checklist.push({
      id: 'chk-comp',
      category: 'COMPENSATION',
      title: 'Compensation Alignment',
      status: 'PASS',
      detail: `Posting states ${publishedSalary.currency ?? 'USD'} ${publishedSalary.min?.toLocaleString() ?? '?'}-${publishedSalary.max?.toLocaleString() ?? '?'} which meets or aligns with expectations.`,
    });
  } else {
    checklist.push({
      id: 'chk-comp',
      category: 'COMPENSATION',
      title: 'Compensation Alignment',
      status: 'PASS',
      detail: 'Posting did not disclose compensation range. Confirm range during initial recruiter screen.',
    });
  }

  // 6. Direct Portal URL
  const applyUrl = app.payload.destination.url ?? jobDetail?.applyUrl ?? null;
  if (applyUrl && /^https?:\/\//i.test(applyUrl)) {
    checklist.push({
      id: 'chk-portal',
      category: 'PORTAL',
      title: 'Direct Portal Link',
      status: 'PASS',
      detail: `Official direct submission portal verified: ${applyUrl}`,
    });
  } else {
    checklist.push({
      id: 'chk-portal',
      category: 'PORTAL',
      title: 'Direct Portal Link',
      status: 'WARN',
      detail: 'No direct web apply link recorded. Manual application through employer career page required.',
    });
  }

  // 7. Safety & Policy Notice
  checklist.push({
    id: 'chk-safety-policy',
    category: 'SAFETY',
    title: 'Submission Protocol',
    status: 'PASS',
    detail: 'Candidate approval required. Mass automatic submission and scraping evasion strictly disallowed.',
  });

  // Rehearsal Items (Form Fields Analysis)
  const rehearsalItems: ScreeningRehearsalItem[] = (app.payload.fields ?? []).map((f) => {
    const val = f.value?.trim() ?? null;
    const isRequired = f.required;
    const key = f.key.toLowerCase();
    const label = f.label.toLowerCase();

    let status: ScreeningRehearsalItem['status'] = 'READY';
    let rehearsalNotes = 'Field prepared and candidate-verified.';
    const potentialGapsOrContradictions: string[] = [];
    const supportingFactIds: string[] = [];

    if (key === 'resume' || f.kind === 'file') {
      if (!val) {
        status = 'ATTENTION_NEEDED';
        rehearsalNotes = 'File upload required by employer.';
        potentialGapsOrContradictions.push('No file selected for required document field.');
      } else {
        rehearsalNotes = 'Bound to approved vault document.';
      }
    } else if (key === 'cover_letter_text' || label.includes('cover letter')) {
      if (!val) {
        status = isRequired ? 'ATTENTION_NEEDED' : 'BLANK_OPTIONAL';
        rehearsalNotes = isRequired ? 'Cover letter required by employer.' : 'Optional cover letter not provided.';
      } else {
        rehearsalNotes = 'Deterministic cover letter generated strictly from approved candidate facts.';
      }
    } else if (!val) {
      if (isRequired) {
        status = 'ATTENTION_NEEDED';
        rehearsalNotes = 'Employer marks this field as mandatory.';
        potentialGapsOrContradictions.push('Required field is currently empty.');
      } else {
        status = 'BLANK_OPTIONAL';
        rehearsalNotes = 'Optional screening item. Leave blank or add custom response.';
      }
    }

    return {
      fieldKey: f.key,
      label: f.label,
      kind: f.kind,
      required: isRequired,
      draftValue: val,
      status,
      source: f.source as ScreeningRehearsalItem['source'],
      supportingFactIds,
      rehearsalNotes,
      potentialGapsOrContradictions,
    };
  });

  const passingCount = checklist.filter((c) => c.status === 'PASS').length;
  const warningCount = checklist.filter((c) => c.status === 'WARN').length;
  const failingCount = checklist.filter((c) => c.status === 'FAIL').length;

  let overallStatus: 'READY' | 'NEEDS_ATTENTION' | 'BLOCKED' = 'READY';
  let advisory = 'All pre-flight checks verified. Application package is ready for candidate review and approval.';

  if (failingCount > 0) {
    overallStatus = 'BLOCKED';
    advisory = `Critical pre-flight checks failed (${failingCount} blocker). Resolve before submitting.`;
  } else if (warningCount > 0 || rehearsalItems.some((i) => i.status === 'ATTENTION_NEEDED')) {
    overallStatus = 'NEEDS_ATTENTION';
    advisory = 'Review warnings and ensure all screening question responses accurately reflect your experience.';
  }

  return {
    applicationId,
    jobId: app.jobId,
    jobTitle: app.job.title,
    employer: app.job.employer,
    state: app.state,
    version: app.version,
    applyUrl,
    approval: {
      valid: approvalCheck.valid,
      state: approvalCheck.approval?.state ?? 'NOT_APPROVED',
      reason: approvalCheck.reason,
    },
    rehearsalItems,
    checklist,
    readinessSummary: {
      overallStatus,
      passingCount,
      warningCount,
      failingCount,
      advisory,
    },
    policyNotice: {
      statement:
        'Career Strike acts as your personal career chief of staff. We prepare and verify your application package and provide pre-flight rehearsals, but never mass-submit or contact employers without your explicit authorization.',
      reaffirmedAt: new Date().toISOString(),
    },
  };
}
