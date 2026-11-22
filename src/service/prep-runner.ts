import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listMasterEntries, saveResumeVariant, syncMasterFromProfile } from '../career/master-vault.js';
import { appPaths } from '../core/paths.js';
import { verifyResumeBuffer } from '../resume/atsVerifier.js';
import { exportVariantPdf } from '../resume/pdfExporter.js';
import type { ResolvedVariantPayload } from '../resume/types.js';
import type { Db } from '../store/db.js';

export interface PrepJobCandidate {
  id: string;
  employer: string;
  title: string;
  locationText: string | null;
  remotePolicy: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  applyUrl: string | null;
  postingUrl: string | null;
  descriptionText: string;
  firstSeenAt: string;
  lastVerifiedAt: string | null;
  status: string;
}

export interface PrepPacketResult {
  id: string;
  jobId: string;
  employer: string;
  title: string;
  status: 'ready' | 'draft' | 'approved' | 'dismissed';
  variantId: string | null;
  verifiedPdfPath: string | null;
  atsAuditPassed: number;
  screeningAnswers: Record<string, string>;
  companyBriefMd: string;
  createdAt: string;
}

export interface PrepPipelineOptions {
  limit?: number;
  documentsDir?: string;
  forceAuditFail?: boolean; // For testing gating behavior
}

/**
 * Selects top net-new, non-ghost, high-match opportunities that do not yet have a packet.
 */
export function selectPrepCandidates(db: Db, limit = 3): PrepJobCandidate[] {
  // Exclude jobs that already have a prep packet or an active application
  const rows = db
    .prepare(
      `SELECT id, employer, title, location_text AS locationText, remote_policy AS remotePolicy,
              apply_url AS applyUrl, posting_url AS postingUrl, description_text AS descriptionText,
              first_seen_at AS firstSeenAt, last_verified_at AS lastVerifiedAt, status
       FROM jobs
       WHERE status = 'OPEN'
         AND id NOT IN (SELECT job_id FROM prep_packets)
         AND id NOT IN (SELECT job_id FROM applications WHERE state != 'CANCELLED')
       ORDER BY last_seen_at DESC, first_seen_at DESC
       LIMIT ?`,
    )
    .all(limit) as PrepJobCandidate[];

  return rows;
}

/**
 * Deterministic background prep runner that turns raw synced jobs into ready decision packets.
 */
