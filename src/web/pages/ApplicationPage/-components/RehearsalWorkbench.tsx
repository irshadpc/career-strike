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
      <div className="p-4 text-center text-sm text-muted-foreground">Preparing application rehearsal workbench...</div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-md border border-border bg-muted/30 text-sm">
        <p className="text-destructive font-medium">Rehearsal unavailable</p>
        <p className="text-muted-foreground mt-1">{error ?? 'No rehearsal data returned.'}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadRehearsal}>
          Retry
        </Button>
      </div>
    );
  }

  const { readinessSummary, checklist, rehearsalItems, policyNotice } = data;

  const statusBadge =
    readinessSummary.overallStatus === 'READY' ? (
      <Badge variant="outline" className="bg-status-success-bg text-status-success-fg border-status-success-border">
        Ready for Candidate Approval
      </Badge>
    ) : readinessSummary.overallStatus === 'NEEDS_ATTENTION' ? (
      <Badge variant="outline" className="bg-status-warn-bg text-status-warn-fg border-status-warn-border">
        Review Warnings
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
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
          <div className="flex gap-4 text-xs text-muted-foreground border-t border-border pt-3">
            <span>
              Passed: <strong className="text-status-success-fg">{readinessSummary.passingCount}</strong>
            </span>
            <span>
              Warnings: <strong className="text-status-warn-fg">{readinessSummary.warningCount}</strong>
            </span>
            <span>
              Blockers: <strong className="text-destructive">{readinessSummary.failingCount}</strong>
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
          <div className="divide-y divide-border">
            {checklist.map((item) => (
              <div key={item.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{item.detail}</p>
                  {item.actionRequired && (
                    <p className="text-status-warn-fg font-medium mt-1">Action: {item.actionRequired}</p>
                  )}
                </div>
                <div>
                  {item.status === 'PASS' && (
                    <Badge
                      variant="outline"
                      className="bg-status-success-bg text-status-success-fg border-status-success-border text-[10px]"
                    >
                      PASS
                    </Badge>
                  )}
                  {item.status === 'WARN' && (
                    <Badge
                      variant="outline"
                      className="bg-status-warn-bg text-status-warn-fg border-status-warn-border text-[10px]"
                    >
                      WARN
                    </Badge>
                  )}
                  {item.status === 'FAIL' && (
                    <Badge
                      variant="outline"
                      className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]"
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
            <p className="text-xs text-muted-foreground">
              No custom screening questions detected for this application.
            </p>
          ) : (
            <div className="space-y-3">
              {rehearsalItems.map((item) => (
                <div key={item.fieldKey} className="p-3 rounded-lg border border-border bg-muted/30 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium text-foreground">
                      {item.label} {item.required && <span className="text-destructive font-bold">*</span>}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        item.status === 'READY'
                          ? 'bg-status-success-bg text-status-success-fg border-status-success-border'
                          : item.status === 'ATTENTION_NEEDED'
                            ? 'bg-status-warn-bg text-status-warn-fg border-status-warn-border'
                            : 'bg-muted text-foreground border-border'
                      }`}
                    >
                      {item.status === 'READY'
                        ? 'Ready'
                        : item.status === 'ATTENTION_NEEDED'
                          ? 'Needs Attention'
                          : 'Optional Blank'}
                    </Badge>
                  </div>
                  <div className="bg-background p-2 rounded border border-border font-mono text-[11px] text-foreground">
                    {item.draftValue ?? <span className="text-muted-foreground italic">Empty</span>}
                  </div>
                  <p className="text-muted-foreground mt-1.5 text-[11px]">{item.rehearsalNotes}</p>
                  {item.potentialGapsOrContradictions.length > 0 && (
                    <div className="mt-1 text-destructive text-[11px] font-medium">
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
      <div className="p-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">Candidate-Controlled Submissions</p>
        <p>{policyNotice.statement}</p>
      </div>
    </div>
  );
}
