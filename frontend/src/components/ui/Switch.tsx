import React from 'react';
import { cn } from '@/lib/utils';

export type SwitchProps = {
  className?: string;
  focus?: boolean;
  size?: "XSmall-16" | "Medium-20";
  state?: "Default";
  style?: "Accent";
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
};

function Switch({ 
  className, 
  focus = false, 
  size = "XSmall-16", 
  state = "Default", 
  style = "Accent", 
  checked = false,
  onCheckedChange,
  disabled = false
}: SwitchProps) {
  const isSmall = size === "XSmall-16";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        isSmall ? "h-4 w-7" : "h-5 w-9",
        checked ? "bg-primary-base" : "bg-neutral-gray-200",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block rounded-full bg-white shadow-[0px_1px_2px_rgba(10,13,20,0.12)] transition duration-200 ease-in-out transform",
          isSmall 
            ? "h-3 w-3 translate-y-[2px] translate-x-[2px]" 
            : "h-4 w-4 translate-y-[2px] translate-x-[2px]",
          checked 
            ? (isSmall ? "translate-x-[11px]" : "translate-x-[16px]") 
            : ""
        )}
      />
    </button>
  );
}

export { Switch };
