import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedControlProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: { label: React.ReactNode; value: string }[] | string[];
  value: string;
  onChange: (value: string) => void;
  variant?: "accent" | "primary" | "secondary";
  controlStyle?: "light" | "fill" | "hazy" | "outline";
}

export function SegmentedControl({
  options,
  value,
  onChange,
  variant = "accent",
  controlStyle = "light",
  className,
  ...props
}: SegmentedControlProps) {
  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt
  );

  const containerClasses = cn(
    "inline-flex items-center justify-center p-1 gap-1",
    {
      "bg-bg-weak-50 rounded-[14px]": controlStyle === "light" || controlStyle === "fill" || controlStyle === "outline",
      "bg-bg-weak-50/50 backdrop-blur-md rounded-[14px]": controlStyle === "hazy",
    },
    className
  );

  return (
    <div className={containerClasses} {...props}>
      {normalizedOptions.map((option) => {
        const isActive = value === option.value;
        
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-[12px] px-4 py-[8px] text-[14px] font-medium leading-[18px] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent/20 disabled:pointer-events-none disabled:opacity-50 min-h-[34px]",
              {
                // Accent - Light/Fill/Hazy
                "bg-primary-base text-bg-white-0 shadow-none": isActive && variant === "accent",
                
                // Primary - Light/Fill/Hazy
                "bg-text-strong-950 text-bg-white-0 shadow-none": isActive && variant === "primary",

                // Secondary - Light/Fill/Hazy
                "bg-bg-white-0 text-text-strong-950 shadow-none": isActive && variant === "secondary",

                // Inactive state for all variants
                "text-text-sub-600 hover:text-text-strong-950 hover:bg-stroke-soft-200/50": !isActive,
              }
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
