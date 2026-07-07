import React from 'react';
import { cn } from '@/lib/utils';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'icon' | 'fancy' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'huge' | 'icon';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
};

const variantClasses = {
  // Primary: Fill style (strong text color bg, white text)
  primary:
    'border border-transparent bg-text-strong-950 text-bg-white-0 hover:bg-text-strong-950/80 active:bg-black',
  // Secondary: Fill style (weak bg, strong text)
  secondary: 
    'border border-transparent bg-bg-weak-50 text-text-strong-950 hover:bg-bg-weak-100 active:bg-stroke-soft-200',
  // Ghost: Subtle style (transparent bg, strong text)
  ghost: 
    'border border-transparent bg-transparent text-text-strong-950 hover:bg-bg-weak-50 active:bg-bg-weak-100',
  // Outline: Outline style (transparent bg, strong border, strong text)
  outline: 
    'border border-stroke-strong-950 bg-transparent text-text-strong-950 hover:bg-bg-weak-50 active:bg-bg-weak-100',
  // Keep original variants for compatibility if needed
  icon: 'border border-stroke-soft-200 bg-bg-white-0 text-text-sub-600 hover:bg-bg-weak-50',
  fancy: 'border border-transparent bg-bg-accent-soft text-primary-accent hover:bg-alpha-primary-10',
  danger: 'border border-state-danger-base bg-state-danger-base text-bg-white-0 hover:bg-state-danger-hover',
};

const sizeClasses = {
  // Small (24px height)
  sm: 'h-6 px-2 py-1 text-[12px] leading-[16px] rounded-lg gap-1',
  // Medium (34px height)
  md: 'h-[34px] p-2 text-[14px] leading-[18px] rounded-xl gap-1 tracking-[-0.1px]',
  // Large (40px height)
  lg: 'h-10 px-3 py-2 text-[14px] leading-[18px] rounded-xl gap-1 tracking-[-0.1px]',
  // XLarge (48px height)
  xl: 'h-12 px-4 py-3 text-[16px] leading-[20px] rounded-2xl gap-2 tracking-[-0.2px]',
  // Huge (64px height)
  huge: 'h-16 px-6 py-4 text-[18px] leading-[24px] rounded-2xl gap-2 tracking-[-0.2px]',
  // Icon specific (matches Medium bounds)
  icon: 'size-[34px] p-0 rounded-xl',
};

import { Loader2 } from 'lucide-react';

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      leftIcon,
      rightIcon,
      loading = false,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const spinnerSize = size === 'sm' ? 12 : size === 'xl' || size === 'huge' ? 18 : 16;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium font-sans transition-all duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base focus-visible:ring-offset-2',
          'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="animate-spin shrink-0" size={spinnerSize} />
        ) : leftIcon ? (
          <span className="flex size-[18px] shrink-0 items-center justify-center">{leftIcon}</span>
        ) : null}
        
        {children ? <span className="leading-none">{children}</span> : null}
        
        {!loading && rightIcon ? (
          <span className="flex size-[18px] shrink-0 items-center justify-center">{rightIcon}</span>
        ) : null}
      </button>
    );
  }
);

Button.displayName = 'Button';

