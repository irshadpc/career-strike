import { useEffect, useState } from 'react';
import {
  type Company360Profile,
  type CompanyEvent,
  fetchCompany360,
  fetchCompanyEvents,
  recordCompanyEvent,
  toggleCompanyWatch,
} from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';

interface Props {
  companyId: string | null;
  onClose: () => void;
}

const MOMENTUM_BADGES: Record<
  string,
  { label: string; variant: 'teal' | 'warning' | 'secondary' | 'outline' | 'destructive' }
> = {
  SURGING: { label: 'Surging hiring activity', variant: 'teal' },
  STEADY: { label: 'Steady hiring pace', variant: 'secondary' },
  STAGNANT: { label: 'Stagnant (no new openings)', variant: 'warning' },
  COOLING: { label: 'Cooling / contracting', variant: 'destructive' },
  UNKNOWN: { label: 'Unknown activity pace', variant: 'outline' },
};

export function Company360Modal({ companyId, onClose }: Props) {
  const [profile, setProfile] = useState<Company360Profile | null>(null);
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Note / Event Form
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDetail, setEventDetail] = useState('');
  const [eventKind, setEventKind] = useState('CANDIDATE_NOTE');
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setProfile(null);
      setEvents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchCompany360(companyId), fetchCompanyEvents(companyId)])
      .then(([pRes, eRes]) => {
        if (cancelled) return;
        setProfile(pRes.company);
        setEvents(eRes.events);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load company 360 intelligence.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const handleToggleWatch = async () => {
    if (!profile) return;
    try {
      const nextWatch = !profile.isWatched;
      await toggleCompanyWatch(profile.id, nextWatch);
      setProfile({ ...profile, isWatched: nextWatch });
    } catch {
      // ignore or alert
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !eventTitle.trim()) return;
    setSavingEvent(true);
    try {
      const res = await recordCompanyEvent(profile.id, {
        kind: eventKind,
        title: eventTitle.trim(),
        detail: eventDetail.trim(),
        source: 'candidate_note',
      });
      setEvents([res.event, ...events]);
      setEventTitle('');
      setEventDetail('');
      setShowEventForm(false);
    } catch {
      // ignore
    } finally {
      setSavingEvent(false);
    }
  };

  if (!companyId) return null;

  const momentumInfo =
    (profile?.momentum ? MOMENTUM_BADGES[profile.momentum.trend] : undefined) ?? MOMENTUM_BADGES.UNKNOWN!;

  return (
    <Dialog open={Boolean(companyId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-6">
            <div>
              <DialogTitle className="text-xl font-bold font-serif text-foreground">
                {profile?.name ?? 'Loading Company Intelligence...'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                360° Company Intelligence, hiring signals, and dated observation provenance.
              </DialogDescription>
            </div>
            {profile && (
              <Button
                type="button"
                size="sm"
                variant={profile.isWatched ? 'secondary' : 'outline'}
                onClick={handleToggleWatch}
                className="shrink-0"
              >
                {profile.isWatched ? '★ Following' : '☆ Follow Company'}
              </Button>
            )}
          </div>
        </DialogHeader>

        {loading && <p className="text-xs text-muted-foreground py-6 text-center">Loading intelligence claims...</p>}
        {error && <p className="text-xs text-destructive py-6 text-center">{error}</p>}

        {profile && !loading && (
          <div className="space-y-6 text-sm">
            {/* Momentum & Hiring Pulse */}
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Startup Hiring Momentum
                </span>
                <Badge variant={momentumInfo.variant}>{momentumInfo.label}</Badge>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{profile.momentum.rationale}</p>
              <div className="grid grid-cols-3 gap-2 pt-2 text-xs text-muted-foreground border-t border-border/50">
                <div>
                  <span className="block font-semibold text-foreground">{profile.openRolesCount}</span>
                  Verified Open Roles
                </div>
                <div>
                  <span className="block font-semibold text-foreground">{profile.momentum.openedLast30Days}</span>
                  Opened Last 30d
                </div>
                <div>
                  <span className="block font-semibold text-foreground">{profile.momentum.closedLast30Days}</span>
                  Closed Last 30d
                </div>
              </div>
            </div>

            {/* Core Dimensions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Stage & Funding */}
              <div className="p-3.5 rounded-lg border border-border space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Company Stage & Funding
                </span>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stage:</span>
                    <strong className="text-foreground">{profile.stage.value.replaceAll('_', ' ')}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Raised:</span>
                    <strong className="text-foreground">
                      {profile.fundingSummary.totalRaised
                        ? `$${(profile.fundingSummary.totalRaised / 1_000_000).toFixed(1)}M USD`
                        : 'Undisclosed / Unknown'}
                    </strong>
                  </div>
                  {profile.fundingSummary.rounds.length > 0 && (
                    <div className="pt-2 border-t border-border/40 space-y-1">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">Rounds:</span>
                      {profile.fundingSummary.rounds.map((round) => (
                        <div key={round.roundName} className="flex justify-between text-[11px]">
                          <span>
                            {round.roundName} ({round.announcedDate.slice(0, 7)})
                          </span>
                          <span>
                            {round.amountUsd ? `$${(round.amountUsd / 1_000_000).toFixed(1)}M` : 'Undisclosed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground italic pt-1">
                    Observed: {profile.stage.observedAt.slice(0, 10)} via {profile.stage.source}
                  </p>
                </div>
              </div>

              {/* Team & Tech Stack */}
              <div className="p-3.5 rounded-lg border border-border space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Headcount & Tech Stack
                </span>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Team Size:</span>
                    <strong className="text-foreground">{profile.teamSizeRange.value}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Headcount Trend:</span>
                    <strong className="text-foreground">{profile.headcountTrend.value}</strong>
                  </div>
                  <div className="pt-2 border-t border-border/40">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                      Detected Tech Stack:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {profile.techStack.value.length > 0 ? (
                        profile.techStack.value.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px] py-0 px-1.5">
                            {t}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">No tech stack claims detected</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic pt-1">
                    Source: {profile.techStack.source} ({profile.techStack.observedAt.slice(0, 10)})
                  </p>
                </div>
              </div>
            </div>

            {/* Official Links */}
            <div className="flex flex-wrap gap-4 text-xs">
              {profile.officialWebsite && (
                <a
                  href={profile.officialWebsite}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  Visit official website →
                </a>
              )}
              {profile.careersUrl && (
                <a
                  href={profile.careersUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  Direct careers board →
                </a>
              )}
            </div>

            {/* Timeline Events */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground m-0">
                  Observed Timeline & Events ({events.length})
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEventForm((s) => !s)}
                  className="text-xs h-7"
                >
                  {showEventForm ? 'Cancel Note' : '+ Add Note'}
                </Button>
              </div>

              {showEventForm && (
                <form onSubmit={handleSaveEvent} className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Note title (e.g. Spoke to engineer at meetup)"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      required
                      className="text-xs"
                    />
                    <select
                      value={eventKind}
                      onChange={(e) => setEventKind(e.target.value)}
                      className="text-xs border border-border rounded-md px-2 bg-background"
                    >
                      <option value="CANDIDATE_NOTE">Candidate Note</option>
                      <option value="FUNDING_ANNOUNCEMENT">Funding News</option>
                      <option value="HIRING_SURGE">Hiring Surge</option>
                      <option value="HEADCOUNT_CHANGE">Headcount Change</option>
                    </select>
                  </div>
                  <Textarea
                    placeholder="Details or context..."
                    value={eventDetail}
                    onChange={(e) => setEventDetail(e.target.value)}
                    rows={2}
                    className="text-xs"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={savingEvent || !eventTitle.trim()}>
                      {savingEvent ? 'Saving...' : 'Save Note'}
                    </Button>
                  </div>
                </form>
              )}

              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No historical events recorded yet.</p>
              ) : (
                <ol className="relative border-l border-border/70 ml-2 space-y-3 my-2 list-none p-0">
                  {events.map((ev) => (
                    <li key={ev.id} className="ml-4">
                      <div className="absolute w-2 h-2 bg-primary rounded-full -left-1 border border-background" />
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-medium text-foreground">{ev.title}</strong>
                        <span className="text-[10px] text-muted-foreground">{ev.eventAt.slice(0, 10)}</span>
                      </div>
                      {ev.detail && <p className="text-xs text-muted-foreground mt-0.5 m-0">{ev.detail}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Disclaimer & Transparency Note */}
            <div className="p-3 rounded-md bg-muted/40 border border-border/50 text-[11px] text-muted-foreground">
              <strong>Evidence-backed transparency:</strong> Values with insufficient confirmation are shown as UNKNOWN.
              Headcount growth and funding announcements do not prove financial health, workplace quality, or future job
              openings.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
