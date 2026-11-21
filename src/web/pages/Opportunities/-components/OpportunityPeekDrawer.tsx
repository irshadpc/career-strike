import { Briefcase, Building, CheckCircle2, ChevronRight, ExternalLink, Globe, MapPin, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type Disposition, type JobDetail, type JobSummary } from '../../../api';
import { TierChip } from '../../../components/FitPanel';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { EMPLOYMENT_LABEL, formatSalary, REMOTE_LABEL } from '../../../format';
import { Link, useNavigateTo } from '../../../router';

export interface OpportunityPeekDrawerProps {
  job: JobSummary | null;
  onClose: () => void;
  onDisposition?: (id: string, d: Disposition) => void;
}

export function OpportunityPeekDrawer({ job, onClose, onDisposition }: OpportunityPeekDrawerProps) {
  const navigate = useNavigateTo();
  const [fullJob, setFullJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch full job description when job changes
  useEffect(() => {
    if (!job) {
      setFullJob(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<{ job: JobDetail }>(`/api/jobs/${job.id}`)
      .then((res) => {
        if (!cancelled) setFullJob(res.job);
      })
      .catch(() => {
        if (!cancelled) setFullJob(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job]);

  if (!job) return null;

  const salary = formatSalary(job.salary);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in-0 duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Opportunity details for ${job.title}`}
    >
      <div
        className="w-full sm:w-[540px] lg:w-[620px] h-full bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-border bg-muted/20 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-primary text-sm flex items-center gap-1.5">
                <Building className="w-4 h-4" />
                {job.employer}
              </span>
              {(job.countryCode || job.market.location.countryCode) && (
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted border border-border text-foreground font-semibold">
                  {job.countryCode || job.market.location.countryCode}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground leading-snug tracking-tight m-0">{job.title}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
              {(job.normalizedLocation || job.locationText) && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {job.normalizedLocation || job.locationText}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" />
                {REMOTE_LABEL[job.workMode || job.remotePolicy]}
              </span>
              {job.employmentType !== 'unknown' && <span>• {EMPLOYMENT_LABEL[job.employmentType]}</span>}
              {salary && <span className="font-semibold text-foreground">• {salary}</span>}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1 h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
            aria-label="Close peek drawer"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Action Toolbar */}
        <div className="px-6 py-3 border-b border-border bg-background flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                navigate(`/jobs/${job.id}`);
                onClose();
              }}
              className="gap-1.5 text-xs font-semibold"
            >
              <span>Open Full Inspector</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            {(fullJob?.postingUrl || fullJob?.applyUrl) && (
              <a
                href={fullJob.postingUrl || fullJob.applyUrl || '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline"
              >
                <span>Original Post</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {job.fit && <TierChip tier={job.fit.tier} />}
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Skills Alignment Matrix */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Skills Overlap &amp; Extraction
            </h3>
            {job.allSkills && job.allSkills.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {job.allSkills.map((skill) => {
                  const isMatched =
                    job.matchedSkills?.some((s) => s.toLowerCase() === skill.toLowerCase()) ||
                    job.fit?.matchedSkills.some((s) => s.toLowerCase() === skill.toLowerCase());
                  return (
                    <Badge
                      key={skill}
                      variant="outline"
                      className={`text-xs ${
                        isMatched
                          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 font-semibold'
                          : 'bg-muted/40 text-muted-foreground border-border'
                      }`}
                    >
                      {isMatched && <CheckCircle2 className="w-3 h-3 mr-1 inline" />}
                      {skill}
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No specific skills indexed for this role.</p>
            )}
          </div>

          {/* Description Content */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Job Description</h3>
            {loading ? (
              <div className="space-y-2 py-4">
                <div className="h-4 bg-muted/60 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-muted/60 rounded animate-pulse w-full" />
                <div className="h-4 bg-muted/60 rounded animate-pulse w-5/6" />
                <div className="h-4 bg-muted/60 rounded animate-pulse w-2/3" />
              </div>
            ) : fullJob && fullJob.description ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed space-y-3 text-sm">
                {Array.isArray(fullJob.description) ? (
                  fullJob.description.map((block: any, i: number) => {
                    if (block.type === 'heading') {
                      return (
                        <h4 key={i} className="font-semibold text-foreground text-sm pt-2">
                          {block.text}
                        </h4>
                      );
                    }
                    if (block.type === 'list' && Array.isArray(block.items)) {
                      return (
                        <ul key={i} className="list-disc pl-5 space-y-1">
                          {block.items.map((item: string, j: number) => (
                            <li key={j}>{item}</li>
                          ))}
                        </ul>
                      );
                    }
                    return <p key={i}>{block.text || String(block)}</p>;
                  })
                ) : (
                  <p className="whitespace-pre-line">{String(fullJob.description)}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Full description is unavailable.</p>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Press <kbd className="font-mono bg-background border border-border px-1 rounded">ESC</kbd> to close
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              navigate(`/jobs/${job.id}`);
              onClose();
            }}
          >
            Apply &amp; Tailor CV
          </Button>
        </div>
      </div>
    </div>
  );
}
