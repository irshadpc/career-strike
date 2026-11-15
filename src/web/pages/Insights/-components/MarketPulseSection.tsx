import { useEffect, useState } from 'react';
import { type CareerMarketPulseReport, fetchMarketPulse } from '../../../api';
import { Badge } from '../../../components/ui/badge';

export function MarketPulseSection() {
  const [pulse, setPulse] = useState<CareerMarketPulseReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMarketPulse()
      .then((res) => {
        if (!cancelled) setPulse(res.pulse);
      })
      .catch(() => {
        if (!cancelled) setPulse(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!pulse) return null;

  const {
    sampleSummary,
    remotePolicyDistribution,
    topSkillsDemand,
    salaryTransparency,
    hiringVelocity,
    methodologyAndLimitations,
  } = pulse;

  return (
    <section
      className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
      aria-labelledby="pulse-title"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 id="pulse-title" className="text-lg font-bold text-foreground m-0">
            Career Market Pulse
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggregated solely from locally verified postings ({sampleSummary.totalObservedPostings} postings across{' '}
            {sampleSummary.monitoredEmployers} employers).
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          14-Day Velocity: {hiringVelocity.netChange >= 0 ? `+${hiringVelocity.netChange}` : hiringVelocity.netChange}{' '}
          Net Roles
        </Badge>
      </div>

      {/* Summary KPI Cards */}
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 p-0 m-0">
        <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20">
          <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Active Open Roles
          </dt>
          <dd className="text-xl font-bold font-serif text-foreground mt-1 m-0">{sampleSummary.activeOpenPostings}</dd>
        </div>
        <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20">
          <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Salary Transparency
          </dt>
          <dd className="text-xl font-bold font-serif text-teal-600 dark:text-teal-400 mt-1 m-0">
            {salaryTransparency.disclosurePercentage}%
          </dd>
        </div>
        <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20">
          <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Opened Last 14d</dt>
          <dd className="text-xl font-bold font-serif text-foreground mt-1 m-0">{hiringVelocity.openedLast14Days}</dd>
        </div>
        <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20">
          <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Closed Last 14d</dt>
          <dd className="text-xl font-bold font-serif text-muted-foreground mt-1 m-0">
            {hiringVelocity.closedLast14Days}
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Remote Work Distribution */}
        <div className="p-3.5 rounded-lg border border-border space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
            Work Arrangement Distribution
          </span>
          <div className="space-y-1.5 text-xs">
            {remotePolicyDistribution.map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-foreground">{item.label}</span>
                <span className="font-mono text-muted-foreground">
                  {item.count} ({item.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top In-Demand Skills */}
        <div className="p-3.5 rounded-lg border border-border space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
            Top Skills In Demand
          </span>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {topSkillsDemand.slice(0, 10).map((s) => (
              <Badge key={s.skill} variant="outline" className="text-xs py-0.5">
                {s.skill} ({s.count})
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Transparent Limitation Notice */}
      <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] text-muted-foreground leading-relaxed">
        <strong>Sampling limitation disclosure:</strong> {methodologyAndLimitations.samplingLimitations}
      </div>
    </section>
  );
}
