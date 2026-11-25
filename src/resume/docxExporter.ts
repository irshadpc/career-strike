import { Document, HeadingLevel, Packer, Paragraph, TabStopType, TextRun } from 'docx';
import type { ResolvedVariantPayload } from './types.js';

export async function exportVariantDocx(payload: ResolvedVariantPayload): Promise<Buffer> {
  // Page width in twips: Letter width is 12240 twips (8.5 inches).
  // 0.75 in margins on left and right = 1080 twips each.
  // Printable width = 12240 - 2160 = 10080 twips.
  // For A4 (8.27 in = 11906 twips), printable width with 0.75 in margins = ~9746 twips.
  const rightTabPosition = payload.pageFormat === 'A4' ? 9746 : 10080;

  const children: Paragraph[] = [];

  // 1. Body-Only Contact Info:
  // Heading 1 for candidate name
  const name = payload.fullName || payload.name || 'Candidate';
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({
          text: name,
          bold: true,
          font: 'Calibri',
          size: 32, // 16pt
        }),
      ],
    }),
  );

  // Contact line
  const contactParts = [payload.email, payload.phone, payload.location, ...(payload.links ?? [])].filter(
    (v): v is string => Boolean(v && v.trim()),
  );

  if (contactParts.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 200 },
        children: [
          new TextRun({
            text: contactParts.join(' · '),
            font: 'Calibri',
            size: 20, // 10pt
            color: '4B5563',
          }),
        ],
      }),
    );
  }

  // Summary
  if (payload.summary && payload.summary.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 240 },
        children: [
          new TextRun({
            text: payload.summary.trim(),
            font: 'Calibri',
            size: 21, // 10.5pt
          }),
        ],
      }),
    );
  }

  // Helper for section headings
  const addSection = (title: string, entries: typeof payload.entries) => {
    if (entries.length === 0) return;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
        border: {
          bottom: { style: 'single', color: '111827', space: 60, size: 6 },
        },
        children: [
          new TextRun({
            text: title.toUpperCase(),
            bold: true,
            font: 'Calibri',
            size: 22, // 11pt
          }),
        ],
      }),
    );

    for (const entry of entries) {
      const dates = entry.isCurrent
        ? `${entry.startDate ?? ''} – Present`.replace(/^\s*–\s*/, '').trim()
        : entry.startDate && entry.endDate
          ? `${entry.startDate} – ${entry.endDate}`
          : (entry.startDate ?? entry.endDate ?? '');

      const locationAndDates = [entry.location, dates].filter(Boolean).join(' · ');

      // Role header using Right-Aligned Tab Stop (ZERO layout tables)
      children.push(
        new Paragraph({
          tabStops: [
            {
              type: TabStopType.RIGHT,
              position: rightTabPosition,
            },
          ],
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({
              text: `${entry.title} — ${entry.organization}`,
              bold: true,
              font: 'Calibri',
              size: 21, // 10.5pt
            }),
            ...(locationAndDates
              ? [
                  new TextRun({
                    text: `\t${locationAndDates}`,
                    font: 'Calibri',
                    size: 19, // 9.5pt
                    color: '4B5563',
                  }),
                ]
              : []),
          ],
        }),
      );

      // Bullets using native OOXML numbering / bullet
      for (const bullet of entry.bullets) {
        if (!bullet.text.trim()) continue;
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: 40, after: 60 },
            children: [
              new TextRun({
                text: bullet.text.trim(),
                font: 'Calibri',
                size: 20, // 10pt
              }),
            ],
          }),
        );
      }
    }
  };

  const addInlineListSection = (title: string, items?: string[]) => {
    if (!items || items.length === 0) return;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 100 },
        border: {
          bottom: { style: 'single', color: '111827', space: 60, size: 6 },
        },
        children: [
          new TextRun({
            text: title.toUpperCase(),
            bold: true,
            font: 'Calibri',
            size: 22,
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 40, after: 120 },
        children: [
          new TextRun({
            text: items.join(' · '),
            font: 'Calibri',
            size: 20,
          }),
        ],
      }),
    );
  };

  const experience = payload.entries.filter((e) => e.entryType === 'experience');
  const projects = payload.entries.filter((e) => e.entryType === 'project');
  const education = payload.entries.filter((e) => e.entryType === 'education');
  const certifications = payload.entries.filter((e) => e.entryType === 'certification');

  addInlineListSection('Core Skills', payload.skills);
  addSection('Professional Experience', experience);
  addSection('Projects & Achievements', projects);
  addSection('Education', education);
  addSection('Certifications', certifications);
  addInlineListSection('Languages', payload.languages);

  const pageWidthTwips = payload.pageFormat === 'A4' ? 11906 : 12240;
  const pageHeightTwips = payload.pageFormat === 'A4' ? 16838 : 15840;

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: pageWidthTwips,
              height: pageHeightTwips,
            },
            margin: {
              top: 1080, // 0.75 in
              bottom: 1080,
              left: 1080,
              right: 1080,
            },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
