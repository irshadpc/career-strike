import { Eye } from 'lucide-react';
import type { Disposition, JobSummary } from '../../../api';
import { TierChip } from '../../../components/FitPanel';
import { DispositionControls, StatusChip } from '../../../components/jobBits';
import { Badge } from '../../../components/ui/badge';
import { EMPLOYMENT_LABEL, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../../../format';
import { Link } from '../../../router';

function listSome(items: string[]): string {
  return items.length <= 3 ? items.join(', ') : `${items.slice(0, 3).join(', ')} +${items.length - 3}`;
}

export function getAtsProviderPill(job: JobSummary): { name: string; color: string } {
  const url = (job.applyUrl || '').toLowerCase();
  const sources = job.sources || [];
  if (url.includes('greenhouse.io') || url.includes('gh_src=') || sources.includes('greenhouse')) {
    return {
      name: 'on Greenhouse',
      color: 'bg-status-success-bg text-status-success-fg border-status-success-border',
    };
  }
  if (url.includes('lever.co') || sources.includes('lever')) {
    return {
      name: 'on Lever',
      color: 'bg-subtle text-ink border-border',
    };
  }
  if (url.includes('ashbyhq.com') || sources.includes('ashby')) {
    return {
      name: 'on Ashby',
      color: 'bg-subtle text-ink border-border',
    };
  }
  if (url.includes('myworkdayjobs.com') || url.includes('workday.com') || url.includes('myworkday.com')) {
    return {
      name: 'on Workday',
      color: 'bg-status-warn-bg text-status-warn-fg border-status-warn-border',
    };
  }
  return {
    name: 'Direct Portal',
    color: 'bg-subtle text-ink-secondary border-border',
  };
}

export function JobRow({
  job,
  selected,
  compareFull,
  filterSkillCount,
  onCompare,
  onDisposition,
  onPeek,
  autopilotSelected,
  onAutopilotToggle,
}: {
  job: JobSummary;
  selected: boolean;
  compareFull: boolean;
  filterSkillCount?: number;
  onCompare: () => void;
  onDisposition: (d: Disposition) => void;
  onPeek?: (job: JobSummary) => void;
  autopilotSelected?: boolean;
  onAutopilotToggle?: () => void;
}) {
  const salary = formatSalary(job.salary);
  const atsPill = getAtsProviderPill(job);
  return (
    <li className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card shadow-xs hover:border-border/80 transition-colors">
      <div className="space-y-1.5 flex-1 min-w-0">
        <h2 className="text-base font-semibold text-foreground m-0 truncate">
          <Link href={`/jobs/${job.id}`} className="hover:underline">
            {job.title}
          </Link>
        </h2>
        <p className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground m-0">
          <span className="font-medium text-foreground">{job.employer}</span>
          <span
            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border ${atsPill.color}`}
          >
            {atsPill.name}
          </span>
          {(job.normalizedLocation || job.locationText) && (
            <>
              <span>•</span>
              <span>{job.normalizedLocation || job.locationText}</span>
            </>
          )}
          {(job.countryCode || job.market.location.countryCode) && (
            <>
              <span>•</span>
              <span className="font-mono">{job.countryCode || job.market.location.countryCode}</span>
            </>
          )}
          <span>•</span>
          <span>{REMOTE_LABEL[job.workMode || job.remotePolicy]}</span>
          {job.employmentType !== 'unknown' && (
            <>
              <span>•</span>
              <span>{EMPLOYMENT_LABEL[job.employmentType]}</span>
            </>
          )}
          {salary && (
            <>
              <span>•</span>
              <span className="font-semibold text-foreground">{salary}</span>
            </>
          )}
        </p>
        {job.fit && (
          <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
            <TierChip tier={job.fit.tier} />
            {job.fit.matchedSkills.length > 0 && (
              <span className="text-status-success-fg font-medium">You have {listSome(job.fit.matchedSkills)}</span>
            )}
            {job.fit.missingRequiredSkills.length > 0 && (
              <span className="text-status-warn-fg font-medium">Missing {listSome(job.fit.missingRequiredSkills)}</span>
            )}
            {job.fit.immediateStartAsked && (
              <Badge variant="warning" className="text-[10px]">
                Asks for an early start
              </Badge>
            )}
          </div>
        )}
        {job.allSkills && job.allSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1" aria-label="Extracted skills">
            {filterSkillCount && filterSkillCount > 0 ? (
              <Badge
                variant="outline"
                className="bg-status-success-bg text-status-success-fg border-status-success-border text-[10px] font-semibold"
              >
                {job.matchedSkills?.length || 0}/{filterSkillCount} skills matched
              </Badge>
            ) : job.matchedSkills && job.matchedSkills.length > 0 ? (
              <Badge
                variant="outline"
                className="bg-status-success-bg text-status-success-fg border-status-success-border text-[10px] font-semibold"
              >
                {job.matchedSkills.length} matched
              </Badge>
            ) : null}
            {job.allSkills.slice(0, 7).map((skill) => {
              const isMatched = job.matchedSkills?.includes(skill);
              return (
                <span
                  key={skill}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    isMatched
                      ? 'bg-status-success-bg text-status-success-fg border-status-success-border font-semibold'
                      : 'bg-subtle text-ink-secondary border-border'
                  }`}
                >
                  {skill}
                </span>
              );
            })}
            {job.allSkills.length > 7 && (
              <span className="text-[10px] text-muted-foreground">+{job.allSkills.length - 7} more</span>
            )}
          </div>
        )}
        <GhostJobTriage job={job} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
          <StatusChip status={job.status} lastVerifiedAt={job.lastVerifiedAt} />
          <span>{job.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}</span>
          {job.sourceCapabilities.includes('AUTHORIZED_EMPLOYER_DIRECT') && (
            <Badge variant="outline" className="text-[10px]">
              Employer-direct
            </Badge>
          )}
          {job.sourceCapabilities.includes('USER_DRIVEN_DISCOVERY') && (
            <Badge variant="outline" className="text-[10px]">
              User-added
            </Badge>
          )}
          {job.employerExcluded && (
            <Badge variant="destructive" className="text-[10px]">
              Excluded employer
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
        <DispositionControls jobId={job.id} title={job.title} disposition={job.disposition} onChange={onDisposition} />
        {onPeek && (
          <button
            type="button"
            onClick={() => onPeek(job)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            title={`Quick peek ${job.title}`}
            aria-label={`Quick peek ${job.title}`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Peek</span>
          </button>
        )}
        {job.status !== 'CLOSED' && (
          <Link
            href={`/jobs/${job.id}`}
            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Apply →
          </Link>
        )}
        {onAutopilotToggle && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autopilotSelected}
              onChange={onAutopilotToggle}
              className="accent-primary h-3.5 w-3.5 rounded"
            />
            <span className={autopilotSelected ? 'font-medium text-foreground' : ''}>
              Autopilot<span className="sr-only"> queue {job.title}</span>
            </span>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            disabled={!selected && compareFull}
            onChange={onCompare}
            className="accent-primary"
          />
          <span>
            Compare<span className="sr-only"> {job.title}</span>
          </span>
        </label>
      </div>
    </li>
  );
}

function GhostJobTriage({ job }: { job: JobSummary }) {
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(job.firstSeenAt).getTime()) / 86_400_000));
  const stale = ageDays >= 30;
  const noSalary = !job.salary;
  const fitRatio =
    job.fit && job.fit.matchedSkills.length + job.fit.missingRequiredSkills.length > 0
      ? job.fit.matchedSkills.length / (job.fit.matchedSkills.length + job.fit.missingRequiredSkills.length)
      : null;
  const roleMatch = fitRatio === null ? null : fitRatio >= 0.6 ? 'strong' : fitRatio >= 0.3 ? 'partial' : 'weak';
  // Only show the triage line when there is something worth flagging or confirming.
  if (!stale && !noSalary && roleMatch !== 'weak') return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-1" aria-label="Worth your energy triage">
      <span className="font-semibold text-muted-foreground uppercase tracking-wider">Triage:</span>
      {stale ? (
        <Badge variant="warning" className="text-[10px]">
          Stale posting ({ageDays}d)
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px]">
          Fresh ({ageDays}d)
        </Badge>
      )}
      {noSalary ? (
        <Badge variant="warning" className="text-[10px]">
          No salary listed
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px]">
          Salary listed
        </Badge>
      )}
      {roleMatch === 'weak' && (
        <Badge variant="destructive" className="text-[10px]">
          Weak role match
        </Badge>
      )}
    </div>
  );
}

export default JobRow;
