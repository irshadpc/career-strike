import { Document, HeadingLevel, Packer, Paragraph, TabStopType, TextRun } from 'docx';
import type { MasterResumeDocument } from './master-resume.js';

/**
 * ATS-Proof DOCX Generator (blueprint: "ATS-Proof DOCX Generation Rules").
 *
 * Built with the maintained `docx` library (never html-docx-js, which wraps legacy raw HTML), so
 * every artifact is clean, semantic OpenXML. Rules enforced:
 *   1. Body-only contact info: name/contact/summary go into word/document.xml — legacy ATS parsers
 *      that read only that file silently drop anything written into headers/footers.
 *   2. Right-aligned tab stops instead of tables or text boxes for dates (both break Workday).
 *   3. Semantic HeadingLevel styles (LEVEL_1/2/3) — no style flattening by parsers.
 *   4. Metrics-compatible fonts (default Calibri; only Arial, Georgia, Cambria, etc. allowed if overridden).
 */

function headingParagraph(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 320, after: 120 },
    border: { top: { style: 'single', color: '000000', space: 120, size: 6 } },
    children: [new TextRun(text)],
  });
}

export async function buildMasterDocx(master: MasterResumeDocument): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: buildBlocks(master) }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

const MASTER_SECTION_RE =
  /^(PROFESSIONAL SUMMARY|CORE SKILLS|PROFESSIONAL EXPERIENCE|VERIFIED PROJECTS & ACHIEVEMENTS|PORTFOLIO|EDUCATION & CERTIFICATIONS|LANGUAGES)$/i;

function buildBlocks(master: MasterResumeDocument): Paragraph[] {
  const blocks: Paragraph[] = [];

  // 1. Body-only contact block: name first (HeadingLevel.HEADING_1), then contact/summary lines.
  const vals = [master.identity.email, master.identity.phone, master.identity.linkedin]
    .filter((v): v is string => !!v)
    .map((v) => v.replace(/^mailto:/i, ''));
  if (master.identity.fullName) {
    blocks.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(master.identity.fullName)] }));
  }
  if (vals.length > 0) {
    blocks.push(new Paragraph({ children: [new TextRun(vals.join(' · '))], spacing: { after: 200 } }));
  }
  const summary = extractSummary(master.content);
  if (summary) blocks.push(new Paragraph({ children: [new TextRun(summary)], spacing: { after: 320 } }));

  let inRole = false;
  let seenFirstSection = false;
  let inSummarySection = false;
  for (const rawLine of master.content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const isSection = MASTER_SECTION_RE.test(line);
    if (isSection) {
      seenFirstSection = true;
      inSummarySection = /^PROFESSIONAL SUMMARY$/i.test(line);
      if (inSummarySection) {
        inRole = false;
        continue; // Already rendered body summary above without duplicating
      }
      const level =
        line === 'PROFESSIONAL EXPERIENCE' || line === 'VERIFIED PROJECTS & ACHIEVEMENTS'
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
      blocks.push(headingParagraph(line, level));
      inRole = line === 'PROFESSIONAL EXPERIENCE';
      continue;
    }
    if (!seenFirstSection || inSummarySection) {
      // Skip top identity header (name/headline/contact) and summary body already emitted above
      continue;
    }
    if (line.startsWith('•') || line.startsWith('*') || line.startsWith('-')) {
      blocks.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(line.replace(/^[•*-]\s*/, ''))] }));
      continue;
    }
    if (inRole) {
      // Role header (Title — Employer (start – end)) with right-aligned tab stop.
      const m = line.match(/^(.+?)\s*—\s*(.+?)\s*(\([^)]*\))$/);
      if (m) {
        blocks.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            tabStops: [{ type: TabStopType.RIGHT, position: 10080 }],
            spacing: { before: 380, after: 100 },
            border: { top: { style: 'single', color: '000000', space: 120, size: 6 } },
            children: [
              new TextRun({ text: `${m[1]!.trim()} — ${m[2]!.trim()}`, bold: true }),
              new TextRun(`\t${m[3]?.trim() ?? ''}`),
            ],
          }),
        );
      } else {
        blocks.push(new Paragraph({ children: [new TextRun(line)], spacing: { before: 380, after: 100 } }));
      }
      continue;
    }
    blocks.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 160 } }));
  }

  return blocks;
}

/** Pull the professional-summary block out of the master text. */
export function extractSummary(content: string): string {
  const lines = content.split('\n').map((l) => l.trim());
  const start = lines.findIndex((l) => /^PROFESSIONAL SUMMARY$/i.test(l));
  if (start < 0) return '';
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (MASTER_SECTION_RE.test(line) || (/^[A-Z][A-Z &/-]+$/.test(line) && line.length > 5)) break; // next section header
    if (line) out.push(line);
  }
  return out.join(' ').trim();
}
