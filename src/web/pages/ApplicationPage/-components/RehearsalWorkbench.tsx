import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';

export interface RehearsalChecklistItem {
  id: string;
  category: string;
  title: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
  actionRequired?: string;
}

export interface ScreeningRehearsalItem {
  fieldKey: string;
  label: string;
  kind: string;
  required: boolean;
  draftValue: string | null;
  status: 'READY' | 'ATTENTION_NEEDED' | 'BLANK_OPTIONAL';
  source: string;
  rehearsalNotes: string;
  potentialGapsOrContradictions: string[];
}

export interface ApplicationRehearsalData {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  employer: string;
  state: string;
  applyUrl: string | null;
  approval: {
    valid: boolean;
    state: string;
    reason: string;
  };
  rehearsalItems: ScreeningRehearsalItem[];
  checklist: RehearsalChecklistItem[];
  readinessSummary: {
    overallStatus: 'READY' | 'NEEDS_ATTENTION' | 'BLOCKED';
    passingCount: number;
    warningCount: number;
    failingCount: number;
    advisory: string;
  };
  policyNotice: {
    statement: string;
    reaffirmedAt: string;
  };
}

export function RehearsalWorkbench({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<ApplicationRehearsalData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadRehearsal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ rehearsal: ApplicationRehearsalData }>(`/api/applications/${applicationId}/rehearsal`);
      setData(res.rehearsal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load application rehearsal.');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadRehearsal();
  }, [loadRehearsal]);

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Preparing application rehearsal workbench...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-sm">
        <p className="text-rose-600 dark:text-rose-400 font-medium">Rehearsal unavailable</p>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">{error ?? 'No rehearsal data returned.'}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadRehearsal}>
          Retry
        </Button>
      </div>
    );
  }

  const { readinessSummary, checklist, rehearsalItems, policyNotice } = data;

  const statusBadge =
    readinessSummary.overallStatus === 'READY' ? (
      <Badge
        variant="outline"
        className="bg-emerald-100 text-emerald-900 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800"
      >
        Ready for Candidate Approval
      </Badge>
    ) : readinessSummary.overallStatus === 'NEEDS_ATTENTION' ? (
      <Badge
        variant="outline"
        className="bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
      >
        Review Warnings
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="bg-rose-100 text-rose-950 border-rose-400 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800"
      >
        Submission Blocked
      </Badge>
    );

  return (
    <div className="space-y-6" data-testid="rehearsal-workbench">
      {/* Top Readiness Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Pre-Flight Submission Concierge</CardTitle>
            {statusBadge}
          </div>
          <CardDescription>{readinessSummary.advisory}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-xs text-neutral-700 dark:text-neutral-300 border-t border-neutral-100 dark:border-neutral-800 pt-3">
            <span>
              Passed:{' '}
              <strong className="text-emerald-800 dark:text-emerald-300">{readinessSummary.passingCount}</strong>
            </span>
            <span>
              Warnings: <strong className="text-amber-800 dark:text-amber-300">{readinessSummary.warningCount}</strong>
            </span>
            <span>
              Blockers: <strong className="text-rose-800 dark:text-rose-300">{readinessSummary.failingCount}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pre-Flight Checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Pre-Flight Checklist</CardTitle>
          <CardDescription>
            Verifies candidate identity, statutory eligibility, document integrity and compensation alignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {checklist.map((item) => (
              <div key={item.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">{item.title}</span>
                    <span className="text-[10px] text-neutral-600 dark:text-neutral-400 uppercase tracking-wider font-medium">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-neutral-700 dark:text-neutral-300 mt-0.5">{item.detail}</p>
                  {item.actionRequired && (
                    <p className="text-amber-900 dark:text-amber-300 font-medium mt-1">Action: {item.actionRequired}</p>
                  )}
                </div>
                <div>
                  {item.status === 'PASS' && (
                    <Badge
                      variant="outline"
                      className="bg-emerald-100 text-emerald-900 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800 text-[10px]"
                    >
                      PASS
                    </Badge>
                  )}
                  {item.status === 'WARN' && (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800 text-[10px]"
                    >
                      WARN
                    </Badge>
                  )}
                  {item.status === 'FAIL' && (
                    <Badge
                      variant="outline"
                      className="bg-rose-100 text-rose-950 border-rose-400 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800 text-[10px]"
                    >
                      FAIL
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Screening Questions Rehearsal */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Screening Question Rehearsal</CardTitle>
          <CardDescription>
            Preview answers drafted from confirmed evidence and identify missing employer prompts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rehearsalItems.length === 0 ? (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              No custom screening questions detected for this application.
            </p>
          ) : (
            <div className="space-y-3">
              {rehearsalItems.map((item) => (
                <div
                  key={item.fieldKey}
                  className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 text-xs"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {item.label}{' '}
                      {item.required && <span className="text-rose-600 dark:text-rose-400 font-bold">*</span>}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        item.status === 'READY'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800'
                          : item.status === 'ATTENTION_NEEDED'
                            ? 'bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800'
                            : 'bg-neutral-100 text-neutral-800 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      {item.status === 'READY'
                        ? 'Ready'
                        : item.status === 'ATTENTION_NEEDED'
                          ? 'Needs Attention'
                          : 'Optional Blank'}
                    </Badge>
                  </div>
                  <div className="bg-white dark:bg-neutral-950 p-2 rounded border border-neutral-200 dark:border-neutral-800 font-mono text-[11px] text-neutral-900 dark:text-neutral-100">
                    {item.draftValue ?? <span className="text-neutral-600 dark:text-neutral-400 italic">Empty</span>}
                  </div>
                  <p className="text-neutral-700 dark:text-neutral-300 mt-1.5 text-[11px]">{item.rehearsalNotes}</p>
                  {item.potentialGapsOrContradictions.length > 0 && (
                    <div className="mt-1 text-rose-800 dark:text-rose-300 text-[11px] font-medium">
                      {item.potentialGapsOrContradictions.join(' ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zero Autonomous Submission Policy Notice */}
      <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-900/70 text-xs text-neutral-700 dark:text-neutral-300">
        <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Candidate-Controlled Submissions</p>
        <p>{policyNotice.statement}</p>
      </div>
    </div>
  );
}
