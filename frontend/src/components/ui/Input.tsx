import React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  wrapperClassName?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', wrapperClassName = '', leftIcon, rightIcon, ...props }, ref) => {
    return (
      <div
        className={cn(
          'relative flex min-h-11 w-full items-center gap-2 rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-4 transition-all',
          'focus-within:border-primary-base focus-within:ring-2 focus-within:ring-primary-base/20',
          'has-[:disabled]:bg-bg-weak-50 has-[:disabled]:text-text-disabled-300',
          wrapperClassName
        )}
      >
        {leftIcon ? <div className="flex size-5 shrink-0 items-center justify-center text-text-soft-400">{leftIcon}</div> : null}
        <input
          ref={ref}
          className={cn(
            'min-w-0 flex-1 bg-transparent py-3 font-sans text-[14px] font-normal text-text-strong-950 outline-none placeholder:text-text-soft-400 disabled:cursor-not-allowed disabled:text-text-disabled-300',
            className
          )}
          {...props}
        />
        {rightIcon ? <div className="flex size-5 shrink-0 items-center justify-center text-text-soft-400">{rightIcon}</div> : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
