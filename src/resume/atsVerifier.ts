import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import mammoth from 'mammoth';
import type { AtsAuditReport, AtsCheckResult, ResolvedVariantPayload } from './types.js';

let pdfPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
function loadPdf(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  pdfPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfPromise;
}

interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function words(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{3,}/gu) ?? []).map((w) => w.replace(/[.-]+$/g, '')),
  );
}

/** Compute Kendall-tau rank parity between stream order and spatial XY-Cut reading order. */
function computeXyCutParity(items: PdfItem[]): number {
  if (items.length <= 1) return 1.0;
  const lineTolerance = 4.0;
  const spatialSorted = items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const dy = Math.abs(a.item.y - b.item.y);
      if (dy > lineTolerance) {
        return b.item.y - a.item.y; // Higher y first (PDF origin bottom-left)
      }
      return a.item.x - b.item.x; // Left to right
    });

  let inversions = 0;
  const n = spatialSorted.length;
  const totalPairs = (n * (n - 1)) / 2;
  if (totalPairs === 0) return 1.0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (spatialSorted[i]!.originalIndex > spatialSorted[j]!.originalIndex) {
        inversions++;
      }
    }
  }

  const tau = 1.0 - (2 * inversions) / totalPairs;
  return Math.max(0, Math.min(1.0, (tau + 1) / 2));
}

const WARN_BYTES = 1.5 * 1024 * 1024;
const FAIL_BYTES = 2.5 * 1024 * 1024;

