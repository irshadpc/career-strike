import type { DocumentCheck, DocumentReadinessReport } from '../../../api';
import { Badge } from '../../../components/ui/badge';

const statusLabel: Record<DocumentCheck['status'], string> = {
  PASS: 'Pass',
  WARN: 'Review',
  FAIL: 'Fix',
};

const statusClasses: Record<DocumentCheck['status'], string> = {
  PASS: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  WARN: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  FAIL: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

/**
 * Shows the deterministic readiness report. It intentionally does not claim to simulate a named
 * ATS or to predict an employer's parsing or ranking.
 */
export function DocumentReadinessCard({ readiness }: { readiness: DocumentReadinessReport }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
        <div>
          <h2 id="document-readiness-title" className="text-base font-semibold tracking-tight text-foreground">
            Document Readiness &amp; Evidence Verification
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Local, deterministic checks on the document you can see. Not an ATS certification or a simulation of a named
            employer system.
          </p>
        </div>
        <Badge variant={readiness.state === 'READY_TO_TAILOR' ? 'teal' : 'warning'}>
          {readiness.score}% checklist · {readiness.state.replaceAll('_', ' ')}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {readiness.checks.map((check) => (
          <div key={check.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/70 bg-card/60">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${statusClasses[check.status]}`}
              aria-hidden="true"
            >
              {check.status === 'PASS' ? '✓' : check.status === 'WARN' ? '!' : '×'}
            </span>
            <div className="space-y-0.5">
              <strong className="text-xs font-semibold text-foreground block">
                {check.label}
                <span className="sr-only"> — {statusLabel[check.status]}</span>
              </strong>
              <p className="text-xs text-muted-foreground leading-relaxed">{check.explanation}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-3">{readiness.disclaimer}</p>
    </div>
  );
}
