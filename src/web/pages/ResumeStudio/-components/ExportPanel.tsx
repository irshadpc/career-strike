import { useCallback, useEffect, useState } from 'react';
import { api, type ExportResult, type ExportVerification, type ParserReport } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

/**
 * Export buttons and the local verification report for generated files. Every export now runs the
 * Round-Trip Binary Verification Gate on the bytes as they are written (ATS-Proof PDF/DOCX
 * engine): text presence, token recall ≥98%, field recall, ligature & PUA scan, sparse-page scan
 * and file-size budgets. The report is deliberately labelled as local verification: Career Strike
 * has no evidence that any named ATS reads a file in a particular way, and this panel must never
 * imply certification.
 */

function VerificationDetails({ v }: { v: ExportVerification | null }) {
  if (!v) return null;
  return (
    <div className="mt-2 text-xs space-y-1.5">
      {v.checks.map((c) => (
        <div
          key={c.id}
          className={`p-2 rounded border ${c.status === 'PASS' ? 'border-teal-500/30 bg-teal-500/5' : c.status === 'WARN' ? 'border-amber-500/30 bg-amber-500/5' : 'border-destructive/30 bg-destructive/5'}`}
        >
          <span className="font-semibold text-foreground">{c.label}</span>{' '}
          <span
            className={
              c.status === 'PASS' ? 'text-teal-600' : c.status === 'WARN' ? 'text-amber-600' : 'text-destructive'
            }
          >
            {c.status}
          </span>
          <span className="text-muted-foreground block mt-0.5">{c.explanation}</span>
        </div>
      ))}
      {v.warnings.length > 0 && (
        <ul className="list-disc pl-4 text-amber-800 dark:text-amber-300 space-y-0.5">
          {v.warnings.map((w: string, i: number) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {v.failures.length > 0 && (
        <ul className="list-disc pl-4 text-destructive space-y-0.5" role="alert">
          {v.failures.map((f: string, i: number) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExportPanel({ applicationId, variantId }: { applicationId?: string; variantId?: string }) {
  const [verifications, setVerifications] = useState<Record<'pdf' | 'docx', ExportVerification | null>>({
    pdf: null,
    docx: null,
  });
  const [messages, setMessages] = useState<Record<'pdf' | 'docx', string | null>>({ pdf: null, docx: null });
  const [legacyReports, setLegacyReports] = useState<ParserReport[] | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null);

  const legacyBase =
    applicationId && variantId
      ? `/api/applications/${encodeURIComponent(applicationId)}/personalization/${encodeURIComponent(variantId)}`
      : '/api/documents/master';

  const loadLegacyReports = useCallback(async () => {
    try {
      const res = await api<{ reports: ParserReport[] }>(`${legacyBase}/parser-report`);
      setLegacyReports(res.reports);
    } catch {
      setLegacyReports(null);
    }
  }, [legacyBase]);

  useEffect(() => {
    void loadLegacyReports();
  }, [loadLegacyReports]);

  const statusBadge = (v: ExportVerification) =>
    v.passed ? <Badge variant="teal">Verified</Badge> : <Badge variant="destructive">Needs review</Badge>;

  const generate = async (format: 'pdf' | 'docx') => {
    setBusy(format);
    setMessages({ ...messages, [format]: null });
    try {
      const res = await api<ExportResult>(`/api/exports/master-resume/${format}`, {
        method: 'POST',
      });
      const verification = res.verification;
      setVerifications((prev) => ({ ...prev, [format]: verification }));
      const payload = (res[format] ?? '') as string;
      const blob = new Blob([Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))], {
        type:
          format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = res.filename as string;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      const issues = verification.failures.length;
      setMessages((prev) => ({
        ...prev,
        [format]:
          issues === 0
            ? `Generated ${res.filename as string}. Round-trip verification passed: ${verification.warnings.length > 0 ? `${verification.warnings.length} advisory warning(s).` : 'clean.'}`
            : `Generated ${res.filename as string}, but the local verification found issues. Inspect the report below.`,
      }));
      void loadLegacyReports();
    } catch {
      setMessages((prev) => ({
        ...prev,
        [format]: 'Could not create that export. Check that the service is running.',
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4" aria-labelledby="export-title">
      <div>
        <h2 id="export-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
          Verified ATS-proof export
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
          Every export is generated by a local Chromium/Playwright engine and runs the Round-Trip Binary Verification
          Gate: text presence, ≥98% token recall, field recall, ligature & PUA scan, sparse-page scan, and file-size
          budgets (&lt;1.5 MB warn, &lt;2.5 MB hard). PDF is tagged (PDF/UA) with a document outline; DOCX uses OpenXML
          with semantic headings, body-only contact info, and tab-free role headers.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void generate('pdf')} disabled={busy !== null}>
          {busy === 'pdf' ? 'Generating…' : 'Export PDF'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void generate('docx')}
          disabled={busy !== null}
        >
          {busy === 'docx' ? 'Generating…' : 'Export DOCX'}
        </Button>
        {legacyReports && (
          <a
            href={legacyBase}
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent h-9 px-3"
            target="_blank"
            rel="noreferrer"
          >
            Legacy plain-text export
          </a>
        )}
      </div>

      {messages.pdf && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground m-0">
          {messages.pdf}
        </p>
      )}
      {messages.docx && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground m-0">
          {messages.docx}
        </p>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <strong className="text-xs font-semibold text-foreground">PDF</strong>
            {verifications.pdf && statusBadge(verifications.pdf)}
          </div>
          <VerificationDetails v={verifications.pdf} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <strong className="text-xs font-semibold text-foreground">DOCX</strong>
            {verifications.docx && statusBadge(verifications.docx)}
          </div>
          <VerificationDetails v={verifications.docx} />
        </div>
      </div>

      {legacyReports && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <caption className="sr-only">Legacy parser test results</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Format
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Text recovered
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Word coverage
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Basis
                </th>
              </tr>
            </thead>
            <tbody>
              {legacyReports.map((report) => (
                <tr key={report.format} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-medium text-foreground uppercase">{report.format}</td>
                  <td className="py-1.5 pr-3">
                    {report.extracted ? `${report.extractedCharacters} characters` : 'No text recovered'}
                  </td>
                  <td className="py-1.5 pr-3">{Math.round(report.wordCoverage * 100)}%</td>
                  <td className="py-1.5">
                    <Badge variant="outline">Local parser test only</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground mt-2">{legacyReports[0]?.note}</p>
        </div>
      )}
    </section>
  );
}

export default ExportPanel;
