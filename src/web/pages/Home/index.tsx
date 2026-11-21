import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { api, type Overview, type ProfileReadinessReport } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { useToast } from '../../components/ui/toast';
import { ago } from '../../format';
import { cn } from '../../helpers/cn';
import { useResource } from '../../hooks/useResource';
import { Link } from '../../router';
import { Count } from './-components/Count';

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Home() {
  const overview = useResource<Overview>('/api/overview');
  const readiness = useResource<{ readiness: ProfileReadinessReport }>('/api/profile/readiness');
  interface DeskMission {
    title: string;
    weeklyEffortHours: number;
  }
  interface DeskRecommendation {
    job: {
      id: string;
      employer: string;
      title: string;
      salary?: { currency: string; min?: number; max?: number; interval: string };
    };
    nextBestAction: string;
    dimensions: { professionalRelevance: { tier: string }; applicationEffort: { level: string } };
  }
  const desk = useResource<{
    mission: DeskMission | null;
    briefing: {
      date: string;
      headline: string;
      summary: string;
      completedWork: string[];
      deservesAttention: unknown[];
      answers: Record<string, string>;
    } | null;
    plan: unknown;
    topRecommendations: DeskRecommendation[];
    ledger: unknown[];
  }>('/api/assistant/desk');

  interface ShortlistHit {
    searchId: string;
    searchName: string;
    matchedSkills: string[];
    job: {
      id: string;
      employer: string;
      title: string;
      locationText: string | null;
      normalizedLocation: string | null;
      countryCode: string | null;
      workMode: 'remote' | 'hybrid' | 'onsite' | 'unknown';
      firstSeenAt: string;
    };
  }
  const shortlist = useResource<{ searches: { id: string; name: string }[]; hits: ShortlistHit[] }>(
    '/api/home/todays-shortlist',
  );
  const [markingSeen, setMarkingSeen] = useState(false);

  const [decisionPending, setDecisionPending] = useState<string | null>(null);
  const { toast } = useToast();

  // Daily focus cap: a calm, anti-burnout guardrail (Pillar 1 of the candidate UX audit).
  // Tracks how many roles the candidate has actively decided on today, on this device.
  const todayKey = new Date().toISOString().slice(0, 10);
  const [focusCap, setFocusCap] = useState<number>(() => {
    const v = window.localStorage.getItem('cs.dailyFocusCap');
    const n = v ? Number(v) : 5;
    return Number.isFinite(n) && n > 0 ? n : 5;
  });
  const [focusDone, setFocusDone] = useState<number>(() => {
    const raw = window.localStorage.getItem(`cs.dailyFocus.done.${todayKey}`);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const [restOverride, setRestOverride] = useState(false);

  const handleDecision = async (jobId: string, decision: 'APPLY' | 'INVESTIGATE' | 'WATCH' | 'SKIP') => {
    setDecisionPending(jobId);
    const label = decision.charAt(0) + decision.slice(1).toLowerCase();
    try {
      await api(`/api/assistant/decision/${jobId}`, {
        method: 'POST',
        body: { decision },
      });
      if ('reload' in desk) desk.reload();
      toast({ variant: 'success', title: `${label} recorded`, description: 'Your decision has been saved.' });
      setFocusDone((d) => {
        const next = d + 1;
        window.localStorage.setItem(`cs.dailyFocus.done.${todayKey}`, String(next));
        return next;
      });
    } catch {
      toast({
        variant: 'destructive',
        title: `${label} failed`,
        description: 'Could not save your decision. Try again.',
        action: { label: 'Retry', onClick: () => void handleDecision(jobId, decision) },
      });
    } finally {
      setDecisionPending(null);
    }
  };

  return (
    <div>
      <PageHeader eyebrow={dateFormat.format(new Date())} title="Where things stand" />
      {overview.state === 'loading' && <Loading label="Loading your overview" />}
      {overview.state === 'error' && <ErrorPanel message={overview.message} onRetry={overview.retry} />}
      {overview.state === 'ready' && (
        <>
          {/* Daily focus cap — calm, anti-burnout guardrail (Pillar 1). */}
          <section
            aria-labelledby="focus-cap-title"
            className="mb-6 p-4 bg-card border border-border rounded-xl shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2 id="focus-cap-title" className="text-sm font-semibold text-foreground m-0">
                  Today's focus
                </h2>
                <p className="text-xs text-muted-foreground m-0">
                  {focusDone >= focusCap && !restOverride
                    ? "You've reached today's focus cap. Rest is fuel for a multi-month search — pick it back up tomorrow."
                    : `${focusDone} of ${focusCap} roles decided today. A small, deliberate daily budget beats grinding.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Daily cap
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={focusCap}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n > 0 && n <= 20) {
                        setFocusCap(n);
                        window.localStorage.setItem('cs.dailyFocusCap', String(n));
                      }
                    }}
                    className="h-7 w-14 rounded-md border border-input bg-background px-2 text-xs"
                  />
                </label>
                {focusDone >= focusCap && !restOverride && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setRestOverride(true)}>
                    Continue anyway
                  </Button>
                )}
                {restOverride && (
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setRestOverride(false)}>
                    Pause
                  </Button>
                )}
              </div>
            </div>
          </section>

          {readiness.state === 'ready' && (
            <section
              aria-labelledby="readiness-home-title"
              className="mb-6 p-4 bg-card border border-border rounded-xl shadow-xs"
            >
              <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="secondary">{readiness.data.readiness.title}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {readiness.data.readiness.counts.confirmedRoles} confirmed role
                      {readiness.data.readiness.counts.confirmedRoles === 1 ? '' : 's'} ·{' '}
                      {readiness.data.readiness.counts.confirmedSkills} confirmed skill
                      {readiness.data.readiness.counts.confirmedSkills === 1 ? '' : 's'}
                      {readiness.data.readiness.counts.totalUnconfirmed > 0 &&
                        ` · ${readiness.data.readiness.counts.totalUnconfirmed} unconfirmed`}
                    </span>
                  </div>
                  <p id="readiness-home-title" className="m-0 text-sm text-foreground">
                    {readiness.data.readiness.summary}
                  </p>
                </div>
                <Link
                  href={readiness.data.readiness.actionHref}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'text-xs')}
                >
                  {readiness.data.readiness.actionLabel}
                </Link>
              </div>
            </section>
          )}

          {shortlist.state === 'ready' && shortlist.data.searches.length > 0 && (
            <section
              aria-labelledby="todays-shortlist-title"
              className="mb-6 p-5 bg-card border border-border rounded-xl shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 id="todays-shortlist-title" className="text-base font-semibold text-foreground m-0">
                    Today's Shortlist
                  </h2>
                  <p className="text-xs text-muted-foreground m-0 mt-0.5">
                    Net-new roles matching your saved search loops since your last visit.
                  </p>
                </div>
                {shortlist.data.hits.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={markingSeen}
                    onClick={async () => {
                      setMarkingSeen(true);
                      try {
                        await api('/api/home/todays-shortlist/mark-seen', { method: 'POST' });
                        shortlist.reload();
                        toast({ variant: 'success', title: 'Shortlist marked as seen' });
                      } catch {
                        toast({ variant: 'destructive', title: 'Could not mark shortlist as seen' });
                      } finally {
                        setMarkingSeen(false);
                      }
                    }}
                  >
                    {markingSeen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Mark all seen'}
                  </Button>
                )}
              </div>
              {shortlist.data.hits.length === 0 ? (
                <p className="text-sm text-muted-foreground m-0">No new matching roles since your last visit.</p>
              ) : (
                <ul className="list-none p-0 m-0 space-y-2">
                  {shortlist.data.hits.map((hit) => (
                    <li
                      key={`${hit.searchId}:${hit.job.id}`}
                      className="p-3 rounded-lg border border-border/60 bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <Link
                            href={`/jobs/${encodeURIComponent(hit.job.id)}`}
                            className="text-sm font-medium text-foreground hover:underline"
                          >
                            {hit.job.title}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {hit.job.employer}
                            {hit.job.normalizedLocation
                              ? ` · ${hit.job.normalizedLocation}`
                              : hit.job.locationText
                                ? ` · ${hit.job.locationText}`
                                : ''}
                          </div>
                          <div className="flex gap-1.5 flex-wrap mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {hit.searchName}
                            </Badge>
                            {hit.matchedSkills.slice(0, 4).map((sk) => (
                              <Badge key={sk} variant="outline" className="text-[10px]">
                                {sk}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {ago(hit.job.firstSeenAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Chief of Staff Desk: Daily Briefing & Spotlight */}
          {desk.state === 'ready' && desk.data?.briefing && (
            <section
              aria-label="Chief of Staff Daily Briefing"
              className="mb-6 p-5 bg-card border-2 border-primary/25 rounded-xl shadow-xs space-y-4"
            >
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="default" className="bg-primary text-primary-foreground font-semibold">
                    Chief of Staff Desk
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">{desk.data.briefing.date}</span>
                  {desk.data.mission && (
                    <span className="text-xs text-muted-foreground">
                      · Mission: <strong className="text-foreground">{desk.data.mission.title}</strong> (
                      {desk.data.mission.weeklyEffortHours}h/wk)
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-muted-foreground">Local-First · Private by Design</span>
              </div>

              <div>
                <h2 className="text-base font-bold text-foreground m-0">{desk.data.briefing.headline}</h2>
                <p className="text-sm text-muted-foreground mt-1 mb-0">{desk.data.briefing.summary}</p>
              </div>

              {/* The 6 Core Strategic Answers */}
              {desk.data.briefing.answers && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1">
                    <span className="font-semibold text-foreground block">What changed?</span>
                    <span className="text-muted-foreground">{desk.data.briefing.answers.whatChanged}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1">
                    <span className="font-semibold text-foreground block">What completed?</span>
                    <span className="text-muted-foreground">{desk.data.briefing.answers.whatCompleted}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1">
                    <span className="font-semibold text-foreground block">What deserves attention?</span>
                    <span className="text-muted-foreground">{desk.data.briefing.answers.whatDeservesAttention}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1">
                    <span className="font-semibold text-foreground block">What next?</span>
                    <span className="text-muted-foreground">{desk.data.briefing.answers.whatNext}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1">
                    <span className="font-semibold text-foreground block">Why recommended?</span>
                    <span className="text-muted-foreground">{desk.data.briefing.answers.whyRecommending}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1">
                    <span className="font-semibold text-foreground block">What are you waiting for?</span>
                    <span className="text-muted-foreground">{desk.data.briefing.answers.whatWaitingFor}</span>
                  </div>
                </div>
              )}

              {/* Top 3 Decision-Ready Opportunities */}
              {desk.data.topRecommendations &&
                desk.data.topRecommendations.length > 0 &&
                !(focusDone >= focusCap && !restOverride) && (
                  <div className="pt-3 border-t border-border/60">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Top Decision-Ready Opportunities
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {desk.data.topRecommendations.map((rec) => (
                        <div
                          key={rec.job.id}
                          className="p-4 rounded-lg border border-border bg-card/60 flex flex-col justify-between space-y-3"
                        >
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-xs font-bold text-foreground">{rec.job.employer}</span>
                              <Badge variant="secondary" className="text-[10px]">
                                {rec.nextBestAction}
                              </Badge>
                            </div>
                            <h4 className="text-sm font-semibold text-foreground m-0">
                              <Link href={`/jobs/${rec.job.id}`} className="hover:underline">
                                {rec.job.title}
                              </Link>
                            </h4>
                            <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                              <p className="m-0">
                                <strong>Relevance:</strong> Tier {rec.dimensions.professionalRelevance.tier}
                              </p>
                              <p className="m-0">
                                <strong>Effort:</strong> {rec.dimensions.applicationEffort.level}
                              </p>
                              {rec.job.salary && (
                                <p className="m-0 font-mono text-[11px] text-teal-600 dark:text-teal-400">
                                  {rec.job.salary.currency} {rec.job.salary.min?.toLocaleString() ?? '—'} -{' '}
                                  {rec.job.salary.max?.toLocaleString() ?? '—'}/{rec.job.salary.interval}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1.5 pt-2 border-t border-border/40">
                            <Button
                              size="sm"
                              variant="default"
                              className="text-xs flex-1 h-7"
                              disabled={decisionPending === rec.job.id}
                              onClick={() => void handleDecision(rec.job.id, 'APPLY')}
                            >
                              {decisionPending === rec.job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="text-xs flex-1 h-7"
                              disabled={decisionPending === rec.job.id}
                              onClick={() => void handleDecision(rec.job.id, 'WATCH')}
                            >
                              {decisionPending === rec.job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Watch'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 text-muted-foreground"
                              disabled={decisionPending === rec.job.id}
                              onClick={() => void handleDecision(rec.job.id, 'SKIP')}
                            >
                              {decisionPending === rec.job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Skip'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </section>
          )}

          {desk.state === 'ready' && focusDone >= focusCap && !restOverride && (
            <section
              aria-labelledby="protected-rest-title"
              className="mb-6 p-6 bg-card border border-border rounded-xl shadow-xs text-center space-y-2"
            >
              <h2 id="protected-rest-title" className="text-base font-semibold text-foreground m-0">
                Protected rest
              </h2>
              <p className="text-sm text-muted-foreground m-0 max-w-md mx-auto">
                You have reached today's focus cap. Rest is fuel for a multi-month search — your work is saved and
                waiting for you tomorrow.
              </p>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <section
              aria-labelledby="nba-title"
              className="p-5 rounded-lg border border-border bg-card shadow-xs space-y-4"
            >
              <h2 id="nba-title" className="text-lg font-bold text-foreground m-0">
                Next best actions
              </h2>
              {overview.data.nextActions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic my-2">Nothing needs your attention right now.</p>
              ) : (
                <ol className="space-y-3 p-0 m-0 list-none" data-testid="next-actions">
                  {overview.data.nextActions.map((a, i) => (
                    <li key={a.rule} className="flex gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
                      <span
                        className="text-xs font-mono font-bold text-muted-foreground shrink-0 mt-0.5"
                        aria-hidden="true"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground m-0">
                          <Link href={a.href} className="hover:underline">
                            {a.title}
                          </Link>
                        </h3>
                        <p className="text-xs text-muted-foreground m-0 leading-relaxed">{a.reason}</p>
                        <p className="text-[11px] font-mono text-muted-foreground m-0">
                          <span className="sr-only">Why this is shown: rule </span>
                          {a.rule}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section
              aria-labelledby="pipeline-title"
              className="p-5 rounded-lg border border-border bg-card shadow-xs space-y-4"
            >
              <h2 id="pipeline-title" className="text-lg font-bold text-foreground m-0">
                Your pipeline
              </h2>
              <dl className="grid grid-cols-2 gap-3 p-0 m-0" data-testid="pipeline">
                <Count
                  label="Verified open"
                  value={overview.data.jobs.open}
                  href="/opportunities?status=OPEN"
                  note="checked within 72 hours"
                />
                <Count
                  label="Not reviewed"
                  value={overview.data.jobs.unreviewed}
                  href="/opportunities?status=OPEN&disposition=none"
                />
                <Count
                  label="Shortlisted"
                  value={overview.data.jobs.shortlisted}
                  href="/opportunities?disposition=shortlisted"
                />
                <Count
                  label="May have closed"
                  value={overview.data.jobs.stale}
                  href="/opportunities?status=STALE"
                  note="not verified recently"
                />
                <Count
                  label="Added by you"
                  value={overview.data.jobs.unverified}
                  href="/opportunities?status=UNVERIFIED"
                  note="unverified"
                />
              </dl>
              <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">Applications</h3>
              <dl className="grid grid-cols-2 gap-3 p-0 m-0" data-testid="application-counts">
                <Count label="To review" value={overview.data.applications.readyForReview} href="/applications" />
                <Count label="Approved, not sent" value={overview.data.applications.approved} href="/applications" />
                <Count
                  label="Submitted"
                  value={overview.data.applications.submitted}
                  href="/applications"
                  note="you confirmed"
                />
                <Count label="Interviewing" value={overview.data.applications.interviewing} href="/applications" />
                <Count label="Offers" value={overview.data.applications.offers} href="/applications" />
              </dl>
              {overview.data.interviews.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">Upcoming interviews</h3>
                  <ul
                    className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground"
                    data-testid="upcoming-interviews"
                  >
                    {overview.data.interviews.map((i) => (
                      <li key={i.id} className="p-2 rounded bg-muted/30 border border-border/40">
                        <Link
                          href={`/applications/${i.applicationId}/prep`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {i.stage}
                        </Link>{' '}
                        · {i.title} at {i.employer} · {ago(i.scheduledAt)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {overview.data.followUps.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">Upcoming follow-ups</h3>
                  <ul className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground">
                    {overview.data.followUps.map((f) => (
                      <li key={f.id} className="p-2 rounded bg-muted/30 border border-border/40">
                        <Link
                          href={`/applications/${f.applicationId}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {f.note}
                        </Link>{' '}
                        · {f.title} at {f.employer} · due {ago(f.dueAt)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <aside
              className="p-5 rounded-lg border border-border bg-card shadow-xs space-y-4"
              aria-labelledby="status-title"
            >
              <h2 id="status-title" className="text-lg font-bold text-foreground m-0">
                Workspace &amp; Privacy
              </h2>
              <dl className="space-y-3 text-xs m-0">
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">Local service</dt>
                  <dd className="text-foreground flex items-center gap-1.5 m-0">
                    <span className="inline-block w-2 h-2 rounded-full bg-teal-500" aria-hidden="true" /> Running · v
                    {overview.data.service.version}
                  </dd>
                </div>
                {overview.data.service.startedAt && (
                  <div className="space-y-0.5">
                    <dt className="text-muted-foreground font-semibold">Started</dt>
                    <dd className="text-foreground m-0">
                      {timeFormat.format(new Date(overview.data.service.startedAt))}
                    </dd>
                  </div>
                )}
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">Job boards</dt>
                  <dd className="text-foreground m-0">
                    {overview.data.sources.boards === 0 ? (
                      <Link href="/opportunities/sources" className="text-primary hover:underline">
                        None monitored yet
                      </Link>
                    ) : (
                      <>
                        <Link href="/opportunities/sources" className="text-primary hover:underline">
                          {overview.data.sources.boards} monitored
                        </Link>
                        {overview.data.sources.failing > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {' '}
                            · {overview.data.sources.failing} failing
                          </span>
                        )}
                        <br />
                        <span className="text-muted-foreground text-[11px]">
                          Last successful fetch {ago(overview.data.sources.lastSuccessfulDiscovery)}
                        </span>
                      </>
                    )}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">Running now</dt>
                  <dd className="text-foreground m-0" data-testid="active-tasks">
                    {overview.data.activeTasks.length === 0
                      ? 'Nothing is running.'
                      : overview.data.activeTasks.map((t) => (
                          <span key={t.id} className="block text-muted-foreground text-xs">
                            {t.kind.startsWith('discover:') ? 'Fetching a job board' : t.kind} · started{' '}
                            {ago(t.startedAt ?? t.createdAt)}
                          </span>
                        ))}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">AI assistants</dt>
                  <dd className="text-foreground m-0">
                    {overview.data.aiHosts.connected.length > 0
                      ? `Active in the last 15 minutes: ${overview.data.aiHosts.connected.map(hostName).join(', ')}`
                      : overview.data.aiHosts.configured.length > 0
                        ? `Connected, not active recently: ${overview.data.aiHosts.configured.map(hostName).join(', ')}`
                        : 'None connected. Career Strike works fully without them.'}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">Your data</dt>
                  <dd className="text-foreground m-0">Stored only on this computer.</dd>
                </div>
              </dl>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function hostName(name: string): string {
  return (
    ({ codex: 'Codex', 'claude-code': 'Claude Code', opencode: 'OpenCode' } as Record<string, string>)[name] ?? name
  );
}

export default Home;
