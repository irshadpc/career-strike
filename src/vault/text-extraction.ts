import { decodeHTML } from 'entities';
import { strFromU8, unzipSync } from 'fflate';

/**
 * Best-effort text extraction from a stored document. See the resume-studio blueprint
 * ("Resilient Multi-Stage Resume Parsing"):
 *   - PDFs parse through the official, Node-safe pdfjs-dist legacy build. The previous
 *     hand-rolled regex extractor is kept only as a fallback for PDFs pdfjs cannot read.
 *   - Sparse pages (<50 chars/page) are flagged for manual attention.
 */
export interface ExtractResult {
  text: string | null;
  /** True when the parser saw a body but little text — the signature of a scanned PDF. */
  sparse: boolean;
  /** True when text carries U+0000 / U+FFFD / Private Use Area — the fingerprint of ToUnicode CMap corruption. */
  ligatureCorruption: boolean;
  avgCharsPerPage: number | null;
}

let pdfPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

function loadPdf(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  pdfPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfPromise;
}

export interface PdfOptions {
  sparseCharsPerPage?: number;
}

async function extractPdfText(bytes: Buffer, options: PdfOptions = {}): Promise<ExtractResult> {
  const loaded = await loadPdf();
  const { getDocument, InvalidPDFException } = loaded;
  try {
    const doc = await getDocument({
      // Copy: pdfjs can transfer/detach the source buffer; never mutate the caller's file bytes.
      data: new Uint8Array(Buffer.from(bytes)),
      useSystemFonts: false,
      useWorkerFetch: false,
    }).promise;
    const items: string[] = [];
    let totalChars = 0;
    let pageCount = 0;
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText: string[] = [];
        for (const textItem of content.items) {
          if (!('str' in textItem)) continue;
          pageText.push(String(textItem.str));
        }
        const joined = pageText.join(' ').replace(/\s+/g, ' ').trim();
        items.push(joined);
        totalChars += joined.length;
        pageCount++;
      }
    } finally {
      try {
        if (typeof (doc as unknown as { cleanup?: () => Promise<void> }).cleanup === 'function') {
          await (doc as unknown as { cleanup: () => Promise<void> }).cleanup();
        } else if (typeof (doc as unknown as { destroy?: () => Promise<void> }).destroy === 'function') {
          await (doc as unknown as { destroy: () => Promise<void> }).destroy();
        }
      } catch {
        /* ignore */
      }
    }
    const avg = pageCount > 0 ? totalChars / pageCount : null;
    const text = items.join('\n').trim();
    return {
      text: text || null,
      sparse: avg !== null && avg < (options.sparseCharsPerPage ?? 50),
      ligatureCorruption: hasLigatureCorruption(text),
      avgCharsPerPage: avg,
    };
  } catch (err) {
    if (err instanceof InvalidPDFException) return fallbackExtractPdf(bytes);
    throw err;
  }
}

/**
 * U+0000, U+FFFD and Private Use Area code points are the fingerprint of OpenType ToUnicode CMap
 * corruption from ligature substitution — 'profile' → 'pro le', 'workflow' → 'work ow'.
 */
export function hasLigatureCorruption(text: string | null): boolean {
  if (!text) return false;
  return /[\u0000\uFFFD\uE000-\uF8FF]/.test(text);
}

function fallbackExtractPdf(bytes: Buffer): ExtractResult {
  const raw = bytes.toString('latin1');
  const chunks: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null = streamRegex.exec(raw);
  while (match !== null) {
    chunks.push(extractPdfOperators(match[1] ?? ''));
    match = streamRegex.exec(raw);
  }
  const text = chunks.join('\n').trim();
  const fallback = (raw.match(/\((?:\\.|[^()\\])*\)/g) ?? []).map(decodePdfString).join(' ').trim();
  return {
    text: text || fallback || null,
    sparse: false,
    ligatureCorruption: hasLigatureCorruption(text),
    avgCharsPerPage: null,
  };
}

function extractPdfOperators(content: string): string {
  const out: string[] = [];
  const operatorRegex = /\((?:\\.|[^()\\])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ/gi;
  const match: RegExpExecArray | null = operatorRegex.exec(content);
  while (match !== null) {
    const token = match[0];
    if (/TJ$/i.test(token)) {
      const strings = token.match(/\((?:\\.|[^()\\])*\)/g) ?? [];
      out.push(strings.map(decodePdfString).join(''));
    } else {
      const stringMatch = token.match(/^\(([\s\S]*)\)\s*Tj$/i);
      if (stringMatch) out.push(decodePdfString(`(${stringMatch[1]})`));
    }
    out.push(' ');
  }
  return out.join('');
}

function decodePdfString(token: string): string {
  const inner = token.startsWith('(') && token.endsWith(')') ? token.slice(1, -1) : token;
  let result = '';
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i]!;
    if (ch !== '\\') {
      result += ch;
      i += 1;
      continue;
    }
    const next = inner[i + 1];
    if (next === undefined) {
      i += 1;
      continue;
    }
    if (next === 'n') {
      result += '\n';
      i += 2;
    } else if (next === 'r') {
      result += '\r';
      i += 2;
    } else if (next === 't') {
      result += '\t';
      i += 2;
    } else if (next === 'b') {
      result += '\b';
      i += 2;
    } else if (next === 'f') {
      result += '\f';
      i += 2;
    } else if (next === '(' || next === ')' || next === '\\') {
      result += next;
      i += 2;
    } else if (/[0-7]/.test(next)) {
      let octal = next;
      let j = i + 2;
      while (j < inner.length && j < i + 4 && /[0-7]/.test(inner[j]!)) {
        octal += inner[j]!;
        j += 1;
      }
      result += String.fromCharCode(parseInt(octal, 8));
      i = j;
    } else {
      i += 1;
    }
  }
  return result;
}

function extractDocxText(bytes: Buffer): string | null {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(new Uint8Array(bytes));
  } catch {
    return null;
  }
  const entryName = Object.keys(unzipped).find((name) => /(^|\/)word\/document[^/]*\.xml$/i.test(name));
  if (!entryName) return null;
  const xml = strFromU8(unzipped[entryName]!);
  const paragraphs = xml.split(/<\/w:p>/i);
  const lines = paragraphs
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((m) => decodeHTML(m[1]!)).join(''),
    )
    .filter((line) => line.trim().length > 0);
  return lines.join('\n').trim() || null;
}

/** Async PDF entry point used by the service layer. */
export async function extractPdfTextAsync(bytes: Buffer, options?: PdfOptions): Promise<ExtractResult> {
  return extractPdfText(bytes, options);
}

export async function extractDocumentText(
  mime: string,
  bytes: Buffer,
  options?: PdfOptions,
): Promise<ExtractResult | null> {
  if (mime === 'text/plain' || mime === 'text/markdown' || mime === 'text/x-markdown' || mime.startsWith('text/')) {
    const text = bytes.toString('utf8');
    return { text: text.trim() ? text : null, sparse: false, ligatureCorruption: false, avgCharsPerPage: null };
  }
  if (mime === 'application/pdf') return extractPdfText(bytes, options);
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const text = extractDocxText(bytes);
    return text ? { text, sparse: false, ligatureCorruption: false, avgCharsPerPage: null } : null;
  }
  return null;
}
