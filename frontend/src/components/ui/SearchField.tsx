import * as React from "react";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

export interface SearchFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  leftList?: React.ReactNode;
  rightList?: React.ReactNode;
  logo?: React.ReactNode;
}

export function SearchField({
  open = false,
  onOpenChange,
  value,
  onValueChange,
  placeholder = "Search here",
  leftList,
  rightList,
  logo,
  className,
  ...props
}: SearchFieldProps) {
  return (
    <div
      className={cn(
        "flex gap-4 items-start relative transition-all duration-300 ease-in-out z-40",
        open
          ? "p-4 w-full max-w-[700px] rounded-[32px]"
          : "h-[42px] p-0 rounded-[224px] justify-center",
        className
      )}
      {...props}
    >
      {/* Background / Material Blur */}
      <div
        className={cn(
          "absolute inset-0 overflow-hidden transition-all duration-300 pointer-events-none",
          open ? "rounded-[32px] bg-white/95 backdrop-blur-[128px] shadow-lg border border-stroke-soft-200" : "rounded-[224px] bg-transparent"
        )}
      >
        <div className={cn("absolute inset-0 bg-black/5", open ? "opacity-100" : "opacity-0")} />
      </div>

      {/* Logo Section (Only visible when open) */}
      {open && logo && (
        <div className="flex flex-col items-start relative z-10 shrink-0">
          <div className="p-1">
            {logo}
          </div>
        </div>
      )}

      {/* Search Section */}
      <div className={cn("flex flex-col relative z-10", open ? "flex-1 w-full gap-5" : "w-[280px]")}>
        {/* Input Container */}
        <div
          className={cn(
            "flex items-center gap-1 h-[42px] px-4 rounded-[224px] transition-all",
            open ? "bg-bg-weak-50" : "bg-bg-white-0 border border-stroke-soft-200 hover:bg-bg-weak-50 cursor-text"
          )}
          onClick={() => !open && onOpenChange?.(true)}
        >
          <Search className="size-5 text-text-sub-600 shrink-0" />
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-sm text-text-strong-950 placeholder:text-text-disabled-300 ml-1 h-full"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onValueChange?.(e.target.value)}
            onFocus={() => onOpenChange?.(true)}
          />
        </div>

        {/* Dropdown Lists */}
        {open && (leftList || rightList) && (
          <div className="flex gap-5 items-start w-full min-h-[150px]">
            {leftList && (
              <div className="flex flex-col w-[180px] shrink-0">
                {leftList}
              </div>
            )}
            {rightList && (
              <div className="flex flex-col flex-1">
                {rightList}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overlay to close when clicking outside */}
      {open && (
        <div 
          className="fixed inset-0 -z-10 bg-transparent" 
          onClick={() => onOpenChange?.(false)}
        />
      )}
    </div>
  );
}
