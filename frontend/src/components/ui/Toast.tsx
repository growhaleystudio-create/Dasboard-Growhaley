import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Info, XCircle, X } from "lucide-react";

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  state?: "Default" | "Information" | "Error" | "Warning" | "Success" | "Loading";
  actions?: boolean;
  onClose?: () => void;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  progressBar?: boolean;
}

export function Toast({
  title = "Toast Title Here",
  description = "Message",
  state = "Default",
  actions = false,
  onClose,
  primaryAction,
  secondaryAction,
  progressBar = false,
  className,
  ...props
}: ToastProps) {
  const isError = state === "Error";
  const isSuccess = state === "Success";
  const isWarning = state === "Warning";
  const isInfo = state === "Information";

  return (
    <div
      className={cn(
        "bg-bg-white-0 content-stretch flex gap-3 items-start min-h-[48px] overflow-clip p-2 relative rounded-xl shadow-lg w-[320px] border border-stroke-soft-200",
        {
          "bg-state-danger-light border-state-danger-border": isError,
          "bg-state-success-bg border-state-success-light": isSuccess,
          "bg-state-warning-light border-state-warning-border": isWarning,
          "bg-state-info-bg border-state-info-light": isInfo,
        },
        className
      )}
      {...props}
    >
      <div className="content-stretch flex flex-1 gap-3 items-start overflow-clip pl-1 py-1 relative">
        {/* Status Icon */}
        <div className="shrink-0 mt-0.5">
          {isSuccess && <CheckCircle2 className="size-6 text-state-success-dark" />}
          {isError && <XCircle className="size-6 text-state-danger-dark" />}
          {isWarning && <AlertCircle className="size-6 text-state-warning-dark" />}
          {isInfo && <Info className="size-6 text-state-info-dark" />}
          {state === "Default" && <CheckCircle2 className="size-6 text-text-sub-600" />}
        </div>
        
        <div className="content-stretch flex flex-1 flex-col gap-2 items-start justify-center py-0.5 relative">
          <p
            className={cn(
              "font-semibold leading-tight text-base tracking-tight w-full",
              {
                "text-state-danger-dark": isError,
                "text-state-success-dark": isSuccess,
                "text-state-warning-dark": isWarning,
                "text-state-info-dark": isInfo,
                "text-text-strong-950": state === "Default",
              }
            )}
          >
            {title}
          </p>
          
          {description && (
            <p
              className={cn(
                "font-normal leading-snug text-sm tracking-tight w-full",
                {
                  "text-state-danger-dark/80": isError,
                  "text-state-success-dark/80": isSuccess,
                  "text-state-warning-dark/80": isWarning,
                  "text-state-info-dark/80": isInfo,
                  "text-text-soft-400": state === "Default",
                }
              )}
            >
              {description}
            </p>
          )}

          {progressBar && (
            <div className="h-1 bg-border-disabled relative rounded-full w-full overflow-hidden mt-1">
               <div className="absolute inset-y-0 left-0 bg-primary-base w-[40%]" />
            </div>
          )}

          {actions && (primaryAction || secondaryAction) && (
            <div className="flex gap-2 mt-1">
              {secondaryAction && (
                <button
                  onClick={secondaryAction.onClick}
                  className="text-xs font-medium text-text-sub-600 hover:text-text-strong-950 transition-colors"
                >
                  {secondaryAction.label}
                </button>
              )}
              {primaryAction && (
                <button
                  onClick={primaryAction.onClick}
                  className="text-xs font-semibold text-primary-base hover:text-primary-dark transition-colors"
                >
                  {primaryAction.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      {onClose && (
        <button
          onClick={onClose}
          className="p-1 rounded-md text-text-soft-400 hover:bg-bg-weak-50 hover:text-text-strong-950 transition-colors shrink-0 mt-1 mr-1"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
