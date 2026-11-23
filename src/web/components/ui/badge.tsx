import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '../../helpers/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent text-accent-fg shadow-xs hover:bg-accent-hover',
        secondary: 'border-border bg-subtle text-ink hover:bg-subtle/80',
        destructive:
          'border-status-danger-border bg-status-danger-bg text-status-danger-fg shadow-xs hover:bg-status-danger-bg/80',
        outline: 'border-border bg-surface text-ink',
        success: 'border-status-success-border bg-status-success-bg text-status-success-fg',
        teal: 'border-status-success-border bg-status-success-bg text-status-success-fg',
        warning: 'border-status-warn-border bg-status-warn-bg text-status-warn-fg',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
