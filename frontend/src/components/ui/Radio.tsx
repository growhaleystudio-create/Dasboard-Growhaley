import * as React from "react"
import { cn } from "@/lib/utils"

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  supportMessage?: string
  size?: 'md' | 'lg' | 'xl'
  variant?: 'accent' | 'primary'
}

const sizeClasses = {
  md: 'size-4',     // 16px
  lg: 'size-5',     // 20px
  xl: 'size-6',     // 24px
}

const variantClasses = {
  accent: {
    base: 'border-stroke-strong-300 bg-bg-white-0 peer-hover:border-primary-accent',
    checked: 'peer-checked:border-primary-accent',
    disabled: 'border-stroke-soft-200 bg-bg-weak-50 peer-checked:border-stroke-soft-200',
  },
  primary: {
    base: 'border-stroke-strong-300 bg-bg-white-0 peer-hover:border-primary-base',
    checked: 'peer-checked:border-primary-base',
    disabled: 'border-stroke-soft-200 bg-bg-weak-50 peer-checked:border-stroke-soft-200',
  },
}

// Map sizes to the checked border width for that thick-ring effect
const checkedBorderClasses = {
  md: 'peer-checked:border-[5px]', // 16px - 10px = 6px inner hole
  lg: 'peer-checked:border-[6px]', // 20px - 12px = 8px inner hole
  xl: 'peer-checked:border-[7px]', // 24px - 14px = 10px inner hole
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, supportMessage, size = 'md', variant = 'primary', disabled, ...props }, ref) => {
    const styles = variantClasses[variant]
    
    return (
      <label className={cn(
        "cursor-pointer flex gap-2 items-start relative max-w-full",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}>
        <input 
          type="radio" 
          ref={ref}
          className="peer sr-only"
          disabled={disabled}
          {...props}
        />
        
        <div className={cn(
          "flex items-center justify-center rounded-full border transition-all duration-200 shrink-0 mt-[2px]",
          sizeClasses[size],
          styles.base,
          styles.checked,
          checkedBorderClasses[size],
          disabled && styles.disabled,
          "peer-focus-visible:shadow-focus"
        )} />

        {(label || supportMessage) && (
          <div className="flex flex-col gap-0.5 items-start">
            {label && (
              <p className="font-medium text-text-strong-950 text-sm tracking-[-0.1px] leading-tight">
                {label}
              </p>
            )}
            {supportMessage && (
              <p className="font-normal text-text-sub-600 text-xs leading-tight mt-0.5">
                {supportMessage}
              </p>
            )}
          </div>
        )}
      </label>
    )
  }
)
Radio.displayName = "Radio"
