import type { CompanySignal, HiringSignal } from '../../../api';
import { Badge } from '../../../components/ui/badge';

const SIGNAL: Record<HiringSignal, { label: string; variant: 'teal' | 'warning' | 'secondary' }> = {
  VERIFIED_OPEN_ROLES: { label: 'Verified open roles', variant: 'teal' },
  NO_OPEN_ROLES_OBSERVED: { label: 'No open roles observed', variant: 'secondary' },
  EVIDENCE_STALE: { label: 'Evidence needs refresh', variant: 'warning' },
  BOARD_UNAVAILABLE: { label: 'Board unavailable', variant: 'warning' },
  NOT_YET_OBSERVED: { label: 'Not yet observed', variant: 'secondary' },
};

/**
 * Company signals are evidence cards, not vacancy advertisements. Every card says what this
 * installation actually retrieved and avoids implying that an employer is or is not hiring.
 */
export function CompanySignals({ companies }: { companies: CompanySignal[] }) {
  if (companies.length === 0) return null;
  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4"
      aria-labelledby="company-signals-title"
    >
      <div>
        <h2 id="company-signals-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
          Company hiring signals
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Derived only from public boards retrieved into this workspace. A missing signal is not evidence that a company
          has stopped hiring, and an open role is not a prediction of an interview.
        </p>
      </div>

      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 list-none p-0 m-0">
        {companies.map((company) => {
          const status = SIGNAL[company.signal];
          return (
            <li key={company.id} className="rounded-lg border border-border/70 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="text-sm font-semibold text-foreground">{company.employer}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {company.source} · {company.board}
                  </span>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed m-0">{company.explanation}</p>
              {company.sampleRoles.length > 0 && (
                <ul className="text-xs text-foreground m-0 pl-4 space-y-0.5">
                  {company.sampleRoles.slice(0, 3).map((role) => (
                    <li key={`${company.id}-${role.title}-${role.lastSeenAt}`}>
                      {role.title}
                      {role.location ? ` — ${role.location}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-3 text-xs">
                <a
                  className="text-primary hover:underline"
                  href={company.careersUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Official careers page
                </a>
                <a
                  className="text-primary hover:underline"
                  href={company.boardUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Public board
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
