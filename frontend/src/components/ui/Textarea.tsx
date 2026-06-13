import React from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
  helperText?: React.ReactNode;
  showCounter?: boolean;
  wrapperClassName?: string;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      error = false,
      helperText,
      maxLength,
      showCounter = false,
      value,
      defaultValue,
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    const currentLength =
      typeof value === 'string'
        ? value.length
        : typeof defaultValue === 'string'
          ? defaultValue.length
          : 0;
    const hasFooter = helperText !== undefined || showCounter;

    return (
      <div className={cn('flex w-full flex-col gap-1.5', wrapperClassName)}>
        <textarea
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          aria-invalid={error || undefined}
          className={cn(
            'min-h-[100px] w-full resize-y rounded-ui border border-stroke-soft-200 bg-bg-white-0 px-3 py-2.5 font-inter text-[14px] font-normal leading-5 text-text-strong-950 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] outline-none transition-all placeholder:text-text-soft-400',
            'focus:border-primary-base focus:ring-2 focus:ring-primary-base/20',
            'disabled:cursor-not-allowed disabled:bg-bg-weak-50 disabled:text-text-disabled-300 disabled:placeholder:text-text-disabled-300 disabled:opacity-100',
            error && 'border-state-danger-base focus:border-state-danger-base focus:ring-state-danger-base',
            className
          )}
          {...props}
        />
        {hasFooter && (
          <div className="flex items-start justify-between gap-3 text-xs leading-4">
            <div className={cn('min-w-0 text-text-soft-400', error && 'text-state-danger-base')}>
              {helperText}
            </div>
            {showCounter && (
              <div className="shrink-0 text-text-soft-400">
                {currentLength}
                {typeof maxLength === 'number' ? `/${maxLength}` : null}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
