import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Info, XCircle, X } from "lucide-react";

export interface AlertDialogProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "Default" | "Success" | "Check" | "Warning" | "Alert";
  cardStyle?: "Onground" | "elevated";
  title?: string;
  description?: string;
  onClose?: () => void;
  iconLeading?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function AlertDialog({
  type = "Default",
  cardStyle = "Onground",
  title,
  description,
  onClose,
  iconLeading = true,
  actions,
  children,
  className,
  ...props
}: AlertDialogProps) {
  const isElevated = cardStyle === "elevated";

  return (
    <div
      className={cn(
        "content-stretch flex gap-3 items-start pl-3 pr-4 py-3 relative w-full max-w-[600px]",
        {
          "bg-bg-weak-50 rounded-xl": !isElevated,
          "backdrop-blur-3xl bg-white/95 border border-stroke-soft-200 rounded-[24px] shadow-lg": isElevated,
        },
        className
      )}
      {...props}
    >
      {/* Icon Leading */}
      {iconLeading && (
        <div className="shrink-0 mt-1">
          {type === "Success" && <CheckCircle2 className="size-6 text-state-success-dark" />}
          {type === "Check" && <CheckCircle2 className="size-6 text-state-success-dark" />}
          {type === "Alert" && <XCircle className="size-6 text-state-danger-dark" />}
          {type === "Warning" && <AlertCircle className="size-6 text-state-warning-dark" />}
          {type === "Default" && <Info className="size-6 text-state-info-dark" />}
        </div>
      )}

      <div className="flex flex-col flex-1 gap-1 min-w-0 relative">
        {/* Header */}
        {(title || onClose) && (
          <div className="flex gap-2 items-center justify-between w-full">
            {title && (
              <p className="font-semibold text-base text-text-strong-950 tracking-tight truncate w-full">
                {title}
              </p>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="flex items-center justify-center p-1 size-8 rounded-full hover:bg-bg-weak-50 text-text-soft-400 hover:text-text-strong-950 transition-colors shrink-0 -mr-2"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}

        {/* Description / Body Text */}
        {description && (
          <p className="font-normal text-sm text-text-sub-600 tracking-tight w-full mt-1">
            {description}
          </p>
        )}

        {/* Children Slot */}
        {children && (
          <div className="flex flex-col w-full relative z-10 mt-2">
            {children}
          </div>
        )}

        {/* Actions Slot */}
        {actions && (
          <div className="flex gap-3 items-center justify-end w-full relative z-10 mt-4">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
