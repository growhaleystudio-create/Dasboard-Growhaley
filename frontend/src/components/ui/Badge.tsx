import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'error' | 'disabled' | 'active' | 'absent';
  badgeStyle?: 'light' | 'outline' | 'solid';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showDot?: boolean;
}

const sizeClasses = {
  sm: 'px-2 py-0.5 text-[12px] h-[20px]',
  md: 'px-2.5 py-0.5 text-[12px] h-[22px]',
  lg: 'px-3 py-1 text-[14px] h-[25px]',
};

const badgeVariants = {
  light: {
    neutral: 'bg-bg-weak-50 text-text-sub-600 border-transparent',
    info: 'bg-bg-accent-soft text-primary-base border-transparent',
    primary: 'bg-alpha-primary-10 text-primary-accent border-transparent',
    success: 'bg-state-success-bg text-state-success-dark border-transparent',
    warning: 'bg-[#fff7e8] text-state-warning-base border-transparent',
    error: 'bg-state-danger-light text-state-danger-dark border-transparent',
    disabled: 'bg-bg-subtle text-text-soft-400 border-transparent',
    // Legacy maps
    active: 'bg-bg-accent-soft text-primary-accent border-transparent',
    absent: 'bg-bg-subtle text-text-soft-400 border-transparent',
  },
  outline: {
    neutral: 'bg-transparent text-text-sub-600 border-stroke-soft-200',
    info: 'bg-transparent text-state-info-base border-state-info-border',
    primary: 'bg-transparent text-primary-base border-primary-base',
    success: 'bg-transparent text-state-success-dark border-state-success-light',
    warning: 'bg-transparent text-state-warning-base border-state-warning-border',
    error: 'bg-transparent text-state-danger-dark border-state-danger-border',
    disabled: 'bg-transparent text-text-soft-400 border-stroke-soft-200',
    // Legacy maps
    active: 'bg-transparent text-primary-accent border-stroke-soft-200',
    absent: 'bg-transparent text-text-soft-400 border-stroke-soft-200',
  },
  solid: {
    neutral: 'bg-text-strong-950 text-bg-white-0 border-transparent',
    info: 'bg-state-info-base text-bg-white-0 border-transparent',
    primary: 'bg-primary-base text-bg-white-0 border-transparent',
    success: 'bg-state-success-base text-bg-white-0 border-transparent',
    warning: 'bg-state-warning-base text-bg-white-0 border-transparent',
    error: 'bg-state-danger-base text-bg-white-0 border-transparent',
    disabled: 'bg-stroke-soft-200 text-text-disabled-300 border-transparent',
    // Legacy maps
    active: 'bg-primary-accent text-bg-white-0 border-transparent',
    absent: 'bg-stroke-soft-200 text-text-disabled-300 border-transparent',
  }
};

const dotColors = {
  neutral: 'bg-text-sub-600',
  info: 'bg-state-info-base',
  primary: 'bg-primary-base',
  success: 'bg-state-success-base',
  warning: 'bg-state-warning-base',
  error: 'bg-state-danger-base',
  disabled: 'bg-text-disabled-300',
  // Legacy
  active: 'bg-primary-accent',
  absent: 'bg-text-soft-400',
};

export function Badge({ 
  children, 
  variant = 'neutral', 
  badgeStyle = 'light',
  size = 'md',
  className = '', 
  showDot = false 
}: BadgeProps) {
  const shouldShowDot = showDot || variant === 'active' || variant === 'absent';
  
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-sans font-bold leading-none tracking-[0.01em]',
        sizeClasses[size],
        badgeVariants[badgeStyle][variant],
        className
      )}
    >
      {shouldShowDot ? <span className={cn('size-1.5 shrink-0 rounded-full', dotColors[variant])} aria-hidden="true" /> : null}
      <span className="truncate leading-none">{children}</span>
    </div>
  );
}
