import React from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional label text to display above the input */
  label?: string;
  /** Optional hint or helper text to display below the input */
  hintText?: string;
  /** Optional error text to display, overrides hintText and changes border color */
  error?: string;
  /** Optional leading icon to display inside the input */
  iconLeading?: React.ReactNode;
  /** Optional trailing icon to display inside the input */
  iconTrailing?: React.ReactNode;
  /** Custom wrapper class */
  containerClassName?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, containerClassName, label, hintText, error, iconLeading, iconTrailing, disabled, id, type = 'text', ...props }, ref) => {
    const inputId = id || (label ? `textfield-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    const hasError = !!error;

    return (
      <div className={`flex flex-col w-full ${containerClassName || ''}`}>
        {label && (
          <label 
            htmlFor={inputId} 
            className="mb-1.5 text-xs font-medium text-text-strong-950"
          >
            {label}
          </label>
        )}
        
        <div className="relative flex items-center w-full">
          {iconLeading && (
            <div className="absolute left-3 text-text-soft-400 pointer-events-none flex items-center justify-center">
              {iconLeading}
            </div>
          )}
          
          <input
            id={inputId}
            ref={ref}
            type={type}
            disabled={disabled}
            className={`
              w-full h-10 px-3 rounded-ui text-sm bg-white-0
              border transition-colors duration-200
              placeholder:text-text-soft-400 text-text-strong-950
              focus:outline-none focus:ring-4
              ${iconLeading ? 'pl-9' : ''}
              ${iconTrailing ? 'pr-9' : ''}
              ${hasError 
                ? 'border-state-danger-base focus:border-state-danger-base focus:ring-state-danger-light' 
                : 'border-stroke-soft-200 focus:border-primary-accent focus:ring-alpha-primary-10'
              }
              ${disabled ? 'bg-bg-weak-50 text-text-disabled-300 cursor-not-allowed opacity-70' : ''}
              ${className || ''}
            `}
            {...props}
          />

          {iconTrailing && (
            <div className="absolute right-3 text-text-soft-400 pointer-events-none flex items-center justify-center">
              {iconTrailing}
            </div>
          )}
        </div>

        {(error || hintText) && (
          <p className={`mt-1.5 text-xs ${hasError ? 'text-state-danger-base' : 'text-text-soft-400'}`}>
            {error || hintText}
          </p>
        )}
      </div>
    );
  }
);

TextField.displayName = 'TextField';
