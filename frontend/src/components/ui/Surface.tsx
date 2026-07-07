import React from 'react';
import { cn } from '@/lib/utils';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'subtle' | 'accent';
}

const toneClasses = {
  default: 'border-stroke-soft-200 bg-bg-white-0',
  subtle: 'border-stroke-soft-200 bg-bg-subtle',
  accent: 'border-transparent bg-bg-accent-soft',
} as const;

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, tone = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-panel border shadow-none', toneClasses[tone], className)}
      {...props}
    />
  )
);

Surface.displayName = 'Surface';
