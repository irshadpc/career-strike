import { extractDocumentText } from '../vault/text-extraction.js';
import { sha256 } from './document-export.js';
import type { MasterResumeDocument } from './master-resume.js';

/**
 * Round-Trip Binary Verification Engine (blueprint: "The Round-Trip Binary Verification Gate").
 *
 * Generated files are immediately re-parsed by Career Strike's own extractor and audited before
 * release:
 *   1. Vector text & field recall — expected fields (name, email, phone, every role title) must be
 *      present; ≥98% token recall against the source text (WARN below that).
 *   2. Ligature & PUA scan — U+0000 / U+FFFD / Private-Use-Area fingerprints of ToUnicode CMap
 *      corruption from ligature substitution (FAIL on any hit).
 *   3. Sparse page scan — pages with <50 chars are "the signature of a scanned PDF" (WARN/FAIL).
 *   4. File-size budgets — warn at 1.5 MB, hard-fail at 2.5 MB (Greenhouse parse cutoff +
 *      Enhancv's upload ceiling; blueprint warns at 1.5 MB, hard-fails at 2.5 MB).
 *   5. Text presence — the extractor must return at least some text.
 *
 * A file is released only when there are no FAILs. WARNs are surfaced to the candidate as notes.
 */

export interface VerificationCheck {
  id: string;
  label: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  explanation: string;
}

export interface ExportVerification {
  passed: boolean;
  checks: VerificationCheck[];
  warnings: string[];
  /** Issues that, when present, block release. */
  failures: string[];
  generatedSha256: string;
  extractedCharacters: number;
  generatedBytes: number;
}

function words(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{3,}/gu) ?? []).map((w) => w.replace(/[.-]+$/g, '')),
  );
}

function findMissingFields(extracted: string, expected: string): string[] {
  const expectedWords = words(expected);
  if (expectedWords.size === 0) return [];
  const found = words(extracted);
  return [...expectedWords].filter((w) => !found.has(w));
}

const WARN_BYTES = 1.5 * 1024 * 1024;
const FAIL_BYTES = 2.5 * 1024 * 1024;

