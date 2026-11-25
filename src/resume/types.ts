export type AtsCheckStatus = 'pass' | 'warn' | 'fail';

export interface AtsCheckResult {
  id: string;
  label: string;
  status: AtsCheckStatus;
  explanation: string;
  metrics?: Record<string, unknown>;
}

export interface AtsAuditReport {
  passed: boolean;
  format: 'pdf' | 'docx';
  checks: AtsCheckResult[];
  warnings: string[];
  failures: string[];
  fileSizeBytes: number;
  sha256: string;
  extractedCharacters: number;
  extractedText: string;
  xyCutParity?: number;
  tokenRecall?: number;
}

export interface ResumeVariantEntry {
  id: string;
  entryType: 'experience' | 'project' | 'education' | 'certification';
  organization: string;
  title: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  bullets: {
    id: string;
    text: string;
  }[];
}

export interface ResolvedVariantPayload {
  id: string;
  name: string;
  templateId: string;
  pageFormat: 'LETTER' | 'A4';
  fullName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: string[];
  summary?: string | null;
  skills?: string[];
  languages?: string[];
  entries: ResumeVariantEntry[];
}
