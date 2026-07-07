import * as React from "react"
import { cn } from "@/lib/utils"

export interface PopoverProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  alignment?: "Top Left" | "Top Center"
  onDismiss?: () => void
  primaryAction?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  showPointer?: boolean
}

export function Popover({
  title = "Title here",
  description,
  alignment = "Top Left",
  onDismiss,
  primaryAction,
  secondaryAction,
  showPointer = true,
  className,
  ...props
}: PopoverProps) {
  const isTopCenter = alignment === "Top Center"
  const isTopLeft = alignment === "Top Left"

  return (
    <div
      className={cn(
        "bg-[var(--background-primary)] content-stretch drop-shadow-[0px_12px_12px_rgba(0,0,0,0.12),0px_2px_4px_rgba(0,0,0,0.03)] flex flex-col gap-0 items-start max-w-[480px] min-w-[240px] p-0 relative rounded-[var(--corner-xlarge)] w-[240px]",
        className
      )}
      {...props}
    >
      <div className="content-stretch flex flex-col gap-3 items-start max-w-[480px] min-w-[240px] p-3 relative rounded-[4px] shrink-0 w-full">
        <div className="content-stretch flex gap-2 items-start relative shrink-0 w-full">
          <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-1 items-start min-w-px relative text-[color:var(--label-inverse)]">
            {title && (
              <p className="font-semibold leading-[21px] text-base tracking-[-0.3px] w-full">
                {title}
              </p>
            )}
            {description && (
              <p className="font-normal leading-[18px] text-sm tracking-[-0.1px] w-full">
                {description}
              </p>
            )}
          </div>
          {onDismiss && (
            <button 
              onClick={onDismiss}
              className="bg-[var(--button-inverse-subtle-default)] hover:bg-[var(--button-inverse-subtle-hover)] content-stretch flex gap-1 h-6 items-center justify-center min-h-6 min-w-6 p-1 relative rounded-[var(--corner-small)] shrink-0 cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>

        {(primaryAction || secondaryAction) && (
          <div className={cn("content-stretch flex gap-2 items-center relative shrink-0 w-full", isTopCenter && "justify-center")}>
            {primaryAction && (
              <button 
                onClick={primaryAction.onClick}
                className="bg-[var(--button-accent-fill-default)] hover:bg-[var(--button-accent-fill-hover)] content-stretch flex gap-1 h-[34px] items-center justify-center min-h-[34px] min-w-[34px] p-2 relative rounded-[var(--corner-medium)] shrink-0 cursor-pointer"
              >
                <span className="font-medium leading-[18px] text-[color:var(--label-white)] text-sm tracking-[-0.1px] whitespace-nowrap px-1">
                  {primaryAction.label}
                </span>
              </button>
            )}
            {secondaryAction && (
              <button 
                onClick={secondaryAction.onClick}
                className="bg-[var(--button-inverse-light-default)] hover:bg-[var(--button-inverse-light-hover)] content-stretch flex gap-1 h-[34px] items-center justify-center min-h-[34px] min-w-[34px] p-2 relative rounded-[var(--corner-medium)] shrink-0 cursor-pointer"
              >
                <span className="font-medium leading-[18px] text-[color:var(--label-inverse)] text-sm tracking-[-0.1px] whitespace-nowrap px-1">
                  {secondaryAction.label}
                </span>
              </button>
            )}
          </div>
        )}

        {showPointer && isTopLeft && (
          <div className="absolute h-3 left-5 top-[-12px] w-6">
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0L24 12H0L12 0Z" fill="var(--background-primary)"/>
            </svg>
          </div>
        )}
        {showPointer && isTopCenter && (
          <div className="-translate-x-1/2 absolute h-3 left-1/2 top-[-12px] w-6">
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0L24 12H0L12 0Z" fill="var(--background-primary)"/>
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
