import type { MasterResumeDocument } from './master-resume.js';

/**
 * ATS-safe HTML for the master resume, following the resume-studio blueprint:
 *   - Single-column, semantic markup: <h1> name, <h2> section headings, <h3> role headers,
 *     <ul> bullets, <p> contact line, all in DOM reading order.
 *   - No CSS `order`, `float`, or CSS Grid reordering. Visual order == DOM order, which is
 *     what untagged extractors and screen readers both read.
 *   - Ligature suppression for print (ToUnicode CMap corruption guard).
 *   - Local fonts only, <title> and <meta name="author"> so Chromium writes clean PDF metadata.
 *
 * Renders from the same structured text that powers the master resume; section titles and the
 * exact role/bullet structure mirror buildMasterResume output.
 */

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const block = (html: string): string => `<section class="section">${html}</section>`;

/** Parse the master text into structured pieces. Returns { name, sections }. */
function parse(master: MasterResumeDocument): { name: string; sections: { title: string; content: string }[] } {
  const lines = master.content.split('\n').map((l) => l.replace(/\s+$/g, ''));
  const name = lines[0]?.trim() ?? '';
  const sections: { title: string; content: string }[] = [];
  let current: { title: string; content: string } | null = null;

  const flush = () => {
    if (current && current.content.trim()) sections.push(current);
    current = null;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^PROFESSIONAL SUMMARY$/i.test(line.trim())) {
      flush();
      current = { title: 'Professional Summary', content: '' };
      continue;
    }
    if (/^CORE SKILLS$/i.test(line.trim())) {
      flush();
      current = { title: 'Core Skills', content: '' };
      continue;
    }
    if (/^PROFESSIONAL EXPERIENCE$/i.test(line.trim())) {
      flush();
      current = { title: 'Professional Experience', content: '' };
      continue;
    }
    if (/^VERIFIED PROJECTS & ACHIEVEMENTS$/i.test(line.trim())) {
      flush();
      current = { title: 'Projects & Achievements', content: '' };
      continue;
    }
    if (/^PORTFOLIO$/i.test(line.trim())) {
      flush();
      current = { title: 'Portfolio', content: '' };
      continue;
    }
    if (/^EDUCATION & CERTIFICATIONS$/i.test(line.trim())) {
      flush();
      current = { title: 'Education & Certifications', content: '' };
      continue;
    }
    if (/^LANGUAGES$/i.test(line.trim())) {
      flush();
      current = { title: 'Languages', content: '' };
      continue;
    }
    if (!line.trim()) {
      continue;
    }
    if (current) current.content += `${line}\n`;
  }
  flush();

  return { name, sections };
}

export function buildMasterHtml(master: MasterResumeDocument): string {
  const { name, sections } = parse(master);
  const title = name || 'Resume';
  const sectionHtml = sections
    .map((s) => {
      const lines = s.content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let out = `<h2>${esc(s.title)}</h2>\n`;
      let inList = false;
      for (const l of lines) {
        if (l.startsWith('•')) {
          if (!inList) {
            out += '<ul>\n';
            inList = true;
          }
          out += `<li>${esc(l.replace(/^•\s*/, ''))}</li>\n`;
        } else {
          if (inList) {
            out += '</ul>\n';
            inList = false;
          }
          if (s.title === 'Professional Experience' && /^.+?\s+—\s+.+?\([^)]*\)$/.test(l)) {
            out += `<h3>${esc(l)}</h3>\n`;
          } else {
            out += `<p>${esc(l)}</p>\n`;
          }
        }
      }
      if (inList) out += '</ul>\n';
      return block(out);
    })
    .join('');

  // Contact block: email + phone + external links, in DOM reading order.
  const identity = master.identity;
  const contact = [identity.email, identity.phone, identity.linkedin].filter((v): v is string => !!v);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="author" content="${esc(title)}" />
<meta name="description" content="Master resume — ${esc(`${master.counts.roles} roles, ${master.counts.skills} skills`)}" />
<title>${esc(title)}</title>
<style>
  body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
  }
  .page {
    width: 100%;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0.75in;
    background: #fff;
    box-sizing: border-box;
  }
  h1 { font-size: 1.5em; margin: 0.2em 0; page-break-after: avoid; }
  .contact { font-size: 0.95em; margin: 0.2em 0 0.6em; page-break-after: avoid; }
  h2 { font-size: 1.05em; margin-top: 1.2em; page-break-after: avoid; }
  h3 { font-size: 1em; margin: 0.2em 0 0; }
  ul { margin: 0.3em 0; padding-left: 1.25em; page-break-after: avoid; }
  li { margin-bottom: 0.35em; page-break-after: avoid; }
  a { color: inherit; text-decoration: none; }
  p { margin: 0.25em 0 0.25em; page-break-inside: avoid; }
  @page { size: letter; margin: 0.75in; }
  @media print {
    body { background: #fff; }
    .page { padding: 0; }
    h2, h3 { break-after: avoid !important; }
    li { break-inside: avoid !important; }
  }
  html, body, * {
    font-variant-ligatures: none !important;
    -webkit-font-variant-ligatures: none !important;
    font-feature-settings: "liga" 0, "clig" 0, "dlig" 0, "hlig" 0, "calt" 0 !important;
    text-rendering: geometricPrecision !important;
  }
</style>
</head>
<body>
<div class="page">
  <h1>${esc(title)}</h1>
  ${contact.length ? `<div class="contact">${contact.map(esc).join(' | ')}</div>` : ''}
  ${sectionHtml}
</div>
</body>
</html>`;
}
