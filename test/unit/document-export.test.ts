import { describe, expect, it } from 'vitest';
import {
  createExport,
  EXPORT_MIME,
  exportHistory,
  parserReport,
  renderDocx,
  renderPdf,
} from '../../src/career/document-export.js';
import { openDb } from '../../src/store/db.js';
import { extractDocumentText } from '../../src/vault/text-extraction.js';

const source = [
  'JORDAN EXAMPLE',
  'Platform Engineer',
  'jordan@example.com',
  '',
  'PROFESSIONAL SUMMARY',
  'Engineer with TypeScript and Kubernetes experience.',
  'Led a migration that cut deploy time by 40%.',
].join('\n');

describe('local document export', () => {
  it('writes a readable PDF with a correct header and no external renderer', () => {
    const bytes = renderPdf('Master Resume', source);
    expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(bytes.toString('latin1')).toContain('%%EOF');
    const text = extractDocumentText(EXPORT_MIME.pdf, bytes);
    expect(text).toContain('JORDAN EXAMPLE');
    expect(text).toContain('TypeScript and Kubernetes');
  });

  it('writes a DOCX package that the local extractor reads back', () => {
    const bytes = renderDocx('Master Resume', source);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const text = extractDocumentText(EXPORT_MIME.docx, bytes);
    expect(text).toContain('JORDAN EXAMPLE');
    expect(text).toContain('PROFESSIONAL SUMMARY');
  });

  it('escapes PDF and XML syntax instead of producing a broken file', () => {
    const tricky = 'Acme (Europe) \\ R&D <team> & "quotes"';
    expect(extractDocumentText(EXPORT_MIME.pdf, renderPdf('Resume', tricky))).toContain(tricky);
    expect(extractDocumentText(EXPORT_MIME.docx, renderDocx('Resume', tricky))).toContain(tricky);
  });

  it('reports local parser coverage and states that it is not ATS certification', () => {
    const bytes = renderPdf('Master Resume', source);
    const report = parserReport(source, bytes, 'pdf');
    expect(report.extracted).toBe(true);
    expect(report.basis).toBe('LOCAL_PARSER_TEST_ONLY');
    expect(report.note).toContain('not a test by any named ATS');
    expect(report.note).toContain('not a guarantee');
    expect(report.wordCoverage).toBe(1);
    expect(report.missingWords).toEqual([]);
  });

  it('logs each export by hash without storing a second copy', () => {
    const db = openDb(':memory:');
    try {
      const exported = createExport(db, {
        content: source,
        title: 'Master Resume',
        kind: 'resume',
        format: 'docx',
        source: 'MASTER',
      });
      expect(exported.filename).toMatch(/^master-resume-\d{4}-\d{2}-\d{2}\.docx$/);
      const history = exportHistory(db);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ format: 'docx', source: 'MASTER', sha256: exported.sha256 });
      expect(history[0]!.sizeBytes).toBe(exported.sizeBytes);
      senseAudit(db);
    } finally {
      db.close();
    }
  });
});

function senseAudit(db: ReturnType<typeof openDb>): void {
  const action = db.prepare("SELECT action FROM audit_events WHERE action = 'document.exported'").pluck().get() as
    | string
    | null;
  expect(action).toBe('document.exported');
}
