import { CardSkeleton } from '../../../components/states';
import { Badge } from '../../../components/ui/badge';
import { useResource } from '../../../hooks/useResource';

interface Layer {
  gateCheck: { pass: string[]; gap: string[]; workaround: string[] };
  skillAlignment: { exact: string[]; synonym: string[]; ontology: string[]; missing: string[]; ratio: number };
  experienceAudit: { relevantYears: number | null; totalYears: number | null; note: string };
  counterfactuals: string[];
  zeroHallucination: boolean;
}

export function MatchInspector({ jobId }: { jobId: string }) {
  const res = useResource<{ inspector: Layer }>(`/api/jobs/${encodeURIComponent(jobId)}/match-inspector`);
  // The API returns the object directly, not wrapped. Handle both.
  const data = res.state === 'ready' ? (res.data as unknown as Layer) : null;

  return (
    <section
      aria-labelledby="match-inspector-title"
      className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 id="match-inspector-title" className="text-base font-bold text-foreground m-0">
          Auditable match inspector
        </h2>
        <Badge variant="secondary" className="text-[10px]">
          4-layer · counterfactual
        </Badge>
      </div>
      {res.state === 'loading' && <CardSkeleton lines={4} />}
      {res.state === 'error' && <p className="text-xs text-muted-foreground">Inspector unavailable.</p>}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2 p-3 rounded-md bg-muted/20 border border-border/40">
            <h3 className="text-xs font-semibold text-foreground m-0">1. Mandatory gate check</h3>
            {data.gateCheck.gap.length === 0 ? (
              <p className="text-status-success-fg m-0">No hard blockers detected.</p>
            ) : (
              <ul className="space-y-1 p-0 m-0 list-none">
                {data.gateCheck.gap.map((g) => (
                  <li key={g} className="text-status-warn-fg">
                    Gap: {g}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2 p-3 rounded-md bg-muted/20 border border-border/40">
            <h3 className="text-xs font-semibold text-foreground m-0">
              2. Skill alignment ({Math.round(data.skillAlignment.ratio * 100)}%)
            </h3>
            <p className="m-0">
              <strong className="text-status-success-fg">Exact:</strong>{' '}
              {data.skillAlignment.exact.length ? data.skillAlignment.exact.join(', ') : '—'}
            </p>
            <p className="m-0">
              <strong className="text-status-warn-fg">Missing:</strong>{' '}
              {data.skillAlignment.missing.length ? data.skillAlignment.missing.join(', ') : '—'}
            </p>
          </div>
          <div className="space-y-2 p-3 rounded-md bg-muted/20 border border-border/40">
            <h3 className="text-xs font-semibold text-foreground m-0">3. Role-relevant experience</h3>
            <p className="text-muted-foreground m-0">{data.experienceAudit.note}</p>
          </div>
          <div className="space-y-2 p-3 rounded-md bg-muted/20 border border-border/40">
            <h3 className="text-xs font-semibold text-foreground m-0">4. What moves the needle</h3>
            <ul className="space-y-1 p-0 m-0 list-none">
              {data.counterfactuals.map((c, i) => (
                <li key={i} className="text-muted-foreground">
                  {c}
                </li>
              ))}
            </ul>
            {data.zeroHallucination && (
              <p className="text-[10px] text-muted-foreground m-0 pt-1">
                Zero-hallucination guardrail: every suggestion cites your verified career vault.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