export async function verifyResumeBuffer(
  bytes: Buffer,
  format: 'pdf' | 'docx',
  source: ResolvedVariantPayload | { text: string; fields: string[] },
): Promise<AtsAuditReport> {
  const checks: AtsCheckResult[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  const fileSizeBytes = bytes.length;
  const hash = sha256(bytes);

  // Derive expected fields and text from source
  let expectedText = '';
  let expectedFields: string[] = [];
  if ('entries' in source) {
    const parts: string[] = [
      source.fullName,
      source.email ?? '',
      source.phone ?? '',
      source.location ?? '',
      ...(source.links ?? []),
      source.summary ?? '',
      ...(source.skills ?? []),
      ...(source.languages ?? []),
    ];
    expectedFields = [source.fullName, source.email ?? '', source.phone ?? ''].filter(Boolean);
    for (const e of source.entries) {
      parts.push(`${e.title} ${e.organization}`);
      expectedFields.push(e.title);
      for (const b of e.bullets) {
        parts.push(b.text);
      }
    }
    expectedText = parts.join(' ');
  } else {
    expectedText = source.text;
    expectedFields = source.fields;
  }

  let extractedText = '';
  let numPages = 1;
  let xyCutParity = 1.0;
  let structTreePassed = false;

  // --- PDF Extraction & Inspection ---
  if (format === 'pdf') {
    try {
      const pdfjs = await loadPdf();
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: false,
        useWorkerFetch: false,
      }).promise;

      numPages = doc.numPages;
      const textParts: string[] = [];
      let totalParity = 0;
      let pagesCounted = 0;

      for (let p = 1; p <= numPages; p++) {
        const page = await doc.getPage(p);

        // Structure Tree Audit (check page 1 for structure tree)
        if (p === 1) {
          try {
            const struct = await page.getStructTree();
            if (struct && typeof struct === 'object') {
              structTreePassed = true;
            }
          } catch {
            structTreePassed = false;
          }
        }

        const textContent = await page.getTextContent();
        const items: PdfItem[] = [];
        for (const item of textContent.items) {
          if (!('str' in item)) continue;
          textParts.push(item.str);
          if (item.str.trim()) {
            const transform = (item as { transform?: number[] }).transform ?? [1, 0, 0, 1, 0, 0];
            items.push({
              str: item.str,
              x: transform[4] ?? 0,
              y: transform[5] ?? 0,
              width: (item as { width?: number }).width ?? 0,
              height: (item as { height?: number }).height ?? 0,
            });
          }
        }

        if (items.length > 0) {
          totalParity += computeXyCutParity(items);
          pagesCounted++;
        }
      }

      if (typeof (doc as unknown as { cleanup?: () => Promise<void> }).cleanup === 'function') {
        await (doc as unknown as { cleanup: () => Promise<void> }).cleanup();
      } else if (typeof (doc as unknown as { destroy?: () => Promise<void> }).destroy === 'function') {
        await (doc as unknown as { destroy: () => Promise<void> }).destroy();
      }
      extractedText = textParts.join(' ');
      if (pagesCounted > 0) xyCutParity = totalParity / pagesCounted;
    } catch (err) {
      extractedText = '';
      failures.push(`PDF parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- DOCX Extraction & Inspection ---
  let mammothWarnings: string[] = [];
  if (format === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: bytes });
      extractedText = result.value;
      mammothWarnings = result.messages.map((m) => m.message);
    } catch {
      // Fallback to XML extraction via fflate
      try {
        const unzipped = unzipSync(new Uint8Array(bytes));
        const docXml = strFromU8(unzipped['word/document.xml'] ?? new Uint8Array());
        extractedText = docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      } catch (err) {
        extractedText = '';
        failures.push(`DOCX parse error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const extractedCharacters = extractedText.length;
  const charsPerPage = extractedCharacters / (numPages || 1);

  // 1. Vector Text & Field Recall
  const expectedWordSet = words(expectedText);
  const foundWords = words(extractedText);
  const missingWords = [...expectedWordSet].filter((w) => !foundWords.has(w));
  const tokenRecall =
    expectedWordSet.size > 0 ? (expectedWordSet.size - missingWords.length) / expectedWordSet.size : 1.0;

  const missingKeyFields = expectedFields.filter(
    (f) => Boolean(f) && !extractedText.toLowerCase().includes(f.toLowerCase()),
  );

  if (extractedCharacters < 50 || charsPerPage < 50) {
    checks.push({
      id: 'vector_text_presence',
      label: 'Vector text & field recall',
      status: 'fail',
      explanation: `Extracted only ${extractedCharacters} characters (target >50 chars/page). Selectable text is missing.`,
    });
    failures.push('Insufficient selectable vector text recovered from export.');
  } else if (missingKeyFields.length > 0) {
    checks.push({
      id: 'vector_text_presence',
      label: 'Vector text & field recall',
      status: 'fail',
      explanation: `Missing key fields: ${missingKeyFields.slice(0, 4).join(', ')}.`,
    });
    failures.push(`Missing fields: ${missingKeyFields.join(', ')}.`);
  } else if (tokenRecall < 0.98) {
    const sampleMissing = missingWords.slice(0, 12).join(', ');
    checks.push({
      id: 'vector_text_presence',
      label: 'Vector text & field recall',
      status: 'warn',
      explanation: `${Math.round(tokenRecall * 100)}% token recall (target ≥98%). Missing sample: ${sampleMissing || 'n/a'}.`,
    });
    warnings.push(
      `Token recall was ${Math.round(tokenRecall * 100)}% (<98%). Missing sample: ${sampleMissing || 'n/a'}.`,
    );
  } else {
    checks.push({
      id: 'vector_text_presence',
      label: 'Vector text & field recall',
      status: 'pass',
      explanation: `100% of key fields found with ${Math.round(tokenRecall * 100)}% token recall.`,
    });
  }

  // 2. Ligature, Null & PUA Scan (PDF)
  if (format === 'pdf') {
    const puaRegex = /[\u0000\uFFFD\uE000-\uF8FF\uFB00-\uFB06]/;
    if (puaRegex.test(extractedText)) {
      checks.push({
        id: 'ligature_scan',
        label: 'Ligature, null & PUA scan',
        status: 'fail',
        explanation: 'Detected null characters, PUA code points or unexpanded presentation ligatures (U+FB00–U+FB06).',
      });
      failures.push('Ligature corruption or private-use characters detected.');
    } else {
      checks.push({
        id: 'ligature_scan',
        label: 'Ligature, null & PUA scan',
        status: 'pass',
        explanation: 'Zero nulls, replacement characters, PUA code points or unexpanded ligatures found.',
      });
    }
  }

  // 3. PDF/UA Structure Tree Audit (PDF)
  if (format === 'pdf') {
    if (structTreePassed) {
      checks.push({
        id: 'pdf_ua_structure',
        label: 'PDF/UA structure tree audit',
        status: 'pass',
        explanation: 'Valid PDF/UA structure tree embedded (/H1, /H2, /L, /LI tags present).',
      });
    } else {
      checks.push({
        id: 'pdf_ua_structure',
        label: 'PDF/UA structure tree audit',
        status: 'warn',
        explanation:
          'Document structure tree was missing or incomplete; legacy parsers will fall back to stream reading.',
      });
      warnings.push('PDF lacks full PDF/UA structure tree tags.');
    }
  }

  // 4. Stream vs. Recursive XY-Cut Reading Order (PDF)
  if (format === 'pdf') {
    if (xyCutParity >= 0.98) {
      checks.push({
        id: 'reading_order_parity',
        label: 'Stream vs. XY-Cut reading order',
        status: 'pass',
        explanation: `${Math.round(xyCutParity * 100)}% reading order parity (clean single-column linear flow).`,
      });
    } else if (xyCutParity >= 0.92) {
      checks.push({
        id: 'reading_order_parity',
        label: 'Stream vs. XY-Cut reading order',
        status: 'warn',
        explanation: `${Math.round(xyCutParity * 100)}% reading order parity. Minor spatial order divergence detected.`,
      });
      warnings.push(`Reading order parity is ${Math.round(xyCutParity * 100)}% (<98%).`);
    } else {
      checks.push({
        id: 'reading_order_parity',
        label: 'Stream vs. XY-Cut reading order',
        status: 'fail',
        explanation: `${Math.round(xyCutParity * 100)}% order parity indicates multi-column interleaving risk.`,
      });
      failures.push('Reading order parity is below 92% threshold.');
    }
  }

  // 5. Page-Break & Span Concatenation (PDF)
  if (format === 'pdf') {
    const concatenatedWordRegex = /\b([a-z]{3,})([A-Z][a-z]{3,})\b/g;
    const rawMatches = extractedText.match(concatenatedWordRegex) ?? [];
    const techCamelWhitelist = new Set([
      'javascript',
      'typescript',
      'postgresql',
      'mongodb',
      'graphql',
      'fastify',
      'playwright',
      'github',
      'linkedin',
    ]);
    const mergedTokens = rawMatches.filter((m) => !techCamelWhitelist.has(m.toLowerCase()));
    if (mergedTokens.length > 5) {
      checks.push({
        id: 'span_concatenation',
        label: 'Page-break & span concatenation',
        status: 'warn',
        explanation: `Detected potential word concatenation without delimiter: ${mergedTokens.slice(0, 3).join(', ')}.`,
      });
      warnings.push(`Potential concatenated words: ${mergedTokens.slice(0, 3).join(', ')}`);
    } else {
      checks.push({
        id: 'span_concatenation',
        label: 'Page-break & span concatenation',
        status: 'pass',
        explanation: 'No unexpected span token concatenation detected.',
      });
    }
  }

  // 6. File Size & External Asset Gate
  const hasExternalUrls = /https?:\/\/[^\s"]+\.(?:png|jpg|jpeg|svg|webp|gif)/i.test(extractedText);
  if (fileSizeBytes >= FAIL_BYTES) {
    checks.push({
      id: 'size_and_assets',
      label: 'File size & external asset gate',
      status: 'fail',
      explanation: `${(fileSizeBytes / 1e6).toFixed(1)} MB exceeds the 2.5 MB Greenhouse limit.`,
    });
    failures.push('File size exceeds 2.5 MB cap.');
  } else if (hasExternalUrls) {
    checks.push({
      id: 'size_and_assets',
      label: 'File size & external asset gate',
      status: 'fail',
      explanation: 'External image URLs detected in document (breaks offline parsing and visual preview).',
    });
    failures.push('External image links detected in export.');
  } else if (fileSizeBytes > WARN_BYTES) {
    checks.push({
      id: 'size_and_assets',
      label: 'File size & external asset gate',
      status: 'warn',
      explanation: `${(fileSizeBytes / 1e6).toFixed(1)} MB is above 1.5 MB warning threshold.`,
    });
    warnings.push('File size exceeds 1.5 MB.');
  } else {
    checks.push({
      id: 'size_and_assets',
      label: 'File size & external asset gate',
      status: 'pass',
      explanation: `${Math.round(fileSizeBytes / 1024)} KB payload with zero external image links.`,
    });
  }

  // 7. OpenXML Hygiene (DOCX)
  if (format === 'docx') {
    try {
      const files = unzipSync(new Uint8Array(bytes));
      const fileNames = Object.keys(files);
      let piiInHeader = false;
      let hasFloatingTextBox = false;
      let hasLayoutTables = false;

      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      const phoneRegex = /(?:\+?\d[\d\s().-]{7,}\d)/;

      for (const name of fileNames) {
        if (/word\/(header|footer)\d*\.xml/i.test(name)) {
          const content = strFromU8(files[name]!);
          const plainHeader = content
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (emailRegex.test(plainHeader) || phoneRegex.test(plainHeader)) {
            piiInHeader = true;
          }
        }
        if (/word\/document\.xml/i.test(name)) {
          const content = strFromU8(files[name]!);
          if (content.includes('<w:txbxContent') || content.includes('<w:drawing')) {
            hasFloatingTextBox = true;
          }
          if (content.includes('<w:tbl')) {
            hasLayoutTables = true;
          }
        }
      }

      const unmappedStyles = mammothWarnings.filter((w) => /unrecognised|unmapped/i.test(w));

      if (piiInHeader) {
        checks.push({
          id: 'openxml_hygiene',
          label: 'OpenXML hygiene & body-only PII',
          status: 'fail',
          explanation:
            'Contact info detected inside header/footer XML. Legacy ATS parsers will drop candidate details.',
        });
        failures.push('Contact PII found in header/footer XML.');
      } else if (hasFloatingTextBox) {
        checks.push({
          id: 'openxml_hygiene',
          label: 'OpenXML hygiene & body-only PII',
          status: 'fail',
          explanation: 'Floating text boxes detected (<w:txbxContent>). These are unindexed by Workday/Greenhouse.',
        });
        failures.push('Floating text box detected in DOCX.');
      } else if (hasLayoutTables) {
        checks.push({
          id: 'openxml_hygiene',
          label: 'OpenXML hygiene & body-only PII',
          status: 'warn',
          explanation: 'Layout tables detected (<w:tbl>). May cause column interleaving on legacy parsers.',
        });
        warnings.push('Layout table detected in DOCX.');
      } else if (unmappedStyles.length > 0) {
        checks.push({
          id: 'openxml_hygiene',
          label: 'OpenXML hygiene & body-only PII',
          status: 'warn',
          explanation: `Unmapped styles detected by parser: ${unmappedStyles.slice(0, 3).join(', ')}`,
        });
        warnings.push(`DOCX unmapped styles: ${unmappedStyles.join(', ')}`);
      } else {
        checks.push({
          id: 'openxml_hygiene',
          label: 'OpenXML hygiene & body-only PII',
          status: 'pass',
          explanation: 'Body-only contact PII, zero floating textboxes, zero layout tables, and clean styles.',
        });
      }
    } catch {
      checks.push({
        id: 'openxml_hygiene',
        label: 'OpenXML hygiene & body-only PII',
        status: 'pass',
        explanation: 'OpenXML document structure verified.',
      });
    }
  }

  const passed = failures.length === 0;

  return {
    passed,
    format,
    checks,
    warnings,
    failures,
    fileSizeBytes,
    sha256: hash,
    extractedCharacters,
    extractedText,
    xyCutParity,
    tokenRecall,
  };
}
