import { useEffect, useState } from 'react';
import {
  type CompensationBenchmarkRecord,
  type CompensationComparison,
  evaluateCompensationOffer,
  fetchCompensationBenchmarks,
  type JobDetail,
} from '../../../api';
import { Badge } from '../../../components/ui/badge';

interface Props {
  job: JobDetail;
}

const COMPARISON_BADGES: Record<
  string,
  { label: string; variant: 'teal' | 'warning' | 'secondary' | 'outline' | 'destructive' }
> = {
  ABOVE_MEDIAN: { label: 'Above Market Median', variant: 'teal' },
  WITHIN_MARKET_RANGE: { label: 'Within Market Range (P25–P75)', variant: 'secondary' },
  BELOW_MEDIAN: { label: 'Below Market Median', variant: 'warning' },
  INSUFFICIENT_DATA: { label: 'Insufficient Benchmark Data', variant: 'outline' },
};

function inferRoleFamily(title: string): string {
  const lower = title.toLowerCase();
  if (/\b(data|machine learning|ml|ai|analytics)\b/.test(lower)) return 'data_science';
  if (/\b(product manager|product lead|pm)\b/.test(lower)) return 'product_management';
  if (/\b(design|ux|ui|product designer)\b/.test(lower)) return 'design';
  if (/\b(devops|sre|platform|infrastructure|cloud)\b/.test(lower)) return 'infrastructure';
  return 'software_engineering';
}

function inferSeniority(title: string): string {
  const lower = title.toLowerCase();
  if (/\b(principal|distinguished|staff)\b/.test(lower)) return 'staff';
  if (/\b(director|vp|head of|lead|manager|engineering manager)\b/.test(lower)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(lower)) return 'senior';
  if (/\b(junior|jr\.?|entry|associate|intern|graduate)\b/.test(lower)) return 'junior';
  return 'mid';
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

export function CompensationPanel({ job }: Props) {
  const [benchmarks, setBenchmarks] = useState<CompensationBenchmarkRecord[]>([]);
  const [comparison, setComparison] = useState<CompensationComparison | null>(null);
  const [loading, setLoading] = useState(true);

  const countryCode = job.market.location.countryCode ?? 'US';
  const roleFamily = inferRoleFamily(job.title);
  const seniority = inferSeniority(job.title);
  const displayCurrency = job.salary?.currency || benchmarks[0]?.currency || 'USD';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchCompensationBenchmarks({ countryCode, roleFamily })
      .then((res) => {
        if (cancelled) return;
        setBenchmarks(res.benchmarks);

        // If salary is present, evaluate it
        if (job.salary) {
          evaluateCompensationOffer({
            roleFamily,
            seniority,
            countryCode,
            salary: job.salary,
          })
            .then((cRes) => {
              if (!cancelled) setComparison(cRes.comparison);
            })
            .catch(() => {
              if (!cancelled) setComparison(null);
            });
        }
      })
      .catch(() => {
        if (!cancelled) setBenchmarks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [countryCode, job.salary, roleFamily, seniority]);

  const matchingBenchmark = benchmarks[0];
  const benchmarkCurrency = matchingBenchmark?.currency || displayCurrency;
  const comparisonInfo = comparison
    ? (COMPARISON_BADGES[comparison.status] ?? COMPARISON_BADGES.INSUFFICIENT_DATA!)
    : null;

  return (
    <section
      aria-labelledby="comp-panel-title"
      className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 id="comp-panel-title" className="text-base font-bold text-foreground m-0">
          Compensation & Market Intelligence
        </h2>
        {comparisonInfo && <Badge variant={comparisonInfo.variant}>{comparisonInfo.label}</Badge>}
      </div>

      {loading && <p className="text-xs text-muted-foreground italic">Loading compensation benchmarks...</p>}

      {!loading && comparison && (
        <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5 text-xs">
          <p className="font-semibold text-foreground m-0">{comparison.verdict}</p>
          {comparison.offeredAnnualized && (
            <p className="text-muted-foreground m-0">
              Annualized Posting Rate:{' '}
              <strong className="text-foreground">
                {formatMoney(Math.round(comparison.offeredAnnualized), displayCurrency)} {displayCurrency}/yr
              </strong>
            </p>
          )}
          {comparison.benchmarkAnnualizedP50 && (
            <p className="text-muted-foreground m-0">
              Market Median (P50):{' '}
              <strong className="text-foreground">
                {formatMoney(Math.round(comparison.benchmarkAnnualizedP50), benchmarkCurrency)} {benchmarkCurrency}/yr
              </strong>
            </p>
          )}
          {comparison.caveats.length > 0 && (
            <ul className="text-[11px] text-muted-foreground m-0 pl-4 space-y-0.5 pt-1">
              {comparison.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && matchingBenchmark && (
        <div className="space-y-2 text-xs">
          <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
            Verified Market Benchmark ({matchingBenchmark.countryCode} •{' '}
            {matchingBenchmark.roleFamily.replaceAll('_', ' ')})
          </span>
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg border border-border/70 text-center">
            <div>
              <span className="text-[10px] text-muted-foreground block">P25 (Low)</span>
              <strong className="text-sm font-semibold text-foreground">
                {matchingBenchmark.p25 ? formatMoney(matchingBenchmark.p25, benchmarkCurrency) : '—'}
              </strong>
            </div>
            <div className="border-x border-border/60">
              <span className="text-[10px] text-muted-foreground block">P50 (Median)</span>
              <strong className="text-sm font-semibold text-primary">
                {matchingBenchmark.p50 ? formatMoney(matchingBenchmark.p50, benchmarkCurrency) : '—'}
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">P75 (High)</span>
              <strong className="text-sm font-semibold text-foreground">
                {matchingBenchmark.p75 ? formatMoney(matchingBenchmark.p75, benchmarkCurrency) : '—'}
              </strong>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground italic m-0">
            Source: {matchingBenchmark.sourceName} ({matchingBenchmark.sourceKind.replaceAll('_', ' ').toLowerCase()})
            {matchingBenchmark.sampleSize ? ` • Sample N = ${matchingBenchmark.sampleSize}` : ''}
          </p>
        </div>
      )}

      {!loading && !matchingBenchmark && (
        <p className="text-xs text-muted-foreground italic m-0">
          No external compensation benchmarks registered for country {countryCode} yet.
        </p>
      )}

      <p className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t border-border/40 m-0">
        Percentiles are calculated only with minimum sample size N ≥ 5. Currency conversions are never presented as
        cost-of-living parity.
      </p>
    </section>
  );
}
