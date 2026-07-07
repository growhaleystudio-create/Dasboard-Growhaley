import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export interface MenuProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
}

export function Menu({ open = true, className, children, ...props }: MenuProps) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "bg-bg-white-0 border border-stroke-soft-200 rounded-[12px] shadow-lg flex flex-col p-1 min-w-[160px] overflow-hidden relative z-50",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 bg-white/95 backdrop-blur-[128px] pointer-events-none" />
      <div className="relative z-10 flex flex-col w-full">
        {children}
      </div>
    </div>
  );
}

export function MenuGroup({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col w-full py-1">
      {heading && (
        <div className="px-3 py-1.5 text-[12px] font-medium text-text-sub-600 tracking-tight">
          {heading}
        </div>
      )}
      <div className="flex flex-col w-full">
        {children}
      </div>
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  shortcut,
  disabled = false,
  hasSubmenu = false,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  hasSubmenu?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={cn(
        "flex items-center w-full px-3 py-1.5 rounded-[8px] transition-colors text-left",
        disabled ? "opacity-50 cursor-not-allowed text-text-disabled-300" : "hover:bg-bg-weak-50 text-text-strong-950 cursor-pointer"
      )}
      disabled={disabled}
    >
      {icon && (
        <span className="flex items-center justify-center size-4 mr-2 text-text-sub-600 shrink-0">
          {icon}
        </span>
      )}
      <span className="flex-1 text-[14px] font-medium leading-[18px] tracking-tight truncate">
        {label}
      </span>
      {shortcut && (
        <span className="ml-4 text-[12px] tracking-widest text-text-sub-600 shrink-0">
          {shortcut}
        </span>
      )}
      {hasSubmenu && (
        <span className="ml-2 flex items-center justify-center text-text-sub-600 shrink-0">
          <ChevronRight className="size-4" />
        </span>
      )}
    </button>
  );
}

export function MenuDivider() {
  return <div className="h-px w-full bg-stroke-soft-200 my-1" />;
}