export async function verifyExport(opts: {
  format: 'pdf' | 'docx';
  bytes: Buffer;
  expected: { text: string; fields: string[] };
}): Promise<ExportVerification> {
  const checks: VerificationCheck[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  const generatedBytes = opts.bytes.length;
  const generatedSha256 = sha256(opts.bytes);

  const extracted = await extractDocumentText(
    opts.format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    opts.bytes,
  );
  const extractedText = extracted?.text ?? '';

  // 1. Text presence + field recall
  if (!extracted || !extracted.text || extracted.text.trim().length === 0) {
    checks.push({
      id: 'text_presence',
      label: 'Text extraction',
      status: 'FAIL',
      explanation: 'Your own extractor could not read back any text from the generated file.',
    });
    failures.push('No text recovered from the generated file.');
  } else {
    checks.push({
      id: 'text_presence',
      label: 'Text extraction',
      status: 'PASS',
      explanation: `${extracted.text.length.toLocaleString()} characters recovered.`,
    });
    const expectedWords = words(opts.expected.text);
    const missingWords = findMissingFields(extractedText, opts.expected.text);
    const recall = expectedWords.size > 0 ? (expectedWords.size - missingWords.length) / expectedWords.size : 1;
    if (recall >= 0.98) {
      checks.push({
        id: 'token_recall',
        label: 'Token recall (≥98%)',
        status: 'PASS',
        explanation: `${Math.round(recall * 100)}% of expected tokens recovered.`,
      });
    } else {
      checks.push({
        id: 'token_recall',
        label: 'Token recall (≥98%)',
        status: 'WARN',
        explanation: `${Math.round(recall * 100)}% of expected tokens recovered.`,
      });
      warnings.push(
        `Only ${Math.round(recall * 100)}% of source tokens were recovered by the local extractor. Inspect and fix the missing fields.`,
      );
    }
    const missingFields = opts.expected.fields.filter((f) => !extractedText.toLowerCase().includes(f.toLowerCase()));
    if (missingFields.length === 0) {
      checks.push({
        id: 'field_recall',
        label: 'Field recall (name/email/phone/roles)',
        status: 'PASS',
        explanation: 'All expected fields are present in the extracted text.',
      });
    } else {
      checks.push({
        id: 'field_recall',
        label: 'Field recall (name/email/phone/roles)',
        status: 'FAIL',
        explanation: `Missing: ${missingFields.slice(0, 8).join(', ')}`,
      });
      failures.push(`Missing fields: ${missingFields.slice(0, 8).join(', ')}.`);
    }
  }

  // 2. Ligature & PUA scan
  if (extracted?.ligatureCorruption) {
    checks.push({
      id: 'ligature_scan',
      label: 'Ligature & PUA scan',
      status: 'FAIL',
      explanation:
        'Found U+0000 / U+FFFD / Private-Use-Area characters — typical ToUnicode CMap corruption from ligature substitution.',
    });
    failures.push('Ligature corruption detected in generated file.');
  } else {
    checks.push({
      id: 'ligature_scan',
      label: 'Ligature & PUA scan',
      status: 'PASS',
      explanation: 'No nulls, replacement characters or PUA code points found.',
    });
  }

  // 3. Sparse page scan
  if (extracted?.sparse) {
    checks.push({
      id: 'sparse_scan',
      label: 'Sparse page scan',
      status: 'WARN',
      explanation: `Average ${Math.floor(extracted.avgCharsPerPage ?? 0)} chars/page — signature of a scanned/raster PDF. OCR is advised; manual entry is the fallback.`,
    });
    warnings.push('The generated file reads as a scanned PDF — consider manual entry or OCR.');
  } else {
    checks.push({
      id: 'sparse_scan',
      label: 'Sparse page scan',
      status: 'PASS',
      explanation: 'Text density above the 50-chars/page scan threshold.',
    });
  }

  // 4. File-size budgets
  if (generatedBytes > FAIL_BYTES) {
    checks.push({
      id: 'size_budget',
      label: 'File-size budget',
      status: 'FAIL',
      explanation: `${(generatedBytes / 1e6).toFixed(1)} MB — over the 2.5 MB hard cap.`,
    });
    failures.push('File too large (>2.5 MB).');
  } else if (generatedBytes > WARN_BYTES) {
    checks.push({
      id: 'size_budget',
      label: 'File-size budget',
      status: 'WARN',
      explanation: `${(generatedBytes / 1e6).toFixed(1)} MB — above the 1.5 MB warning threshold.`,
    });
    warnings.push(
      'File is above the 1.5 MB warning threshold; consider compressing images or reducing embedded fonts.',
    );
  } else {
    checks.push({
      id: 'size_budget',
      label: 'File-size budget',
      status: 'PASS',
      explanation: `${(generatedBytes / 1e3).toFixed(0)} KB.`,
    });
  }

  const passed = failures.length === 0;
  return {
    passed,
    checks,
    warnings,
    failures,
    generatedSha256,
    extractedCharacters: extractedText.length,
    generatedBytes,
  };
}

/** Extract the expected field names (name/email/phone/role titles) from a master resume. */
export function expectedFields(master: MasterResumeDocument): string[] {
  const fields = [master.identity.fullName ?? '', master.identity.email ?? '', master.identity.phone ?? '']
    .filter(Boolean)
    .map((f) => f.trim());
  // Role titles: parse PROFESSIONAL EXPERIENCE role headers (lines with '—' or the format from master).
  for (const line of master.content.split('\n')) {
    const m = line.match(/^\s*(.+?)\s*[—–-]\s*(.+?)(\s*\(\d{4}[^)]*\)?\s*)$/);
    if (m && m[1]!.trim()) fields.push(m[1]!.trim());
  }
  return fields.filter(Boolean);
}
