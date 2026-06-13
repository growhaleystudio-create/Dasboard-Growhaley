import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { label: string; value: string }[];
  wrapperClassName?: string;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', wrapperClassName = '', options, value, defaultValue, onChange, disabled, name, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [internalValue, setInternalValue] = React.useState(String(defaultValue ?? options[0]?.value ?? ''));
    const selectedValue = value !== undefined ? String(value) : internalValue;
    const selectedOption = options.find((option) => option.value === selectedValue);

    const handleValueChange = (nextValue: string) => {
      if (value === undefined) {
        setInternalValue(nextValue);
      }
      onChange?.({ target: { value: nextValue, name } } as React.ChangeEvent<HTMLSelectElement>);
      setOpen(false);
    };

    const hiddenSelectProps: React.SelectHTMLAttributes<HTMLSelectElement> = {
      name,
      disabled,
      className: 'sr-only',
      tabIndex: -1,
      'aria-hidden': true,
      ...props,
    };
    if (value !== undefined) {
      hiddenSelectProps.value = selectedValue;
      hiddenSelectProps.onChange = onChange ?? (() => undefined);
    } else {
      hiddenSelectProps.defaultValue = selectedValue;
      hiddenSelectProps.onChange = onChange;
    }

    return (
      <div className={`relative ${wrapperClassName}`}>
        <select
          ref={ref}
          {...hiddenSelectProps}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                'flex h-9 w-full items-center justify-between gap-2 overflow-hidden rounded-lg border border-stroke-soft-200 bg-bg-white-0 px-2 text-left text-sm font-normal leading-5 text-text-strong-950 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] transition-all',
                'hover:bg-bg-weak-50/60 focus:outline-none focus:ring-2 focus:ring-primary-base/20',
                'disabled:cursor-not-allowed disabled:bg-bg-weak-50 disabled:text-text-disabled-300',
                open && 'border-primary-base bg-bg-white-0 shadow-[0_0_0_3px_rgba(24,125,180,0.12)]',
                className
              )}
            >
              <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? 'Select option'}</span>
              <ChevronDown size={20} strokeWidth={1.75} className={cn('shrink-0 text-text-sub-600 transition-transform', open && 'rotate-180 text-primary-base')} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" avoidCollisions={false} align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[240px] overflow-y-auto">
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => handleValueChange(option.value)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2',
                    selected ? 'bg-bg-weak-50 text-text-strong-950' : 'text-text-sub-600'
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {selected && <Check size={16} className="shrink-0 text-primary-base" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
);

Select.displayName = 'Select';
