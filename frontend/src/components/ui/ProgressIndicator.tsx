import * as React from "react"
import { cn } from "@/lib/utils"

export interface ProgressIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string
  description?: string
  state?: "Done" | "Active" | "Pending"
  line?: boolean
}

export function ProgressIndicator({
  label = "Step one",
  description = "Text",
  state = "Done",
  line = true,
  className,
  ...props
}: ProgressIndicatorProps) {
  const isDone = state === "Done"
  const isActive = state === "Active"

  return (
    <div
      className={cn(
        "content-stretch flex gap-3 items-center p-2 relative w-[200px] max-w-full",
        className
      )}
      {...props}
    >
      {line && (
        <div className="flex flex-[1_0_0] flex-row items-center self-stretch absolute left-0 w-full pointer-events-none -z-10">
          <div className="content-stretch flex flex-[1_0_0] gap-0 h-full items-center min-w-px overflow-clip px-0 py-3 relative">
            <div className="bg-transparent content-stretch flex flex-[1_0_0] items-center justify-center min-w-px relative h-[2px]">
              <div className={cn(
                "flex-[1_0_0] h-full min-w-px relative",
                isDone ? "bg-[var(--layer-accent-3-default)]" : "bg-[var(--border-disabled)]"
              )} />
            </div>
          </div>
        </div>
      )}

      <div className="content-stretch flex gap-2 items-start relative shrink-0 bg-[var(--background-1)] p-1 -ml-1">
        <div className={cn(
          "content-stretch flex items-center justify-center overflow-clip relative rounded-full shrink-0 size-6",
          isDone ? "bg-[var(--layer-accent-3-default)] text-white" : 
          isActive ? "border-2 border-[var(--layer-accent-3-default)] bg-white" : 
          "border-2 border-[var(--border-disabled)] bg-white"
        )}>
          {isDone && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          )}
          {isActive && (
            <div className="size-2.5 rounded-full bg-[var(--layer-accent-3-default)]" />
          )}
        </div>

        <div className="[word-break:break-word] content-stretch flex flex-col items-start pt-[2px] relative shrink-0 whitespace-nowrap">
          <p className={cn(
            "font-medium leading-[21px] relative shrink-0 text-base tracking-[-0.3px]",
            isDone || isActive ? "text-[color:var(--label-primary)]" : "text-[color:var(--label-secondary)]"
          )}>
            {label}
          </p>
          {description && (
            <p className="font-normal leading-[18px] relative shrink-0 text-[color:var(--label-secondary)] text-sm tracking-[-0.1px]">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
