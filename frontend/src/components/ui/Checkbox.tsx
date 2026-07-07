import React, { forwardRef, useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'md' | 'lg' | 'xl';
  variant?: 'accent' | 'primary' | 'onColor';
  isAlert?: boolean;
  isIndeterminate?: boolean;
}

const sizeClasses = {
  md: 'size-4',     // 16px base icon
  lg: 'size-5',     // 20px base icon
  xl: 'size-6',     // 24px base icon
};

const iconSizes = {
  md: 12,
  lg: 14,
  xl: 16,
};

const variantClasses = {
  accent: {
    base: 'border-stroke-strong-300 bg-bg-white-0 peer-hover:border-primary-accent',
    checked: 'border-primary-accent bg-primary-accent text-bg-white-0',
    alert: 'border-state-danger-base peer-hover:border-state-danger-hover',
    disabled: 'border-stroke-soft-200 bg-bg-weak-50 text-text-disabled-300 opacity-50',
  },
  primary: {
    base: 'border-stroke-strong-300 bg-bg-white-0 peer-hover:border-primary-base',
    checked: 'border-primary-base bg-primary-base text-bg-white-0',
    alert: 'border-state-danger-base peer-hover:border-state-danger-hover',
    disabled: 'border-stroke-soft-200 bg-bg-weak-50 text-text-disabled-300 opacity-50',
  },
  onColor: {
    base: 'border-bg-white-0/50 bg-transparent peer-hover:border-bg-white-0',
    checked: 'border-bg-white-0 bg-bg-white-0 text-text-strong-950',
    alert: 'border-state-danger-light peer-hover:border-state-danger-light',
    disabled: 'border-bg-white-0/20 bg-transparent text-bg-white-0/30',
  },
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      size = 'md',
      variant = 'accent',
      isAlert = false,
      isIndeterminate = false,
      className,
      disabled,
      checked,
      onChange,
      ...props
    },
    ref
  ) => {
    const defaultRef = useRef<HTMLInputElement>(null);
    const resolvedRef = (ref as React.RefObject<HTMLInputElement>) || defaultRef;

    useEffect(() => {
      if (resolvedRef.current) {
        resolvedRef.current.indeterminate = isIndeterminate;
      }
    }, [resolvedRef, isIndeterminate]);

    const styles = variantClasses[variant];
    const isCheckedOrIndeterminate = checked || isIndeterminate;

    return (
      <label
        className={cn(
          'relative inline-flex items-center justify-center cursor-pointer',
          disabled && 'cursor-not-allowed',
          className
        )}
      >
        <input
          type="checkbox"
          ref={resolvedRef}
          className="peer sr-only"
          disabled={disabled}
          checked={checked}
          onChange={onChange}
          {...props}
        />
        <div
          className={cn(
            'flex items-center justify-center rounded-[4px] border transition-all duration-200',
            sizeClasses[size],
            styles.base,
            isCheckedOrIndeterminate && styles.checked,
            isAlert && !isCheckedOrIndeterminate && styles.alert,
            disabled && styles.disabled,
            'peer-focus-visible:shadow-focus'
          )}
        >
          {isIndeterminate ? (
            <Minus size={iconSizes[size]} strokeWidth={3} className={cn('opacity-100', disabled && 'opacity-50')} />
          ) : (
            <Check 
              size={iconSizes[size]} 
              strokeWidth={3} 
              className={cn('opacity-0 transition-opacity duration-200', checked && 'opacity-100', disabled && checked && 'opacity-50')} 
            />
          )}
        </div>
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';
