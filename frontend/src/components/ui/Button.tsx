import React from 'react';
import { cn } from '@/lib/utils';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'icon' | 'fancy' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

const variantClasses = {
  primary:
    'border border-primary-accent bg-primary-accent text-bg-white-0 shadow-[0px_1px_2px_rgba(26,140,192,0.32)] hover:bg-primary-hover hover:border-primary-hover',
  secondary: 'border border-stroke-soft-200 bg-bg-white-0 text-text-strong-950 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] hover:bg-bg-weak-50',
  ghost: 'border border-transparent bg-transparent text-text-sub-600 hover:bg-bg-weak-50 hover:text-text-strong-950',
  outline: 'border border-stroke-soft-200 bg-bg-white-0 text-text-sub-600 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] hover:bg-bg-weak-50 hover:text-text-strong-950',
  icon: 'border border-stroke-soft-200 bg-bg-white-0 text-text-sub-600 hover:bg-bg-weak-50',
  fancy: 'border border-white/10 bg-bg-weak-50 text-text-disabled-300 hover:bg-bg-weak-50 hover:text-text-soft-400',
  danger: 'border border-state-danger-base bg-state-danger-base text-bg-white-0 hover:bg-state-danger-hover',
};

const sizeClasses = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-3.5 text-sm',
  lg: 'h-11 px-4 text-sm',
  icon: 'size-10 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', leftIcon, rightIcon, children, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1 overflow-clip whitespace-nowrap rounded-ui font-inter font-medium tracking-normal transition-all duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98]',
          'focus:outline-none focus:ring-2 focus:ring-primary-base/20 focus:ring-offset-1',
          'disabled:translate-y-0 disabled:scale-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-bg-weak-50 disabled:text-text-disabled-300 disabled:opacity-100',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {leftIcon && <span className="flex size-5 shrink-0 items-center justify-center">{leftIcon}</span>}
        {children && <span className="px-1 leading-5">{children}</span>}
        {rightIcon && <span className="flex size-5 shrink-0 items-center justify-center">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
