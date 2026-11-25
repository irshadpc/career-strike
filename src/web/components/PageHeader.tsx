import type { ReactNode } from 'react';
import { cn } from '../helpers/cn';

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, lede, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col md:flex-row md:items-end md:justify-between gap-4 pb-5 mb-6 border-b border-border',
        className,
      )}
    >
      <div className="space-y-1.5">
        {eyebrow && (
          <p className="text-[11px] uppercase tracking-[0.08em] font-mono font-semibold text-muted-foreground m-0">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-serif m-0">{title}</h1>
        {lede && (
          <p className="text-muted-foreground text-sm sm:text-[15px] m-0 max-w-[72ch] leading-relaxed">{lede}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
}

export default PageHeader;
