import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { Button } from './ui/button';

export function Loading({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-6" role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label ?? 'Loading…'}</span>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
      <p className="text-destructive">{message}</p>
      {onRetry && (
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs animate-pulse" aria-hidden="true">
      <div className="h-4 w-1/3 bg-muted rounded mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 bg-muted rounded mb-2" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function JobListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse flex gap-3">
          <div className="h-10 w-10 rounded bg-muted shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-muted rounded" />
            <div className="h-3 w-1/2 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: ComponentType<{ className?: string }> | LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
      {Icon && <Icon className="mx-auto h-8 w-8 text-muted-foreground mb-3" />}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
