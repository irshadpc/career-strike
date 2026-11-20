import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildMasterDocx } from '../../src/career/docx-export.js';
import { verifyExport } from '../../src/career/export-verify.js';
import { buildMasterResume } from '../../src/career/master-resume.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

describe('export-verify engine', () => {
  it('passes all checks on a valid DOCX export', async () => {
    const db = openDb(path.join(tempDir(), 'export-test.db'));
    try {
      const master = buildMasterResume(db);
      const bytes = await buildMasterDocx(master);

      const verification = await verifyExport({
        format: 'docx',
        bytes,
        expected: {
          text: master.content,
          fields: ['Summary'],
        },
      });

      expect(verification.passed).toBe(true);
      expect(verification.checks.length).toBeGreaterThanOrEqual(5);

      const openXmlCheck = verification.checks.find((c) => c.id === 'openxml_hygiene');
      expect(openXmlCheck).toBeDefined();
      expect(openXmlCheck?.status).toBe('PASS');

      const ligatureCheck = verification.checks.find((c) => c.id === 'ligature_scan');
      expect(ligatureCheck?.status).toBe('PASS');

      const sizeCheck = verification.checks.find((c) => c.id === 'size_and_assets');
      expect(sizeCheck?.status).toBe('PASS');
      expect(verification.failures).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('fails vector text presence when expected fields are missing', async () => {
    const db = openDb(path.join(tempDir(), 'export-test.db'));
    try {
      const master = buildMasterResume(db);
      const bytes = await buildMasterDocx(master);

      const verification = await verifyExport({
        format: 'docx',
        bytes,
        expected: {
          text: master.content,
          fields: ['NonexistentSpecialFieldToken999'],
        },
      });

      expect(verification.passed).toBe(false);
      const textCheck = verification.checks.find((c) => c.id === 'vector_text_presence');
      expect(textCheck?.status).toBe('FAIL');
      expect(verification.failures).toContain('Missing fields: NonexistentSpecialFieldToken999.');
    } finally {
      db.close();
    }
  });

  it('detects OpenXML header PII violation', async () => {
    const badDocx = zipSync({
      '[Content_Types].xml': strToU8('<Types></Types>'),
      'word/header1.xml': strToU8(
        '<w:hdr><w:p><w:r><w:t>candidate@example.com (555) 123-4567</w:t></w:r></w:p></w:hdr>',
      ),
      'word/document.xml': strToU8(
        '<w:document><w:body><w:p><w:r><w:t>Safe text</w:t></w:r></w:p></w:body></w:document>',
      ),
    });

    const verification = await verifyExport({
      format: 'docx',
      bytes: Buffer.from(badDocx),
      expected: {
        text: 'Safe text',
        fields: [],
      },
    });

    const openXmlCheck = verification.checks.find((c) => c.id === 'openxml_hygiene');
    expect(openXmlCheck?.status).toBe('FAIL');
    expect(openXmlCheck?.explanation).toContain('Contact PII placed in Word header/footer');
  });

  it('detects OpenXML floating text box violation', async () => {
    const badDocx = zipSync({
      '[Content_Types].xml': strToU8('<Types></Types>'),
      'word/document.xml': strToU8(
        '<w:document><w:body><w:txbxContent><w:p><w:r><w:t>Inside textbox</w:t></w:r></w:p></w:txbxContent></w:body></w:document>',
      ),
    });

    const verification = await verifyExport({
      format: 'docx',
      bytes: Buffer.from(badDocx),
      expected: {
        text: 'Inside textbox',
        fields: [],
      },
    });

    const openXmlCheck = verification.checks.find((c) => c.id === 'openxml_hygiene');
    expect(openXmlCheck?.status).toBe('FAIL');
    expect(openXmlCheck?.explanation).toContain('Floating text boxes');
  });

  it('fails file size budget when bytes exceed 2.5 MB cap', async () => {
    const hugeBuffer = Buffer.alloc(2.6 * 1024 * 1024, 65); // 2.6 MB of 'A'
    const verification = await verifyExport({
      format: 'docx',
      bytes: hugeBuffer,
      expected: { text: '', fields: [] },
    });

    const sizeCheck = verification.checks.find((c) => c.id === 'size_and_assets');
    expect(sizeCheck?.status).toBe('FAIL');
    expect(verification.failures).toContain('File size exceeds 2.5 MB cap.');
  });
});
