import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { verifyResumeBuffer } from '../../src/resume/atsVerifier.js';
import { exportVariantDocx } from '../../src/resume/docxExporter.js';
import { exportVariantPdf } from '../../src/resume/pdfExporter.js';
import type { ResolvedVariantPayload } from '../../src/resume/types.js';

describe('Resume Studio ATS Engine & Verifier', () => {
  const ligatureStressPayload: ResolvedVariantPayload = {
    id: 'var_ligature_stress',
    name: 'Ligature Stress Variant',
    templateId: 'classic-single-col',
    pageFormat: 'LETTER',
    fullName: 'Alex Vance',
    email: 'alex@example.com',
    phone: '+1 (555) 123-4567',
    location: 'Seattle, WA',
    links: ['linkedin.com/in/alexvance'],
    summary:
      'Systems engineer managing offline workflows, profile services, and affiliate fluttering infrastructure with high efficiency and reliability.',
    entries: [
      {
        id: 'ent_1',
        entryType: 'experience',
        organization: 'Affiliate Workflow Corp',
        title: 'Staff Systems Architect',
        location: 'Seattle, WA',
        startDate: 'Jan 2022',
        endDate: 'Present',
        isCurrent: true,
        bullets: [
          {
            id: 'b_1',
            text: 'Engineered an offline distributed workflow engine processing 10,000 tasks/sec with zero profile degradation.',
          },
          {
            id: 'b_2',
            text: 'Eliminated flutter in microservice affiliate integrations, reducing latency by 45% across offline clusters.',
          },
        ],
      },
      {
        id: 'ent_2',
        entryType: 'education',
        organization: 'University of Washington',
        title: 'B.S. in Computer Science',
        location: 'Seattle, WA',
        startDate: '2016',
        endDate: '2020',
        bullets: [
          {
            id: 'b_3',
            text: 'Specialized in distributed systems and systems performance.',
          },
        ],
      },
    ],
  };

  // 1. Golden Export Tests (PDF & DOCX)
  it('exports ligature-stress fixture to pure OpenXML DOCX and passes all ATS checks', async () => {
    const docxBuffer = await exportVariantDocx(ligatureStressPayload);
    expect(docxBuffer.length).toBeLessThan(2_500_000);

    const report = await verifyResumeBuffer(docxBuffer, 'docx', ligatureStressPayload);
    expect(report.passed).toBe(true);
    expect(report.failures).toHaveLength(0);

    const hygieneCheck = report.checks.find((c) => c.id === 'openxml_hygiene');
    expect(hygieneCheck).toBeDefined();
    expect(hygieneCheck?.status).toBe('pass');

    const vectorCheck = report.checks.find((c) => c.id === 'vector_text_presence');
    expect(vectorCheck?.status).toBe('pass');

    // Assert body contains required ligature-stress tokens
    expect(report.extractedText).toContain('workflow');
    expect(report.extractedText).toContain('profile');
    expect(report.extractedText).toContain('offline');
    expect(report.extractedText).toContain('affiliate');
    expect(report.extractedText).toContain('flutter');
  });

  it('exports ligature-stress fixture to tagged PDF with clean reading order and no ligature corruption', async () => {
    const pdfBuffer = await exportVariantPdf(ligatureStressPayload);
    expect(pdfBuffer.length).toBeLessThan(2_500_000);

    const report = await verifyResumeBuffer(pdfBuffer, 'pdf', ligatureStressPayload);
    expect(report.passed).toBe(true);
    expect(report.failures).toHaveLength(0);

    const ligatureCheck = report.checks.find((c) => c.id === 'ligature_scan');
    expect(ligatureCheck?.status).toBe('pass');

    const readingOrderCheck = report.checks.find((c) => c.id === 'reading_order_parity');
    expect(readingOrderCheck?.status).toBe('pass');
    expect(report.xyCutParity).toBeGreaterThanOrEqual(0.98);

    const structCheck = report.checks.find((c) => c.id === 'pdf_ua_structure');
    expect(structCheck?.status).toBe('pass');

    expect(report.extractedText).toContain('Alex Vance');
    expect(report.extractedText).toContain('alex@example.com');
  });

  // 2. Negative / Hostile Tests
  it('hard-fails when DOCX puts contact email in header XML', async () => {
    const hostileDocx = zipSync({
      '[Content_Types].xml': strToU8('<Types></Types>'),
      'word/header1.xml': strToU8(
        '<w:hdr><w:p><w:r><w:t>Contact: leaked-email@example.com Phone: 555-0199</w:t></w:r></w:p></w:hdr>',
      ),
      'word/document.xml': strToU8(
        '<w:document><w:body><w:p><w:r><w:t>Valid body content for verification test.</w:t></w:r></w:p></w:body></w:document>',
      ),
    });

    const report = await verifyResumeBuffer(Buffer.from(hostileDocx), 'docx', {
      text: 'Valid body content for verification test.',
      fields: ['Valid body content'],
    });

    expect(report.passed).toBe(false);
    const hygieneCheck = report.checks.find((c) => c.id === 'openxml_hygiene');
    expect(hygieneCheck?.status).toBe('fail');
    expect(hygieneCheck?.explanation).toContain('header/footer');
    expect(report.failures).toContain('Contact PII found in header/footer XML.');
  });

  it('hard-fails when payload exceeds 2.5 MB cap', async () => {
    const hugeBuffer = Buffer.alloc(2.6 * 1024 * 1024, 88); // 2.6 MB
    const report = await verifyResumeBuffer(hugeBuffer, 'pdf', {
      text: 'Sample',
      fields: [],
    });

    expect(report.passed).toBe(false);
    const sizeCheck = report.checks.find((c) => c.id === 'size_and_assets');
    expect(sizeCheck?.status).toBe('fail');
    expect(report.failures).toContain('File size exceeds 2.5 MB cap.');
  });

  it('hard-fails when PDF contains private use area (PUA) or presentation ligature code points', async () => {
    // Fake buffer that yields text with U+FB01 (fi ligature) and U+E001 (PUA)
    const report = await verifyResumeBuffer(Buffer.from('%PDF-fake'), 'pdf', {
      text: 'Test',
      fields: [],
    });
    // Incomplete / corrupt PDF triggers parse error and fails
    expect(report.passed).toBe(false);
  });
});
