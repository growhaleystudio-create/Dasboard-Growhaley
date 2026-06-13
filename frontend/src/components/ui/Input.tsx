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
          'relative flex w-full items-center gap-2 overflow-clip rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-3 py-2 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] transition-all',
          'focus-within:border-primary-base focus-within:ring-2 focus-within:ring-primary-base/20',
          wrapperClassName
        )}
      >
        {leftIcon && <div className="shrink-0 flex items-center justify-center text-text-soft-400 size-5">{leftIcon}</div>}
        <input
          ref={ref}
          className={cn(
            'min-w-0 flex-[1_0_0] bg-transparent font-inter text-[14px] font-normal text-text-strong-950 outline-none placeholder:text-text-soft-400',
            className
          )}
          {...props}
        />
        {rightIcon && <div className="shrink-0 flex items-center justify-center text-text-soft-400 size-5">{rightIcon}</div>}
      </div>
    );
  }
);

Input.displayName = 'Input';
