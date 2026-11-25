import { useCallback, useEffect, useState } from 'react';
import { type DecisionReadyShortlistEntry, fetchDecisionReadyShortlists } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Link } from '../../../router';

const ACTION_COLORS: Record<
  string,
  { label: string; variant: 'teal' | 'warning' | 'secondary' | 'default' | 'destructive' }
> = {
  APPLY: { label: 'Decision: High Readiness — Apply Now', variant: 'teal' },
  INVESTIGATE_COMPANY: { label: 'Decision: Review Company Momentum & Context', variant: 'warning' },
  PRACTICE_GAPS: { label: 'Decision: Practice Gaps & Refresh Evidence', variant: 'secondary' },
  SKIP: { label: 'Decision: Ineligible / Not Recommended', variant: 'destructive' },
};

export function DecisionShortlistHub() {
  const [shortlists, setShortlists] = useState<DecisionReadyShortlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadShortlist = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchDecisionReadyShortlists();
      setShortlists(res.shortlists);
    } catch {
      setError('Could not evaluate decision-ready shortlists.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShortlist();
  }, [loadShortlist]);

  return (
    <section aria-labelledby="decision-shortlist-title" className="space-y-4 my-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 id="decision-shortlist-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
            Decision-Ready Opportunity Shortlist
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Candidate-specific opportunities evaluated across 6 orthogonal dimensions. Critical eligibility failures are
            never collapsed into an attractive aggregate score.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadShortlist()} className="text-xs">
          ↻ Refresh Shortlist
        </Button>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground py-6 text-center">
          Evaluating active opportunities against your profile...
        </p>
      )}
      {error && <p className="text-xs text-destructive py-6 text-center">{error}</p>}

      {!loading && !error && shortlists.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-4">
          No verified opportunities match your active profile criteria right now.
        </p>
      )}

      <div className="space-y-4">
        {shortlists.map((entry) => {
          const { job, dimensions, recommendationExplanation, nextBestAction } = entry;
          const actionConfig = ACTION_COLORS[nextBestAction] ?? ACTION_COLORS.PRACTICE_GAPS!;
          const passed = dimensions.hardEligibility.passed;

          return (
            <div
              key={job.id}
              className={`p-4 rounded-xl border transition-all ${
                passed ? 'border-border bg-card shadow-xs' : 'border-destructive/30 bg-destructive/5'
              }`}
            >
              {/* Header: Title, Employer, Action Badge */}
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground m-0">
                    <Link href={`/jobs/${job.id}`} className="hover:underline">
                      {job.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-muted-foreground m-0 mt-0.5">
                    <span className="font-medium text-foreground">{job.employer}</span> • {job.locationText ?? 'Remote'}
                  </p>
                </div>
                <Badge variant={actionConfig.variant} className="text-xs">
                  {actionConfig.label}
                </Badge>
              </div>

              {/* Recommendation Explanation */}
              <p className="text-xs text-foreground mt-2.5 p-2.5 rounded-lg bg-muted/40 border border-border/40 leading-relaxed m-0">
                <strong>Why recommended:</strong> {recommendationExplanation}
              </p>

              {/* 6-Dimension Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-border/60 text-xs">
                {/* 1. Hard Eligibility */}
                <div className="p-2.5 rounded-lg border border-border/70 bg-background/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    1. Hard Eligibility
                  </span>
                  {passed ? (
                    <span className="text-teal-700 dark:text-teal-400 font-medium">✓ Passed all checks</span>
                  ) : (
                    <div className="space-y-0.5 text-destructive font-medium">
                      <span>✗ Critical Failure:</span>
                      {dimensions.hardEligibility.criticalFailures.map((f) => (
                        <p key={f} className="text-[11px] m-0 pl-1 leading-tight">
                          {f}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Professional Relevance */}
                <div className="p-2.5 rounded-lg border border-border/70 bg-background/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    2. Relevance ({dimensions.professionalRelevance.tier})
                  </span>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Seniority:{' '}
                    <strong className="text-foreground capitalize">
                      {dimensions.professionalRelevance.seniorityAlignment}
                    </strong>
                  </p>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Skills: {dimensions.professionalRelevance.matchedSkills.length} matched /{' '}
                    {dimensions.professionalRelevance.missingSkills.length} gaps
                  </p>
                </div>

                {/* 3. Candidate Preferences */}
                <div className="p-2.5 rounded-lg border border-border/70 bg-background/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    3. Candidate Preferences
                  </span>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Remote:{' '}
                    <strong className="text-foreground capitalize">{dimensions.candidatePreferences.remoteFit}</strong>
                  </p>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Salary:{' '}
                    <strong className="text-foreground capitalize">{dimensions.candidatePreferences.salaryFit}</strong>
                  </p>
                </div>

                {/* 4. Source Confidence */}
                <div className="p-2.5 rounded-lg border border-border/70 bg-background/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    4. Source Confidence
                  </span>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Level: <strong className="text-foreground">{dimensions.sourceConfidence.level}</strong>
                  </p>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Verified &lt;72h: {dimensions.sourceConfidence.verifiedWithin72h ? 'Yes' : 'Pending verification'}
                  </p>
                </div>

                {/* 5. Company Context */}
                <div className="p-2.5 rounded-lg border border-border/70 bg-background/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    5. Company Context
                  </span>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Stage:{' '}
                    <strong className="text-foreground">{dimensions.companyContext.stage.replaceAll('_', ' ')}</strong>
                  </p>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Momentum:{' '}
                    <strong className="text-foreground capitalize">
                      {dimensions.companyContext.momentumTrend.toLowerCase()}
                    </strong>
                  </p>
                </div>

                {/* 6. Application Effort */}
                <div className="p-2.5 rounded-lg border border-border/70 bg-background/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    6. Application Effort
                  </span>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    Level: <strong className="text-foreground">{dimensions.applicationEffort.level}</strong>
                  </p>
                  <p className="m-0 text-[11px] text-muted-foreground">Basis: {dimensions.applicationEffort.basis}</p>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-end gap-2 mt-3 pt-2">
                <Link
                  href={`/jobs/${job.id}`}
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3"
                >
                  View Details & Apply →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
