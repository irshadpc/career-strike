import { useCallback, useEffect, useState } from 'react';
import { api, type ParserReport } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

/**
 * Export buttons and local parser report. The report is deliberately labelled as local parser
 * testing: Career Strike has no evidence that any named ATS reads a file in a particular way, and
 * this panel must never imply certification.
 */
export function ExportPanel({
  label,
  applicationId,
  variantId,
}: {
  label: string;
  applicationId?: string;
  variantId?: string;
}) {
  const [reports, setReports] = useState<ParserReport[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const base =
    applicationId && variantId
      ? `/api/applications/${encodeURIComponent(applicationId)}/personalization/${encodeURIComponent(variantId)}`
      : '/api/documents/master';

  const loadReport = useCallback(async () => {
    try {
      const res = await api<{ reports: ParserReport[] }>(`${base}/parser-report`);
      setReports(res.reports);
    } catch {
      setReports(null);
    }
  }, [base]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const download = async (format: 'pdf' | 'docx'): Promise<void> => {
    setBusy(format);
    setMessage(null);
    try {
      const res = await fetch(`${base}/export?format=${format}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${label.toLowerCase().replace(/\s+/g, '-')}.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setMessage(`Downloaded ${filename}. The export was generated on this computer.`);
      void loadReport();
    } catch {
      setMessage('Could not create that export. Check that the service is running.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4" aria-labelledby="export-title">
      <div>
        <h2 id="export-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
          Offline document export
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
          Download PDF or Word copies of your {label}. PDF and Word files are written locally. The parser check below
          runs the generated file through Career Strike’s own text extractor. It is not an ATS certification, not a test
          by a named employer system, and not a measure of interview chances.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void download('pdf')} disabled={busy !== null}>
          {busy === 'pdf' ? 'Creating PDF…' : 'Download PDF'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void download('docx')}
          disabled={busy !== null}
        >
          {busy === 'docx' ? 'Creating DOCX…' : 'Download DOCX'}
        </Button>
      </div>

      {reports && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <caption className="sr-only">Local parser test results</caption>
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
              {reports.map((report) => (
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
          <p className="text-[11px] text-muted-foreground mt-2">{reports[0]?.note}</p>
          {reports.some((report) => report.missingWords.length > 0) && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
              Words not recovered in at least one format:{' '}
              {reports
                .flatMap((report) => report.missingWords)
                .slice(0, 12)
                .join(', ')}
            </p>
          )}
        </div>
      )}

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground m-0">
          {message}
        </p>
      )}
    </section>
  );
}