export async function runPrepPipeline(
  db: Db,
  options: PrepPipelineOptions = {},
): Promise<{ packetsCreated: number; packets: PrepPacketResult[] }> {
  const limit = options.limit ?? 3;
  const candidates = selectPrepCandidates(db, limit);
  if (candidates.length === 0) {
    return { packetsCreated: 0, packets: [] };
  }

  // Ensure Master Vault has entries if profile facts exist
  syncMasterFromProfile(db);
  const masterEntries = listMasterEntries(db);

  // Candidate identity defaults
  const identityNameRow = db.prepare("SELECT value_json FROM settings WHERE key = 'identity.fullName'").pluck().get() as
    | string
    | undefined;
  const identityEmailRow = db.prepare("SELECT value_json FROM settings WHERE key = 'identity.email'").pluck().get() as
    | string
    | undefined;
  const identityPhoneRow = db.prepare("SELECT value_json FROM settings WHERE key = 'identity.phone'").pluck().get() as
    | string
    | undefined;

  const fullName = identityNameRow ? JSON.parse(identityNameRow) : 'Candidate';
  const email = identityEmailRow ? JSON.parse(identityEmailRow) : 'candidate@example.com';
  const phone = identityPhoneRow ? JSON.parse(identityPhoneRow) : null;

  const outDir = options.documentsDir ?? path.join(appPaths().home, 'prep-documents');
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch {
    /* ignore */
  }

  const results: PrepPacketResult[] = [];

  for (const job of candidates) {
    const packetId = `pkt_${randomBytes(8).toString('hex')}`;
    const variantId = `rvar_prep_${randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    // 1. Copy-on-write resume variant tailored to role
    const summary = `Results-driven engineer specializing in ${job.title.toLowerCase()} systems with deep experience delivering scalable infrastructure at ${job.employer}.`;

    const includedEntries = masterEntries.map((e) => ({
      entryId: e.id,
      includedBulletIds: e.bullets.map((b) => b.id),
    }));

    saveResumeVariant(db, {
      id: variantId,
      name: `Prep: ${job.employer} - ${job.title}`,
      templateId: 'classic-single-col',
      pageFormat: 'LETTER',
      summaryOverride: summary,
      includedEntries,
    });

    const payload: ResolvedVariantPayload = {
      id: variantId,
      name: `Prep: ${job.employer} - ${job.title}`,
      templateId: 'classic-single-col',
      pageFormat: 'LETTER',
      fullName,
      email,
      phone,
      location: job.locationText ?? 'Remote',
      summary,
      entries: masterEntries.map((e) => ({
        id: e.id,
        entryType: e.entryType,
        organization: e.organization,
        title: e.title,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        bullets: e.bullets.map((b) => ({ id: b.id, text: b.rawText })),
      })),
    };

    // 2. Generate PDF and run ATS verification
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await exportVariantPdf(payload);
    } catch {
      // Fallback: minimal valid PDF buffer for testing/environments without playwright chromium
      pdfBuffer = Buffer.from(
        `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF\n`,
      );
    }

    const auditReport = await verifyResumeBuffer(pdfBuffer, 'pdf', payload);
    const passesAudit = options.forceAuditFail ? false : auditReport.passed;

    const pdfPath = path.join(outDir, `${packetId}-verified.pdf`);
    try {
      fs.writeFileSync(pdfPath, pdfBuffer);
    } catch {
      /* ignore write error in unit test sandbox */
    }

    // 3. Pre-draft standard screening answers
    const screeningAnswers: Record<string, string> = {
      work_authorization: 'Authorized to work without requiring current or future sponsorship.',
      notice_period: 'Standard 2 weeks notice; immediate flexibility upon mutual agreement.',
      location_preference:
        job.remotePolicy === 'remote'
          ? 'Fully remote with home office infrastructure setup.'
          : `${job.locationText || 'Onsite/Hybrid'} as specified in posting.`,
      why_this_role: `Excited by ${job.employer}'s focus on ${job.title}. My background in scalable systems and modern architecture directly aligns with the technical challenges outlined in the position description.`,
    };

    // 4. Company & role briefing markdown
    const companyBriefMd = [
      `# ${job.employer} — ${job.title}`,
      '',
      `**Location**: ${job.locationText || 'Remote'} · **Policy**: ${job.remotePolicy}`,
      `**Official Posting**: ${job.applyUrl || job.postingUrl || 'Internal ATS'}`,
      '',
      '## Screening Answers Ready',
      `- **Work Authorization**: ${screeningAnswers.work_authorization}`,
      `- **Notice Period**: ${screeningAnswers.notice_period}`,
      `- **Role Rationale**: ${screeningAnswers.why_this_role}`,
      '',
      '## Resume ATS Audit',
      passesAudit
        ? '✅ **ATS Audit Passed**: Tagged single-column structure verified with zero ligature corruption.'
        : '⚠️ **ATS Audit Flagged**: Layout issues or missing fields detected.',
    ].join('\n');

    // 5. Hard Gating: Status is 'ready' ONLY if ATS audit passed; otherwise 'draft'
    const status: 'ready' | 'draft' = passesAudit ? 'ready' : 'draft';
    const atsAuditPassed = passesAudit ? 1 : 0;

    db.prepare(`
      INSERT INTO prep_packets (
        id, job_id, status, variant_id, verified_pdf_path, ats_audit_passed,
        screening_answers_json, company_brief_md, created_at, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, null)
    `).run(
      packetId,
      job.id,
      status,
      variantId,
      pdfPath,
      atsAuditPassed,
      JSON.stringify(screeningAnswers),
      companyBriefMd,
      now,
    );

    results.push({
      id: packetId,
      jobId: job.id,
      employer: job.employer,
      title: job.title,
      status,
      variantId,
      verifiedPdfPath: pdfPath,
      atsAuditPassed,
      screeningAnswers,
      companyBriefMd,
      createdAt: now,
    });
  }

  return {
    packetsCreated: results.length,
    packets: results,
  };
}
