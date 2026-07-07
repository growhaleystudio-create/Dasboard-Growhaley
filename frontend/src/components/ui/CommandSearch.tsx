import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, Loader2 } from "lucide-react";

export interface CommandSearchProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  loading?: boolean;
  searchPlaceholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
}

export function CommandSearch({
  open = true,
  onOpenChange,
  loading = false,
  searchPlaceholder = "Search for apps and settings...",
  value,
  onValueChange,
  className,
  children,
  ...props
}: CommandSearchProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4 backdrop-blur-sm bg-black/20">
      {/* Overlay to close */}
      <div 
        className="absolute inset-0" 
        onClick={() => onOpenChange?.(false)}
        aria-hidden="true"
      />
      
      {/* Command Palette */}
      <div
        className={cn(
          "w-full max-w-[583px] bg-bg-white-0 rounded-[20px] shadow-2xl flex flex-col overflow-hidden relative z-10 border border-stroke-soft-200",
          className
        )}
        {...props}
      >
        {/* Search Input Area */}
        <div className="flex items-center px-4 h-14 border-b border-stroke-soft-200 relative">
          <Search className="size-5 text-text-sub-600 shrink-0" />
          <input
            type="text"
            className="flex-1 h-full bg-transparent px-3 text-lg outline-none text-text-strong-950 placeholder:text-text-disabled-300"
            placeholder={searchPlaceholder}
            value={value}
            onChange={(e) => onValueChange?.(e.target.value)}
            autoFocus
          />
          {loading && <Loader2 className="size-5 animate-spin text-text-sub-600 shrink-0" />}
          
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <kbd className="hidden sm:inline-flex items-center justify-center h-6 px-1.5 bg-bg-weak-50 border border-stroke-soft-200 rounded-[4px] text-[10px] font-medium text-text-sub-600">
              Esc
            </kbd>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex flex-col max-h-[386px] overflow-y-auto p-2 scrollbar-thin">
          {children || (
            <div className="py-14 text-center text-sm text-text-sub-600">
              No results found.
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-4 h-10 border-t border-stroke-soft-200 bg-bg-weak-50">
          <div className="flex items-center gap-4 text-xs text-text-sub-600">
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center size-5 bg-bg-white-0 border border-stroke-soft-200 rounded-[4px] shadow-sm">
                ↵
              </kbd>
              to select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center size-5 bg-bg-white-0 border border-stroke-soft-200 rounded-[4px] shadow-sm">
                ↓
              </kbd>
              <kbd className="inline-flex items-center justify-center size-5 bg-bg-white-0 border border-stroke-soft-200 rounded-[4px] shadow-sm">
                ↑
              </kbd>
              to navigate
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Subcomponents for easy composition
export function CommandGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col mb-2 last:mb-0">
      <div className="px-2 py-1.5 text-xs font-semibold text-text-sub-600 tracking-tight">
        {heading}
      </div>
      <div className="flex flex-col gap-0.5">
        {children}
      </div>
    </div>
  );
}

export function CommandItem({ 
  icon, 
  title, 
  subtitle, 
  action, 
  selected = false,
  onClick 
}: { 
  icon?: React.ReactNode; 
  title: string; 
  subtitle?: string; 
  action?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-2 py-2 rounded-[8px] cursor-pointer transition-colors",
        selected ? "bg-bg-weak-50" : "hover:bg-bg-weak-50"
      )}
    >
      {icon && (
        <div className={cn("flex items-center justify-center size-8 rounded-[8px]", selected ? "bg-bg-white-0 border border-stroke-soft-200 shadow-sm" : "")}>
          {icon}
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium text-text-strong-950 truncate">{title}</span>
        {subtitle && <span className="text-xs text-text-sub-600 truncate">{subtitle}</span>}
      </div>
      {action && (
        <div className="shrink-0 pl-2">
          {action}
        </div>
      )}
    </div>
  );
}
