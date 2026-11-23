import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../components/ui/toast';

interface Brag {
  id: string;
  scopeTier: string;
  competency: string;
  title: string;
  impact: string;
  createdAt: string;
}

interface Plan {
  id: string;
  jobTitle: string | null;
  company: string | null;
  plan: { days30?: string; days60?: string; days90?: string; stakeholders?: string; questions?: string };
  createdAt: string;
}

export function HiredMode() {
  const { toast } = useToast();
  const [brags, setBrags] = useState<Brag[] | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState(false);
  const [bragDraft, setBragDraft] = useState({ scopeTier: 'individual', competency: '', title: '', impact: '' });
  const [planDraft, setPlanDraft] = useState({
    jobTitle: '',
    company: '',
    days30: '',
    days60: '',
    days90: '',
    stakeholders: '',
    questions: '',
  });

  const load = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([
        api<{ entries: Brag[] }>('/api/brag'),
        api<{ plans: Plan[] }>('/api/onboarding'),
      ]);
      setBrags(b.entries);
      setPlans(p.plans);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveBrag = async () => {
    if (!bragDraft.title.trim() || !bragDraft.competency.trim()) {
      toast({ variant: 'destructive', title: 'Title and competency required' });
      return;
    }
    try {
      await api('/api/brag', {
        method: 'POST',
        body: {
          scopeTier: bragDraft.scopeTier,
          competency: bragDraft.competency.trim(),
          title: bragDraft.title.trim(),
          impact: bragDraft.impact.trim(),
        },
      });
      setBragDraft({ scopeTier: 'individual', competency: '', title: '', impact: '' });
      toast({ variant: 'success', title: 'Brag captured', description: 'Feeds your promotion packet.' });
      void load();
    } catch {
      toast({ variant: 'destructive', title: 'Could not save' });
    }
  };

  const savePlan = async () => {
    if (!planDraft.jobTitle.trim()) {
      toast({ variant: 'destructive', title: 'Job title required' });
      return;
    }
    try {
      await api('/api/onboarding', {
        method: 'POST',
        body: {
          jobTitle: planDraft.jobTitle.trim(),
          company: planDraft.company.trim() || null,
          plan: {
            days30: planDraft.days30.trim(),
            days60: planDraft.days60.trim(),
            days90: planDraft.days90.trim(),
            stakeholders: planDraft.stakeholders.trim(),
            questions: planDraft.questions.trim(),
          },
        },
      });
      setPlanDraft({ jobTitle: '', company: '', days30: '', days60: '', days90: '', stakeholders: '', questions: '' });
      toast({ variant: 'success', title: '30-60-90 plan saved' });
      void load();
    } catch {
      toast({ variant: 'destructive', title: 'Could not save plan' });
    }
  };

  const SCOPE_LABEL: Record<string, string> = {
    individual: 'Individual',
    team: 'Team',
    cross_team: 'Cross-team',
    org: 'Org',
  };

  return (
    <div>
      <PageHeader
        eyebrow="Hired mode"
        title="From offer to promotion"
        lede="70% of new hires decide fit within the first month. Flip Career Strike into hired mode: 30-60-90 plan, stakeholder map, and a promotion-scope brag vault."
      />
      {error && <ErrorPanel message="Could not load hired-mode data." onRetry={() => void load()} />}
      {(!brags || !plans) && !error && <Loading label="Loading" />}

      {brags && plans && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* 30-60-90 plan */}
          <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
            <h2 className="text-base font-bold text-foreground m-0">30-60-90 day plan</h2>
            <p className="text-xs text-muted-foreground m-0">
              Days 1–30 orient & learn, 31–60 apply & contribute, 61–90 own & deliver.
            </p>
            <input
              value={planDraft.jobTitle}
              onChange={(e) => setPlanDraft({ ...planDraft, jobTitle: e.target.value })}
              placeholder="Job title"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              value={planDraft.company}
              onChange={(e) => setPlanDraft({ ...planDraft, company: e.target.value })}
              placeholder="Company"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <Textarea
              value={planDraft.days30}
              onChange={(e) => setPlanDraft({ ...planDraft, days30: e.target.value })}
              placeholder="Days 1–30: orient & learn"
              rows={2}
              className="text-xs"
            />
            <Textarea
              value={planDraft.days60}
              onChange={(e) => setPlanDraft({ ...planDraft, days60: e.target.value })}
              placeholder="Days 31–60: apply & contribute"
              rows={2}
              className="text-xs"
            />
            <Textarea
              value={planDraft.days90}
              onChange={(e) => setPlanDraft({ ...planDraft, days90: e.target.value })}
              placeholder="Days 61–90: own & deliver"
              rows={2}
              className="text-xs"
            />
            <Textarea
              value={planDraft.stakeholders}
              onChange={(e) => setPlanDraft({ ...planDraft, stakeholders: e.target.value })}
              placeholder="Key stakeholders (10–15 people)"
              rows={2}
              className="text-xs"
            />
            <Textarea
              value={planDraft.questions}
              onChange={(e) => setPlanDraft({ ...planDraft, questions: e.target.value })}
              placeholder="Open questions log"
              rows={2}
              className="text-xs"
            />
            <Button size="sm" className="w-full" onClick={() => void savePlan()}>
              Save plan
            </Button>

            <div className="pt-3 border-t border-border space-y-2">
              <h3 className="text-xs font-semibold text-foreground m-0">Saved plans</h3>
              {plans.length === 0 && <p className="text-xs text-muted-foreground italic">No plans yet.</p>}
              {plans.map((p) => (
                <div key={p.id} className="p-3 rounded-md bg-muted/20 border border-border/40 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="m-0 font-semibold text-foreground text-sm">
                      {p.jobTitle ?? 'Untitled'}
                      {p.company ? ` @ ${p.company}` : ''}
                    </p>
                    <span className="text-[10px] text-muted-foreground">{p.createdAt.slice(0, 10)}</span>
                  </div>
                  {p.plan.days30 && (
                    <div className="p-2 rounded bg-background/50 border border-border/30">
                      <p className="font-semibold text-foreground text-[11px] mb-1">Days 1–30: Orient & Learn</p>
                      <pre className="text-muted-foreground whitespace-pre-wrap font-sans text-xs leading-relaxed m-0">
                        {p.plan.days30}
                      </pre>
                    </div>
                  )}
                  {p.plan.days60 && (
                    <div className="p-2 rounded bg-background/50 border border-border/30">
                      <p className="font-semibold text-foreground text-[11px] mb-1">Days 31–60: Apply & Contribute</p>
                      <pre className="text-muted-foreground whitespace-pre-wrap font-sans text-xs leading-relaxed m-0">
                        {p.plan.days60}
                      </pre>
                    </div>
                  )}
                  {p.plan.days90 && (
                    <div className="p-2 rounded bg-background/50 border border-border/30">
                      <p className="font-semibold text-foreground text-[11px] mb-1">Days 61–90: Own & Elevate</p>
                      <pre className="text-muted-foreground whitespace-pre-wrap font-sans text-xs leading-relaxed m-0">
                        {p.plan.days90}
                      </pre>
                    </div>
                  )}
                  {p.plan.stakeholders && (
                    <div className="p-2 rounded bg-background/50 border border-border/30">
                      <p className="font-semibold text-foreground text-[11px] mb-1">Stakeholder Map & Checklist</p>
                      <pre className="text-muted-foreground whitespace-pre-wrap font-sans text-xs leading-relaxed m-0">
                        {p.plan.stakeholders}
                      </pre>
                    </div>
                  )}
                  {p.plan.questions && (
                    <div className="p-2 rounded bg-background/50 border border-border/30">
                      <p className="font-semibold text-foreground text-[11px] mb-1">Key Week-1 Questions</p>
                      <pre className="text-muted-foreground whitespace-pre-wrap font-sans text-xs leading-relaxed m-0">
                        {p.plan.questions}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Brag vault */}
          <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
            <h2 className="text-base font-bold text-foreground m-0">Promotion-scope brag vault</h2>
            <p className="text-xs text-muted-foreground m-0">
              Tag wins by scope tier. Promotion packets fail on scope, not volume — surface gaps months early.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Promotion scope tier"
                value={bragDraft.scopeTier}
                onChange={(e) => setBragDraft({ ...bragDraft, scopeTier: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="individual">Individual</option>
                <option value="team">Team</option>
                <option value="cross_team">Cross-team</option>
                <option value="org">Org</option>
              </select>
              <input
                value={bragDraft.competency}
                onChange={(e) => setBragDraft({ ...bragDraft, competency: e.target.value })}
                placeholder="Competency"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <input
              value={bragDraft.title}
              onChange={(e) => setBragDraft({ ...bragDraft, title: e.target.value })}
              placeholder="Win title"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <Textarea
              value={bragDraft.impact}
              onChange={(e) => setBragDraft({ ...bragDraft, impact: e.target.value })}
              placeholder="Quantified impact"
              rows={2}
              className="text-xs"
            />
            <Button size="sm" className="w-full" onClick={() => void saveBrag()}>
              Capture win
            </Button>

            <div className="pt-3 border-t border-border space-y-2">
              <h3 className="text-xs font-semibold text-foreground m-0">Captured wins</h3>
              {brags.length === 0 && <p className="text-xs text-muted-foreground italic">No wins yet.</p>}
              {brags.map((b) => (
                <div key={b.id} className="p-3 rounded-md bg-muted/20 border border-border/40 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {SCOPE_LABEL[b.scopeTier] ?? b.scopeTier}
                    </Badge>
                    <span className="text-muted-foreground">{b.competency}</span>
                  </div>
                  <p className="m-0 font-medium text-foreground">{b.title}</p>
                  {b.impact && <p className="m-0 text-muted-foreground">{b.impact}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default HiredMode;
