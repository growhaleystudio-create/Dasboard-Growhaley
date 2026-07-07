import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface ActionSheetProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  onClose?: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function ActionSheet({
  title,
  description,
  onClose,
  actions,
  children,
  className,
  ...props
}: ActionSheetProps) {
  return (
    <div
      className={cn(
        "content-stretch flex flex-col gap-4 items-center justify-end p-4 relative rounded-[32px] w-[393px] mx-auto",
        className
      )}
      {...props}
    >
      {/* Background / Glass effect */}
      <div className="absolute drop-shadow-[0px_12px_8px_rgba(0,0,0,0.08),0px_4px_3px_rgba(0,0,0,0.03)] inset-[0_-0.5px_0_0.5px] overflow-clip rounded-[32px] pointer-events-none z-0">
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute inset-0 bg-white/80 backdrop-blur-[128px] mix-blend-color-dodge" />
      </div>

      {/* Header */}
      {(title || onClose) && (
        <div className="flex gap-2 items-center justify-between overflow-clip pl-2 relative w-full shrink-0 z-10">
          <div className="flex flex-col items-start justify-center flex-1 min-w-0">
            {title && (
              <p className="font-semibold text-lg text-text-strong-950 tracking-tight truncate w-full">
                {title}
              </p>
            )}
            {description && (
              <p className="font-normal text-sm text-text-sub-600 tracking-tight line-clamp-2 w-full mt-1">
                {description}
              </p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center justify-center p-2 size-10 rounded-full hover:bg-bg-weak-50 text-text-soft-400 hover:text-text-strong-950 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
      )}

      {/* Body / Slots */}
      {children && (
        <div className="flex flex-col w-full relative z-10 gap-2">
          {children}
        </div>
      )}

      {/* Actions (Button Group) */}
      {actions && (
        <div className="flex flex-col gap-2 items-stretch w-full relative z-10">
          {actions}
        </div>
      )}
    </div>
  );
}

export function ActionSheetButton({
  children,
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "destructive" }) {
  return (
    <button
      className={cn(
        "flex items-center gap-2 h-10 px-3 py-2 rounded-full w-full justify-start text-sm font-medium transition-colors",
        {
          "hover:bg-bg-weak-50 text-text-strong-950": variant === "default",
          "hover:bg-state-danger-light text-state-danger-dark": variant === "destructive",
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
