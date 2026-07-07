import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional label text to display above the textarea */
  label?: string;
  /** Optional hint or helper text to display below the textarea */
  hintText?: string;
  /** Optional error text to display, overrides hintText and changes border color */
  error?: string;
  /** Custom wrapper class */
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, containerClassName, label, hintText, error, disabled, id, ...props }, ref) => {
    const textareaId = id || (label ? `textarea-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    const hasError = !!error;

    return (
      <div className={`flex flex-col w-full ${containerClassName || ''}`}>
        {label && (
          <label 
            htmlFor={textareaId} 
            className="mb-1.5 text-xs font-medium text-text-strong-950"
          >
            {label}
          </label>
        )}
        
        <textarea
          id={textareaId}
          ref={ref}
          disabled={disabled}
          className={`
            w-full min-h-[100px] px-3 py-2 rounded-ui text-sm bg-white-0
            border transition-colors duration-200 resize-y
            placeholder:text-text-soft-400 text-text-strong-950
            focus:outline-none focus:ring-4
            ${hasError 
              ? 'border-state-danger-base focus:border-state-danger-base focus:ring-state-danger-light' 
              : 'border-stroke-soft-200 focus:border-primary-accent focus:ring-alpha-primary-10'
            }
            ${disabled ? 'bg-bg-weak-50 text-text-disabled-300 cursor-not-allowed opacity-70' : ''}
            ${className || ''}
          `}
          {...props}
        />

        {(error || hintText) && (
          <p className={`mt-1.5 text-xs ${hasError ? 'text-state-danger-base' : 'text-text-soft-400'}`}>
            {error || hintText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// Maintain backward compatibility for exports if someone used TextArea
export { Textarea as TextArea };
